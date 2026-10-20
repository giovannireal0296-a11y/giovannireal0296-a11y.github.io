/* Organ perfusion pressures, abdomen and brain. */
(function (root) {
  'use strict';
  const ICU = root.ICU;
  const kPa = [['mmHg', 1], ['kPa', 7.50062]];

  ICU.defVars({
    csfP: { label: 'CSF pressure', unit: 'mmHg', units: [['mmHg', 1], ['cmH₂O', 0.735]], min: 0, max: 50 },
    vMca: { label: 'MCA mean velocity', unit: 'cm/s', min: 10, max: 350 },
    vIca: { label: 'Extracranial ICA mean velocity', unit: 'cm/s', min: 5, max: 200 },
    vSys: { label: 'Peak systolic velocity', unit: 'cm/s', min: 10, max: 350 },
    vDia: { label: 'End-diastolic velocity', unit: 'cm/s', min: 0, max: 250 },
    vMeanTcd: { label: 'Mean velocity', unit: 'cm/s', min: 5, max: 300 },
    sjvo2: { label: 'Jugular bulb SjvO₂', unit: '%', min: 20, max: 100 },
    pjvo2: { label: 'Jugular bulb PjvO₂', unit: 'mmHg', units: kPa, min: 10, max: 100 },
    cjvo2: { label: 'Jugular venous O₂ content (CjvO₂)', unit: 'mL/dL', derive: 'cjvo2', calc: true, dp: 1 },
  });

  ICU.defFormulas('perf', [
    {
      id: 'cpp', title: 'Cerebral perfusion pressure', short: 'CPP',
      tags: ['icp', 'tbi', 'brain', 'head injury', 'neuro'],
      inputs: ['map', 'icp'],
      outputs: [{ id: 'cppV', label: 'CPP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ cppV: v.map - v.icp }),
      formula: 'CPP = MAP − ICP',
      use: 'Brain perfusion target in TBI, haemorrhage, and liver failure with cerebral oedema. Zero the arterial transducer at the tragus.',
      tables: [
        {
          of: 'cppV', cols: ['CPP (mmHg)', 'Meaning / action'], rows: [
            { c: ['< 60', 'Ischaemia risk → ↑ MAP or ↓ ICP'], lt: 60, t: 'bad' },
            { c: ['60–70', 'Target in TBI'], ge: 60, le: 70, t: 'ok' },
            { c: ['> 70 forced with fluid/pressors', 'ARDS risk — avoid'], gt: 70, t: 'mid', v: 'Above 70: avoid forcing it with fluid or pressors (ARDS risk)' },
          ],
        },
        {
          of: 'icp', cols: ['ICP (mmHg)', 'Meaning / action'], rows: [
            { c: ['5–15', 'Normal'], le: 15, t: 'ok' },
            { c: ['16–22', 'Raised'], gt: 15, le: 22, t: 'mid', added: true },
            { c: ['> 22', 'Treat (tiered ICP protocol)'], gt: 22, t: 'bad' },
          ],
        },
      ],
      example: { v: { map: 80, icp: 25 }, expect: { cppV: 55 } },
    },
    {
      id: 'scpp', title: 'Spinal cord perfusion pressure', short: 'SCPP',
      tags: ['spinal cord', 'csf drain', 'aortic repair', 'spinal injury'],
      inputs: ['map', 'csfP'],
      outputs: [{ id: 'scppV', label: 'SCPP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ scppV: v.map - v.csfP }),
      formula: 'SCPP = MAP − P_CSF',
      use: 'After thoraco-abdominal aortic repair (CSF drain) and in acute spinal cord injury.',
      tables: [{
        cols: ['Value', 'Meaning / action'], rows: [
          { c: ['SCPP ≥ 70 mmHg (MAP ≥ 80–90, CSF ≤ 10–15)', 'Usual target'], ge: 70, t: 'ok' },
          { c: ['SCPP < 70 mmHg', 'Below target → ↑ MAP, drain CSF'], lt: 70, t: 'bad', added: true },
          { c: ['New leg weakness', '↑ MAP, drain CSF, correct Hb and hypoxaemia'] },
        ],
      }],
      example: { v: { map: 85, csfP: 10 }, expect: { scppV: 75 } },
    },
    {
      id: 'app', title: 'Abdominal perfusion pressure and filtration gradient', short: 'APP · FG',
      tags: ['abdominal', 'iah', 'compartment', 'kidney', 'oliguria'],
      inputs: ['map', 'iap'],
      outputs: [
        { id: 'appV', label: 'APP', unit: 'mmHg', dp: 0 },
        { id: 'fgV', label: 'Filtration gradient', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => ({ appV: v.map - v.iap, fgV: v.map - 2 * v.iap }),
      formula: 'APP = MAP − IAP   FG = MAP − 2 × IAP',
      use: 'Gut and kidney perfusion in intra-abdominal hypertension.',
      tables: [{
        of: 'appV', cols: ['Value', 'Meaning / action'], rows: [
          { c: ['APP ≥ 60 mmHg', 'Adequate'], ge: 60, t: 'ok' },
          { c: ['APP < 60 mmHg', 'Splanchnic/renal hypoperfusion → decompress (NG tube, drains, sedation, paralysis, surgery)'], lt: 60, t: 'bad' },
          { c: ['FG falling', 'Falls twice as fast as IAP rises → oliguria is an early sign of IAH'] },
        ],
      }],
      example: { v: { map: 70, iap: 18 }, expect: { appV: 52, fgV: 34 } },
    },
    {
      id: 'rpp_renal', title: 'Renal perfusion pressure', short: 'RPP',
      tags: ['kidney', 'venous congestion', 'cvp', 'aki'],
      inputs: ['map', 'rap', 'iap'], optional: ['iap'],
      outputs: [{ id: 'renalPP', label: 'Renal perfusion pressure', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ renalPP: v.map - Math.max(v.rap, v.iap != null ? v.iap : -Infinity) }),
      formula: 'RPP_renal ≈ MAP − max(CVP, IAP)',
      use: 'Remember venous congestion: a high CVP hurts the kidney as much as a low MAP.',
      tables: [{
        cols: ['Value', 'Meaning / action'], rows: [
          { c: ['≥ 60–65 mmHg', 'Usually adequate'], when: (v) => v.renalPP >= 60, t: 'ok' },
          { c: ['< 60 mmHg', 'Low renal perfusion pressure'], when: (v) => v.renalPP < 60, t: 'bad', added: true },
          { c: ['CVP > 12–15 mmHg', 'Renal congestion → decongest rather than add fluid'], when: (v) => v.rap > 12, t: 'mid' },
        ],
      }],
      example: { v: { map: 70, rap: 14, iap: 10 }, expect: { renalPP: 56 } },
    },
    {
      id: 'iap_grade', title: 'Intra-abdominal hypertension grade (WSACS)', short: 'IAP',
      tags: ['iah', 'abdominal compartment', 'bladder pressure', 'wsacs'],
      inputs: ['iap'],
      outputs: [
        { id: 'iapV', label: 'IAP', unit: 'mmHg', dp: 0 },
        { id: 'iapCm', label: 'IAP', unit: 'cmH₂O', dp: 0 },
      ],
      calc: (v) => ({ iapV: v.iap, iapCm: v.iap * 1.36 }),
      formula: 'Bladder pressure, ≤ 25 mL saline, supine, end-expiration, zero at the mid-axillary line   (1 mmHg = 1.36 cmH₂O)',
      use: 'Grade intra-abdominal hypertension.',
      tables: [{
        cols: ['IAP', 'mmHg', 'cmH₂O'], rows: [
          { c: ['Normal', '4–7 (5–7 in critically ill)', '5.4–9.5'], lt: 8, t: 'ok', v: 'Normal' },
          { c: ['Raised, below IAH', '8–11', '11–15'], ge: 8, lt: 12, t: 'info', added: true, v: 'Raised, below IAH' },
          { c: ['IAH grade I', '12–15', '16.3–20.4'], ge: 12, lt: 16, t: 'mid', v: 'IAH grade I' },
          { c: ['IAH grade II', '16–20', '21.8–27.2'], ge: 16, le: 20, t: 'mid', v: 'IAH grade II' },
          { c: ['IAH grade III', '21–25', '28.6–34'], gt: 20, le: 25, t: 'bad', v: 'IAH grade III' },
          { c: ['IAH grade IV', '> 25', '> 34'], gt: 25, t: 'bad', v: 'IAH grade IV' },
          { c: ['Abdominal compartment syndrome', 'Sustained > 20 + new organ failure', '≥ 27.2'] },
        ],
      }],
      example: { v: { iap: 18 }, expect: { iapCm: 24.5 } },
    },
    {
      id: 'lindegaard', title: 'Lindegaard ratio (transcranial Doppler)', short: 'LR',
      tags: ['vasospasm', 'sah', 'subarachnoid', 'tcd', 'transcranial doppler'],
      inputs: ['vMca', 'vIca'],
      outputs: [{ id: 'lrV', label: 'Lindegaard ratio', unit: '', dp: 1 }],
      calc: (v) => ({ lrV: v.vMca / v.vIca }),
      formula: 'LR = [[V_{mean,MCA} || V_{mean,ICA (extracranial)}]]',
      use: 'Vasospasm after subarachnoid haemorrhage; separates spasm from hyperaemia.',
      tables: [{
        cols: ['Finding', 'Meaning'], rows: [
          { c: ['MCA V_mean < 120 cm/s', 'Normal'], when: (v) => v.vMca < 120, t: 'ok' },
          { c: ['MCA V_mean 120–200, LR 3–6', 'Vasospasm'], when: (v) => v.vMca >= 120 && v.lrV >= 3 && !(v.vMca > 200 && v.lrV > 6), t: 'mid' },
          { c: ['MCA V_mean > 200, LR > 6', 'Severe vasospasm'], when: (v) => v.vMca > 200 && v.lrV > 6, t: 'bad' },
          { c: ['High velocity, LR < 3', 'Hyperaemia'], when: (v) => v.vMca >= 120 && v.lrV < 3, t: 'info' },
        ],
      }],
      example: { v: { vMca: 160, vIca: 40 }, expect: { lrV: 4 } },
    },
    {
      id: 'pi_tcd', title: 'Gosling pulsatility index', short: 'PI',
      tags: ['tcd', 'transcranial doppler', 'icp', 'pulsatility'],
      inputs: ['vSys', 'vDia', 'vMeanTcd'],
      outputs: [{ id: 'piV', label: 'PI', unit: '', dp: 2 }],
      calc: (v) => ({ piV: (v.vSys - v.vDia) / v.vMeanTcd }),
      formula: 'PI = [[V_sys − V_dia || V_mean]]',
      use: 'Non-invasive hint of raised ICP or distal resistance.',
      tables: [{
        cols: ['PI', 'Meaning'], rows: [
          { c: ['< 0.6', 'Low resistance: hyperaemia, AVM'], lt: 0.6, t: 'info' },
          { c: ['0.6–1.1', 'Normal'], ge: 0.6, le: 1.1, t: 'ok' },
          { c: ['1.1–1.2', 'Borderline'], gt: 1.1, le: 1.2, t: 'mid', added: true },
          { c: ['> 1.2–1.4', 'Raised ICP or distal resistance'], gt: 1.2, t: 'bad' },
        ],
      }],
      example: { v: { vSys: 100, vDia: 40, vMeanTcd: 60 }, expect: { piV: 1 } },
    },
    {
      id: 'cjvo2', hidden: true, title: 'Jugular venous O₂ content', short: 'CjvO₂',
      inputs: ['hb', 'sjvo2', 'pjvo2'],
      outputs: [{ id: 'cjvo2', label: 'CjvO₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ cjvo2: 1.34 * v.hb * (v.sjvo2 / 100) + 0.003 * v.pjvo2 }),
      formula: 'CjvO_2 = 1.34 × Hb × SjvO_2 + 0.003 × PjvO_2',
      use: 'Jugular bulb O₂ content.',
    },
    {
      id: 'avdo2', title: 'Cerebral O₂ extraction (jugular bulb)', short: 'AVDO₂',
      tags: ['sjvo2', 'jugular bulb', 'cerebral oxygen', 'brain'],
      inputs: ['cao2', 'cjvo2', 'sjvo2'],
      outputs: [{ id: 'avdo2V', label: 'AVDO₂', unit: 'mL/dL', dp: 1 }],
      calc: (v) => ({ avdo2V: v.cao2 - v.cjvo2 }),
      formula: 'AVDO_2 = CaO_2 − CjvO_2',
      use: 'Global cerebral O₂ balance. Normal AVDO₂ 4–8 mL/dL.',
      tables: [{
        of: 'sjvo2', cols: ['SjvO₂', 'Meaning'], rows: [
          { c: ['< 50%', 'Ischaemia: low CPP, hyperventilation, anaemia, hypoxaemia'], lt: 50, t: 'bad' },
          { c: ['50–55%', 'Borderline'], ge: 50, lt: 55, t: 'mid', added: true },
          { c: ['55–75%', 'Normal'], ge: 55, le: 75, t: 'ok' },
          { c: ['> 75%', 'Hyperaemia or infarcted tissue (no O₂ uptake)'], gt: 75, t: 'mid' },
        ],
      }],
      example: { v: { hb: 12, sao2: 98, pao2: 100, sjvo2: 65, pjvo2: 35 }, expect: { avdo2V: 5.5 } },
    },
    {
      id: 'osmgap_mannitol', title: 'Osmolar gap during mannitol', short: 'Osm gap',
      tags: ['mannitol', 'osmolar gap', 'icp', 'redose'],
      inputs: ['osmMeas', 'osmCalc'],
      outputs: [{ id: 'osmGapM', label: 'Osmolar gap', unit: 'mOsm/kg', dp: 0 }],
      calc: (v) => ({ osmGapM: v.osmMeas - v.osmCalc }),
      formula: 'Osm gap = Osm_measured − Osm_calc',
      use: 'Decide whether another mannitol dose is safe.',
      tables: [{
        cols: ['Gap (mOsm/kg)', 'Action'], rows: [
          { c: ['< 20', 'Can re-dose'], lt: 20, t: 'ok' },
          { c: ['> 20', 'Mannitol accumulating → hold (AKI risk)'], ge: 20, t: 'bad' },
        ],
      }],
      example: { v: { osmMeas: 320, na: 145, glucose: 108, bun: 14 }, expect: { osmGapM: 19 } },
    },
  ]);

  ICU.defArea({
    id: 'perf', title: 'Brain and organ perfusion', code: 'CPP',
    blurb: 'Cerebral, spinal, abdominal and renal perfusion; IAP grading; TCD and jugular bulb.',
    sections: [
      { title: 'Perfusion pressures', items: ['cpp', 'scpp', 'app', 'rpp_renal', 'iap_grade'] },
      { title: 'Brain monitoring', items: ['lindegaard', 'pi_tcd', 'avdo2', 'osmgap_mannitol'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
