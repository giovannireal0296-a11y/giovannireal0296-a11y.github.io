/* Dependency engine: works out which raw values a calculator needs, derives the
   intermediate quantities (PBW, PAO2, CaO2, Crs...) and matches the result
   against the interpretation tables. No DOM here, so Node tests can use it. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  const isOpt = (F, id) => F.optional.includes(id);

  function defaultMode(id) {
    const V = ICU.vars[id];
    return V && V.derive && V.calc ? 'calc' : 'direct';
  }

  // A variable can be calculated inside a card only if its formula is not
  // already on the path and does not feed on something the path produces.
  function canCalc(id, stack) {
    const V = ICU.vars[id];
    if (!V || !V.derive || !ICU.formulas[V.derive]) return false;
    if (stack.includes(V.derive)) return false;
    const outs = new Set();
    for (const fid of stack) for (const o of ICU.formulas[fid].outputs) outs.add(o.id);
    return !ICU.formulas[V.derive].inputs.some((i) => outs.has(i));
  }

  // Ordered list of what the card asks for. A derived item comes right after
  // the inputs it is calculated from, so the form reads top to bottom.
  function plan(fid, modes) {
    modes = modes || {};
    const F = ICU.formulas[fid];
    const items = [];
    const idx = {};

    function visit(id, stack, opt, depth) {
      if (idx[id] !== undefined) {
        if (!opt) items[idx[id]].opt = false;
        return;
      }
      const V = ICU.vars[id];
      if (!V) throw new Error(`Unknown variable "${id}" (${stack.join(' > ')})`);
      const can = canCalc(id, stack);
      const mode = modes[id] || defaultMode(id);
      if (can && mode === 'calc' && depth < 8) {
        const D = ICU.formulas[V.derive];
        for (const i of D.inputs) visit(i, stack.concat(D.id), opt || isOpt(D, i), depth + 1);
        idx[id] = items.length;
        items.push({ id, kind: 'derived', via: D.id, opt, can });
      } else {
        idx[id] = items.length;
        items.push({ id, kind: 'leaf', opt, can });
      }
    }
    for (const i of F.inputs) visit(i, [fid], isOpt(F, i), 0);

    // A required derived value makes its own required inputs required too.
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k];
      if (it.kind !== 'derived' || it.opt) continue;
      const D = ICU.formulas[it.via];
      for (const i of D.inputs) if (!isOpt(D, i) && idx[i] !== undefined) items[idx[i]].opt = false;
    }
    return items;
  }

  function has(x) {
    return x !== undefined && x !== null && x !== '' && !(Array.isArray(x) && !x.length);
  }

  function clean(out) {
    if (!out) return null;
    const r = {};
    for (const k of Object.keys(out)) {
      const x = out[k];
      r[k] = typeof x === 'number' && !isFinite(x) ? null : x;
    }
    return r;
  }

  function safeCalc(F, v) {
    try {
      return clean(F.calc(Object.assign({}, v)));
    } catch (e) {
      return null;
    }
  }

  function ready(F, v) {
    return F.inputs.every((i) => isOpt(F, i) || has(v[i]));
  }

  // For an input listed in F.inputsIf: is it needed with the current values?
  // Inputs not listed there are always shown.
  function needed(F, id, values) {
    const cond = F.inputsIf && F.inputsIf[id];
    if (!cond) return true;
    try {
      return !!cond(values);
    } catch (e) {
      return false;
    }
  }

  function rangeWarning(id, x) {
    const V = ICU.vars[id];
    if (!V || V.type !== 'num' || !ICU.isNum(x)) return null;
    if ((V.min != null && x < V.min) || (V.max != null && x > V.max)) {
      return { id, text: `${ICU.plain(V.label)} looks unusual — check the value and unit.` };
    }
    return null;
  }

  // Interpretation rows: either when(v) or range keys on the table's variable.
  function rowMatches(row, table, all, F) {
    try {
      if (row.when) return !!row.when(all);
      const key = table.of || (F.outputs[0] && F.outputs[0].id);
      const x = all[key];
      if (!ICU.isNum(x)) return false;
      if (row.lt == null && row.le == null && row.gt == null && row.ge == null) return false;
      if (row.lt != null && !(x < row.lt)) return false;
      if (row.le != null && !(x <= row.le)) return false;
      if (row.gt != null && !(x > row.gt)) return false;
      if (row.ge != null && !(x >= row.ge)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function compute(fid, modes, values) {
    const F = ICU.formulas[fid];
    const items = plan(fid, modes);
    const v = {};
    const missing = [];
    const warnings = [];

    for (const it of items) {
      if (it.kind === 'leaf') {
        const x = values[it.id];
        v[it.id] = has(x) ? x : null;
        if (!has(x) && !it.opt) missing.push(it.id);
        const w = has(x) ? rangeWarning(it.id, x) : null;
        if (w) warnings.push(w);
      } else {
        const D = ICU.formulas[it.via];
        const out = ready(D, v) ? safeCalc(D, v) : null;
        v[it.id] = out && has(out[it.id]) ? out[it.id] : null;
      }
    }

    // Inputs needed only in some cases (weight for a per-kg dose unit).
    const condMissing = Object.keys(F.inputsIf || {}).filter((id) => needed(F, id, v) && !has(v[id]));
    missing.push(...condMissing);

    const ok = ready(F, v) && !condMissing.length && F.outputs.length > 0;
    let out = ok ? safeCalc(F, v) : null;
    // A calculator can refuse impossible input with { _err: 'why' }.
    if (out && out._err) {
      warnings.push({ id: fid, text: out._err, error: true });
      out = null;
    }

    // Comparisons with undefined are always false, which keeps blank
    // optional values from matching a row by accident (null < 5 is true).
    const all = {};
    for (const [k, x] of Object.entries(Object.assign({}, v, out || {}))) all[k] = x === null ? undefined : x;

    const matches = F.tables.map((t) =>
      t.rows.map((row) => !!out && rowMatches(row, t, all, F)));

    let verdicts = [];
    if (out && F.verdict) {
      try {
        const vd = F.verdict(all);
        if (vd) verdicts = [].concat(vd);
      } catch (e) { /* no verdict */ }
    } else if (out) {
      F.tables.forEach((t, ti) => {
        if (t.noVerdict) return;
        const k = matches[ti].indexOf(true);
        if (k >= 0) {
          const row = t.rows[k];
          verdicts.push({ text: row.v || row.c[1], tone: row.t || 'info' });
        }
      });
    }
    if (out && Array.isArray(out._msgs)) for (const msg of out._msgs) warnings.push({ id: fid, text: msg });

    return { items, v, out, all, missing, warnings, ready: !!out, matches, verdicts };
  }

  // Which formulas use the outputs of this one (for "Used in").
  function usedBy(fid) {
    const outs = new Set(ICU.formulas[fid].outputs.map((o) => o.id));
    return ICU.order.filter((id) => {
      if (id === fid) return false;
      return ICU.formulas[id].inputs.some((i) => outs.has(i) && ICU.vars[i] && ICU.vars[i].derive === fid);
    });
  }

  ICU.engine = { plan, compute, canCalc, defaultMode, usedBy, rowMatches, needed };
})(typeof window !== 'undefined' ? window : globalThis);
