/* Acid–base: blood gas checks, compensation, anion gaps, Stewart, bicarbonate. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    chronicity: { label: 'Respiratory component', type: 'choice', options: [['acute', 'Acute'], ['chronic', 'Chronic']], hint: 'Only used if the primary disorder is respiratory.' },
    ag: { label: 'Anion gap', unit: 'mEq/L', derive: 'ag', calc: true, dp: 0 },
    doseMeq: { label: 'Bicarbonate dose', unit: 'mEq', min: 1, max: 1000 },
    uOsm: { label: 'Urine osmolality', unit: 'mOsm/kg', min: 50, max: 1400 },
    uGlu: { label: 'Urine glucose', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 18]], min: 0, max: 3000, dflt: 0 },
    mg: { label: 'Magnesium', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 0.411], ['mEq/L', 0.5]], min: 0.2, max: 4 },
    phos: { label: 'Phosphate', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 0.323]], min: 0.1, max: 6 },
    sbe: { label: 'Standard base excess (SBE)', unit: 'mEq/L', min: -35, max: 35 },
  });

  // Primary disorder and expected compensation from pH, PaCO2 and HCO3.
  function analyse(v) {
    const { ph, paco2: c, hco3: h } = v;
    const chronic = v.chronicity === 'chronic';
    let primary;
    let normalPh = false;
    if (ph < 7.35) {
      const metab = h < 22;
      const resp = c > 45;
      primary = metab && resp ? 'mixed-acid' : resp ? 'resp-acid' : 'met-acid';
    } else if (ph > 7.45) {
      const metab = h > 26;
      const resp = c < 35;
      primary = metab && resp ? 'mixed-alk' : resp ? 'resp-alk' : 'met-alk';
    } else {
      normalPh = true;
      if (c > 45 && h > 26) primary = ph < 7.4 ? 'resp-acid' : 'met-alk';
      else if (c < 35 && h < 22) primary = ph < 7.4 ? 'met-acid' : 'resp-alk';
      else if (c > 45 || c < 35 || h > 26 || h < 22) primary = 'mixed-normal';
      else primary = 'normal';
    }

    let label = {
      'met-acid': 'Metabolic acidosis',
      'met-alk': 'Metabolic alkalosis',
      'resp-acid': `Respiratory acidosis (${chronic ? 'chronic' : 'acute'})`,
      'resp-alk': `Respiratory alkalosis (${chronic ? 'chronic' : 'acute'})`,
      'mixed-acid': 'Mixed metabolic and respiratory acidosis',
      'mixed-alk': 'Mixed metabolic and respiratory alkalosis',
      'mixed-normal': 'Normal pH with abnormal PaCO₂ or HCO₃⁻: mixed disorder',
      normal: 'No acid–base disorder on these values',
    }[primary];
    if (normalPh && /^(met|resp)-/.test(primary)) label += ', pH in the normal range';

    const res = { primary, label };
    const set = (what, lo, hi) => Object.assign(res, { expWhat: what, expLo: lo, expHi: hi, expected: (lo + hi) / 2 });
    const judge = (x, addHigh, addLow, ok) => (x > res.expHi ? addHigh : x < res.expLo ? addLow : ok);

    if (primary === 'met-acid') {
      set('PaCO₂', 1.5 * h + 6, 1.5 * h + 10);
      res.extra = judge(c, 'Added respiratory acidosis (fatigue, sedation)', 'Added respiratory alkalosis (sepsis, liver failure, salicylate)', 'Appropriate respiratory compensation');
    } else if (primary === 'met-alk') {
      set('PaCO₂', 0.7 * h + 19, 0.7 * h + 23);
      res.extra = judge(c, 'Added respiratory acidosis', 'Added respiratory alkalosis', 'Appropriate respiratory compensation');
    } else if (primary === 'resp-acid') {
      const d = (c - 40) / 10;
      if (chronic) set('HCO₃⁻', 24 + 3.5 * d, 24 + 4 * d);
      else set('HCO₃⁻', 24 + d - 2, 24 + d + 2);
      res.extra = judge(h, 'Added metabolic alkalosis', 'Added metabolic acidosis', 'Appropriate metabolic compensation');
    } else if (primary === 'resp-alk') {
      const d = (40 - c) / 10;
      if (chronic) set('HCO₃⁻', 24 - 5 * d, 24 - 4 * d);
      else set('HCO₃⁻', 24 - 2 * d - 2, 24 - 2 * d + 2);
      res.extra = judge(h, 'Added metabolic alkalosis', 'Added metabolic acidosis', 'Appropriate metabolic compensation');
    }
    return res;
  }

  const agTable = {
    cols: ['AG (mEq/L)', 'Meaning'], rows: [
      { c: ['< 6', 'Low: hypoalbuminaemia, myeloma, lithium, bromide'], lt: 6, t: 'info' },
      { c: ['6–9', 'Low–normal'], ge: 6, lt: 9, t: 'ok', added: true },
      { c: ['9–13', 'Normal → an acidosis is normal-gap: diarrhoea, saline, RTA'], ge: 9, le: 13, t: 'ok' },
      { c: ['> 13 (albumin-corrected)', 'High-gap: lactate, ketones, renal failure, toxic alcohols, salicylate'], gt: 13, t: 'bad' },
    ],
  };

  ICU.defFormulas('ab', [
    {
      id: 'hh', title: 'Henderson–Hasselbalch', short: 'pH',
      tags: ['ph', 'bicarbonate', 'blood gas'],
      inputs: ['hco3', 'paco2'],
      outputs: [{ id: 'phCalc', label: 'pH (calculated)', unit: '', dp: 2 }],
      calc: (v) => ({ phCalc: 6.1 + Math.log10(v.hco3 / (0.03 * v.paco2)) }),
      formula: 'pH = 6.1 + log [[[HCO_3^−] || 0.03 × PaCO_2]]',
      use: 'Links the three numbers of a blood gas; the first step is the pH itself.',
      tables: [{
        cols: ['pH', 'Meaning'], rows: [
          { c: ['< 7.20 or > 7.60', 'Dangerous — act now'], when: (v) => v.phCalc < 7.2 || v.phCalc > 7.6, t: 'bad' },
          { c: ['< 7.35', 'Acidaemia'], when: (v) => v.phCalc < 7.35 && v.phCalc >= 7.2, t: 'mid' },
          { c: ['7.35–7.45', 'Normal (a mixed disorder can still hide here)'], ge: 7.35, le: 7.45, t: 'ok' },
          { c: ['> 7.45', 'Alkalaemia'], when: (v) => v.phCalc > 7.45 && v.phCalc <= 7.6, t: 'mid' },
        ],
      }],
      example: { v: { hco3: 24, paco2: 40 }, expect: { phCalc: 7.4 } },
    },
    {
      id: 'henderson', title: 'Henderson equation: is the gas consistent?', short: '[H⁺]',
      tags: ['hydrogen ion', 'consistency', 'blood gas error'],
      inputs: ['paco2', 'hco3', 'ph'],
      outputs: [
        { id: 'hCalc', label: '[H⁺] from PaCO₂/HCO₃⁻', unit: 'nmol/L', dp: 0 },
        { id: 'hMeas', label: '[H⁺] from measured pH', unit: 'nmol/L', dp: 0 },
        { id: 'hDiff', label: 'Difference', unit: '%', dp: 0 },
      ],
      calc: (v) => {
        const hCalc = (24 * v.paco2) / v.hco3;
        const hMeas = Math.pow(10, 9 - v.ph);
        return { hCalc, hMeas, hDiff: (100 * Math.abs(hCalc - hMeas)) / hMeas };
      },
      formula: '[H^+] (nmol/L) = 24 × [[PaCO_2 || [HCO_3^−]]]',
      use: 'Check the gas is internally consistent. If the calculated [H⁺] does not match the pH, suspect a sampling or analyser error.',
      tables: [
        {
          of: 'hDiff', cols: ['Difference', 'Meaning'], rows: [
            { c: ['≤ 10%', 'Internally consistent'], le: 10, t: 'ok', added: true },
            { c: ['> 10%', 'Inconsistent: check sampling, transcription or analyser'], gt: 10, t: 'bad', added: true },
          ],
        },
        {
          title: 'pH ↔ [H⁺]', cols: ['pH', '[H⁺] (nmol/L)'], rows: [
            { c: ['7.00', '100'] }, { c: ['7.10', '79'] }, { c: ['7.20', '63'] }, { c: ['7.30', '50'] },
            { c: ['7.40', '40'] }, { c: ['7.50', '32'] }, { c: ['7.60', '25'] },
          ],
        },
      ],
      example: { v: { paco2: 40, hco3: 24, ph: 7.4 }, expect: { hCalc: 40, hMeas: 39.8 } },
    },
    {
      id: 'comp', title: 'Primary disorder and expected compensation', short: 'Winter',
      tags: ['winter', 'compensation', 'mixed disorder', 'metabolic acidosis', 'respiratory acidosis', 'blood gas'],
      inputs: ['ph', 'paco2', 'hco3', 'chronicity'], optional: ['chronicity'],
      outputs: [
        { id: 'expPaco2', label: 'Expected PaCO₂', unit: 'mmHg', dp: 0 },
        { id: 'expHco3', label: 'Expected HCO₃⁻', unit: 'mmol/L', dp: 0 },
      ],
      calc: (v) => {
        const a = analyse(v);
        return {
          expPaco2: a.expWhat === 'PaCO₂' ? a.expected : null,
          expHco3: a.expWhat === 'HCO₃⁻' ? a.expected : null,
          _a: a,
        };
      },
      verdict: (v) => {
        const a = v._a;
        const out = [{ text: a.label, tone: a.primary === 'normal' ? 'ok' : 'bad' }];
        if (a.extra) {
          out.push({
            text: `Expected ${a.expWhat} ${ICU.fmt(a.expLo, 0)}–${ICU.fmt(a.expHi, 0)}: ${a.extra}`,
            tone: /Appropriate/.test(a.extra) ? 'ok' : 'mid',
          });
        }
        if (/resp/.test(a.primary) && !v.chronicity) out.push({ text: 'Choose acute or chronic for the exact range (acute shown).', tone: 'info' });
        return out;
      },
      formula: 'Winter: PaCO_2 = 1.5 × [HCO_3^−] + 8 ± 2',
      use: 'If the measured value differs from the expected one, there is a second disorder.',
      tables: [{
        cols: ['Primary disorder', 'Expected response'], noVerdict: true, rows: [
          { c: ['Metabolic acidosis', 'PaCO₂ = 1.5 × HCO₃⁻ + 8 ± 2 (≈ last two digits of pH)'], when: (v) => v._a.primary === 'met-acid', t: 'info' },
          { c: ['Metabolic alkalosis', 'PaCO₂ = 0.7 × HCO₃⁻ + 21 ± 2 (rarely > 55)'], when: (v) => v._a.primary === 'met-alk', t: 'info' },
          { c: ['Respiratory acidosis, acute', 'HCO₃⁻ ↑ 1 per 10 mmHg PaCO₂; ΔH⁺/ΔPaCO₂ = 0.8'], when: (v) => v._a.primary === 'resp-acid' && v.chronicity !== 'chronic', t: 'info' },
          { c: ['Respiratory acidosis, chronic', 'HCO₃⁻ ↑ 3.5–4 per 10 mmHg; ΔH⁺/ΔPaCO₂ = 0.3'], when: (v) => v._a.primary === 'resp-acid' && v.chronicity === 'chronic', t: 'info' },
          { c: ['Respiratory alkalosis, acute', 'HCO₃⁻ ↓ 2 per 10 mmHg'], when: (v) => v._a.primary === 'resp-alk' && v.chronicity !== 'chronic', t: 'info' },
          { c: ['Respiratory alkalosis, chronic', 'HCO₃⁻ ↓ 4–5 per 10 mmHg'], when: (v) => v._a.primary === 'resp-alk' && v.chronicity === 'chronic', t: 'info' },
        ],
      }],
      example: { v: { ph: 7.25, paco2: 28, hco3: 12 }, expect: { expPaco2: 26 } },
      guide: 'acidbase',
    },
    {
      id: 'ag', title: 'Anion gap', short: 'AG',
      tags: ['anion gap', 'metabolic acidosis', 'high gap'],
      inputs: ['na', 'cl', 'hco3'],
      outputs: [{ id: 'ag', label: 'AG', unit: 'mEq/L', dp: 0 }],
      calc: (v) => ({ ag: v.na - v.cl - v.hco3 }),
      formula: 'AG = [Na^+] − [Cl^−] − [HCO_3^−]',
      use: 'Split metabolic acidosis into high-gap and normal-gap causes. Always correct for albumin in ICU patients.',
      tables: [agTable],
      example: { v: { na: 140, cl: 100, hco3: 14 }, expect: { ag: 26 } },
      see: ['agcorr', 'delta'],
      guide: 'acidbase',
    },
    {
      id: 'agcorr', title: 'Albumin-corrected anion gap (Figge)', short: 'AG corr',
      tags: ['anion gap', 'albumin', 'figge'],
      inputs: ['ag', 'alb'],
      outputs: [{ id: 'agCorr', label: 'AG corrected', unit: 'mEq/L', dp: 0 }],
      calc: (v) => ({ agCorr: v.ag + 2.5 * (4.0 - v.alb) }),
      formula: 'AG_corr = AG + 2.5 × (4.0 − Alb_{g/dL})',
      use: 'Low albumin hides a high gap.',
      tables: [
        Object.assign({}, agTable, { of: 'agCorr' }),
        {
          title: 'Albumin effect', cols: ['Albumin (g/dL)', 'Add to AG'], rows: [
            { c: ['4.0', '0'] }, { c: ['3.0', '+2.5'] }, { c: ['2.0', '+5'] }, { c: ['1.5', '+6'] },
          ],
        },
      ],
      example: { v: { na: 138, cl: 108, hco3: 18, alb: 2 }, expect: { agCorr: 17 } },
      guide: 'acidbase',
    },
    {
      id: 'delta', title: 'Delta ratio', short: 'ΔAG/ΔHCO₃',
      tags: ['delta gap', 'delta ratio', 'mixed metabolic'],
      inputs: ['ag', 'hco3'],
      outputs: [{ id: 'deltaR', label: 'Delta ratio', unit: '', dp: 2 }],
      calc: (v) => {
        if (v.hco3 >= 24) return { _err: 'Delta ratio applies only when HCO₃⁻ is below 24.' };
        return { deltaR: (v.ag - 12) / (24 - v.hco3) };
      },
      formula: '[[ΔAG || ΔHCO_3^−]] = [[AG − 12 || 24 − [HCO_3^−]]]',
      use: 'In a high-gap acidosis, look for a second metabolic process.',
      tables: [{
        cols: ['Delta ratio', 'Meaning'], rows: [
          { c: ['< 0.4', 'Normal-gap (hyperchloraemic) acidosis'], lt: 0.4, t: 'mid' },
          { c: ['0.4–0.8', 'Mixed high- and normal-gap acidosis'], ge: 0.4, lt: 0.8, t: 'mid' },
          { c: ['0.8–2.0', 'Pure high-gap acidosis (DKA ≈ 1, lactic ≈ 1.6)'], ge: 0.8, le: 2, t: 'info' },
          { c: ['> 2.0', 'Added metabolic alkalosis or prior high HCO₃⁻'], gt: 2, t: 'mid' },
        ],
      }],
      notes: ['Uses the uncorrected AG as in the reference; with low albumin, consider the corrected AG.'],
      example: { v: { na: 140, cl: 100, hco3: 14 }, expect: { deltaR: 1.4 } },
      guide: 'acidbase',
    },
    {
      id: 'hco3_def', title: 'Bicarbonate deficit', short: 'HCO₃⁻ deficit',
      tags: ['sodium bicarbonate', 'nahco3', 'acidosis', 'dose'],
      inputs: ['weight', 'hco3'],
      outputs: [
        { id: 'hco3Def', label: 'Deficit', unit: 'mmol', dp: 0 },
        { id: 'hco3Half', label: 'Initial dose (half)', unit: 'mmol', dp: 0 },
        { id: 'ml84', label: 'Half as 8.4% NaHCO₃', unit: 'mL', dp: 0 },
        { id: 'ml42', label: 'Half as 4.2% NaHCO₃', unit: 'mL', dp: 0 },
      ],
      calc: (v) => {
        const d = 0.5 * v.weight * (24 - v.hco3);
        if (d <= 0) return { _err: 'No deficit: HCO₃⁻ is 24 or higher.' };
        return { hco3Def: d, hco3Half: d / 2, ml84: d / 2, ml42: d };
      },
      formula: 'HCO_3^− deficit (mmol) = 0.5 × weight × (24 − [HCO_3^−])',
      use: 'Size an NaHCO₃ dose: give about half, then recheck.',
      tables: [{
        cols: ['Situation', 'Bicarbonate'], rows: [
          { c: ['pH < 7.20 with AKI (KDIGO 2–3)', 'Reasonable (BICAR-ICU)'] },
          { c: ['Normal-gap acidosis with large HCO₃⁻ loss', 'Reasonable'] },
          { c: ['Hyperkalaemia, tricyclic or salicylate poisoning', 'Indicated'] },
          { c: ['Lactic or ketoacidosis, normal kidneys', 'No outcome benefit — treat the cause'] },
        ],
      }],
      notes: ['Each mEq of HCO₃⁻ brings 1 mEq of Na⁺; the patient must be able to exhale the extra CO₂; K⁺ and ionised Ca²⁺ fall as pH rises.'],
      example: { v: { weight: 70, hco3: 12 }, text: '70 kg, HCO₃⁻ 12 → deficit 420 mmol → give ≈ 200 mmol.', expect: { hco3Def: 420, hco3Half: 210 } },
      see: ['hco3_units'],
    },
    {
      id: 'hco3_units', title: 'Bicarbonate: mEq to mL and grams', short: 'NaHCO₃',
      tags: ['sodium bicarbonate', 'meq', 'mmol', 'volume', '8.4%', '4.2%'],
      inputs: ['doseMeq'],
      outputs: [
        { id: 'v84', label: '8.4% NaHCO₃ (1 mEq/mL)', unit: 'mL', dp: 0 },
        { id: 'v75', label: '7.5% NaHCO₃ (0.89 mEq/mL)', unit: 'mL', dp: 0 },
        { id: 'v42', label: '4.2% NaHCO₃ (0.5 mEq/mL)', unit: 'mL', dp: 0 },
        { id: 'v14', label: '1.4% NaHCO₃ (0.167 mEq/mL)', unit: 'mL', dp: 0 },
        { id: 'grams', label: 'NaHCO₃ powder (MW 84)', unit: 'g', dp: 1 },
      ],
      calc: (v) => ({
        v84: v.doseMeq, v75: v.doseMeq / 0.893, v42: v.doseMeq / 0.5, v14: v.doseMeq / 0.1667, grams: (v.doseMeq * 84) / 1000,
      }),
      formula: 'mEq = mmol × valence   mmol = [[mg || molecular weight]]   HCO_3^−: 1 mEq = 1 mmol',
      use: 'Turn a deficit or prescription in mEq or mmol into a volume of the solution on the shelf.',
      tables: [{
        cols: ['Preparation', 'mEq per mL', 'For 100 mEq', 'Note'], rows: [
          { c: ['8.4% NaHCO₃', '1.0', '100 mL', '≈ 2000 mOsm/L — central line preferred, extravasation injury'] },
          { c: ['7.5% NaHCO₃ (US vials)', '0.89', '112 mL', '50 mL vial = 44.6 mEq'] },
          { c: ['4.2% NaHCO₃', '0.5', '200 mL', 'Half strength, often used peripherally'] },
          { c: ['1.4% NaHCO₃', '0.167', '600 mL', 'Near-isotonic; large volume load'] },
          { c: ['NaHCO₃ powder / tablets', '≈ 12 per gram', '8.4 g', '500 mg tablet ≈ 6 mEq'] },
        ],
      }],
      example: { v: { doseMeq: 210 }, text: '210 mEq = 210 mL of 8.4% or 420 mL of 4.2%.', expect: { v84: 210, v42: 420 } },
    },
    {
      id: 'hco3_ex', title: 'Bicarbonate excess', short: 'HCO₃⁻ excess',
      tags: ['metabolic alkalosis', 'urine chloride', 'acetazolamide'],
      inputs: ['weight', 'hco3', 'uCl'], optional: ['uCl'],
      outputs: [{ id: 'hco3Ex', label: 'Excess', unit: 'mmol', dp: 0 }],
      calc: (v) => {
        const e = 0.4 * v.weight * (v.hco3 - 24);
        if (e <= 0) return { _err: 'No excess: HCO₃⁻ is 24 or lower.' };
        return { hco3Ex: e };
      },
      formula: 'HCO_3^− excess (mmol) = 0.4 × weight × ([HCO_3^−] − 24)',
      use: 'Size of a metabolic alkalosis. Add urine chloride to choose the treatment.',
      tables: [{
        cols: ['Urine Cl⁻', 'Type', 'Treatment'], rows: [
          { c: ['< 20 mmol/L', 'Chloride-responsive: vomiting, NG drainage, past diuretics', 'NaCl, KCl'], when: (v) => v.uCl < 20, t: 'info' },
          { c: ['> 20 mmol/L', 'Chloride-resistant: ongoing diuretics, mineralocorticoid excess, severe hypokalaemia', 'K⁺, acetazolamide, treat cause'], when: (v) => v.uCl >= 20, t: 'info' },
        ],
      }],
      example: { v: { weight: 70, hco3: 34 }, expect: { hco3Ex: 280 } },
    },
    {
      id: 'uag', title: 'Urine anion gap', short: 'UAG',
      tags: ['rta', 'renal tubular acidosis', 'diarrhoea', 'normal gap'],
      inputs: ['uNa', 'uK', 'uCl'],
      outputs: [{ id: 'uagV', label: 'UAG', unit: 'mEq/L', dp: 0 }],
      calc: (v) => ({ uagV: v.uNa + v.uK - v.uCl }),
      formula: 'UAG = U_Na + U_K − U_Cl',
      use: 'In normal-gap acidosis: gut or kidney?',
      tables: [{
        cols: ['UAG', 'Meaning'], rows: [
          { c: ['Negative (−20 to −50)', 'Kidney excreting NH₄⁺ → GI loss (diarrhoea)'], lt: 0, t: 'info' },
          { c: ['Positive', 'Renal acidification defect → distal RTA (unreliable with ketonuria)'], ge: 0, t: 'mid' },
        ],
      }],
      example: { v: { uNa: 40, uK: 30, uCl: 100 }, expect: { uagV: -30 } },
    },
    {
      id: 'uog', title: 'Urine osmolal gap', short: 'UOG',
      tags: ['urine osmolal gap', 'ammonium', 'rta'],
      inputs: ['uOsm', 'uNa', 'uK', 'uUreaN', 'uGlu'],
      outputs: [{ id: 'uogV', label: 'UOG', unit: 'mOsm/kg', dp: 0 }],
      calc: (v) => ({ uogV: v.uOsm - (2 * (v.uNa + v.uK) + v.uUreaN / 2.8 + v.uGlu / 18) }),
      formula: 'UOG = U_osm − [ 2(U_Na + U_K) + [[U_{urea N} || 2.8]] + [[U_glucose || 18]] ]   (mg/dL)',
      use: 'NH₄⁺ estimate when the urine anion gap is unreliable.',
      tables: [{
        cols: ['UOG (mOsm/kg)', 'Meaning'], rows: [
          { c: ['> 150', 'Adequate NH₄⁺ → extra-renal cause'], gt: 150, t: 'info' },
          { c: ['100–150', 'Indeterminate'], ge: 100, le: 150, t: 'mid', added: true },
          { c: ['< 100', 'Low NH₄⁺ → renal cause (RTA)'], lt: 100, t: 'mid' },
        ],
      }],
      example: { v: { uOsm: 500, uNa: 50, uK: 40, uUreaN: 560, uGlu: 0 }, expect: { uogV: 120 } },
    },
    {
      id: 'stewart', title: 'Stewart approach (SID and SIG)', short: 'SID · SIG',
      tags: ['stewart', 'strong ion', 'sid', 'sig', 'unmeasured anions'],
      inputs: ['na', 'k', 'caIon', 'mg', 'cl', 'lactate', 'hco3', 'alb', 'phos', 'ph'],
      outputs: [
        { id: 'sida', label: 'SID_a (apparent)', unit: 'mEq/L', dp: 1 },
        { id: 'side', label: 'SID_e (effective)', unit: 'mEq/L', dp: 1 },
        { id: 'sig', label: 'SIG', unit: 'mEq/L', dp: 1 },
      ],
      calc: (v) => {
        const sida = v.na + v.k + 2 * v.caIon + 2 * v.mg - v.cl - v.lactate;
        const albGL = v.alb * 10;
        const side = v.hco3 + albGL * (0.123 * v.ph - 0.631) + v.phos * (0.309 * v.ph - 0.469);
        return { sida, side, sig: sida - side };
      },
      formula: 'SID_a = Na^+ + K^+ + 2Ca^{2+} + 2Mg^{2+} − Cl^− − lactate^−   SID_e = HCO_3^− + Alb × (0.123 pH − 0.631) + Phos × (0.309 pH − 0.469)   SIG = SID_a − SID_e',
      use: 'When low albumin or high chloride make the anion gap misleading. Albumin in g/L, phosphate in mmol/L (the app converts).',
      tables: [
        {
          of: 'sida', cols: ['SID_a', 'Meaning'], rows: [
            { c: ['< 40', 'Acidifying: hyperchloraemia or unmeasured anions'], lt: 38, t: 'mid' },
            { c: ['≈ 40', 'Normal'], ge: 38, le: 42, t: 'ok' },
            { c: ['> 40', 'Alkalinising: hypochloraemia, contraction'], gt: 42, t: 'mid' },
          ],
        },
        {
          of: 'sig', cols: ['SIG', 'Meaning'], rows: [
            { c: ['≤ 2', 'No unmeasured anions'], le: 2, t: 'ok' },
            { c: ['> 2', 'Unmeasured anions: ketones, toxins, uraemic acids'], gt: 2, t: 'bad' },
          ],
        },
      ],
      notes: ['"≈ 40" is read here as 38–42.'],
      example: { v: { na: 140, k: 4, caIon: 1.1, mg: 0.8, cl: 110, lactate: 2, hco3: 18, alb: 2.5, ph: 7.3, phos: 1.2 }, expect: { sida: 35.8, sig: 9 } },
    },
    {
      id: 'fencl', title: 'Fencl–Story partition of base excess', short: 'BE partition',
      tags: ['base excess', 'fencl', 'story', 'hyperchloraemic', 'saline'],
      inputs: ['na', 'cl', 'alb', 'lactate', 'sbe'],
      outputs: [
        { id: 'beUnm', label: 'BE unmeasured', unit: 'mEq/L', dp: 1 },
        { id: 'beNaCl', label: 'BE Na–Cl', unit: 'mEq/L', dp: 1 },
        { id: 'beAlb', label: 'BE albumin', unit: 'mEq/L', dp: 1 },
        { id: 'beLac', label: 'BE lactate', unit: 'mEq/L', dp: 1 },
      ],
      calc: (v) => {
        const beNaCl = v.na - v.cl - 38;
        const beAlb = 0.25 * (42 - v.alb * 10);
        const beLac = 1 - v.lactate;
        return { beNaCl, beAlb, beLac, beUnm: v.sbe - (beNaCl + beAlb + beLac) };
      },
      formula: 'BE_{Na−Cl} = Na^+ − Cl^− − 38   BE_Alb = 0.25 × (42 − Alb)   BE_Lac = 1 − lactate   BE_unmeasured = SBE − (BE_{Na−Cl} + BE_Alb + BE_Lac)',
      use: 'Break a base deficit into its causes with routine labs (albumin in g/L; the app converts).',
      tables: [{
        cols: ['Component', 'Negative value means'], noVerdict: true, rows: [
          { c: ['BE Na–Cl', 'Hyperchloraemic acidosis (e.g. saline)'], when: (v) => v.beNaCl < -2, t: 'mid' },
          { c: ['BE Alb', '(Positive) alkalinising effect of low albumin'], when: (v) => v.beAlb > 2, t: 'info' },
          { c: ['BE Lac', 'Lactic acidosis'], when: (v) => v.beLac < -1, t: 'mid' },
          { c: ['BE unmeasured', 'Ketones, toxins, renal acids'], when: (v) => v.beUnm < -2, t: 'mid' },
        ],
      }],
      example: { v: { na: 140, cl: 110, alb: 2.5, lactate: 3, sbe: -10 }, expect: { beNaCl: -8, beAlb: 4.25, beLac: -2, beUnm: -4.25 } },
    },
  ]);

  ICU.defArea({
    id: 'ab', title: 'Acid–base', code: 'pH',
    blurb: 'Blood gas consistency, compensation, anion gaps, Stewart and bicarbonate dosing.',
    sections: [
      { title: 'Reading the gas', items: ['g:acidbase', 'hh', 'henderson', 'comp'] },
      { title: 'Metabolic acidosis', items: ['ag', 'agcorr', 'delta', 'uag', 'uog'] },
      { title: 'Stewart approach', items: ['stewart', 'fencl'] },
      { title: 'Bicarbonate', items: ['hco3_def', 'hco3_units', 'hco3_ex'] },
    ],
  });

  ICU.acidBase = analyse;
})(typeof window !== 'undefined' ? window : globalThis);
