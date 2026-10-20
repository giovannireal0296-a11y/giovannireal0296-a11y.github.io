/* Fluid responsiveness and echocardiography. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    ppMax: { label: 'Maximum pulse pressure (PP_max)', unit: 'mmHg', min: 5, max: 200 },
    ppMin: { label: 'Minimum pulse pressure (PP_min)', unit: 'mmHg', min: 5, max: 200 },
    svMax: { label: 'Maximum stroke volume (SV_max)', unit: 'mL', min: 5, max: 250 },
    svMin: { label: 'Minimum stroke volume (SV_min)', unit: 'mL', min: 5, max: 250 },
    svMean: { label: 'Mean stroke volume (SV_mean)', unit: 'mL', min: 5, max: 250 },
    testType: {
      label: 'Test', type: 'choice', options: [
        ['plr', 'Passive leg raise'], ['eeo', 'End-expiratory occlusion'], ['vtc', 'V_T challenge 6→8 mL/kg'],
        ['mini', 'Mini-fluid 100 mL'], ['fc', 'Fluid challenge 250–500 mL'],
      ],
    },
    before: { label: 'Value before', unit: '', min: 0, max: 10000, hint: 'CO, SV, LVOT VTI, CI, EtCO₂ or PPV.' },
    after: { label: 'Value after', unit: '', min: 0, max: 10000 },
    ivcMax: { label: 'IVC maximum diameter', unit: 'cm', min: 0.3, max: 4 },
    ivcMin: { label: 'IVC minimum diameter', unit: 'cm', min: 0.1, max: 4 },
    ivcCollapse: {
      label: 'IVC collapse on sniff', unit: '%', derive: 'ivc', calc: true, dp: 0, min: 0, max: 100,
    },
    lvotD: { label: 'LVOT diameter', unit: 'cm', min: 1.4, max: 3.2 },
    vtiLvot: { label: 'LVOT VTI', unit: 'cm', min: 3, max: 40 },
    vtiAv: { label: 'Aortic valve VTI', unit: 'cm', min: 10, max: 200 },
    vel: { label: 'Peak velocity (v)', unit: 'm/s', min: 0.2, max: 7 },
    vTR: { label: 'Peak TR velocity', unit: 'm/s', min: 0.5, max: 6 },
    vPR: { label: 'Early PR velocity', unit: 'm/s', min: 0.2, max: 5 },
  });

  const tests = {
    plr: { lbl: 'Passive leg raise', pos: (pct) => pct >= 10, txt: 'CO / SV / LVOT VTI ↑ ≥ 10% (or EtCO₂ ↑ ≥ 5%)' },
    eeo: { lbl: 'End-expiratory occlusion', pos: (pct) => pct >= 5, txt: 'CI ↑ ≥ 5%' },
    vtc: { lbl: 'V_T challenge', pos: (pct, abs) => abs >= 3.5, txt: 'PPV ↑ ≥ 3.5 absolute points' },
    mini: { lbl: 'Mini-fluid challenge', pos: (pct) => pct >= 10, txt: 'LVOT VTI ↑ ≥ 10%' },
    fc: { lbl: 'Fluid challenge', pos: (pct) => pct >= 10, txt: 'SV ↑ ≥ 10–15%' },
  };

  ICU.defFormulas('fluids', [
    {
      id: 'ppv', title: 'Pulse pressure variation', short: 'PPV',
      tags: ['fluid responsiveness', 'pulse pressure', 'arterial line', 'preload'],
      inputs: ['ppMax', 'ppMin'],
      outputs: [{ id: 'ppvV', label: 'PPV', unit: '%', dp: 0 }],
      calc: (v) => ({ ppvV: (100 * (v.ppMax - v.ppMin)) / ((v.ppMax + v.ppMin) / 2) }),
      formula: 'PPV (%) = [[PP_max − PP_min || (PP_max + PP_min) / 2]] × 100',
      use: 'Predict fluid response from the arterial line.',
      tables: [{
        cols: ['PPV', 'Meaning'], rows: [
          { c: ['< 9%', 'Unlikely responsive'], lt: 9, t: 'info' },
          { c: ['9–13%', 'Grey zone → passive leg raise or V_T challenge'], ge: 9, le: 13, t: 'mid' },
          { c: ['> 13%', 'Likely responsive'], gt: 13, t: 'ok' },
        ],
      }],
      checks: [
        'Controlled ventilation, no spontaneous effort',
        'V_T ≥ 8 mL/kg PBW',
        'Sinus rhythm',
        'Closed chest',
        'C_rs > 30 mL/cmH₂O',
        'HR/RR > 3.6',
      ],
      example: { v: { ppMax: 55, ppMin: 45 }, expect: { ppvV: 20 } },
      see: ['dyn_test'],
    },
    {
      id: 'svv', title: 'Stroke volume variation', short: 'SVV',
      tags: ['fluid responsiveness', 'pulse contour'],
      inputs: ['svMax', 'svMin', 'svMean'],
      outputs: [{ id: 'svvV', label: 'SVV', unit: '%', dp: 0 }],
      calc: (v) => ({ svvV: (100 * (v.svMax - v.svMin)) / v.svMean }),
      formula: 'SVV (%) = [[SV_max − SV_min || SV_mean]] × 100',
      use: 'Same as PPV, from pulse-contour monitors; same limitations.',
      tables: [{
        cols: ['SVV', 'Meaning'], rows: [
          { c: ['< 10%', 'Unlikely responsive'], lt: 10, t: 'info' },
          { c: ['10–12%', 'Grey zone'], ge: 10, le: 12, t: 'mid', added: true },
          { c: ['> 12%', 'Likely responsive'], gt: 12, t: 'ok' },
        ],
      }],
      checks: ['Controlled ventilation, no spontaneous effort', 'V_T ≥ 8 mL/kg PBW', 'Sinus rhythm', 'Closed chest'],
      example: { v: { svMax: 70, svMin: 60, svMean: 65 }, expect: { svvV: 15.4 } },
    },
    {
      id: 'dyn_test', title: 'Preload challenge: percent change', short: 'Δ%',
      tags: ['passive leg raise', 'plr', 'fluid challenge', 'end-expiratory occlusion', 'mini fluid', 'tidal volume challenge'],
      inputs: ['testType', 'before', 'after'],
      outputs: [
        { id: 'dpct', label: 'Change', unit: '%', dp: 1 },
        { id: 'dabs', label: 'Absolute change', unit: '', dp: 1 },
      ],
      calc: (v) => ({ dpct: (100 * (v.after - v.before)) / v.before, dabs: v.after - v.before }),
      verdict: (v) => {
        const T = tests[v.testType];
        if (!T) return null;
        return T.pos(v.dpct, v.dabs)
          ? { text: `${T.lbl}: positive (${T.txt}) → fluid responsive`, tone: 'ok' }
          : { text: `${T.lbl}: negative (needs ${T.txt})`, tone: 'info' };
      },
      formula: 'Δ% = [[Value_after − Value_before || Value_before]] × 100',
      use: 'Read any preload challenge. Works in spontaneous breathing and arrhythmia, unlike PPV.',
      tables: [{
        cols: ['Test', 'Positive if'], noVerdict: true, rows: [
          { c: ['Passive leg raise (real-time CO)', 'CO / SV / LVOT VTI ↑ ≥ 10% (or EtCO₂ ↑ ≥ 5%)'], when: (v) => v.testType === 'plr', t: 'info' },
          { c: ['End-expiratory occlusion, 15 s', 'CI ↑ ≥ 5%'], when: (v) => v.testType === 'eeo', t: 'info' },
          { c: ['V_T challenge 6 → 8 mL/kg for 1 min', 'PPV ↑ ≥ 3.5 absolute points'], when: (v) => v.testType === 'vtc', t: 'info' },
          { c: ['Mini-fluid challenge 100 mL in 1 min', 'LVOT VTI ↑ ≥ 10%'], when: (v) => v.testType === 'mini', t: 'info' },
          { c: ['Fluid challenge 250–500 mL', 'SV ↑ ≥ 10–15%'], when: (v) => v.testType === 'fc', t: 'info' },
        ],
      }],
      how: [
        'Passive leg raise: start semi-recumbent at 45°, measure CO or SV in real time.',
        'Tilt the bed so the trunk is flat and the legs rise to 45° (do not lift the legs by hand).',
        'Read the maximum change within 60–90 s, then return to the start position.',
        'Use a real-time flow measure (pulse contour, VTI, EtCO₂); blood pressure alone is not enough.',
      ],
      example: { v: { testType: 'plr', before: 18, after: 20.5 }, expect: { dpct: 13.9 } },
    },
    {
      id: 'ivc', title: 'IVC distensibility and collapsibility', short: 'dIVC · cIVC',
      tags: ['ivc', 'inferior vena cava', 'echo', 'fluid responsiveness'],
      inputs: ['ivcMax', 'ivcMin'],
      outputs: [
        { id: 'divc', label: 'dIVC (ventilated)', unit: '%', dp: 0 },
        { id: 'ivcCollapse', label: 'cIVC (spontaneous)', unit: '%', dp: 0 },
      ],
      calc: (v) => {
        if (v.ivcMin > v.ivcMax) return { _err: 'Minimum diameter cannot exceed the maximum.' };
        return { divc: (100 * (v.ivcMax - v.ivcMin)) / v.ivcMin, ivcCollapse: (100 * (v.ivcMax - v.ivcMin)) / v.ivcMax };
      },
      formula: 'dIVC = [[D_max − D_min || D_min]] × 100   cIVC = [[D_max − D_min || D_max]] × 100',
      use: 'Quick echo screen. Weak in spontaneous breathing and with high abdominal pressure.',
      tables: [{
        cols: ['Finding', 'Meaning'], multi: true, rows: [
          { c: ['dIVC > 18% (passive, ventilated)', 'Likely responsive'], when: (v) => v.divc > 18, t: 'ok', v: 'If passive and ventilated: dIVC > 18%, likely responsive' },
          { c: ['cIVC > 40–50% (spontaneous)', 'Possibly responsive'], when: (v) => v.ivcCollapse > 40, t: 'ok', v: 'If breathing spontaneously: cIVC > 40%, possibly responsive' },
          { c: ['IVC < 1 cm, collapsing', 'Hypovolaemia likely'], when: (v) => v.ivcMax < 1, t: 'mid' },
          { c: ['IVC > 2.1 cm, fixed', 'High RAP — fluid unlikely to help'], when: (v) => v.ivcMax > 2.1 && v.ivcCollapse < 20, t: 'bad' },
        ],
      }],
      example: { v: { ivcMax: 2, ivcMin: 1.5 }, expect: { divc: 33.3, ivcCollapse: 25 } },
    },
    {
      id: 'rap_ivc', title: 'Right atrial pressure from the IVC', short: 'RAP (IVC)',
      tags: ['rap', 'cvp', 'ivc', 'echo'],
      inputs: ['ivcMax', 'ivcCollapse'],
      outputs: [{ id: 'rap', label: 'Estimated RAP', unit: 'mmHg', dp: 0 }],
      calc: (v) => {
        const big = v.ivcMax > 2.1;
        const col = v.ivcCollapse > 50;
        return { rap: !big && col ? 3 : big && !col ? 15 : 8 };
      },
      formula: 'Look-up: IVC diameter and collapse on sniff',
      use: 'Estimate RAP in a spontaneously breathing patient (sPAP from TR needs it).',
      tables: [{
        cols: ['IVC diameter', 'Collapse on sniff', 'RAP ≈ (mmHg)'], rows: [
          { c: ['≤ 2.1 cm', '> 50%', '3'], when: (v) => v.ivcMax <= 2.1 && v.ivcCollapse > 50, t: 'ok' },
          { c: ['≤ 2.1 cm', '< 50%', '8'], when: (v) => v.ivcMax <= 2.1 && v.ivcCollapse <= 50, t: 'mid' },
          { c: ['> 2.1 cm', '> 50%', '8'], when: (v) => v.ivcMax > 2.1 && v.ivcCollapse > 50, t: 'mid' },
          { c: ['> 2.1 cm', '< 50%', '15'], when: (v) => v.ivcMax > 2.1 && v.ivcCollapse <= 50, t: 'bad' },
        ],
      }],
      verdict: (v) => ({ text: `RAP ≈ ${v.rap} mmHg`, tone: v.rap === 3 ? 'ok' : v.rap === 8 ? 'mid' : 'bad' }),
      example: { v: { ivcMax: 2.4, ivcMin: 2 }, expect: { rap: 15 } },
    },
    {
      id: 'sv_doppler', title: 'Stroke volume by Doppler', short: 'SV (LVOT)',
      tags: ['lvot', 'vti', 'echo', 'cardiac output', 'doppler'],
      inputs: ['lvotD', 'vtiLvot', 'hr'], optional: ['hr'],
      outputs: [
        { id: 'svDop', label: 'SV', unit: 'mL', dp: 0 },
        { id: 'coDop', label: 'CO', unit: 'L/min', dp: 1 },
      ],
      calc: (v) => {
        const sv = 0.785 * v.lvotD * v.lvotD * v.vtiLvot;
        return { svDop: sv, coDop: v.hr ? (sv * v.hr) / 1000 : null };
      },
      formula: 'SV = 0.785 × D^2 × VTI_LVOT   CO = SV × HR',
      use: 'Non-invasive cardiac output and fluid-challenge response.',
      tables: [{
        of: 'vtiLvot', cols: ['LVOT VTI', 'Meaning'], rows: [
          { c: ['18–22 cm', 'Normal'], ge: 18, t: 'ok' },
          { c: ['15–18 cm', 'Low–normal'], ge: 15, lt: 18, t: 'mid', added: true },
          { c: ['< 15 cm', 'Low stroke volume'], ge: 10, lt: 15, t: 'bad' },
          { c: ['< 10 cm', 'Very low output — cardiogenic shock range'], lt: 10, t: 'bad' },
        ],
      }],
      example: { v: { lvotD: 2, vtiLvot: 20, hr: 80 }, text: 'D 2.0 cm, VTI 20 cm → SV 63 mL; HR 80 → CO 5.0 L/min.', expect: { svDop: 62.8, coDop: 5 } },
    },
    {
      id: 'bernoulli', title: 'Simplified Bernoulli', short: '4v²',
      tags: ['bernoulli', 'gradient', 'doppler', 'velocity'],
      inputs: ['vel'],
      outputs: [{ id: 'bgrad', label: 'Pressure gradient', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ bgrad: 4 * v.vel * v.vel }),
      formula: 'ΔP = 4v^2   (v in m/s)',
      use: 'Convert any Doppler jet velocity into a pressure gradient.',
      tables: [{
        cols: ['Velocity (m/s)', 'Gradient (mmHg)'], rows: [
          { c: ['2', '16'] }, { c: ['3', '36'] }, { c: ['4', '64 (e.g. severe aortic stenosis)'] },
        ],
      }],
      example: { v: { vel: 3 }, expect: { bgrad: 36 } },
    },
    {
      id: 'pap_echo', title: 'Pulmonary pressures by echo', short: 'sPAP',
      tags: ['tricuspid regurgitation', 'pulmonary hypertension', 'spap', 'echo'],
      inputs: ['vTR', 'rap', 'vPR'], optional: ['vPR'],
      outputs: [
        { id: 'spapEcho', label: 'sPAP', unit: 'mmHg', dp: 0 },
        { id: 'mpapEcho', label: 'mPAP (from PR)', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => ({
        spapEcho: 4 * v.vTR * v.vTR + v.rap,
        mpapEcho: v.vPR != null ? 4 * v.vPR * v.vPR + v.rap : null,
      }),
      formula: 'sPAP = 4 (V_{TR,max})^2 + RAP   mPAP ≈ 4 (V_{PR,early})^2 + RAP',
      use: 'Screen for pulmonary hypertension and RV afterload. RAP can be estimated from the IVC.',
      tables: [{
        of: 'vTR', cols: ['TR peak velocity', 'PH probability (ESC/ERS)'], rows: [
          { c: ['≤ 2.8 m/s', 'Low'], le: 2.8, t: 'ok' },
          { c: ['2.9–3.4 m/s', 'Intermediate'], gt: 2.8, le: 3.4, t: 'mid' },
          { c: ['> 3.4 m/s', 'High'], gt: 3.4, t: 'bad' },
        ],
      }],
      example: { v: { vTR: 3, rap: 8 }, expect: { spapEcho: 44 } },
    },
    {
      id: 'ava', title: 'Aortic valve area (continuity equation)', short: 'AVA',
      tags: ['aortic stenosis', 'continuity', 'echo'],
      inputs: ['lvotD', 'vtiLvot', 'vtiAv'],
      outputs: [{ id: 'avaV', label: 'AVA', unit: 'cm²', dp: 2 }],
      calc: (v) => ({ avaV: (0.785 * v.lvotD * v.lvotD * v.vtiLvot) / v.vtiAv }),
      formula: 'AVA = [[LVOT_area × VTI_LVOT || VTI_AV]]   (LVOT area = 0.785 × D²)',
      use: 'Grade aortic stenosis; low-flow states can make the gradient misleading.',
      tables: [{
        cols: ['AVA', 'Stenosis'], rows: [
          { c: ['> 1.5 cm²', 'Mild'], gt: 1.5, t: 'ok' },
          { c: ['1.0–1.5 cm²', 'Moderate'], ge: 1, le: 1.5, t: 'mid' },
          { c: ['< 1.0 cm²', 'Severe (also V_max ≥ 4 m/s, mean gradient ≥ 40 mmHg)'], lt: 1, t: 'bad' },
        ],
      }],
      example: { v: { lvotD: 2, vtiLvot: 20, vtiAv: 80 }, expect: { avaV: 0.79 } },
    },
    {
      id: 'echo_ref', kind: 'ref', title: 'Other echo cut-offs', short: 'Echo',
      tags: ['e/e\'', 'tapse', 'rv', 's\'', 'fac'],
      use: 'Quick reference for common ICU echo measurements.',
      tables: [{
        cols: ['Measure', 'Normal', 'Abnormal'], rows: [
          { c: ['Average E/e′', '< 8', '> 14 = raised LV filling pressure'] },
          { c: ['TAPSE', '≥ 17 mm', '< 17 mm = RV systolic dysfunction'] },
          { c: ['Tricuspid annular S′', '≥ 9.5 cm/s', '< 9.5 cm/s'] },
          { c: ['RV fractional area change', '≥ 35%', '< 35%'] },
          { c: ['RV/LV basal diameter', '< 1.0', '> 1.0 = RV dilatation'] },
        ],
      }],
    },
  ]);

  ICU.defArea({
    id: 'fluids', title: 'Fluid responsiveness and echo', code: 'PPV',
    blurb: 'Dynamic indices, preload challenges, IVC, Doppler output and valve maths.',
    sections: [
      { title: 'Fluid responsiveness', items: ['ppv', 'svv', 'dyn_test', 'ivc'] },
      { title: 'Echocardiography', items: ['rap_ivc', 'sv_doppler', 'bernoulli', 'pap_echo', 'ava', 'echo_ref'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
