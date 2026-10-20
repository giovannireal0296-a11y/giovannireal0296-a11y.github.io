/* Oxygen transport: content, delivery, consumption, extraction, CO2 gap. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    ccvo2: { label: 'Central venous O₂ content (CcvO₂)', unit: 'mL/dL', derive: 'ccvo2', calc: true, dp: 1 },
    o2content: { label: 'O₂ content', unit: 'mL/dL', min: 2, max: 30 },
    vo2: {
      label: 'O₂ consumption (V̇O₂)', unit: 'mL/min', derive: 'vo2', calc: false, dp: 0, min: 50, max: 800,
      hint: 'Normal 200–250 mL/min (calorimetry, or Fick with a PA catheter).',
    },
    vo2i: {
      label: 'O₂ consumption index (V̇O₂I)', unit: 'mL/min/m²', dflt: 125, min: 60, max: 300,
      hint: 'Often assumed 125 mL/min/m²; imprecise in the critically ill.',
    },
    lac0: { label: 'Initial lactate', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 1 / 9]], min: 0.3, max: 30 },
    lacT: { label: 'Repeat lactate', unit: 'mmol/L', units: [['mmol/L', 1], ['mg/dL', 1 / 9]], min: 0.1, max: 30 },
  });

  const contentRows = [
    { c: ['< 17.5', 'Low content: check Hb first, then SaO₂'], lt: 17.5, t: 'mid', added: true },
    { c: ['17.5–23.5', 'Normal'], ge: 17.5, le: 23.5, t: 'ok', added: true },
    { c: ['> 23.5', 'High (polycythaemia)'], gt: 23.5, t: 'info', added: true },
  ];

  ICU.defFormulas('o2', [
    {
      id: 'o2cap', title: 'Dissolved O₂ and O₂ capacity', short: 'DO₂ diss.',
      tags: ['dissolved oxygen', 'oxygen capacity', 'hyperoxia', 'hyperbaric'],
      inputs: ['pao2', 'hb'],
      outputs: [
        { id: 'dissolved', label: 'Dissolved O₂', unit: 'mL/dL', dp: 2 },
        { id: 'capacity', label: 'O₂ capacity (1.39 × Hb)', unit: 'mL/dL', dp: 1 },
      ],
      calc: (v) => ({ dissolved: 0.003 * v.pao2, capacity: 1.39 * v.hb }),
      formula: 'D_{O_2} = 0.003 × PaO_2 (mL/dL)   O_2 capacity = 1.39 × Hb (mL/dL)',
      use: 'Shows how little O₂ is dissolved: hyperoxia adds almost no content. Normal capacity 17–24 mL/dL.',
      tables: [{
        of: 'pao2', cols: ['PaO₂ (mmHg)', 'Dissolved O₂ (mL/dL)'], rows: [
          { c: ['100', '0.3'] }, { c: ['500', '1.5'] }, { c: ['≈ 2000 (hyperbaric, 3 ATA)', '≈ 6 — covers resting needs'] },
        ],
      }],
      notes: ['1.39 mL O₂/g Hb is the theoretical maximum; 1.34 is the usual clinical value (used in the content formulas).'],
      example: { v: { pao2: 100, hb: 15 }, expect: { dissolved: 0.3, capacity: 20.9 } },
    },
    {
      id: 'cao2', title: 'Arterial O₂ content', short: 'CaO₂',
      tags: ['oxygen content', 'anaemia', 'anemia'],
      inputs: ['hb', 'sao2', 'pao2'],
      outputs: [{ id: 'cao2', label: 'CaO₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ cao2: 1.34 * v.hb * (v.sao2 / 100) + 0.003 * v.pao2 }),
      formula: 'CaO_2 = 1.34 × Hb × SaO_2 + 0.003 × PaO_2',
      use: 'Hb dominates content: anaemia cuts O₂ content more than moderate hypoxaemia. Normal 17.5–23.5 mL/dL.',
      tables: [
        { cols: ['CaO₂ (mL/dL)', 'Meaning'], rows: contentRows },
        {
          title: 'Examples', cols: ['Hb, SaO₂', 'CaO₂ (mL/dL)'], rows: [
            { c: ['15 g/dL, 98%', '≈ 20'] }, { c: ['15 g/dL, 85%', '≈ 17'] },
            { c: ['10 g/dL, 98%', '≈ 13.4'] }, { c: ['7 g/dL, 98%', '≈ 9.5'] },
          ],
        },
      ],
      example: { v: { hb: 15, sao2: 98, pao2: 95 }, expect: { cao2: 20 } },
    },
    {
      id: 'cvo2', title: 'Mixed venous O₂ content', short: 'C̄vO₂',
      tags: ['venous oxygen content', 'svo2'],
      inputs: ['hb', 'svo2', 'pvo2'],
      outputs: [{ id: 'cvo2', label: 'C̄vO₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ cvo2: 1.34 * v.hb * (v.svo2 / 100) + 0.003 * v.pvo2 }),
      formula: 'C̄vO_2 = 1.34 × Hb × S̄vO_2 + 0.003 × P̄vO_2',
      use: 'Venous side of the Fick equation and of the shunt equation. Normal ≈ 15 mL/dL.',
      notes: ['Draw from the distal port of a pulmonary-artery catheter, slowly. A central venous sample is only a rough surrogate.'],
      example: { v: { hb: 10, svo2: 70, pvo2: 38 }, expect: { cvo2: 9.5 } },
    },
    {
      id: 'ccvo2', hidden: true, title: 'Central venous O₂ content', short: 'CcvO₂',
      inputs: ['hb', 'scvo2', 'pcvo2'],
      outputs: [{ id: 'ccvo2', label: 'CcvO₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ ccvo2: 1.34 * v.hb * (v.scvo2 / 100) + 0.003 * v.pcvo2 }),
      formula: 'CcvO_2 = 1.34 × Hb × ScvO_2 + 0.003 × PcvO_2',
      use: 'Central venous O₂ content.',
    },
    {
      id: 'so2_content', title: 'Saturation from O₂ content', short: 'SO₂',
      tags: ['saturation', 'content', 'co-oximetry'],
      inputs: ['o2content', 'pao2', 'hb'],
      outputs: [{ id: 'so2calc', label: 'SO₂', unit: '%', dp: 0 }],
      calc: (v) => ({ so2calc: (100 * (v.o2content - 0.003 * v.pao2)) / (1.39 * v.hb) }),
      formula: 'SO_2 = 100 × [[C_{O_2} − D_{O_2} || 1.39 × Hb]]',
      use: 'Back-calculate saturation from a measured content; in practice saturation is measured by co-oximetry.',
      tables: [{
        cols: ['SaO₂', 'Meaning'], rows: [
          { c: ['> 95%', 'Normal'], gt: 95, t: 'ok' },
          { c: ['88–92%', 'Acceptable target in COPD / ARDS'], ge: 88, le: 95, t: 'mid' },
          { c: ['< 88%', 'Hypoxaemia — act'], lt: 88, t: 'bad' },
        ],
      }],
      example: { v: { o2content: 19, pao2: 90, hb: 14 }, expect: { so2calc: 96.3 } },
    },
    {
      id: 'do2', title: 'Oxygen delivery', short: 'DO₂',
      tags: ['oxygen delivery', 'do2i', 'shock'],
      inputs: ['co', 'cao2', 'bsa'], optional: ['bsa'],
      outputs: [
        { id: 'do2', label: 'DO₂', unit: 'mL/min', dp: 0 },
        { id: 'do2i', label: 'DO₂I', unit: 'mL/min/m²', dp: 0 },
      ],
      calc: (v) => {
        const do2 = v.co * v.cao2 * 10;
        return { do2, do2i: v.bsa ? do2 / v.bsa : null };
      },
      formula: 'DO_2 = CO × CaO_2 × 10   DO_2I = [[DO_2 || BSA]]   (× 10 converts dL to L)',
      use: 'The three levers of delivery: cardiac output, Hb, SaO₂.',
      tables: [{
        of: 'do2i', cols: ['DO₂I (mL/min/m²)', 'Meaning'], rows: [
          { c: ['500–600', 'Normal (DO₂ ≈ 1000 mL/min)'], ge: 500, t: 'ok' },
          { c: ['400–500', 'Reduced'], ge: 400, lt: 500, t: 'mid', added: true },
          { c: ['< ≈ 330–400', 'Critical — V̇O₂ becomes supply-dependent, lactate rises'], lt: 400, t: 'bad' },
        ],
      }],
      example: { v: { co: 5, hb: 15, sao2: 98, pao2: 95, height: 175, weight: 70 }, expect: { do2: 1000, do2i: 543 } },
    },
    {
      id: 'vo2', title: 'Oxygen consumption (reverse Fick)', short: 'V̇O₂',
      tags: ['oxygen consumption', 'vo2', 'fick', 'metabolism'],
      inputs: ['co', 'cao2', 'cvo2', 'bsa'], optional: ['bsa'],
      outputs: [
        { id: 'vo2', label: 'V̇O₂', unit: 'mL/min', dp: 0 },
        { id: 'vo2iCalc', label: 'V̇O₂I', unit: 'mL/min/m²', dp: 0 },
      ],
      calc: (v) => {
        const vo2 = v.co * (v.cao2 - v.cvo2) * 10;
        return { vo2, vo2iCalc: v.bsa ? vo2 / v.bsa : null };
      },
      formula: 'V̇O_2 = CO × (CaO_2 − C̄vO_2) × 10',
      use: 'Metabolic demand. Normal 200–250 mL/min (V̇O₂I 110–160 mL/min/m²).',
      tables: [
        {
          of: 'vo2', cols: ['V̇O₂ (mL/min)', 'Meaning'], rows: [
            { c: ['< 200', 'Low'], lt: 200, t: 'info', added: true },
            { c: ['200–250', 'Normal'], ge: 200, le: 250, t: 'ok', added: true },
            { c: ['> 250', 'High'], gt: 250, t: 'mid', added: true },
          ],
        },
        {
          title: 'Causes', cols: ['V̇O₂', 'Causes'], rows: [
            { c: ['↑', 'Fever, sepsis, agitation, shivering, work of breathing, burns'] },
            { c: ['↓', 'Sedation, paralysis, hypothermia — or supply failure (cytopathic hypoxia)'] },
          ],
        },
      ],
      example: { v: { co: 5, hb: 15, sao2: 98, pao2: 95, svo2: 70, pvo2: 40 }, expect: { vo2: 290 } },
    },
    {
      id: 'fick_ci', title: 'Fick cardiac index', short: 'CI Fick',
      tags: ['fick', 'cardiac index', 'pa catheter', 'svo2'],
      inputs: ['vo2i', 'cao2', 'cvo2'],
      outputs: [{ id: 'ciFick', label: 'CI (Fick)', unit: 'L/min/m²', dp: 2 }],
      calc: (v) => {
        const d = v.cao2 - v.cvo2;
        if (d <= 0) return { _err: 'Arterial content must exceed venous content.' };
        return { ciFick: v.vo2i / (d * 10) };
      },
      formula: 'CI = [[V̇O_2I || (CaO_2 − C̄vO_2) × 10]] = [[10 × V̇O_2I || Hb × 1.39 × (%SaO_2 − %S̄vO_2)]]',
      use: 'Cardiac output from PA-catheter saturations. An assumed V̇O₂ is imprecise in the critically ill.',
      tables: [{
        cols: ['CI (L/min/m²)', 'Meaning'], rows: [
          { c: ['> 4.2', 'High output'], gt: 4.2, t: 'info', added: true },
          { c: ['2.5–4.2', 'Normal'], ge: 2.5, le: 4.2, t: 'ok' },
          { c: ['2.2–2.5', 'Low'], ge: 2.2, lt: 2.5, t: 'mid' },
          { c: ['< 2.2', 'Cardiogenic shock range (with high filling pressures)'], lt: 2.2, t: 'bad' },
        ],
      }],
      notes: ['The second form (handout p.5) takes saturations in percent (98 − 70), not fractions.'],
      example: { v: { vo2i: 125, hb: 12, sao2: 98, pao2: 90, svo2: 65, pvo2: 35 }, expect: { ciFick: 2.28 } },
    },
    {
      id: 'o2er', title: 'Oxygen extraction ratio', short: 'O₂ER',
      tags: ['extraction', 'o2er', 'svo2', 'lactate'],
      inputs: ['sao2', 'svo2', 'lactate'], optional: ['lactate'],
      outputs: [{ id: 'o2er', label: 'O₂ER', unit: '', dp: 2 }],
      calc: (v) => ({ o2er: (v.sao2 - v.svo2) / v.sao2 }),
      formula: 'O_2ER = [[V̇O_2 || DO_2]] ≈ [[SaO_2 − S̄vO_2 || SaO_2]]',
      use: 'How much of the delivered O₂ the tissues take up. Add lactate to flag extraction failure.',
      tables: [{
        cols: ['O₂ER', 'Meaning'], rows: [
          { c: ['< 0.20 with high lactate', 'Extraction failure: sepsis, shunting, cyanide, mitochondrial injury'], when: (v) => v.o2er < 0.2 && v.lactate > 2, t: 'bad' },
          { c: ['0.20–0.30', 'Normal'], ge: 0.2, le: 0.3, t: 'ok' },
          { c: ['0.30–0.50', 'Compensating for low delivery'], gt: 0.3, le: 0.5, t: 'mid' },
          { c: ['> 0.50', 'Limit reached → anaerobic metabolism'], gt: 0.5, t: 'bad' },
          { c: ['< 0.20', 'Low extraction (check lactate)'], when: (v) => v.o2er < 0.2 && !(v.lactate > 2), t: 'info', added: true },
        ],
      }],
      example: { v: { sao2: 98, svo2: 60 }, expect: { o2er: 0.39 } },
    },
    {
      id: 'svo2_fick', title: 'Expected venous saturation (rearranged Fick)', short: 'S̄vO₂',
      tags: ['svo2', 'scvo2', 'venous saturation', 'fick'],
      inputs: ['sao2', 'vo2', 'hb', 'co'],
      outputs: [{ id: 'svo2Calc', label: 'S̄vO₂ (calculated)', unit: '%', dp: 0 }],
      calc: (v) => ({ svo2Calc: v.sao2 - (100 * v.vo2) / (1.34 * v.hb * v.co * 10) }),
      formula: 'S̄vO_2 ≈ SaO_2 − [[V̇O_2 || 1.34 × Hb × CO × 10]]',
      use: 'Global balance of O₂ supply and demand: it falls with low CO, Hb or SaO₂, or high V̇O₂. The same table reads a measured ScvO₂.',
      tables: [{
        cols: ['ScvO₂', 'Meaning'], rows: [
          { c: ['< 65–70%', 'Delivery inadequate → check CO, Hb, SaO₂, V̇O₂'], lt: 70, t: 'bad' },
          { c: ['70–80%', 'Adequate'], ge: 70, le: 80, t: 'ok' },
          { c: ['> 80%', 'Extraction failure (sepsis), shunting, low V̇O₂, or catheter tip position'], gt: 80, t: 'mid' },
        ],
      }],
      example: { v: { sao2: 98, vo2: 250, hb: 12, co: 5 }, expect: { svo2Calc: 66.9 } },
    },
    {
      id: 'dpco2', title: 'Venous–arterial CO₂ gap', short: 'ΔPCO₂',
      tags: ['co2 gap', 'pcv-aco2', 'cardiac output', 'lactate'],
      inputs: ['pcvco2', 'paco2'],
      outputs: [{ id: 'dpco2', label: 'ΔPCO₂', unit: 'mmHg', dp: 1 }],
      calc: (v) => ({ dpco2: v.pcvco2 - v.paco2 }),
      formula: 'ΔPCO_2 = PcvCO_2 − PaCO_2',
      use: 'Is cardiac output enough for metabolism? Useful when ScvO₂ is normal but lactate is high.',
      tables: [{
        cols: ['ΔPCO₂ (mmHg)', 'Meaning'], rows: [
          { c: ['≤ 6', 'Flow adequate'], le: 6, t: 'ok' },
          { c: ['> 6', 'Flow too low → consider ↑ CO (fluid if responsive, inotrope)'], gt: 6, t: 'bad' },
        ],
      }],
      example: { v: { pcvco2: 48, paco2: 40 }, expect: { dpco2: 8 } },
    },
    {
      id: 'co2_o2', title: 'CO₂ gap / O₂ content difference', short: 'ΔPCO₂/ΔCO₂',
      tags: ['anaerobic', 'respiratory quotient', 'co2 gap ratio'],
      inputs: ['pcvco2', 'paco2', 'cao2', 'ccvo2'],
      outputs: [{ id: 'co2o2', label: 'Ratio', unit: 'mmHg per mL/dL', dp: 2 }],
      calc: (v) => {
        const d = v.cao2 - v.ccvo2;
        if (d <= 0) return { _err: 'Arterial content must exceed central venous content.' };
        return { co2o2: (v.pcvco2 - v.paco2) / d };
      },
      formula: 'Ratio = [[PcvCO_2 − PaCO_2 || CaO_2 − CcvO_2]]',
      use: 'Signals anaerobic metabolism: CO₂ produced without matching O₂ use.',
      tables: [{
        cols: ['Ratio', 'Meaning'], rows: [
          { c: ['< 1.0', 'Aerobic'], lt: 1, t: 'ok' },
          { c: ['1.0–1.4', 'Indeterminate'], ge: 1, le: 1.4, t: 'mid', added: true },
          { c: ['> 1.4', 'Anaerobic metabolism likely'], gt: 1.4, t: 'bad' },
        ],
      }],
      example: { v: { pcvco2: 48, paco2: 40, hb: 12, sao2: 98, pao2: 90, scvo2: 70, pcvo2: 38 }, expect: { co2o2: 1.72 } },
    },
    {
      id: 'lac_clear', title: 'Lactate clearance', short: 'Lac clear',
      tags: ['lactate', 'resuscitation', 'sepsis'],
      inputs: ['lac0', 'lacT'],
      outputs: [{ id: 'lacClear', label: 'Clearance', unit: '%', dp: 0 }],
      calc: (v) => ({ lacClear: (100 * (v.lac0 - v.lacT)) / v.lac0 }),
      formula: 'Clearance (%) = [[Lac_0 − Lac_t || Lac_0]] × 100',
      use: 'Track the response to resuscitation every 2 h.',
      tables: [{
        cols: ['Clearance in 2 h', 'Meaning'], rows: [
          { c: ['≥ 10–20%', 'Responding'], ge: 10, t: 'ok' },
          { c: ['< 10% or rising', 'Ongoing hypoperfusion or source; also liver failure, adrenaline, metformin'], lt: 10, t: 'bad' },
        ],
      }],
      example: { v: { lac0: 4, lacT: 3 }, expect: { lacClear: 25 } },
    },
  ]);

  ICU.defArea({
    id: 'o2', title: 'Oxygen transport', code: 'DO<sub>2</sub>',
    blurb: 'O₂ content, delivery, consumption, extraction, venous saturation and the CO₂ gap.',
    sections: [
      { title: 'Content', items: ['o2cap', 'cao2', 'cvo2', 'so2_content'] },
      { title: 'Delivery and consumption', items: ['do2', 'vo2', 'fick_ci', 'o2er', 'svo2_fick'] },
      { title: 'Perfusion adequacy', items: ['dpco2', 'co2_o2', 'lac_clear'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
