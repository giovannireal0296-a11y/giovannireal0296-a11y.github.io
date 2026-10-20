/* Interface: home, areas, calculators, guides and search. Plain DOM, no framework.
   Views are addressed with plain hash tokens (#a-vent, #f-pbw, #g-ri) so links work
   from a static host, from file:// and inside a sandboxed viewer. */
(function (root) {
  'use strict';
  const ICU = root.ICU;
  const E = ICU.engine;
  const m = ICU.m;
  const doc = root.document;
  const view = doc.getElementById('view');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- Storage: values live for the browser session, preferences persist ----
  const S = { values: {}, units: {}, modes: {}, recent: [] };
  const store = (area) => ({
    get(k) { try { return JSON.parse(root[area].getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { root[area].setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  });
  const sess = store('sessionStorage');
  const prefs = store('localStorage');

  function load() {
    S.values = sess.get('icu.values') || {};
    const p = prefs.get('icu.prefs') || {};
    S.units = p.units || {};
    S.modes = p.modes || {};
    S.recent = p.recent || [];
  }
  function saveValues() { sess.set('icu.values', S.values); updateBadge(); }
  function savePrefs() { prefs.set('icu.prefs', { units: S.units, modes: S.modes, recent: S.recent }); }

  // ---- Helpers ----
  const V = (id) => ICU.vars[id];
  const unitsOf = (id) => (V(id).units ? V(id).units : [[V(id).unit || '', 1]]);
  const unitIdx = (id) => Math.min(S.units[id] || 0, unitsOf(id).length - 1);
  const shortLabel = (id) => ICU.plain(V(id).label).replace(/\s*\([^)]*\)\s*$/, '');
  const trim = (x) => String(parseFloat(Number(x).toPrecision(6)));
  const areaOf = (id) => ICU.areas.find((a) => a.id === id);
  const areaOfItem = (key) => ICU.areas.find((a) => a.sections.some((s) => s.items.includes(key)));

  // A worked example is shown read-only in its own card: it never enters the
  // shared values, so it cannot leak into another calculator as patient data.
  let exampleOf = null;
  const isExample = (fid) => exampleOf === fid;
  const modesFor = (fid) => (isExample(fid) ? {} : S.modes[fid] || {});
  function valuesFor(fid) {
    if (!isExample(fid)) return S.values;
    const vals = {};
    for (const it of E.plan(fid, {})) if (V(it.id).dflt != null) vals[it.id] = V(it.id).dflt;
    return Object.assign(vals, ICU.formulas[fid].example.v);
  }

  function fieldText(id, src = S.values) {
    const x = src[id];
    if (x == null) return '';
    if (Array.isArray(x)) return x.join(' ');
    if (typeof x !== 'number') return String(x);
    return trim(x / unitsOf(id)[unitIdx(id)][1]);
  }

  function fmtOut(o, x) {
    if (Array.isArray(x)) {
      if (x[0] == null) return '≤ ' + ICU.fmt(x[1], o.dp);
      if (Math.abs(x[0] - x[1]) < 1e-9) return ICU.fmt(x[0], o.dp);
      return ICU.fmt(x[0], o.dp) + '–' + ICU.fmt(x[1], o.dp);
    }
    return ICU.fmt(x, o.dp);
  }

  function applyDefaults(fid) {
    for (const it of E.plan(fid, modesFor(fid))) {
      const d = V(it.id).dflt;
      if (it.kind === 'leaf' && d != null && S.values[it.id] == null) S.values[it.id] = d;
    }
  }

  // ---- Fields ----
  function fieldHtml(it, fid) {
    const v = V(it.id);
    const ro = isExample(fid);
    const src = valuesFor(fid);
    const opt = it.opt ? ' <span class="opt">optional</span>' : '';
    if (it.kind === 'derived') {
      const D = ICU.formulas[it.via];
      return `<div class="field derived">
        <div class="flabel">${m(v.label)} <span class="chip">auto</span></div>
        <div class="dval" data-dval="${it.id}"></div>
        <div class="fnote">${m(D.title)}${ro ? '' : ` · <button type="button" class="linkbtn" data-mode="${it.id}" data-to="direct">enter it instead</button>`}</div>
      </div>`;
    }
    const calcLink = it.can && !ro
      ? `<div class="fnote"><button type="button" class="linkbtn" data-mode="${it.id}" data-to="calc">or calculate it from ${esc(ICU.formulas[v.derive].inputs.filter((i) => !ICU.formulas[v.derive].optional.includes(i)).map(shortLabel).join(', '))}</button></div>`
      : '';
    const hint = v.hint ? `<div class="hint">${m(v.hint)}</div>` : '';
    const lid = `l-${fid}-${it.id}`;
    if (v.type === 'choice' && v.options.length > 6) {
      // Long lists (dose units...) read better as a dropdown than as buttons.
      return `<div class="field">
        <label class="flabel" for="${lid}">${m(v.label)}${opt}</label>
        <div class="frow">${choiceSelect(it.id, src, ro, lid, 'choice-sel')}</div>
        ${hint}${calcLink}</div>`;
    }
    if (v.type === 'choice') {
      const cur = src[it.id];
      return `<div class="field">
        <div class="flabel" id="${lid}">${m(v.label)}${opt}</div>
        <div class="seg" role="radiogroup" aria-labelledby="${lid}">${v.options.map(([val, l]) =>
          `<button type="button" role="radio" aria-checked="${cur === val}" class="${cur === val ? 'on' : ''}" data-choice="${it.id}" data-val="${esc(val)}"${ro ? ' disabled' : ''}>${m(l)}</button>`).join('')}</div>
        ${hint}${calcLink}</div>`;
    }
    const iid = `i-${fid}-${it.id}`;
    const us = ro ? [[v.unit || '', 1]] : unitsOf(it.id);
    // A unitVar ties the unit next to the number to a choice (mg/µg/IU, µg/kg/min...).
    const unit = v.unitVar
      ? choiceSelect(v.unitVar, src, ro, `u-${fid}-${it.id}`, 'unit-sel', `Unit for ${shortLabel(it.id)}`)
      : us.length > 1
        ? `<select class="unit-sel" id="u-${fid}-${it.id}" data-unit="${it.id}" aria-label="Unit for ${esc(shortLabel(it.id))}">${us.map(([u], k) =>
          `<option value="${k}"${k === unitIdx(it.id) ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>`
        : us[0][0] ? `<span class="unit">${m(us[0][0])}</span>` : '';
    // The example shows canonical values, so its unit is the canonical one.
    const text = ro ? (Array.isArray(src[it.id]) ? src[it.id].join(' ') : src[it.id] == null ? '' : trim(src[it.id])) : fieldText(it.id);
    return `<div class="field">
      <label class="flabel" for="${iid}">${m(v.label)}${opt}</label>
      <div class="frow"><input id="${iid}" data-var="${it.id}" type="text" inputmode="${v.type === 'list' ? 'text' : 'decimal'}" enterkeyhint="next" autocomplete="off" spellcheck="false" value="${esc(text)}"${ro ? ' readonly' : ''}>${unit}</div>
      ${hint}${calcLink}<div class="fwarn" data-warn="${it.id}" hidden></div></div>`;
  }

  function choiceSelect(id, src, ro, elId, cls, aria) {
    return `<select class="${cls}" id="${elId}" data-choicesel="${id}"${aria ? ` aria-label="${esc(aria)}"` : ''}${ro ? ' disabled' : ''}>${V(id).options.map(([val, l]) =>
      `<option value="${esc(val)}"${src[id] === val ? ' selected' : ''}>${esc(ICU.plain(l))}</option>`).join('')}</select>`;
  }

  function fieldsHtml(fid) {
    if (!isExample(fid)) applyDefaults(fid);
    const F = ICU.formulas[fid];
    const src = valuesFor(fid);
    const plan = E.plan(fid, modesFor(fid));
    // A choice shown as the unit of another field gets no row of its own.
    const asUnit = new Set(plan.map((it) => V(it.id).unitVar).filter(Boolean));
    return plan
      .filter((it) => !asUnit.has(it.id) && E.needed(F, it.id, src))
      .map((it) => fieldHtml(F.inputsIf && F.inputsIf[it.id] ? Object.assign({}, it, { opt: false }) : it, fid))
      .join('');
  }
  // Re-render the fields of calculators whose visible inputs depend on a choice.
  function rerenderConditional() {
    view.querySelectorAll('.calc').forEach((calc) => {
      if (ICU.formulas[calc.dataset.fid].inputsIf) rerenderFields(calc);
    });
  }

  // ---- Results ----
  function monitorHtml(F, r) {
    const own = r.warnings.filter((w) => w.id === F.id);
    if (!r.ready) {
      const err = own.find((w) => w.error);
      if (err) return `<div class="mon-wait err"><div class="mon-k">Check the values</div><p>${m(err.text)}</p></div>`;
      return `<div class="mon-wait"><div class="mon-k">Waiting for</div><p>${r.missing.map((id) => esc(shortLabel(id))).join(' · ')}</p></div>`;
    }
    let h = '';
    const outs = F.outputs.filter((o) => r.out[o.id] != null && o.type !== 'steps');
    if (outs.length) {
      h += '<div class="tiles-out">' + outs.map((o, k) => {
        const label = o.labelFn ? o.labelFn(r.all) : m(o.label);
        const unit = o.unitFn ? o.unitFn(r.all) : o.unit;
        return `<div class="tile${k === 0 ? ' main' : ''}"><div class="mon-k">${label}</div><div class="mon-v">${fmtOut(o, r.out[o.id])}${unit ? `<span class="mon-u">${m(unit)}</span>` : ''}</div></div>`;
      }).join('') + '</div>';
    }
    if (r.verdicts.length) h += '<div class="verdicts">' + r.verdicts.map((v) => `<div class="pill t-${v.tone}">${m(v.text)}</div>`).join('') + '</div>';
    for (const w of own) h += `<div class="mon-msg">${m(w.text)}</div>`;
    const steps = F.outputs.find((o) => o.type === 'steps');
    if (steps && r.out[steps.id]) {
      const mark = { act: 'Act', ok: 'OK', info: 'Check', skip: '—' };
      h += '<ol class="algo">' + r.out[steps.id].map((s) =>
        `<li class="st-${s.status}"><span class="st-badge">${mark[s.status]}</span><div><b>${m(s.title)}</b><p>${m(s.text)}</p></div></li>`).join('') + '</ol>';
    }
    return h;
  }

  function tableHtml(t, hits) {
    const added = t.rows.some((r) => r.added);
    const body = t.rows.map((row, k) => {
      const hit = hits && hits[k];
      const cls = hit ? ` class="hit t-${row.t || 'info'}"` : '';
      return `<tr${cls}>${row.c.map((cell, i) =>
        `<td>${i === 0 && hit ? '<span class="you" aria-label="matches your result">▶</span>' : ''}${m(cell)}${i === 0 && row.added ? '<sup class="dag">†</sup>' : ''}</td>`).join('')}</tr>`;
    }).join('');
    return `<figure class="tbl"><figcaption>${t.title ? m(t.title) : 'How to read it'}</figcaption>
      <div class="tbl-scroll"><table><thead><tr>${t.cols.map((c) => `<th>${m(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      ${added ? '<p class="foot">† Row added by the app to cover a gap in the reference table.</p>' : ''}</figure>`;
  }

  function workingHtml(r) {
    const der = r.items.filter((it) => it.kind === 'derived' && r.v[it.id] != null);
    if (!der.length) return '';
    return `<div class="working"><h3>Calculated along the way</h3><ul>${der.map((it) =>
      `<li><span>${m(V(it.id).label)}</span><b>${ICU.fmt(r.v[it.id], V(it.id).dp)} ${m(V(it.id).unit || '')}</b><a href="#f-${it.via}" class="${ICU.formulas[it.via].hidden ? 'nolink' : ''}">${m(ICU.formulas[it.via].title)}</a></li>`).join('')}</ul></div>`;
  }

  function refresh(el) {
    const fid = el.dataset.fid;
    const F = ICU.formulas[fid];
    const r = E.compute(fid, modesFor(fid), valuesFor(fid));
    const ex = isExample(fid);
    el.classList.toggle('is-example', ex);
    el.querySelector('[data-exbanner]').hidden = !ex;
    el.querySelector('[data-h]').textContent = ex ? 'Worked example' : 'Your values';
    const exBtn = el.querySelector('[data-act="example"]');
    if (exBtn) exBtn.hidden = ex;
    el.querySelectorAll('[data-dval]').forEach((d) => {
      const id = d.dataset.dval;
      const x = r.v[id];
      d.innerHTML = x == null ? '<span class="pending">fills in when the values above are entered</span>'
        : `= ${ICU.fmt(x, V(id).dp)} <span class="u">${m(V(id).unit || '')}</span>`;
    });
    el.querySelectorAll('[data-warn]').forEach((w) => {
      const id = w.dataset.warn;
      const bad = el.querySelector(`[data-var="${id}"]`);
      const invalid = bad && bad.dataset.invalid === '1';
      const hit = r.warnings.find((x) => x.id === id);
      w.hidden = !(invalid || hit);
      w.textContent = invalid ? 'Not a number — use digits, with . or , for decimals.' : hit ? hit.text : '';
    });
    el.querySelector('[data-out]').innerHTML = monitorHtml(F, r);
    const fig = el.querySelector('[data-fig]');
    if (fig) fig.innerHTML = r.ready && F.figure ? F.figure(r.all) || '' : '';
    el.querySelector('[data-tables]').innerHTML = F.tables.map((t, k) => tableHtml(t, r.matches[k])).join('');
    el.querySelector('[data-working]').innerHTML = workingHtml(r);
    el.querySelector('[data-peek]').innerHTML = peekHtml(F, r);
  }

  // Compact result pinned to the bottom of phone screens while the monitor is out of view.
  function peekHtml(F, r) {
    if (!r.ready) {
      const n = r.missing.length;
      return n ? `<span class="pk-k">Result</span><span class="pk-wait">${n} value${n > 1 ? 's' : ''} to go</span>` : '<span class="pk-k">Result</span><span class="pk-wait">check the values</span>';
    }
    const o = F.outputs.find((x) => r.out[x.id] != null && x.type !== 'steps');
    const v = r.verdicts[0];
    const main = o ? `<span class="pk-v">${fmtOut(o, r.out[o.id])}<small>${m(o.unitFn ? o.unitFn(r.all) : o.unit || '')}</small></span>` : '';
    return `<span class="pk-k">${o ? (o.labelFn ? o.labelFn(r.all) : m(o.label)) : 'Result'}</span>${main}${v ? `<span class="pk-t t-${v.tone}">${m(v.text)}</span>` : ''}`;
  }
  let peekObs = null;
  function watchPeek() {
    if (peekObs) peekObs.disconnect();
    const calc = view.querySelector('.calc');
    if (!calc || !('IntersectionObserver' in root)) return;
    const peek = calc.querySelector('[data-peek]');
    const inputs = calc.querySelector('.inputs');
    let monitorVisible = true;
    let inputsVisible = false;
    peekObs = new root.IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === inputs) inputsVisible = e.isIntersecting;
        else monitorVisible = e.isIntersecting;
      }
      peek.hidden = monitorVisible || !inputsVisible;
    });
    peekObs.observe(calc.querySelector('[data-out]'));
    peekObs.observe(inputs);
  }
  const refreshAll = () => view.querySelectorAll('.calc').forEach(refresh);

  function calcHtml(fid) {
    const F = ICU.formulas[fid];
    return `<section class="calc" data-fid="${fid}">
      <div class="inputs">
        <div class="card-h"><h2 data-h>Your values</h2><div class="acts">
          ${F.example ? '<button type="button" class="btn small" data-act="example">Show example</button>' : ''}
          <button type="button" class="btn small ghost" data-act="clear">Clear</button></div></div>
        <div class="exbanner" data-exbanner hidden>
          <p><b>Worked example from the reference.</b> Not patient data: it stays in this card and is not shared with other calculators.${F.example && F.example.text ? ' ' + m(F.example.text) : ''}</p>
          <button type="button" class="btn small" data-act="exit">Back to my values</button>
        </div>
        <div class="fields" data-fields>${fieldsHtml(fid)}</div>
        <div data-working></div>
      </div>
      <div class="output">
        <div class="monitor" data-out aria-live="polite"></div>
        ${F.figure ? '<div class="figbox" data-fig></div>' : ''}
        <div data-tables></div>
      </div>
      <button type="button" class="peek" data-peek hidden aria-label="Show the result"></button>
    </section>`;
  }

  // ---- Shared page pieces ----
  function formulaBlock(src) {
    if (!src) return '';
    return `<div class="formula">${src.split(/\s{3,}/).map((p) => `<div>${m(p)}</div>`).join('')}</div>`;
  }
  function linkList(ids, title) {
    const uniq = [...new Set(ids)].filter((id) => ICU.formulas[id] && !ICU.formulas[id].hidden);
    if (!uniq.length) return '';
    return `<div class="see"><h3>${title}</h3><div class="chips">${uniq.map((id) =>
      `<a class="chiplink" href="#f-${id}">${m(ICU.formulas[id].title)}</a>`).join('')}</div></div>`;
  }
  function extrasHtml(F) {
    let h = '';
    if (F.checks) h += `<div class="box"><h3>Valid only if</h3><ul class="checks">${F.checks.map((c) => `<li>${m(c)}</li>`).join('')}</ul></div>`;
    if (F.how) h += `<div class="box"><h3>How to measure</h3><ol class="how">${F.how.map((c) => `<li>${m(c)}</li>`).join('')}</ol></div>`;
    const notes = (F.notes || []).slice();
    if (F.example && F.example.text) notes.unshift('Worked example from the reference: ' + F.example.text);
    if (notes.length) h += `<div class="box notes"><h3>Notes</h3><ul>${notes.map((c) => `<li>${m(c)}</li>`).join('')}</ul></div>`;
    h += linkList((F.see || []).concat(E.usedBy(F.id)), 'Related');
    if (F.refs) h += `<p class="refs">${F.refs.map(esc).join(' · ')}</p>`;
    return h;
  }

  // ---- Views ----
  function homeView() {
    doc.title = 'ICU Formulas';
    const recent = S.recent.filter((id) => ICU.formulas[id]);
    const count = (a) => a.sections.reduce((n, s) => n + s.items.filter((i) => !i.startsWith('g:')).length, 0);
    return `<section class="hero">
        <h1>ICU Formulas</h1>
        <p>Bedside calculators from the <i>Critical Care Formulas</i> reference. Enter the raw values: every intermediate step is calculated for you, and values carry over between calculators until you clear them.</p>
        <label class="search"><span class="sr">Search</span><input id="q" type="search" autocomplete="off" placeholder="Search: driving pressure, P/F, MELD, CRRT dose…"></label>
      </section>
      <div id="results" class="results" hidden></div>
      <div id="browse">
        ${recent.length ? `<section class="block"><h2>Recently used</h2><div class="chips">${recent.map((id) => `<a class="chiplink" href="#f-${id}">${m(ICU.formulas[id].title)}</a>`).join('')}</div></section>` : ''}
        <section class="block"><h2>Areas</h2><div class="areas">${ICU.areas.map((a) =>
          `<a class="area" href="#a-${a.id}"><span class="code">${a.code}</span><span class="aname">${esc(a.title)}</span><span class="acount">${count(a)} items</span></a>`).join('')}</div></section>
        <section class="block"><h2>Step-by-step guides</h2><div class="list">${Object.values(ICU.guides).map(guideRow).join('')}</div></section>
      </div>
      ${disclaimer()}`;
  }

  function disclaimer() {
    return `<footer class="disclaimer">Decision support for clinicians, not a substitute for judgement. Thresholds come from the reference sheet (Henderson, Chen, Amato &amp; Brochard, AJRCCM 2017, and standard ICU sources): check them against current guidelines and local protocols. Values stay on this device and are cleared when you close the tab or press “Clear values”.</footer>`;
  }

  function formulaRow(id) {
    const F = ICU.formulas[id];
    return `<a class="row" href="#f-${id}"><span class="rcode">${esc(F.short || '')}</span><span class="rbody"><span class="rtitle">${m(F.title)}</span><span class="ruse">${esc(ICU.plain(F.use))}</span></span>${F.kind === 'ref' ? '<span class="rtag">table</span>' : ''}</a>`;
  }
  function guideRow(g) {
    return `<a class="row guide" href="#g-${g.id}"><span class="rcode">${esc(g.short)}</span><span class="rbody"><span class="rtitle">${m(g.title)}</span><span class="ruse">${esc(ICU.plain(g.intro))}</span></span><span class="rtag">guide</span></a>`;
  }

  function areaView(id) {
    const a = areaOf(id);
    if (!a) return notFound();
    doc.title = a.title + ' · ICU Formulas';
    return `<nav class="crumbs"><a href="#">Home</a></nav>
      <header class="phead"><span class="code big">${a.code}</span><div><h1>${esc(a.title)}</h1><p>${esc(a.blurb)}</p></div></header>
      ${a.sections.map((s) => `<section class="block"><h2>${esc(s.title)}</h2><div class="list">${s.items.map((it) =>
        it.startsWith('g:') ? guideRow(ICU.guides[it.slice(2)]) : formulaRow(it)).join('')}</div></section>`).join('')}`;
  }

  function formulaView(id) {
    const F = ICU.formulas[id];
    if (!F || F.hidden) return notFound();
    doc.title = ICU.plain(F.title) + ' · ICU Formulas';
    S.recent = [id].concat(S.recent.filter((x) => x !== id)).slice(0, 8);
    savePrefs();
    const a = areaOfItem(id) || areaOf(F.area);
    const g = F.guide && ICU.guides[F.guide];
    return `<nav class="crumbs"><a href="#">Home</a> / <a href="#a-${a.id}">${esc(a.title)}</a></nav>
      <header class="fhead"><h1>${m(F.title)}</h1>${F.short ? `<span class="tag">${esc(F.short)}</span>` : ''}</header>
      <p class="use"><span class="use-k">When to use</span>${m(F.use)}</p>
      ${formulaBlock(F.formula)}
      ${g ? `<a class="guide-cta" href="#g-${g.id}"><span>Step-by-step guide</span><b>${m(g.title)}</b></a>` : ''}
      ${F.kind === 'ref' ? F.tables.map((t) => tableHtml(t)).join('') : calcHtml(id)}
      ${extrasHtml(F)}
      ${disclaimer()}`;
  }

  function guideView(id) {
    const g = ICU.guides[id];
    if (!g) return notFound();
    doc.title = ICU.plain(g.title) + ' · ICU Formulas';
    const a = areaOf(g.area);
    const fig = (name) => (name && ICU.fig[name] ? `<div class="figbox">${ICU.fig[name]()}</div>` : '');
    let h = `<nav class="crumbs"><a href="#">Home</a> / <a href="#a-${a.id}">${esc(a.title)}</a></nav>
      <header class="fhead"><h1>${m(g.title)}</h1><span class="tag">guide</span></header>
      <p class="use">${m(g.intro)}</p>${fig(g.fig)}`;
    h += `<ol class="steps">${g.steps.map((s, k) => `<li class="step${s.hl ? ' hl' : ''}"><span class="num">${k + 1}</span><div class="sbody"><h3>${m(s.title)}</h3><p>${m(s.text)}</p>${fig(s.fig)}</div></li>`).join('')}</ol>`;
    if (g.outcomes) h += `<div class="outcomes">${g.outcomes.map((o) => `<div class="outcome t-${o.t}"><b>${m(o.title)}</b><p>${m(o.text)}</p></div>`).join('')}</div>`;
    if (g.example) h += `<p class="example"><b>Example.</b> ${m(g.example)}</p>`;
    if (g.calc) {
      const F = ICU.formulas[g.calc];
      h += `<section class="block"><h2>Calculate: ${m(F.title)}</h2>${formulaBlock(F.formula)}${calcHtml(g.calc)}</section>`;
    }
    for (const x of g.extra || []) h += `<section class="block"><h2>${m(x.title)}</h2>${fig(x.fig)}<p class="use">${m(x.text)}</p></section>`;
    h += linkList(g.related || [], 'Related calculators');
    return h + disclaimer();
  }

  function notFound() {
    doc.title = 'ICU Formulas';
    return '<section class="block"><h1>Page not found</h1><p><a href="#">Back to the home page</a></p></section>';
  }

  // ---- Search ----
  const index = [];
  function buildIndex() {
    for (const id of ICU.order) {
      const F = ICU.formulas[id];
      if (F.hidden) continue;
      const a = areaOfItem(id) || areaOf(F.area);
      index.push({ kind: 'f', id, title: ICU.plain(F.title).toLowerCase(), short: (F.short || '').toLowerCase(),
        hay: [F.title, F.short, (F.tags || []).join(' '), a && a.title, ICU.plain(F.use)].join(' ').toLowerCase() });
    }
    for (const g of Object.values(ICU.guides)) {
      index.push({ kind: 'g', id: g.id, title: ICU.plain(g.title).toLowerCase(), short: g.short.toLowerCase(),
        hay: [ICU.plain(g.title), g.short, (g.tags || []).join(' '), ICU.plain(g.intro)].join(' ').toLowerCase() });
    }
  }
  const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)));
  function search(q) {
    const toks = fold(q.toLowerCase()).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return index
      .map((e) => {
        const hay = fold(e.hay);
        if (!toks.every((t) => hay.includes(t))) return null;
        const t = fold(e.title);
        const s = fold(e.short);
        let score = 0;
        for (const tok of toks) score += (s === tok ? 8 : 0) + (t.startsWith(tok) ? 5 : t.includes(tok) ? 3 : 0) + (s.includes(tok) ? 2 : 0);
        return { e, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.e);
  }
  function showResults(q) {
    const res = doc.getElementById('results');
    const browse = doc.getElementById('browse');
    if (!res) return;
    if (!q.trim()) { res.hidden = true; browse.hidden = false; return; }
    const hits = search(q);
    res.hidden = false;
    browse.hidden = true;
    res.innerHTML = hits.length
      ? `<div class="list">${hits.map((e) => (e.kind === 'f' ? formulaRow(e.id) : guideRow(ICU.guides[e.id]))).join('')}</div>`
      : `<p class="empty">Nothing matches “${esc(q)}”. Try an abbreviation (PBW, SVR, FENa) or a word (sodium, shunt, platelets).</p>`;
  }

  // ---- Router ----
  function route() {
    exampleOf = null;
    const h = decodeURIComponent((root.location.hash || '').slice(1));
    let html;
    if (h.startsWith('a-')) html = areaView(h.slice(2));
    else if (h.startsWith('f-')) html = formulaView(h.slice(2));
    else if (h.startsWith('g-')) html = guideView(h.slice(2));
    else html = homeView();
    view.innerHTML = html;
    refreshAll();
    watchPeek();
    doc.getElementById('back').hidden = !h;
    root.scrollTo(0, 0);
    const q = doc.getElementById('q');
    if (q && root.__focusSearch) { q.focus(); root.__focusSearch = false; }
  }

  function parentOf(h) {
    if (h.startsWith('f-')) { const a = areaOfItem(h.slice(2)); return a ? 'a-' + a.id : ''; }
    if (h.startsWith('g-')) { const g = ICU.guides[h.slice(2)]; return g ? 'a-' + g.area : ''; }
    return '';
  }

  // ---- Events ----
  function onInput(e) {
    const t = e.target;
    if (t.id === 'q') { showResults(t.value); return; }
    const id = t.dataset.var;
    if (!id) return;
    const v = V(id);
    const raw = t.value;
    let x = v.type === 'list' ? ICU.parseList(raw) : ICU.parseNum(raw);
    t.dataset.invalid = raw.trim() && x === null ? '1' : '0';
    if (x !== null && v.type !== 'list') x *= unitsOf(id)[unitIdx(id)][1];
    if (x === null) delete S.values[id]; else S.values[id] = x;
    // Keep other fields for the same variable on the page in step.
    view.querySelectorAll(`[data-var="${id}"]`).forEach((o) => { if (o !== t) o.value = fieldText(id); });
    saveValues();
    refreshAll();
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.choicesel) {
      const cid = t.dataset.choicesel;
      S.values[cid] = t.value;
      view.querySelectorAll(`select[data-choicesel="${cid}"]`).forEach((o) => { o.value = t.value; });
      saveValues();
      rerenderConditional();
      refreshAll();
      return;
    }
    const id = t.dataset.unit;
    if (!id) return;
    S.units[id] = Number(t.value);
    savePrefs();
    // Keep the typed number and read it in the new unit.
    const input = t.parentNode.querySelector('[data-var]');
    const x = ICU.parseNum(input.value);
    if (x !== null) S.values[id] = x * unitsOf(id)[unitIdx(id)][1];
    view.querySelectorAll(`select[data-unit="${id}"]`).forEach((o) => { o.value = t.value; });
    saveValues();
    refreshAll();
  }

  function rerenderFields(calc) {
    const box = calc.querySelector('[data-fields]');
    box.innerHTML = fieldsHtml(calc.dataset.fid);
    refresh(calc);
  }

  let armed = null;
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const calc = t.closest('.calc');
    if (t.hasAttribute('data-peek')) {
      calc.querySelector('[data-out]').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (t.dataset.choice) {
      const id = t.dataset.choice;
      const val = t.dataset.val;
      S.values[id] = S.values[id] === val ? undefined : val;
      if (S.values[id] === undefined) delete S.values[id];
      view.querySelectorAll(`[data-choice="${id}"]`).forEach((b) => {
        const on = S.values[id] === b.dataset.val;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      });
      saveValues();
      rerenderConditional();
      refreshAll();
    } else if (t.dataset.mode && calc) {
      const fid = calc.dataset.fid;
      S.modes[fid] = Object.assign({}, S.modes[fid], { [t.dataset.mode]: t.dataset.to });
      savePrefs();
      rerenderFields(calc);
      const next = calc.querySelector(`[data-var="${t.dataset.mode}"]`);
      if (next) next.focus();
    } else if (t.dataset.act === 'example' && calc) {
      exampleOf = calc.dataset.fid;
      rerenderFields(calc);
    } else if (t.dataset.act === 'exit' && calc) {
      exampleOf = null;
      rerenderFields(calc);
    } else if (t.dataset.act === 'clear' && calc) {
      exampleOf = null;
      for (const it of E.plan(calc.dataset.fid, modesFor(calc.dataset.fid))) if (it.kind === 'leaf') delete S.values[it.id];
      saveValues();
      rerenderFields(calc);
    } else if (t.id === 'clearAll') {
      if (armed) {
        clearTimeout(armed);
        armed = null;
        S.values = {};
        saveValues();
        t.classList.remove('armed');
        route();
      } else {
        t.classList.add('armed');
        armed = setTimeout(() => { armed = null; t.classList.remove('armed'); updateBadge(); }, 3000);
        updateBadge();
      }
    } else if (t.id === 'back') {
      // "Up" to the parent page: formula or guide → its area → home.
      root.location.hash = parentOf((root.location.hash || '').slice(1));
    } else if (t.id === 'searchBtn') {
      root.__focusSearch = true;
      if (root.location.hash && root.location.hash !== '#') root.location.hash = '';
      else route();
    }
  }

  function onKey(e) {
    if (e.key !== 'Enter' || !e.target.dataset.var) return;
    e.preventDefault();
    const all = [...view.querySelectorAll('[data-var]')];
    const k = all.indexOf(e.target);
    if (all[k + 1]) all[k + 1].focus(); else e.target.blur();
  }

  function updateBadge() {
    const b = doc.getElementById('clearAll');
    if (!b) return;
    // Pre-filled defaults (760 mmHg, MIC 1...) are not something the user entered.
    const n = Object.keys(S.values).filter((id) => !V(id) || S.values[id] !== V(id).dflt).length;
    b.querySelector('.lbl').textContent = armed ? 'Tap again to clear' : 'Clear values';
    b.querySelector('.badge').textContent = String(n);
    b.disabled = n === 0 && !armed;
  }

  function start() {
    load();
    buildIndex();
    root.addEventListener('hashchange', route);
    view.addEventListener('input', onInput);
    view.addEventListener('change', onChange);
    view.addEventListener('keydown', onKey);
    doc.addEventListener('click', onClick);
    route();
    updateBadge();
    if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol)) {
      try { root.navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available */ }
    }
  }

  ICU.ui = { start, search, store: S };
  start();
})(window);
