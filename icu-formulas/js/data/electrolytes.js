/* Electrolytes and osmolality. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    ethanol: { label: 'Ethanol', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 4.6]], min: 0, max: 800 },
    infusate: {
      label: 'Infusate', type: 'choice', options: [
        ['513', '3% NaCl (513)'], ['154', '0.9% NaCl (154)'], ['134', "Ringer's lactate (≈ 134)"],
        ['77', '0.45% NaCl (77)'], ['0', '5% dextrose (0)'],
      ],
    },
    infK: { label: 'K⁺ added to the infusate', unit: 'mmol/L', min: 0, max: 80, dflt: 0 },
    naRise: { label: 'Desired change in Na⁺', unit: 'mmol/L', min: 1, max: 12, hint: 'Optional: litres needed for this change.' },
    urineVolDay: { label: 'Urine volume', unit: 'L/day', min: 0, max: 15 },
    caTot: { label: 'Total calcium', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 4]], min: 3, max: 18 },
    phNew: { label: 'Expected new pH', unit: '', min: 6.8, max: 7.8 },
  });

  ICU.defFormulas('lytes', [
    {
      id: 'osm', title: 'Calculated serum osmolality', short: 'Osm calc',
      tags: ['osmolality', 'osmolarity', 'sodium', 'glucose', 'urea'],
      inputs: ['na', 'glucose', 'bun', 'ethanol'], optional: ['ethanol'],
      outputs: [{ id: 'osmCalc', label: 'Calculated osmolality', unit: 'mOsm/kg', dp: 0 }],
      calc: (v) => ({ osmCalc: 2 * v.na + v.glucose / 18 + v.bun / 2.8 + (v.ethanol ? v.ethanol / 3.7 : 0) }),
      formula: 'Osm_calc = 2[Na^+] + [[[glucose] || 18]] + [[[BUN] || 2.8]]   (+ ethanol/3.7)',
      use: 'Classify sodium disorders and compute the osmolar gap. In SI units: 2 × Na + glucose + urea (mmol/L).',
      tables: [{
        cols: ['Osmolality (mOsm/kg)', 'Meaning'], rows: [
          { c: ['< 275', 'Hypo-osmolar → true hypotonic hyponatraemia'], lt: 275, t: 'mid' },
          { c: ['275–295', 'Normal'], ge: 275, le: 295, t: 'ok' },
          { c: ['> 295–300', 'Hyperosmolar: hypernatraemia, hyperglycaemia, uraemia, mannitol, alcohols'], gt: 295, t: 'mid' },
        ],
      }],
      example: { v: { na: 140, glucose: 90, bun: 14 }, expect: { osmCalc: 290 } },
    },
    {
      id: 'osmgap', title: 'Osmolar gap', short: 'Osm gap',
      tags: ['osmolar gap', 'toxic alcohol', 'methanol', 'ethylene glycol', 'fomepizole'],
      inputs: ['osmMeas', 'osmCalc'],
      outputs: [{ id: 'osmGap', label: 'Osmolar gap', unit: 'mOsm/kg', dp: 0 }],
      calc: (v) => ({ osmGap: v.osmMeas - v.osmCalc }),
      formula: 'Osm gap = Osm_measured − Osm_calc',
      use: 'Screen for unmeasured osmoles: toxic alcohols, mannitol.',
      tables: [{
        cols: ['Gap (mOsm/kg)', 'Meaning'], rows: [
          { c: ['< 10', 'Normal'], lt: 10, t: 'ok' },
          { c: ['10–20', 'Possible: ethanol, mannitol, ketoacidosis, lactic acidosis, CKD'], ge: 10, le: 20, t: 'mid' },
          { c: ['> 20–25', 'Toxic alcohol likely (methanol, ethylene glycol) → fomepizole, dialysis'], gt: 20, t: 'bad' },
        ],
      }],
      example: { v: { osmMeas: 320, na: 140, glucose: 90, bun: 14 }, expect: { osmGap: 30 } },
    },
    {
      id: 'osmeff', title: 'Effective osmolality (tonicity)', short: 'Tonicity',
      tags: ['tonicity', 'hhs', 'hyperosmolar', 'pseudohyponatraemia'],
      inputs: ['na', 'glucose'],
      outputs: [{ id: 'osmEff', label: 'Effective osmolality', unit: 'mOsm/kg', dp: 0 }],
      calc: (v) => ({ osmEff: 2 * v.na + v.glucose / 18 }),
      formula: 'Osm_eff = 2[Na^+] + [[[glucose] || 18]]',
      use: 'What actually moves water between cells and plasma; urea crosses cell membranes, so it is left out.',
      tables: [{
        cols: ['Finding', 'Meaning'], rows: [
          { c: ['> 320 mOsm/kg + glucose > 600 mg/dL', 'Supports HHS'], when: (v) => v.osmEff > 320 && v.glucose > 600, t: 'bad' },
          { c: ['Hyponatraemia with normal or high tonicity', 'Translocational (glucose, mannitol) or pseudohyponatraemia'], when: (v) => v.na < 135 && v.osmEff >= 275, t: 'mid' },
        ],
      }],
      example: { v: { na: 150, glucose: 900 }, expect: { osmEff: 350 } },
    },
    {
      id: 'na_glu', title: 'Sodium corrected for glucose', short: 'Na corr',
      tags: ['hyperglycaemia', 'dka', 'hhs', 'katz', 'hillier'],
      inputs: ['na', 'glucose'],
      outputs: [
        { id: 'naKatz', label: 'Corrected Na (Katz, 1.6)', unit: 'mmol/L', dp: 0 },
        { id: 'naHillier', label: 'Corrected Na (Hillier, 2.4)', unit: 'mmol/L', dp: 0 },
      ],
      calc: (v) => ({
        naKatz: v.na + (1.6 * (v.glucose - 100)) / 100,
        naHillier: v.na + (2.4 * (v.glucose - 100)) / 100,
      }),
      formula: 'Na_corr = [Na^+] + 1.6 × [[[glucose] − 100 || 100]]   (2.4 per 100 above 400 mg/dL, Hillier)',
      use: 'The sodium to expect once glucose normalises.',
      tables: [{
        of: 'naKatz', cols: ['Corrected Na', 'Meaning'], rows: [
          { c: ['Normal', 'Hyponatraemia explained by hyperglycaemia'], ge: 135, le: 145, t: 'ok' },
          { c: ['High', 'Free-water deficit — Na will rise as glucose falls'], gt: 145, t: 'bad' },
          { c: ['Low', 'True hyponatraemia as well'], lt: 135, t: 'mid' },
        ],
      }],
      notes: ['The handout says 1 per 62 mg/dL; 1.6 per 100 (Katz) is the usual factor, 2.4 per 100 (Hillier) fits better above 400 mg/dL.'],
      example: { v: { na: 130, glucose: 600 }, text: 'Na 130, glucose 600 → 138 (Katz) or 142 (Hillier).', expect: { naKatz: 138, naHillier: 142 } },
    },
    {
      id: 'tbw', title: 'Total body water', short: 'TBW',
      tags: ['total body water', 'sodium', 'water'],
      inputs: ['sex', 'age', 'weight'],
      outputs: [
        { id: 'tbw', label: 'TBW', unit: 'L', dp: 1 },
        { id: 'tbwK', label: 'Factor k', unit: '', dp: 2 },
      ],
      calc: (v) => {
        const old = v.age >= 65;
        const k = v.sex === 'm' ? (old ? 0.5 : 0.6) : old ? 0.45 : 0.5;
        return { tbw: k * v.weight, tbwK: k };
      },
      formula: 'TBW = k × weight (kg)',
      use: 'The denominator of every sodium calculation. The app picks k from sex and age (elderly = 65 or older).',
      tables: [{
        of: 'tbwK', cols: ['Patient', 'k'], noVerdict: true, rows: [
          { c: ['Young man', '0.6 (handout)'], when: (v) => v.sex === 'm' && v.age < 65, t: 'info' },
          { c: ['Young woman, elderly man', '0.5'], when: (v) => (v.sex === 'f' && v.age < 65) || (v.sex === 'm' && v.age >= 65), t: 'info' },
          { c: ['Elderly woman', '0.45'], when: (v) => v.sex === 'f' && v.age >= 65, t: 'info' },
        ],
      }],
      example: { v: { sex: 'm', age: 40, weight: 70 }, expect: { tbw: 42 } },
    },
    {
      id: 'fwd', title: 'Free-water deficit (hypernatraemia)', short: 'H₂O deficit',
      tags: ['hypernatraemia', 'hypernatremia', 'free water', 'water deficit'],
      inputs: ['na', 'tbw'],
      outputs: [
        { id: 'fwdL', label: 'Free-water deficit', unit: 'L', dp: 1 },
        { id: 'fwdDays', label: 'Minimum time at ≤ 10 mmol/L/day', unit: 'days', dp: 1 },
      ],
      calc: (v) => {
        if (v.na <= 140) return { _err: 'Sodium is not above 140: no free-water deficit.' };
        return { fwdL: v.tbw * (v.na / 140 - 1), fwdDays: (v.na - 140) / 10 };
      },
      formula: 'Water deficit (L) = TBW × ( [[[Na^+] || 140]] − 1 )',
      use: 'How much free water to give, plus ongoing losses.',
      tables: [{
        cols: ['Hypernatraemia', 'Maximum correction'], rows: [
          { c: ['Chronic (> 48 h) or unknown', '≤ 10–12 mmol/L per 24 h'] },
          { c: ['Acute (< 48 h)', '1–2 mmol/L per hour acceptable'] },
        ],
      }],
      example: { v: { na: 160, sex: 'm', age: 40, weight: 70 }, text: '70 kg man, Na 160 → ≈ 6 L.', expect: { fwdL: 6 } },
    },
    {
      id: 'wex', title: 'Water excess (hyponatraemia)', short: 'H₂O excess',
      tags: ['hyponatraemia', 'hyponatremia', 'water excess', 'siadh'],
      inputs: ['na', 'tbw'],
      outputs: [{ id: 'wexL', label: 'Water excess', unit: 'L', dp: 1 }],
      calc: (v) => {
        if (v.na >= 140) return { _err: 'Sodium is not below 140: no water excess.' };
        return { wexL: v.tbw * (1 - v.na / 140) };
      },
      formula: 'Water excess (L) = TBW × ( 1 − [[[Na^+] || 140]] )',
      use: 'Size of the problem in hyponatraemia.',
      tables: [{
        cols: ['Hyponatraemia type', 'First approach'], rows: [
          { c: ['Hypovolaemic', '0.9% NaCl or balanced crystalloid'] },
          { c: ['Euvolaemic (SIADH)', 'Fluid restriction; urea or tolvaptan'] },
          { c: ['Hypervolaemic (heart failure, cirrhosis)', 'Restriction, diuretics, treat the cause'] },
          { c: ['Severe symptoms (seizure, coma)', '3% NaCl 150 mL over 20 min, repeat to +5 mmol/L'] },
        ],
      }],
      example: { v: { na: 120, sex: 'm', age: 40, weight: 70 }, text: '70 kg man, Na 120 → ≈ 6 L excess.', expect: { wexL: 6 } },
    },
    {
      id: 'adrogue', title: 'Adrogué–Madias: sodium change per litre', short: 'ΔNa/L',
      tags: ['adrogue', 'madias', 'hyponatraemia', 'hypertonic saline', 'correction'],
      inputs: ['na', 'tbw', 'infusate', 'infK', 'naRise'], optional: ['infK', 'naRise'],
      outputs: [
        { id: 'dNaL', label: 'Change in Na⁺ per litre', unit: 'mmol/L', dp: 1 },
        { id: 'litres', label: 'Volume for the desired change', unit: 'L', dp: 2 },
      ],
      calc: (v) => {
        const d = (Number(v.infusate) + (v.infK || 0) - v.na) / (v.tbw + 1);
        const r = { dNaL: d };
        if (v.naRise != null) {
          const want = (v.na < 140 ? 1 : -1) * Math.abs(v.naRise);
          r.litres = want / d > 0 ? want / d : null;
          if (r.litres == null) r._msgs = ['This infusate moves sodium the other way.'];
        }
        return r;
      },
      formula: 'Δ[Na^+] per litre = [[([Na^+]_inf + [K^+]_inf) − [Na^+]_serum || TBW + 1]]',
      use: 'Predict the sodium change from 1 L of a fluid.',
      tables: [{
        cols: ['Hyponatraemia correction', 'Limit'], rows: [
          { c: ['Standard risk', '≤ 10 mmol/L in the first 24 h'] },
          { c: ['High risk of osmotic demyelination (Na ≤ 105, alcohol, malnutrition, hypokalaemia, advanced liver disease)', '≤ 8 mmol/L in 24 h'] },
          { c: ['Overshoot', 'Re-lower with 5% dextrose ± desmopressin'] },
        ],
      }],
      notes: ['Ignores ongoing urine and other losses: recheck sodium every 2–4 h.'],
      example: { v: { na: 115, sex: 'm', age: 40, weight: 70, infusate: '513' }, text: '70 kg man, Na 115, 1 L of 3% NaCl → +9.3 mmol/L.', expect: { dNaL: 9.3 } },
    },
    {
      id: 'efwc', title: 'Electrolyte-free water clearance', short: 'CeH₂O',
      tags: ['free water clearance', 'sodium', 'urine'],
      inputs: ['urineVolDay', 'uNa', 'uK', 'na'],
      outputs: [{ id: 'efwcV', label: 'C_{e,H₂O}', unit: 'L/day', dp: 2 }],
      calc: (v) => ({ efwcV: v.urineVolDay * (1 - (v.uNa + v.uK) / v.na) }),
      formula: 'C_{e,H_2O} = V × ( 1 − [[U_Na + U_K || P_Na]] )',
      use: 'Predict where the sodium is heading from urine losses.',
      tables: [{
        cols: ['Result', 'Meaning'], rows: [
          { c: ['> 0', 'Kidney losing free water → Na will rise'], gt: 0, t: 'info' },
          { c: ['< 0', 'Kidney retaining free water → Na will fall'], le: 0, t: 'info' },
        ],
      }],
      example: { v: { urineVolDay: 3, uNa: 40, uK: 30, na: 140 }, expect: { efwcV: 1.5 } },
    },
    {
      id: 'furst', title: 'Urine-to-plasma electrolyte ratio (Furst)', short: 'Furst',
      tags: ['siadh', 'fluid restriction', 'furst'],
      inputs: ['uNa', 'uK', 'na'],
      outputs: [{ id: 'furstV', label: 'Ratio', unit: '', dp: 2 }],
      calc: (v) => ({ furstV: (v.uNa + v.uK) / v.na }),
      formula: 'Ratio = [[U_Na + U_K || P_Na]]',
      use: 'How strict fluid restriction must be in SIADH.',
      tables: [{
        cols: ['Ratio', 'Fluid restriction'], rows: [
          { c: ['< 0.5', '≤ 1 L/day'], lt: 0.5, t: 'ok' },
          { c: ['0.5–1', '≤ 500 mL/day'], ge: 0.5, le: 1, t: 'mid' },
          { c: ['> 1', 'Will not work → urea, tolvaptan, or loop diuretic + salt'], gt: 1, t: 'bad' },
        ],
      }],
      example: { v: { uNa: 80, uK: 40, na: 125 }, expect: { furstV: 0.96 } },
    },
    {
      id: 'ca_corr', title: 'Calcium corrected for albumin', short: 'Ca corr',
      tags: ['calcium', 'albumin', 'hypocalcaemia', 'ionised'],
      inputs: ['caTot', 'alb', 'caIon'], optional: ['caIon'],
      outputs: [
        { id: 'caCorr', label: 'Corrected calcium', unit: 'mg/dL', dp: 1 },
        { id: 'caCorrMmol', label: 'Corrected calcium', unit: 'mmol/L', dp: 2 },
      ],
      calc: (v) => {
        const c = v.caTot + 0.8 * (4.0 - v.alb);
        return { caCorr: c, caCorrMmol: c / 4 };
      },
      formula: 'Ca_corr = Ca + 0.8 × (4.0 − Alb_{g/dL}) (mg/dL)   Ca_corr = Ca + 0.02 × (40 − Alb_{g/L}) (mmol/L)',
      use: 'Estimate calcium status when ionised Ca is unavailable. Inaccurate in critical illness: measure ionised Ca.',
      tables: [{
        cols: ['Calcium', 'Meaning / action'], multi: true, rows: [
          { c: ['Corrected 8.5–10.5 mg/dL; ionised 1.1–1.3 mmol/L', 'Normal'], when: (v) => v.caCorr >= 8.5 && v.caCorr <= 10.5 && (v.caIon === undefined || (v.caIon >= 1.1 && v.caIon <= 1.3)), t: 'ok' },
          { c: ['Corrected < 8.5 mg/dL', 'Low'], when: (v) => v.caCorr < 8.5, t: 'mid', added: true },
          { c: ['Corrected > 10.5 mg/dL', 'High'], when: (v) => v.caCorr > 10.5, t: 'mid', added: true },
          { c: ['Ionised < 1.0 mmol/L', 'Replace — especially in massive transfusion or citrate use'], when: (v) => v.caIon < 1 && v.caIon >= 0.8, t: 'bad' },
          { c: ['Ionised < 0.8 mmol/L', 'Severe: arrhythmia, ↓ contractility, coagulopathy'], when: (v) => v.caIon < 0.8, t: 'bad' },
        ],
      }],
      example: { v: { caTot: 7.6, alb: 2 }, expect: { caCorr: 9.2 } },
    },
    {
      id: 'ca_ratio', title: 'Total-to-ionised calcium ratio', short: 'Ca tot/ion',
      tags: ['citrate', 'citrate accumulation', 'crrt', 'rca'],
      inputs: ['caTot', 'caIon'],
      outputs: [{ id: 'caRatio', label: 'Ca total / ionised', unit: '', dp: 2 }],
      calc: (v) => ({ caRatio: v.caTot / 4 / v.caIon }),
      formula: 'Ratio = [[Ca_total || Ca_ionised]]   (both in mmol/L)',
      use: 'Detect citrate accumulation during regional citrate anticoagulation.',
      tables: [{
        cols: ['Ratio', 'Meaning / action'], rows: [
          { c: ['≤ 2.5', 'Citrate metabolised normally'], le: 2.5, t: 'ok' },
          { c: ['> 2.5', 'Citrate accumulation (liver failure, shock) → reduce citrate or blood flow, change anticoagulant'], gt: 2.5, t: 'bad' },
        ],
      }],
      example: { v: { caTot: 10.8, caIon: 0.9 }, expect: { caRatio: 3 } },
    },
    {
      id: 'k_ph', title: 'Potassium after a pH change', short: 'K⁺ / pH',
      tags: ['potassium', 'ph', 'shift', 'dka', 'insulin'],
      inputs: ['k', 'ph', 'phNew'],
      outputs: [{ id: 'kNew', label: 'Expected K⁺', unit: 'mmol/L', dp: 1 }],
      calc: (v) => ({ kNew: v.k - 0.6 * ((v.phNew - v.ph) / 0.1) }),
      formula: 'ΔK^+ ≈ 0.6 mmol/L per 0.1 change in pH (opposite direction)',
      use: 'Anticipate potassium shifts when the pH changes. Largest in mineral (hyperchloraemic) acidosis.',
      tables: [
        {
          of: 'kNew', cols: ['Expected K⁺', 'Meaning'], rows: [
            { c: ['< 3.5', 'Hypokalaemia expected → replace early'], lt: 3.5, t: 'bad', added: true },
            { c: ['3.5–5.0', 'Normal range'], ge: 3.5, le: 5, t: 'ok', added: true },
            { c: ['> 5.0', 'Hyperkalaemia expected'], gt: 5, t: 'bad', added: true },
          ],
        },
        {
          title: 'Situations', cols: ['Situation', 'Potassium'], rows: [
            { c: ['Mineral (hyperchloraemic) acidosis', '↑ ≈ 0.6 per 0.1 pH fall'] },
            { c: ['Lactic or ketoacidosis', 'Small shift'] },
            { c: ['Correcting acidosis (insulin, bicarbonate, ventilation)', 'Falls — replace early (e.g. DKA)'] },
          ],
        },
      ],
      example: { v: { k: 4.5, ph: 7.1, phNew: 7.3 }, expect: { kNew: 3.3 } },
    },
    {
      id: 'k_def', title: 'Potassium deficit (rough)', short: 'K⁺ deficit',
      tags: ['hypokalaemia', 'hypokalemia', 'potassium replacement'],
      inputs: ['k'],
      outputs: [
        { id: 'kDefLo', label: 'Deficit, low estimate', unit: 'mmol', dp: 0 },
        { id: 'kDefHi', label: 'Deficit, high estimate', unit: 'mmol', dp: 0 },
      ],
      calc: (v) => {
        if (v.k >= 4) return { _err: 'K⁺ is 4.0 or higher: no deficit by this rule.' };
        return { kDefLo: 200 * (4 - v.k), kDefHi: 400 * (4 - v.k) };
      },
      formula: 'Deficit ≈ 200–400 mmol per 1 mmol/L fall below 4.0   (70 kg adult)',
      use: 'Expect large replacement needs and recheck often.',
      tables: [{
        cols: ['Serum K⁺ (mmol/L)', 'Approximate total deficit'], rows: [
          { c: ['3.0', '200–400 mmol'] }, { c: ['2.0', '400–800 mmol'] },
        ],
      }],
      example: { v: { k: 3 }, expect: { kDefLo: 200, kDefHi: 400 } },
    },
  ]);

  ICU.defArea({
    id: 'lytes', title: 'Electrolytes and osmolality', code: 'Na<sup>+</sup>',
    blurb: 'Osmolality and gaps, sodium and water, calcium and potassium.',
    sections: [
      { title: 'Osmolality', items: ['osm', 'osmgap', 'osmeff'] },
      { title: 'Sodium and water', items: ['tbw', 'na_glu', 'fwd', 'wex', 'adrogue', 'efwc', 'furst'] },
      { title: 'Calcium and potassium', items: ['ca_corr', 'ca_ratio', 'k_ph', 'k_def'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
