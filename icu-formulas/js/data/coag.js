/* Coagulation: ROTEM and TEG calculators, the step-up bleeding algorithm and references. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    setting: {
      label: 'Setting', type: 'choice',
      options: [['trauma', 'Trauma'], ['cardiac', 'Cardiac surgery'], ['liver', 'Liver transplant'], ['pph', 'Postpartum haemorrhage']],
    },
    bleeding: { label: 'Diffuse, non-surgical bleeding?', type: 'choice', options: [['yes', 'Yes'], ['no', 'No']] },
    temp: { label: 'Temperature', unit: '°C', min: 25, max: 43 },
    fibA5: { label: 'FIBTEM A5', unit: 'mm', min: 0, max: 50 },
    extA5: { label: 'EXTEM A5', unit: 'mm', min: 0, max: 80 },
    extCt: { label: 'EXTEM CT', unit: 's', min: 20, max: 1000 },
    intCt: { label: 'INTEM CT', unit: 's', min: 50, max: 2000 },
    hepCt: { label: 'HEPTEM CT', unit: 's', min: 50, max: 2000 },
    mlExt: { label: 'Maximum lysis, EXTEM or FIBTEM (ML)', unit: '%', min: 0, max: 100 },
    mcf: { label: 'MCF (maximum clot firmness)', unit: 'mm', min: 1, max: 90 },
    aLowest: { label: 'Lowest amplitude after MCF', unit: 'mm', min: 0, max: 90 },
    a30: { label: 'Amplitude 30 min after CT (A30)', unit: 'mm', min: 0, max: 90 },
    fibTarget: { label: 'Target FIBTEM A5', unit: 'mm', dflt: 12, min: 5, max: 25, hint: '≥ 12 in most settings, ≥ 16 in postpartum haemorrhage.' },
    fibFactor: { label: 'Correction factor', unit: '', dflt: 160, min: 100, max: 200, hint: '140–160 depending on plasma volume.' },
    cirrhosis: { label: 'Cirrhosis?', type: 'choice', options: [['no', 'No'], ['yes', 'Yes']] },
  });

  const TRIG = {
    trauma: { fib: 9, plt: 35, ct: 80, ml: 5, target: 12, name: 'trauma' },
    cardiac: { fib: 9, plt: 30, ct: 80, ml: 15, target: 12, name: 'cardiac surgery' },
    liver: { fib: 8, plt: 25, ct: 75, ml: 15, target: 12, name: 'liver transplant' },
    pph: { fib: 12, plt: 35, ct: 80, ml: 15, target: 16, name: 'postpartum haemorrhage' },
  };

  function pltDoses(a5) {
    if (a5 < 20) return '2 adult doses + fibrinogen ≥ 4 g';
    if (a5 < 28) return '2 adult doses';
    return '1 adult dose';
  }

  // Walks the 8 steps of the step-up algorithm and says what each one needs.
  function algorithm(v) {
    const T = TRIG[v.setting];
    const steps = [];
    const add = (title, status, text) => steps.push({ title, status, text });
    const kg = v.weight;

    if (v.bleeding === 'no') {
      add('Is there diffuse, non-surgical bleeding?', 'act', 'No: do not treat abnormal numbers. Observe and re-test if bleeding starts.');
      ['Basic conditions', 'Fibrinolysis', 'Fibrinogen', 'Platelets', 'Coagulation factors', 'Heparin effect', 'Still bleeding?']
        .forEach((t) => add(t, 'skip', 'Not needed without clinical bleeding.'));
      return steps;
    }
    add('Is there diffuse, non-surgical bleeding?', 'ok', 'Yes: work down the steps; re-test 10–15 min after each intervention (no more than 3 at once).');

    const basic = [];
    if (v.temp != null && v.temp <= 35) basic.push(`warm (T ${ICU.fmt(v.temp, 1)} °C, target > 35)`);
    if (v.ph != null && v.ph <= 7.3) basic.push(`correct acidosis (pH ${ICU.fmt(v.ph, 2)}, target > 7.3)`);
    if (v.caIon != null && v.caIon <= 1) basic.push(`give calcium (iCa ${ICU.fmt(v.caIon, 2)}, target > 1 mmol/L)`);
    if (v.hb != null && v.hb < 7) basic.push(`transfuse red cells (Hb ${ICU.fmt(v.hb, 1)}, target ≥ 7 g/dL)`);
    const anyBasic = v.temp != null || v.ph != null || v.caIon != null || v.hb != null;
    add('Basic conditions', basic.length ? 'act' : anyBasic ? 'ok' : 'info',
      basic.length ? 'Correct first: ' + basic.join('; ') + '. Coagulation products work poorly without these.'
        : anyBasic ? 'Temperature, pH, ionised Ca and Hb are in range (for the values entered).'
          : 'Check temperature > 35 °C, pH > 7.3, ionised Ca > 1 mmol/L, Hb ≥ 7 g/dL.');

    if (v.mlExt == null) add('Fibrinolysis', 'info', `Enter ML to check. Trigger: ML ${T.ml === 5 ? '≥ 5%' : '> 15%'} in EXTEM or FIBTEM (better in APTEM); TEG LY30 > 3% in trauma.`);
    else if (v.mlExt >= T.ml && (T.ml === 5 || v.mlExt > 15)) {
      add('Fibrinolysis', 'act', `ML ${ICU.fmt(v.mlExt, 0)}%: hyperfibrinolysis → tranexamic acid 1 g IV (≈ 25 mg/kg)${kg ? ` ≈ ${ICU.fmt(25 * kg / 1000, 1)} g` : ''}. ${v.setting === 'trauma' || v.setting === 'pph' ? 'Give early, within 3 h.' : v.setting === 'liver' ? 'Post-reperfusion lysis is often self-limiting: recheck before TXA.' : ''}`);
    } else add('Fibrinolysis', 'ok', `ML ${ICU.fmt(v.mlExt, 0)}%: no hyperfibrinolysis.`);

    const fibLow = v.fibA5 < T.fib;
    if (fibLow) {
      const target = v.fibTarget || T.target;
      const g = kg ? ((target - v.fibA5) * kg) / 160 : null;
      add('Fibrinogen', 'act', `FIBTEM A5 ${ICU.fmt(v.fibA5, 0)} mm (< ${T.fib}): give fibrinogen` +
        (g ? ` ≈ ${ICU.fmt(g, 1)} g to reach ${target} mm (or cryoprecipitate ≈ ${ICU.fmt(g * 5, 0)} U)` : '; enter weight for the dose (g = ΔA5 × kg ÷ 160)') + '.');
    } else add('Fibrinogen', 'ok', `FIBTEM A5 ${ICU.fmt(v.fibA5, 0)} mm: adequate for ${T.name} (trigger < ${T.fib}).`);

    if (v.extA5 < T.plt) {
      const inc = v.cirrhosis === 'yes' ? '≈ 5' : '8–10';
      add('Platelets', 'act', `EXTEM A5 ${ICU.fmt(v.extA5, 0)} mm (< ${T.plt}): ${fibLow ? 'correct fibrinogen first and re-test; if still low, ' : ''}platelets, ${pltDoses(v.extA5)} (each dose raises EXTEM A5 by ${inc} mm). Desmopressin if on antiplatelets.`);
    } else add('Platelets', 'ok', `EXTEM A5 ${ICU.fmt(v.extA5, 0)} mm: adequate (trigger < ${T.plt}).`);

    if (v.extCt > T.ct) {
      const pcc = kg ? ` ≈ ${ICU.fmt(20 * kg, 0)}–${ICU.fmt(25 * kg, 0)} IU` : '';
      const ffp = kg ? ` ≈ ${ICU.fmt(10 * kg, 0)}–${ICU.fmt(15 * kg, 0)} mL` : '';
      add('Coagulation factors', 'act', `EXTEM CT ${ICU.fmt(v.extCt, 0)} s (> ${T.ct}): ${fibLow ? 'low fibrinogen alone prolongs CT, so treat fibrinogen and re-test first; if still long, ' : ''}4F-PCC 20–25 IU/kg${pcc}${v.setting === 'liver' || v.cirrhosis === 'yes' ? ' (less in cirrhosis)' : ''} or FFP 10–15 mL/kg${ffp}.`);
    } else add('Coagulation factors', 'ok', `EXTEM CT ${ICU.fmt(v.extCt, 0)} s: normal for this setting (trigger > ${T.ct}).`);

    if (v.intCt != null && v.hepCt != null) {
      const r = v.intCt / v.hepCt;
      if (r >= 1.25) add('Heparin effect', 'act', `INTEM/HEPTEM CT ratio ${ICU.fmt(r, 2)} (≥ 1.25): heparin or heparin-like effect → protamine if bleeding${v.setting === 'liver' ? '; after reperfusion it is often self-limiting' : ''}.`);
      else add('Heparin effect', 'ok', `INTEM/HEPTEM CT ratio ${ICU.fmt(r, 2)}: no relevant heparin effect.`);
    } else add('Heparin effect', 'info', 'Enter INTEM and HEPTEM CT to check (check first in cardiac surgery).');

    const acted = steps.some((s) => s.status === 'act');
    add('Still bleeding with a normal trace?', acted ? 'info' : 'act',
      'Look for surgical bleeding, antiplatelet effect (platelet function test), factor XIII; rFVIIa only as a last resort.');
    return steps;
  }

  ICU.defFormulas('coag', [
    {
      id: 'rotem_algo', title: 'Bleeding algorithm: what to give', short: 'Step-up',
      tags: ['rotem', 'teg', 'bleeding', 'algorithm', 'fibrinogen', 'txa', 'pcc', 'platelets', 'massive transfusion'],
      inputs: ['setting', 'bleeding', 'fibA5', 'extA5', 'extCt', 'mlExt', 'intCt', 'hepCt', 'weight', 'temp', 'ph', 'caIon', 'hb', 'fibTarget', 'cirrhosis'],
      optional: ['mlExt', 'intCt', 'hepCt', 'weight', 'temp', 'ph', 'caIon', 'hb', 'fibTarget', 'cirrhosis'],
      outputs: [{ id: 'steps', label: 'Steps', type: 'steps' }],
      calc: (v) => ({ steps: algorithm(v) }),
      verdict: (v) => {
        const n = v.steps.filter((s) => s.status === 'act').length;
        if (v.bleeding === 'no') return { text: 'No clinical bleeding: do not treat the numbers', tone: 'ok' };
        return n ? { text: `${n} step${n > 1 ? 's' : ''} need action — treat in order and re-test`, tone: 'bad' } : { text: 'No trigger met', tone: 'ok' };
      },
      formula: 'ROTEM A5 triggers by setting (Görlinger 2019), in order: lysis → fibrinogen → platelets → factors → heparin',
      use: 'Enter the ROTEM values and the app walks the step-up algorithm for your setting, with doses. Read FIBTEM before EXTEM CT: low fibrinogen alone prolongs CT.',
      tables: [{
        title: 'ROTEM A5 triggers by setting (Görlinger 2019)', cols: ['Setting', 'Fibrinogen (FIBTEM A5)', 'Platelets (EXTEM A5)', 'Factors (EXTEM CT)', 'Notes'], noVerdict: true, rows: [
          { c: ['Trauma', '< 9 mm or flat line', '< 35 mm', '> 80 s', 'TXA within 3 h; later only with lysis or coagulopathy'], when: (v) => v.setting === 'trauma', t: 'info' },
          { c: ['Cardiac surgery', '< 9 mm (target ≥ 12)', '< 30 mm or low ADPTEM after protamine', '> 80 s', 'Check heparin / protamine first'], when: (v) => v.setting === 'cardiac', t: 'info' },
          { c: ['Liver transplant', '< 8 mm', '< 25 mm', '> 75 s', 'Platelet transfusion linked to mortality — FIBTEM A5 ≥ 12 can compensate; FIBTEM MCF > 18–25 mm flags thrombosis risk'], when: (v) => v.setting === 'liver', t: 'info' },
          { c: ['Postpartum haemorrhage', '< 12 mm (target ≥ 16)', 'As trauma', 'As trauma', 'Early TXA'], when: (v) => v.setting === 'pph', t: 'info' },
        ],
      }],
      notes: ['Triggers differ by device and setting: follow your local algorithm. Treat clinically relevant bleeding, not abnormal numbers.'],
      example: { v: { setting: 'trauma', bleeding: 'yes', fibA5: 6, extA5: 30, extCt: 90, mlExt: 2, weight: 80 }, expect: {} },
      guide: 'bleeding',
      refs: ['Görlinger K et al. ROTEM-guided algorithms. Korean J Anesthesiol 2019.'],
    },
    {
      id: 'pltem', title: 'Platelet contribution (PLTEM)', short: 'PLTEM',
      tags: ['rotem', 'platelets', 'fibtem', 'extem'],
      inputs: ['extA5', 'fibA5'],
      outputs: [{ id: 'pltemV', label: 'PLTEM A5', unit: 'mm', dp: 0 }],
      calc: (v) => ({ pltemV: v.extA5 - v.fibA5 }),
      formula: 'PLTEM = A5_EXTEM − A5_FIBTEM',
      use: 'Separate a platelet problem from a fibrinogen problem when EXTEM firmness is low.',
      tables: [{
        cols: ['Finding', 'Meaning'], multi: true, rows: [
          { c: ['EXTEM low, FIBTEM normal', 'Platelet deficit or dysfunction'], when: (v) => v.extA5 < 35 && v.fibA5 >= 9, t: 'mid' },
          { c: ['EXTEM low, FIBTEM low', 'Fix fibrinogen first — may be enough'], when: (v) => v.extA5 < 35 && v.fibA5 < 9, t: 'mid' },
          { c: ['PLTEM A5 ≤ 16 mm (ROTEM sigma)', 'Platelets < 50 × 10⁹/L likely'], when: (v) => v.pltemV <= 16, t: 'bad' },
        ],
      }],
      notes: ['"Low" and "normal" use the trauma triggers here (EXTEM A5 < 35, FIBTEM A5 < 9).'],
      example: { v: { extA5: 28, fibA5: 10 }, expect: { pltemV: 18 } },
    },
    {
      id: 'ml', title: 'Maximum lysis', short: 'ML',
      tags: ['fibrinolysis', 'hyperfibrinolysis', 'txa', 'rotem'],
      inputs: ['mcf', 'aLowest', 'setting'], optional: ['setting'],
      outputs: [{ id: 'mlV', label: 'ML', unit: '%', dp: 0 }],
      calc: (v) => ({ mlV: (100 * (v.mcf - v.aLowest)) / v.mcf }),
      formula: 'ML (%) = [[MCF − A_{lowest after MCF} || MCF]] × 100',
      use: 'Detect hyperfibrinolysis; FIBTEM is the most sensitive assay for it. Choose the setting for the trauma threshold.',
      tables: [{
        cols: ['Result', 'Meaning / action'], rows: [
          { c: ['ML < 15% (EXTEM LI60 82–98%)', 'Physiological lysis'], when: (v) => v.mlV < (v.setting === 'trauma' ? 5 : 15), t: 'ok' },
          { c: ['ML > 15% (trauma ≥ 5%), corrected in APTEM', 'Hyperfibrinolysis → TXA'], when: (v) => v.mlV >= (v.setting === 'trauma' ? 5 : 15), t: 'bad' },
          { c: ['EXTEM LI60 ≥ 98%', 'Fibrinolysis shutdown (trauma) — TXA not indicated'] },
          { c: ['Liver transplant', 'Pre-anhepatic lysis is dangerous; post-reperfusion lysis is often self-limiting — recheck before TXA'], when: (v) => v.setting === 'liver', t: 'info' },
        ],
      }],
      example: { v: { mcf: 60, aLowest: 45 }, expect: { mlV: 25 } },
    },
    {
      id: 'li30', title: 'Lysis index at 30 minutes', short: 'LI30',
      tags: ['fibrinolysis', 'li30', 'rotem'],
      inputs: ['a30', 'mcf'],
      outputs: [{ id: 'li30V', label: 'LI30', unit: '%', dp: 0 }],
      calc: (v) => ({ li30V: (100 * v.a30) / v.mcf }),
      formula: 'LI30 (%) = [[A_{30 min after CT} || MCF]] × 100',
      use: 'Clot remaining 30 min after CT; normal 94–100%.',
      tables: [{
        cols: ['LI30', 'Meaning'], rows: [
          { c: ['94–100%', 'Normal'], ge: 94, t: 'ok' },
          { c: ['< 94%', 'Early lysis — check ML and APTEM'], lt: 94, t: 'bad', added: true },
        ],
      }],
      example: { v: { a30: 57, mcf: 60 }, expect: { li30V: 95 } },
    },
    {
      id: 'hle', title: 'Heparin-like effect ratio', short: 'INTEM/HEPTEM',
      tags: ['heparin', 'protamine', 'heptem', 'cardiac surgery', 'reperfusion'],
      inputs: ['intCt', 'hepCt'],
      outputs: [{ id: 'hleV', label: 'CT_INTEM / CT_HEPTEM', unit: '', dp: 2 }],
      calc: (v) => ({ hleV: v.intCt / v.hepCt }),
      formula: 'HLE ratio = [[CT_INTEM || CT_HEPTEM]]',
      use: 'Detect residual heparin after bypass, or a heparin-like effect after liver graft reperfusion, severe shock or trauma.',
      tables: [{
        cols: ['Ratio', 'Meaning / action'], rows: [
          { c: ['≤ 1 with a long ACT (cardiac)', 'Suggests protamine excess — do not give more'], le: 1, t: 'mid', v: 'Ratio ≤ 1: if the ACT is long, suspect protamine excess' },
          { c: ['< 1.25', 'No relevant heparin effect'], gt: 1, lt: 1.25, t: 'ok' },
          { c: ['≥ 1.25', 'Mild heparin / heparin-like effect'], ge: 1.25, lt: 2, t: 'mid' },
          { c: ['≥ 2.0', 'Severe → protamine if bleeding'], ge: 2, t: 'bad' },
        ],
      }],
      example: { v: { intCt: 300, hepCt: 200 }, expect: { hleV: 1.5 } },
    },
    {
      id: 'fib_dose', title: 'Fibrinogen dose (Görlinger)', short: 'Fibrinogen',
      tags: ['fibrinogen', 'cryoprecipitate', 'fibtem', 'dose'],
      inputs: ['fibA5', 'fibTarget', 'weight', 'fibFactor'],
      outputs: [
        { id: 'fibG', label: 'Fibrinogen concentrate', unit: 'g', dp: 1 },
        { id: 'cryoU', label: 'or cryoprecipitate', unit: 'U', dp: 0 },
        { id: 'dA5', label: 'Target rise in FIBTEM A5', unit: 'mm', dp: 0 },
      ],
      calc: (v) => {
        const d = v.fibTarget - v.fibA5;
        if (d <= 0) return { _err: 'FIBTEM A5 is already at or above the target.' };
        const g = (d * v.weight) / v.fibFactor;
        return { dA5: d, fibG: g, cryoU: g * 5 };
      },
      formula: 'Fibrinogen (g) = [[ΔA5_FIBTEM (mm) × weight (kg) || 160]]   (10 U cryoprecipitate ≈ 2 g fibrinogen)',
      use: 'Dose fibrinogen concentrate to a FIBTEM target rather than a fixed amount.',
      tables: [{
        title: 'For an 80 kg adult', cols: ['Target rise in FIBTEM A5', 'Fibrinogen concentrate', 'Cryoprecipitate'], rows: [
          { c: ['+ 4 mm', '2 g', '10 U'] }, { c: ['+ 8 mm', '4 g', '20 U'] }, { c: ['+ 12 mm', '6 g', '30 U'] },
        ],
      }],
      example: { v: { fibA5: 4, fibTarget: 12, weight: 80, fibFactor: 160 }, expect: { fibG: 4, cryoU: 20 } },
    },
    {
      id: 'plt_dose', title: 'Platelets by EXTEM A5', short: 'Platelets',
      tags: ['platelets', 'extem', 'dose', 'trauma'],
      inputs: ['extA5', 'cirrhosis'], optional: ['cirrhosis'],
      outputs: [{ id: 'pltRise', label: 'Expected rise per adult dose', unit: 'mm', dp: 0, range: true }],
      calc: (v) => ({ pltRise: v.cirrhosis === 'yes' ? [5, 5] : [8, 10] }),
      formula: 'ΔA5_EXTEM ≈ 8–10 mm per adult platelet dose (≈ 5 mm in cirrhosis)',
      use: 'Size a platelet transfusion from EXTEM firmness (trauma algorithm), once FIBTEM is adequate.',
      tables: [{
        cols: ['EXTEM A5', 'Platelets'], rows: [
          { c: ['≥ 35 mm', 'None needed (trauma trigger < 35)'], ge: 35, t: 'ok', added: true },
          { c: ['28–35 mm', '1 adult dose'], ge: 28, lt: 35, t: 'mid' },
          { c: ['20–28 mm', '2 adult doses'], ge: 20, lt: 28, t: 'bad' },
          { c: ['< 20 mm', '2 adult doses + fibrinogen ≥ 4 g'], lt: 20, t: 'bad' },
        ],
      }],
      example: { v: { extA5: 25 }, expect: { pltRise: [8, 10] } },
    },
    {
      id: 'rotem_assays', kind: 'ref', title: 'ROTEM assays and TEG analogues', short: 'Assays',
      tags: ['extem', 'intem', 'fibtem', 'aptem', 'heptem', 'kaolin'],
      use: 'Which test answers which question.',
      tables: [{
        cols: ['ROTEM', 'TEG analogue', 'Activator / additive', 'What it shows'], rows: [
          { c: ['EXTEM', 'Rapid TEG (CRT)', 'Tissue factor', 'Extrinsic pathway and overall clot'] },
          { c: ['INTEM', 'Kaolin (CK)', 'Contact activator', 'Intrinsic pathway; heparin-sensitive'] },
          { c: ['FIBTEM', 'Functional fibrinogen (CFF)', 'Tissue factor + platelet blocker', 'Fibrin contribution alone'] },
          { c: ['APTEM', '—', 'Tissue factor + antifibrinolytic', 'Confirms fibrinolysis (clot better than EXTEM)'] },
          { c: ['HEPTEM', 'Kaolin + heparinase (CKH)', 'Contact activator + heparinase', 'Heparin effect (CT better than INTEM)'] },
        ],
      }],
      guide: 'rotemtrace',
    },
    {
      id: 'rotem_params', kind: 'ref', title: 'ROTEM / TEG parameters and normal ranges', short: 'Ranges',
      tags: ['ct', 'cft', 'mcf', 'ma', 'r time', 'k time', 'alpha', 'ly30', 'normal values'],
      use: 'ROTEM delta adult ranges and TEG kaolin. Ranges vary by device (ROTEM sigma, TEG 6s) and laboratory.',
      tables: [{
        cols: ['ROTEM', 'TEG', 'Reflects', 'ROTEM normal', 'TEG normal'], rows: [
          { c: ['CT (s)', 'R (min)', 'Clot initiation: factors, anticoagulants, heparin', 'EXTEM 38–79; INTEM 100–240', '≈ 5–10'] },
          { c: ['CFT (s)', 'K (min)', 'Clot build-up from 2 to 20 mm: fibrinogen, platelets', 'EXTEM 34–159; INTEM 30–110', '1–3'] },
          { c: ['α angle (°)', 'α angle (°)', 'Build-up speed as a slope', 'EXTEM 63–83; INTEM 70–83', '53–72'] },
          { c: ['A5, A10 (mm)', '—', 'Firmness 5 or 10 min after CT; predicts MCF, so you can act at 10 min', 'EXTEM A10 43–65; FIBTEM A10 7–23', '—'] },
          { c: ['MCF (mm)', 'MA (mm)', 'Maximum clot strength: platelets + fibrinogen', 'EXTEM / INTEM 50–72; FIBTEM 9–25', '50–70'] },
          { c: ['ML, LI30 (%)', 'LY30 (%)', 'Fibrinolysis', 'ML < 15% in 60 min; LI30 94–100%', '0–8% (> 3% treated in trauma)'] },
        ],
      }],
      guide: 'rotemtrace',
    },
    {
      id: 'rotem_patterns', kind: 'ref', title: 'Characteristic ROTEM / TEG patterns', short: 'Patterns',
      tags: ['vka', 'hyperfibrinolysis', 'heparin', 'hypercoagulable', 'pattern'],
      use: 'Recognise the problem from the trace.',
      tables: [{
        cols: ['Problem', 'ROTEM', 'TEG', 'Treatment'], rows: [
          { c: ['Factor deficit / VKA', 'EXTEM CT ↑, FIBTEM normal', 'R ↑', '4F-PCC or FFP'] },
          { c: ['Low fibrinogen', 'FIBTEM A5 / MCF ↓', 'K ↑, α ↓, CFF MA ↓', 'Fibrinogen concentrate or cryo'] },
          { c: ['Platelet deficit / dysfunction', 'EXTEM A5 ↓, FIBTEM normal', 'MA ↓', 'Platelets ± desmopressin'] },
          { c: ['Hyperfibrinolysis', 'ML ↑ in EXTEM, normal in APTEM', 'LY30 ↑', 'Tranexamic acid'] },
          { c: ['Heparin / heparin-like effect', 'INTEM CT ↑, HEPTEM normal', 'R ↑, normal with heparinase', 'Protamine (if bleeding)'] },
          { c: ['Hypercoagulable', 'MCF ↑ (FIBTEM MCF > 25)', 'R short, MA > 70', 'No procoagulants; thromboprophylaxis'] },
        ],
      }],
    },
    {
      id: 'teg_triggers', kind: 'ref', title: 'Classic TEG (kaolin) triggers', short: 'TEG',
      tags: ['teg', 'r time', 'ma', 'ly30', 'kaolin'],
      use: 'Treatment triggers when you have a TEG rather than a ROTEM.',
      tables: [{
        cols: ['TEG', 'Meaning', 'Treatment'], rows: [
          { c: ['R > 10 min', 'Factor deficit (or heparin: check heparinase cup)', 'FFP or PCC'] },
          { c: ['K > 3 min or α < 53°', 'Low fibrinogen', 'Cryo / fibrinogen concentrate'] },
          { c: ['MA < 50 mm', 'Low platelets or poor function', 'Platelets ± desmopressin'] },
          { c: ['LY30 > 3% (trauma)', 'Hyperfibrinolysis', 'Tranexamic acid'] },
        ],
      }],
      refs: ['TEG interpretation, surgicalcriticalcare.net.'],
    },
  ]);

  ICU.defArea({
    id: 'coag', title: 'Coagulation: ROTEM and TEG', code: 'A5',
    blurb: 'The step-up bleeding algorithm, lysis, heparin effect and fibrinogen and platelet dosing.',
    sections: [
      { title: 'Bleeding patient', items: ['g:bleeding', 'rotem_algo', 'fib_dose', 'plt_dose'] },
      { title: 'Reading the trace', items: ['g:rotemtrace', 'pltem', 'ml', 'li30', 'hle'] },
      { title: 'Reference', items: ['rotem_assays', 'rotem_params', 'rotem_patterns', 'teg_triggers'] },
    ],
  });

  ICU.rotemAlgorithm = algorithm;
})(typeof window !== 'undefined' ? window : globalThis);
