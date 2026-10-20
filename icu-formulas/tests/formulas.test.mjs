import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadICU } from './load.mjs';

const ICU = loadICU();
const E = ICU.engine;
// Arrays made inside the sandbox have another realm's prototype: copy before deepEqual.
const own = (x) => JSON.parse(JSON.stringify(x));
const close = (a, e) => typeof a === 'number' && Math.abs(a - e) <= Math.max(0.02 * Math.abs(e), 0.02);

test('every input, derivation and area entry points at something real', () => {
  for (const id of ICU.order) {
    const F = ICU.formulas[id];
    for (const i of F.inputs) assert.ok(ICU.vars[i], `${id}: unknown input ${i}`);
    for (const i of F.optional) assert.ok(F.inputs.includes(i), `${id}: optional ${i} is not an input`);
    if (F.guide) assert.ok(ICU.guides[F.guide], `${id}: unknown guide ${F.guide}`);
    for (const s of F.see || []) assert.ok(ICU.formulas[s], `${id}: unknown related ${s}`);
  }
  for (const [id, V] of Object.entries(ICU.vars)) {
    if (!V.derive) continue;
    const D = ICU.formulas[V.derive];
    assert.ok(D, `${id}: unknown derivation ${V.derive}`);
    assert.ok(D.outputs.some((o) => o.id === id), `${id}: ${V.derive} does not output it`);
  }
  for (const a of ICU.areas) {
    for (const s of a.sections) {
      for (const it of s.items) {
        if (it.startsWith('g:')) assert.ok(ICU.guides[it.slice(2)], `${a.id}: unknown guide ${it}`);
        else assert.ok(ICU.formulas[it] && !ICU.formulas[it].hidden, `${a.id}: bad item ${it}`);
      }
    }
  }
  for (const g of Object.values(ICU.guides)) {
    if (g.calc) assert.ok(ICU.formulas[g.calc], `guide ${g.id}: unknown calc ${g.calc}`);
    for (const f of [g.fig, ...g.steps.map((s) => s.fig), ...(g.extra || []).map((x) => x.fig)].filter(Boolean)) {
      assert.equal(typeof ICU.fig[f], 'function', `guide ${g.id}: unknown figure ${f}`);
      assert.match(ICU.fig[f](), /^<svg class="fig"/);
    }
  }
});

test('every visible calculator is reachable from an area', () => {
  const listed = new Set(ICU.areas.flatMap((a) => a.sections.flatMap((s) => s.items)));
  const orphans = ICU.order.filter((id) => !ICU.formulas[id].hidden && !listed.has(id));
  assert.deepEqual(own(orphans), []);
});

test('worked examples reproduce the reference values', () => {
  let n = 0;
  for (const id of ICU.order) {
    const F = ICU.formulas[id];
    if (!F.example) continue;
    const r = E.compute(id, {}, F.example.v);
    assert.ok(r.ready, `${id}: not ready, missing ${r.missing.join(', ')}`);
    for (const [k, e] of Object.entries(F.example.expect || {})) {
      const a = r.out[k];
      const ok = Array.isArray(e) ? e.every((x, j) => close(a[j], x)) : close(a, e);
      assert.ok(ok, `${id}.${k}: got ${a}, expected ${e}`);
    }
    n++;
  }
  assert.ok(n > 150, `only ${n} examples`);
});

test('a calculator asks for raw data and derives the intermediates itself', () => {
  const plan = E.plan('shunt', {});
  const derived = own(plan.filter((i) => i.kind === 'derived').map((i) => i.id));
  const leaves = plan.filter((i) => i.kind === 'leaf').map((i) => i.id);
  assert.deepEqual(derived.sort(), ['cao2', 'ccO2', 'cvo2', 'pao2Alv'].sort());
  for (const id of ['hb', 'fio2', 'paco2', 'pao2', 'sao2', 'svo2', 'pvo2']) assert.ok(leaves.includes(id), id);
  // Each derived value comes after the inputs it is calculated from.
  const pos = (id) => plan.findIndex((i) => i.id === id);
  assert.ok(pos('pao2Alv') > pos('paco2') && pos('ccO2') > pos('pao2Alv'));
});

test('a derived value can be entered directly instead', () => {
  const plan = E.plan('shunt', { pao2Alv: 'direct', ccO2: 'calc' });
  const it = plan.find((i) => i.id === 'pao2Alv');
  assert.equal(it.kind, 'leaf');
  assert.ok(!plan.some((i) => i.id === 'paco2'), 'PaCO2 is no longer needed');
  const r = E.compute('shunt', { pao2Alv: 'direct' }, { hb: 10, pao2Alv: 663, sao2: 99, pao2: 150, svo2: 70, pvo2: 38 });
  assert.ok(close(r.out.shuntPct, 28));
});

test('no circular derivations: CO cannot be calculated inside the stroke-volume card', () => {
  const co = E.plan('sv', { co: 'calc' }).find((i) => i.id === 'co');
  assert.equal(co.kind, 'leaf');
  assert.equal(co.can, false);
});

test('blank optional values never match an interpretation row', () => {
  const r = E.compute('hco3_ex', {}, { weight: 70, hco3: 34 });
  assert.ok(r.ready);
  assert.deepEqual(own(r.matches[0]), [false, false]);
  const r2 = E.compute('hco3_ex', {}, { weight: 70, hco3: 34, uCl: 10 });
  assert.deepEqual(own(r2.matches[0]), [true, false]);
});

