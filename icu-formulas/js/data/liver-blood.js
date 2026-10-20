/* Liver scores, blood and transfusion, burns and ECG. */
(function (root) {
  'use strict';
  const ICU = root.ICU;
  const clamp = ICU.clamp;

  ICU.defVars({
    bili: { label: 'Bilirubin', unit: 'mg/dL', units: [['mg/dL', 1], ['µmol/L', 1 / 17.1]], min: 0.1, max: 60 },
    inr: { label: 'INR', unit: '', min: 0.8, max: 10 },
    dialysis: {
      label: 'Dialysed ≥ 2× or CVVHD ≥ 24 h in the past week?', type: 'choice', options: [['no', 'No'], ['yes', 'Yes']],
    },
    meld: { label: 'MELD', unit: '', derive: 'meld', calc: true, dp: 0 },
    ebv: { label: 'Estimated blood volume (EBV)', unit: 'mL', derive: 'ebv', calc: true, dp: 0 },
    hctTarget: { label: 'Target haematocrit', unit: '%', min: 15, max: 50 },
    hctUnit: { label: 'Haematocrit of the packed cells', unit: '%', dflt: 60, min: 45, max: 80, hint: 'Usually 55–65%.' },
    hctLow: { label: 'Lowest acceptable haematocrit', unit: '%', min: 15, max: 40 },
    bloodLoss: { label: 'Blood loss so far', unit: 'mL', min: 0, max: 30000 },
    pltPre: { label: 'Platelet count before', unit: '×10⁹/L', min: 0, max: 1000 },
    pltPost: { label: 'Platelet count after', unit: '×10⁹/L', min: 0, max: 1000 },
    pltDose: { label: 'Platelets transfused', unit: '×10¹¹', min: 0.5, max: 10, hint: 'An adult dose is roughly 2.5–4 × 10¹¹.' },
    hbTarget: { label: 'Target Hb', unit: 'g/dL', units: [['g/dL', 1], ['g/L', 0.1]], min: 8, max: 16 },
    tbsaBurn: { label: 'Burned area (2nd/3rd degree)', unit: '% TBSA', min: 1, max: 100 },
    burnFormula: { label: 'Formula', type: 'choice', options: [['4', 'Parkland (4 mL/kg/%)'], ['2', 'Modified Brooke (2 mL/kg/%)']] },
    hoursSince: { label: 'Hours since the burn', unit: 'h', min: 0, max: 24, hint: 'Optional: the first half is due 8 h from injury, not from arrival.' },
    qt: { label: 'QT interval', unit: 'ms', min: 200, max: 800 },
  });

  const meldRows = [
    { c: ['≤ 9', '2%', 'Compensated'], lt: 10, t: 'ok' },
    { c: ['10–19', '6%', '≥ 15: refer for transplant assessment'], ge: 10, lt: 20, t: 'mid' },
    { c: ['20–29', '20%', 'High surgical risk'], ge: 20, lt: 30, t: 'bad' },
    { c: ['30–39', '53%', 'Very high'], ge: 30, lt: 40, t: 'bad' },
    { c: ['≥ 40', '71%', 'Extreme'], ge: 40, t: 'bad' },
  ];
  const meldTable = (of) => ({ of, cols: ['Score', '≈ 90-day mortality', 'Meaning'], rows: meldRows.map((r) => Object.assign({ v: `${r.c[2]} (≈ ${r.c[1]} 90-day mortality)` }, r)) });

  ICU.defFormulas('liver', [
    {
      id: 'meld', title: 'MELD', short: 'MELD',
      tags: ['cirrhosis', 'liver', 'transplant', 'tips'],
      inputs: ['bili', 'inr', 'creat', 'dialysis'], optional: ['dialysis'],
      outputs: [{ id: 'meld', label: 'MELD', unit: '', dp: 0 }],
      calc: (v) => {
        const b = Math.max(1, v.bili);
        const i = Math.max(1, v.inr);
        const c = v.dialysis === 'yes' ? 4 : clamp(v.creat, 1, 4);
        return { meld: 3.78 * Math.log(b) + 11.2 * Math.log(i) + 9.57 * Math.log(c) + 6.43 };
      },
      formula: 'MELD = 3.78 ln(bilirubin) + 11.2 ln(INR) + 9.57 ln(creatinine) + 6.43',
      use: 'Prognosis in cirrhosis, transplant priority, surgical and TIPS risk. Values below 1 count as 1; creatinine is capped at 4.0 (4.0 if dialysed).',
      tables: [meldTable('meld')],
      example: { v: { bili: 3, inr: 1.8, creat: 1.5 }, expect: { meld: 21.2 } },
      see: ['meldna', 'meld3'],
    },
    {
      id: 'meldna', title: 'MELD-Na', short: 'MELD-Na',
      tags: ['cirrhosis', 'hyponatraemia', 'liver', 'transplant'],
      inputs: ['meld', 'na'],
      outputs: [{ id: 'meldNa', label: 'MELD-Na', unit: '', dp: 0 }],
      calc: (v) => {
        if (v.meld <= 11) return { meldNa: v.meld, _msgs: ['MELD ≤ 11: the sodium term is not applied.'] };
        const n = clamp(v.na, 125, 137);
        return { meldNa: v.meld + 1.32 * (137 - n) - 0.033 * v.meld * (137 - n) };
      },
      formula: 'MELD-Na = MELD + 1.32 × (137 − Na) − 0.033 × MELD × (137 − Na)',
      use: 'Adds the prognostic weight of hyponatraemia; read with the same bands as MELD. Na is bounded 125–137 mmol/L.',
      tables: [meldTable('meldNa')],
      example: { v: { bili: 3, inr: 1.8, creat: 1.5, na: 128 }, expect: { meldNa: 26.8 } },
    },
    {
      id: 'meld3', title: 'MELD 3.0 (Kim 2021)', short: 'MELD 3.0',
      tags: ['cirrhosis', 'liver', 'transplant', 'albumin', 'women'],
      inputs: ['sex', 'bili', 'na', 'inr', 'creat', 'alb', 'dialysis'], optional: ['dialysis'],
      outputs: [{ id: 'meld3', label: 'MELD 3.0', unit: '', dp: 0 }],
      calc: (v) => {
        const b = Math.max(1, v.bili);
        const i = Math.max(1, v.inr);
        const c = v.dialysis === 'yes' ? 3 : clamp(v.creat, 1, 3);
        const n = clamp(v.na, 125, 137);
        const a = clamp(v.alb, 1.5, 3.5);
        const f = v.sex === 'f' ? 1 : 0;
        const s = 1.33 * f + 4.56 * Math.log(b) + 0.82 * (137 - n) - 0.24 * (137 - n) * Math.log(b) +
          9.09 * Math.log(i) + 11.14 * Math.log(c) + 1.85 * (3.5 - a) - 1.83 * (3.5 - a) * Math.log(c) + 6;
        return { meld3: s };
      },
      formula: 'MELD 3.0 = 1.33 (female) + 4.56 ln(bili) + 0.82 (137 − Na) − 0.24 (137 − Na) ln(bili) + 9.09 ln(INR) + 11.14 ln(Cr) + 1.85 (3.5 − Alb) − 1.83 (3.5 − Alb) ln(Cr) + 6',
      use: 'Current US allocation score (since 2023): corrects the under-scoring of women and adds albumin. Albumin bounded 1.5–3.5 g/dL, creatinine capped at 3.0, Na 125–137.',
      tables: [
        meldTable('meld3'),
        {
          title: 'Compared with MELD-Na', cols: ['Group', 'Effect'], rows: [
            { c: ['Women', 'Higher score (+1.33)'] }, { c: ['Low albumin', 'Higher score'] },
          ],
        },
      ],
      example: { v: { sex: 'f', bili: 3, na: 128, inr: 1.8, creat: 1.5, alb: 2.5 }, expect: { meld3: 28.3 } },
    },
  ]);

  ICU.defFormulas('blood', [
    {
      id: 'ebv', title: 'Estimated blood volume', short: 'EBV',
      tags: ['blood volume', 'lemmens', 'obesity', 'transfusion'],
      inputs: ['sex', 'weight', 'bmi'],
      outputs: [
        { id: 'ebv', label: 'EBV', unit: 'mL', dp: 0 },
        { id: 'ebvKg', label: 'mL/kg used', unit: 'mL/kg', dp: 0 },
      ],
      calc: (v) => {
        const perKg = v.bmi >= 30 ? 70 / Math.sqrt(v.bmi / 22) : v.sex === 'm' ? 70 : 65;
        return { ebv: perKg * v.weight, ebvKg: perKg };
      },
      formula: 'EBV = weight × (mL/kg)   EBV_obese (mL/kg) = [[70 || √(BMI/22)]]   (Lemmens, used from BMI 30)',
      use: 'Base of transfusion and blood-loss calculations. 1 RBC unit ≈ + 1 g/dL Hb (+ 3% Hct) in a 70 kg adult.',
      tables: [{
        cols: ['Patient', 'mL/kg'], noVerdict: true, rows: [
          { c: ['Adult man', '70'], when: (v) => v.sex === 'm' && v.bmi < 30, t: 'info' },
          { c: ['Adult woman', '65'], when: (v) => v.sex === 'f' && v.bmi < 30, t: 'info' },
          { c: ['Obese, BMI 40', '≈ 52 (Lemmens)'], when: (v) => v.bmi >= 30, t: 'info' },
          { c: ['Child / neonate', '75–80 / 80–90'] },
        ],
      }],
      example: { v: { sex: 'm', weight: 70, height: 175 }, expect: { ebv: 4900 } },
    },
    {
      id: 'rbc_vol', title: 'RBC volume to a target haematocrit', short: 'RBC mL',
      tags: ['transfusion', 'red cells', 'haematocrit', 'hematocrit', 'units'],
      inputs: ['ebv', 'hct', 'hctTarget', 'hctUnit'],
      outputs: [
        { id: 'rbcMl', label: 'Packed red cells', unit: 'mL', dp: 0 },
        { id: 'rbcUnits', label: 'Units (≈ 250 mL each)', unit: 'units', dp: 1 },
      ],
      calc: (v) => {
        const ml = (v.ebv * (v.hctTarget - v.hct)) / v.hctUnit;
        if (ml <= 0) return { _err: 'Target haematocrit must be above the current one.' };
        return { rbcMl: ml, rbcUnits: ml / 250 };
      },
      formula: 'V_RBC (mL) = [[EBV × (Hct_target − Hct_current) || Hct_{RBC unit}]]',
      use: 'Plan transfusion volume.',
      tables: [{
        title: 'Usual Hb triggers', cols: ['Hb (g/dL)', 'Usual trigger'], rows: [
          { c: ['< 7', 'Transfuse most ICU patients (restrictive strategy)'] },
          { c: ['< 7.5–8', 'Cardiac surgery; symptomatic coronary disease'] },
          { c: ['≈ 8–10', 'Acute MI (more liberal targets debated, MINT 2023)'] },
        ],
      }],
      example: { v: { sex: 'm', weight: 70, height: 175, hct: 21, hctTarget: 27, hctUnit: 60 }, text: 'EBV 4900 mL, Hct 0.21 → 0.27 → ≈ 490 mL (2 units).', expect: { rbcMl: 490 } },
    },
    {
      id: 'mabl', title: 'Maximal allowable blood loss', short: 'MABL',
      tags: ['blood loss', 'surgery', 'bleeding', 'massive transfusion'],
      inputs: ['ebv', 'hct', 'hctLow', 'bloodLoss'], optional: ['bloodLoss'],
      outputs: [{ id: 'mablV', label: 'MABL', unit: 'mL', dp: 0 }],
      calc: (v) => ({ mablV: (v.ebv * (v.hct - v.hctLow)) / v.hct }),
      formula: 'MABL = [[EBV × (Hct_initial − Hct_{lowest acceptable}) || Hct_initial]]',
      use: 'When to start transfusing during bleeding or surgery. Add the loss so far to see where you are.',
      tables: [{
        cols: ['Blood loss', 'Action'], rows: [
          { c: ['< MABL', 'Crystalloid / colloid replacement'], when: (v) => v.bloodLoss < v.mablV, t: 'ok' },
          { c: ['≥ MABL', 'Transfuse RBC'], when: (v) => v.bloodLoss >= v.mablV && !(v.bloodLoss > v.ebv), t: 'mid' },
          { c: ['> 1 EBV in 24 h (massive)', 'Ratio 1:1:1, keep ionised Ca > 1.1, viscoelastic testing'], when: (v) => v.bloodLoss > v.ebv, t: 'bad' },
        ],
      }],
      example: { v: { sex: 'm', weight: 70, height: 175, hct: 40, hctLow: 25 }, text: 'EBV 4900, Hct 0.40 → 0.25 → ≈ 1.8 L.', expect: { mablV: 1838 } },
    },
    {
      id: 'cci', title: 'Platelet corrected count increment', short: 'CCI',
      tags: ['platelets', 'refractoriness', 'hla', 'transfusion'],
      inputs: ['pltPre', 'pltPost', 'bsa', 'pltDose'],
      outputs: [{ id: 'cciV', label: 'CCI', unit: '', dp: 1 }],
      calc: (v) => ({ cciV: ((v.pltPost - v.pltPre) * v.bsa) / v.pltDose }),
      formula: 'CCI = [[(post − pre count) × BSA || platelets transfused]]   (×10⁹/L, m², ×10¹¹)',
      use: 'Detect platelet refractoriness; check 1 h after the transfusion.',
      tables: [{
        cols: ['CCI', 'Meaning'], rows: [
          { c: ['> 7.5 at 1 h', 'Adequate'], gt: 7.5, t: 'ok' },
          { c: ['< 7.5 at 1 h, twice', 'Immune refractoriness (HLA) → HLA-matched platelets'], le: 7.5, t: 'bad' },
          { c: ['Good at 1 h, poor at 24 h', 'Consumption: sepsis, DIC, splenomegaly, bleeding'] },
        ],
      }],
      example: { v: { pltPre: 10, pltPost: 30, height: 175, weight: 70, pltDose: 3 }, expect: { cciV: 12.3 } },
    },
    {
      id: 'iron', title: 'Iron deficit (Ganzoni)', short: 'Iron',
      tags: ['iron', 'anaemia', 'anemia', 'ganzoni', 'iv iron'],
      inputs: ['weight', 'hb', 'hbTarget'],
      outputs: [{ id: 'ironMg', label: 'Total iron dose', unit: 'mg', dp: 0 }],
      calc: (v) => ({ ironMg: v.weight * (v.hbTarget - v.hb) * 2.4 + 500 }),
      formula: 'Iron deficit (mg) = weight × (Hb_target − Hb_actual) × 2.4 + 500   (stores ≈ 500 mg)',
      use: 'Total IV iron dose.',
      tables: [{
        title: 'Iron deficiency if', cols: ['Lab', 'Iron deficiency if'], rows: [
          { c: ['Ferritin', '< 100 µg/L (< 300 with TSAT < 20% when inflamed)'] },
          { c: ['Transferrin saturation', '< 20%'] },
        ],
      }],
      example: { v: { weight: 70, hb: 8, hbTarget: 13 }, text: '70 kg, Hb 8 → 13 → ≈ 1340 mg.', expect: { ironMg: 1340 } },
    },
  ]);

  ICU.defFormulas('burns', [
    {
      id: 'parkland', title: 'Burns resuscitation (Parkland)', short: 'Parkland',
      tags: ['burns', 'parkland', 'brooke', 'fluid', 'ringer'],
      inputs: ['weight', 'tbsaBurn', 'burnFormula', 'hoursSince'], optional: ['burnFormula', 'hoursSince'],
      outputs: [
        { id: 'pkTotal', label: "Ringer's lactate in 24 h", unit: 'mL', dp: 0 },
        { id: 'pkRate1', label: 'Rate, first 8 h from injury', unit: 'mL/h', dp: 0 },
        { id: 'pkRate2', label: 'Rate, next 16 h', unit: 'mL/h', dp: 0 },
        { id: 'pkCatch', label: 'Rate to finish the first half on time', unit: 'mL/h', dp: 0 },
      ],
      calc: (v) => {
        const k = v.burnFormula ? Number(v.burnFormula) : 4;
        const total = k * v.weight * v.tbsaBurn;
        const r = { pkTotal: total, pkRate1: total / 2 / 8, pkRate2: total / 2 / 16 };
        if (v.hoursSince != null && v.hoursSince > 0 && v.hoursSince < 8) {
          r.pkCatch = total / 2 / (8 - v.hoursSince);
          r._msgs = ['Subtract any fluid already given before arrival from the first half.'];
        }
        if (v.tbsaBurn < 20) (r._msgs = r._msgs || []).push('Formula resuscitation is for ≥ 20% TBSA (2nd/3rd degree).');
        return r;
      },
      formula: 'Volume (mL) = 4 × weight (kg) × %TBSA   (modified Brooke: 2 mL)',
      use: 'Starting rate only: half in the first 8 h from injury, then titrate to urine output.',
      tables: [{
        title: 'Titrate to urine output (adult)', cols: ['Urine output', 'Action'], rows: [
          { c: ['< 0.5 mL/kg/h', '↑ rate ≈ 20%'] },
          { c: ['0.5–1 mL/kg/h', 'Keep'] },
          { c: ['> 1 mL/kg/h', '↓ rate (avoid fluid creep)'] },
          { c: ['Electrical injury / myoglobinuria', 'Aim ≈ 1–1.5 mL/kg/h'] },
        ],
      }],
      example: { v: { weight: 70, tbsaBurn: 40 }, text: '70 kg, 40% → 11.2 L: 700 mL/h for 8 h, then 350 mL/h.', expect: { pkTotal: 11200, pkRate1: 700, pkRate2: 350 } },
    },
    {
      id: 'qtc', title: 'Corrected QT', short: 'QTc',
      tags: ['qt', 'qtc', 'bazett', 'fridericia', 'torsade', 'ecg'],
      inputs: ['qt', 'hr', 'sex'], optional: ['sex'],
      outputs: [
        { id: 'qtcF', label: 'QTc Fridericia', unit: 'ms', dp: 0 },
        { id: 'qtcB', label: 'QTc Bazett', unit: 'ms', dp: 0 },
        { id: 'rrSec', label: 'RR interval', unit: 's', dp: 2 },
      ],
      calc: (v) => {
        const rr = 60 / v.hr;
        return { rrSec: rr, qtcB: v.qt / Math.sqrt(rr), qtcF: v.qt / Math.cbrt(rr) };
      },
      formula: 'QT_{c,Bazett} = [[QT || √RR]]   QT_{c,Fridericia} = [[QT || ∛RR]]   (RR = 60/HR, in s)',
      use: 'Drug safety (antiarrhythmics, antipsychotics, antiemetics, macrolides). Bazett overcorrects at fast rates; the reading uses Fridericia.',
      tables: [{
        of: 'qtcF', cols: ['QTc (ms)', 'Meaning / action'], rows: [
          { c: ['< 450 men, < 460 women', 'Normal'], when: (v) => v.qtcF < (v.sex === 'f' ? 460 : 450), t: 'ok' },
          { c: ['450–500', 'Prolonged → review drugs, K⁺, Mg²⁺'], when: (v) => v.qtcF >= (v.sex === 'f' ? 460 : 450) && v.qtcF <= 500, t: 'mid' },
          { c: ['> 500, or ↑ > 60 from baseline', 'Torsade risk → stop QT drugs, Mg²⁺, K⁺ > 4'], gt: 500, t: 'bad' },
        ],
      }],
      example: { v: { qt: 400, hr: 100 }, text: 'QT 400 ms at HR 100 → 516 (Bazett) vs 474 ms (Fridericia).', expect: { qtcB: 516, qtcF: 474 } },
    },
  ]);

  ICU.defArea({
    id: 'liver', title: 'Liver', code: 'MELD',
    blurb: 'MELD, MELD-Na and MELD 3.0.',
    sections: [{ title: 'Scores', items: ['meld', 'meldna', 'meld3'] }],
  });
  ICU.defArea({
    id: 'blood', title: 'Blood and transfusion', code: 'Hb',
    blurb: 'Blood volume, red-cell volume, allowable loss, platelet increment and iron.',
    sections: [{ title: 'Transfusion', items: ['ebv', 'rbc_vol', 'mabl', 'cci', 'iron'] }],
  });
  ICU.defArea({
    id: 'burns', title: 'Burns and ECG', code: 'QTc',
    blurb: 'Parkland resuscitation and corrected QT.',
    sections: [
      { title: 'Burns', items: ['parkland'] },
      { title: 'ECG', items: ['qtc'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
