/* Step-by-step guides for the procedures that need more than a formula. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  ICU.defGuide({
    id: 'ri', area: 'vent', title: 'R/I ratio: step by step', short: 'R/I',
    tags: ['recruitment to inflation', 'chen', 'peep', 'recruitability'],
    intro: 'One PEEP drop separates recruited volume from simple inflation. Recruitment-to-inflation ratio (Chen 2020), PEEP high 15, PEEP low 5 cmH₂O. Takes about 5 minutes.',
    steps: [
      { title: 'Set up', text: 'Passive patient: no effort on the waveform. Volume control, constant flow, V_T 6 mL/kg PBW.', fig: 'riStep1' },
      { title: 'Check airway closure at PEEP 5', text: 'Low-flow inflation (≈ 5 L/min): the inflection on the curve is the airway opening pressure (AOP). If AOP is above 5 cmH₂O, use AOP in place of PEEP low in steps 5–6 (the calculator does this when you enter AOP).', fig: 'riStep2' },
      { title: 'Ventilate at PEEP 15', text: 'Let lung volume stabilise for several breaths before the drop.', fig: 'riStep3' },
      { title: 'Drop PEEP 15 → 5 for one breath', text: 'At end-expiration lower PEEP for a single breath and read the exhaled volume of that breath. ΔEELV = that exhaled volume − V_T.', fig: 'riStep4', hl: true },
      { title: 'Measure compliance at PEEP 5', text: 'End-inspiratory hold on a breath at the low PEEP. C_rs,low = V_T ÷ (P_plat − 5).', fig: 'riStep5' },
      { title: 'Calculate R/I', text: 'V_rec = ΔEELV − C_rs,low × (15 − 5). C_rec = V_rec ÷ 10. R/I = C_rec ÷ C_rs,low. Enter the numbers below and the app does all of it.', fig: 'riBar' },
    ],
    outcomes: [
      { title: 'R/I ≥ 0.5 · Recruitable', text: 'Higher PEEP is likely to recruit → titrate PEEP up.', t: 'ok' },
      { title: 'R/I < 0.5 · Poorly recruitable', text: 'Higher PEEP mostly overdistends → keep it lower.', t: 'mid' },
    ],
    example: 'C_rs,low 30 mL/cmH₂O and ΔEELV 500 mL → expected inflation 30 × 10 = 300 mL, V_rec 200 mL, C_rec 20 mL/cmH₂O, R/I 0.67 → recruitable.',
    calc: 'ri',
    extra: [{ title: 'Background: the low-flow P–V loop', fig: 'pvLoop', text: 'Read the loop in order: AOP (airways open), LIP (mass recruitment), linear zone (where tidal breaths belong), UIP (overdistension). On the way down, the deflation inflection marks collapse. The wider the hysteresis, the more recruitable the lung.' }],
  });

  ICU.defGuide({
    id: 'pvloop', area: 'vent', title: 'Reading a low-flow P–V loop', short: 'P–V loop',
    tags: ['pressure volume curve', 'lip', 'uip', 'hysteresis', 'aop'],
    intro: 'Passive patient, flow ≈ 5 L/min from zero PEEP up to the pressure limit and back. Schematic, not to scale.',
    steps: [
      { title: 'AOP: airways open', text: 'Below this pressure the curve is flat: airways are closed and no volume enters. Set PEEP at or above it.' },
      { title: 'LIP: mass recruitment begins', text: 'The curve steepens as collapsed units open.' },
      { title: 'Linear zone', text: 'The steepest part: keep tidal breathing here.' },
      { title: 'UIP: overdistension begins', text: 'The curve flattens again; keep end-inspiratory pressure below it.' },
      { title: 'Deflation limb', text: 'On the way down the inflection marks where collapse begins: set PEEP above it. The wider the hysteresis, the more recruitable the lung.' },
    ],
    fig: 'pvLoop',
    related: ['ri', 'crs'],
  });

  ICU.defGuide({
    id: 'holds', area: 'vent', title: 'Measuring P_plat, PEEP_tot and P_es', short: 'Holds',
    tags: ['inspiratory hold', 'expiratory hold', 'plateau', 'auto-peep', 'oesophageal'],
    intro: 'In a passive patient on volume control with constant flow, an end-inspiratory hold and an end-expiratory hold give PEEP_tot, P_plat, resistance and compliance.',
    fig: 'holds',
    steps: [
      { title: 'Make sure the patient is passive', text: 'Smooth P_aw rise and a flat plateau on the hold. A scooped P_aw or an unstable plateau means patient effort: repeat when passive.' },
      { title: 'Volume control, constant flow', text: 'Note V_T and the set flow (60 L/min = 1 L/s).' },
      { title: 'End-inspiratory hold ≈ 0.3 s', text: 'Read P_peak just before the hold and P_plat at the end of it. Long holds (2–5 s) let P_plat decay by 2–3 cmH₂O and underestimate risk.' },
      { title: 'End-expiratory hold 1–2 s', text: 'Read PEEP_tot. PEEP_i = PEEP_tot − set PEEP.' },
      { title: 'Check for leaks', text: 'The V_T of the held breath should match the next breath.' },
      { title: 'With an oesophageal balloon', text: 'During the same holds read P_es,ei and P_es,ee. These feed the partitioned mechanics (C_L, C_cw, P_L).' },
      { title: 'Obesity or low PEEP', text: 'Look for an airway opening pressure on a low-flow inflation before trusting P_plat.' },
    ],
    related: ['peepi', 'pplat_i', 'crs', 'rrs', 'dp', 'part_e', 'dpl'],
  });

  ICU.defGuide({
    id: 'stressindex', area: 'vent', title: 'Stress index from the P_aw curve', short: 'Stress index',
    tags: ['stress index', 'ranieri', 'waveform'],
    intro: 'Under constant flow, a curve that flattens means tidal recruitment, a straight line means stable compliance, and a curve that steepens means overdistension.',
    fig: 'stressIndex',
    steps: [
      { title: 'Set up', text: 'Volume control, square flow, passive patient. No pleural effusion or high abdominal pressure (the index is unreliable there).' },
      { title: 'Freeze the screen', text: 'Look at the P_aw curve during inspiration, after the initial resistive step.' },
      { title: 'Read three points', text: 'With the cursor, read P_aw at three equally spaced times from the start of flow: t, 2t and 3t (for example 0.25, 0.5 and 0.75 s).' },
      { title: 'Calculate', text: 'Enter the three pressures below; the app fits P_aw = a·t^b + c through them.', hl: true },
      { title: 'Act on b', text: 'b < 0.9 → consider ↑ PEEP. b 0.9–1.1 → keep. b > 1.1 → ↓ V_T or PEEP, then re-check.' },
    ],
    calc: 'stress_index',
  });

  ICU.defGuide({
    id: 'shunt', area: 'gas', title: 'Measuring the shunt fraction', short: 'Shunt',
    tags: ['shunt', 'qs/qt', 'venous admixture', 'pa catheter'],
    intro: 'Qs/Qt needs an arterial and a mixed venous gas at the same time, plus Hb and the alveolar PO₂.',
    steps: [
      { title: 'FiO₂ 1.0 for ≈ 20 min', text: 'This measures true shunt (V/Q mismatch removed). At a lower FiO₂ the result is venous admixture. Keep it short: 100% O₂ causes absorption atelectasis.' },
      { title: 'Draw both gases together', text: 'Arterial gas and mixed venous gas from the distal port of the PA catheter, drawn slowly. A central venous gas is only a rough surrogate.' },
      { title: 'Calculate', text: 'P_AO₂ → Cc′O₂, CaO₂, C̄vO₂ → shunt fraction. Enter the raw values below: the app calculates every intermediate.', hl: true },
      { title: 'Read the result', text: 'Shunt > 30%: FiO₂ barely helps → recruit, PEEP, prone. Shortcut on FiO₂ 1.0: each ≈ 20 mmHg of A–a gradient ≈ 1% shunt.' },
    ],
    example: 'Hb 10 g/dL, PaCO₂ 40 → P_AO₂ 663, Cc′O₂ 15.4; PaO₂ 150, SaO₂ 99% → CaO₂ 13.7; SvO₂ 70%, PvO₂ 38 → C̄vO₂ 9.5; shunt = (15.4 − 13.7) ÷ (15.4 − 9.5) ≈ 28%.',
    calc: 'shunt',
  });

  ICU.defGuide({
    id: 'frc', area: 'vent', title: 'Getting FRC and strain', short: 'Strain',
    tags: ['frc', 'eelv', 'strain', 'nitrogen washout'],
    intro: 'Strain explains why the same V_T injures a small lung. It needs a lung-volume measurement; without one, ΔP is the surrogate.',
    fig: 'volumes',
    steps: [
      { title: 'Measure EELV at the current PEEP', text: 'Nitrogen washout or wash-in on ventilators that offer it, helium dilution, or CT (reference).' },
      { title: 'Tidal (dynamic) strain', text: 'V_T ÷ EELV: the one to limit first.' },
      { title: 'For total strain, measure V_PEEP', text: 'Release PEEP to zero during an expiratory hold and measure the extra volume exhaled. FRC = EELV − V_PEEP; total strain = (V_T + V_PEEP) ÷ FRC.' },
      { title: 'Match the pressure to the volume', text: 'Tidal strain goes with ΔP_L = (P_plat − PEEP_tot) − (P_es,ei − P_es,ee); total strain with P_L,ei = P_plat × E_L/E_rs.' },
    ],
    example: 'V_T 450 mL with EELV 1500 mL → strain 0.3; the same V_T in a 600 mL "baby lung" → 0.75.',
    calc: 'strain_tot',
    related: ['strain_dyn', 'strain_pl', 'dp'],
  });

  ICU.defGuide({
    id: 'acidbase', area: 'ab', title: 'Reading a blood gas in five steps', short: 'ABG',
    tags: ['blood gas', 'acid base', 'abg', 'winter'],
    intro: 'Identify the primary disorder, check the expected compensation, then use the anion gap, delta ratio or Stewart variables to find hidden processes.',
    steps: [
      { title: 'Is the gas consistent?', text: 'Calculated [H⁺] = 24 × PaCO₂ ÷ HCO₃⁻ should match the pH (pH 7.40 ↔ 40 nmol/L). If not, suspect a sampling or analyser error.' },
      { title: 'Acidaemia or alkalaemia?', text: 'pH < 7.35 acidaemia, > 7.45 alkalaemia. A normal pH can still hide a mixed disorder.' },
      { title: 'Primary disorder and compensation', text: 'Which of PaCO₂ and HCO₃⁻ explains the pH? Compare the other one with its expected value (Winter for metabolic acidosis). A mismatch means a second disorder.', hl: true },
      { title: 'Anion gap, corrected for albumin', text: 'In metabolic acidosis: AG = Na − Cl − HCO₃⁻, + 2.5 per g/dL albumin below 4. High gap: lactate, ketones, renal failure, toxic alcohols, salicylate.' },
      { title: 'Delta ratio and the rest', text: 'In a high-gap acidosis, the delta ratio finds a second metabolic process. Normal-gap: urine anion or osmolal gap. When albumin or chloride mislead, use Stewart (SID, SIG) or the base-excess partition.' },
    ],
    calc: 'comp',
    related: ['henderson', 'ag', 'agcorr', 'delta', 'uag', 'stewart', 'fencl'],
  });

  ICU.defGuide({
    id: 'bleeding', area: 'coag', title: 'Step-up bleeding algorithm', short: 'Bleeding',
    tags: ['rotem', 'teg', 'bleeding', 'algorithm', 'massive transfusion'],
    intro: 'Treat what kills first, in order. ROTEM A5 triggers (Görlinger 2019) with TEG equivalents; follow your local algorithm. Read FIBTEM before EXTEM CT: low fibrinogen alone prolongs CT, so treating CT first leads to unnecessary PCC or plasma.',
    steps: [
      { title: 'Is there diffuse, non-surgical bleeding?', text: 'No → do not treat abnormal numbers; observe and re-test if bleeding starts. Yes → work down the steps; re-test 10–15 min after each intervention (no more than 3 at once).' },
      { title: 'Correct basic conditions', text: 'Temperature > 35 °C · pH > 7.3 · ionised Ca²⁺ > 1 mmol/L · Hb ≥ 7 g/dL. Coagulation products work poorly without these.' },
      { title: 'Fibrinolysis', text: 'ROTEM: ML > 15% in EXTEM or FIBTEM (≥ 5% in trauma), better in APTEM; FIBTEM flat line. TEG: LY30 > 3% (trauma). → Tranexamic acid 1 g IV (≈ 25 mg/kg); in trauma and PPH give early, within 3 h.' },
      { title: 'Fibrinogen (usually the first to fall)', text: 'ROTEM: FIBTEM A5 < 9 mm (liver transplant < 8, obstetrics < 12). TEG: K > 3 min, α < 53° or low functional fibrinogen MA. → Fibrinogen concentrate, g = ΔA5 × kg ÷ 160, or cryoprecipitate (10 U ≈ 2 g).', hl: true },
      { title: 'Platelets', text: 'ROTEM: EXTEM A5 < 35 mm (liver transplant < 25) once FIBTEM A5 is adequate. TEG: MA < 50 mm with adequate fibrinogen. → 1 adult dose ≈ + 8–10 mm EXTEM A5 (≈ 5 mm in cirrhosis); desmopressin if on antiplatelets.' },
      { title: 'Coagulation factors (thrombin generation)', text: 'ROTEM: EXTEM CT > 80 s (liver transplant > 75 s) once FIBTEM A5 is adequate. TEG: R > 10 min. → 4F-PCC ≈ 20–25 IU/kg (less in cirrhosis) or FFP 10–15 mL/kg.' },
      { title: 'Heparin / heparin-like effect', text: 'ROTEM: INTEM CT ↑ with normal HEPTEM, CT_INTEM/CT_HEPTEM ≥ 1.25 (check first in cardiac surgery). TEG: R shorter in the heparinase cup. → Protamine if bleeding; after liver reperfusion the effect is often self-limiting.' },
      { title: 'Still bleeding with a normal trace?', text: 'Look for surgical bleeding, antiplatelet effect (platelet function test), factor XIII; rFVIIa last resort.' },
    ],
    calc: 'rotem_algo',
    related: ['fib_dose', 'plt_dose', 'ml', 'hle', 'pltem'],
  });

  ICU.defGuide({
    id: 'rotemtrace', area: 'coag', title: 'Reading a ROTEM / TEG trace', short: 'Trace',
    tags: ['rotem', 'teg', 'ct', 'mcf', 'ma', 'trace'],
    intro: 'Clot amplitude over time. Solid = normal; dashed = hyperfibrinolysis. A5 / A10 = firmness 5 / 10 min after CT.',
    fig: 'rotemTrace',
    steps: [
      { title: 'CT / R: when the clot starts', text: 'Coagulation factors, anticoagulants, heparin.' },
      { title: 'CFT / K and α: how fast it builds', text: 'Fibrinogen and platelets.' },
      { title: 'A5, A10 and MCF / MA: how strong it gets', text: 'Platelets plus fibrinogen. A5 and A10 predict MCF, so you can act at 10 minutes.' },
      { title: 'ML / LY30: how fast it breaks down', text: 'Fibrinolysis; confirm with APTEM.' },
    ],
    related: ['rotem_params', 'rotem_patterns', 'rotem_algo'],
  });
})(typeof window !== 'undefined' ? window : globalThis);
