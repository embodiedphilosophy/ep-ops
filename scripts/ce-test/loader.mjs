// Test-only module hooks: resolve the app's "@/…" imports and load JSON files as modules, so lib/ code that
// the Next build handles can also run in plain Node (scripts/ce-test/db.mjs).
import { pathToFileURL, fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href;
  try { return await next(spec, ctx); }
  catch (e) { if (!/\.[a-z]+$/.test(spec) && (spec.startsWith('.') || spec.startsWith('file:') || spec.startsWith('next/'))) return next(spec + '.js', ctx); throw e; }
}
export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: 'export default ' + await readFile(fileURLToPath(url), 'utf8') };
  return next(url, ctx);
}
