/* ══════════════════════════════════════════════════════════════════════════════
   kv-endpoint-writes.mjs — '새 인스턴스가 떠도 캐시는 KV 에 쓰지 않는다' 검사
   ────────────────────────────────────────────────────────────────────────────
   실제 사고(2026-11-27): 워커 인스턴스는 수명이 짧아 새로 뜨는데, v17.1 의 캐시
   조임(간격·예산)은 '인스턴스 메모리' 기준이었다. 그래서 새 인스턴스는 늘 첫 쓰기로
   통과해 같은 캐시 키를 다시 썼고, 트래픽이 늘자 쓰기가 비례해 늘어 하루 한도
   (1,000) 경고가 났다.

   이 검사는 엔드포인트마다 **모듈을 새로 import** 해(=새 인스턴스) 호출한 뒤,
   KV 에 실제로 쓴 키를 센다. 캐시성 키가 하나라도 나오면 실패다.
   (사용자 데이터 키는 이 검사 대상이 아니다 — 예산과 무관하게 늘 저장된다.)

   실행: node tests/kv-endpoint-writes.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import { strict as A } from 'node:assert';

const BASE = new URL('../_worker.js', import.meta.url).href;
const URLS = [
  '/api/market', '/api/book?code=005930', '/api/quote?codes=005930', '/api/askprice?code=005930',
  '/api/news', '/api/popular', '/api/themes', '/api/version', '/api/krxalerts',
  '/api/nxtlist', '/api/etflist', '/api/calendar',
];

function J(o) { return new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } }); }
const QUOTE = {
  datas: [{
    itemCode: '005930', stockName: '삼성전자', marketStatus: 'CLOSE', closePrice: '170700',
    compareToPreviousClosePrice: '1000', accumulatedTradingValueRaw: '1000000',
    localTradedAt: '20261127113000',
    overMarketPriceInfo: { overMarketStatus: 'CLOSE', overPrice: '170700' },
  }],
};
const ASK = { lastClosePrice: 170700, totalSell: '100', totalBuy: '120',
  sellInfo: [{ price: '171000', count: '10', rate: 20 }], buyInfos: [{ price: '170000', count: '12', rate: 22 }] };

let pass = 0;
async function run(url, tag) {
  /* 새 인스턴스를 흉내 낸다 — 모듈 레지스트리 캐시를 쿼리로 깨서 다시 import */
  const mod = await import(BASE + '?' + tag + '=' + Math.random());
  const W = mod.default, T = mod.__kvtest;
  const m = new Map(), puts = [], dels = [];
  const kv = {
    async get(k, o) {
      const v = m.get(String(k));
      if (v == null) return null;
      if (o === 'json' || (o && o.type === 'json')) { try { return JSON.parse(v); } catch (e) { return null; } }
      return v;
    },
    async put(k, v) { puts.push(String(k)); m.set(String(k), String(v)); return true; },
    async delete(k) { dels.push(String(k)); m.delete(String(k)); return true; },
    async list(o) {
      const p = (o && o.prefix) || '';
      return { keys: [...m.keys()].filter((x) => x.startsWith(p)).map((name) => ({ name })), list_complete: true };
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const s = String(u);
    if (s.includes('/api/fx')) return J({ ok: true, fx: [{ key: 'USD', price: 1400 }] });
    if (s.includes('polling.finance.naver.com/api/realtime/domestic/stock/')) return J(QUOTE);
    if (s.includes('m.stock.naver.com') && s.includes('askingPrice')) return J(ASK);
    if (s.includes('m.stock.naver.com')) return J({ stockName: '삼성전자', closePrice: '170700', totalInfos: [] });
    if (s.includes('finance.naver.com')) return new Response('', { status: 404 });
    return J({ ok: true, datas: [] });
  };
  try {
    const env = { APP_KV: kv, ASSETS: { fetch: async () => new Response('nf', { status: 404 }) } };
    const r = await W.fetch(new Request('https://live-stock.local' + url), env, { waitUntil() {} });
    await r.text();
    await new Promise((res) => setTimeout(res, 25));
    const cache = puts.filter((k) => !T.kvEssential(k));
    A.deepEqual(cache, [], url + ' — 새 인스턴스가 캐시를 KV 에 썼다: ' + cache.join(','));
    console.log('  ✓ ' + url + '  (KV 쓰기 0회)');
    pass++;
  } finally { globalThis.fetch = realFetch; }
}

for (const u of URLS) {
  try { await run(u, 'v' + Date.now().toString(36)); }
  catch (e) { console.log('  ✗ ' + (e && e.message)); process.exitCode = 1; }
}
console.log('\n' + (process.exitCode ? 'FAIL' : 'OK') + ' — ' + pass + '/' + URLS.length + ' 엔드포인트');
