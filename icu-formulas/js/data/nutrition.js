/* Nutrition and metabolism. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    mifflin: { label: 'Mifflin–St Jeor REE', unit: 'kcal/day', derive: 'mifflin', calc: true, dp: 0 },
    tmax: { label: 'Maximum temperature (24 h)', unit: '°C', min: 32, max: 43 },
    vo2cal: { label: 'V̇O₂ (calorimetry)', unit: 'mL/min', min: 50, max: 800 },
    vco2cal: { label: 'V̇CO₂ (calorimetry)', unit: 'mL/min', min: 50, max: 800 },
    phase: { label: 'Phase', type: 'choice', options: [['early', 'Days 1–3 (acute)'], ['late', 'After day 3']] },
    ee: { label: 'Measured or estimated energy expenditure', unit: 'kcal/day', min: 500, max: 5000, hint: 'Optional: calorimetry or an equation. Without it the app uses 20–25 kcal/kg.' },
    protein: { label: 'Protein intake', unit: 'g/day', min: 0, max: 400 },
    uun: { label: 'Urine urea nitrogen (24 h)', unit: 'g/day', min: 0, max: 60 },
    dexPct: { label: 'Dextrose concentration', unit: '%', min: 2.5, max: 70 },
    dexRate: { label: 'Dextrose infusion rate', unit: 'mL/h', min: 0, max: 500 },
    propRate: { label: 'Propofol 1% or 2% infusion', unit: 'mL/h', min: 0, max: 100 },
    citrate: { label: 'Citrate infused (CRRT)', unit: 'mmol/h', min: 0, max: 60 },
  });

  const bmiRows = [
    { c: ['< 18.5', 'Underweight — refeeding risk'], lt: 18.5, t: 'mid' },
    { c: ['18.5–24.9', 'Normal'], ge: 18.5, lt: 25, t: 'ok' },
    { c: ['25–29.9', 'Overweight'], ge: 25, lt: 30, t: 'info' },
    { c: ['30–39.9', 'Obese → protein per kg IBW'], ge: 30, lt: 40, t: 'mid' },
    { c: ['≥ 40', 'Severe obesity → IBW / adjusted weight for nutrition and many drugs'], ge: 40, t: 'bad' },
  ];

  ICU.defFormulas('nutr', [
    {
      id: 'bmi', title: 'Body mass index', short: 'BMI',
      tags: ['bmi', 'obesity', 'malnutrition'],
      inputs: ['weight', 'height'],
      outputs: [{ id: 'bmi', label: 'BMI', unit: 'kg/m²', dp: 1 }],
      calc: (v) => ({ bmi: v.weight / Math.pow(v.height / 100, 2) }),
      formula: 'BMI = [[weight (kg) || height (m)^2]]',
      use: 'Flags malnutrition and decides which weight to use for nutrition and drugs.',
      tables: [{ cols: ['BMI', 'Meaning'], rows: bmiRows }],
      notes: ['The handout prints height in cm; it must be in metres.'],
      example: { v: { weight: 70, height: 175 }, expect: { bmi: 22.9 } },
    },
    {
      id: 'hb_ree', title: 'Harris–Benedict', short: 'HB',
      tags: ['resting energy expenditure', 'ree', 'calories', 'harris benedict'],
      inputs: ['sex', 'weight', 'height', 'age'],
      outputs: [{ id: 'hbRee', label: 'REE', unit: 'kcal/day', dp: 0 }],
      calc: (v) => ({
        hbRee: v.sex === 'm'
          ? 66 + 13.7 * v.weight + 5 * v.height - 6.8 * v.age
          : 65.5 + 9.6 * v.weight + 1.8 * v.height - 4.7 * v.age,
      }),
      formula: 'REE_men = 66 + 13.7 W + 5 H − 6.8 A   REE_women = 65.5 + 9.6 W + 1.8 H − 4.7 A',
      use: 'Classic resting estimate; it overestimates in obesity. Often × 1.0–1.3 for stress; prefer calorimetry.',
      example: { v: { sex: 'm', weight: 70, height: 175, age: 50 }, text: 'Man, 70 kg, 175 cm, 50 y → ≈ 1560 kcal/day.', expect: { hbRee: 1560 } },
      see: ['targets'],
    },
    {
      id: 'mifflin', title: 'Mifflin–St Jeor', short: 'MSJ',
      tags: ['resting energy expenditure', 'ree', 'calories'],
      inputs: ['sex', 'weight', 'height', 'age'],
      outputs: [{ id: 'mifflin', label: 'REE', unit: 'kcal/day', dp: 0 }],
      calc: (v) => ({ mifflin: 10 * v.weight + 6.25 * v.height - 5 * v.age + (v.sex === 'm' ? 5 : -161) }),
      formula: 'REE = 10 W + 6.25 H − 5 A + 5 (men) or − 161 (women)',
      use: 'Best simple equation for non-ventilated patients; input to Penn State.',
      example: { v: { sex: 'm', weight: 70, height: 175, age: 50 }, text: 'Man, 70 kg, 175 cm, 50 y → ≈ 1550 kcal/day.', expect: { mifflin: 1549 } },
      see: ['penn', 'targets'],
    },
    {
      id: 'penn', title: 'Penn State 2003b (ventilated)', short: 'Penn State',
      tags: ['ventilated', 'energy', 'calories', 'penn state'],
      inputs: ['mifflin', 'tmax', 've'],
      outputs: [{ id: 'pennRmr', label: 'RMR', unit: 'kcal/day', dp: 0 }],
      calc: (v) => ({ pennRmr: 0.96 * v.mifflin + 167 * v.tmax + 31 * v.ve - 6212 }),
      formula: 'RMR = 0.96 × Mifflin + 167 × T_max + 31 × V̇_E − 6212   (T_max in °C, V̇_E in L/min)',
      use: 'Most accurate predictive equation in ventilated patients.',
      notes: ['In patients aged 60 or more with BMI ≥ 30, the modified 2010 version is preferred.'],
      example: { v: { sex: 'm', weight: 70, height: 175, age: 50, tmax: 38, ve: 10 }, text: 'Same man, T_max 38 °C, V̇_E 10 L/min → ≈ 1930 kcal/day.', expect: { pennRmr: 1931 } },
      see: ['targets'],
    },
    {
      id: 'weir', title: 'Weir equation (indirect calorimetry)', short: 'Weir',
      tags: ['calorimetry', 'energy expenditure', 'weir'],
      inputs: ['vo2cal', 'vco2cal'],
      outputs: [{ id: 'weirEe', label: 'Energy expenditure', unit: 'kcal/day', dp: 0 }],
      calc: (v) => ({ weirEe: (3.941 * v.vo2cal + 1.106 * v.vco2cal) * 1.44 }),
      formula: 'EE (kcal/day) = (3.941 × V̇O_2 + 1.106 × V̇CO_2) × 1.44   (mL/min)',
      use: 'Energy expenditure from indirect calorimetry, the gold standard.',
      notes: ['The handout omits the × 1.44 needed when V̇O₂ and V̇CO₂ are in mL/min.'],
      example: { v: { vo2cal: 250, vco2cal: 200 }, text: 'V̇O₂ 250, V̇CO₂ 200 mL/min → ≈ 1740 kcal/day.', expect: { weirEe: 1737 } },
      see: ['targets', 'rq'],
    },
    {
      id: 'ee_vco2', title: 'Energy expenditure from ventilator V̇CO₂', short: 'EE·VCO₂',
      tags: ['vco2', 'energy expenditure', 'calories'],
      inputs: ['vco2'],
      outputs: [{ id: 'eeVco2', label: 'Energy expenditure', unit: 'kcal/day', dp: 0 }],
      calc: (v) => ({ eeVco2: 8.19 * v.vco2 }),
      formula: 'EE (kcal/day) ≈ 8.19 × V̇CO_2 (mL/min)',
      use: 'Calorimetry substitute when only V̇CO₂ is available (stable ventilation, no recent changes).',
      example: { v: { vco2: 200 }, text: 'V̇CO₂ 200 mL/min → ≈ 1640 kcal/day.', expect: { eeVco2: 1638 } },
      see: ['targets'],
    },
    {
      id: 'targets', title: 'Energy and protein targets', short: 'Targets',
      tags: ['espen', 'aspen', 'protein', 'calories', 'obesity', 'enteral'],
      inputs: ['weight', 'bmi', 'pbw', 'phase', 'ee'], optional: ['ee'],
      outputs: [
        { id: 'kcal', label: 'Energy target', unit: 'kcal/day', dp: 0, range: true },
        { id: 'prot', label: 'Protein target', unit: 'g/day', dp: 0, range: true },
      ],
      calc: (v) => {
        const early = v.phase === 'early';
        let kcal, prot, rule;
        if (v.bmi > 50) {
          kcal = [22 * v.pbw, 25 * v.pbw];
          prot = [null, 2.5 * v.pbw];
          rule = 'BMI > 50: 22–25 kcal/kg IBW; protein up to 2.5 g/kg IBW';
        } else if (v.bmi >= 30) {
          kcal = [11 * v.weight, 14 * v.weight];
          prot = v.bmi < 40 ? [2.0 * v.pbw, 2.0 * v.pbw] : [2.0 * v.pbw, 2.5 * v.pbw];
          rule = `BMI 30–50: 11–14 kcal/kg actual weight; protein ${v.bmi < 40 ? '2.0' : '2.0–2.5'} g/kg IBW`;
        } else {
          const ee = v.ee != null ? [v.ee, v.ee] : [20 * v.weight, 25 * v.weight];
          const src = v.ee != null ? 'EE' : '20–25 kcal/kg';
          if (early) {
            kcal = [null, 0.7 * ee[1]];
            prot = null;
            rule = `Days 1–3: up to 70% of ${src}; build protein up progressively towards 1.3 g/kg`;
          } else {
            kcal = [0.8 * ee[0], ee[1]];
            prot = [1.2 * v.weight, 2.0 * v.weight];
            rule = `After day 3: 80–100% of ${src}; protein 1.3 g/kg/day (ESPEN), 1.2–2.0 (ASPEN)`;
          }
        }
        if (early && v.bmi >= 30) rule += '. In days 1–3 build up progressively.';
        return { kcal, prot, _rule: rule };
      },
      verdict: (v) => ({ text: v._rule, tone: 'info' }),
      formula: 'Weight-based targets by phase and BMI (ESPEN / ASPEN)',
      use: 'Turn any energy estimate into a daily prescription, and pick the right weight in obesity.',
      tables: [{
        cols: ['Phase / group', 'Energy', 'Protein'], noVerdict: true, rows: [
          { c: ['Days 1–3 (acute)', '≤ 70% of EE (ESPEN)', 'Build up progressively'], when: (v) => v.phase === 'early' && v.bmi < 30, t: 'info' },
          { c: ['After day 3', '80–100% of EE (≈ 20–25 kcal/kg/day)', '1.3 g/kg/day (ESPEN); 1.2–2.0 (ASPEN)'], when: (v) => v.phase === 'late' && v.bmi < 30, t: 'info' },
          { c: ['BMI 30–50', '11–14 kcal/kg actual weight', '2.0 g/kg IBW (BMI 30–40)'], when: (v) => v.bmi >= 30 && v.bmi <= 50, t: 'info' },
          { c: ['BMI > 50', '22–25 kcal/kg IBW', 'Up to 2.5 g/kg IBW'], when: (v) => v.bmi > 50, t: 'info' },
        ],
      }],
      example: { v: { weight: 70, height: 175, sex: 'm', phase: 'late', ee: 1800 }, expect: { kcal: [1440, 1800], prot: [84, 140] } },
    },
    {
      id: 'rq', title: 'Respiratory quotient', short: 'RQ',
      tags: ['respiratory quotient', 'overfeeding', 'calorimetry'],
      inputs: ['vco2cal', 'vo2cal'],
      outputs: [{ id: 'rqV', label: 'RQ', unit: '', dp: 2 }],
      calc: (v) => {
        const rq = v.vco2cal / v.vo2cal;
        const r = { rqV: rq };
        if (rq < 0.67 || rq > 1.3) r._msgs = ['RQ outside 0.67–1.3: suspect a measurement error.'];
        return r;
      },
      formula: 'RQ = [[V̇CO_2 || V̇O_2]]',
      use: 'Which substrate is being burned; also checks calorimetry quality.',
      tables: [{
        cols: ['RQ', 'Fuel'], rows: [
          { c: ['< 0.6', 'Ketones'], lt: 0.65, t: 'info' },
          { c: ['0.7', 'Fat (starvation, underfeeding)'], ge: 0.65, lt: 0.75, t: 'info' },
          { c: ['0.8', 'Protein / mixed'], ge: 0.75, lt: 0.9, t: 'ok' },
          { c: ['1.0', 'Carbohydrate'], ge: 0.9, le: 1.0, t: 'info' },
          { c: ['> 1.0', 'Net lipogenesis — overfeeding → ↓ calories'], gt: 1.0, t: 'bad' },
        ],
      }],
      example: { v: { vco2cal: 200, vo2cal: 250 }, expect: { rqV: 0.8 } },
    },
    {
      id: 'nbal', title: 'Nitrogen balance', short: 'N bal',
      tags: ['nitrogen', 'protein', 'catabolism', 'uun'],
      inputs: ['protein', 'uun'],
      outputs: [{ id: 'nbalV', label: 'Nitrogen balance', unit: 'g/day', dp: 1 }],
      calc: (v) => ({ nbalV: v.protein / 6.25 - (v.uun + 4) }),
      formula: 'N balance = [[protein (g) || 6.25]] − (UUN + 4)',
      use: 'Is protein intake covering catabolism? Unreliable in AKI or on CRRT. 6.25 g protein = 1 g N; + 4 g/day for non-urinary losses.',
      tables: [{
        cols: ['N balance (g/day)', 'Meaning'], rows: [
          { c: ['+ 2 to + 4', 'Anabolic — goal in recovery'], ge: 1, t: 'ok' },
          { c: ['≈ 0', 'Equilibrium'], gt: -1, lt: 1, t: 'info' },
          { c: ['Negative', 'Catabolic → ↑ protein'], le: -1, t: 'bad' },
        ],
      }],
      example: { v: { protein: 100, uun: 12 }, expect: { nbalV: 0 } },
    },
    {
      id: 'gir', title: 'Glucose infusion rate', short: 'GIR',
      tags: ['glucose', 'dextrose', 'parenteral nutrition', 'mg/kg/min'],
      inputs: ['dexPct', 'dexRate', 'weight'],
      outputs: [{ id: 'girV', label: 'GIR', unit: 'mg/kg/min', dp: 1 }],
      calc: (v) => ({ girV: (v.dexPct * v.dexRate * 10) / (60 * v.weight) }),
      formula: 'GIR (mg/kg/min) = [[dextrose (%) × rate (mL/h) × 10 || 60 × weight (kg)]]',
      use: 'Check the glucose load from dextrose infusions and parenteral nutrition.',
      tables: [{
        cols: ['GIR', 'Meaning'], rows: [
          { c: ['< 2', 'Low'], lt: 2, t: 'info', added: true },
          { c: ['2–4', 'Typical adult range'], ge: 2, le: 4, t: 'ok' },
          { c: ['> 4–5', 'Above oxidation capacity → hyperglycaemia, fatty liver, ↑ V̇CO₂'], gt: 4, t: 'bad' },
        ],
      }],
      example: { v: { dexPct: 10, dexRate: 50, weight: 70 }, text: '10% dextrose at 50 mL/h, 70 kg → 1.2 mg/kg/min.', expect: { girV: 1.19 } },
    },
    {
      id: 'kcal_nn', title: 'Non-nutritional calories', short: 'kcal',
      tags: ['propofol', 'dextrose', 'citrate', 'overfeeding', 'calories'],
      inputs: ['propRate', 'dexRate', 'dexPct', 'citrate'], optional: ['propRate', 'dexRate', 'dexPct', 'citrate'],
      outputs: [
        { id: 'kcalNn', label: 'Total', unit: 'kcal/day', dp: 0 },
        { id: 'kcalProp', label: 'Propofol', unit: 'kcal/day', dp: 0 },
        { id: 'kcalDex', label: 'Dextrose', unit: 'kcal/day', dp: 0 },
        { id: 'kcalCit', label: 'Citrate', unit: 'kcal/day', dp: 0 },
      ],
      calc: (v) => {
        const prop = v.propRate != null ? v.propRate * 24 * 1.1 : null;
        const dex = v.dexRate != null && v.dexPct != null ? v.dexRate * 24 * v.dexPct * 0.034 : null;
        const cit = v.citrate != null ? v.citrate * 24 * 0.59 : null;
        if (prop == null && dex == null && cit == null) return { _err: 'Enter at least one infusion.' };
        return { kcalProp: prop, kcalDex: dex, kcalCit: cit, kcalNn: (prop || 0) + (dex || 0) + (cit || 0) };
      },
      formula: 'kcal = grams × energy density',
      use: 'Count non-nutritional calories (propofol, dextrose, citrate) to avoid overfeeding.',
      tables: [{
        title: 'Energy density', cols: ['Source', 'Energy'], rows: [
          { c: ['Carbohydrate (IV dextrose monohydrate)', '3.4 kcal/g (3.4–4.1)'] },
          { c: ['Protein', '4.0 kcal/g (3.3–4.7)'] },
          { c: ['Fat', '9.1 kcal/g (9.1–9.5)'] },
          { c: ['5% dextrose', '170 kcal/L'] },
          { c: ['Lipid emulsion 20%', '2.0 kcal/mL'] },
          { c: ['Propofol 1% (2% has the same lipid content)', '1.1 kcal/mL'] },
          { c: ['Citrate (CRRT)', '≈ 3 kcal/g (0.59 kcal/mmol)'] },
        ],
      }],
      example: { v: { propRate: 20 }, text: 'Propofol 1% at 20 mL/h ≈ 530 kcal/day.', expect: { kcalNn: 528 } },
    },
  ]);

  ICU.defArea({
    id: 'nutr', title: 'Nutrition and metabolism', code: 'kcal',
    blurb: 'Energy equations and calorimetry, targets by BMI, RQ, nitrogen balance, glucose load.',
    sections: [
      { title: 'Energy expenditure', items: ['bmi', 'hb_ree', 'mifflin', 'penn', 'weir', 'ee_vco2'] },
      { title: 'Prescription and monitoring', items: ['targets', 'rq', 'nbal', 'gir', 'kcal_nn'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
