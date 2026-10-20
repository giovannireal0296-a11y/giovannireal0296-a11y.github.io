/* Mechanical ventilation: passive mechanics, partitioned mechanics,
   lung-protective targets, recruitment and PEEP. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    pesEi: {
      label: 'P_es at end-inspiration (P_{es,ei})', unit: 'cmH₂O', min: -10, max: 40,
      hint: 'Oesophageal pressure during the end-inspiratory hold.',
    },
    pesEe: {
      label: 'P_es at end-expiration (P_{es,ee})', unit: 'cmH₂O', min: -10, max: 35,
      hint: 'Oesophageal pressure during the end-expiratory hold.',
    },
    crs: { label: 'Static compliance (C_rs)', unit: 'mL/cmH₂O', derive: 'crs', calc: true, dp: 0 },
    ers: { label: 'Elastance (E_rs)', unit: 'cmH₂O/L', derive: 'crs', calc: true, dp: 1 },
    rrs: { label: 'Resistance (R_rs)', unit: 'cmH₂O/L/s', derive: 'rrs', calc: true, dp: 1 },
    dp: { label: 'Driving pressure (ΔP)', unit: 'cmH₂O', derive: 'dp', calc: true, dp: 0 },
    el: { label: 'Lung elastance (E_L)', unit: 'cmH₂O/L', derive: 'part_e', calc: true, dp: 1 },
    ecw: {
      label: 'Chest-wall elastance (E_cw)', unit: 'cmH₂O/L', derive: 'part_e', calc: false, dp: 1, min: 2, max: 30,
      hint: 'From a passive breath with an oesophageal balloon. Predicted ≈ 0.28 ÷ (1% of VC in L), usually 4–8.',
    },
    elRatio: { label: 'E_L / E_rs', unit: '', derive: 'part_e', calc: true, dp: 2 },
    dpl: { label: 'Transpulmonary driving pressure (ΔP_L)', unit: 'cmH₂O', derive: 'dpl', calc: true, dp: 0 },
    ti: { label: 'Inspiratory time (T_i)', unit: 's', min: 0.3, max: 4 },
    te: { label: 'Expiratory time (T_e)', unit: 's', derive: 'te', calc: true, dp: 2, min: 0.2, max: 15 },
    ieE: { label: 'I:E ratio, 1 : …', unit: '', min: 0.3, max: 8, dflt: 2, hint: 'Enter 2 for I:E 1:2.' },
    eelv: {
      label: 'End-expiratory lung volume (EELV)', unit: 'mL', min: 200, max: 6000,
      hint: 'At the current PEEP: nitrogen washout, helium dilution or CT.',
    },
    vpeep: {
      label: 'Volume added by PEEP (V_PEEP)', unit: 'mL', min: 0, max: 3000,
      hint: 'Extra volume exhaled when PEEP is released to zero during an expiratory hold.',
    },
    peepHigh: { label: 'PEEP high', unit: 'cmH₂O', dflt: 15, min: 5, max: 30 },
    peepLow: { label: 'PEEP low', unit: 'cmH₂O', dflt: 5, min: 0, max: 20 },
    pplatLow: {
      label: 'P_plat at PEEP low', unit: 'cmH₂O', min: 5, max: 50,
      hint: 'End-inspiratory hold on a breath at the low PEEP (step 5).',
    },
    vExpRelease: {
      label: 'Exhaled volume of the release breath', unit: 'mL', min: 100, max: 3000,
      hint: 'The single breath on which PEEP drops from high to low (step 4).',
    },
    aop: {
      label: 'Airway opening pressure (AOP)', unit: 'cmH₂O', min: 0, max: 25,
      hint: 'Only if a low-flow inflation shows airway closure above PEEP low (step 2).',
    },
    deelv: { label: 'ΔEELV (release volume − V_T)', unit: 'mL', derive: 'deelv', calc: true, dp: 0 },
    crsLow: { label: 'C_{rs,low} (compliance at PEEP low)', unit: 'mL/cmH₂O', derive: 'crs_low', calc: true, dp: 1 },
    sip1: { label: 'P_aw at time t', unit: 'cmH₂O', min: 0, max: 80 },
    sip2: { label: 'P_aw at time 2t', unit: 'cmH₂O', min: 0, max: 80 },
    sip3: { label: 'P_aw at time 3t', unit: 'cmH₂O', min: 0, max: 80 },
  });

  const ref = [
    'Henderson, Chen, Amato & Brochard, Respiratory Mechanics in ARDS, AJRCCM 2017;196:822–833.',
  ];

  ICU.defFormulas('vent', [
    {
      id: 'eom', kind: 'ref', title: 'Equation of motion', short: 'EOM',
      tags: ['passive', 'elastic', 'resistive', 'pmus'],
      formula: 'P_aw + P_mus = E_rs·ΔV + R_rs·V̇ (+ I_rs·V̈)',
      use: 'The model behind every ventilator number. Pressure is spent stretching the system (elastic) and pushing gas through the tubes (resistive); inertance is negligible. In a passive patient (P_mus = 0): P_aw = E_rs·V_insp + R_rs·V̇ + PEEP_tot.',
      tables: [
        {
          cols: ['Term', 'Rises with'], rows: [
            { c: ['Elastic (E × ΔV)', 'Larger V_T, stiff or small lung, stiff chest wall'] },
            { c: ['Resistive (R × V̇)', 'Higher flow, bronchospasm, secretions, narrow or kinked tube'] },
            { c: ['P_mus', 'Patient effort — invalidates passive measurements'] },
          ],
        },
        {
          title: 'Is the patient passive?', cols: ['Waveform (volume control, constant flow)', 'Meaning'], rows: [
            { c: ['Smooth rise, flat plateau on hold', 'Passive: measurements valid'] },
            { c: ['Scooped P_aw, plateau lower than expected or unstable', 'Patient effort: repeat when passive'] },
          ],
        },
      ],
      guide: 'holds',
    },
    {
      id: 'peepi', title: 'Intrinsic PEEP', short: 'PEEPi', tags: ['auto-peep', 'gas trapping', 'copd', 'asthma'],
      inputs: ['peepTot', 'peepSet'],
      outputs: [{ id: 'peepi', label: 'PEEP_i', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ peepi: v.peepTot - v.peepSet }),
      formula: 'PEEP_i = PEEP_tot − PEEP_set',
      use: 'Detect gas trapping in COPD, asthma or at high respiratory rates. Measure with an end-expiratory hold of 1–2 s.',
      tables: [{
        cols: ['PEEP_i (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['0–1', 'No significant trapping'], le: 1, t: 'ok' },
          { c: ['2–5', 'Mild — check expiratory flow reaches zero'], gt: 1, le: 5, t: 'mid' },
          { c: ['> 5', 'Significant — ↓ RR, ↓ V_T, ↑ expiratory time, treat bronchospasm'], gt: 5, t: 'bad' },
        ],
      }],
      example: { v: { peepTot: 12, peepSet: 8 }, expect: { peepi: 4 } },
      guide: 'holds',
    },
    {
      id: 'pplat_i', title: 'Plateau pressure', short: 'Pplat', tags: ['alveolar pressure', 'hold'],
      inputs: ['pplat'],
      outputs: [{ id: 'pplatV', label: 'P_plat', unit: 'cmH₂O', dp: 0 }],
      calc: (v) => ({ pplatV: v.pplat }),
      formula: 'P_plat = E_rs × V_T + PEEP_tot',
      use: 'Best bedside estimate of peak alveolar pressure. Check it after every V_T or PEEP change (end-inspiratory hold ≈ 0.3 s).',
      tables: [{
        cols: ['P_plat (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 25', 'Comfortable'], lt: 25, t: 'ok' },
          { c: ['25–30', 'Upper limit — check ΔP, consider lower V_T'], ge: 25, le: 30, t: 'mid' },
          { c: ['> 30', 'Overdistension risk — ↓ V_T (unless stiff chest wall: measure P_es)'], gt: 30, t: 'bad' },
        ],
      }],
      notes: ['Long holds (2–5 s) let P_plat decay by 2–3 cmH₂O and underestimate the risk.'],
      guide: 'holds',
    },
    {
      id: 'crs', title: 'Static compliance and elastance', short: 'Crs · Ers',
      tags: ['compliance', 'elastance', 'stiffness', 'baby lung'],
      inputs: ['vt', 'pplat', 'peepTot'],
      outputs: [
        { id: 'crs', label: 'C_rs', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'ers', label: 'E_rs', unit: 'cmH₂O/L', dp: 1 },
      ],
      calc: (v) => {
        const d = v.pplat - v.peepTot;
        if (d <= 0) return { _err: 'Plateau pressure must be higher than total PEEP.' };
        return { crs: v.vt / d, ers: d / (v.vt / 1000) };
      },
      formula: 'C_rs = [[V_T || P_plat − PEEP_tot]]   E_rs = [[P_plat − PEEP_tot || V_T]] = [[1 || C_rs]]',
      use: 'Size and stiffness of the ventilated lung. Trend it after PEEP changes, recruitment and proning.',
      tables: [{
        of: 'crs', cols: ['C_rs (mL/cmH₂O)', 'Meaning'], rows: [
          { c: ['50–80', 'Normal under anaesthesia'], ge: 50, t: 'ok' },
          { c: ['30–50', 'Reduced: ARDS, oedema, obesity, high abdominal pressure'], ge: 30, lt: 50, t: 'mid' },
          { c: ['< 30', 'Severely reduced: small "baby lung" or stiff chest wall'], lt: 30, t: 'bad' },
          { c: ['↑ after PEEP ↑', 'Recruitment'] },
          { c: ['↓ after PEEP ↑', 'Overdistension'] },
        ],
      }],
      notes: ['C_rs uses V_T in mL (mL/cmH₂O); E_rs uses V_T in L (cmH₂O/L).'],
      example: { v: { vt: 450, pplat: 20, peepTot: 5 }, expect: { crs: 30, ers: 33.3 } },
      guide: 'holds',
    },
    {
      id: 'rrs', title: 'Inspiratory resistance', short: 'Rrs',
      tags: ['resistance', 'high pressure alarm', 'bronchospasm', 'peak plateau'],
      inputs: ['ppeak', 'pplat', 'flow'],
      outputs: [{ id: 'rrs', label: 'R_rs', unit: 'cmH₂O/L/s', dp: 1 }],
      calc: (v) => ({ rrs: (v.ppeak - v.pplat) / (v.flow / 60) }),
      formula: 'R_rs = [[P_peak − P_plat || V̇ (L/s)]]',
      use: 'High-pressure alarm work-up: a large peak–plateau gap means an airway problem.',
      tables: [
        {
          cols: ['R_rs (cmH₂O/L/s, intubated)', 'Meaning'], rows: [
            { c: ['8–12', 'Normal (the tube accounts for most of it)'], le: 12, t: 'ok' },
            { c: ['12–20', 'Raised: secretions, small tube, bronchospasm'], gt: 12, le: 20, t: 'mid' },
            { c: ['> 20', 'High: severe bronchospasm, kinked or blocked tube'], gt: 20, t: 'bad' },
          ],
        },
        {
          title: 'High-pressure alarm', cols: ['Pattern', 'Cause'], rows: [
            { c: ['P_peak ↑, P_plat unchanged', 'Resistance: secretions, bronchospasm, biting, kinked tube'] },
            { c: ['P_peak ↑ and P_plat ↑', 'Compliance: pneumothorax, atelectasis, mainstem intubation, oedema, abdominal distension'] },
          ],
        },
      ],
      example: { v: { ppeak: 30, pplat: 20, flow: 60 }, expect: { rrs: 10 } },
      guide: 'holds',
    },
    {
      id: 'cdyn', title: 'Dynamic compliance', short: 'Cdyn', tags: ['compliance', 'no hold'],
      inputs: ['vt', 'ppeak', 'peepTot'],
      outputs: [{ id: 'cdyn', label: 'C_dyn', unit: 'mL/cmH₂O', dp: 0 }],
      calc: (v) => {
        const d = v.ppeak - v.peepTot;
        if (d <= 0) return { _err: 'Peak pressure must be higher than total PEEP.' };
        return { cdyn: v.vt / d };
      },
      formula: 'C_dyn = [[V_T || P_peak − PEEP_tot]]',
      use: 'Quick trend with no hold needed. It falls with both resistance and compliance problems.',
      tables: [{
        cols: ['Pattern', 'Meaning'], rows: [
          { c: ['C_dyn ↓, C_stat stable', 'Airway resistance ↑'] },
          { c: ['C_dyn ↓ and C_stat ↓', 'Lung or chest wall stiffer'] },
          { c: ['C_dyn ≈ C_stat', 'Low resistance'] },
        ],
      }],
      example: { v: { vt: 450, ppeak: 30, peepTot: 5 }, expect: { cdyn: 18 } },
    },
    {
      id: 'te', hidden: true, title: 'Expiratory time', short: 'Te',
      inputs: ['rr', 'ti'],
      outputs: [{ id: 'te', label: 'T_e', unit: 's', dp: 2 }],
      calc: (v) => ({ te: 60 / v.rr - v.ti }),
      formula: 'T_e = [[60 || RR]] − T_i',
      use: 'Time left for expiration in each breath.',
    },
    {
      id: 'tau', title: 'Expiratory time constant', short: 'τ',
      tags: ['tau', 'time constant', 'expiration', 'gas trapping'],
      inputs: ['rrs', 'crs', 'te'], optional: ['te'],
      outputs: [
        { id: 'tau', label: 'τ', unit: 's', dp: 2 },
        { id: 'tau3', label: '3τ (minimum T_e)', unit: 's', dp: 2 },
        { id: 'teTau', label: 'T_e / τ', unit: '', dp: 1 },
        { id: 'exhaled', label: 'Volume exhaled in T_e', unit: '%', dp: 0 },
      ],
      calc: (v) => {
        const tau = v.rrs * (v.crs / 1000);
        const r = { tau, tau3: 3 * tau };
        if (v.te != null) {
          r.teTau = v.te / tau;
          r.exhaled = 100 * (1 - Math.exp(-v.te / tau));
        }
        return r;
      },
      formula: 'τ = R_rs × C_rs   (C_rs in L/cmH₂O)',
      use: 'How long expiration must be: set the expiratory time to at least 3τ.',
      tables: [{
        cols: ['Expiratory time', 'Volume exhaled', 'Meaning'], rows: [
          { c: ['1τ', '63%', 'Gas trapping certain'], when: (v) => v.teTau < 3, t: 'bad', v: 'T_e shorter than 3τ: gas trapping likely' },
          { c: ['3τ', '95%', 'Usually adequate'], when: (v) => v.teTau >= 3 && v.teTau < 5, t: 'ok', v: 'Usually adequate (≥ 3τ)' },
          { c: ['5τ', '99%', 'Complete'], when: (v) => v.teTau >= 5, t: 'ok', v: 'Complete expiration (≥ 5τ)' },
        ],
      }],
      notes: ['Example: 10 cmH₂O/L/s × 0.05 L/cmH₂O = 0.5 s.', 'Add RR and T_i to check whether the current expiratory time is long enough.'],
      example: { v: { ppeak: 25, pplat: 15, flow: 60, vt: 500, peepTot: 5 }, expect: { tau: 0.5 } },
    },

    // Partitioned mechanics
    {
      id: 'partition', kind: 'ref', title: 'Pressure partition: lung vs chest wall', short: 'PL = Paw − Pes',
      tags: ['transpulmonary', 'oesophageal', 'esophageal', 'balloon', 'chest wall'],
      formula: 'P_aw = P_L + P_cw   P_L = P_aw − P_es   E_rs = E_L + E_cw',
      use: 'How much of the airway pressure actually stretches the lung, and how much is spent on the chest wall. An oesophageal balloon gives P_es ≈ pleural pressure.',
      tables: [{
        cols: ['Situation', 'Share of pressure reaching the lung (E_L/E_rs)'], rows: [
          { c: ['Normal', '≈ 55%'] },
          { c: ['ARDS', '≈ 70%'] },
          { c: ['Obesity, high abdominal pressure, burns, scoliosis', 'Lower — a high P_plat may still be safe for the lung'] },
        ],
      }],
      see: ['part_e', 'plee', 'plei', 'dpl'],
      guide: 'holds',
    },
    {
      id: 'part_c', title: 'Compliance of system, lung and chest wall', short: 'CRS · CL · CCW',
      tags: ['partitioned', 'oesophageal', 'esophageal', 'lung compliance', 'chest wall compliance'],
      inputs: ['vt', 'pplat', 'peepTot', 'pesEi', 'pesEe'],
      outputs: [
        { id: 'crsP', label: 'C_RS', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'cl', label: 'C_L', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'ccw', label: 'C_CW', unit: 'mL/cmH₂O', dp: 0 },
      ],
      calc: (v) => {
        const dAw = v.pplat - v.peepTot;
        const dEs = v.pesEi - v.pesEe;
        if (dAw <= 0) return { _err: 'Plateau pressure must be higher than total PEEP.' };
        if (dEs <= 0 || dAw - dEs <= 0) return { _err: 'P_es must rise during inspiration, and by less than airway pressure.' };
        return { crsP: v.vt / dAw, cl: v.vt / (dAw - dEs), ccw: v.vt / dEs };
      },
      formula: 'C_RS = [[V_T || P_{aw,ei} − P_{aw,ee}]]   C_L = [[V_T || (P_{aw,ei} − P_{aw,ee}) − (P_{es,ei} − P_{es,ee})]]   C_CW = [[V_T || P_{es,ei} − P_{es,ee}]]',
      use: 'Find where the stiffness is before raising pressures. P_aw,ei is the plateau pressure and P_aw,ee the total PEEP.',
      tables: [
        {
          cols: ['Pattern', 'Meaning'], rows: [
            { c: ['C_L ↓, C_cw normal', 'Lung disease: ARDS, oedema, fibrosis'] },
            { c: ['C_L normal, C_cw ↓', 'Chest wall or abdomen: obesity, abdominal hypertension, effusion, burns'] },
            { c: ['Both ↓', 'Mixed, e.g. ARDS with abdominal hypertension'] },
          ],
        },
        {
          title: 'Reference values (mL/cmH₂O)', cols: ['Group', 'C_rs', 'C_L', 'C_cw'], rows: [
            { c: ['Healthy, general anaesthesia', '70–80', '110–130', '180–210'] },
            { c: ['ALI / ARDS', '30–40', '40–60', '70–100'] },
            { c: ['COPD with respiratory failure', '50–90', '100–170', '150–260'] },
            { c: ['Awake, spontaneous', '≈ 100', '≈ 200', '≈ 200'] },
          ],
        },
      ],
      example: { v: { vt: 500, pplat: 25, peepTot: 10, pesEi: 15, pesEe: 10 }, expect: { crsP: 33.3, cl: 50, ccw: 100 } },
      guide: 'holds',
      refs: ref,
    },
    {
      id: 'part_e', title: 'Elastance of system, lung and chest wall', short: 'ERS · EL · ECW',
      tags: ['partitioned', 'oesophageal', 'esophageal', 'elastance', 'el/ers'],
      inputs: ['vt', 'pplat', 'peepTot', 'pesEi', 'pesEe'],
      outputs: [
        { id: 'ersP', label: 'E_RS', unit: 'cmH₂O/L', dp: 1 },
        { id: 'el', label: 'E_L', unit: 'cmH₂O/L', dp: 1 },
        { id: 'ecw', label: 'E_CW', unit: 'cmH₂O/L', dp: 1 },
        { id: 'elRatio', label: 'E_L / E_RS', unit: '', dp: 2 },
      ],
      calc: (v) => {
        const L = v.vt / 1000;
        const dAw = v.pplat - v.peepTot;
        const dEs = v.pesEi - v.pesEe;
        if (dAw <= 0) return { _err: 'Plateau pressure must be higher than total PEEP.' };
        const ers = dAw / L;
        const el = (dAw - dEs) / L;
        return { ersP: ers, el, ecw: dEs / L, elRatio: el / ers };
      },
      formula: 'E_RS = [[P_{aw,ei} − P_{aw,ee} || V_T]]   E_L = [[(P_{aw,ei} − P_{aw,ee}) − (P_{es,ei} − P_{es,ee}) || V_T]]   E_CW = [[P_{es,ei} − P_{es,ee} || V_T]]',
      use: 'Same information as compliance, but elastances add up (E_rs = E_L + E_cw), so the partition is easier to read.',
      tables: [
        {
          of: 'elRatio', title: 'Share of pressure reaching the lung', cols: ['E_L / E_rs', 'Situation'], rows: [
            { c: ['Lower', 'Obesity, high abdominal pressure, burns, scoliosis: a high P_plat may still be safe for the lung'], lt: 0.45, t: 'info', v: 'Chest wall takes a large share: a high P_plat may still be safe for the lung' },
            { c: ['≈ 0.55', 'Normal'], ge: 0.45, lt: 0.63, t: 'ok', v: 'Normal partition (≈ 55%)' },
            { c: ['≈ 0.70', 'ARDS'], ge: 0.63, t: 'mid', v: 'Most of the pressure reaches the lung (ARDS ≈ 70%)' },
          ],
        },
        {
          title: 'Reference values (cmH₂O/L)', cols: ['Group', 'E_rs', 'E_L', 'E_cw'], rows: [
            { c: ['Healthy, general anaesthesia', '12–14', '8–9', '4–5'] },
            { c: ['ALI / ARDS', '25–37', '17–24', '8–13'] },
            { c: ['COPD with respiratory failure', '11–19', '6–10', '5–9'] },
          ],
        },
      ],
      example: { v: { vt: 500, pplat: 25, peepTot: 10, pesEi: 15, pesEe: 10 }, expect: { ersP: 30, el: 20, ecw: 10, elRatio: 0.67 } },
      guide: 'holds',
      refs: ref,
    },
    {
      id: 'plee', title: 'End-expiratory transpulmonary pressure', short: 'PL,ee',
      tags: ['transpulmonary', 'peep titration', 'oesophageal', 'esophageal', 'obesity'],
      inputs: ['peepTot', 'pesEe'],
      outputs: [{ id: 'plee', label: 'P_{L,ee}', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ plee: v.peepTot - v.pesEe }),
      formula: 'P_{L,ee} = PEEP_tot − P_{es,ee}',
      use: 'PEEP titration when the chest wall is heavy (obesity, abdominal hypertension).',
      tables: [{
        cols: ['P_{L,ee} (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 0', 'Pleural pressure exceeds alveolar: dependent collapse → ↑ PEEP'], lt: 0, t: 'bad' },
          { c: ['0 to ≈ +5', 'Target range'], ge: 0, le: 5, t: 'ok' },
          { c: ['> +5', 'More PEEP than needed: overdistension risk'], gt: 5, t: 'mid' },
        ],
      }],
      example: { v: { peepTot: 12, pesEe: 15 }, expect: { plee: -3 } },
      guide: 'holds',
    },
    {
      id: 'plei', title: 'End-inspiratory transpulmonary pressure', short: 'PL,ei',
      tags: ['transpulmonary', 'stress', 'elastance derived', 'oesophageal', 'esophageal'],
      inputs: ['pplat', 'elRatio'],
      outputs: [{ id: 'plei', label: 'P_{L,ei}', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ plei: v.pplat * v.elRatio }),
      formula: 'P_{L,ei} = P_plat × [[E_L || E_rs]]',
      use: 'True lung stress at end-inspiration (mainly the non-dependent lung). Safety limit for V_T and PEEP.',
      tables: [{
        cols: ['P_{L,ei} (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 20', 'Safe'], lt: 20, t: 'ok' },
          { c: ['20–25', 'Upper limit'], ge: 20, le: 25, t: 'mid' },
          { c: ['> 25', 'Overdistension → ↓ V_T or PEEP'], gt: 25, t: 'bad' },
        ],
      }],
      example: { v: { vt: 500, pplat: 25, peepTot: 10, pesEi: 15, pesEe: 10 }, expect: { plei: 16.7 } },
      guide: 'holds',
    },
    {
      id: 'dpl', title: 'Transpulmonary driving pressure', short: 'ΔPL',
      tags: ['transpulmonary', 'driving pressure', 'lung stress', 'oesophageal', 'esophageal'],
      inputs: ['pplat', 'peepTot', 'pesEi', 'pesEe'],
      outputs: [{ id: 'dpl', label: 'ΔP_L', unit: 'cmH₂O', dp: 1 }],
      calc: (v) => ({ dpl: (v.pplat - v.peepTot) - (v.pesEi - v.pesEe) }),
      formula: 'ΔP_L = (P_plat − PEEP_tot) − (P_{es,ei} − P_{es,ee})',
      use: 'Cyclic stress on the lung per breath. Better than ΔP when the chest wall is abnormal.',
      tables: [{
        cols: ['ΔP_L (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 12', 'Protective'], lt: 12, t: 'ok' },
          { c: ['12–20', 'Above most targets; handout upper limit is 15–20'], ge: 12, le: 20, t: 'mid' },
          { c: ['> 20', 'Injurious → ↓ V_T'], gt: 20, t: 'bad' },
        ],
      }],
      example: { v: { pplat: 25, peepTot: 10, pesEi: 15, pesEe: 10 }, expect: { dpl: 10 } },
      guide: 'holds',
    },
    {
      id: 'vcpred', title: 'Predicted normal mechanics from vital capacity', short: 'VC',
      tags: ['vital capacity', 'predicted', 'normal values'],
      inputs: ['sex', 'height', 'age'],
      outputs: [
        { id: 'vc', label: 'Predicted VC', unit: 'L', dp: 2 },
        { id: 'crsN', label: 'C_rs (1.6% VC)', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'clN', label: 'C_L (2.9% VC)', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'ccwN', label: 'C_cw (3.6% VC)', unit: 'mL/cmH₂O', dp: 0 },
        { id: 'ersN', label: 'E_rs', unit: 'cmH₂O/L', dp: 1 },
        { id: 'elN', label: 'E_L', unit: 'cmH₂O/L', dp: 1 },
        { id: 'ecwN', label: 'E_cw', unit: 'cmH₂O/L', dp: 1 },
      ],
      calc: (v) => {
        const H = v.height / 100;
        const vc = v.sex === 'm' ? 5.76 * H - 0.026 * v.age - 4.34 : 4.43 * H - 0.026 * v.age - 2.89;
        if (vc <= 0) return { _err: 'Predicted vital capacity is not positive for these values.' };
        const pct = vc * 0.01; // 1% of VC in L
        return {
          vc, crsN: 16 * vc, clN: 29 * vc, ccwN: 36 * vc,
          ersN: 0.62 / pct, elN: 0.34 / pct, ecwN: 0.28 / pct,
        };
      },
      formula: 'VC_men = 5.76 × H − 0.026 × age − 4.34   VC_women = 4.43 × H − 0.026 × age − 2.89   (H in metres)',
      use: 'Scale "normal" mechanics to the patient\'s size, then compare with the measured values.',
      tables: [{
        title: 'Moderate–severe ARDS (mean values)', cols: ['Variable', 'Predicted normal', 'Mean in ARDS'], rows: [
          { c: ['C_rs (mL/cmH₂O)', '1.6% of VC', '38'] },
          { c: ['C_L (mL/cmH₂O)', '2.9% of VC', '55'] },
          { c: ['C_cw (mL/cmH₂O)', '3.6% of VC', '125'] },
          { c: ['E_rs (cmH₂O/L)', '0.62 ÷ (1% of VC in L)', '26'] },
          { c: ['E_L (cmH₂O/L)', '0.34 ÷ (1% of VC in L)', '18'] },
          { c: ['E_cw (cmH₂O/L)', '0.28 ÷ (1% of VC in L)', '8'] },
          { c: ['E_L / E_rs', '0.55', '0.70'] },
          { c: ['R_rs (cmH₂O/L/s)', '8–12 at 60 L/min', '—'] },
        ],
      }],
      example: { v: { sex: 'm', height: 175, age: 40 }, expect: { vc: 4.7 } },
      refs: ref,
    },

    // Lung protection
    {
      id: 'pbw', title: 'Predicted body weight and V_T', short: 'PBW',
      tags: ['ideal body weight', 'ibw', 'devine', 'ardsnet', 'tidal volume', 'ml/kg'],
      inputs: ['sex', 'height', 'vt'], optional: ['vt'],
      outputs: [
        { id: 'pbw', label: 'PBW', unit: 'kg', dp: 1 },
        { id: 'vt6', label: 'V_T at 6 mL/kg', unit: 'mL', dp: 0 },
        { id: 'vt4', label: 'V_T at 4 mL/kg', unit: 'mL', dp: 0 },
        { id: 'vt8', label: 'V_T at 8 mL/kg', unit: 'mL', dp: 0 },
        { id: 'vtkg', label: 'Current V_T', unit: 'mL/kg PBW', dp: 1 },
      ],
      calc: (v) => {
        const pbw = (v.sex === 'm' ? 50 : 45.5) + 0.91 * (v.height - 152.4);
        if (pbw <= 0) return { _err: 'Height too low for the PBW formula.' };
        const r = { pbw, vt4: 4 * pbw, vt6: 6 * pbw, vt8: 8 * pbw };
        if (v.vt != null) r.vtkg = v.vt / pbw;
        return r;
      },
      formula: 'PBW_men = 50 + 0.91 × (H − 152.4)   PBW_women = 45.5 + 0.91 × (H − 152.4)   (H in cm)',
      use: 'Set V_T from height, never from actual weight. Enter the current V_T to see it in mL/kg.',
      tables: [{
        of: 'vtkg', cols: ['V_T (mL/kg PBW)', 'Use'], rows: [
          { c: ['4–6', 'ARDS (go lower if P_plat or ΔP stays high)'], le: 6, t: 'ok', v: 'Lung-protective (ARDS range)' },
          { c: ['6–8', 'Default for every ventilated patient, including theatre'], gt: 6, le: 8, t: 'ok', v: 'Default range for ventilated patients' },
          { c: ['> 8', 'Avoid — volutrauma risk'], gt: 8, t: 'bad', v: 'Above 8 mL/kg: volutrauma risk' },
        ],
      }],
      example: { v: { sex: 'm', height: 175 }, text: 'Man 175 cm → PBW 70.6 kg → V_T 6 mL/kg ≈ 425 mL.', expect: { pbw: 70.6, vt6: 424 } },
    },
    {
      id: 'dp', title: 'Driving pressure', short: 'ΔP', tags: ['amato', 'driving pressure', 'ards', 'mortality'],
      inputs: ['pplat', 'peepTot'],
      outputs: [{ id: 'dp', label: 'ΔP', unit: 'cmH₂O', dp: 0 }],
      calc: (v) => ({ dp: v.pplat - v.peepTot }),
      formula: 'ΔP = P_plat − PEEP_tot = [[V_T || C_rs]]',
      use: 'The ventilator variable most strongly linked to ARDS survival (Amato 2015): V_T relative to the size of the aerated lung. Check daily and after every change.',
      tables: [{
        cols: ['ΔP (cmH₂O)', 'Meaning / action'], rows: [
          { c: ['< 12', 'Good'], lt: 12, t: 'ok' },
          { c: ['12–14', 'Acceptable'], ge: 12, lt: 15, t: 'mid' },
          { c: ['≥ 15', 'Higher mortality → ↓ V_T or find a better PEEP'], ge: 15, t: 'bad' },
          { c: ['Falls when PEEP ↑', 'Recruitment — keep the higher PEEP'] },
          { c: ['Rises when PEEP ↑', 'Overdistension — go back'] },
        ],
      }],
      example: { v: { pplat: 27, peepTot: 10 }, expect: { dp: 17 } },
      guide: 'holds',
    },
    {
      id: 'stress', kind: 'ref', title: 'Lung stress', short: 'Stress',
      tags: ['stress', 'transpulmonary', 'vili'],
      formula: 'Stress = P_L = P_aw − P_pl',
      use: 'The force that actually injures the lung, measured at zero flow. At the bedside it is estimated as P_L,ei (elastance-derived).',
      tables: [{
        cols: ['Lung stress (cmH₂O)', 'Meaning'], rows: [
          { c: ['< 20', 'Safe'] },
          { c: ['≈ 24', 'Level linked to VILI (≈ ΔP of 15)'] },
        ],
      }],
      see: ['plei', 'dpl'],
    },
    {
      id: 'strain_dyn', title: 'Tidal (dynamic) strain', short: 'Strain',
      tags: ['strain', 'eelv', 'frc', 'baby lung', 'vili'],
      inputs: ['vt', 'eelv'],
      outputs: [{ id: 'strain', label: 'Strain (V_T / EELV)', unit: '', dp: 2 }],
      calc: (v) => ({ strain: v.vt / v.eelv }),
      formula: 'Strain_dynamic = [[V_T || EELV]]',
      use: 'Explains why the same V_T injures a small lung. Needs an EELV measurement; without it, ΔP is the surrogate.',
      tables: [
        {
          cols: ['Strain', 'Meaning'], rows: [
            { c: ['≈ 0.2', 'Normal quiet breath'], lt: 1, t: 'ok', v: 'Below the high-risk range (normal quiet breath ≈ 0.2)' },
            { c: ['1–1.5', 'High — caution'], ge: 1, le: 1.5, t: 'mid' },
            { c: ['> 1.5–2', 'Caused VILI in animal models'], gt: 1.5, t: 'bad' },
          ],
        },
        {
          title: 'What you have → strain estimate', cols: ['What you have', 'Strain estimate'], rows: [
            { c: ['Ventilator only', 'ΔP — keep < 15 cmH₂O (≈ lung stress 24)'] },
            { c: ['Oesophageal balloon', 'ΔP_L ÷ 13'] },
            { c: ['EELV / FRC measurement', 'V_T ÷ EELV directly'] },
          ],
        },
      ],
      notes: ['Why ΔP is a surrogate: compliance scales with the size of the aerated lung (C_rs ∝ FRC), so ΔP = V_T/C_rs ∝ V_T/FRC = strain.'],
      example: { v: { vt: 450, eelv: 1500 }, text: 'V_T 450 mL with EELV 1500 mL → strain 0.3; the same V_T in a 600 mL "baby lung" → 0.75.', expect: { strain: 0.3 } },
      guide: 'frc',
    },
    {
      id: 'strain_tot', title: 'Static and total strain', short: 'Strain tot',
      tags: ['strain', 'frc', 'vpeep', 'eelv'],
      inputs: ['vt', 'vpeep', 'eelv'],
      outputs: [
        { id: 'strainTot', label: 'Total strain', unit: '', dp: 2 },
        { id: 'frc', label: 'FRC (EELV − V_PEEP)', unit: 'mL', dp: 0 },
        { id: 'strainStat', label: 'Static strain (V_PEEP / FRC)', unit: '', dp: 2 },
        { id: 'strainDyn', label: 'Dynamic strain (V_T / EELV)', unit: '', dp: 2 },
      ],
      calc: (v) => {
        const frc = v.eelv - v.vpeep;
        if (frc <= 0) return { _err: 'V_PEEP must be smaller than EELV.' };
        return { frc, strainTot: (v.vt + v.vpeep) / frc, strainStat: v.vpeep / frc, strainDyn: v.vt / v.eelv };
      },
      formula: 'Strain_total = [[V_T + V_PEEP || FRC]]   Strain_dynamic = [[V_T || EELV]]   EELV = FRC + V_PEEP',
      use: 'Separates the steady stretch from PEEP from the cyclic stretch of each breath.',
      tables: [
        {
          cols: ['Total strain', 'Meaning'], rows: [
            { c: ['< 1', 'Below the high-risk range'], lt: 1, t: 'ok', added: true },
            { c: ['1–1.5', 'High — caution'], ge: 1, le: 1.5, t: 'mid' },
            { c: ['> 1.5–2', 'Caused VILI in animal models'], gt: 1.5, t: 'bad' },
          ],
        },
        {
          title: 'Which component harms', cols: ['Component', 'Harm'], rows: [
            { c: ['Static (from PEEP)', 'Less injurious, may protect'] },
            { c: ['Dynamic (from V_T)', 'More injurious — limit first'] },
          ],
        },
      ],
      example: { v: { vt: 450, vpeep: 500, eelv: 2000 }, expect: { frc: 1500, strainTot: 0.63, strainDyn: 0.23 } },
      guide: 'frc',
    },
    {
      id: 'strain_pl', title: 'Strain from transpulmonary pressure', short: 'ΔPL ÷ 13',
      tags: ['strain', 'specific elastance', 'oesophageal', 'esophageal'],
      inputs: ['dpl'],
      outputs: [{ id: 'strainPl', label: 'Strain ≈ ΔP_L / 13', unit: '', dp: 2 }],
      calc: (v) => ({ strainPl: v.dpl / 13 }),
      formula: 'Stress (ΔP_L) = E_{L,spec} × Strain  ⇒  Strain ≈ [[ΔP_L || 13]]',
      use: 'Strain estimate with an oesophageal balloon but no lung-volume measurement. Specific lung elastance ≈ 13 cmH₂O.',
      tables: [{
        cols: ['Strain', 'Meaning'], rows: [
          { c: ['≈ 0.2', 'Normal quiet breath'], lt: 1, t: 'ok', v: 'Below the high-risk range' },
          { c: ['1–1.5', 'High — caution'], ge: 1, le: 1.5, t: 'mid' },
          { c: ['> 1.5–2', 'Caused VILI in animal models'], gt: 1.5, t: 'bad' },
        ],
      }],
      example: { v: { pplat: 25, peepTot: 10, pesEi: 15, pesEe: 10 }, expect: { strainPl: 0.77 } },
      guide: 'frc',
    },
    {
      id: 'mp', title: 'Mechanical power (Gattinoni)', short: 'MP',
      tags: ['mechanical power', 'energy', 'j/min', 'gattinoni'],
      inputs: ['rr', 'vt', 'ers', 'rrs', 'ieE', 'peepTot'],
      outputs: [{ id: 'mp', label: 'Mechanical power', unit: 'J/min', dp: 1 }],
      calc: (v) => {
        const V = v.vt / 1000;
        const ie = 1 / v.ieE;
        return { mp: 0.098 * v.rr * (V * V * (0.5 * v.ers + v.rr * ((1 + ie) / (60 * ie)) * v.rrs) + V * v.peepTot) };
      },
      formula: 'MP = 0.098 · RR · { V_T^2 [ ½E_rs + RR · [[1 + I:E || 60 · I:E]] · R_rs ] + V_T · PEEP }   (V_T in L)',
      use: 'Total energy delivered to the lung per minute: combines V_T, ΔP, RR, flow and PEEP.',
      tables: [{
        cols: ['MP (J/min)', 'Meaning'], rows: [
          { c: ['≤ 17', 'Below the commonly cited risk threshold'], le: 17, t: 'ok' },
          { c: ['> 17', 'Associated with higher mortality → ↓ RR, V_T or ΔP'], gt: 17, t: 'bad' },
        ],
      }],
      example: { v: { rr: 20, vt: 450, pplat: 20, peepTot: 5, ppeak: 30, flow: 60, ieE: 2 }, expect: { mp: 15 } },
      see: ['mp_simple', 'power_index'],
    },
    {
      id: 'mp_simple', title: 'Mechanical power, simplified', short: 'MP (VC)',
      tags: ['mechanical power', 'volume control', 'energy'],
      inputs: ['rr', 'vt', 'ppeak', 'dp'],
      outputs: [{ id: 'mpS', label: 'Mechanical power', unit: 'J/min', dp: 1 }],
      calc: (v) => ({ mpS: 0.098 * v.rr * (v.vt / 1000) * (v.ppeak - 0.5 * v.dp) }),
      formula: 'MP ≈ 0.098 × RR × V_T × (P_peak − ½ΔP)   (volume control, V_T in L)',
      use: 'Quick bedside version in volume control.',
      tables: [{
        cols: ['MP (J/min)', 'Meaning'], rows: [
          { c: ['≤ 17', 'Below the commonly cited risk threshold'], le: 17, t: 'ok' },
          { c: ['> 17', 'Associated with higher mortality → ↓ RR, V_T or ΔP'], gt: 17, t: 'bad' },
        ],
      }],
      example: { v: { rr: 20, vt: 450, ppeak: 30, pplat: 17, peepTot: 5 }, text: 'RR 20, V_T 0.45 L, P_peak 30, ΔP 12 → ≈ 21 J/min.', expect: { mpS: 21.2 } },
    },
    {
      id: 'power_index', title: '4ΔP + RR (Costa 2021)', short: '4ΔP+RR',
      tags: ['power index', 'costa', 'driving pressure'],
      inputs: ['dp', 'rr'],
      outputs: [{ id: 'pindex', label: '4ΔP + RR', unit: '', dp: 0 }],
      calc: (v) => ({ pindex: 4 * v.dp + v.rr }),
      formula: 'Power index = 4 × ΔP + RR',
      use: 'Decide which setting to lower. Risk rises continuously with the index; there is no single cut-off.',
      tables: [{
        cols: ['Change', 'Index falls by'], rows: [
          { c: ['ΔP ↓ 1 cmH₂O', '4 → lowering ΔP is the priority'] },
          { c: ['RR ↓ 1 breath/min', '1'] },
        ],
      }],
      example: { v: { pplat: 25, peepTot: 10, rr: 24 }, expect: { pindex: 84 } },
    },

    // Recruitment and PEEP
    {
      id: 'deelv', hidden: true, title: 'ΔEELV from the release breath', short: 'ΔEELV',
      inputs: ['vExpRelease', 'vt'],
      outputs: [{ id: 'deelv', label: 'ΔEELV', unit: 'mL', dp: 0 }],
      calc: (v) => ({ deelv: v.vExpRelease - v.vt }),
      formula: 'ΔEELV = exhaled volume of the release breath − V_T',
      use: 'Extra volume exhaled when PEEP drops for one breath.',
    },
    {
      id: 'crs_low', hidden: true, title: 'Compliance at low PEEP', short: 'Crs,low',
      inputs: ['vt', 'pplatLow', 'peepLow', 'aop'], optional: ['aop'],
      outputs: [{ id: 'crsLow', label: 'C_{rs,low}', unit: 'mL/cmH₂O', dp: 1 }],
      calc: (v) => {
        const low = v.aop != null && v.aop > v.peepLow ? v.aop : v.peepLow;
        if (v.pplatLow <= low) return { _err: 'P_plat at low PEEP must be higher than PEEP low (or AOP).' };
        return { crsLow: v.vt / (v.pplatLow - low) };
      },
      formula: 'C_{rs,low} = [[V_T || P_{plat,low} − PEEP_low]]',
      use: 'Compliance of the lung that stays open at the low PEEP.',
    },
    {
      id: 'ri', title: 'Recruitment-to-inflation ratio', short: 'R/I',
      tags: ['recruitability', 'chen', 'peep', 'recruitment', 'r/i', 'ri'],
      inputs: ['deelv', 'crsLow', 'peepHigh', 'peepLow', 'aop'], optional: ['aop'],
      outputs: [
        { id: 'ri', label: 'R/I ratio', unit: '', dp: 2 },
        { id: 'infl', label: 'Expected inflation (C_{rs,low} × ΔPEEP)', unit: 'mL', dp: 0 },
        { id: 'vrec', label: 'Recruited volume (V_rec)', unit: 'mL', dp: 0 },
        { id: 'crec', label: 'C_rec', unit: 'mL/cmH₂O', dp: 1 },
      ],
      calc: (v) => {
        const low = v.aop != null && v.aop > v.peepLow ? v.aop : v.peepLow;
        const dpeep = v.peepHigh - low;
        if (dpeep <= 0) return { _err: 'PEEP high must be above PEEP low (or AOP).' };
        const infl = v.crsLow * dpeep;
        let vrec = v.deelv - infl;
        const r = { infl };
        if (vrec < 0) {
          r._msgs = ['ΔEELV is smaller than the expected inflation: V_rec set to 0 (no recruitment).'];
          vrec = 0;
        }
        r.vrec = vrec;
        r.crec = vrec / dpeep;
        r.ri = r.crec / v.crsLow;
        return r;
      },
      formula: 'V_rec = ΔEELV − C_{rs,low} × (PEEP_high − PEEP_low)   R/I = [[V_rec / (PEEP_high − PEEP_low) || C_{rs,low}]]',
      use: 'Decide whether the lung will respond to higher PEEP, from a single-breath PEEP drop (e.g. 15 → 5 cmH₂O).',
      tables: [{
        cols: ['R/I', 'Meaning / action'], rows: [
          { c: ['≥ 0.5', 'Recruitable → higher PEEP likely helps'], ge: 0.5, t: 'ok' },
          { c: ['< 0.5', 'Poorly recruitable → keep PEEP lower (overdistension risk)'], lt: 0.5, t: 'mid' },
        ],
      }],
      notes: ['If AOP is above PEEP low, the app uses AOP in place of PEEP low, as in Chen 2020.'],
      figure: (v) => ICU.fig && ICU.fig.riBar(v.infl, v.vrec),
      example: {
        v: { vt: 450, pplatLow: 20, peepLow: 5, peepHigh: 15, vExpRelease: 950 },
        text: 'C_rs,low 30 mL/cmH₂O and ΔEELV 500 mL → expected inflation 300 mL, V_rec 200 mL, C_rec 20 mL/cmH₂O, R/I 0.67 → recruitable.',
        expect: { ri: 0.67, vrec: 200, infl: 300, crec: 20 },
      },
      guide: 'ri',
      refs: ['Chen L et al. Potential for lung recruitment estimated by the R/I ratio. AJRCCM 2020;201:178–187.'],
    },
    {
      id: 'stress_index', title: 'Stress index (Ranieri)', short: 'SI · b',
      tags: ['stress index', 'ranieri', 'waveform', 'peep titration', 'overdistension'],
      inputs: ['sip1', 'sip2', 'sip3'],
      outputs: [{ id: 'b', label: 'Stress index b', unit: '', dp: 2 }],
      calc: (v) => {
        const d1 = v.sip2 - v.sip1;
        const d2 = v.sip3 - v.sip2;
        if (d1 <= 0 || d2 <= 0) return { _err: 'Pressure must rise between the three readings.' };
        const r = d2 / d1;
        const f = (b) => (Math.pow(3, b) - Math.pow(2, b)) / (Math.pow(2, b) - 1);
        let lo = 0.05, hi = 4;
        if (r <= f(lo) || r >= f(hi)) return { _err: 'Readings out of range for the curve fit. Check the time spacing.' };
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (f(mid) < r) lo = mid; else hi = mid;
        }
        return { b: (lo + hi) / 2 };
      },
      formula: 'P_aw = a · t^b + c   (constant-flow inspiration)',
      use: 'Bedside PEEP/V_T titration from the shape of the pressure–time curve. Unreliable with effusion, high abdominal pressure or patchy lung.',
      tables: [{
        cols: ['b', 'Curve', 'Meaning', 'Action'], rows: [
          { c: ['< 0.9', 'Convex (slope falls during inspiration)', 'Tidal recruitment', 'Consider ↑ PEEP'], lt: 0.9, t: 'mid', v: 'Tidal recruitment → consider ↑ PEEP' },
          { c: ['0.9–1.1', 'Straight', 'Linear compliance', 'Keep'], ge: 0.9, le: 1.1, t: 'ok', v: 'Linear compliance → keep settings' },
          { c: ['> 1.1', 'Concave (slope rises during inspiration)', 'Tidal overdistension', '↓ V_T or PEEP'], gt: 1.1, t: 'bad', v: 'Tidal overdistension → ↓ V_T or PEEP' },
        ],
      }],
      notes: [
        'Read P_aw with the ventilator cursor at three equally spaced times during the constant-flow part of inspiration (t, 2t, 3t from the start of flow). The app solves the power curve exactly through the three points.',
        'This three-point estimate is an approximation of the validated curve fit; use the ventilator\'s own stress index where available.',
      ],
      example: { v: { sip1: 12, sip2: 16, sip3: 21 }, expect: { b: 1.43 } },
      guide: 'stressindex',
    },
  ]);

  ICU.defArea({
    id: 'vent', title: 'Mechanical ventilation', code: 'P<sub>aw</sub>',
    blurb: 'Passive mechanics, oesophageal pressure, lung protection, recruitment and PEEP.',
    sections: [
      { title: 'Respiratory mechanics (passive patient)', items: ['g:holds', 'eom', 'peepi', 'pplat_i', 'crs', 'rrs', 'cdyn', 'tau'] },
      { title: 'Lung and chest wall (oesophageal balloon)', items: ['partition', 'part_c', 'part_e', 'plee', 'plei', 'dpl', 'vcpred'] },
      { title: 'Lung-protective ventilation', items: ['pbw', 'dp', 'stress', 'g:frc', 'strain_dyn', 'strain_tot', 'strain_pl', 'mp', 'mp_simple', 'power_index'] },
      { title: 'Recruitment and PEEP', items: ['g:ri', 'ri', 'g:stressindex', 'stress_index', 'g:pvloop'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
