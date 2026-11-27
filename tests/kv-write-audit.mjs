/* ══════════════════════════════════════════════════════════════════════════════
   kv-write-audit.mjs — KV 쓰기 한도(무료 1,000/일) 회귀 검사
   ────────────────────────────────────────────────────────────────────────────
   2026-11-27 11:07(KST) Cloudflare 가 "KV daily operation limit 50% reached" 경고를
   보냈다. 그날 09:00~11:07 두 시간에 계정 전체 쓰기 500회(11:40 기준 625회).
   원인은 사용자 데이터가 아니라 **캐시**였다. 이 파일은 그 재발을 막는 규칙을 고정한다.

   검사 항목
     ① 유휴 크론 1회 실행 → KV put/delete 0회 (미체결 색인이 비었을 때)
     ② 미체결 색인에 사용자가 있어도 체결·변경이 없으면 → KV put 0회
     ③ 시세·뉴스·호가 같은 캐시 라우트 → KV put 0회 (메모리·엣지캐시만)
     ④ 캐시 예산(KVW.cap)을 다 쓴 날 → 캐시 put 은 0회, 사용자 데이터 put 은 그대로
     ⑤ 캐시 쓰기는 계정 전체 하루 예산 안에서만 나간다

   실행: node tests/kv-write-audit.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import { strict as A } from 'node:assert';

const WORKER = new URL('../_worker.js', import.meta.url).href;
const mod = await import(WORKER);
const W = mod.default;
const T = mod.__kvtest;

/* ── 쓰기를 세는 가짜 KV ─────────────────────────────────────────────────── */
function countingKV(init) {
  const m = new Map(Object.entries(init || {}));
  const log = { put: [], del: [], get: 0, list: 0 };
  const api = {
    __store: m, __log: log,
    async get(k, opts) {
      log.get++;
      const v = m.get(String(k));
      if (v == null) return null;
      if (opts === 'json' || (opts && opts.type === 'json')) {
        try { return JSON.parse(v); } catch (e) { return null; }
      }
      return v;
    },
    async put(k, v, o) { log.put.push(String(k)); m.set(String(k), String(v)); return true; },
    async delete(k) { log.del.push(String(k)); m.delete(String(k)); return true; },
    async list(o) {
      log.list++;
      const p = (o && o.prefix) || '';
      return { keys: [...m.keys()].filter((x) => x.startsWith(p)).map((name) => ({ name })), list_complete: true };
    },
  };
  return api;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cachePuts = (kv) => kv.__log.put.filter((k) => !T.kvEssential(k));
const userPuts = (kv) => kv.__log.put.filter((k) => T.kvEssential(k));

let pass = 0;
async function check(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + (e && e.message)); process.exitCode = 1; }
}

/* ── ① 유휴 크론 ─══════════════════════════════════════════════════════════ */
await check('유휴 크론 1회 = KV put/delete 0회', async () => {
  const kv = countingKV({ 'live-accounts:pendidx': JSON.stringify({ v: 1, at: 0, u: {} }) });
  /* 프리마켓 시각이 아닌 시간으로 돌린다(주말 새벽) */
  const evt = { scheduledTime: Date.parse('2026-11-28T12:00:00+09:00') };
  const ctx = { waitUntil() {} };
  await W.scheduled(evt, { APP_KV: kv }, ctx);
  A.deepEqual(kv.__log.put, [], '유휴 크론이 KV 에 썼다: ' + kv.__log.put.join(','));
  A.deepEqual(kv.__log.del, [], '유휴 크론이 KV 에서 지웠다: ' + kv.__log.del.join(','));
});

