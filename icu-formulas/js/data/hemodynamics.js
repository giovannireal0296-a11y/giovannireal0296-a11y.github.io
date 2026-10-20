/* Haemodynamics: pressures, flow, resistances, pulmonary circulation, cardiac work. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defVars({
    pvrWU: { label: 'PVR', unit: 'WU', derive: 'pvr', calc: true, dp: 1 },
    edv: { label: 'End-diastolic volume (EDV)', unit: 'mL', min: 20, max: 500 },
    esv: { label: 'End-systolic volume (ESV)', unit: 'mL', min: 5, max: 450 },
    pmsf: { label: 'Mean systemic filling pressure (P_msf)', unit: 'mmHg', min: 5, max: 50 },
    rvr: { label: 'Resistance to venous return (R_VR)', unit: 'mmHg·min/L', min: 0.2, max: 5 },
  });

  const ciRows = [
    { c: ['< 2.2', 'Low output: cardiogenic or hypovolaemic'], lt: 2.2, t: 'bad' },
    { c: ['2.2–2.5', 'Low–normal'], ge: 2.2, lt: 2.5, t: 'mid', added: true },
    { c: ['2.5–4.2', 'Normal'], ge: 2.5, le: 4.2, t: 'ok' },
    { c: ['> 4.2', 'High output: sepsis, liver failure, anaemia, AV fistula, thyrotoxicosis'], gt: 4.2, t: 'info' },
  ];

  ICU.defFormulas('hemo', [
    {
      id: 'map', title: 'Mean arterial pressure', short: 'MAP',
      tags: ['blood pressure', 'vasopressor', 'perfusion'],
      inputs: ['sbp', 'dbp'],
      outputs: [{ id: 'map', label: 'MAP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ map: (v.sbp + 2 * v.dbp) / 3 }),
      formula: 'MAP = [[SBP + 2 × DBP || 3]] = DBP + ⅓(SBP − DBP)',
      use: 'Organ perfusion pressure and the main vasopressor target.',
      tables: [{
        cols: ['MAP (mmHg)', 'Meaning / action'], rows: [
          { c: ['< 65', 'Hypotension → fluids if responsive, vasopressor'], lt: 65, t: 'bad' },
          { c: ['65–70', 'Usual shock target (≈ 80–85 may help the kidney in chronic hypertension)'], ge: 65, lt: 70, t: 'mid' },
          { c: ['70–105', 'Normal'], ge: 70, le: 105, t: 'ok' },
          { c: ['> 105', 'High'], gt: 105, t: 'mid', added: true },
        ],
      }],
      example: { v: { sbp: 120, dbp: 60 }, expect: { map: 80 } },
    },
    {
      id: 'co_hrsv', title: 'Cardiac output from HR and SV', short: 'CO',
      tags: ['cardiac output', 'stroke volume', 'heart rate'],
      inputs: ['hr', 'sv'],
      outputs: [{ id: 'co', label: 'CO', unit: 'L/min', dp: 2 }],
      calc: (v) => ({ co: (v.hr * v.sv) / 1000 }),
      formula: 'CO = [[HR × SV || 1000]]',
      use: 'Pump output from rate and stroke volume (e.g. SV from echo Doppler).',
      tables: [{
        cols: ['CO (L/min)', 'Meaning'], rows: [
          { c: ['4–8', 'Usual adult range (index it to BSA to judge it)'], ge: 4, le: 8, t: 'ok', added: true },
          { c: ['< 4', 'Low'], lt: 4, t: 'mid', added: true },
          { c: ['> 8', 'High'], gt: 8, t: 'info', added: true },
        ],
      }],
      example: { v: { hr: 80, sv: 63 }, expect: { co: 5.04 } },
      see: ['ci', 'sv_doppler'],
    },
    {
      id: 'ci', title: 'Cardiac index', short: 'CI',
      tags: ['cardiac index', 'cardiac output', 'bsa'],
      inputs: ['co', 'bsa'],
      outputs: [{ id: 'ci', label: 'CI', unit: 'L/min/m²', dp: 2 }],
      calc: (v) => ({ ci: v.co / v.bsa }),
      formula: 'CI = [[CO || BSA]]',
      use: 'Pump output indexed to body size.',
      tables: [{ cols: ['CI (L/min/m²)', 'Meaning'], rows: ciRows }],
      example: { v: { co: 5, height: 175, weight: 70 }, expect: { ci: 2.71 } },
    },
    {
      id: 'sv', title: 'Stroke volume', short: 'SV',
      tags: ['stroke volume', 'fluid challenge'],
      inputs: ['co', 'hr'],
      outputs: [{ id: 'sv', label: 'SV', unit: 'mL', dp: 0 }],
      calc: (v) => ({ sv: (v.co * 1000) / v.hr }),
      formula: 'SV = [[CO × 1000 || HR]]',
      use: 'Separates rate from pump; the variable to watch during fluid challenges.',
      example: { v: { co: 5, hr: 80 }, expect: { sv: 62.5 } },
      see: ['svi', 'dyn_test'],
    },
    {
      id: 'svi', title: 'Stroke volume index', short: 'SVI',
      tags: ['stroke volume index', 'preload', 'fluid responsive'],
      inputs: ['sv', 'bsa'],
      outputs: [{ id: 'svi', label: 'SVI', unit: 'mL/m²', dp: 0 }],
      calc: (v) => ({ svi: v.sv / v.bsa }),
      formula: 'SVI = [[SV || BSA]]',
      use: 'Stroke volume indexed to body size.',
      tables: [{
        cols: ['SVI (mL/m²)', 'Meaning'], rows: [
          { c: ['< 30', 'Low: preload ↓ or pump failure'], lt: 30, t: 'bad' },
          { c: ['30–33', 'Low–normal'], ge: 30, lt: 33, t: 'mid', added: true },
          { c: ['33–47', 'Normal'], ge: 33, le: 47, t: 'ok' },
          { c: ['> 47', 'High'], gt: 47, t: 'info', added: true },
          { c: ['↑ ≥ 10–15% after fluid', 'Fluid responsive'] },
        ],
      }],
      example: { v: { co: 5, hr: 80, height: 175, weight: 70 }, expect: { svi: 33.9 } },
    },
    {
      id: 'svr', title: 'Systemic vascular resistance', short: 'SVR',
      tags: ['svr', 'svri', 'vasoplegia', 'afterload', 'vasodilated'],
      inputs: ['map', 'rap', 'co', 'ci'], optional: ['ci'],
      outputs: [
        { id: 'svr', label: 'SVR', unit: 'dyn·s·cm⁻⁵', dp: 0 },
        { id: 'svri', label: 'SVRI', unit: 'dyn·s·cm⁻⁵·m²', dp: 0 },
        { id: 'svrWU', label: 'SVR', unit: 'WU', dp: 1 },
      ],
      calc: (v) => {
        const d = v.map - v.rap;
        return { svr: (80 * d) / v.co, svrWU: d / v.co, svri: v.ci ? (80 * d) / v.ci : null };
      },
      formula: 'SVR = [[80 × (MAP − RAP) || CO]]   SVRI = [[80 × (MAP − RAP) || CI]]',
      use: 'Vascular tone: vasodilated or vasoconstricted shock. Add height and weight for SVRI.',
      tables: [
        {
          of: 'svr', cols: ['SVR (dyn·s·cm⁻⁵)', 'Meaning'], rows: [
            { c: ['< 800', 'Vasodilated: sepsis, liver failure, anaphylaxis, post-bypass vasoplegia'], lt: 800, t: 'bad' },
            { c: ['800–1200', 'Normal'], ge: 800, le: 1200, t: 'ok' },
            { c: ['> 1200–1500', 'Vasoconstricted: cardiogenic, hypovolaemic, obstructive shock'], gt: 1200, t: 'mid' },
          ],
        },
      ],
      notes: ['The handout prints (MPA − RAP); MAP is correct. Normal range in the handout (p.5): 770–1500.'],
      see: ['shock'],
      example: { v: { map: 70, rap: 10, co: 6 }, expect: { svr: 800 } },
    },
    {
      id: 'shock', kind: 'ref', title: 'Shock patterns', short: 'Shock',
      tags: ['shock', 'hypovolaemic', 'cardiogenic', 'distributive', 'obstructive'],
      use: 'Read CO, SVR and filling pressures together.',
      tables: [{
        cols: ['Shock', 'CO', 'SVR', 'RAP', 'PAWP'], rows: [
          { c: ['Hypovolaemic', '↓', '↑', '↓', '↓'] },
          { c: ['Cardiogenic (LV)', '↓', '↑', '↑/N', '↑'] },
          { c: ['Distributive (sepsis)', '↑/N', '↓', '↓/N', '↓/N'] },
          { c: ['Obstructive (PE, tamponade)', '↓', '↑', '↑', '↓/N (PE), ↑ equalised (tamponade)'] },
        ],
      }],
      see: ['svr', 'ci', 'cpo'],
    },
    {
      id: 'guyton', title: 'Venous return (Guyton)', short: 'VR',
      tags: ['venous return', 'mean systemic filling pressure', 'pmsf'],
      inputs: ['pmsf', 'rap', 'rvr'],
      outputs: [{ id: 'vrGuyton', label: 'Venous return', unit: 'L/min', dp: 1 }],
      calc: (v) => ({ vrGuyton: (v.pmsf - v.rap) / v.rvr }),
      formula: 'VR = [[P_msf − RAP || R_VR]]',
      use: 'Explains what fluids, vasopressors and PEEP do to cardiac output.',
      tables: [{
        cols: ['Change', 'Venous return'], rows: [
          { c: ['P_msf ↑ (fluid, noradrenaline venoconstriction)', '↑'] },
          { c: ['RAP ↑ (RV failure, high PEEP, tamponade)', '↓'] },
          { c: ['P_msf ↓ (hypovolaemia, vasodilation)', '↓'] },
        ],
      }],
      example: { v: { pmsf: 18, rap: 8, rvr: 2 }, expect: { vrGuyton: 5 } },
    },

    // Pulmonary circulation
    {
      id: 'pvr', title: 'Pulmonary vascular resistance', short: 'PVR',
      tags: ['pvr', 'wood units', 'pulmonary hypertension', 'rv afterload'],
      inputs: ['mpap', 'pawp', 'co'],
      outputs: [
        { id: 'pvrWU', label: 'PVR', unit: 'WU', dp: 1 },
        { id: 'pvrDyn', label: 'PVR', unit: 'dyn·s·cm⁻⁵', dp: 0 },
      ],
      calc: (v) => ({ pvrWU: (v.mpap - v.pawp) / v.co, pvrDyn: (80 * (v.mpap - v.pawp)) / v.co }),
      formula: 'PVR = [[80 × (mPAP − PAWP) || CO]]   PVR_WU = [[mPAP − PAWP || CO]]   (1 WU = 80 dyn·s·cm⁻⁵)',
      use: 'Pulmonary vascular disease, RV afterload, transplant work-up.',
      tables: [{
        of: 'pvrWU', cols: ['PVR', 'Meaning'], rows: [
          { c: ['≤ 2 WU (≤ 160 dyn)', 'Normal'], le: 2, t: 'ok' },
          { c: ['> 2 WU', 'Pre-capillary component of PH'], gt: 2, lt: 5, t: 'mid' },
          { c: ['≥ 5 WU', 'Severe — RV failure risk'], ge: 5, t: 'bad' },
        ],
      }],
      notes: ['Handout normal values disagree (< 250 vs 20–120 dyn); ESC/ERS 2022 uses ≤ 2 WU.'],
      example: { v: { mpap: 30, pawp: 12, co: 5 }, expect: { pvrWU: 3.6, pvrDyn: 288 } },
    },
    {
      id: 'tpr', title: 'Total pulmonary resistance', short: 'TPR',
      tags: ['tpr', 'pulmonary resistance'],
      inputs: ['mpap', 'co'],
      outputs: [{ id: 'tprDyn', label: 'TPR', unit: 'dyn·s·cm⁻⁵', dp: 0 }],
      calc: (v) => ({ tprDyn: (80 * v.mpap) / v.co }),
      formula: 'TPR = [[80 × mPAP || CO]]',
      use: 'When PAWP is unavailable; it includes the left-heart contribution.',
      tables: [{
        cols: ['Pattern', 'Meaning'], rows: [
          { c: ['TPR ↑, PVR normal', 'Left-heart (post-capillary) cause'] },
          { c: ['TPR ↑, PVR ↑', 'Pulmonary vascular disease'] },
        ],
      }],
      example: { v: { mpap: 30, co: 5 }, expect: { tprDyn: 480 } },
    },
    {
      id: 'tpg', title: 'Transpulmonary and diastolic pressure gradients', short: 'TPG · DPG',
      tags: ['tpg', 'dpg', 'combined post-capillary', 'left heart'],
      inputs: ['mpap', 'dpap', 'pawp'],
      outputs: [
        { id: 'tpgV', label: 'TPG', unit: 'mmHg', dp: 0 },
        { id: 'dpgV', label: 'DPG', unit: 'mmHg', dp: 0 },
      ],
      calc: (v) => ({ tpgV: v.mpap - v.pawp, dpgV: v.dpap - v.pawp }),
      formula: 'TPG = mPAP − PAWP   DPG = dPAP − PAWP',
      use: 'In left-heart PH, detect an added pulmonary-vascular component.',
      tables: [{
        cols: ['Result', 'Meaning'], rows: [
          { c: ['TPG ≤ 12, DPG < 7', 'Isolated post-capillary (passive) PH'], when: (v) => v.tpgV <= 12 && v.dpgV < 7, t: 'ok' },
          { c: ['TPG > 12 or DPG ≥ 7', 'Combined pre- and post-capillary PH'], when: (v) => v.tpgV > 12 || v.dpgV >= 7, t: 'bad' },
        ],
      }],
      example: { v: { mpap: 35, dpap: 25, pawp: 20 }, expect: { tpgV: 15, dpgV: 5 } },
    },
    {
      id: 'ph_class', title: 'Pulmonary hypertension type (ESC/ERS 2022)', short: 'PH',
      tags: ['pulmonary hypertension', 'pre-capillary', 'post-capillary', 'portopulmonary'],
      inputs: ['mpap', 'pawp', 'pvrWU'],
      outputs: [{ id: 'mpapV', label: 'mPAP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ mpapV: v.mpap }),
      verdict: (v) => {
        if (v.mpap <= 20) return { text: 'No pulmonary hypertension (mPAP ≤ 20)', tone: 'ok' };
        if (v.pawp <= 15) return v.pvrWU > 2
          ? { text: 'Pre-capillary PH', tone: 'bad' }
          : { text: 'mPAP > 20 with PAWP ≤ 15 and PVR ≤ 2: unclassified (high flow?)', tone: 'mid' };
        return v.pvrWU > 2
          ? { text: 'Combined pre- and post-capillary PH', tone: 'bad' }
          : { text: 'Isolated post-capillary PH', tone: 'mid' };
      },
      formula: 'mPAP, PAWP and PVR read together',
      use: 'Classify a right-heart catheter result.',
      tables: [
        {
          cols: ['Type', 'mPAP', 'PAWP', 'PVR (WU)'], noVerdict: true, rows: [
            { c: ['Normal', '≤ 20', '≤ 15', '≤ 2'], when: (v) => v.mpap <= 20, t: 'ok' },
            { c: ['Pre-capillary', '> 20', '≤ 15', '> 2'], when: (v) => v.mpap > 20 && v.pawp <= 15 && v.pvrWU > 2, t: 'bad' },
            { c: ['Isolated post-capillary', '> 20', '> 15', '≤ 2'], when: (v) => v.mpap > 20 && v.pawp > 15 && v.pvrWU <= 2, t: 'mid' },
            { c: ['Combined', '> 20', '> 15', '> 2'], when: (v) => v.mpap > 20 && v.pawp > 15 && v.pvrWU > 2, t: 'bad' },
          ],
        },
        {
          of: 'mpap', title: 'Portopulmonary hypertension before liver transplant', cols: ['mPAP', 'Meaning'], rows: [
            { c: ['> 35', 'High risk'], gt: 35, lt: 50, t: 'mid' },
            { c: ['≥ 50', 'Usually prohibitive'], ge: 50, t: 'bad' },
          ],
        },
      ],
      example: { v: { mpap: 30, pawp: 12, co: 5 }, expect: { mpapV: 30 } },
    },
    {
      id: 'chemla', title: 'Mean PAP from systolic PAP (Chemla)', short: 'mPAP',
      tags: ['mpap', 'spap', 'echo', 'chemla'],
      inputs: ['spap'],
      outputs: [{ id: 'mpapEst', label: 'mPAP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ mpapEst: 0.61 * v.spap + 2 }),
      formula: 'mPAP ≈ 0.61 × sPAP + 2',
      use: 'Convert an echo-estimated sPAP to mPAP.',
      tables: [{
        of: 'mpapEst', cols: ['mPAP', 'Meaning'], rows: [
          { c: ['≤ 20', 'Normal'], le: 20, t: 'ok', added: true },
          { c: ['> 20', 'Pulmonary hypertension range (ESC/ERS 2022)'], gt: 20, t: 'mid', added: true },
        ],
      }, {
        title: 'Examples', cols: ['sPAP (mmHg)', 'mPAP ≈'], rows: [
          { c: ['30', '20'] }, { c: ['40', '26'] }, { c: ['60', '39'] },
        ],
      }],
      example: { v: { spap: 40 }, expect: { mpapEst: 26.4 } },
    },
    {
      id: 'papi', title: 'Pulmonary artery pulsatility index', short: 'PAPi',
      tags: ['papi', 'right ventricle', 'rv failure', 'lvad'],
      inputs: ['spap', 'dpap', 'rap'],
      outputs: [{ id: 'papi', label: 'PAPi', unit: '', dp: 2 }],
      calc: (v) => {
        if (v.rap <= 0) return { _err: 'RAP must be above zero for PAPi.' };
        return { papi: (v.spap - v.dpap) / v.rap };
      },
      formula: 'PAPi = [[sPAP − dPAP || RAP]]',
      use: 'RV function from PA-catheter numbers.',
      tables: [{
        cols: ['PAPi', 'Meaning'], rows: [
          { c: ['> 1.85', 'Adequate RV'], gt: 1.85, t: 'ok' },
          { c: ['0.9–1.85', 'Possible RV dysfunction (RV failure risk after LVAD)'], ge: 0.9, le: 1.85, t: 'mid' },
          { c: ['< 0.9', 'RV failure (inferior MI) → consider RV support'], lt: 0.9, t: 'bad' },
        ],
      }],
      example: { v: { spap: 40, dpap: 20, rap: 10 }, expect: { papi: 2 } },
    },

    // Cardiac work
    {
      id: 'lvswi', title: 'Left ventricular stroke work index', short: 'LVSWI',
      tags: ['stroke work', 'contractility', 'lv'],
      inputs: ['svi', 'map', 'pawp'],
      outputs: [{ id: 'lvswi', label: 'LVSWI', unit: 'g·m/m²/beat', dp: 0 }],
      calc: (v) => ({ lvswi: v.svi * (v.map - v.pawp) * 0.0136 }),
      formula: 'LVSWI = SVI × (MAP − PAWP) × 0.0136',
      use: 'LV contractile work; read it with preload.',
      tables: [{
        cols: ['LVSWI', 'Meaning'], rows: [
          { c: ['< 45', 'LV contractile failure (if preload adequate)'], lt: 45, t: 'bad' },
          { c: ['45–75', 'Normal'], ge: 45, le: 75, t: 'ok' },
          { c: ['> 75', 'High'], gt: 75, t: 'info', added: true },
        ],
      }],
      example: { v: { co: 5, hr: 80, height: 175, weight: 70, map: 90, pawp: 10 }, expect: { lvswi: 36.9 } },
    },
    {
      id: 'rvswi', title: 'Right ventricular stroke work index', short: 'RVSWI',
      tags: ['stroke work', 'rv', 'right ventricle'],
      inputs: ['svi', 'mpap', 'rap'],
      outputs: [{ id: 'rvswi', label: 'RVSWI', unit: 'g·m/m²/beat', dp: 1 }],
      calc: (v) => ({ rvswi: v.svi * (v.mpap - v.rap) * 0.0136 }),
      formula: 'RVSWI = SVI × (mPAP − RAP) × 0.0136',
      use: 'RV contractile work.',
      tables: [{
        cols: ['RVSWI', 'Meaning'], rows: [
          { c: ['< 5', 'RV failure'], lt: 5, t: 'bad' },
          { c: ['5–10', 'Normal'], ge: 5, le: 10, t: 'ok' },
          { c: ['> 10', 'High'], gt: 10, t: 'info', added: true },
        ],
      }],
      notes: ['The handout prints (MAP − RAP); mPAP is correct for the right ventricle.'],
      example: { v: { co: 5, hr: 80, height: 175, weight: 70, mpap: 20, rap: 5 }, expect: { rvswi: 6.9 } },
    },
    {
      id: 'copp', title: 'Coronary perfusion pressure', short: 'CoPP',
      tags: ['coronary', 'diastolic', 'cpr', 'ischaemia'],
      inputs: ['dbp', 'pawp'],
      outputs: [{ id: 'copp', label: 'CoPP', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ copp: v.dbp - v.pawp }),
      formula: 'CoPP = DBP − PAWP (or LVEDP)',
      use: 'LV myocardial perfusion: matters in hypotension, aortic regurgitation and CPR.',
      tables: [{
        cols: ['CoPP', 'Meaning'], rows: [
          { c: ['60–80 mmHg', 'Normal'], ge: 60, t: 'ok' },
          { c: ['< 50–60 mmHg', 'Subendocardial ischaemia risk → ↑ DBP, ↓ LVEDP'], lt: 60, t: 'bad' },
          { c: ['CPR: < 20 mmHg (arterial diastolic < 25)', 'ROSC unlikely → improve compressions, adrenaline'] },
        ],
      }],
      example: { v: { dbp: 50, pawp: 18 }, expect: { copp: 32 } },
    },
    {
      id: 'rpp', title: 'Rate–pressure product', short: 'RPP',
      tags: ['myocardial oxygen demand', 'ischaemia'],
      inputs: ['hr', 'sbp'],
      outputs: [{ id: 'rppV', label: 'RPP', unit: 'mmHg/min', dp: 0 }],
      calc: (v) => ({ rppV: v.hr * v.sbp }),
      formula: 'RPP = HR × SBP',
      use: 'Myocardial O₂ demand in coronary disease.',
      tables: [{
        cols: ['RPP', 'Meaning'], rows: [
          { c: ['< 12 000', 'Low demand'], lt: 12000, t: 'ok' },
          { c: ['> 12 000', 'Ischaemia risk → control HR and BP'], ge: 12000, t: 'bad' },
        ],
      }],
      example: { v: { hr: 100, sbp: 140 }, expect: { rppV: 14000 } },
    },
    {
      id: 'ef', title: 'Ejection fraction', short: 'EF',
      tags: ['ejection fraction', 'lv function'],
      inputs: ['edv', 'esv'],
      outputs: [{ id: 'efV', label: 'EF', unit: '%', dp: 0 }],
      calc: (v) => ({ efV: (100 * (v.edv - v.esv)) / v.edv }),
      formula: 'EF = [[SV || EDV]] = [[EDV − ESV || EDV]]',
      use: 'LV systolic function. It is load-dependent: vasoplegia flatters it.',
      tables: [{
        cols: ['EF', 'Meaning'], rows: [
          { c: ['≥ 50%', 'Normal / preserved'], ge: 50, t: 'ok' },
          { c: ['41–49%', 'Mildly reduced'], gt: 40, lt: 50, t: 'mid' },
          { c: ['≤ 40%', 'Reduced'], ge: 30, le: 40, t: 'bad' },
          { c: ['< 30%', 'Severely reduced'], lt: 30, t: 'bad' },
        ],
      }],
      example: { v: { edv: 120, esv: 60 }, expect: { efV: 50 } },
    },
    {
      id: 'cpo', title: 'Cardiac power output and index', short: 'CPO',
      tags: ['cardiac power', 'cardiogenic shock', 'mechanical support'],
      inputs: ['map', 'co', 'ci'], optional: ['ci'],
      outputs: [
        { id: 'cpoV', label: 'CPO', unit: 'W', dp: 2 },
        { id: 'cpiV', label: 'CPI', unit: 'W/m²', dp: 2 },
      ],
      calc: (v) => ({ cpoV: (v.map * v.co) / 451, cpiV: v.ci ? (v.map * v.ci) / 451 : null }),
      formula: 'CPO = [[MAP × CO || 451]]   CPI = [[MAP × CI || 451]]',
      use: 'The strongest haemodynamic predictor of death in cardiogenic shock: pressure and flow together.',
      tables: [{
        of: 'cpoV', cols: ['CPO (W)', 'Meaning / action'], rows: [
          { c: ['≈ 1.0', 'Normal at rest'], ge: 1, t: 'ok' },
          { c: ['0.6–1.0', 'Reduced'], ge: 0.6, lt: 1, t: 'mid' },
          { c: ['< 0.6', 'Cardiogenic shock, high mortality → inotropes, mechanical support'], lt: 0.6, t: 'bad' },
        ],
      }],
      example: { v: { map: 65, co: 3.5 }, expect: { cpoV: 0.5 } },
    },
    {
      id: 'ra_pawp', title: 'RA/PAWP ratio', short: 'RA/PAWP',
      tags: ['rv failure', 'lv failure', 'which ventricle'],
      inputs: ['rap', 'pawp'],
      outputs: [{ id: 'raPawp', label: 'RA/PAWP', unit: '', dp: 2 }],
      calc: (v) => ({ raPawp: v.rap / v.pawp }),
      formula: 'RA/PAWP = [[RAP || PAWP]]',
      use: 'Which ventricle is failing.',
      tables: [{
        cols: ['Ratio', 'Meaning'], rows: [
          { c: ['< 0.63', 'LV-predominant failure'], lt: 0.63, t: 'info' },
          { c: ['> 0.63', 'RV-predominant failure'], ge: 0.63, t: 'mid' },
        ],
      }],
      example: { v: { rap: 15, pawp: 18 }, expect: { raPawp: 0.83 } },
    },
    {
      id: 'si', title: 'Shock index and modified shock index', short: 'SI',
      tags: ['shock index', 'bleeding', 'triage', 'occult shock'],
      inputs: ['hr', 'sbp', 'map'], optional: ['map'],
      outputs: [
        { id: 'siV', label: 'SI', unit: '', dp: 2 },
        { id: 'msiV', label: 'MSI', unit: '', dp: 2 },
      ],
      calc: (v) => ({ siV: v.hr / v.sbp, msiV: v.map ? v.hr / v.map : null }),
      formula: 'SI = [[HR || SBP]]   MSI = [[HR || MAP]]',
      use: 'Triage of occult shock and bleeding.',
      tables: [{
        of: 'siV', cols: ['SI', 'Meaning'], rows: [
          { c: ['0.5–0.7', 'Normal'], lt: 0.7, t: 'ok' },
          { c: ['0.7–1.0', 'Watch — early shock possible'], ge: 0.7, le: 1, t: 'mid' },
          { c: ['> 1.0 (MSI > 1.3)', 'Shock or major bleeding likely → act'], when: (v) => v.siV > 1 || v.msiV > 1.3, t: 'bad' },
        ],
      }],
      example: { v: { hr: 110, sbp: 100, map: 75 }, expect: { siV: 1.1, msiV: 1.47 } },
    },
  ]);

  ICU.defArea({
    id: 'hemo', title: 'Haemodynamics', code: 'MAP',
    blurb: 'Pressure, flow and resistance; pulmonary circulation; cardiac work and shock.',
    sections: [
      { title: 'Pressure and flow', items: ['map', 'co_hrsv', 'ci', 'sv', 'svi', 'svr', 'shock', 'guyton'] },
      { title: 'Pulmonary circulation', items: ['pvr', 'tpr', 'tpg', 'ph_class', 'chemla', 'papi'] },
      { title: 'Cardiac work and failure', items: ['lvswi', 'rvswi', 'cpo', 'copp', 'rpp', 'ef', 'ra_pawp', 'si'] },
    ],
  });
})(typeof window !== 'undefined' ? window : globalThis);
