/* Renal function and renal replacement therapy (CRRT and intermittent HD). */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    creatBase: { label: 'Baseline creatinine', unit: 'mg/dL', units: [['mg/dL', 1], ['µmol/L', 1 / 88.4]], min: 0.2, max: 15 },
    rise48: {
      label: 'Rise ≥ 0.3 mg/dL (26.5 µmol/L) within 48 h?', type: 'choice', options: [['no', 'No'], ['yes', 'Yes']],
    },
    onRrt: { label: 'Started on RRT?', type: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
    targetDose: { label: 'Target effluent dose', unit: 'mL/kg/h', dflt: 25, min: 10, max: 50 },
    qd: { label: 'Dialysate flow (Q_d)', unit: 'mL/h', min: 0, max: 6000, dflt: 0 },
    qrPre: { label: 'Pre-filter replacement (Q_{rep,pre})', unit: 'mL/h', min: 0, max: 6000, dflt: 0 },
    qrPost: { label: 'Post-filter replacement (Q_{rep,post})', unit: 'mL/h', min: 0, max: 6000, dflt: 0 },
    qnetuf: { label: 'Net ultrafiltration (Q_{net UF})', unit: 'mL/h', min: 0, max: 1000, dflt: 0 },
    qb: { label: 'Blood flow (Q_b)', unit: 'mL/min', min: 50, max: 500 },
    crrtDose: { label: 'Delivered effluent dose', unit: 'mL/kg/h', derive: 'crrt_dose', calc: true, dp: 1 },
    qp: { label: 'Plasma flow (Q_p)', unit: 'mL/h', derive: 'qp', calc: true, dp: 0 },
    ureaPre: { label: 'Pre-dialysis urea', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 6.006]], min: 10, max: 500 },
    ureaPost: { label: 'Post-dialysis urea', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 6.006]], min: 2, max: 400 },
    hdHours: { label: 'Session length', unit: 'h', min: 1, max: 12 },
    ufL: { label: 'Ultrafiltration volume', unit: 'L', min: 0, max: 8 },
    weightPost: { label: 'Post-dialysis weight', unit: 'kg', min: 25, max: 300 },
  });

  const crclRows = [
    { c: ['≥ 130', 'Augmented renal clearance → ↑ doses of renally cleared antibiotics'], ge: 130, t: 'mid' },
    { c: ['90–130', 'Normal'], ge: 90, lt: 130, t: 'ok' },
    { c: ['60–90', 'Mildly reduced'], ge: 60, lt: 90, t: 'info', added: true },
    { c: ['30–60', 'Moderate impairment → adjust doses'], ge: 30, lt: 60, t: 'mid' },
    { c: ['15–30', 'Severe impairment'], ge: 15, lt: 30, t: 'bad' },
    { c: ['< 15', 'Kidney failure'], lt: 15, t: 'bad' },
  ];

  ICU.defFormulas('renal', [
    {
      id: 'crcl_meas', title: 'Measured creatinine clearance', short: 'CrCl',
      tags: ['creatinine clearance', 'urine collection', 'augmented renal clearance', 'arc', 'gfr'],
      inputs: ['uCr', 'urineVol', 'hours', 'creat'],
      outputs: [{ id: 'crclM', label: 'CrCl', unit: 'mL/min', dp: 0 }],
      calc: (v) => ({ crclM: (v.uCr * (v.urineVol / (v.hours * 60))) / v.creat }),
      formula: 'CrCl = [[U_Cr × V || P_Cr]]   (V in mL/min = urine volume ÷ minutes)',
      use: 'Real GFR estimate in unstable patients; detects augmented clearance. A 2–8 h collection is acceptable in ICU (handout normal 74–160 mL/min).',
      tables: [{ cols: ['CrCl (mL/min)', 'Meaning / action'], rows: crclRows }],
      example: { v: { uCr: 100, urineVol: 600, hours: 6, creat: 1 }, expect: { crclM: 166.7 } },
    },
    {
      id: 'cg', title: 'Cockcroft–Gault', short: 'CG',
      tags: ['creatinine clearance', 'drug dosing', 'renal dosing'],
      inputs: ['age', 'weight', 'creat', 'sex'],
      outputs: [{ id: 'crclCG', label: 'CrCl', unit: 'mL/min', dp: 0 }],
      calc: (v) => ({ crclCG: (((140 - v.age) * v.weight) / (72 * v.creat)) * (v.sex === 'f' ? 0.85 : 1) }),
      formula: 'CrCl = [[(140 − age) × weight (kg) || 72 × S_Cr (mg/dL)]]   (× 0.85 for women)',
      use: 'Drug dosing: most drug labels use it. Not valid when creatinine is changing (AKI).',
      tables: [{
        cols: ['CrCl (mL/min)', 'Typical dosing'], rows: [
          { c: ['> 50', 'Full dose'], gt: 50, t: 'ok' },
          { c: ['30–50', 'Reduce many renally cleared drugs'], ge: 30, le: 50, t: 'mid' },
          { c: ['10–30', 'Reduce further'], ge: 10, lt: 30, t: 'bad' },
          { c: ['< 10', 'Dose as for dialysis'], lt: 10, t: 'bad' },
        ],
      }],
      notes: ['The handout uses lean body weight; in obesity use ideal or adjusted weight.', 'SI: (140 − age) × weight × 1.23 (men) or 1.04 (women) ÷ S_Cr (µmol/L) — the app converts units for you.'],
      example: { v: { age: 60, weight: 72, creat: 1, sex: 'm' }, expect: { crclCG: 80 } },
    },
    {
      id: 'ckdepi', title: 'CKD-EPI 2021 (race-free)', short: 'eGFR',
      tags: ['egfr', 'ckd', 'chronic kidney disease', 'gfr'],
      inputs: ['creat', 'age', 'sex'],
      outputs: [{ id: 'egfr', label: 'eGFR', unit: 'mL/min/1.73 m²', dp: 0 }],
      calc: (v) => {
        const f = v.sex === 'f';
        const kappa = f ? 0.7 : 0.9;
        const alpha = f ? -0.241 : -0.302;
        const r = v.creat / kappa;
        return { egfr: 142 * Math.pow(Math.min(r, 1), alpha) * Math.pow(Math.max(r, 1), -1.2) * Math.pow(0.9938, v.age) * (f ? 1.012 : 1) };
      },
      formula: 'eGFR = 142 × min(S_Cr/κ, 1)^α × max(S_Cr/κ, 1)^{−1.200} × 0.9938^{age} × 1.012 [female]',
      use: 'Staging chronic kidney disease in stable patients; not valid in AKI. κ = 0.7 (women) / 0.9 (men); α = −0.241 (women) / −0.302 (men).',
      tables: [{
        cols: ['eGFR', 'CKD stage'], rows: [
          { c: ['≥ 90', 'G1'], ge: 90, t: 'ok' },
          { c: ['60–89', 'G2'], ge: 60, lt: 90, t: 'ok' },
          { c: ['45–59', 'G3a'], ge: 45, lt: 60, t: 'mid' },
          { c: ['30–44', 'G3b'], ge: 30, lt: 45, t: 'mid' },
          { c: ['15–29', 'G4'], ge: 15, lt: 30, t: 'bad' },
          { c: ['< 15', 'G5'], lt: 15, t: 'bad' },
        ],
      }],
      example: { v: { creat: 1, age: 50, sex: 'm' }, expect: { egfr: 91 } },
    },
    {
      id: 'kdigo', title: 'AKI stage (KDIGO)', short: 'KDIGO',
      tags: ['aki', 'acute kidney injury', 'kdigo', 'creatinine', 'staging'],
      inputs: ['creatBase', 'creat', 'rise48', 'onRrt'], optional: ['rise48', 'onRrt'],
      outputs: [
        { id: 'crRatio', label: 'Creatinine / baseline', unit: '×', dp: 2 },
        { id: 'akiStage', label: 'KDIGO stage (creatinine)', unit: '', dp: 0 },
      ],
      calc: (v) => {
        const ratio = v.creat / v.creatBase;
        let stage = 0;
        if (v.onRrt === 'yes' || ratio >= 3 || v.creat >= 4) stage = 3;
        else if (ratio >= 2) stage = 2;
        else if (ratio >= 1.5 || v.rise48 === 'yes') stage = 1;
        return { crRatio: ratio, akiStage: stage };
      },
      formula: 'Ratio = [[S_Cr || baseline S_Cr]]',
      use: 'Stage AKI by creatinine. Read it together with urine output (the higher stage wins).',
      tables: [{
        of: 'akiStage', cols: ['Stage', 'Serum creatinine', 'Urine output'], rows: [
          { c: ['0', 'Below the AKI criteria', '—'], le: 0, t: 'ok', added: true, v: 'No AKI by creatinine' },
          { c: ['1', '1.5–1.9 × baseline in 7 days, or ↑ ≥ 0.3 mg/dL (26.5 µmol/L) in 48 h', '< 0.5 mL/kg/h for 6–12 h'], ge: 1, lt: 2, t: 'mid', v: 'AKI stage 1' },
          { c: ['2', '2.0–2.9 × baseline', '< 0.5 mL/kg/h for ≥ 12 h'], ge: 2, lt: 3, t: 'bad', v: 'AKI stage 2' },
          { c: ['3', '≥ 3.0 × baseline, or ≥ 4.0 mg/dL (353.6 µmol/L), or RRT', '< 0.3 mL/kg/h for ≥ 24 h, or anuria ≥ 12 h'], ge: 3, t: 'bad', v: 'AKI stage 3' },
        ],
      }],
      example: { v: { creatBase: 1, creat: 2.4 }, expect: { akiStage: 2 } },
      see: ['uo'],
    },
    {
      id: 'uo', title: 'Urine output', short: 'UO',
      tags: ['oliguria', 'urine output', 'aki', 'kdigo', 'diuresis'],
      inputs: ['urineVol', 'weight', 'hours'],
      outputs: [{ id: 'uoV', label: 'Urine output', unit: 'mL/kg/h', dp: 2 }],
      calc: (v) => ({ uoV: v.urineVol / (v.weight * v.hours) }),
      formula: 'UO (mL/kg/h) = [[urine volume (mL) || weight (kg) × hours]]',
      use: 'KDIGO staging together with creatinine.',
      tables: [{
        cols: ['Urine output', 'KDIGO criterion'], rows: [
          { c: ['≥ 0.5 mL/kg/h', 'Not oliguric'], ge: 0.5, t: 'ok', added: true },
          { c: ['< 0.5 mL/kg/h for 6–12 h', 'Stage 1'], when: (v) => v.uoV < 0.5 && v.uoV >= 0.3 && v.hours < 12, t: 'mid' },
          { c: ['< 0.5 mL/kg/h for ≥ 12 h', 'Stage 2'], when: (v) => v.uoV < 0.5 && (v.hours >= 12 && !(v.uoV < 0.3 && v.hours >= 24)), t: 'bad' },
          { c: ['< 0.3 mL/kg/h for ≥ 24 h, or anuria ≥ 12 h', 'Stage 3'], when: (v) => (v.uoV < 0.3 && v.hours >= 24) || (v.uoV === 0 && v.hours >= 12), t: 'bad' },
          { c: ['< 0.3 mL/kg/h, shorter period', 'Very low — reassess and continue to monitor'], when: (v) => v.uoV < 0.3 && v.hours < 12, t: 'bad', added: true },
        ],
      }],
      example: { v: { urineVol: 200, weight: 80, hours: 6 }, expect: { uoV: 0.42 } },
    },
    {
      id: 'fena', title: 'Fractional excretion of sodium', short: 'FENa',
      tags: ['prerenal', 'atn', 'aki', 'urine sodium'],
      inputs: ['uNa', 'creat', 'na', 'uCr'],
      outputs: [{ id: 'fenaV', label: 'FENa', unit: '%', dp: 2 }],
      calc: (v) => ({ fenaV: (100 * v.uNa * v.creat) / (v.na * v.uCr) }),
      formula: 'FE_Na (%) = [[U_Na × P_Cr || P_Na × U_Cr]] × 100',
      use: 'Prerenal versus tubular injury in oliguric AKI. Invalid after diuretics (use FEUrea).',
      tables: [{
        cols: ['FENa', 'Meaning'], rows: [
          { c: ['< 1%', 'Prerenal (also hepatorenal, contrast, early obstruction, rhabdomyolysis)'], lt: 1, t: 'info' },
          { c: ['1–2%', 'Indeterminate'], ge: 1, le: 2, t: 'mid' },
          { c: ['> 2%', 'Tubular injury (ATN)'], gt: 2, t: 'bad' },
        ],
      }],
      example: { v: { uNa: 20, creat: 2, na: 140, uCr: 100 }, expect: { fenaV: 0.29 } },
    },
    {
      id: 'feurea', title: 'Fractional excretion of urea', short: 'FEUrea',
      tags: ['prerenal', 'atn', 'diuretics', 'aki'],
      inputs: ['uUreaN', 'creat', 'bun', 'uCr'],
      outputs: [{ id: 'feureaV', label: 'FEUrea', unit: '%', dp: 0 }],
      calc: (v) => ({ feureaV: (100 * v.uUreaN * v.creat) / (v.bun * v.uCr) }),
      formula: 'FE_Urea (%) = [[U_Urea × P_Cr || P_Urea × U_Cr]] × 100',
      use: 'Same question as FENa, but usable on diuretics.',
      tables: [{
        cols: ['FEUrea', 'Meaning'], rows: [
          { c: ['< 35%', 'Prerenal'], lt: 35, t: 'info' },
          { c: ['35–50%', 'Indeterminate'], ge: 35, le: 50, t: 'mid' },
          { c: ['> 50%', 'Intrinsic (ATN)'], gt: 50, t: 'bad' },
        ],
      }],
      example: { v: { uUreaN: 500, creat: 2, bun: 40, uCr: 100 }, expect: { feureaV: 25 } },
    },

    // CRRT
    {
      id: 'crrt_rx', title: 'Effluent rate for a target dose', short: 'CRRT Rx',
      tags: ['crrt', 'cvvh', 'cvvhdf', 'prescription', 'effluent'],
      inputs: ['targetDose', 'weight'],
      outputs: [{ id: 'effRate', label: 'Effluent rate to prescribe', unit: 'mL/h', dp: 0 }],
      calc: (v) => ({ effRate: v.targetDose * v.weight }),
      formula: 'Effluent (mL/h) = dose (mL/kg/h) × weight (kg)',
      use: 'Prescribe a CRRT dose. Prescribe 25–30 mL/kg/h to deliver 20–25 after downtime.',
      tables: [{
        of: 'targetDose', cols: ['Prescribed dose (mL/kg/h)', 'Meaning'], rows: [
          { c: ['< 25', 'Likely to under-deliver after downtime'], lt: 25, t: 'mid', added: true },
          { c: ['25–30', 'Usual prescription'], ge: 25, le: 30, t: 'ok' },
          { c: ['30–35', 'Above the usual prescription'], gt: 30, le: 35, t: 'info', added: true },
          { c: ['> 35', 'No added benefit; more drug and electrolyte loss'], gt: 35, t: 'mid' },
        ],
      }],
      example: { v: { targetDose: 25, weight: 80 }, text: '80 kg × 25 mL/kg/h = 2000 mL/h effluent.', expect: { effRate: 2000 } },
    },
    {
      id: 'crrt_dose', title: 'CRRT effluent dose', short: 'CRRT dose',
      tags: ['crrt', 'dose', 'effluent', 'cvvhdf', 'audit'],
      inputs: ['qd', 'qrPre', 'qrPost', 'qnetuf', 'weight'],
      outputs: [{ id: 'crrtDose', label: 'Effluent dose', unit: 'mL/kg/h', dp: 1 }],
      calc: (v) => ({ crrtDose: (v.qd + v.qrPre + v.qrPost + v.qnetuf) / v.weight }),
      formula: 'Dose (mL/kg/h) = [[Q_dialysate + Q_replacement + Q_{net UF} || weight]]',
      use: 'Audit the delivered CRRT dose. Enter 0 for flows that are not running.',
      tables: [{
        cols: ['Delivered dose (mL/kg/h)', 'Meaning'], rows: [
          { c: ['< 20', 'Under-dosed'], lt: 20, t: 'bad' },
          { c: ['20–25', 'Target (prescribe 25–30 to cover downtime)'], ge: 20, le: 25, t: 'ok' },
          { c: ['25–35', 'Above target'], gt: 25, le: 35, t: 'info', added: true },
          { c: ['> 35', 'No added benefit; more drug and electrolyte loss'], gt: 35, t: 'mid' },
        ],
      }],
      example: { v: { qd: 1000, qrPre: 600, qrPost: 400, qnetuf: 100, weight: 80 }, expect: { crrtDose: 26.3 } },
    },
    {
      id: 'qp', hidden: true, title: 'Plasma flow', short: 'Qp',
      inputs: ['qb', 'hct'],
      outputs: [{ id: 'qp', label: 'Q_p', unit: 'mL/h', dp: 0 }],
      calc: (v) => ({ qp: v.qb * 60 * (1 - v.hct / 100) }),
      formula: 'Q_p = Q_b × (1 − Hct)   (× 60 for mL/h)',
      use: 'Plasma flow through the filter.',
    },
    {
      id: 'predil', title: 'Pre-dilution correction', short: 'Pre-dil',
      tags: ['crrt', 'pre-dilution', 'predilution', 'effective dose'],
      inputs: ['crrtDose', 'qp', 'qrPre'],
      outputs: [
        { id: 'doseEff', label: 'Effective dose', unit: 'mL/kg/h', dp: 1 },
        { id: 'predilF', label: 'Dilution factor', unit: '', dp: 2 },
      ],
      calc: (v) => {
        const f = v.qp / (v.qp + v.qrPre);
        return { predilF: f, doseEff: v.crrtDose * f };
      },
      formula: 'Dose_effective = Dose × [[Q_p || Q_p + Q_{rep,pre}]]   Q_p = Q_b × (1 − Hct)',
      use: 'Pre-filter replacement dilutes the blood, so the real dose is lower.',
      tables: [
        {
          of: 'doseEff', cols: ['Effective dose (mL/kg/h)', 'Meaning'], rows: [
            { c: ['< 20', 'Under-dosed'], lt: 20, t: 'bad' },
            { c: ['20–25', 'Target'], ge: 20, le: 25, t: 'ok' },
            { c: ['> 25', 'Above target'], gt: 25, t: 'info', added: true },
          ],
        },
        {
          title: 'Replacement site', cols: ['Site', 'Effect'], rows: [
            { c: ['Pre-filter', 'Dose ↓ 10–20%, filter life ↑'] },
            { c: ['Post-filter', 'Full dose, more filter clotting'] },
          ],
        },
      ],
      example: { v: { qd: 1000, qrPre: 1000, qrPost: 0, qnetuf: 0, weight: 80, qb: 150, hct: 30 }, text: 'Q_b 150 mL/min, Hct 0.30, pre-dilution 1000 mL/h → factor 0.86.', expect: { predilF: 0.86 } },
    },
    {
      id: 'ff', title: 'Filtration fraction', short: 'FF',
      tags: ['crrt', 'filter clotting', 'haemoconcentration', 'filtration fraction'],
      inputs: ['qrPre', 'qrPost', 'qnetuf', 'qp'],
      outputs: [{ id: 'ffV', label: 'Filtration fraction', unit: '%', dp: 0 }],
      calc: (v) => ({ ffV: (100 * (v.qrPre + v.qrPost + v.qnetuf)) / (v.qp + v.qrPre) }),
      formula: 'FF = [[Q_{rep,pre} + Q_{rep,post} + Q_{net UF} || Q_p + Q_{rep,pre}]]   (all flows in mL/h)',
      use: 'Predicts filter clotting from haemoconcentration.',
      tables: [{
        cols: ['FF', 'Meaning / action'], rows: [
          { c: ['< 20%', 'Good'], lt: 20, t: 'ok' },
          { c: ['20–25%', 'Upper limit'], ge: 20, le: 25, t: 'mid' },
          { c: ['> 25%', 'Clotting risk → ↑ blood flow or move replacement pre-filter'], gt: 25, t: 'bad' },
        ],
      }],
      example: { v: { qrPre: 0, qrPost: 1500, qnetuf: 100, qb: 150, hct: 30 }, text: 'Q_p 6300 mL/h, post-filter 1500 + net UF 100 mL/h → 25%.', expect: { ffV: 25.4 } },
    },

    // Intermittent HD
    {
      id: 'urr', title: 'Urea reduction ratio', short: 'URR',
      tags: ['haemodialysis', 'hemodialysis', 'adequacy', 'urea'],
      inputs: ['ureaPre', 'ureaPost'],
      outputs: [{ id: 'urrV', label: 'URR', unit: '%', dp: 0 }],
      calc: (v) => ({ urrV: (100 * (v.ureaPre - v.ureaPost)) / v.ureaPre }),
      formula: 'URR (%) = [[Urea_pre − Urea_post || Urea_pre]] × 100',
      use: 'Quick adequacy check of one intermittent haemodialysis session.',
      tables: [{
        cols: ['URR', 'Meaning'], rows: [
          { c: ['≥ 65%', 'Adequate'], ge: 65, t: 'ok' },
          { c: ['< 65%', 'Inadequate → longer or more frequent sessions, check access recirculation'], lt: 65, t: 'bad' },
        ],
      }],
      example: { v: { ureaPre: 150, ureaPost: 45 }, expect: { urrV: 70 } },
    },
    {
      id: 'ktv', title: 'Single-pool Kt/V (Daugirdas II)', short: 'Kt/V',
      tags: ['haemodialysis', 'hemodialysis', 'adequacy', 'daugirdas'],
      inputs: ['ureaPre', 'ureaPost', 'hdHours', 'ufL', 'weightPost'],
      outputs: [{ id: 'ktvV', label: 'spKt/V', unit: '', dp: 2 }],
      calc: (v) => {
        const R = v.ureaPost / v.ureaPre;
        return { ktvV: -Math.log(R - 0.008 * v.hdHours) + (4 - 3.5 * R) * (v.ufL / v.weightPost) };
      },
      formula: 'spKt/V = −ln(R − 0.008 × t) + (4 − 3.5 × R) × [[UF || W]]   (R = post/pre urea, t in h, UF in L, W post-dialysis kg)',
      use: 'Standard dialysis adequacy measure.',
      tables: [{
        cols: ['spKt/V per session (3 × week)', 'Meaning'], rows: [
          { c: ['≥ 1.4', 'Target'], ge: 1.4, t: 'ok' },
          { c: ['1.2–1.4', 'Minimum acceptable'], ge: 1.2, lt: 1.4, t: 'mid' },
          { c: ['< 1.2', 'Inadequate'], lt: 1.2, t: 'bad' },
        ],
      }],
      example: { v: { ureaPre: 150, ureaPost: 45, hdHours: 4, ufL: 2, weightPost: 70 }, expect: { ktvV: 1.40 } },
    },
  ]);

  ICU.defArea({
    id: 'renal', title: 'Kidney and CRRT', code: 'RRT',
    blurb: 'Clearance and eGFR, AKI staging, urine indices, CRRT dose and filter, dialysis adequacy.',
    sections: [
      { title: 'Renal function and AKI', items: ['crcl_meas', 'cg', 'ckdepi', 'kdigo', 'uo', 'fena', 'feurea'] },
      { title: 'CRRT', items: ['crrt_rx', 'crrt_dose', 'predil', 'ff', 'ca_ratio'] },
      { title: 'Intermittent haemodialysis', items: ['urr', 'ktv'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
