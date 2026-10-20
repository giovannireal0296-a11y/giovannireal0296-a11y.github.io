// Builds one self-contained HTML file (CSS and JS inlined) from index.html.
//   node tools/build-single.mjs              -> dist/icu-formulas.html (open anywhere, works offline)
//   node tools/build-single.mjs --fragment   -> dist/icu-formulas.fragment.html (body-only page for
//                                               hosts that add their own <html>/<head> skeleton)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fragment = process.argv.includes('--fragment');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) => `<style>\n${read(f)}</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => {
  const code = read(f);
  if (/<\/script/i.test(code)) throw new Error(`${f} contains "</script" and cannot be inlined`);
  return `<script>\n${code}</script>`;
});
const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg')).toString('base64');
// A single file cannot be installed (no manifest or service worker), so drop those links.
html = html.replace(/<link rel="manifest"[^>]*>\n/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\n/, '')
  .replace(/<link rel="icon" href="icon.svg"[^>]*>/, `<link rel="icon" href="${icon}">`);

let name = 'icu-formulas.html';
if (fragment) {
  name = 'icu-formulas.fragment.html';
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  const fonts = head.split('\n').filter((l) => /<link rel="stylesheet" href="https:\/\/fonts\.googleapis/.test(l)).join('\n');
  const styles = head.match(/<style>[\s\S]*?<\/style>/g).join('\n');
  html = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n${styles}\n${body}`;
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', name), html);
console.log(`dist/${name}: ${(html.length / 1024).toFixed(0)} kB`);
