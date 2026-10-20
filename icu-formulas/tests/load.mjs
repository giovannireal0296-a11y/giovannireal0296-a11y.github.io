// Loads the plain-script app files into a sandbox, in the same order as index.html.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function scriptOrder() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

export function loadICU(files = scriptOrder().filter((f) => !/ui\.js$/.test(f))) {
  const ctx = { console, Math, Number, String, Object, Array, JSON, isFinite };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return ctx.ICU;
}
