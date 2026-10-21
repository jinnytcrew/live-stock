import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('./_worker.js', import.meta.url), 'utf8');
const start = worker.indexOf('var cronstep_default = async');
const end = worker.indexOf('// functions/api/[[route]].js', start);
assert.ok(start >= 0 && end > start, 'cronstep handler must exist in the bundled Worker');
const handler = worker.slice(start, end);

test('cronstep never trusts caller-controlled x-cron as internal authentication', () => {
  assert.doesNotMatch(handler, /headers\.get\(['\"]x-cron['\"]\)\s*===\s*['\"]1['\"]/i);
  assert.match(handler, /envGet\(['\"]ADMIN_KEY['\"],\s*env\)\s*\|\|\s*envGet\(['\"]NXT_ADMIN_TOKEN['\"],\s*env\)/);
  assert.match(handler, /status:\s*503/);
  assert.match(handler, /status:\s*401/);
});

test('cronstep requires Bearer authentication and POST only', () => {
  assert.match(handler, /authorization/);
  assert.doesNotMatch(handler, /url\.searchParams\.get\(['\"]key['\"]\)/);
  assert.match(handler, /Bearer\\s/);
  assert.match(handler, /req2\.method\s*!==\s*['\"]POST['\"]/);
  assert.match(handler, /status:\s*405/);
});

test('all internal cronstep callers send a Bearer authorization header', () => {
  const calls = [...worker.matchAll(/fetch\([^;]{0,180}?\/api\/cronstep\?job=(?:picks|nxt)[\s\S]{0,180}?\)/g)];
  assert.ok(calls.length >= 3, `expected at least 3 internal cronstep call sites; found ${calls.length}`);
  for (const call of calls) assert.match(call[0], /Authorization:\s*['\"]Bearer\s*['\"]\s*\+/);
});
