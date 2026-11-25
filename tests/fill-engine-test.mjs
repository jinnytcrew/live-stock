/* fill-engine-test.mjs — 서버(크론) 미체결 체결 판정·체결가 단위 검증
   사용법: node tests/fill-engine-test.mjs
   배경: 2026-11-26 08:26 사용자 제보
     "삼성전자 17만 1700원에 미체결 걸어놨는데 다시 들어가보니깐 17만 2400원에 체결되어 있잖아"
   이 파일은 워커를 실제로 import 해서 scheduled() 를 돌리고, KV 에 남은 장부를 직접 확인한다.
   (app.js 쪽 클라이언트 판정은 fill-client-logic-test.mjs 가 맡는다) */
import { strict as A } from 'node:assert';

const WORKER = new URL('../_worker.js', import.meta.url).href;

/* ── 가짜 KV ─────────────────────────────────────────────────────────────── */
function fakeKV(init) {
  const m = new Map(Object.entries(init || {}));
  const api = {
    __store: m,
    async get(k, opts) {
      const v = m.get(String(k));
      if (v == null) return null;
      if (opts === 'json' || (opts && opts.type === 'json')) return typeof v === 'string' ? JSON.parse(v) : JSON.parse(JSON.stringify(v));
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
    async put(k, v) { m.set(String(k), typeof v === 'string' ? v : JSON.stringify(v)); },
    async delete(k) { m.delete(String(k)); },
    async list(o) {
      const prefix = (o && o.prefix) || '';
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
  return api;
}

const QUOTE_NXT = {
  datas: [{
    itemCode: '005930', stockName: '삼성전자', marketStatus: 'CLOSE', closePrice: '170700',
    localTradedAt: '20261126082500', accumulatedTradingVolumeRaw: '1234567',
    overMarketPriceInfo: { overMarketStatus: 'OPEN', overPrice: '172400', overClosePrice: '172400' },
  }],
};

function userRecord(order, extra) {
  const hold = (extra && extra.hold) ? [extra.hold] : [];
  return Object.assign({
    id: 'tester', savedAt: Date.now(), rv: 1,
    cash: 5000000, usdCash: 0, holdings: hold, tradeLog: [], usdSettling: [],
    acctActive: 'a1',
    acctList: [{ id: 'a1', type: 'general', name: '일반' }],
    acctBooks: { a1: { cash: 5000000, usdCash: 0, holdings: hold.map(h => ({ ...h })), tradeLog: [], usdSettling: [] } },
    bookOrders: [order],
  }, (extra && extra.top) || {});
}

async function runScenario(tag, order, opts) {
  opts = opts || {};
  const t = opts.now || Date.parse('2026-11-26T08:26:00+09:00');
  const kv = fakeKV({
    'live-accounts:pendidx': JSON.stringify({ v: 1, at: 0, u: { tester: { sig: '1|0|005930|', n: 1, plans: 0, at: 0 } } }),
    'live-accounts:usr:tester': JSON.stringify(userRecord(order, opts.userExtra)),
  });
  const quotes = opts.quote || QUOTE_NXT;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('polling.finance.naver.com/api/realtime/domestic')) {
      return new Response(JSON.stringify(quotes), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const mod = await import(WORKER + '?s=' + encodeURIComponent(tag) + '&r=' + Math.random());
    const env = { APP_KV: kv };
    /* scheduled() 는 ctx.waitUntil 안에서 본체를 돌린다 — 테스트에서는 그 약속을 직접 기다린다 */
    const pending = [];
    await mod.default.scheduled({ scheduledTime: t, cron: '* * * * *' }, env, { waitUntil(p) { pending.push(p); } });
    await Promise.allSettled(pending);
    await new Promise(r => setTimeout(r, 10));
    const u = JSON.parse(kv.__store.get('live-accounts:usr:tester'));
    return { user: u, book: u.acctBooks.a1, kv };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const NOW = Date.parse('2026-11-26T08:26:00+09:00');
const base = { code: '005930', name: '삼성전자', qty: 1, acct: 'a1', createdAt: NOW - 600000 };

/* ① 매수 지정가 171,700 — NXT 프리마켓 현재가 172,400. 절대 체결되면 안 된다. */
{
  const { user, book } = await runScenario('buy-limited', { ...base, id: 'b-buy171', side: 'buy', price: 171700 });
  ok('매수 지정가 171,700 · 현재가 172,400 → 체결되지 않고 미체결 유지',
    user.bookOrders.length === 1 && book.tradeLog.length === 0,
    `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ② 매수 지정가 172,400 — 현재가와 같으므로 체결. 체결가는 주문가(172,400)를 넘지 않는다. */
{
  const { user, book } = await runScenario('buy-equal', { ...base, id: 'b-buy172', side: 'buy', price: 172400 });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('매수 지정가 172,400 · 현재가 172,400 → 체결가 ≤ 주문가',
    user.bookOrders.length === 0 && t && t.price <= 172400, t ? `체결가 ${t.price}` : '체결 없음');
}

/* ③ 매도 지정가 171,700 · 현재가 172,400 → 현재가 체결(지정가보다 유리). 주문가보다 낮게 체결되면 안 된다. */
{
  const { user, book } = await runScenario('sell-limited', { ...base, id: 'b-sell171', side: 'sell', price: 171700 },
    { userExtra: { hold: { code: '005930', qty: 1, avg: 165000 } } });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('매도 지정가 171,700 · 현재가 172,400 → 체결가 ≥ 주문가(불리한 체결 금지)',
    t && t.price >= 171700, t ? `체결가 ${t.price}` : `체결 없음(미체결 ${user.bookOrders.length}건)`);
}

/* ④ 매수 주문이 NXT 프리마켓 가격으로 체결되는가 — KRX 주문은 KRX 세션 밖에서 체결되면 안 된다.
      (v17.8.44 이전에는 접수 거래소를 저장하지 않아 이 구분이 불가능했다) */
{
  const { user, book } = await runScenario('krx-buy', { ...base, id: 'b-krxbuy', side: 'buy', price: 172400, ex: 'KRX' });
  ok('KRX 매수 지정가 172,400 · NXT만 열린 시각 → KRX 주문은 체결 대기',
    user.bookOrders.length === 1 && book.tradeLog.length === 0, `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ⑤ NXT 매도 지정가 171,700 · NXT 현재가 172,400 → 체결. 체결가 172,400, 원 주문가가 기록에 남는다. */
{
  const { user, book } = await runScenario('nxt-sell', { ...base, id: 'b-nxtsell', side: 'sell', price: 171700, ex: 'NXT' },
    { userExtra: { hold: { code: '005930', qty: 1, avg: 165000 } } });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('NXT 매도 지정가 171,700 · NXT 172,400 → 체결 + 주문가 원장 보존',
    t && t.price === 172400 && t.orderPx === 171700,
    t ? `체결가 ${t.price} · 원 주문가 ${t.orderPx}` : `체결 없음(미체결 ${user.bookOrders.length}건)`);
}

/* ⑥ 예전 주문(창구 기록 없음 = SOR 취급) — 지금까지처럼 열린 세션의 값으로 체결되고,
      주문가를 넘어서는 불리한 체결은 없다. */
{
  const { user, book } = await runScenario('sor-sell', { ...base, id: 'b-sor', side: 'sell', price: 171700 },
    { userExtra: { hold: { code: '005930', qty: 1, avg: 165000 } } });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('창구 기록 없는 매도 171,700 → 172,400 체결 · 원 주문가 기록',
    !!t && t.price === 172400 && t.orderPx === 171700, t ? `체결가 ${t.price} · orderPx ${t.orderPx}` : `체결 없음(미체결 ${user.bookOrders.length}건)`);
}

/* ⑦ 매수 지정가가 현재가보다 높은 경우(즉시 체결) — 체결가는 현재가(내 가격 이하) */
{
  const gap = { datas: [{ itemCode: '005930', stockName: '삼성전자', marketStatus: 'CLOSE', closePrice: '170700',
    overMarketPriceInfo: { overMarketStatus: 'OPEN', overPrice: '171000' } }] };
  const { book } = await runScenario('buy-gapdown', { ...base, id: 'b-gap', side: 'buy', price: 171700, ex: 'NXT' }, { quote: gap });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('매수 171,700 · 현재 171,000 → 171,000 체결(지정가 이하) · 원 주문가 보존',
    !!t && t.price === 171000 && t.orderPx === 171700, t ? `체결가 ${t.price} · orderPx ${t.orderPx}` : '체결 없음');
}

/* ⑧ KRX 정규장이 열렸을 때 — KRX 주문은 KRX 종가로만 체결된다 */
{
  const reg = { datas: [{ itemCode: '005930', stockName: '삼성전자', marketStatus: 'OPEN', closePrice: '172400',
    overMarketPriceInfo: { overMarketStatus: 'CLOSE', overPrice: '170000' } }] };
  const { book } = await runScenario('krx-sell-reg', { ...base, id: 'b-krxreg', side: 'sell', price: 171700, ex: 'KRX' },
    { quote: reg, now: Date.parse('2026-11-26T10:00:00+09:00'), userExtra: { hold: { code: '005930', qty: 1, avg: 165000 } } });
  const t = book.tradeLog[book.tradeLog.length - 1];
  ok('KRX 정 규장 매도 171,700 → KRX 172,400 체결(창구별 시세)',
    !!t && t.price === 172400, t ? `체결가 ${t.price}` : '체결 없음');
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length) {
  console.log('실패:');
  failed.forEach(f => console.log(' - ' + f.name));
  process.exitCode = 1;
}
