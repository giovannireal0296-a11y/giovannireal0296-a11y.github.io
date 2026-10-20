/* Inline SVG figures for the guides and the R/I result. Colours come from CSS
   classes (see app.css: .fig ...) so every figure follows the light/dark theme. */
(function (root) {
  'use strict';
  const ICU = root.ICU;

  const r1 = (x) => String(Math.round(x * 10) / 10);
  const path = (pts) => 'M' + pts.map(([x, y]) => r1(x) + ' ' + r1(y)).join(' L');
  const svg = (w, h, label, body) =>
    `<svg class="fig" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>`;
  const ln = (x1, y1, x2, y2, cls = 'ax') => `<line class="${cls}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
  const tx = (x, y, s, cls = 't', anchor = 'start') => `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor}">${s}</text>`;
  const pa = (pts, cls) => `<path class="${cls}" d="${path(pts)}"/>`;
  const dot = (x, y) => `<circle class="dot" cx="${r1(x)}" cy="${r1(y)}" r="3.2"/>`;
  // Vertical bracket with a label on its right.
  const vbr = (x, y1, y2, label, cls = 't') =>
    `<path class="ax" d="M${r1(x - 4)} ${r1(y1)} H${r1(x)} V${r1(y2)} H${r1(x - 4)}"/>` + tx(x + 5, (y1 + y2) / 2 + 4, label, cls);

  // One volume-controlled breath: square flow, P_aw ramp, optional hold.
  // b bends the ramp (b < 1 convex, b > 1 concave) as in the stress index.
  function breath(o) {
    const { x0, ti, hold = 0, te, yPeep, yStart, yPeak, yPlat, yEnd = yPeep, b = 1 } = o;
    const paw = [[x0, yPeep], [x0, yStart]];
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      paw.push([x0 + t * ti, yStart + (yPeak - yStart) * Math.pow(t, b)]);
    }
    let xe = x0 + ti;
    let last = yPeak;
    if (hold > 0) {
      paw.push([xe + 2, yPlat], [xe + hold, yPlat]);
      xe += hold;
      last = yPlat;
    }
    for (let i = 1; i <= 30; i++) {
      const t = i / 30;
      paw.push([xe + t * te, yEnd + (last - yEnd) * Math.exp(-t * 7)]);
    }
    return { paw, xEnd: xe + te };
  }
  function flowTrace(o) {
    const { x0, ti, hold = 0, te, y0, yIn, yEx } = o;
    const pts = [[x0, y0], [x0, yIn], [x0 + ti, yIn], [x0 + ti, y0]];
    const xe = x0 + ti + hold;
    if (hold) pts.push([xe, y0]);
    pts.push([xe + 1, yEx]);
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      pts.push([xe + 1 + t * (te - 1), y0 + (yEx - y0) * Math.exp(-t * 5)]);
    }
    return pts;
  }

  const fig = {};

  // Respiratory mechanics holds: P_peak, P_plat, PEEP_tot.
  fig.holds = () => {
    const yPeepSet = 168;
    const yPeepTot = 156;
    const br = breath({ x0: 70, ti: 70, hold: 34, te: 120, yPeep: yPeepSet, yStart: 138, yPeak: 58, yPlat: 82, yEnd: yPeepTot });
    const fl = flowTrace({ x0: 70, ti: 70, hold: 34, te: 120, y0: 40, yIn: 18, yEx: 62 });
    const tail = [[br.xEnd, yPeepTot], [br.xEnd + 40, yPeepTot]];
    let body = '';
    body += tx(8, 32, 'Flow', 'tm') + tx(8, 120, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm');
    body += ln(48, 40, 340, 40, 'base');
    body += pa(fl, 'w3');
    body += ln(48, yPeepSet, 340, yPeepSet, 'base dash');
    body += `<rect class="shade" x="140" y="50" width="34" height="122"/>`;
    body += `<rect class="shade" x="294" y="50" width="40" height="122"/>`;
    body += pa(br.paw.concat(tail), 'w1');
    body += dot(140, 58) + tx(136, 54, 'P<tspan baseline-shift="sub" font-size="70%">peak</tspan>', 't', 'end');
    body += dot(170, 82) + tx(157, 76, 'P<tspan baseline-shift="sub" font-size="70%">plat</tspan>', 't', 'middle');
    body += vbr(194, 58, 82, 'R × V̇', 'ts');
    body += vbr(194, 86, yPeepTot, 'ΔP', 'ts');
    body += tx(314, 150, 'PEEP<tspan baseline-shift="sub" font-size="70%">tot</tspan>', 't', 'middle');
    body += tx(212, yPeepSet + 14, 'set PEEP', 'tm');
    body += tx(157, 198, 'insp. hold ≈ 0.3 s', 'tm', 'middle') + tx(314, 198, 'exp. hold 1–2 s', 'tm', 'middle');
    return svg(350, 206, 'Volume-control breath with an end-inspiratory and an end-expiratory hold', body);
  };

  // R/I step 1: passive patient, volume control, constant flow.
  fig.riStep1 = () => {
    let body = tx(4, 30, 'Flow', 'tm') + tx(4, 104, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm');
    body += ln(40, 36, 300, 36, 'base') + ln(40, 128, 300, 128, 'base dash');
    for (const x0 of [52, 172]) {
      const b = breath({ x0, ti: 50, te: 70, yPeep: 128, yStart: 116, yPeak: 66 });
      body += pa(flowTrace({ x0, ti: 50, te: 70, y0: 36, yIn: 16, yEx: 56 }), 'w3') + pa(b.paw, 'w1');
    }
    return svg(310, 140, 'Square flow and a smooth pressure rise in a passive patient', body);
  };

  // R/I step 2: low-flow inflation and airway opening pressure.
  fig.riStep2 = () => {
    const X = (p) => 44 + p * 6.6;
    const Y = (v) => 128 - v * 110;
    const open = [];
    const closed = [];
    for (let p = 0; p <= 36; p += 0.5) {
      open.push([X(p), Y(0.95 * (1 - Math.exp(-p / 7)))]);
      closed.push([X(p), Y(p < 8 ? 0.004 * p : 0.03 + 0.9 * (1 - Math.exp(-(p - 8) / 14)))]);
    }
    let body = ln(44, 128, 290, 128) + ln(44, 128, 44, 10);
    body += tx(48, 18, 'Vol', 'tm') + tx(290, 142, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm', 'end');
    body += pa(open, 'w2') + pa(closed, 'w1');
    body += ln(X(8), 128, X(8), 72, 'ax dash') + dot(X(8), Y(0.032)) + tx(X(8) + 4, 66, 'AOP', 't', 'middle');
    body += tx(X(21), Y(0.36), 'with airway closure', 'ts');
    body += tx(X(13), Y(0.78) - 6, 'open airways', 'ts', 'end');
    return svg(300, 150, 'Low-flow inflation: the curve stays flat until the airway opening pressure', body);
  };

  // R/I step 3: stabilise at PEEP 15.
  fig.riStep3 = () => {
    let body = tx(4, 74, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm');
    body += ln(40, 104, 300, 104, 'base dash') + ln(40, 128, 300, 128, 'base dash');
    body += tx(36, 108, '15', 'tm', 'end') + tx(36, 132, '5', 'tm', 'end');
    for (const x0 of [52, 172]) {
      body += pa(breath({ x0, ti: 50, te: 70, yPeep: 104, yStart: 94, yPeak: 30 }).paw, 'w1');
    }
    return svg(310, 140, 'Ventilation at PEEP 15 for several breaths', body);
  };

  // R/I step 4: one breath released from PEEP 15 to 5; extra exhaled volume.
  fig.riStep4 = () => {
    let body = tx(4, 34, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm') + tx(4, 118, 'Vol', 'tm');
    const b1 = breath({ x0: 48, ti: 44, te: 60, yPeep: 62, yStart: 56, yPeak: 16 });
    const b2 = breath({ x0: 152, ti: 44, te: 96, yPeep: 62, yStart: 56, yPeak: 16, yEnd: 76 });
    body += ln(40, 62, 300, 62, 'base dash') + ln(40, 76, 300, 76, 'base dash');
    body += tx(304, 66, '15', 'tm') + tx(304, 80, '5', 'tm');
    body += pa(b1.paw, 'w1') + pa(b2.paw.concat([[b2.xEnd + 6, 76]]), 'w1');
    // Volume: rises with each breath; after the release it falls below the start.
    const vol = [];
    const v0 = 120;
    for (const [x0, deep] of [[48, 0], [152, 1]]) {
      for (let i = 0; i <= 12; i++) vol.push([x0 + (44 * i) / 12, v0 - 26 * (i / 12)]);
      const te = deep ? 96 : 60;
      const end = deep ? v0 + 22 : v0;
      for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        vol.push([x0 + 44 + t * te, end + (v0 - 26 - end) * Math.exp(-t * 6)]);
      }
    }
    body += ln(40, v0, 300, v0, 'base');
    body += pa(vol.concat([[298, v0 + 22]]), 'w3');
    body += vbr(300, v0, v0 + 22, 'ΔEELV', 'ts');
    return svg(350, 152, 'Dropping PEEP from 15 to 5 for one breath releases extra volume, ΔEELV', body);
  };

  // R/I step 5: compliance at the low PEEP.
  fig.riStep5 = () => {
    let body = tx(4, 74, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan>', 'tm');
    const b = breath({ x0: 60, ti: 70, hold: 60, te: 90, yPeep: 120, yStart: 108, yPeak: 30, yPlat: 46 });
    body += ln(40, 120, 300, 120, 'base dash') + ln(130, 46, 280, 46, 'ax dash');
    body += pa(b.paw, 'w1');
    body += tx(36, 124, '5', 'tm', 'end') + tx(272, 40, 'P<tspan baseline-shift="sub" font-size="70%">plat</tspan>', 't', 'end');
    body += vbr(282, 46, 120, 'ΔP', 'ts');
    return svg(320, 134, 'End-inspiratory hold at PEEP 5 gives the plateau and the driving pressure', body);
  };

  // R/I step 6: ΔEELV split into expected inflation and recruited volume.
  fig.riBar = (infl, vrec) => {
    const demo = infl == null || vrec == null;
    if (demo) { infl = 300; vrec = 200; }
    const tot = Math.max(1, infl + vrec);
    const W = 260;
    const wi = (W * infl) / tot;
    let body = `<rect class="bar-a" x="20" y="30" width="${r1(wi)}" height="34"/>`;
    body += `<rect class="bar-b" x="${r1(20 + wi)}" y="30" width="${r1(W - wi)}" height="34"/>`;
    if (wi > 60) body += tx(20 + wi / 2, 52, 'inflation', 't', 'middle');
    if (W - wi > 60) body += tx(20 + wi + (W - wi) / 2, 52, 'recruited', 'tbar', 'middle');
    body += tx(20 + wi / 2, 22, `C<tspan baseline-shift="sub" font-size="70%">rs,low</tspan> × ΔPEEP${demo ? '' : ' = ' + ICU.fmt(infl, 0) + ' mL'}`, 'ts', 'middle');
    body += tx(20 + wi + (W - wi) / 2, 22, `V<tspan baseline-shift="sub" font-size="70%">rec</tspan>${demo ? '' : ' = ' + ICU.fmt(vrec, 0) + ' mL'}`, 'ts', 'middle');
    body += `<path class="ax" d="M20 72 V78 H280 V72"/>` + tx(150, 94, `ΔEELV${demo ? '' : ' = ' + ICU.fmt(infl + vrec, 0) + ' mL'}`, 't', 'middle');
    return svg(300, 102, 'The released volume is split into simple inflation and recruited volume', body);
  };

  // Low-flow pressure–volume loop with AOP, LIP, UIP and the deflation limb.
  fig.pvLoop = () => {
    const X = (p) => 46 + p * 7;
    const Y = (v) => 196 - v * 170;
    const inf = (p) => (p < 6 ? (0.05 * p) / 6 : 0.01 + 0.97 / (1 + Math.exp(-(p - 20) / 4.5)));
    const def = (p) => 0.97 * (1 - Math.exp(-p / 7));
    const up = [];
    const down = [];
    for (let p = 0; p <= 40; p += 0.5) { up.push([X(p), Y(inf(p))]); down.push([X(p), Y(def(p))]); }
    let body = ln(46, 196, 340, 196) + ln(46, 196, 46, 14);
    body += tx(50, 22, 'Volume', 'tm') + tx(340, 212, 'P<tspan baseline-shift="sub" font-size="70%">aw</tspan> (cmH₂O)', 'tm', 'end');
    body += `<path class="shade" d="${path(down)} L${path(up.slice().reverse()).slice(1)} Z"/>`;
    body += pa(down, 'w2') + pa(up, 'w1');
    body += dot(X(6), Y(inf(6))) + tx(X(6) - 2, Y(inf(6)) + 16, 'AOP: airways open', 'ts', 'start');
    body += dot(X(12), Y(inf(12))) + tx(X(12) + 8, Y(inf(12)) + 4, 'LIP: mass recruitment', 'ts');
    body += dot(X(28), Y(inf(28))) + tx(X(28) + 8, Y(inf(28)) + 14, 'UIP: overdistension', 'ts');
    body += dot(X(6), Y(def(6))) + ln(X(6) - 2, Y(def(6)) - 4, 64, 60, 'ax') + tx(52, 42, 'Deflation inflection:', 'ts') + tx(52, 55, 'collapse begins', 'ts');
    body += tx(X(21) + 8, Y(0.5), 'linear zone', 'tm');
    body += tx(X(9), Y(0.4), 'hysteresis', 'tm');
    body += `<g class="legend">${ln(262, 122, 280, 122, 'w1')}${tx(284, 126, 'inflation', 'ts')}${ln(262, 138, 280, 138, 'w2')}${tx(284, 142, 'deflation', 'ts')}</g>`;
    return svg(350, 220, 'Low-flow pressure–volume loop with inflation and deflation limbs', body);
  };

  // Stress index: three shapes of P_aw during constant-flow inspiration.
  fig.stressIndex = () => {
    const panels = [
      { b: 0.55, title: 'b < 0.9', sub: 'recruitment', act: '↑ PEEP' },
      { b: 1, title: 'b 0.9–1.1', sub: 'linear', act: 'keep' },
      { b: 1.8, title: 'b > 1.1', sub: 'overdistension', act: '↓ V<tspan baseline-shift="sub" font-size="70%">T</tspan> or PEEP' },
    ];
    let body = '';
    panels.forEach((p, i) => {
      const x0 = 12 + i * 112;
      const w = 74;
      const y0 = 112;
      const y1 = 40;
      body += `<rect class="shade" x="${x0 + 6}" y="${y1 - 6}" width="${w - 6}" height="${y0 - y1 + 10}"/>`;
      const pts = [[x0, y0 + 14], [x0, y0]];
      for (let k = 1; k <= 24; k++) { const t = k / 24; pts.push([x0 + t * w, y0 + (y1 - y0) * Math.pow(t, p.b)]); }
      pts.push([x0 + w, y1 + 8], [x0 + w + 8, y1 + 8], [x0 + w + 10, y0 + 6], [x0 + w + 22, y0 + 14]);
      body += ln(x0, y0 + 14, x0 + 100, y0 + 14, 'base');
      body += ln(x0, y0, x0 + w, y1, 'ax dash') + pa(pts, 'w1');
      body += tx(x0 + 46, 16, p.title, 'tb', 'middle') + tx(x0 + 46, 146, p.sub, 'ts', 'middle') + tx(x0 + 46, 162, p.act, 'tm', 'middle');
    });
    return svg(350, 170, 'Stress index: a curve that flattens, a straight line, and a curve that steepens', body);
  };

  // ROTEM / TEG trace with the parameters labelled.
  fig.rotemTrace = () => {
    const mid = 104;
    const ct = 74;
    const A = (x) => (x <= ct ? 0 : 62 * (1 - Math.exp(-(x - ct) / 26)));
    const up = [];
    const lo = [];
    for (let x = 30; x <= 320; x += 2) { up.push([x, mid - A(x)]); lo.push([x, mid + A(x)]); }
    const lyU = [[208, mid - A(208)], [320, mid - 0.62 * A(320)]];
    const lyL = [[208, mid + A(208)], [320, mid + 0.62 * A(320)]];
    let body = `<path class="shade" d="${path(up)} L${path(lo.slice().reverse()).slice(1)} Z"/>`;
    body += pa(up, 'w1') + pa(lo, 'w1') + pa(lyU, 'w2 dash') + pa(lyL, 'w2 dash');
    body += ln(30, 186, 336, 186) + tx(336, 200, 'time', 'tm', 'end');
    body += dot(ct, mid) + tx(ct - 6, mid - 22, 'CT / R', 't', 'end') + tx(ct - 6, mid - 9, 'clot starts', 'tm', 'end');
    // α: tangent at the start of the build-up
    body += ln(ct, mid, ct + 34, mid - 68, 'ax dash') + tx(ct + 14, mid - 6, 'α', 't');
    const a5 = ct + 22;
    const a10 = ct + 44;
    body += ln(a5, mid - A(a5), a5, mid + A(a5), 'ax') + tx(a5, mid + A(a5) + 13, 'A5', 'ts', 'middle');
    body += ln(a10, mid - A(a10), a10, mid + A(a10), 'ax') + tx(a10, mid - A(a10) - 6, 'A10', 'ts', 'middle');
    body += `<path class="ax" d="M${ct} ${mid + 30} V${mid + 34} H${ct + 16} V${mid + 30}"/>` + tx(ct - 4, mid + 40, 'CFT / K:', 'ts', 'end') + tx(ct - 4, mid + 53, '2 → 20 mm', 'ts', 'end');
    body += ln(208, mid - A(208), 208, mid + A(208), 'ax') + tx(208, 26, 'MCF / MA', 't', 'middle') + tx(208, 38, 'maximum firmness', 'tm', 'middle');
    body += tx(282, mid - 26, 'ML / LY30', 'tw2', 'middle');
    body += tx(322, mid - A(320) + 4, 'normal', 'tm') + tx(322, mid - 0.62 * A(320) + 4, 'lysis', 'tw2');
    return svg(366, 206, 'ROTEM or TEG trace: clotting time, build-up, maximum firmness and lysis', body);
  };

  // FRC, PEEP volume and tidal volume, for strain.
  fig.volumes = () => {
    const x = 120;
    const w = 70;
    let body = `<rect class="bar-a" x="${x}" y="110" width="${w}" height="70"/>`;
    body += `<rect class="bar-c" x="${x}" y="78" width="${w}" height="32"/>`;
    body += `<rect class="bar-b" x="${x}" y="40" width="${w}" height="38"/>`;
    body += tx(x + w / 2, 150, 'FRC', 't', 'middle') + tx(x + w / 2, 99, 'V<tspan baseline-shift="sub" font-size="70%">PEEP</tspan>', 't', 'middle') + tx(x + w / 2, 64, 'V<tspan baseline-shift="sub" font-size="70%">T</tspan>', 'tbar', 'middle');
    body += `<path class="ax" d="M${x - 6} 78 H${x - 12} V180 H${x - 6}"/>` + tx(x - 16, 132, 'EELV', 't', 'end') + tx(x - 16, 146, '(at PEEP)', 'tm', 'end');
    body += vbr(x + w + 12, 40, 180, '', 'ts');
    body += tx(x + w + 22, 98, 'Dynamic strain', 'ts') + tx(x + w + 22, 112, '= V<tspan baseline-shift="sub" font-size="70%">T</tspan> ÷ EELV', 'tm');
    body += tx(x + w + 22, 136, 'Total strain', 'ts') + tx(x + w + 22, 150, '= (V<tspan baseline-shift="sub" font-size="70%">T</tspan> + V<tspan baseline-shift="sub" font-size="70%">PEEP</tspan>) ÷ FRC', 'tm');
    body += ln(40, 180, 340, 180, 'base');
    return svg(350, 190, 'Lung volumes: FRC, the volume added by PEEP, and the tidal volume', body);
  };

  ICU.fig = fig;
})(typeof window !== 'undefined' ? window : globalThis);
