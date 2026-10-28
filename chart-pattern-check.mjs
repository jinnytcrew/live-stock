#!/usr/bin/env node
/* Offline regression tests for the technical-pattern screener. Run: node chart-pattern-check.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const pass = (label) => console.log('PASS  ' + label);
const app = read('app.js'), html = read('index.html'), worker = read('_worker.js'), versionInfo = read('version-info.js');

assert.match(html, /data-pt="patterns"[^>]*>차트 패턴 탐색기<i class="lv">NEW<\/i>/, 'advanced-service tab includes NEW badge');
assert.match(html, /id="pro-patterns" hidden/, 'pattern screener page exists and starts hidden');
assert.match(html, /id="ptDiagnostics"/, 'pattern-data diagnostics panel exists');
assert.match(html, /id="ptExport"/, 'CSV export control exists');
assert.equal((app.match(/'nxthist','surge','accum','patterns','screener','thermo','port','compare','bt','risk'/g) || []).length, 2,
  'pattern page is part of both normal and locked tab visibility lists');
pass('NEW tab, page wiring, diagnostic UI, CSV control and tab visibility wiring');

const workerVersion = (worker.match(/var APP_VER\s*=\s*["']([^"']+)/) || [])[1];
const uiVersion = (versionInfo.match(/version:\s*["']([^"']+)/) || [])[1];
assert.equal(workerVersion, uiVersion, 'worker and UI release versions match');
assert.match(html, /app\.js\?v=688/, 'client JavaScript cache key advanced');
assert.match(html, /app\.css\?v=676/, 'stylesheet cache key advanced');
assert.match(app, /version-info\.js\?v=344/, 'version metadata import cache key advanced');
assert.match(read('sw.js'), /SW_VER\s*=\s*'v10\.28'/, 'service worker release key advanced');
assert.match(read('.assetsignore'), /^chart-pattern-check\.mjs\s*$/m, 'QA script remains excluded from public static assets');
pass('release version and asset/service-worker cache keys are consistent');

// Regression: the startup listener counts selected patterns before PT_LABELS is initialized.
const selectedKindsMatch = app.match(/function ptSelectedKinds\(\)\{[^\n]*\}/);
assert.ok(selectedKindsMatch, 'pattern selection count helper exists');
assert.doesNotMatch(selectedKindsMatch[0], /PT_LABELS/, 'startup selection counter does not touch the later lexical const');
const earlyCount = app.indexOf('ptUpdateSelectedCount();', app.indexOf("document.querySelectorAll('#proTabs"));
const labelsDeclaration = app.indexOf('const PT_LABELS={');
assert.ok(earlyCount >= 0 && labelsDeclaration > earlyCount, 'test covers the original startup-before-labels ordering');
const bootCtx = { document: { querySelectorAll: (selector) => {
  assert.equal(selector, '.pt-kind:checked');
  return [{ value: 'cup' }, { value: 'doubleBottom' }, { value: '' }];
} } };
vm.createContext(bootCtx);
vm.runInContext(selectedKindsMatch[0] + '\nglobalThis.__selected = ptSelectedKinds();', bootCtx, { timeout: 1000 });
assert.deepEqual(Array.from(bootCtx.__selected), ['cup', 'doubleBottom']);
pass('startup pattern selection counter runs safely before PT_LABELS initialization');

const begin = app.indexOf('const PT_LABELS={');
const end = app.indexOf('async function acFetchInvestors(code){', begin);
assert.ok(begin >= 0 && end > begin, 'production pattern-engine block exists');
const ctx = { console, Date, Math, Number, String, Object, Array, Set, Map, Promise, AbortController, URL, Blob, encodeURIComponent };
ctx.acBars = (rows) => (Array.isArray(rows) ? rows : []).filter(x => x && typeof x === 'object').map(x => {
  const c = +(x.c ?? x.close) || 0;
  return { o: +(x.o ?? x.open) || c, h: +(x.h ?? x.high) || c, l: +(x.l ?? x.low) || c, c, v: +(x.v ?? x.vol) || 0 };
}).filter(x => x.c > 0);
vm.createContext(ctx);
vm.runInContext(app.slice(begin, end) + '\nglobalThis.__ptLabels=PT_LABELS; globalThis.ptTest=ptPatternHits;', ctx, { timeout: 3000 });
assert.equal(Object.keys(ctx.__ptLabels).length, 33, '33 selectable pattern rules are registered');
pass('production detector registers all 33 selectable pattern types');

function makeBars(closes) {
  const start = Date.UTC(2026, 0, 1);
  return closes.map((c, i) => ({ d: new Date(start + i * 86400000).toISOString().slice(0, 10),
    o: c * .998, c, h: Math.max(c, c * 1.008), l: Math.min(c, c * .992), v: 1000 }));
}
let closes = [];
for (let i = 0; i < 80; i++) {
  let c;
  if (i < 10) c = 103 + i * .7;
  else if (i < 32) c = 110 - (i - 10) * .91;
  else if (i < 58) c = 90 + (i - 32) * .73;
  else if (i < 70) c = 109 - (i - 58) * .48;
  else c = 103.2 + (i - 70) * .35;
  closes.push(c);
}
const cup = ctx.ptTest(makeBars(closes));
assert.ok(cup.hits.some(x => x.id === 'cup'), 'cup-with-handle fixture is detected');
pass('cup-with-handle detector fixture');

closes = [];
for (let i = 0; i < 80; i++) {
  let c;
  if (i < 20) c = 120 - i * 1.2;
  else if (i < 30) c = 96 + (i - 20) * 1.45;
  else if (i < 50) c = 110 - (i - 30) * .76;
  else if (i < 65) c = 95.5 + (i - 50) * .75;
  else c = 106.75 + (i - 65) * .08;
  closes.push(c);
}
const wbottom = ctx.ptTest(makeBars(closes));
assert.ok(wbottom.hits.some(x => x.id === 'doubleBottom'), 'W-bottom fixture is detected');
pass('W-bottom / double-bottom detector fixture');

closes = Array.from({ length: 45 }, (_, i) => 110 - i * .12);
const engulf = makeBars(closes);
engulf[43] = { ...engulf[43], o: 105, c: 100, h: 106, l: 99, v: 1000 };
engulf[44] = { ...engulf[44], o: 98, c: 108, h: 109, l: 97, v: 1500 };
const engulfed = ctx.ptTest(engulf);
assert.ok(engulfed.hits.some(x => x.id === 'bullEngulf'), 'bullish engulfing fixture is detected');
pass('bullish-engulfing candle detector fixture');

const short = ctx.ptTest(makeBars(Array.from({ length: 20 }, (_, i) => 100 + i)));
assert.ok(short.missing && /최소 35개 봉/.test(short.why), 'short history is reported rather than fabricated');
pass('insufficient candle history is diagnosed');
console.log('CHART PATTERN QA PASSED (offline synthetic fixtures; live market/API availability is not tested).');
