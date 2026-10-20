/* Patient effort, weaning and non-invasive support. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    pesSwing: {
      label: 'Fall in P_es during inspiration (ΔP_es)', unit: 'cmH₂O', min: 0, max: 40,
      hint: 'Size of the negative swing, entered as a positive number.',
    },
    ptpBreath: { label: 'PTP_es per breath', unit: 'cmH₂O·s', min: 0, max: 50 },
    p01: { label: 'P0.1 (as displayed)', unit: 'cmH₂O', min: 0, max: 20, hint: 'Airway pressure drop in the first 100 ms of an occluded inspiration.' },
    dPocc: {
      label: 'ΔP_occ (expiratory occlusion swing)', unit: 'cmH₂O', min: -50, max: 50,
      hint: 'Most negative P_aw swing during a brief end-expiratory hold. Sign is optional.',
    },
    roxTime: { label: 'Time on high-flow', type: 'choice', options: [['2', '2 h'], ['6', '6 h'], ['12', '12 h']] },
    vtExpList: {
      label: 'Six exhaled V_T with cuff deflated', type: 'list', unit: 'mL',
      hint: 'Separate with spaces, e.g. 380 410 395 402 370 388',
    },
  });

  const roxLow = { 2: 2.85, 6: 3.47, 12: 3.85 };

  ICU.defFormulas('effort', [
    {
      id: 'pmus', title: 'Muscle pressure (oesophageal balloon)', short: 'Pmus',
      tags: ['effort', 'p-sili', 'diaphragm', 'pressure support'],
      inputs: ['ecw', 'vt', 'pesSwing'],
      outputs: [{ id: 'pmus', label: 'P_mus', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ pmus: v.ecw * (v.vt / 1000) + Math.abs(v.pesSwing) }),
      formula: 'P_mus = E_cw · ΔV − ΔP_es',
      use: 'Titrate pressure support to an effort that protects both lung and diaphragm.',
      tables: [{
        cols: ['P_mus (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 5', 'Low effort: over-assistance, diaphragm atrophy → ↓ support'], lt: 5, t: 'mid' },
          { c: ['5–10', 'Target'], ge: 5, le: 10, t: 'ok' },
          { c: ['> 10–15', 'High effort: self-inflicted lung injury, diaphragm injury → ↑ support or sedation'], gt: 10, t: 'bad' },
        ],
      }],
      notes: ['ΔP_es is negative during inspiration, so subtracting it adds its size.'],
      example: { v: { ecw: 8, vt: 500, pesSwing: 5 }, expect: { pmus: 9 } },
    },
    {
      id: 'ptp', title: 'Pressure–time product', short: 'PTP',
      tags: ['effort', 'work of breathing', 'weaning'],
      inputs: ['ptpBreath', 'rr'],
      outputs: [{ id: 'ptpMin', label: 'PTP_es per minute', unit: 'cmH₂O·s/min', dp: 0 }],
      calc: (v) => ({ ptpMin: v.ptpBreath * v.rr }),
      formula: 'PTP = ∫ (P_cw − P_es) dt   (per breath × RR = per minute)',
      use: 'Oxygen cost of breathing. Used in research and in difficult weaning; the ventilator or software gives the per-breath value.',
      tables: [{
        cols: ['PTP_es (cmH₂O·s/min)', 'Meaning'], rows: [
          { c: ['≈ 100', 'Normal quiet breathing'], lt: 200, t: 'ok', v: 'Normal to moderate (quiet breathing ≈ 100)' },
          { c: ['> 200–250', 'High effort — weaning failure likely'], ge: 200, t: 'bad' },
        ],
      }],
      example: { v: { ptpBreath: 5, rr: 20 }, expect: { ptpMin: 100 } },
    },
    {
      id: 'p01', title: 'P0.1 (occlusion pressure)', short: 'P0.1',
      tags: ['drive', 'respiratory drive', 'weaning'],
      inputs: ['p01'],
      outputs: [{ id: 'p01V', label: 'P0.1', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ p01V: Math.abs(v.p01) }),
      formula: 'P_0.1 = P_aw(0) − P_aw(100 ms)',
      use: 'Quick check of respiratory drive in assisted modes; measured automatically on many ventilators.',
      tables: [{
        cols: ['P0.1 (cmH₂O)', 'Meaning'], rows: [
          { c: ['< 1', 'Low drive: over-assisted or over-sedated'], lt: 1, t: 'mid' },
          { c: ['1–3.5', 'Acceptable'], ge: 1, le: 3.5, t: 'ok' },
          { c: ['> 3.5–4', 'High drive: injury risk, weaning failure likely if > 4–6'], gt: 3.5, t: 'bad' },
        ],
      }],
      example: { v: { p01: 2.5 }, expect: { p01V: 2.5 } },
    },
    {
      id: 'pocc', title: 'Expiratory occlusion pressure (Bertoni)', short: 'ΔPocc',
      tags: ['effort', 'pocc', 'occlusion', 'no balloon', 'dynamic transpulmonary'],
      inputs: ['dPocc', 'ppeak', 'peepSet'],
      outputs: [
        { id: 'pmusOcc', label: 'P_mus ≈ −0.75 × ΔP_occ', unit: 'cmH₂O', dp: 1 },
        { id: 'dplDyn', label: 'ΔP_{L,dyn}', unit: 'cmH₂O', dp: 1 },
        { id: 'occ', label: 'ΔP_occ', unit: 'cmH₂O', dp: 1 },
      ],
      calc: (v) => {
        const occ = -Math.abs(v.dPocc);
        return { occ, pmusOcc: -0.75 * occ, dplDyn: (v.ppeak - v.peepSet) - 0.66 * occ };
      },
      formula: 'P_mus ≈ −0.75 × ΔP_occ   ΔP_{L,dyn} ≈ (P_peak − PEEP) − 0.66 × ΔP_occ',
      use: 'Estimate effort and dynamic lung stress without an oesophageal balloon.',
      tables: [
        {
          of: 'occ', cols: ['ΔP_occ (cmH₂O)', 'Meaning'], rows: [
            { c: ['−7 to −20', 'Acceptable effort (P_mus ≈ 5–15)'], ge: -20, le: -7, t: 'ok' },
            { c: ['More negative than −20', 'Excessive effort'], lt: -20, t: 'bad' },
            { c: ['Less negative than −7', 'Low effort, over-assistance'], gt: -7, t: 'mid' },
          ],
        },
        {
          of: 'dplDyn', cols: ['ΔP_{L,dyn} (cmH₂O)', 'Meaning'], rows: [
            { c: ['> 20', 'Injurious lung stress'], gt: 20, t: 'bad' },
            { c: ['≤ 20', 'Below the injurious threshold'], le: 20, t: 'ok', added: true },
          ],
        },
      ],
      example: { v: { dPocc: -12, ppeak: 18, peepSet: 8 }, expect: { pmusOcc: 9, dplDyn: 17.9 } },
    },
    {
      id: 'pmi', title: 'Pressure muscle index', short: 'PMI',
      tags: ['effort', 'pressure support', 'plateau'],
      inputs: ['pplat', 'ppeak'],
      outputs: [{ id: 'pmi', label: 'PMI', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ pmi: v.pplat - v.ppeak }),
      formula: 'PMI = P_plat − P_peak   (pressure support, short end-inspiratory hold)',
      use: 'A plateau above the peak means the patient was still pushing at end-inspiration.',
      tables: [{
        cols: ['PMI (cmH₂O)', 'Meaning'], rows: [
          { c: ['≤ 0', 'Low effort'], le: 0, t: 'mid' },
          { c: ['0–6', 'Moderate'], gt: 0, le: 6, t: 'ok' },
          { c: ['> 6', 'High effort → ↑ support'], gt: 6, t: 'bad' },
        ],
      }],
      example: { v: { pplat: 20, ppeak: 16 }, expect: { pmi: 4 } },
    },
    {
      id: 'rsbi', title: 'Rapid shallow breathing index', short: 'RSBI',
      tags: ['tobin', 'weaning', 'sbt', 'extubation'],
      inputs: ['rr', 'vt'],
      outputs: [{ id: 'rsbi', label: 'RSBI', unit: 'breaths/min/L', dp: 0 }],
      calc: (v) => ({ rsbi: v.rr / (v.vt / 1000) }),
      formula: 'RSBI = [[RR || V_T (L)]]',
      use: 'Readiness to extubate, measured in the first minute of a spontaneous breathing trial.',
      tables: [{
        cols: ['RSBI (breaths/min/L)', 'Meaning'], rows: [
          { c: ['< 80', 'SBT success likely'], lt: 80, t: 'ok' },
          { c: ['80–105', 'Grey zone'], ge: 80, le: 105, t: 'mid' },
          { c: ['> 105', 'Failure likely — delay extubation'], gt: 105, t: 'bad' },
        ],
      }],
      example: { v: { rr: 30, vt: 300 }, expect: { rsbi: 100 } },
    },
    {
      id: 'rox', title: 'ROX index (Roca 2019)', short: 'ROX',
      tags: ['high flow', 'hfno', 'hfnc', 'intubation'],
      inputs: ['spo2', 'fio2', 'rr', 'roxTime'],
      outputs: [{ id: 'rox', label: 'ROX', unit: '', dp: 2 }],
      calc: (v) => ({ rox: (v.spo2 / v.fio2) / v.rr }),
      formula: 'ROX = [[SpO_2 / FiO_2 || RR]]   (SpO₂ in %, FiO₂ as fraction)',
      use: 'Predict failure of high-flow nasal oxygen and avoid a delayed intubation.',
      tables: [{
        cols: ['ROX', 'Meaning / action'], rows: [
          { c: ['≥ 4.88 at 2, 6 or 12 h', 'HFNO likely to succeed'], when: (v) => v.rox >= 4.88, t: 'ok' },
          { c: ['< 2.85 (2 h) / < 3.47 (6 h) / < 3.85 (12 h)', 'High failure risk → consider intubation'], when: (v) => v.rox < roxLow[v.roxTime], t: 'bad' },
          { c: ['In between', 'Reassess in 1–2 h'], when: (v) => v.rox < 4.88 && v.rox >= roxLow[v.roxTime], t: 'mid' },
        ],
      }],
      example: { v: { spo2: 92, fio2: 0.6, rr: 30, roxTime: '6' }, expect: { rox: 5.11 } },
    },
    {
      id: 'cuffleak', title: 'Cuff leak test', short: 'Leak',
      tags: ['stridor', 'laryngeal oedema', 'extubation', 'cuff'],
      inputs: ['vt', 'vtExpList'],
      outputs: [
        { id: 'leak', label: 'Cuff leak', unit: 'mL', dp: 0 },
        { id: 'leakPct', label: 'Leak, % of V_T', unit: '%', dp: 0 },
        { id: 'vtExpMean', label: 'Mean of the 3 lowest exhaled V_T', unit: 'mL', dp: 0 },
      ],
      calc: (v) => {
        const xs = v.vtExpList.slice().sort((a, b) => a - b);
        if (xs.length < 3) return { _err: 'Enter at least three exhaled volumes (six are recommended).' };
        const low = xs.slice(0, 3);
        const mean = (low[0] + low[1] + low[2]) / 3;
        const leak = v.vt - mean;
        const r = { vtExpMean: mean, leak, leakPct: (100 * leak) / v.vt };
        if (xs.length !== 6) r._msgs = [`Used the 3 lowest of ${xs.length} breaths; the standard test uses 6.`];
        return r;
      },
      formula: 'Leak = V_{T,insp} − mean of the 3 lowest of 6 V_{T,exp}',
      use: 'Predict post-extubation stridor in high-risk patients: long or traumatic intubation, women, large tube.',
      how: [
        'Volume control, patient passive. Suction the mouth and above the cuff.',
        'Note the inspired V_T with the cuff inflated.',
        'Deflate the cuff completely.',
        'Record the exhaled V_T of the next six breaths.',
        'Average the three lowest exhaled values; the leak is inspired V_T minus that average.',
        'Re-inflate the cuff.',
      ],
      tables: [{
        cols: ['Leak', 'Meaning / action'], rows: [
          { c: ['≥ 110 mL (or > 25% of V_T)', 'Low stridor risk'], when: (v) => v.leak >= 110 || v.leakPct > 25, t: 'ok' },
          { c: ['< 110 mL', 'Laryngeal oedema risk → steroids 4–12 h before extubation, airway plan'], when: (v) => !(v.leak >= 110 || v.leakPct > 25), t: 'bad' },
        ],
      }],
      example: { v: { vt: 450, vtExpList: [380, 410, 395, 402, 370, 388] }, expect: { vtExpMean: 379.3, leak: 70.7 } },
    },
  ]);

  ICU.defArea({
    id: 'effort', title: 'Effort, weaning and NIV', code: 'P0.1',
    blurb: 'Muscle pressure, drive, weaning indices, high-flow and the cuff leak test.',
    sections: [
      { title: 'Patient effort', items: ['pmus', 'pocc', 'p01', 'pmi', 'ptp'] },
      { title: 'Weaning and non-invasive support', items: ['rsbi', 'rox', 'cuffleak'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
