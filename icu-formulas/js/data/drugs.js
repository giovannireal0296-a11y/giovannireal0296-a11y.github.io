/* Body size, drug dosing and infusion maths. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  // Units of the drug in the syringe: [label, kind, factor to the kind's base unit].
  const AMT = {
    ug: ['µg', 'mass', 1e-3], mg: ['mg', 'mass', 1], g: ['g', 'mass', 1000],
    iu: ['IU', 'iu', 1], mmol: ['mmol', 'mmol', 1],
  };
  // Dose units: [label, kind, factor to base, per kg, multiplier to "per hour"].
  const DOSE = {
    ugkgmin: ['µg/kg/min', 'mass', 1e-3, true, 60],
    ugkgh: ['µg/kg/h', 'mass', 1e-3, true, 1],
    ngkgmin: ['ng/kg/min', 'mass', 1e-6, true, 60],
    mgkgmin: ['mg/kg/min', 'mass', 1, true, 60],
    mgkgh: ['mg/kg/h', 'mass', 1, true, 1],
    mgkgday: ['mg/kg/day', 'mass', 1, true, 1 / 24],
    ugmin: ['µg/min', 'mass', 1e-3, false, 60],
    ugh: ['µg/h', 'mass', 1e-3, false, 1],
    mgmin: ['mg/min', 'mass', 1, false, 60],
    mgh: ['mg/h', 'mass', 1, false, 1],
    mgday: ['mg/day', 'mass', 1, false, 1 / 24],
    gh: ['g/h', 'mass', 1000, false, 1],
    iukgh: ['IU/kg/h', 'iu', 1, true, 1],
    iuh: ['IU/h', 'iu', 1, false, 1],
    iumin: ['IU/min', 'iu', 1, false, 60],
    mmolkgh: ['mmol/kg/h', 'mmol', 1, true, 1],
    mmolh: ['mmol/h', 'mmol', 1, false, 1],
  };
  const KIND = { mass: 'a mass (µg, mg, g)', iu: 'units (IU)', mmol: 'mmol' };
  const perKg = (v) => !!(DOSE[v.doseUnit] && DOSE[v.doseUnit][3]);
  // Drug per hour, in mg, IU or mmol, for a dose expressed in unit u.
  const perHour = (dose, u, kg) => dose * DOSE[u][2] * (DOSE[u][3] ? kg : 1) * DOSE[u][4];

  // Concentration and hourly amount in readable units (µg below 1 mg).
  function readable(conc, hour, kind) {
    if (kind !== 'mass') {
      const u = kind === 'iu' ? 'IU' : 'mmol';
      return { concOut: conc, _concUnit: u + '/mL', hourOut: hour, _hourUnit: u + '/h' };
    }
    return {
      concOut: conc < 1 ? conc * 1000 : conc, _concUnit: conc < 1 ? 'µg/mL' : 'mg/mL',
      hourOut: hour < 1 ? hour * 1000 : hour, _hourUnit: hour < 1 ? 'µg/h' : 'mg/h',
    };
  }
  function mismatch(v) {
    const a = AMT[v.amtUnit][1];
    const d = DOSE[v.doseUnit][1];
    return a === d ? null : `The syringe holds ${KIND[a]} but the dose is in ${DOSE[v.doseUnit][0]}: use the same kind of unit for both.`;
  }

  ICU.defVars({
    rate: { label: 'Infusion rate', unit: 'mL/h', min: 0.01, max: 1000 },
    drugAmt: { label: 'Drug in the syringe or bag', unitVar: 'amtUnit', min: 0.001, max: 1e6, hint: 'Total amount of drug, e.g. 4 mg of noradrenaline.' },
    amtUnit: { label: 'Unit of the drug', type: 'choice', options: Object.entries(AMT).map(([k, a]) => [k, a[0]]), dflt: 'mg' },
    drugVol: { label: 'Total volume after dilution', unit: 'mL', min: 0.5, max: 2000, hint: 'Drug plus diluent: 4 mg made up to 50 mL → 50.' },
    doseVal: { label: 'Desired dose', unitVar: 'doseUnit', min: 0.0001, max: 1e5 },
    doseUnit: { label: 'Dose unit', type: 'choice', options: Object.entries(DOSE).map(([k, d]) => [k, d[0]]), dflt: 'ugkgmin' },
    drugName: {
      label: 'Drug (for the interpretation)', type: 'choice',
      options: [['nor', 'Noradrenaline'], ['adr', 'Adrenaline'], ['dob', 'Dobutamine'], ['other', 'Other']],
    },
    vd: { label: 'Volume of distribution (V_d)', unit: 'L', min: 1, max: 1000 },
    clDrug: { label: 'Clearance (CL)', unit: 'L/h', min: 0.05, max: 100 },
    cTarget: { label: 'Target concentration', unit: 'mg/L', min: 0.01, max: 500 },
    dailyDose: { label: 'Total daily vancomycin dose', unit: 'mg/day', min: 250, max: 8000 },
    mic: { label: 'MIC', unit: 'mg/L', dflt: 1, min: 0.125, max: 8 },
  });

  const norRows = [
    { c: ['< 0.1', 'Low dose'], when: (v) => v.drugName === 'nor' && v.doseOut < 0.1, t: 'ok' },
    { c: ['0.1–0.25', 'Moderate'], when: (v) => v.drugName === 'nor' && v.doseOut >= 0.1 && v.doseOut < 0.25, t: 'mid' },
    { c: ['0.25–0.5', 'High → add vasopressin; hydrocortisone if ≥ 0.25 for ≥ 4 h (SSC 2021)'], when: (v) => v.drugName === 'nor' && v.doseOut >= 0.25 && v.doseOut <= 0.5, t: 'bad' },
    { c: ['> 0.5–1.0', 'Refractory shock'], when: (v) => v.drugName === 'nor' && v.doseOut > 0.5, t: 'bad' },
  ];
  const examples = {
    title: 'Examples (concentrations vary by local protocol)', cols: ['Drug (concentration)', 'Dose', 'Rate for 70 kg'], rows: [
      { c: ['Noradrenaline 4 mg/50 mL (80 µg/mL)', '0.1 µg/kg/min', '5.25 mL/h'] },
      { c: ['Adrenaline 4 mg/50 mL (80 µg/mL)', '0.05 µg/kg/min', '2.6 mL/h'] },
      { c: ['Dobutamine 250 mg/50 mL (5000 µg/mL)', '5 µg/kg/min', '4.2 mL/h'] },
    ],
  };

  ICU.defFormulas('drugs', [
    {
      id: 'ibw', title: 'Ideal body weight (Devine)', short: 'IBW',
      tags: ['ideal body weight', 'devine', 'dosing weight', 'pbw'],
      inputs: ['sex', 'height'],
      outputs: [{ id: 'ibwV', label: 'IBW', unit: 'kg', dp: 1 }],
      calc: (v) => ({ ibwV: (v.sex === 'm' ? 50 : 45.5) + 0.91 * (v.height - 152.4) }),
      formula: 'IBW_men = 50 + 0.91 × (H − 152.4)   IBW_women = 45.5 + 0.91 × (H − 152.4)   (H in cm; same as PBW)',
      use: 'Reference weight for ventilation and for some drugs in obesity.',
      tables: [{
        title: 'Which weight for which drug', cols: ['Weight to use', 'Typical examples (check drug-specific guidance)'], rows: [
          { c: ['IBW / PBW', 'Tidal volume; rocuronium; protein target in obesity'] },
          { c: ['Lean body weight', 'Propofol and thiopental induction; fentanyl, remifentanil'] },
          { c: ['Adjusted body weight', 'Aminoglycosides; energy target in some guidelines'] },
          { c: ['Actual weight', 'Succinylcholine; enoxaparin; vancomycin loading dose'] },
        ],
      }],
      example: { v: { sex: 'f', height: 165 }, expect: { ibwV: 57 } },
    },
    {
      id: 'adjbw', title: 'Adjusted body weight', short: 'AdjBW',
      tags: ['obesity', 'dosing weight', 'aminoglycoside'],
      inputs: ['pbw', 'weight'],
      outputs: [
        { id: 'adjbw', label: 'AdjBW', unit: 'kg', dp: 1 },
        { id: 'abwRatio', label: 'Actual / IBW', unit: '', dp: 2 },
      ],
      calc: (v) => ({ adjbw: v.pbw + 0.4 * (v.weight - v.pbw), abwRatio: v.weight / v.pbw }),
      formula: 'AdjBW = IBW + 0.4 × (actual weight − IBW)',
      use: 'Dosing weight for partly lipophilic drugs in obesity.',
      tables: [{
        of: 'abwRatio', cols: ['Actual / IBW', 'Use'], rows: [
          { c: ['< 1.2', 'Actual weight is fine'], lt: 1.2, t: 'ok' },
          { c: ['≥ 1.2–1.3', 'Switch to adjusted weight where the drug requires it'], ge: 1.2, t: 'mid' },
        ],
      }],
      example: { v: { sex: 'm', height: 174, weight: 120 }, text: 'IBW 70 kg, actual 120 kg → 90 kg.', expect: { adjbw: 89.8 } },
    },
    {
      id: 'lbw', title: 'Lean body weight (Janmahasatian)', short: 'LBW',
      tags: ['lean body mass', 'obesity', 'induction', 'propofol', 'opioid'],
      inputs: ['sex', 'weight', 'bmi'],
      outputs: [
        { id: 'lbwV', label: 'LBW', unit: 'kg', dp: 1 },
        { id: 'lbwPct', label: 'LBW / actual weight', unit: '%', dp: 0 },
      ],
      calc: (v) => {
        const lbw = v.sex === 'm' ? (9270 * v.weight) / (6680 + 216 * v.bmi) : (9270 * v.weight) / (8780 + 244 * v.bmi);
        return { lbwV: lbw, lbwPct: (100 * lbw) / v.weight };
      },
      formula: 'LBW_men = [[9270 × W || 6680 + 216 × BMI]]   LBW_women = [[9270 × W || 8780 + 244 × BMI]]',
      use: 'Induction and opioid dosing in obesity.',
      tables: [{
        title: 'For orientation', cols: ['BMI', 'LBW / actual weight (men, approx.)'], rows: [
          { c: ['25', '≈ 75%'] }, { c: ['40', '≈ 60%'] },
        ],
      }],
      example: { v: { sex: 'm', weight: 120, height: 175 }, text: 'Man 120 kg, 175 cm (BMI 39) → LBW ≈ 73 kg.', expect: { lbwV: 73.5 } },
    },
    {
      id: 'bsa', title: 'Body surface area', short: 'BSA',
      tags: ['bsa', 'mosteller', 'dubois', 'indexing'],
      inputs: ['height', 'weight'],
      outputs: [
        { id: 'bsa', label: 'BSA (Mosteller)', unit: 'm²', dp: 2 },
        { id: 'bsaDb', label: 'BSA (DuBois)', unit: 'm²', dp: 2 },
      ],
      calc: (v) => ({
        bsa: Math.sqrt((v.height * v.weight) / 3600),
        bsaDb: 0.007184 * Math.pow(v.weight, 0.425) * Math.pow(v.height, 0.725),
      }),
      formula: 'BSA_Mosteller = √[[H × W || 3600]]   BSA_DuBois = 0.007184 × W^{0.425} × H^{0.725}',
      use: 'Indexing haemodynamics (CI, SVI, SVRI, DO₂I), chemotherapy, platelet increments. The app uses Mosteller elsewhere.',
      tables: [{
        of: 'bsa', cols: ['BSA (m²)', 'Typical adult'], rows: [
          { c: ['≈ 1.6', 'Small woman'], lt: 1.7, t: 'info' },
          { c: ['1.8–1.9', 'Average adult'], ge: 1.7, le: 2.2, t: 'info' },
          { c: ['> 2.2', 'Large or obese adult'], gt: 2.2, t: 'info' },
        ],
      }],
      example: { v: { height: 175, weight: 70 }, text: '175 cm, 70 kg → 1.84 m².', expect: { bsa: 1.84 } },
    },
    {
      id: 'inf_rate', title: 'Infusion rate (mL/h) from a dose', short: 'mL/h',
      tags: ['infusion', 'pump', 'syringe', 'dilution', 'rate', 'ml/h', 'noradrenaline', 'norepinephrine', 'vasopressor',
        'µg/kg/min', 'mcg/kg/min', 'µg/kg/h', 'mcg/kg/h', 'mg/h', 'iu/h', 'heparin', 'insulin', 'potassium', 'sedation', 'dose'],
      inputs: ['drugAmt', 'amtUnit', 'drugVol', 'doseVal', 'doseUnit', 'weight', 'drugName'],
      optional: ['weight', 'drugName'],
      inputsIf: { weight: perKg },
      outputs: [
        { id: 'rateOut', label: 'Set the pump to', unit: 'mL/h', dp: 2 },
        { id: 'concOut', label: 'Concentration', unitFn: (v) => v._concUnit },
        { id: 'hourOut', label: 'Drug per hour', unitFn: (v) => v._hourUnit },
        { id: 'lasts', label: 'Syringe or bag lasts', unit: 'h', dp: 1 },
      ],
      calc: (v) => {
        const bad = mismatch(v);
        if (bad) return { _err: bad };
        const conc = (v.drugAmt * AMT[v.amtUnit][2]) / v.drugVol;
        const hour = perHour(v.doseVal, v.doseUnit, v.weight);
        const rate = hour / conc;
        const r = Object.assign({ rateOut: rate, lasts: v.drugVol / rate }, readable(conc, hour, DOSE[v.doseUnit][1]));
        // Same dose in µg/kg/min, for the noradrenaline table.
        if (DOSE[v.doseUnit][1] === 'mass' && v.weight) r.doseOut = (hour * 1000) / 60 / v.weight;
        if (rate > 0 && rate < 0.5) r._msgs = ['Below 0.5 mL/h many pumps are inaccurate: consider a more dilute syringe.'];
        return r;
      },
      formula: 'Rate (mL/h) = [[drug per hour || concentration]]   Concentration = [[drug in the syringe || total volume]]',
      use: 'Set any infusion. Enter what is in the syringe or bag, the total volume after dilution and the dose you want, in the unit you use (µg/kg/min, µg/kg/h, mg/h, IU/h, mmol/h…). Weight is asked only for per-kg doses.',
      tables: [{ title: 'Noradrenaline (choose it below the dose to highlight)', of: 'doseOut', cols: ['Noradrenaline (µg/kg/min)', 'Meaning / action'], rows: norRows }, examples],
      notes: ['Check which weight the drug uses (actual, ideal or adjusted) before a per-kg dose in obesity.'],
      example: {
        v: { drugAmt: 4, amtUnit: 'mg', drugVol: 50, doseVal: 0.1, doseUnit: 'ugkgmin', weight: 70, drugName: 'nor' },
        text: 'Noradrenaline 4 mg/50 mL at 0.1 µg/kg/min for 70 kg → 5.25 mL/h.',
        expect: { rateOut: 5.25, concOut: 80, lasts: 9.5 },
      },
      see: ['inf_dose', 'adjbw', 'lbw'],
    },
    {
      id: 'inf_dose', title: 'Dose from an infusion rate', short: 'Dose',
      tags: ['infusion', 'pump', 'noradrenaline', 'norepinephrine', 'vasopressor', 'dose check', 'µg/kg/min', 'mcg', 'mg/h', 'iu/h'],
      inputs: ['rate', 'drugAmt', 'amtUnit', 'drugVol', 'doseUnit', 'weight', 'drugName'],
      optional: ['weight', 'drugName'],
      inputsIf: { weight: perKg },
      outputs: [
        { id: 'doseCalc', label: 'Dose delivered', unitFn: (v) => DOSE[v.doseUnit][0] },
        { id: 'concOut', label: 'Concentration', unitFn: (v) => v._concUnit },
        { id: 'hourOut', label: 'Drug per hour', unitFn: (v) => v._hourUnit },
      ],
      calc: (v) => {
        const bad = mismatch(v);
        if (bad) return { _err: bad };
        const conc = (v.drugAmt * AMT[v.amtUnit][2]) / v.drugVol;
        const hour = v.rate * conc;
        const r = Object.assign({ doseCalc: hour / perHour(1, v.doseUnit, v.weight) }, readable(conc, hour, DOSE[v.doseUnit][1]));
        if (DOSE[v.doseUnit][1] === 'mass' && v.weight) r.doseOut = (hour * 1000) / 60 / v.weight;
        return r;
      },
      formula: 'Dose = [[rate (mL/h) × concentration || weight × time factor]]',
      use: 'Check what a running infusion is actually delivering, in the unit you choose.',
      tables: [{ title: 'Noradrenaline (choose it below to highlight)', of: 'doseOut', cols: ['Noradrenaline (µg/kg/min)', 'Meaning / action'], rows: norRows }, examples],
      example: { v: { rate: 10, drugAmt: 4, amtUnit: 'mg', drugVol: 50, doseUnit: 'ugkgmin', weight: 70, drugName: 'nor' }, expect: { doseCalc: 0.19 } },
      see: ['inf_rate'],
    },
    {
      id: 'pk', title: 'Loading dose, maintenance and half-life', short: 'PK',
      tags: ['pharmacokinetics', 'loading dose', 'half-life', 'clearance', 'volume of distribution'],
      inputs: ['vd', 'clDrug', 'cTarget'],
      outputs: [
        { id: 'loadDose', label: 'Loading dose', unit: 'mg', dp: 0 },
        { id: 'maint', label: 'Maintenance rate', unit: 'mg/h', dp: 1 },
        { id: 'thalf', label: 't½', unit: 'h', dp: 1 },
        { id: 'tss', label: 'Time to steady state (≈ 4–5 t½)', unit: 'h', dp: 0 },
      ],
      calc: (v) => {
        const t = (0.693 * v.vd) / v.clDrug;
        return { loadDose: v.vd * v.cTarget, maint: v.clDrug * v.cTarget, thalf: t, tss: 4.5 * t };
      },
      formula: 'Loading dose = V_d × C_target   Maintenance = CL × C_ss   t_{½} = [[0.693 × V_d || CL]]',
      use: 'Adapt doses to critical-illness physiology. Steady state comes after about 4–5 half-lives.',
      tables: [{
        cols: ['Change', 'Consequence'], rows: [
          { c: ['V_d ↑ (sepsis, fluid overload, ECMO, oedema)', 'Bigger loading dose'] },
          { c: ['CL ↑ (augmented renal clearance)', 'Higher or more frequent maintenance doses'] },
          { c: ['CL ↓ (AKI, liver failure)', 'Lower maintenance; loading dose unchanged'] },
          { c: ['Long t½', 'Slow to reach steady state and slow to wash out'] },
        ],
      }],
      example: { v: { vd: 50, clDrug: 5, cTarget: 20 }, expect: { loadDose: 1000, maint: 100, thalf: 6.9 } },
    },
    {
      id: 'vanco', title: 'Vancomycin exposure (AUC₂₄)', short: 'AUC',
      tags: ['vancomycin', 'auc', 'mrsa', 'tdm'],
      inputs: ['dailyDose', 'clDrug', 'mic'],
      outputs: [
        { id: 'aucMic', label: 'AUC₂₄/MIC', unit: '', dp: 0 },
        { id: 'auc', label: 'AUC₂₄', unit: 'mg·h/L', dp: 0 },
      ],
      calc: (v) => {
        const auc = v.dailyDose / v.clDrug;
        return { auc, aucMic: auc / v.mic };
      },
      formula: 'AUC_{24} = [[daily dose (mg) || CL (L/h)]]',
      use: 'AUC-guided vancomycin dosing for MRSA infections. Target AUC₂₄/MIC 400–600 (MIC 1 mg/L).',
      tables: [{
        cols: ['AUC₂₄/MIC', 'Meaning'], rows: [
          { c: ['< 400', 'Under-exposed — failure risk'], lt: 400, t: 'mid' },
          { c: ['400–600', 'Target'], ge: 400, le: 600, t: 'ok' },
          { c: ['> 600', 'Nephrotoxicity risk ↑'], gt: 600, t: 'bad' },
        ],
      }],
      example: { v: { dailyDose: 2000, clDrug: 4, mic: 1 }, expect: { aucMic: 500 } },
    },
  ]);

  ICU.defArea({
    id: 'drugs', title: 'Drugs and body size', code: 'µg/kg',
    blurb: 'Dosing weights, BSA, infusion rates, pharmacokinetics and vancomycin AUC.',
    sections: [
      { title: 'Body size', items: ['ibw', 'adjbw', 'lbw', 'bsa', 'bmi'] },
      { title: 'Infusions and dosing', items: ['inf_rate', 'inf_dose', 'pk', 'vanco'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
