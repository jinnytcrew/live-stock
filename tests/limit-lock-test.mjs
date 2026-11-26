/* ══════════════════════════════════════════════════════════════════════════════
   limit-lock-test.mjs — 상·하한가 잠금/대기/해제 체결 단위 검증 (서버 크론)
   ────────────────────────────────────────────────────────────────────────────
   2026-11-26 사용자 요청
     "상/하한가 종목들은 매수/매도 대기가 있을 건데 지금은 상,하한가여도 거래가
      바로 다 되잖아. 상,하한가 시 거래 시스템 보완해서 개편해줘."
   이 파일은 워커를 실제로 import 해서 scheduled() 를 돌리고 KV 장부를 확인한다.
   기준가 100,000원 → 상한가 130,000원 · 하한가 70,000원.

   실행: node tests/limit-lock-test.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import { strict as A } from 'node:assert';

const WORKER = new URL('../_worker.js', import.meta.url).href;

function fakeKV(init) {
  const m = new Map(Object.entries(init || {}));
  return {
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
      return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true };
    },
  };
}

/* 기준가 100,000 · 전일 대비 +30,000 → 상한가 130,000 */
function quote(px, prev100) {
  const prev = prev100 == null ? 100000 : prev100;
  const chg = px - prev;
  return {
    datas: [{
      itemCode: '005930', stockName: '삼성전자', marketStatus: 'OPEN',
      closePrice: String(px), compareToPreviousClosePrice: String(chg),
      overMarketPriceInfo: { overMarketStatus: 'CLOSE', overPrice: String(px) },
    }],
  };
}
/* 기준가 정보가 없는 예전 응답 */
function quoteNoPrev(px) {
  return { datas: [{ itemCode: '005930', stockName: '삼성전자', marketStatus: 'OPEN', closePrice: String(px),
    overMarketPriceInfo: { overMarketStatus: 'CLOSE', overPrice: String(px) } }] };
}

function userRecord(order, hold) {
  const h = hold ? [hold] : [];
  return {
    id: 'tester', savedAt: Date.now(), rv: 1,
    cash: 50000000, usdCash: 0, holdings: h, tradeLog: [], usdSettling: [],
    acctActive: 'a1', acctList: [{ id: 'a1', type: 'general', name: '일반' }],
    acctBooks: { a1: { cash: 50000000, usdCash: 0, holdings: h.map(x => ({ ...x })), tradeLog: [], usdSettling: [] } },
    bookOrders: [order],
  };
}

