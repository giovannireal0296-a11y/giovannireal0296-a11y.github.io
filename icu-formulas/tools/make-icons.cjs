// Renders the PNG app icons from the SVG sources (run after changing an icon):
//   node tools/make-icons.cjs        (needs Playwright with a Chromium browser)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const jobs = [
  ['icon.svg', 'icons/icon-192.png', 192],
  ['icon.svg', 'icons/icon-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/icon-maskable-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/apple-touch-icon.png', 180],
];

(async () => {
  const browser = await chromium.launch();
  for (const [src, out, size] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = fs.readFileSync(path.join(root, src), 'utf8');
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(root, out), omitBackground: true });
    await page.close();
    console.log(out);
  }
  await browser.close();
})();
