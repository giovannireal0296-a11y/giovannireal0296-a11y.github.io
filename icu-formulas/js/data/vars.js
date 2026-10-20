/* Variables shared by several areas. Canonical units are the ones the formulas
   use; `units` lists what the user may type instead ([label, factor to canonical],
   first entry = shown by default). Saturations are in %, FiO2 is a fraction. */
(function (root) {
  'use strict';
  const ICU = root.ICU;
  const kPa = [['mmHg', 1], ['kPa', 7.50062]];

  ICU.defVars({
    // Patient
    sex: { label: 'Sex', type: 'choice', options: [['m', 'Male'], ['f', 'Female']] },
    age: { label: 'Age', unit: 'years', min: 14, max: 110 },
    height: { label: 'Height', unit: 'cm', min: 120, max: 230 },
    weight: { label: 'Weight (actual)', unit: 'kg', min: 25, max: 300 },
    pbw: { label: 'Predicted (ideal) body weight', unit: 'kg', derive: 'pbw', calc: true, dp: 1 },
    bmi: { label: 'BMI', unit: 'kg/m²', derive: 'bmi', calc: true, dp: 1 },
    bsa: { label: 'Body surface area', unit: 'm²', derive: 'bsa', calc: true, dp: 2 },
    tbw: { label: 'Total body water', unit: 'L', derive: 'tbw', calc: true, dp: 1 },

    // Ventilator
    vt: { label: 'Tidal volume (V_T)', unit: 'mL', min: 100, max: 1500 },
    rr: { label: 'Respiratory rate', unit: '/min', min: 4, max: 60 },
    peepSet: { label: 'Set PEEP', unit: 'cmH₂O', min: 0, max: 30 },
    peepTot: {
      label: 'Total PEEP (PEEP_tot)', unit: 'cmH₂O', min: 0, max: 35,
      hint: 'End-expiratory hold value. Without intrinsic PEEP it equals set PEEP.',
    },
    pplat: {
      label: 'Plateau pressure (P_plat)', unit: 'cmH₂O', min: 5, max: 60,
      hint: 'End-inspiratory hold of about 0.3 s, patient passive.',
    },
    ppeak: { label: 'Peak pressure (P_peak)', unit: 'cmH₂O', min: 5, max: 80 },
    flow: {
      label: 'Inspiratory flow', unit: 'L/min', min: 10, max: 150,
      hint: 'Constant (square) flow in volume control. 60 L/min = 1 L/s.',
    },
    ve: {
      label: 'Minute ventilation (V̇_E)', unit: 'L/min', derive: 've', calc: false, dp: 1, min: 1, max: 40,
      hint: 'As shown by the ventilator.',
    },
    mpaw: {
      label: 'Mean airway pressure (P̄_aw)', unit: 'cmH₂O', derive: 'mpaw', calc: false, dp: 1, min: 3, max: 50,
      hint: 'As shown by the ventilator.',
    },

    // Gases and oxygen
    fio2: { label: 'FiO₂', unit: 'fraction', units: [['%', 0.01], ['fraction', 1]], min: 0.21, max: 1 },
    patm: {
      label: 'Barometric pressure', unit: 'mmHg', units: kPa, dflt: 760, min: 400, max: 800,
      derive: 'pb_alt', calc: false, dp: 0, hint: '760 at sea level.',
    },
    pao2: { label: 'PaO₂', unit: 'mmHg', units: kPa, min: 20, max: 700 },
    paco2: { label: 'PaCO₂', unit: 'mmHg', units: kPa, min: 10, max: 150 },
    pvo2: { label: 'Mixed venous PvO₂', unit: 'mmHg', units: kPa, min: 10, max: 100 },
    sao2: { label: 'SaO₂', unit: '%', min: 40, max: 100 },
    svo2: { label: 'Mixed venous SvO₂', unit: '%', min: 20, max: 95 },
    scvo2: { label: 'Central venous ScvO₂', unit: '%', min: 20, max: 95 },
    pcvo2: { label: 'Central venous PcvO₂', unit: 'mmHg', units: kPa, min: 10, max: 100 },
    pcvco2: { label: 'Central venous PcvCO₂', unit: 'mmHg', units: kPa, min: 15, max: 160 },
    spo2: { label: 'SpO₂', unit: '%', min: 50, max: 100 },
    hb: { label: 'Haemoglobin', unit: 'g/dL', units: [['g/dL', 1], ['g/L', 0.1], ['mmol/L', 1.611]], min: 3, max: 22 },
    pao2Alv: { label: 'Alveolar PO₂ (P_AO₂)', unit: 'mmHg', derive: 'aga', calc: true, dp: 0 },
    cao2: { label: 'Arterial O₂ content (CaO₂)', unit: 'mL/dL', derive: 'cao2', calc: true, dp: 1 },
    cvo2: { label: 'Mixed venous O₂ content (C̄vO₂)', unit: 'mL/dL', derive: 'cvo2', calc: true, dp: 1 },
    lactate: { label: 'Lactate', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 1 / 9]], min: 0.2, max: 30 },

    // Haemodynamics
    hr: { label: 'Heart rate', unit: 'bpm', min: 20, max: 250 },
    sbp: { label: 'Systolic BP', unit: 'mmHg', min: 30, max: 300 },
    dbp: { label: 'Diastolic BP', unit: 'mmHg', min: 10, max: 200 },
    map: {
      label: 'Mean arterial pressure (MAP)', unit: 'mmHg', derive: 'map', calc: false, dp: 0, min: 20, max: 200,
      hint: 'As shown by the monitor.',
    },
    rap: {
      label: 'RAP / CVP', unit: 'mmHg', derive: 'rap_ivc', calc: false, dp: 0, min: -5, max: 35,
      units: [['mmHg', 1], ['cmH₂O', 0.735]],
    },
    pawp: { label: 'PAWP (wedge)', unit: 'mmHg', min: 0, max: 45 },
    mpap: { label: 'Mean PAP (mPAP)', unit: 'mmHg', min: 5, max: 90 },
    spap: { label: 'Systolic PAP (sPAP)', unit: 'mmHg', min: 10, max: 140 },
    dpap: { label: 'Diastolic PAP (dPAP)', unit: 'mmHg', min: 2, max: 70 },
    co: {
      label: 'Cardiac output (CO)', unit: 'L/min', derive: 'co_hrsv', calc: false, dp: 2, min: 0.5, max: 20,
      hint: 'Measured (thermodilution, pulse contour, Doppler).',
    },
    ci: { label: 'Cardiac index (CI)', unit: 'L/min/m²', derive: 'ci', calc: true, dp: 2 },
    sv: { label: 'Stroke volume (SV)', unit: 'mL', derive: 'sv', calc: true, dp: 0, min: 5, max: 200 },
    svi: { label: 'Stroke volume index (SVI)', unit: 'mL/m²', derive: 'svi', calc: true, dp: 0 },
    icp: { label: 'Intracranial pressure (ICP)', unit: 'mmHg', min: -5, max: 100 },
    iap: {
      label: 'Intra-abdominal pressure (IAP)', unit: 'mmHg', units: [['mmHg', 1], ['cmH₂O', 0.735]], min: 0, max: 50,
      hint: 'Bladder, ≤ 25 mL saline, supine, end-expiration, zeroed at the mid-axillary line.',
    },

    // Chemistry
    ph: { label: 'pH', unit: '', min: 6.6, max: 7.9 },
    hco3: { label: 'HCO₃⁻', unit: 'mmol/L', min: 2, max: 60 },
    na: { label: 'Sodium (Na⁺)', unit: 'mmol/L', min: 95, max: 190 },
    k: { label: 'Potassium (K⁺)', unit: 'mmol/L', min: 1, max: 10 },
    cl: { label: 'Chloride (Cl⁻)', unit: 'mmol/L', min: 60, max: 150 },
    alb: { label: 'Albumin', unit: 'g/dL', units: [['g/dL', 1], ['g/L', 0.1]], min: 0.5, max: 6 },
    glucose: { label: 'Glucose', unit: 'mg/dL', units: [['mg/dL', 1], ['mmol/L', 18]], min: 20, max: 2500 },
    bun: {
      label: 'Urea nitrogen (BUN)', unit: 'mg/dL', min: 2, max: 300,
      units: [['mg/dL BUN', 1], ['mg/dL urea', 1 / 2.14], ['mmol/L urea', 2.8]],
      hint: 'Many European labs report urea (azotemia) rather than BUN: pick the matching unit.',
    },
    creat: {
      label: 'Serum creatinine', unit: 'mg/dL', units: [['mg/dL', 1], ['µmol/L', 1 / 88.4]], min: 0.1, max: 20,
    },
    osmMeas: { label: 'Measured osmolality', unit: 'mOsm/kg', min: 200, max: 450 },
    osmCalc: { label: 'Calculated osmolality', unit: 'mOsm/kg', derive: 'osm', calc: true, dp: 0 },
    caIon: { label: 'Ionised calcium', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 0.25]], min: 0.3, max: 2 },

    // Urine
    uNa: { label: 'Urine Na⁺', unit: 'mmol/L', min: 1, max: 300 },
    uK: { label: 'Urine K⁺', unit: 'mmol/L', min: 1, max: 200 },
    uCl: { label: 'Urine Cl⁻', unit: 'mmol/L', min: 1, max: 300 },
    uCr: { label: 'Urine creatinine', unit: 'mg/dL', units: [['mg/dL', 1], ['µmol/L', 1 / 88.4]], min: 5, max: 500 },
    uUreaN: {
      label: 'Urine urea nitrogen', unit: 'mg/dL', units: [['mg/dL N', 1], ['mmol/L urea', 2.8]], min: 50, max: 3000,
    },
    urineVol: { label: 'Urine volume', unit: 'mL', min: 0, max: 15000 },
    hours: { label: 'Collection period', unit: 'h', min: 1, max: 48 },

    // Blood
    hct: { label: 'Haematocrit', unit: '%', min: 10, max: 70 },
  });
})(typeof window !== 'undefined' ? window : globalThis);
