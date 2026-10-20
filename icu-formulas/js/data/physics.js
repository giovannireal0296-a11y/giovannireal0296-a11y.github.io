/* Physical laws behind the physiology, plus tools: unit converter and handout errata. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  const CONV = {
    mmhg_cmh2o: ['Pressure', 'mmHg', 'cmH₂O', 1.36],
    kpa_mmhg: ['Pressure', 'kPa', 'mmHg', 7.5],
    wu_dyn: ['Vascular resistance', 'Wood units', 'dyn·s·cm⁻⁵', 80],
    lmin_ls: ['Flow', 'L/min', 'L/s', 1 / 60, '÷ 60'],
    creat: ['Creatinine', 'mg/dL', 'µmol/L', 88.4],
    bun: ['Urea nitrogen (BUN)', 'mg/dL', 'mmol/L urea', 0.357],
    glucose: ['Glucose', 'mg/dL', 'mmol/L', 1 / 18, '÷ 18'],
    calcium: ['Calcium', 'mg/dL', 'mmol/L', 0.25],
    phosphate: ['Phosphate', 'mg/dL', 'mmol/L', 0.323],
    magnesium: ['Magnesium', 'mg/dL', 'mmol/L', 0.411],
    bilirubin: ['Bilirubin', 'mg/dL', 'µmol/L', 17.1],
    albumin: ['Albumin', 'g/dL', 'g/L', 10],
    lactate: ['Lactate', 'mmol/L', 'mg/dL', 9.0],
    hb: ['Haemoglobin', 'g/dL', 'g/L', 10],
  };

  ICU.defVars({
    dPress: { label: 'Pressure drop (ΔP)', unit: 'any pressure unit', min: 0, max: 1000 },
    flowAny: { label: 'Flow (V̇)', unit: 'matching flow unit', min: 0.001, max: 10000 },
    d1: { label: 'Current internal diameter', unit: 'mm', min: 0.5, max: 30 },
    d2: { label: 'New internal diameter', unit: 'mm', min: 0.5, max: 30 },
    lenRatio: { label: 'Length ratio (new ÷ current)', unit: '', dflt: 1, min: 0.05, max: 20 },
    rho: { label: 'Gas density (ρ)', unit: 'kg/m³', dflt: 1.2, min: 0.1, max: 2000, hint: 'Air ≈ 1.2; heliox 70:30 ≈ 0.5.' },
    velocity: { label: 'Mean gas velocity (v)', unit: 'm/s', min: 0.01, max: 100 },
    diam: { label: 'Tube diameter (d)', unit: 'mm', min: 0.5, max: 40 },
    eta: { label: 'Viscosity (η)', unit: 'µPa·s', dflt: 18.1, min: 1, max: 5000, hint: 'Air ≈ 18; heliox 70:30 ≈ 20.' },
    pLv: { label: 'Cavity pressure (P)', unit: 'mmHg', min: 1, max: 300 },
    rLv: { label: 'Cavity radius (r)', unit: 'cm', min: 0.5, max: 6 },
    hLv: { label: 'Wall thickness (h)', unit: 'cm', min: 0.2, max: 3 },
    pc: { label: 'Capillary hydrostatic pressure (P_c)', unit: 'mmHg', min: 0, max: 60 },
    pint: { label: 'Interstitial hydrostatic pressure (P_i)', unit: 'mmHg', min: -10, max: 30 },
    sigma: { label: 'Reflection coefficient (σ)', unit: '', min: 0, max: 1 },
    pic: { label: 'Capillary oncotic pressure (π_c)', unit: 'mmHg', min: 0, max: 40 },
    pii: { label: 'Interstitial oncotic pressure (π_i)', unit: 'mmHg', min: 0, max: 30 },
    wobJL: { label: 'Work of breathing', unit: 'J/L', min: 0, max: 5 },
    convType: { label: 'Quantity', type: 'choice', options: Object.entries(CONV).map(([k, c]) => [k, `${c[0]}: ${c[1]} → ${c[2]}`]) },
    convVal: { label: 'Value', unit: '', min: -1e9, max: 1e9 },
  });

  ICU.defFormulas('physics', [
    {
      id: 'ohm', title: "Ohm's law for flow", short: 'R = ΔP/V̇',
      tags: ['resistance', 'ohm', 'flow', 'pressure'],
      inputs: ['dPress', 'flowAny'],
      outputs: [{ id: 'resist', label: 'Resistance', unit: 'pressure ÷ flow', dp: 2 }],
      calc: (v) => ({ resist: v.dPress / v.flowAny }),
      formula: 'ΔP = V̇ × R   R = [[ΔP || V̇]]',
      use: 'The same law behind airway resistance, SVR, PVR and cerebral blood flow. Airway resistance at FRC without a tube ≈ 2 cmH₂O/L/s.',
      tables: [{
        cols: ['System', 'Pressure drop = flow × resistance'], rows: [
          { c: ['Airway', 'P_peak − P_plat = V̇ × R_rs'] },
          { c: ['Systemic circulation', 'MAP − RAP = CO × SVR'] },
          { c: ['Pulmonary circulation', 'mPAP − PAWP = CO × PVR'] },
          { c: ['Brain', 'CPP = CBF × cerebrovascular resistance'] },
        ],
      }],
      example: { v: { dPress: 10, flowAny: 1 }, expect: { resist: 10 } },
    },
    {
      id: 'poiseuille', title: "Poiseuille's law: tube and cannula resistance", short: 'r⁴',
      tags: ['poiseuille', 'tube size', 'cannula', 'endotracheal tube', 'laminar'],
      inputs: ['d1', 'd2', 'lenRatio'],
      outputs: [{ id: 'rRatio', label: 'New resistance ÷ current', unit: '×', dp: 2 }],
      calc: (v) => ({ rRatio: v.lenRatio * Math.pow(v.d1 / v.d2, 4) }),
      formula: 'V̇ = [[ΔP π r^4 || 8 η l]]   R = [[8 η l || π r^4]]',
      use: 'Choose tubes and cannulas: radius matters most. A short, wide cannula beats a long CVC lumen for fast infusion. Laminar flow only.',
      tables: [{
        cols: ['Change', 'Resistance'], rows: [
          { c: ['Radius halved', '× 16'] },
          { c: ['Length doubled', '× 2'] },
          { c: ['Tube 8.0 → 7.0 mm', '≈ × 1.7'] },
          { c: ['Tube 8.0 → 6.0 mm', '≈ × 3.2'] },
        ],
      }],
      example: { v: { d1: 8, d2: 7, lenRatio: 1 }, expect: { rRatio: 1.71 } },
    },
    {
      id: 'reynolds', title: 'Reynolds number', short: 'Re',
      tags: ['turbulent', 'laminar', 'heliox', 'reynolds'],
      inputs: ['rho', 'velocity', 'diam', 'eta'],
      outputs: [{ id: 'reV', label: 'Re', unit: '', dp: 0 }],
      calc: (v) => ({ reV: (v.rho * v.velocity * (v.diam / 1000)) / (v.eta * 1e-6) }),
      formula: 'Re = [[ρ v d || η]]',
      use: 'When flow turns turbulent, resistance rises with flow; low-density heliox helps.',
      tables: [{
        cols: ['Re', 'Flow'], rows: [
          { c: ['< 2000', 'Laminar — resistance constant'], lt: 2000, t: 'ok' },
          { c: ['2000–4000', 'Transitional'], ge: 2000, le: 4000, t: 'mid' },
          { c: ['> 4000', 'Turbulent — ↓ flow or use heliox'], gt: 4000, t: 'bad' },
        ],
      }],
      example: { v: { rho: 1.2, velocity: 10, diam: 8, eta: 18.1 }, expect: { reV: 5304 } },
    },
    {
      id: 'laplace', title: "Laplace's law: wall stress", short: 'Laplace',
      tags: ['laplace', 'wall stress', 'surfactant', 'ventricle'],
      inputs: ['pLv', 'rLv', 'hLv'],
      outputs: [{ id: 'wallStress', label: 'Wall stress (σ)', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ wallStress: (v.pLv * v.rLv) / (2 * v.hLv) }),
      formula: 'Sphere: P = [[2T || r]]   Wall stress: σ = [[P × r || 2h]]',
      use: 'Surfactant and atelectasis; ventricular wall stress and O₂ demand. Compare two states rather than reading the number alone.',
      tables: [{
        cols: ['Situation', 'Consequence'], rows: [
          { c: ['Small alveolus without surfactant', 'High collapsing pressure → atelectasis (ARDS, neonates)'] },
          { c: ['Dilated ventricle (r ↑)', 'Wall stress ↑ → O₂ demand ↑'] },
          { c: ['Hypertrophy (h ↑)', 'Wall stress normalised'] },
        ],
      }],
      example: { v: { pLv: 120, rLv: 2.5, hLv: 1 }, expect: { wallStress: 150 } },
    },
    {
      id: 'starling', title: 'Starling equation: net filtration', short: 'Starling',
      tags: ['oedema', 'edema', 'capillary leak', 'oncotic', 'albumin'],
      inputs: ['pc', 'pint', 'sigma', 'pic', 'pii'],
      outputs: [{ id: 'nfp', label: 'Net filtration pressure', unit: 'mmHg', dp: 1 }],
      calc: (v) => ({ nfp: (v.pc - v.pint) - v.sigma * (v.pic - v.pii) }),
      formula: 'Q̇_f = K_f [ (P_c − P_i) − σ (π_c − π_i) ]',
      use: 'Understand oedema and why albumin leaks in sepsis. The app gives the bracket (net pressure); K_f scales it to flow.',
      tables: [{
        cols: ['Change', 'Effect'], rows: [
          { c: ['Capillary pressure ↑ (fluid overload, LV failure)', 'Hydrostatic oedema'] },
          { c: ['σ ↓ (sepsis, ARDS: leaky capillary)', 'Permeability oedema; albumin leaks out'] },
          { c: ['Oncotic pressure ↓ (low albumin)', 'Modest oedema ↑'] },
        ],
      }],
      example: { v: { pc: 25, pint: 0, sigma: 0.9, pic: 25, pii: 5 }, expect: { nfp: 7 } },
    },
    {
      id: 'fick_diff', kind: 'ref', title: "Fick's law of diffusion", short: 'Diffusion',
      tags: ['diffusion', 'fick', 'fibrosis', 'hypoxaemia'],
      formula: 'V̇_gas = [[A × D × (P_1 − P_2) || T]]',
      use: 'Why diffusion problems cause hypoxaemia long before hypercapnia. A = area, D = diffusion constant, T = membrane thickness.',
      tables: [{
        cols: ['Change', 'Diffusion'], rows: [
          { c: ['Area ↓ (emphysema, resection, PE)', '↓'] },
          { c: ['Thickness ↑ (fibrosis, oedema)', '↓'] },
          { c: ['CO₂ vs O₂', 'CO₂ diffuses ≈ 20 × faster'] },
        ],
      }],
    },
    {
      id: 'pio2', title: 'Inspired O₂ (Dalton and Henry)', short: 'PiO₂',
      tags: ['altitude', 'aeromedical', 'dalton', 'henry', 'inspired oxygen', 'flight'],
      inputs: ['fio2', 'patm'],
      outputs: [{ id: 'pio2V', label: 'PiO₂', unit: 'mmHg', dp: 0 }],
      calc: (v) => ({ pio2V: v.fio2 * (v.patm - 47) }),
      formula: 'P_iO_2 = FiO_2 × (P_B − 47)   D_{O_2} = 0.003 × PaO_2',
      use: 'Altitude and aeromedical transfer; hyperbaric oxygen. Barometric pressure can be estimated from altitude.',
      tables: [{
        title: 'Air (FiO₂ 0.21)', cols: ['Setting', 'PiO₂ (mmHg)'], rows: [
          { c: ['Sea level (P_B 760)', '≈ 150'] },
          { c: ['2000 m (P_B ≈ 600)', '≈ 116'] },
          { c: ['Aircraft cabin ≈ 2400 m (P_B ≈ 565)', '≈ 109'] },
        ],
      }],
      example: { v: { fio2: 0.21, patm: 760 }, expect: { pio2V: 150 } },
    },
    {
      id: 'wob', title: 'Work of breathing', short: 'WOB',
      tags: ['work of breathing', 'weaning', 'effort'],
      inputs: ['wobJL'],
      outputs: [{ id: 'wobV', label: 'WOB', unit: 'J/L', dp: 2 }],
      calc: (v) => ({ wobV: v.wobJL }),
      formula: 'W_thorax = ∫(P_aw − P_atm) V̇ dt   W_lung = ∫(P_aw − P_es) V̇ dt   W_cw = ∫(P_es − P_atm) V̇ dt',
      use: 'Load on the respiratory muscles, from research ventilators or an oesophageal balloon. Handout normal total ≈ 0.5 kg·m/min.',
      tables: [{
        cols: ['WOB (J/L)', 'Meaning'], rows: [
          { c: ['≈ 0.3–0.7', 'Normal'], le: 0.7, t: 'ok' },
          { c: ['0.7–1.0', 'Raised'], gt: 0.7, le: 1, t: 'mid', added: true },
          { c: ['> 1.0–1.5', 'High → weaning failure likely, ↑ support'], gt: 1, t: 'bad' },
        ],
      }],
      example: { v: { wobJL: 1.2 }, expect: { wobV: 1.2 } },
    },

    // Tools
    {
      id: 'convert', title: 'Unit converter', short: '⇄',
      tags: ['units', 'conversion', 'si', 'mg/dl', 'mmol', 'kpa', 'cmh2o'],
      inputs: ['convType', 'convVal'],
      outputs: [
        { id: 'convFwd', labelFn: (v) => `${ICU.fmt(v.convVal, 2)} ${CONV[v.convType][1]} =`, unitFn: (v) => CONV[v.convType][2], dp: 2 },
        { id: 'convRev', labelFn: (v) => `${ICU.fmt(v.convVal, 2)} ${CONV[v.convType][2]} =`, unitFn: (v) => CONV[v.convType][1], dp: 2 },
      ],
      calc: (v) => {
        const k = CONV[v.convType][3];
        return { convFwd: v.convVal * k, convRev: v.convVal / k };
      },
      formula: 'Value × factor (or ÷ factor for the reverse)',
      use: 'Convert between conventional and SI units. Both directions are shown.',
      tables: [{
        cols: ['Quantity', 'From → to', 'Multiply by'], rows: Object.values(CONV).map((c) => ({
          c: [c[0], `${c[1]} → ${c[2]}`, c[4] || String(c[3])],
        })),
      }],
      example: { v: { convType: 'creat', convVal: 1.2 }, expect: { convFwd: 106.1 } },
    },
    {
      id: 'errata', kind: 'ref', title: 'Errors and caveats in the handout', short: 'Errata',
      tags: ['errata', 'errors', 'handout', 'corrections'],
      use: 'Where the original handout is wrong or ambiguous. The app already uses the corrected forms.',
      tables: [{
        cols: ['Page', 'As printed', 'Use instead'], rows: [
          { c: ['1 (compliance / elastance)', 'Same "volume corrente" in both', 'V_T in mL for compliance (mL/cmH₂O); V_T in L for elastance (cmH₂O/L)'] },
          { c: ['4 (SVR)', '(MPA − RAP) × 80 / CO', '(MAP − RAP) × 80 / CO'] },
          { c: ['4 (RVSWI)', 'SVI × (MAP − RAP) × 0.0136', 'SVI × (mPAP − RAP) × 0.0136'] },
          { c: ['4 vs 5 (SVR normal)', '800–1200 vs 770–1500', 'Both are in use; 800–1200 dyn·s·cm⁻⁵ is the usual reference'] },
          { c: ['4 vs 5 (PVR normal)', '< 250 vs 20–120', '≤ 2 Wood units (≈ 160 dyn·s·cm⁻⁵), ESC/ERS 2022'] },
          { c: ['5 (BMI)', 'weight / height (cm)²', 'weight (kg) / height (m)²'] },
          { c: ['5 (Weir)', '3.94 × V̇O₂ + 1.11 × V̇CO₂', '× 1.44 when V̇O₂ and V̇CO₂ are in mL/min, to get kcal/day'] },
          { c: ['5 (Fick CI)', '10 × V̇O₂ / (Hb × 1.39 × (SaO₂ − SvO₂))', 'Correct as printed, but only with saturations in percent (98 − 70), not fractions'] },
          { c: ['3, 5 (O₂ content)', '1.39 mL O₂ per g Hb', '1.34 is the usual clinical value; 1.39 is the theoretical maximum'] },
          { c: ['6 (Na and glucose)', 'Na ↓ 1 per 62 mg/dL glucose', '≈ 1.6 per 100 mg/dL (Katz); 2.4 per 100 (Hillier) fits better above 400 mg/dL'] },
          { c: ['3 (dead space)', '"Physiologic dead space" using PaCO₂', 'This is Enghoff\'s modification; true Bohr uses alveolar P_ACO₂'] },
        ],
      }],
    },
  ]);

  ICU.defArea({
    id: 'physics', title: 'Physics behind the physiology', code: 'ΔP=Q̇R',
    blurb: "Ohm, Poiseuille, Reynolds, Laplace, Starling, Fick, Dalton and work of breathing.",
    sections: [{ title: 'Physical laws', items: ['ohm', 'poiseuille', 'reynolds', 'laplace', 'starling', 'fick_diff', 'pio2', 'wob'] }],
  });
  ICU.defArea({
    id: 'tools', title: 'Units and reference', code: '⇄',
    blurb: 'Unit converter and the corrections to the original handout.',
    sections: [{ title: 'Tools', items: ['convert', 'errata'] }],
  });
})(typeof window !== 'undefined' ? window : globalThis);
