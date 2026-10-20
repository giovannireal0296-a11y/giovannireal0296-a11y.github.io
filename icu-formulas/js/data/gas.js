/* Gas exchange and oxygenation. */
(function (root) {
  'use strict';
  const ICU = root.ICU;
  const kPa = [['mmHg', 1], ['kPa', 7.50062]];

  ICU.defVars({
    altitude: { label: 'Altitude', unit: 'm', min: -400, max: 6000 },
    vdAnat: {
      label: 'Anatomic dead space (V_D)', unit: 'mL', derive: 'vd_anat', calc: true, dp: 0, min: 50, max: 400,
      hint: '≈ 2 mL/kg (≈ 150 mL); add circuit dead space (HME, catheter mount).',
    },
    va: { label: 'Alveolar ventilation (V̇_A)', unit: 'L/min', derive: 'va', calc: true, dp: 2 },
    peco2: {
      label: 'Mixed expired PCO₂ (P_ĒCO₂)', unit: 'mmHg', units: kPa, min: 1, max: 80,
      hint: 'From volumetric capnography.',
    },
    paco2Alv: {
      label: 'Alveolar PCO₂ (P_ACO₂)', unit: 'mmHg', units: kPa, min: 5, max: 120,
      hint: 'Mean alveolar PCO₂ from volumetric capnography (phase III).',
    },
    petco2: { label: 'End-tidal CO₂ (P_ETCO₂)', unit: 'mmHg', units: kPa, min: 5, max: 120 },
    vco2: {
      label: 'CO₂ production (V̇CO₂)', unit: 'mL/min', min: 50, max: 800,
      hint: '≈ 200 mL/min at rest; from the ventilator\'s volumetric capnography or calorimetry.',
    },
    vdvt: {
      label: 'Dead-space fraction (V_D/V_T)', unit: '', derive: 'ds_enghoff', calc: false, dp: 2, min: 0.1, max: 0.9,
      hint: 'Normal 0.2–0.3.',
    },
    paco2Target: { label: 'Target PaCO₂', unit: 'mmHg', units: kPa, min: 20, max: 100 },
    pao2Target: { label: 'Target PaO₂', unit: 'mmHg', units: kPa, min: 40, max: 200 },
    pinsp: { label: 'Inspiratory pressure (P_insp, total)', unit: 'cmH₂O', min: 5, max: 60, hint: 'Peak pressure in pressure control (above zero, not above PEEP).' },
    ccO2: { label: 'End-capillary O₂ content (Cc′O₂)', unit: 'mL/dL', derive: 'cco2', calc: true, dp: 1 },
  });

  const berlin = [
    { c: ['> 400', 'Normal'], gt: 400, t: 'ok' },
    { c: ['301–400', 'Impaired oxygenation, above the ARDS range'], gt: 300, le: 400, t: 'info', added: true },
    { c: ['201–300', 'Mild ARDS'], gt: 200, le: 300, t: 'mid' },
    { c: ['101–200', 'Moderate ARDS'], gt: 100, le: 200, t: 'bad' },
    { c: ['≤ 100', 'Severe ARDS'], le: 100, t: 'bad' },
  ];

  ICU.defFormulas('gas', [
    {
      id: 'pb_alt', hidden: true, title: 'Barometric pressure from altitude', short: 'Pb',
      inputs: ['altitude'],
      outputs: [{ id: 'patm', label: 'Barometric pressure', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ patm: 760 * Math.exp(-v.altitude / 8400) }),
      formula: 'P_B ≈ 760 × e^{−altitude / 8400 m}',
      use: 'Approximate barometric pressure when it is not measured.',
    },
    {
      id: 've', hidden: true, title: 'Minute ventilation from V_T and RR', short: 'V̇E',
      inputs: ['vt', 'rr'],
      outputs: [{ id: 've', label: 'V̇_E', unit: 'L/min', dp: 1 }],
      calc: (v) => ({ ve: (v.vt * v.rr) / 1000 }),
      formula: 'V̇_E = V_T × RR',
      use: 'Set minute ventilation (spontaneous breaths not included).',
    },
    {
      id: 'vd_anat', hidden: true, title: 'Anatomic dead space', short: 'VD',
      inputs: ['pbw'],
      outputs: [{ id: 'vdAnat', label: 'V_D', unit: 'mL', dp: 0 }],
      calc: (v) => ({ vdAnat: 2 * v.pbw }),
      formula: 'V_D ≈ 2 mL/kg PBW',
      use: 'Rough anatomic dead space.',
    },
    {
      id: 'va', title: 'Alveolar ventilation', short: 'V̇A',
      tags: ['dead space', 'alveolar ventilation', 'tidal volume', 'hypercapnia'],
      inputs: ['vt', 'vdAnat', 'rr'],
      outputs: [
        { id: 'va', label: 'V̇_A', unit: 'L/min', dp: 2 },
        { id: 'vaBreath', label: 'V_A per breath', unit: 'mL', dp: 0 },
      ],
      calc: (v) => {
        const per = v.vt - v.vdAnat;
        if (per <= 0) return { _err: 'Tidal volume must exceed dead space.' };
        return { vaBreath: per, va: (per * v.rr) / 1000 };
      },
      formula: 'V_T = V_D + V_A   V̇_A = (V_T − V_D) × RR',
      use: 'Only alveolar ventilation removes CO₂.',
      tables: [{
        cols: ['Change', 'Effect'], rows: [
          { c: ['Smaller V_T at the same RR', 'V_A falls more than V_T (V_D fixed) → PaCO₂ ↑'] },
          { c: ['Extra circuit dead space (HME, long catheter mount)', 'V_A ↓ → remove it in permissive hypercapnia'] },
        ],
      }],
      example: { v: { vt: 450, sex: 'm', height: 175, rr: 16 }, expect: { va: 4.94 } },
    },
    {
      id: 'aga', title: 'Alveolar gas equation', short: 'PAO₂',
      tags: ['alveolar oxygen', 'pao2', 'a-a gradient'],
      inputs: ['fio2', 'patm', 'paco2'],
      outputs: [{ id: 'pao2Alv', label: 'P_AO₂', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ pao2Alv: v.fio2 * (v.patm - 47) - v.paco2 / 0.8 }),
      formula: 'P_AO_2 = FiO_2 (P_atm − 47) − [[PaCO_2 || 0.8]]',
      use: 'The expected alveolar PO₂: first step of the A–a gradient and of the shunt calculation. Sea level: P_atm 760, PH₂O 47 mmHg, R 0.8.',
      tables: [{
        title: 'At sea level with PaCO₂ 40', cols: ['FiO₂', 'P_AO₂ ≈ (mmHg)'], rows: [
          { c: ['0.21', '100'] }, { c: ['0.40', '235'] }, { c: ['0.60', '378'] }, { c: ['1.0', '663'] },
        ],
      }],
      example: { v: { fio2: 1, patm: 760, paco2: 40 }, expect: { pao2Alv: 663 } },
    },
    {
      id: 'aa', title: 'A–a gradient', short: 'A–a',
      tags: ['alveolar arterial', 'hypoxaemia', 'hypoxemia', 'gradient'],
      inputs: ['pao2Alv', 'pao2', 'age'],
      outputs: [
        { id: 'aaGrad', label: 'A–a gradient', unit: 'mmHg', dp: 0 },
        { id: 'aaNormal', label: 'Upper normal on room air (age/4 + 4)', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => ({ aaGrad: v.pao2Alv - v.pao2, aaNormal: v.age / 4 + 4 }),
      formula: 'P_{(A−a)}O_2 = P_AO_2 − PaO_2',
      use: 'Classify hypoxaemia. Normal on room air ≈ age/4 + 4 (handout: 2.5 + 0.21 × age).',
      tables: [{
        cols: ['A–a gradient', 'Cause of hypoxaemia'], rows: [
          { c: ['Normal', 'Hypoventilation or low inspired PO₂ (altitude)'], when: (v) => v.aaGrad <= v.aaNormal, t: 'ok', v: 'Normal gradient: hypoventilation or low inspired PO₂' },
          { c: ['Raised', 'V/Q mismatch, shunt or diffusion limit'], when: (v) => v.aaGrad > v.aaNormal, t: 'bad', v: 'Raised: V/Q mismatch, shunt or diffusion limit' },
        ],
      }],
      notes: ['The age-based normal applies to room air; the gradient widens as FiO₂ rises.'],
      example: { v: { fio2: 0.21, patm: 760, paco2: 40, pao2: 85, age: 40 }, expect: { aaGrad: 14.7, aaNormal: 14 } },
    },
    {
      id: 'aA', title: 'a/A ratio', short: 'a/A',
      tags: ['arterial alveolar ratio', 'oxygenation'],
      inputs: ['pao2', 'pao2Alv'],
      outputs: [{ id: 'aAr', label: 'a/A', unit: '', dp: 2 }],
      calc: (v) => ({ aAr: v.pao2 / v.pao2Alv }),
      formula: 'a/A = [[PaO_2 || P_AO_2]]',
      use: 'Compare oxygenation across different FiO₂; less FiO₂-dependent than the gradient.',
      tables: [{
        cols: ['a/A', 'Meaning'], rows: [
          { c: ['> 0.75', 'Normal'], gt: 0.75, t: 'ok' },
          { c: ['< 0.75', 'Impaired gas exchange'], le: 0.75, t: 'bad' },
        ],
      }],
      example: { v: { pao2: 80, fio2: 0.5, patm: 760, paco2: 40 }, expect: { aAr: 0.26 } },
    },
    {
      id: 'pf', title: 'P/F ratio', short: 'P/F',
      tags: ['pao2/fio2', 'horowitz', 'ards', 'berlin', 'prone', 'ecmo'],
      inputs: ['pao2', 'fio2', 'patm'], optional: ['patm'],
      outputs: [
        { id: 'pf', label: 'P/F', unit: 'mmHg', dp: 0 },
        { id: 'pfAdj', label: 'P/F × P_B/760 (altitude)', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => {
        const pf = v.pao2 / v.fio2;
        return { pf, pfAdj: v.patm ? (pf * v.patm) / 760 : pf };
      },
      formula: 'P/F = [[PaO_2 || FiO_2]]',
      use: 'ARDS severity (Berlin, with PEEP ≥ 5 cmH₂O) and escalation triggers. At altitude multiply by P_B/760.',
      tables: [
        { of: 'pfAdj', cols: ['P/F (mmHg)', 'Meaning / action'], rows: berlin },
        {
          of: 'pfAdj', title: 'Escalation', multi: true, cols: ['P/F (mmHg)', 'Action'], rows: [
            { c: ['< 150 (FiO₂ ≥ 0.6)', 'Prone positioning'], when: (v) => v.pfAdj < 150 && v.fio2 >= 0.6, t: 'bad', v: 'Proning threshold met (P/F < 150, FiO₂ ≥ 0.6)' },
            { c: ['< 80 for 6 h or < 50 for 3 h', 'Consider VV-ECMO (EOLIA criteria)'], when: (v) => v.pfAdj < 80, t: 'bad', v: 'Below 80: consider VV-ECMO if it persists (EOLIA)' },
          ],
        },
      ],
      example: { v: { pao2: 90, fio2: 0.6, patm: 760 }, expect: { pf: 150 } },
    },
    {
      id: 'sf', title: 'S/F ratio to estimate P/F (Rice 2007)', short: 'S/F',
      tags: ['spo2/fio2', 'ards screening', 'no arterial line'],
      inputs: ['spo2', 'fio2'],
      outputs: [
        { id: 'sfr', label: 'S/F', unit: '', dp: 0 },
        { id: 'pfEst', label: 'Estimated P/F', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => {
        const sfr = v.spo2 / v.fio2;
        const r = { sfr, pfEst: (sfr - 64) / 0.84 };
        if (v.spo2 > 97) r._msgs = ['SpO₂ above 97%: the S/F estimate is not valid (flat part of the curve). Lower FiO₂ and re-read.'];
        return r;
      },
      formula: 'S/F ≈ 64 + 0.84 × P/F   (valid only when SpO₂ ≤ 97%)',
      use: 'ARDS screening without an arterial line (accepted in the 2023 global definition).',
      tables: [{
        of: 'sfr', cols: ['S/F', '≈ P/F'], rows: [
          { c: ['315', '300 (ARDS threshold)'], ge: 315, t: 'ok', v: 'S/F ≥ 315: above the ARDS threshold' },
          { c: ['235', '200'], ge: 235, lt: 315, t: 'mid', v: 'S/F 235–315 ≈ P/F 200–300 (mild range)' },
          { c: ['148', '100'], ge: 148, lt: 235, t: 'bad', v: 'S/F 148–235 ≈ P/F 100–200 (moderate range)' },
          { c: ['< 148', '< 100'], lt: 148, t: 'bad', v: 'S/F < 148 ≈ P/F < 100 (severe range)' },
        ],
      }],
      example: { v: { spo2: 94, fio2: 0.4 }, expect: { sfr: 235, pfEst: 203.6 } },
    },
    {
      id: 'oi', title: 'Oxygenation index and saturation index', short: 'OI · OSI',
      tags: ['oxygenation index', 'osi', 'ecmo', 'paediatric', 'pediatric'],
      inputs: ['fio2', 'mpaw', 'pao2', 'spo2'], optional: ['pao2', 'spo2'],
      outputs: [
        { id: 'oiv', label: 'OI', unit: '', dp: 1 },
        { id: 'osi', label: 'OSI', unit: '', dp: 1 },
      ],
      calc: (v) => {
        if (v.pao2 == null && v.spo2 == null) return { _err: 'Enter PaO₂ for OI, SpO₂ for OSI, or both.' };
        const top = v.fio2 * v.mpaw * 100;
        return { oiv: v.pao2 != null ? top / v.pao2 : null, osi: v.spo2 != null ? top / v.spo2 : null };
      },
      formula: 'OI = [[FiO_2 × P̄_aw × 100 || PaO_2]]   OSI = [[FiO_2 × P̄_aw × 100 || SpO_2]]',
      use: 'Includes the pressure cost of oxygenation. Trend for ECMO referral (graded mainly in paediatrics).',
      tables: [{
        of: 'oiv', cols: ['OI', 'Meaning'], rows: [
          { c: ['< 8', 'Mild'], lt: 8, t: 'ok' },
          { c: ['8–16', 'Moderate'], ge: 8, lt: 16, t: 'mid' },
          { c: ['≥ 16', 'Severe'], ge: 16, t: 'bad' },
          { c: ['> 40', 'Classic ECMO threshold (neonates)'], gt: 40, t: 'bad' },
        ],
      }],
      example: { v: { fio2: 0.6, mpaw: 20, pao2: 75 }, expect: { oiv: 16 } },
    },
    {
      id: 'mpaw', title: 'Mean airway pressure (pressure control)', short: 'mPaw',
      tags: ['mean airway pressure', 'oxygenation', 'pressure control'],
      inputs: ['pinsp', 'peepSet', 'ti', 'rr'],
      outputs: [{ id: 'mpaw', label: 'P̄_aw', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => {
        const ttot = 60 / v.rr;
        if (v.ti >= ttot) return { _err: 'Inspiratory time must be shorter than the breath (60/RR).' };
        return { mpaw: (v.pinsp - v.peepSet) * (v.ti / ttot) + v.peepSet };
      },
      formula: 'P̄_aw ≈ (P_insp − PEEP) × [[T_i || T_tot]] + PEEP   (T_tot = 60/RR)',
      use: 'Main ventilator determinant of oxygenation besides FiO₂.',
      tables: [{
        cols: ['Change', 'Effect'], rows: [
          { c: ['↑ PEEP, ↑ T_i or I:E, ↑ P_insp', 'P̄_aw ↑ → oxygenation ↑'] },
          { c: ['P̄_aw ↑ in hypovolaemia', 'Venous return ↓ → BP and CO may fall'] },
        ],
      }],
      example: { v: { pinsp: 30, peepSet: 10, ti: 1, rr: 20 }, expect: { mpaw: 16.7 } },
    },
    {
      id: 'cco2', title: 'End-capillary O₂ content', short: 'Cc′O₂',
      tags: ['shunt', 'content', 'end capillary'],
      inputs: ['hb', 'pao2Alv'],
      outputs: [{ id: 'ccO2', label: 'Cc′O₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ ccO2: 1.34 * v.hb * 1.0 + 0.003 * v.pao2Alv }),
      formula: 'C_{c′}O_2 = 1.34 × Hb × 1.0 + 0.003 × P_AO_2',
      use: 'Blood leaving perfectly ventilated alveoli. It cannot be sampled, so it is calculated with 100% saturation and PO₂ = P_AO₂.',
      tables: [{
        title: 'Terms of the shunt equation', cols: ['Term', 'Meaning', 'How to get it'], rows: [
          { c: ['Cc′O₂', 'O₂ content at the end of a ventilated pulmonary capillary', 'Calculated (this formula)'] },
          { c: ['P_AO₂', 'Alveolar PO₂', 'Alveolar gas equation'] },
          { c: ['CaO₂', 'Arterial O₂ content', 'Arterial gas: Hb, SaO₂, PaO₂'] },
          { c: ['C̄vO₂', 'Mixed venous O₂ content', 'PA catheter, distal port, slow draw: SvO₂, PvO₂ (central venous gas is only a rough surrogate)'] },
        ],
      }],
      example: { v: { hb: 10, fio2: 1, patm: 760, paco2: 40 }, expect: { ccO2: 15.4 } },
    },
    {
      id: 'shunt', title: 'Physiologic shunt', short: 'Qs/Qt',
      tags: ['shunt fraction', 'venous admixture', 'qs/qt', 'hypoxaemia'],
      inputs: ['ccO2', 'cao2', 'cvo2'],
      outputs: [{ id: 'shuntPct', label: 'Q̇s/Q̇t', unit: '%', dp: 0 }],
      calc: (v) => {
        const den = v.ccO2 - v.cvo2;
        if (den <= 0) return { _err: 'End-capillary content must exceed mixed venous content.' };
        return { shuntPct: (100 * (v.ccO2 - v.cao2)) / den };
      },
      formula: '[[Q̇_s || Q̇_t]] = [[C_{c′}O_2 − CaO_2 || C_{c′}O_2 − C̄vO_2]]',
      use: 'Quantify blood passing unventilated lung. On FiO₂ 1.0 this is true shunt; at lower FiO₂ it is venous admixture.',
      tables: [{
        cols: ['Shunt', 'Meaning'], rows: [
          { c: ['< 5%', 'Normal'], lt: 5, t: 'ok' },
          { c: ['5–10%', 'Mildly raised'], ge: 5, lt: 10, t: 'info', added: true },
          { c: ['10–20%', 'Moderate — partial response to FiO₂'], ge: 10, lt: 20, t: 'mid' },
          { c: ['20–30%', 'Significant'], ge: 20, le: 30, t: 'bad' },
          { c: ['> 30%', 'Severe — FiO₂ barely helps: recruit, PEEP, prone'], gt: 30, t: 'bad' },
        ],
      }],
      notes: ['Shortcut on FiO₂ 1.0: each ≈ 20 mmHg of A–a gradient ≈ 1% shunt.'],
      example: {
        v: { hb: 10, fio2: 1, patm: 760, paco2: 40, sao2: 99, pao2: 150, svo2: 70, pvo2: 38 },
        text: 'Hb 10, PaCO₂ 40 → P_AO₂ 663, Cc′O₂ 15.4; PaO₂ 150, SaO₂ 99% → CaO₂ 13.7; SvO₂ 70%, PvO₂ 38 → C̄vO₂ 9.5; shunt ≈ 28%.',
        expect: { shuntPct: 28 },
      },
      guide: 'shunt',
    },
    {
      id: 'ds_enghoff', title: 'Dead space (Enghoff)', short: 'VD/VT',
      tags: ['dead space', 'enghoff', 'volumetric capnography', 'ards'],
      inputs: ['paco2', 'peco2'],
      outputs: [{ id: 'vdvt', label: 'V_D/V_T', unit: '', dp: 2 }],
      calc: (v) => ({ vdvt: (v.paco2 - v.peco2) / v.paco2 }),
      formula: '[[V_D || V_T]] = [[PaCO_2 − P_ĒCO_2 || PaCO_2]]',
      use: 'Quantify wasted ventilation; prognostic in ARDS. Uses arterial PCO₂, so it also counts shunt as "dead space" (this is Enghoff\'s modification of Bohr).',
      tables: [{
        cols: ['V_D/V_T', 'Meaning'], rows: [
          { c: ['0.2–0.3', 'Normal'], le: 0.3, t: 'ok' },
          { c: ['0.3–0.55', 'Raised: ARDS, COPD, PE, low cardiac output, overdistension'], gt: 0.3, le: 0.55, t: 'mid' },
          { c: ['> 0.55–0.6', 'High mortality in early ARDS'], gt: 0.55, t: 'bad' },
        ],
      }],
      example: { v: { paco2: 50, peco2: 25 }, expect: { vdvt: 0.5 } },
    },
    {
      id: 'ds_bohr', title: 'Dead space (Bohr)', short: 'VD/VT Bohr',
      tags: ['dead space', 'bohr', 'volumetric capnography'],
      inputs: ['paco2Alv', 'peco2'],
      outputs: [{ id: 'vdvtB', label: 'V_D/V_T (Bohr)', unit: '', dp: 2 }],
      calc: (v) => ({ vdvtB: (v.paco2Alv - v.peco2) / v.paco2Alv }),
      formula: '[[V_D || V_T]] = [[P_ACO_2 − P_ĒCO_2 || P_ACO_2]]',
      use: 'True physiologic dead space with alveolar PCO₂ from volumetric capnography.',
      tables: [{
        cols: ['V_D/V_T', 'Meaning'], rows: [
          { c: ['0.2–0.3', 'Normal'], le: 0.3, t: 'ok' },
          { c: ['0.3–0.55', 'Raised: ARDS, COPD, PE, low cardiac output, overdistension'], gt: 0.3, le: 0.55, t: 'mid' },
          { c: ['> 0.55–0.6', 'High'], gt: 0.55, t: 'bad' },
        ],
      }],
      example: { v: { paco2Alv: 40, peco2: 28 }, expect: { vdvtB: 0.3 } },
    },
    {
      id: 'aet', title: 'Arterial–end-tidal CO₂ gradient', short: 'Pa–ETCO₂',
      tags: ['etco2', 'capnography', 'dead space', 'pe'],
      inputs: ['paco2', 'petco2'],
      outputs: [{ id: 'aetGrad', label: 'P_{(a−ET)}CO₂', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ aetGrad: v.paco2 - v.petco2 }),
      formula: 'P_{(a−ET)}CO_2 = PaCO_2 − P_ETCO_2',
      use: 'Bedside dead-space marker; makes EtCO₂ usable as a PaCO₂ trend.',
      tables: [{
        cols: ['Gradient (mmHg)', 'Meaning'], rows: [
          { c: ['2–5', 'Normal'], le: 5, t: 'ok' },
          { c: ['5–10', 'Mildly raised'], gt: 5, le: 10, t: 'info', added: true },
          { c: ['> 10', 'Dead space ↑: PE, low CO, overdistension, COPD'], gt: 10, t: 'bad' },
          { c: ['Sudden ↑ with falling EtCO₂', 'PE, cardiac arrest, circuit leak or disconnection'] },
        ],
      }],
      example: { v: { paco2: 48, petco2: 35 }, expect: { aetGrad: 13 } },
    },
    {
      id: 've_need', title: 'Minute ventilation for a target PaCO₂', short: 'V̇E',
      tags: ['minute ventilation', 'paco2', 'hypercapnia', 'vco2'],
      inputs: ['vco2', 'paco2Target', 'vdvt'],
      outputs: [{ id: 'veNeed', label: 'Required V̇_E', unit: 'L/min', dp: 1 }],
      calc: (v) => ({ veNeed: (0.863 * v.vco2) / (v.paco2Target * (1 - v.vdvt)) }),
      formula: 'V̇_E = [[0.863 × V̇CO_2 || PaCO_2 (1 − V_D/V_T)]]',
      use: 'Explain hypercapnia: too much CO₂ produced, too little ventilation, or too much dead space.',
      tables: [{
        cols: ['Change', 'PaCO₂'], rows: [
          { c: ['Alveolar ventilation doubles', 'Halves'] },
          { c: ['V̇CO₂ ↑ (fever, sepsis, overfeeding, bicarbonate)', '↑ at the same ventilation'] },
          { c: ['V_D/V_T ↑', '↑ at the same minute ventilation'] },
        ],
      }],
      example: { v: { vco2: 200, paco2Target: 40, vdvt: 0.3 }, expect: { veNeed: 6.2 } },
    },
    {
      id: 'paco2_va', title: 'Expected PaCO₂ from alveolar ventilation', short: 'PaCO₂',
      tags: ['paco2', 'alveolar ventilation', 'vco2'],
      inputs: ['vco2', 'va'],
      outputs: [{ id: 'paco2Exp', label: 'Expected PaCO₂', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ paco2Exp: (0.863 * v.vco2) / v.va }),
      formula: 'PaCO_2 = [[0.863 × V̇CO_2 || V̇_A]]',
      use: 'Predict PaCO₂ after a change in V_T, RR or dead space.',
      tables: [{
        cols: ['Change', 'PaCO₂'], rows: [
          { c: ['Alveolar ventilation doubles', 'Halves'] },
          { c: ['V̇CO₂ ↑ (fever, sepsis, overfeeding, bicarbonate)', '↑ at the same ventilation'] },
        ],
      }],
      example: { v: { vco2: 200, vt: 450, sex: 'm', height: 175, rr: 16 }, expect: { paco2Exp: 35 } },
    },
    {
      id: 'vr', title: 'Ventilatory ratio (Sinha)', short: 'VR',
      tags: ['ventilatory ratio', 'dead space', 'ards'],
      inputs: ['ve', 'paco2', 'pbw'],
      outputs: [{ id: 'vrr', label: 'Ventilatory ratio', unit: '', dp: 2 }],
      calc: (v) => ({ vrr: (v.ve * 1000 * v.paco2) / (v.pbw * 100 * 37.5) }),
      formula: 'VR = [[V̇_E (mL/min) × PaCO_2 || PBW × 100 × 37.5]]',
      use: 'Dead-space surrogate from routine data; no capnography needed.',
      tables: [{
        cols: ['VR', 'Meaning'], rows: [
          { c: ['≈ 1', 'Normal ventilatory efficiency'], le: 1, t: 'ok' },
          { c: ['1–2', 'Impaired (dead space or V̇CO₂ ↑)'], gt: 1, le: 2, t: 'mid' },
          { c: ['> 2', 'Severe — higher ARDS mortality'], gt: 2, t: 'bad' },
        ],
      }],
      example: { v: { ve: 10, paco2: 50, sex: 'm', height: 175 }, expect: { vrr: 1.89 } },
    },
    {
      id: 'rr_new', title: 'New RR for a target PaCO₂', short: 'RR new',
      tags: ['respiratory rate', 'paco2', 'ventilator adjustment'],
      inputs: ['rr', 'paco2', 'paco2Target'],
      outputs: [{ id: 'rrNew', label: 'New RR', unit: '/min', dp: 0 }],
      calc: (v) => ({ rrNew: (v.rr * v.paco2) / v.paco2Target }),
      formula: 'RR_new = RR × [[PaCO_{2,now} || PaCO_{2,target}]]',
      use: 'First estimate of the new rate, assuming dead space and CO₂ production stay constant.',
      tables: [{
        cols: ['Caveat', 'Why'], rows: [
          { c: ['Higher RR', 'Shorter expiration → watch intrinsic PEEP'] },
        ],
      }],
      example: { v: { rr: 20, paco2: 60, paco2Target: 45 }, text: 'RR 20, PaCO₂ 60 → target 45 → RR ≈ 27.', expect: { rrNew: 26.7 } },
    },
    {
      id: 'fio2_new', title: 'New FiO₂ for a target PaO₂', short: 'FiO₂ new',
      tags: ['fio2', 'oxygen', 'ventilator adjustment'],
      inputs: ['fio2', 'pao2', 'pao2Target'],
      outputs: [{ id: 'fio2New', label: 'New FiO₂', unit: '%', dp: 0 }],
      calc: (v) => {
        const f = (100 * v.fio2 * v.pao2Target) / v.pao2;
        const r = { fio2New: Math.min(100, Math.max(21, f)) };
        if (f > 100) r._msgs = ['The estimate is above 100%: FiO₂ alone will not reach the target.'];
        return r;
      },
      formula: 'FiO_{2,new} ≈ FiO_2 × [[PaO_{2,target} || PaO_{2,now}]]',
      use: 'First estimate of the new FiO₂, assuming the shunt stays constant.',
      tables: [{
        cols: ['Caveat', 'Why'], rows: [
          { c: ['FiO₂ estimate', 'Fails when shunt is large (> 30%)'] },
        ],
      }],
      example: { v: { fio2: 0.6, pao2: 120, pao2Target: 80 }, expect: { fio2New: 40 } },
    },
  ]);

  ICU.defArea({
    id: 'gas', title: 'Gas exchange and oxygenation', code: 'P/F',
    blurb: 'Alveolar gas, gradients, P/F and S/F, shunt, dead space and CO₂.',
    sections: [
      { title: 'Oxygenation', items: ['aga', 'aa', 'aA', 'pf', 'sf', 'oi', 'mpaw'] },
      { title: 'Shunt', items: ['g:shunt', 'cco2', 'shunt'] },
      { title: 'Ventilation, dead space and CO₂', items: ['va', 'ds_enghoff', 'ds_bohr', 'aet', 've_need', 'paco2_va', 'vr'] },
      { title: 'Adjusting the ventilator', items: ['rr_new', 'fio2_new'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