async function run(order, q, hold, nowIso) {
  const t = Date.parse(nowIso || '2026-11-26T10:00:00+09:00');
  const kv = fakeKV({
    'live-accounts:pendidx': JSON.stringify({ v: 1, at: 0, u: { tester: { sig: '1|0|005930|', n: 1, plans: 0, at: 0 } } }),
    'live-accounts:usr:tester': JSON.stringify(userRecord(order, hold)),
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('polling.finance.naver.com/api/realtime/domestic')) {
      return new Response(JSON.stringify(q), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const mod = await import(WORKER + '?s=ll-' + Math.random());
    const pending = [];
    await mod.default.scheduled({ scheduledTime: t, cron: '* * * * *' }, { APP_KV: kv }, { waitUntil(p) { pending.push(p); } });
    await Promise.allSettled(pending);
    await new Promise(r => setTimeout(r, 10));
    const u = JSON.parse(kv.__store.get('live-accounts:usr:tester'));
    return { user: u, book: u.acctBooks.a1 };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const base = { code: '005930', name: '삼성전자', qty: 1, acct: 'a1', createdAt: Date.now() - 600000, ex: 'KRX' };
const HOLD = { code: '005930', qty: 5, avg: 95000 };

/* ① 상한가 잠금 — 현재가 130,000(상한가)에 매수 130,000 대기 → 체결되지 않는다 */
{
  const { user, book } = await run({ ...base, id: 'b-up-buy', side: 'buy', price: 130000 }, quote(130000));
  ok('상한가 잠금 · 매수 130,000 대기 → 체결되지 않고 미체결 유지',
    user.bookOrders.length === 1 && book.tradeLog.length === 0,
    `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ② 잠금이 풀린 순간(현재가 129,500) → 대기하던 매수가 체결. 체결가는 주문가 이하 */
{
  const { user, book } = await run({ ...base, id: 'b-up-buy2', side: 'buy', price: 130000 }, quote(129500));
  const tr = book.tradeLog[book.tradeLog.length - 1];
  ok('상한가 해제(129,500) · 대기 매수 130,000 → 체결가 129,500 (주문가 이하)',
    user.bookOrders.length === 0 && tr && tr.price === 129500 && tr.orderPx === 130000,
    tr ? `체결가 ${tr.price} · 주문가 ${tr.orderPx}` : '체결 없음');
}

/* ③ 상한가에서 매도는 대기 중인 매수 물량과 즉시 체결된다 */
{
  const { user, book } = await run({ ...base, id: 'b-up-sell', side: 'sell', price: 130000 }, quote(130000), HOLD);
  const tr = book.tradeLog[book.tradeLog.length - 1];
  ok('상한가 · 매도 130,000 → 즉시 체결 (매수 대기 물량과)',
    user.bookOrders.length === 0 && tr && tr.side === 'sell' && tr.price === 130000,
    tr ? `체결가 ${tr.price}` : '체결 없음');
}

/* ④ 하한가 잠금 — 현재가 70,000에 매도 70,000 대기 → 체결되지 않는다 */
{
  const { user, book } = await run({ ...base, id: 'b-dn-sell', side: 'sell', price: 70000 }, quote(70000), HOLD);
  ok('하한가 잠금 · 매도 70,000 대기 → 체결되지 않고 미체결 유지',
    user.bookOrders.length === 1 && book.tradeLog.length === 0,
    `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ⑤ 하한가가 풀린 순간(70,500) → 대기하던 매도가 체결. 체결가는 주문가 이상 */
{
  const { user, book } = await run({ ...base, id: 'b-dn-sell2', side: 'sell', price: 70000 }, quote(70500), HOLD);
  const tr = book.tradeLog[book.tradeLog.length - 1];
  ok('하한가 해제(70,500) · 대기 매도 70,000 → 체결가 70,500 (주문가 이상)',
    user.bookOrders.length === 0 && tr && tr.price === 70500,
    tr ? `체결가 ${tr.price}` : '체결 없음');
}

/* ⑥ 하한가에서 매수는 대기 중인 매도 물량과 즉시 체결된다 */
{
  const { user, book } = await run({ ...base, id: 'b-dn-buy', side: 'buy', price: 70000 }, quote(70000));
  const tr = book.tradeLog[book.tradeLog.length - 1];
  ok('하한가 · 매수 70,000 → 즉시 체결',
    user.bookOrders.length === 0 && tr && tr.side === 'buy' && tr.price === 70000,
    tr ? `체결가 ${tr.price}` : '체결 없음');
}

/* ⑦ 상한가가 아닌 가격(129,000)에서의 매수는 예전처럼 즉시 체결된다 */
{
  const { user, book } = await run({ ...base, id: 'b-mid-buy', side: 'buy', price: 129000 }, quote(128000));
  ok('잠금 아님(128,000) · 매수 129,000 → 즉시 체결가 128,000',
    user.bookOrders.length === 0 && book.tradeLog.length === 1,
    `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ⑧ 기준가를 모르는 응답이면 잠금 판정을 하지 않는다(예전 동작 유지) */
{
  const { user, book } = await run({ ...base, id: 'b-noprev', side: 'buy', price: 130000 }, quoteNoPrev(130000));
  ok('기준가 없는 응답 · 매수 130,000 → 잠금 판정 없이 체결(기존 동작 보존)',
    user.bookOrders.length === 0 && book.tradeLog.length === 1,
    `미체결 ${user.bookOrders.length}건 · 체결 ${book.tradeLog.length}건`);
}

/* ⑨ 상한가 잠금 중에도 KRX 주문은 KRX 시간에만 판정된다(창구 규칙 유지) */
{
  const { user } = await run({ ...base, id: 'b-krx-lock', side: 'buy', price: 130000, ex: 'KRX' },
    { datas: [{ itemCode: '005930', stockName: '삼성전자', marketStatus: 'CLOSE', closePrice: '129500',
      compareToPreviousClosePrice: '29500', overMarketPriceInfo: { overMarketStatus: 'OPEN', overPrice: '130000' } }] },
    null, '2026-11-26T08:10:00+09:00');
  ok('KRX 주문은 NXT 프리마켓(08:10)에 체결되지 않고 대기 유지',
    user.bookOrders.length === 1, `미체결 ${user.bookOrders.length}건`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length) { failed.forEach(f => console.log(' - ' + f.name)); process.exitCode = 1; }
