# ICU Formulas

A bedside web app for doctors that calculates the formulas of the *Critical Care Formulas – Bedside Reference*. It works on phones and desktops, offline, with no server and no account.

- **Macro areas:** mechanical ventilation, effort and weaning, gas exchange, oxygen transport, haemodynamics, fluids and echo, brain and organ perfusion, acid–base, electrolytes, kidney and CRRT, nutrition, drugs and body size, liver, blood, burns and ECG, coagulation (ROTEM/TEG), physics, plus a unit converter and the handout errata.
- **Chained formulas:** you enter only the raw values. If a formula needs another one (P/F needs nothing; the shunt needs P_AO₂, Cc′O₂, CaO₂ and C̄vO₂), the app asks for the bedside numbers and calculates every intermediate itself. Each intermediate shows its value, and you can switch any of them to "enter it instead" if you already have it.
- **Use case and interpretation:** every calculator says when to use it and shows the reference's interpretation table, with the row that matches your result highlighted and a verdict (green, amber, red).
- **Step-by-step guides with figures:** R/I ratio (6 steps), P–V loop, respiratory holds, stress index, shunt measurement, FRC and strain, blood gas in five steps, the ROTEM/TEG step-up bleeding algorithm (interactive, with doses), and reading a ROTEM/TEG trace.
- **Infusion pump rate:** enter the drug in the syringe (µg, mg, g, IU or mmol), the total volume after dilution and the desired dose in any unit (µg/kg/min, µg/kg/h, mg/kg/h, mg/h, IU/h, mmol/h…). The app gives the rate in mL/h, plus the concentration and how long the syringe lasts. Weight is asked only for per-kg doses. The reverse calculator turns a running rate back into a dose.
- **Values carry over** between calculators (weight, height, PaCO₂…) for the browser session, until you press **Clear values**. Nothing leaves the device.
- **Units:** blood gases in mmHg or kPa, creatinine in mg/dL or µmol/L, urea or BUN, glucose, Hb, albumin, bilirubin and others; decimal comma accepted.

> Decision support only. Thresholds come from the reference sheet (Henderson, Chen, Amato & Brochard, AJRCCM 2017, and standard ICU sources). Check them against current guidelines and local protocols. Where a source table has a gap between ranges, the app adds a row so that every result gets a reading; those rows are marked †.

## Use it

Open `index.html` through any static web server:

```bash
cd icu-formulas
npm start            # http://localhost:8080 (uses npx http-server)
```

Any static host works (GitHub Pages, Netlify, Cloudflare Pages, an intranet server). When you change any file, bump `VERSION` in `sw.js` so installed copies update.

### Install on Android

The app is a Progressive Web App: it has a manifest (`manifest.webmanifest`), PNG and maskable icons (`icons/`), and a service worker (`sw.js`) that caches everything for offline use. Chrome reports no installability errors.

1. Put the `icu-formulas/` folder on a host that serves it over **HTTPS** (required for installing; `localhost` also works for testing).
2. On the Android phone, open that address in **Chrome**.
3. Tap **Install app** when Chrome offers it, or open the ⋮ menu → **Add to home screen** → **Install**.

The app then has its own icon, opens full screen without the browser bar, and works with no connection. Updates arrive automatically the next time it is opened online.

The single-file build (`dist/icu-formulas.html`) and preview links cannot be installed: installing needs the manifest and service worker served from a real address.

To publish it on the **Google Play Store**, wrap the hosted app as a Trusted Web Activity: give the HTTPS address to [PWABuilder](https://www.pwabuilder.com) (or Google's Bubblewrap tool), which produces the Android package. Then add the `/.well-known/assetlinks.json` file it gives you to the root of the host, so Android trusts the app and hides the browser bar. A Play developer account is needed.

To regenerate the PNG icons after changing `icon.svg` or `icons/icon-maskable.svg`, run `node tools/make-icons.cjs` (needs Playwright).

To get one file you can send or open directly from disk:

```bash
npm run build        # dist/icu-formulas.html (everything inlined)
```

## Test

```bash
npm test
```

The tests check that every input, derivation, guide and figure exists, and that the app reproduces the worked examples of the reference (182 of them, for example PBW 70.6 kg, shunt 28%, R/I 0.67, Parkland 700 then 350 mL/h). They also cover the acid–base and bleeding algorithms. No dependencies are needed beyond Node 20+.

## How it is built

Plain HTML, CSS and JavaScript, no framework and no build step. Scripts are classic (not modules) so the app also runs from `file://` and as a single inlined file.

| File | What it does |
|---|---|
| `js/core.js` | Registry (`ICU.vars`, `ICU.formulas`, `ICU.areas`, `ICU.guides`) and helpers: number formatting and parsing, the small markup used in labels (`P_plat`, `V_T^2`, `[[num \|\| den]]` for fractions). |
| `js/engine.js` | Works out which raw values a calculator needs, derives intermediates, and matches results to the interpretation rows. No DOM, so it is tested in Node. |
| `js/data/*.js` | One file per area: variables, formulas, tables, worked examples. |
| `js/figures.js` | SVG figures, drawn from code and coloured by the theme. |
| `js/guides.js` | Step-by-step guides. |
| `js/ui.js` | Views (home, area, calculator, guide), search, storage and the result panel. |
| `css/app.css` | Light and dark themes; phone layout with a pinned result bar. |

### Add a formula

Add an entry to the area's data file and list its id in the area's sections:

```js
{
  id: 'rsbi', title: 'Rapid shallow breathing index', short: 'RSBI',
  inputs: ['rr', 'vt'],                                  // variable ids (canonical units)
  outputs: [{ id: 'rsbi', label: 'RSBI', unit: 'breaths/min/L', dp: 0 }],
  calc: (v) => ({ rsbi: v.rr / (v.vt / 1000) }),
  formula: 'RSBI = [[RR || V_T (L)]]',
  use: 'Readiness to extubate, in the first minute of a spontaneous breathing trial.',
  tables: [{ cols: ['RSBI', 'Meaning'], rows: [
    { c: ['< 80', 'SBT success likely'], lt: 80, t: 'ok' },
    { c: ['80–105', 'Grey zone'], ge: 80, le: 105, t: 'mid' },
    { c: ['> 105', 'Failure likely'], gt: 105, t: 'bad' },
  ] }],
  example: { v: { rr: 30, vt: 300 }, expect: { rsbi: 100 } },
}
```

To make a value calculable inside other formulas, give its variable `derive: '<formula id>'` and `calc: true` (calculated by default) or `calc: false` (entered by default, with "or calculate it from…" offered).
