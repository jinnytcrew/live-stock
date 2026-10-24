#!/usr/bin/env node
/* ETF data-source regression tests. Run: node etf-data-check.mjs
 * Uses fixture responses, so this does not require credentials or a live network.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(root, '_worker.js');
const worker = fs.readFileSync(workerPath, 'utf8');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const pass = (label) => console.log(`PASS  ${label}`);

// Regression guard for the diagnostic helper that previously crashed the parser.
const shapeAt = worker.indexOf('function shapeOf(value, depth = 0)');
const detailAt = worker.indexOf('async function fromDetail(');
assert(shapeAt >= 0, 'shapeOf helper must be defined');
assert(detailAt < 0 || shapeAt < detailAt, 'shapeOf must be defined before detailed parser uses it');
const shapeEnd = worker.indexOf('\nfunction pick(', shapeAt);
assert(shapeEnd > shapeAt, 'shapeOf helper boundary missing');
const shapeContext = { Object, Array, String };
vm.createContext(shapeContext);
vm.runInContext(worker.slice(shapeAt, shapeEnd), shapeContext, { timeout: 1000 });
assert.match(shapeContext.shapeOf({ payload: [{ code: '069500' }] }), /^object:payload/);
pass('shapeOf diagnostic helper is defined and does not throw on nested values');

// Extract the real production parser; only fetchJson is replaced with deterministic fixtures.
const parserStart = worker.indexOf('function normalizeEtfCode(v) {');
const parserEnd = worker.indexOf('\n/* [v17.8.2] 보조 구성종목 공급원.', parserStart);
assert(parserStart >= 0 && parserEnd > parserStart, 'Naver ETF parser block not found');
const parser = worker.slice(parserStart, parserEnd);
const ctx = { console, Date, Math, Number, String, Object, Array, Set, Promise, encodeURIComponent, URL };
ctx.NAME_KEYS = ['stockName','itemName','itemname','name','stockNameKor','stockNm','hname','issueName','korSecnNm','stkNm','componentName','companyName','korName','displayName','assetName','bondName','itemNm'];
ctx.WEIGHT_KEYS = ['weight','weightPercent','weightPercentage','holdingPercent','holdingRatio','weighting','portfolioWeight','componentRatio','compositionRatio','ratioPercent','ratio','cuRatio','compstRatio','compRt','weightRatio','portion','percentage','percent','percentOfPortfolio','share','allocation','holdingRate','compWeight'];
ctx.CODE_KEYS = ['itemCode','itemcode','stockCode','stockCd','ticker','symbol','code','cd','shortCode','srtnCd','issueCode'];
ctx.SKIP_NUM_KEYS = /price|amt|amount|volume|qty|quantity|count|nav|value|sum|cap|date|time|no$|id$|rank|seq|shares|stock_?cnt/i;
ctx.num3 = (v) => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };
ctx.pick = (o, keys) => { if (!o || typeof o !== 'object') return null; for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; };
ctx.looksLikeName = (v) => { const t = String(v || '').trim(); return !!t && t.length <= 40 && /[가-힣A-Za-z]/.test(t); };
ctx.fixtureMode = 'normal';
ctx.fetchJson = async (url) => {
  if (url.includes('/ETFBase')) return { data: { result: [{ marketCap: { raw: 1306643300000000 }, nav: { raw: 107872 }, threeMonthEarnRate: { raw: -18.49 }, feeRatio: { raw: 0.18 }, baseIndexName: 'KOSPI 200' }] } };
  const u = new URL(url);
  const start = Number(u.searchParams.get('startIdx') || 0);
  const code = decodeURIComponent(url.match(/detail\/([^/]+)\/ETFComponent/)[1]);
  if (ctx.fixtureMode === 'empty') return { result: { totalCount: 0, items: [] } };
  if (ctx.fixtureMode === 'fail-second-page' && start >= 100) throw new Error('fixture page failure');
  if (code === '069500') return { result: { totalCount: 3, items: [
    { stockCode: 'A005930', stockName: '삼성전자', ratio: 55.4 },
    { stockCode: 'A000660', stockName: 'SK하이닉스', ratio: 30 },
    { stockCode: 'A035420', stockName: 'NAVER', ratio: 14.6 }
  ] } };
  if (code === '010950') {
    const total = 150, items = [];
    for (let i = start; i < Math.min(start + 100, total); i++) items.push({ stockCode: String(i + 1).padStart(6, '0'), stockName: '테스트종목' + String(i + 1), ratio: i < 100 ? 0.6 : 0.8 });
    return { result: { totalCount: total, items } };
  }
  return { result: { totalCount: 0, items: [] } };
};
vm.createContext(ctx);
vm.runInContext(parser, ctx, { timeout: 2000 });

const a = await ctx.fromNaverETFAPI('069500', 3600);
assert.equal(a.holdings.length, 3, 'small ETF constituent fixture count');
assert.equal(a.complete, true, 'small ETF constituent fixture must be complete');
assert.equal(a.info.navDetail, 107872, 'nested NAV must be extracted');
assert.equal(a.info.marketSum, 13066433, 'raw market cap must normalize to hundred-million KRW units');
assert.equal(a.info.m3, -18.49, 'nested three-month return must be extracted');
pass('nested ETFBase metadata and 3-item complete composition are parsed');

const b = await ctx.fromNaverETFAPI('010950', 3600);
assert.equal(b.holdings.length, 150, 'all constituent pages must be joined');
assert.equal(b.complete, true, 'fully paged list with 100% aggregate weight must be complete');
assert.ok(Math.abs(b.holdings.reduce((s, x) => s + x.weight, 0) - 100) < 0.01, 'aggregate weight must equal 100%');
pass('ETFComponent pagination, code deduplication and 100% aggregate weight');

ctx.fixtureMode = 'fail-second-page';
const c = await ctx.fromNaverETFAPI('010950', 3600);
assert.equal(c.complete, false, 'a failed page must never be marked complete');
assert.ok(c.holdings.length > 0 && c.holdings.length < 150, 'partial rows should be retained as partial, not discarded');
pass('failed page stays partial and is never silently called a complete list');

ctx.fixtureMode = 'empty';
const d = await ctx.fromNaverETFAPI('999999', 3600);
assert.equal(d.holdings.length, 0, 'empty API responses must not invent constituents');
assert.equal(d.complete, false, 'empty API responses are never complete');
pass('empty source response does not fabricate any component rows');

const app = read('app.js');
assert.match(app, /function runEtfAudit\(\)/, 'client audit function exists');
assert.match(app, /for\(let attempt=0;attempt<3;attempt\+\+\)/, 'audit requests retry failed batches');
assert.match(app, /const expectedCodes=new Set/, 'audit reconciles expected ETF codes');
assert.match(app, /cache:bypass\?'no-store':'default'/, 'manual ETF requery bypasses browser cache');
assert.match(app, /&refresh='\+now/, 'manual retry changes edge cache key');
pass('audit retry/reconciliation and forced refresh guards are present');

const versionText = read('version-info.js');
const workerVersion = (worker.match(/var APP_VER\s*=\s*['"]([^'"]+)/) || [])[1];
const uiVersion = (versionText.match(/version:\s*['"]([^'"]+)/) || [])[1];
assert.equal(workerVersion, uiVersion, 'worker and UI version must match');
pass(`version references are consistent (${uiVersion})`);
console.log('ETF DATA QA PASSED (fixture-based; live external endpoint availability is not tested here).');
