/* Registry and helpers shared by every data file.
   Plain script (no modules) so the app runs from file://, from any static host
   and inlined into a single HTML file. Everything hangs off the global ICU. */
(function (root) {
  'use strict';
  const ICU = (root.ICU = root.ICU || {});

  ICU.vars = {};      // quantities the user can enter, keyed by id
  ICU.formulas = {};  // calculators and reference cards, keyed by id
  ICU.order = [];     // formula ids in definition order
  ICU.areas = [];     // macro areas shown on the home screen
  ICU.guides = {};    // step-by-step guides, keyed by id

  // Mini markup for labels and formulas:
  //   X_sub  X_{sub, with spaces}  X^sup  X^{sup}  [[numerator || denominator]]
  ICU.m = function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/\[\[(.+?)\|\|(.+?)\]\]/g, (_, n, d) =>
        `<span class="frac"><span class="num">${n.trim()}</span><span class="den">${d.trim()}</span></span>`)
      .replace(/_\{([^}]*)\}/g, '<sub>$1</sub>')
      .replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>')
      .replace(/_([A-Za-z0-9.'′]+)/g, '<sub>$1</sub>')
      .replace(/\^([A-Za-z0-9.−-]+)/g, '<sup>$1</sup>');
  };

  // Plain text version of a label (search, aria, tests).
  ICU.plain = function (s) {
    return ICU.m(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  };

  ICU.defVars = function (obj) {
    for (const id of Object.keys(obj)) {
      if (ICU.vars[id]) throw new Error('Duplicate variable: ' + id);
      ICU.vars[id] = Object.assign({ id, type: 'num' }, obj[id]);
    }
  };

  ICU.defFormulas = function (area, list) {
    for (const f of list) {
      if (ICU.formulas[f.id]) throw new Error('Duplicate formula: ' + f.id);
      f.area = area;
      f.inputs = f.inputs || [];
      f.optional = f.optional || [];
      f.outputs = f.outputs || [];
      f.tables = f.tables || [];
      ICU.formulas[f.id] = f;
      ICU.order.push(f.id);
    }
  };

  ICU.defArea = function (a) { ICU.areas.push(a); };

  ICU.defGuide = function (g) {
    if (ICU.guides[g.id]) throw new Error('Duplicate guide: ' + g.id);
    ICU.guides[g.id] = g;
  };

  // Numbers -------------------------------------------------------------
  ICU.isNum = (x) => typeof x === 'number' && isFinite(x);

  // Format with fixed decimals; group thousands only from 10 000 up.
  ICU.fmt = function (x, dp) {
    if (!ICU.isNum(x)) return '—';
    if (dp == null) dp = Math.abs(x) >= 100 ? 0 : Math.abs(x) >= 10 ? 1 : 2;
    let s = x.toFixed(dp);
    if (s === '-0' || /^-0\.0*$/.test(s)) s = s.slice(1);
    if (Math.abs(x) >= 10000) {
      const [i, d] = s.split('.');
      s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? '.' + d : '');
    }
    return s.replace('-', '−');
  };

  // Accepts "7.35", "7,35", " 120 " → number, or null.
  ICU.parseNum = function (s) {
    if (s == null) return null;
    const t = String(s).trim().replace(/\s/g, '').replace(',', '.').replace('−', '-');
    if (t === '' || t === '-' || t === '.') return null;
    const x = Number(t);
    return isFinite(x) ? x : null;
  };

  ICU.parseList = function (s) {
    if (s == null) return null;
    const xs = String(s).split(/[\s;,]+/).map((t) => ICU.parseNum(t)).filter((x) => x !== null);
    return xs.length ? xs : null;
  };

  // Clamp helper used by scores with bounded inputs (MELD and friends).
  ICU.clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
})(typeof window !== 'undefined' ? window : globalThis);
