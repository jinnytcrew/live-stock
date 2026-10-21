import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker = readFileSync(new URL('./_worker.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
test('stock news and disclosure have mobile JSON fallbacks when legacy HTML parser returns sparse data', () => {
  assert.match(worker, /api\/news\/list\/integration\?itemCode=/);
  assert.match(worker, /api\/stock\/domestic\/disclosure\?code=/);
  assert.match(worker, /if \(items\.length < 3\)/);
  assert.match(worker, /normalizeMobileNews\(payload, kind\)/);
});
test('domestic sector/theme list uses mobile JSON first and retains HTML fallback', () => {
  assert.match(worker, /api\/stock\/sectors\/all\?nationType=domestic&sectorType=/);
  assert.match(worker, /normalizeThemeRows\(mobilePayload, type\)/);
  assert.match(worker, /legacy-html:/);
});
test('newly listed symbols have modern basic/integration quote and metadata fallbacks', () => {
  assert.match(worker, /api\/stock\/domestic\/basic\?code=/);
  assert.match(worker, /api\/stock\/domestic\/integration\?code=/);
  assert.match(worker, /async function mobileOne\(code\)/);
  assert.match(worker, /walkObjects\(d\)/);
});
test('client still calls the existing news and theme endpoints without breaking menu routes', () => {
  assert.match(app, /fetch\(`\/api\/news\?code=\$\{code\}&type=\$\{newsType\}`/);
  assert.match(app, /fetch\('\/api\/themes\?type='\+type/);
  assert.match(app, /fetch\(`\/api\/themestocks\?type=\$\{type\}&no=\$\{no\}`/);
});