/* ── ② 주문은 있지만 체결·변경 없음 ─══════════════════════════════════════════ */
await check('체결 없는 크론 = KV put 0회', async () => {
  const user = {
    id: 'tester', savedAt: Date.now(), rv: 1, cash: 5000000, usdCash: 0,
    holdings: [], tradeLog: [], usdSettling: [], acctActive: 'a1',
    acctList: [{ id: 'a1', type: 'general', name: '일반' }],
    acctBooks: { a1: { cash: 5000000, usdCash: 0, holdings: [], tradeLog: [], usdSettling: [] } },
    /* 지정가 매수 — 시세가 닿지 않게 아주 낮은 값 */
    bookOrders: [{ id: 'o1', code: '005930', side: 'buy', price: 1000, qty: 1, ex: 'KRX' }],
  };
  const kv = countingKV({
    'live-accounts:pendidx': JSON.stringify({ v: 1, at: 0, u: { tester: { sig: '1|0|005930|', n: 1, plans: 0, at: 0 } } }),
    'live-accounts:usr:tester': JSON.stringify(user),
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (String(u).includes('polling.finance.naver.com')) {
      return new Response(JSON.stringify({ datas: [{ itemCode: '005930', stockName: '삼성전자', marketStatus: 'CLOSE', closePrice: '170700', compareToPreviousClosePrice: '1000', overMarketPriceInfo: { overMarketStatus: 'CLOSE', overPrice: '170700' } }] }),
        { headers: { 'content-type': 'application/json' } });
    }
    if (String(u).includes('/api/fx')) return new Response(JSON.stringify({ ok: true, fx: [{ key: 'USD', price: 1400 }] }), { headers: { 'content-type': 'application/json' } });
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  };
  try {
    await W.scheduled({ scheduledTime: Date.parse('2026-11-27T10:30:00+09:00') }, { APP_KV: kv }, { waitUntil() {} });
    await sleep(30);
  } finally { globalThis.fetch = realFetch; }
  const puts = kv.__log.put.filter((k) => k.startsWith('live-accounts:usr:tester'));
  A.equal(puts.length, 0, '체결이 없는데 사용자 레코드를 썼다(' + puts.length + '회)');
  A.equal(kv.__log.put.filter((k) => k === 'live-accounts:pendidx').length, 0, '색인이 그대로인데 다시 썼다');
});

/* ── ③ 캐시 라우트는 KV 에 쓰지 않는다 ─════════════════════════════════════════ */
await check('SWR 캐시(짧은 수명)는 KV put 0회', async () => {
  const kv = countingKV({});
  T.setEnv({ APP_KV: kv });
  const mk = (route, body) => T.swrRoute({ env: { APP_KV: kv }, waitUntil() {} }, route,
    new Request('https://live-stock.local/api/' + route), async () => new Response(JSON.stringify(body)));
  /* 시세·환율·인기: stale 이 30분 이하 → KV 에 남길 이유가 없다(v17.8.50) */
  for (const r of ['market', 'fx', 'popular', 'quote']) {
    if (!T.SWR_CFG[r]) continue;
    await mk(r, { ok: true, at: Date.now(), n: 1 });
  }
  await sleep(40);
  A.deepEqual(cachePuts(kv), [], '캐시 라우트가 KV 에 썼다: ' + cachePuts(kv).join(','));
});

/* ── ④ 예산을 다 쓴 날 ─══════════════════════════════════════════════════════ */
await check('예산 소진 시 캐시 put 0회 · 사용자 데이터는 저장', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const kv = countingKV({ ['kvw:' + day]: String(T.KVW.cap) });
  const g = T.govKV(kv);
  T.KVW.day = '';            /* 날짜 경계를 지나 새로 읽게 만든다 */
  T.KVW.n = 0; T.KVW.at = 0;
  await g.put('usq:005930', JSON.stringify({ at: Date.now(), q: {} }), { expirationTtl: 120 });
  A.equal(cachePuts(kv).length, 0, '예산이 끝났는데 캐시를 KV 에 썼다');
  /* 사용자 데이터(계정)는 예산과 무관하게 늘 저장된다 */
  await g.put('live-accounts:usr:tester2', JSON.stringify({ rv: 1 }), {});
  A.equal(kv.__log.put.filter((k) => k === 'live-accounts:usr:tester2').length, 1, '사용자 데이터가 막혔다');
});

/* ── ⑤ 예산이 남아 있으면 캐시도 쓴다(기능 유지) ─════════════════════════════ */
await check('예산이 남으면 캐시 put 은 1회(기존 기능 유지)', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const kv = countingKV({ ['kvw:' + day]: '0' });
  const g = T.govKV(kv);
  T.KVW.day = ''; T.KVW.n = 0; T.KVW.at = 0;
  await g.put('uscap:TESTX', JSON.stringify({ at: Date.now(), cap: 1 }), { expirationTtl: 600 });
  A.equal(kv.__log.put.filter((k) => k === 'uscap:TESTX').length, 1, '예산이 남았는데 캐시를 저장하지 않았다');
});

/* ── ⑥ 예산 카운터는 계정 전체에 남는다 ─══════════════════════════════════════ */
await check('캐시 쓰기 카운터(kvw:)가 KV 에 남는다', async () => {
  A.ok([...T.KVW && Object.keys(T.KVW)].length > 0, 'KVW 상태가 없다');
  A.equal(typeof T.KVW.cap, 'number');
  A.ok(T.KVW.cap > 0 && T.KVW.cap <= 400, "예산 상한이 한도(1,000)에 비해 너무 크다: " + T.KVW.cap);
});

console.log('\n' + (process.exitCode ? 'FAIL' : 'OK') + ' — ' + pass + '건 통과');