test('missing inputs are reported and impossible values are refused', () => {
  const r = E.compute('crs', {}, { vt: 450 });
  assert.equal(r.ready, false);
  assert.deepEqual(own(r.missing).sort(), ['peepTot', 'pplat']);
  const bad = E.compute('crs', {}, { vt: 450, pplat: 5, peepTot: 10 });
  assert.equal(bad.ready, false);
  assert.ok(bad.warnings.some((w) => w.error));
});

test('interpretation highlights the matching row and gives a verdict', () => {
  const r = E.compute('pf', {}, { pao2: 85, fio2: 0.6, patm: 760 });
  assert.equal(r.verdicts[0].text, 'Moderate ARDS');
  assert.ok(r.matches[1][0], 'proning row is highlighted');
});

test('acid–base analysis finds the primary disorder and a second process', () => {
  const a = ICU.acidBase({ ph: 7.25, paco2: 28, hco3: 12 });
  assert.equal(a.primary, 'met-acid');
  assert.match(a.extra, /Appropriate/);
  const b = ICU.acidBase({ ph: 7.15, paco2: 45, hco3: 15 });
  assert.equal(b.primary, 'met-acid');
  assert.match(b.extra, /respiratory acidosis/);
  const c = ICU.acidBase({ ph: 7.3, paco2: 60, hco3: 29, chronicity: 'acute' });
  assert.equal(c.primary, 'resp-acid');
  assert.match(c.extra, /metabolic alkalosis/);
  const d = ICU.acidBase({ ph: 7.4, paco2: 40, hco3: 24 });
  assert.equal(d.primary, 'normal');
});

test('the bleeding algorithm treats fibrinogen before CT', () => {
  const steps = ICU.rotemAlgorithm({ setting: 'trauma', bleeding: 'yes', fibA5: 6, extA5: 30, extCt: 90, mlExt: 2, weight: 80 });
  const by = Object.fromEntries(steps.map((s) => [s.title, s]));
  assert.equal(by.Fibrinogen.status, 'act');
  assert.match(by.Fibrinogen.text, /3\.0 g/);
  assert.match(by['Coagulation factors'].text, /treat fibrinogen and re-test first/);
  assert.equal(by.Fibrinolysis.status, 'ok');
  const none = ICU.rotemAlgorithm({ setting: 'cardiac', bleeding: 'no', fibA5: 6, extA5: 30, extCt: 90 });
  assert.ok(none.slice(1).every((s) => s.status === 'skip'));
});

test('number parsing accepts a decimal comma', () => {
  assert.equal(ICU.parseNum('7,35'), 7.35);
  assert.equal(ICU.parseNum(' 120 '), 120);
  assert.equal(ICU.parseNum('abc'), null);
  assert.deepEqual(own(ICU.parseList('380 410; 395,402')), [380, 410, 395, 402]);
});

test('infusion rate works in any dose unit and asks for weight only when per kg', () => {
  const run = (v) => E.compute('inf_rate', {}, Object.assign({ amtUnit: 'mg', doseUnit: 'ugkgmin' }, v));
  // Noradrenaline 4 mg/50 mL, 0.1 µg/kg/min, 70 kg → 5.25 mL/h.
  assert.ok(close(run({ drugAmt: 4, drugVol: 50, doseVal: 0.1, weight: 70 }).out.rateOut, 5.25));
  // Same dose written per hour: 6 µg/kg/h.
  assert.ok(close(run({ drugAmt: 4, drugVol: 50, doseVal: 6, doseUnit: 'ugkgh', weight: 70 }).out.rateOut, 5.25));
  // Heparin 25 000 IU/50 mL at 1000 IU/h → 2 mL/h, no weight needed.
  const hep = run({ drugAmt: 25000, amtUnit: 'iu', drugVol: 50, doseVal: 1000, doseUnit: 'iuh' });
  assert.ok(hep.ready);
  assert.ok(close(hep.out.rateOut, 2));
  // Potassium 40 mmol/100 mL at 10 mmol/h → 25 mL/h.
  assert.ok(close(run({ drugAmt: 40, amtUnit: 'mmol', drugVol: 100, doseVal: 10, doseUnit: 'mmolh' }).out.rateOut, 25));
  // Propofol 1% (500 mg/50 mL) at 2 mg/kg/h, 80 kg → 16 mL/h.
  assert.ok(close(run({ drugAmt: 500, drugVol: 50, doseVal: 2, doseUnit: 'mgkgh', weight: 80 }).out.rateOut, 16));
  // Per-kg dose without weight: not ready, and weight is reported missing.
  const noKg = run({ drugAmt: 4, drugVol: 50, doseVal: 0.1 });
  assert.equal(noKg.ready, false);
  assert.ok(noKg.missing.includes('weight'));
  assert.equal(E.needed(ICU.formulas.inf_rate, 'weight', { doseUnit: 'mgh' }), false);
  // IU in the syringe but a mass dose: refused with an explanation.
  const bad = run({ drugAmt: 25000, amtUnit: 'iu', drugVol: 50, doseVal: 1, doseUnit: 'mgh' });
  assert.equal(bad.ready, false);
  assert.ok(bad.warnings.some((w) => w.error && /same kind of unit/.test(w.text)));
});

test('dose from rate is the inverse of rate from dose', () => {
  const v = { drugAmt: 250, amtUnit: 'mg', drugVol: 50, doseUnit: 'ugkgmin', weight: 70 };
  const rate = E.compute('inf_rate', {}, Object.assign({ doseVal: 5 }, v)).out.rateOut;
  const back = E.compute('inf_dose', {}, Object.assign({ rate }, v)).out.doseCalc;
  assert.ok(close(back, 5));
  const perHour = E.compute('inf_dose', {}, Object.assign({}, v, { rate, doseUnit: 'mgh' })).out.doseCalc;
  assert.ok(close(perHour, 21));
});
