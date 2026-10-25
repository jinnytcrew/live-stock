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
ctx.num3 = (v) => { if (v === null || v === undefined || v === '') return null; let x=v; for(let i=0;i<3&&x&&typeof x==='object';i++){let next=null;for(const k of ['raw','rawValue','value','val','percentage','percent','rate','amount','text','formatted','displayValue'])if(x[k]!==undefined&&x[k]!==null&&x[k]!==''&&typeof x[k]!=='object'){next=x[k];break;}if(next===null)return null;x=next;} const n = Number(String(x).replace(/,/g,'').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };
ctx.pick = (o, keys) => { if (!o || typeof o !== 'object') return null; for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; };
ctx.looksLikeName = (v) => { const t = String(v || '').trim(); return !!t && t.length <= 40 && /[가-힣A-Za-z]/.test(t); };
ctx.fixtureMode = 'normal';
ctx.fetchJson = async (url) => {
  if (url.includes('/ETFBase')) return { data: { result: [{ marketCap: { raw: 1306643300000000 }, nav: { raw: 107872 }, threeMonthEarnRate: { raw: -18.49 }, feeRatio: { raw: 0.18 }, baseIndexName: 'KOSPI 200' }] } };
  const u = new URL(url);
  const start = Number(u.searchParams.get('startIdx') || 0);
  const pageSize = Number(u.searchParams.get('pageSize') || 20);
  const code = decodeURIComponent(url.match(/detail\/([^/]+)\/ETFComponent/)[1]);
  if (ctx.fixtureMode === 'empty') return { result: { totalCount: 0, items: [] } };
  if (ctx.fixtureMode === 'fail-second-page' && start >= 100) throw new Error('fixture page failure');
  if (code === '396500' || code === '396501') {
    const items = [
      ['005930','삼성전자',27.72], ['000660','SK하이닉스',24.66], ['402340','SK스퀘어',22.37],
      ['042700','한미반도체',5.40], ['036930','주성엔지니어링',4.91], ['007660','이수페타시스',3.91],
      ['039030','이오테크닉스',2.74], ['058470','리노공업',2.53], ['240810','원익IPS',2.45],
      ['000990','DB하이텍',2.40], ['', '원화현금', 0.12],
    ].map(([stockCode,stockName,ratio])=>({stockCode,stockName,ratio}));
    const page = code === '396501' && start >= 10 ? [] : items.slice(start, Math.min(start + 10, items.length));
    return { result: { baseDate: '20261022', totalCount: 11, items: page } };
  }
  if (code === '888888') return { result: { totalCount: 2, asOfDate: '20261023', items: [
    { stockCode: '111111', stockName: '1종목 ETF', ratio: 99.5 },
    { stockCode: '222222', stockName: '2종목 ETF', ratio: 0.5 },
  ] } };
  if (code === '396502') {
    const items = [
      ['005930','삼성전자',27.72], ['000660','SK하이닉스',24.66], ['402340','SK스퀘어',22.37],
      ['042700','한미반도체',5.40], ['036930','주성엔지니어링',4.91], ['007660','이수페타시스',3.91],
      ['039030','이오테크닉스',2.74], ['058470','리노공업',2.53], ['240810','원익IPS',2.45], ['000990','DB하이텍',2.40],
    ].map(([stockCode,stockName,ratio])=>({stockCode,stockName,ratio}));
    return { result: { items: start === 0 ? items : [] } };
  }
  if (code === '069500') return { result: { totalCount: 3, items: [
    { stockCode: 'A005930', stockName: '삼성전자', ratio: 55.4 },
    { stockCode: 'A000660', stockName: 'SK하이닉스', ratio: 30 },
    { stockCode: 'A035420', stockName: 'NAVER', ratio: 14.6 }
  ] } };
  if (code === '010950') {
    const total = 150, items = [];
    for (let i = start; i < Math.min(start + pageSize, total); i++) items.push({ stockCode: String(i + 1).padStart(6, '0'), stockName: '테스트종목' + String(i + 1), ratio: i < 100 ? 0.6 : 0.8 });
    return { result: { totalCount: total, items } };
  }
  return { result: { totalCount: 0, items: [] } };
};
const defaultFetchJson = ctx.fetchJson;
ctx.fetch = async (url, options = {}) => {
  const value = await ctx.fetchJson(String(url));
  return new Response(value == null ? "" : JSON.stringify(value), {
    status: value == null ? 502 : 200,
    headers: { "content-type": value == null ? "text/html" : "application/json" }
  });
};
ctx.AbortController = AbortController;
ctx.UA8 = 'fixture-test-agent';
ctx.setTimeout = setTimeout;
ctx.clearTimeout = clearTimeout;
vm.createContext(ctx);
vm.runInContext(parser, ctx, { timeout: 2000 });

const a = await ctx.fromNaverETFAPI('069500', 3600);
assert.equal(a.holdings.length, 3, 'small ETF constituent fixture count');
assert.equal(a.complete, true, 'small ETF constituent fixture must be complete');
assert.equal(a.info.navDetail, 107872, 'nested NAV must be extracted');
assert.equal(a.info.marketSum, 13066433, 'raw market cap must normalize to hundred-million KRW units');
assert.equal(a.info.m3, -18.49, 'nested three-month return must be extracted');
pass('nested ETFBase metadata and 3-item complete composition are parsed');
ctx.fetchJson = async (url) => {
  if (url.includes('/ETFBase')) return {};
  assert.match(url, /detail\/069500\/ETFComponent/, 'A-prefixed ETF code must be normalized for provider requests');
  return { result: { totalCount: 1, asOfDate: '20261024', etfComponentList: [
    { stockCode: '005930', stockName: '삼성전자', ratio: 100 }
  ] } };
};
const prefixedCode = await ctx.fromNaverETFAPI('A069500', 3600);
assert.equal(prefixedCode.holdings.length, 1, 'A-prefixed ETF code should still retrieve holdings');
assert.equal(prefixedCode.complete, true, 'normalized provider code should reconcile full list');
pass('ETF request code normalization prevents A-prefixed identifier lookup failures');
ctx.fetchJson = defaultFetchJson;


// Toss v2 compositions: fallback code format and HTTP diagnostics are covered with fixtures.
const tossStart = worker.indexOf('function parseTossRows(arr) {');
const tossEnd = worker.indexOf('\nasync function fromDetail(', tossStart);
assert(tossStart >= 0 && tossEnd > tossStart, 'Toss composition parser block not found');
vm.runInContext(worker.slice(shapeAt, shapeEnd), ctx, { timeout: 1000 });
vm.runInContext(worker.slice(tossStart, tossEnd), ctx, { timeout: 1000 });
ctx.fetchJson = async (url) => {
  if (url.includes('/A069500/compositions')) return null; // emulate HTML/404 from preferred code format
  if (url.includes('/069500/compositions')) return { result: { code: '069500', type: 'ETF', endDate: '2026-10-23', items: [
    { stockCode: '005930', stockName: '삼성전자', ratio: 55.4 },
    { stockCode: '000660', stockName: 'SK하이닉스', ratio: 30 },
    { stockCode: '035420', stockName: 'NAVER', ratio: 14.6 },
  ] } };
  return null;
};
const tossFallback = await ctx.fromTossComposition('A069500', 600);
assert.equal(tossFallback.holdings.length, 3, 'Toss fallback must accept the unprefixed productCode response');
assert.equal(tossFallback.holdings[0].name, '삼성전자');
assert.ok(tossFallback.tried.some(x => x.includes('toss-v2:A069500:http-502:text/html')), 'failed preferred route should report HTTP status and content type');
assert.ok(tossFallback.tried.some(x => x.includes('toss-rows:3/100.0%')), 'valid fallback response should report parsed row count and sum');
pass('Toss v2 composition fallback retries A-prefixed/unprefixed product codes and reports HTTP diagnostics');
ctx.fetchJson = defaultFetchJson;

// Providers sometimes wrap values ({raw/value}) and rename fields or return tuples.
ctx.fetchJson = async (url) => {
  if (url.includes('/ETFBase')) return {};
  return { payload: { ETFComponent: [
    { isuSrtCd: { raw: 'A005930' }, stockNmKr: { value: '삼성전자' }, compstWght: { raw: '55.4' } },
    { itemCd: '000660', itemNameKor: 'SK하이닉스', compositionRate: '30.0%' },
    { shortCode: '035420', displayNameKor: 'NAVER', weightPct: { value: 14.6 } },
  ], totalCount: 3 } };
};
const wrapped = await ctx.fromNaverETFAPI('069500', 3600);
assert.equal(wrapped.holdings.length, 3, 'wrapped fields and renamed aliases must be read');
assert.equal(wrapped.holdings[0].code, '005930');
assert.equal(wrapped.holdings.find(x => x.name === 'SK하이닉스').weight, 30);
assert.equal(wrapped.complete, true);
pass('wrapped values, new field aliases and A-prefixed constituent codes are parsed');

ctx.fetchJson = async (url) => url.includes('/ETFBase') ? {} : { result: JSON.stringify([
  ['005930', '삼성전자', 55.4], ['000660', 'SK하이닉스', 30], ['035420', 'NAVER', 14.6]
]) };
const tuples = await ctx.fromNaverETFAPI('069500', 3600);
assert.equal(tuples.holdings.length, 3, 'serialized tuple array must be normalized');
assert.equal(tuples.holdings.reduce((sum, x) => sum + x.weight, 0), 100);
pass('JSON-string-wrapped tuple rows are parsed without fabricating data');
ctx.fetchJson = async (url) => {
  if (url.includes('/ETFBase')) return {};
  const start = Number(new URL(url).searchParams.get('startIdx') || 0);
  return { result: JSON.stringify(start === 0 ? [['005930', '삼성전자', 100]] : []) };
};
const singleWrapped = await ctx.fromNaverETFAPI('069500', 3600);
assert.equal(singleWrapped.holdings.length, 1, 'single-row JSON-string result pages must not be dropped');
assert.equal(singleWrapped.complete, false, 'clean pagination without a declared count is still not independently count-verified');
pass('single-row tuple arrays nested in a JSON-string result are retained conservatively');
ctx.fetchJson = defaultFetchJson;

const b = await ctx.fromNaverETFAPI('010950', 3600);
assert.equal(b.holdings.length, 150, 'all constituent pages must be joined');
assert.equal(b.complete, true, 'fully paged list with 100% aggregate weight must be complete');
assert.ok(Math.abs(b.holdings.reduce((s, x) => s + x.weight, 0) - 100) < 0.01, 'aggregate weight must equal 100%');
pass('ETFComponent pagination, code deduplication and 100% aggregate weight');

const tail = await ctx.fromNaverETFAPI('396500', 3600);
assert.equal(tail.holdings.length, 11, 'the one-row last page must not be dropped');
assert.equal(tail.expectedCount, 11, 'declared holding count is retained');
assert.equal(tail.complete, true, 'all 11 rows plus declared count and plausible weight must be complete');
assert.equal(tail.asOf, '2026-10-22', 'basis date must come from source, not the local clock');
assert.ok(tail.holdings.some(x => x.name === '원화현금' && x.weight === 0.12), 'cash/component row on the last page must be retained');
assert.ok(Math.abs(tail.holdings.reduce((sum, x) => sum + x.weight, 0) - 99.21) < 0.01);
pass('single-row tail page, declared row count and source-provided basis date are reconciled');

const smallPortfolio = await ctx.fromNaverETFAPI('888888', 3600);
assert.equal(smallPortfolio.holdings.length, 2);
assert.equal(smallPortfolio.complete, true, 'a verified ETF is allowed to have fewer than three holdings');
pass('one/two-position funds can be complete when the source count and weights reconcile');

const missingTail = await ctx.fromNaverETFAPI('396501', 3600);
assert.equal(missingTail.holdings.length, 10, 'the rows successfully received before a missing tail remain visible');
assert.equal(missingTail.expectedCount, 11);
assert.equal(missingTail.complete, false, '99.09% aggregate alone cannot certify a 10-of-11 list');
pass('missing final page stays explicitly incomplete even when visible rows sum to 99%+');

const noCount = await ctx.fromNaverETFAPI('396502', 3600);
assert.equal(noCount.complete, false, 'high aggregate without declared count cannot claim full coverage');
pass('absence of declared total count prevents false full-list status');

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
assert.match(worker, /const PAGE_SIZE = 20;/, 'ETFComponent follows the current documented page size');
assert.match(worker, /code = normalizeEtfCode\(code\)/, 'ETF API request strips a provider-style A prefix from ETF codes');
assert.match(worker, /mstock-attempts:/, 'empty-source diagnostics expose code variants and wide-page retry');
assert.match(worker, /findNaverComponentArrays\(root, maxDepth = 10\)/, 'nested API response discovery covers deeper wrappers');
assert.match(app, /구성종목 조회 실패 원인 보기/, 'empty state exposes actual source diagnostics');
assert.match(app, /if\(j\.holdingsComplete!==true\)return true/, 'partial holdings with a near-100% sum remain eligible for requery');
assert.match(worker, /exact-only:no-direct-composition-source/, 'missing source is exposed instead of guessed holdings');
const etfRouteAt = worker.indexOf('etf_default = async (req2) =>');
const etfRouteEnd = worker.indexOf('config2 = { path: "/api/etf" }', etfRouteAt);
const etfRoute = worker.slice(etfRouteAt, etfRouteEnd);
assert.doesNotMatch(etfRoute, /holdSrc = "(?:dom-proxy|peer-proxy|index-proxy)"/, 'ETF data cannot be substituted from another fund/index');
assert.match(etfRoute, /holdSrc === "mstock-api" && apiHoldingsComplete === true/, 'only fully paginated, count-validated ETFComponent rows can be called complete');
assert.doesNotMatch(etfRoute, /htmlCountMatches/, 'a top-10 HTML table cannot certify itself as a full list');
assert.match(etfRoute, /a\.length \* 100/, 'more verified constituent rows outrank a top-10 list merely summing near 100%');
assert.match((read('index.html')), /app\.js\?v=681/, 'updated client JS gets a new cache-busting key');
assert.match((read('index.html')), /app\.css\?v=672/, 'updated CSS gets a new cache-busting key');
assert.match((read('app.css')), /\.etf-hold-n b\{[^}]*white-space:normal/, 'ETF constituent names are configured to wrap instead of truncate');
pass('audit retry/reconciliation, fresh-client loading and empty-state source diagnostics are present');

const versionText = read('version-info.js');
const workerVersion = (worker.match(/var APP_VER\s*=\s*['"]([^'"]+)/) || [])[1];
const uiVersion = (versionText.match(/version:\s*['"]([^'"]+)/) || [])[1];
assert.equal(workerVersion, uiVersion, 'worker and UI version must match');
pass(`version references are consistent (${uiVersion})`);
console.log('ETF DATA QA PASSED (fixture-based; live external endpoint availability is not tested here).');
