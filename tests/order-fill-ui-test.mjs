/* ══════════════════════════════════════════════════════════════════════════════
   order-fill-ui-test.mjs — 주문 화면 '현재가'·지정가 체결가 회귀 검증 (실제 앱 화면)
   ────────────────────────────────────────────────────────────────────────────
   2026-11-26 08:26 사용자 제보
     "삼성전자 17만 1700원에 미체결 걸어놨는데 다시 들어가보니깐 17만 2400원에 체결"
   를 그대로 재현한다 — 같은 순간에 화면이 두 개의 현재가(머리말 172,400 / 주문폼 170,700)를
   보여 주고, 체결 엔진은 머리말 값을 봤다. 이 파일은 실제 index.html·app.js 를 브라우저에
   띄워 그 값들이 어긋나는지, 지정가보다 불리하게 체결되는지를 숫자로 확인한다.

   실행: node tests/order-fill-ui-test.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8477;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* 계좌 하나(일반) + 삼성전자 1주 보유 + 예수금 500만원 */
const USER = {
  cash: 5000000, usdCash: 0, usdSettling: [], watchlist: ['005930', '000660'],
  acctType: 'general', acctActive: 'a1',
  acctList: [{ id: 'a1', type: 'general', name: '일반' }],
  acctBooks: { a1: { cash: 5000000, usdCash: 0, usdSettling: [], holdings: [{ code: '005930', qty: 1, avg: 165000 }], tradeLog: [] } },
  holdings: [{ code: '005930', qty: 1, avg: 165000 }], tradeLog: [], bookOrders: [], sendLog: [],
};

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const main = async () => {
  const { chromium } = await import('playwright');
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 430, height: 932 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e && e.message || e)));

  await pg.route('**/*', r => {
    const u = r.request().url();
    if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"datas":[]}' });
    return r.continue();
  });
  await pg.addInitScript((user) => {
    localStorage.setItem('session', JSON.stringify('tester'));
    localStorage.setItem('accounts', JSON.stringify({ tester: { pass: 'x', name: '테스터' } }));
    localStorage.setItem('user:tester', JSON.stringify(user));
    localStorage.setItem('settings', JSON.stringify({ orderPass: false, realHours: true }));
  }, USER);
  await pg.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => !!(window.__diag && window.__diag.quoteTest), null, { timeout: 30000 });
  await pg.evaluate(() => {
    document.querySelectorAll('.overlay').forEach(o => o.hidden = true);
    const bg = document.getElementById('bootGate'); if (bg) bg.remove();
    document.body.classList.remove('locked', 'booting', 'needs-auth');
  });

  /* ── ① 같은 순간, 머리말 172,400 · 주문폼 현재가 172,400 이어야 한다 ── */
  const q = await pg.evaluate(() => window.__diag.quoteTest('005930', {
    price: 170700, prevClose: 169000, open: 170700, high: 172400, low: 170000,
    uniPx: { price: 172400, prevClose: 169000, t: Date.now() },
  }));
  const hint = await pg.evaluate(() => window.__diag.quoteTest('005930', {}));
  ok('주문폼 현재가 = 머리말 통합가 (170,700 → 172,400)',
    q.cur === 172400, `주문폼 currentPrice ${q.cur} · dispQuote ${q.disp}`);

  /* ── ② 매도 지정가 171,700 — 현실 시장은 172,400. 유리하게 체결되더라도 원 주문가가 남아야 한다 ── */
  const sell = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'sell', ex: 'NXT', price: 171700, qty: 1 }));
  const sellLog = sell.log && sell.log[sell.log.length - 1];
  ok('매도 지정가 171,700 · 현재 172,400 → 체결가 172,400 + 원 주문가 171,700 기록',
    sellLog && sellLog.price === 172400 && sellLog.orderPx === 171700,
    sellLog ? `체결가 ${sellLog.price} · orderPx ${sellLog.orderPx}` : '체결 없음');

  /* ── ③ 매수 지정가 171,700 — 현재 172,400 이면 절대 체결되면 안 된다 ── */
  const buy = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'buy', ex: 'NXT', price: 171700, qty: 1 }));
  ok('매수 지정가 171,700 · 현재 172,400 → 미체결로 접수(즉시 체결 금지)',
    buy.orders && buy.orders.length === 1 && buy.orders[0].price === 171700 && buy.orders[0].ex === 'NXT',
    buy.orders ? `미체결 ${buy.orders.length}건 · 접수 ${buy.orders[0] && buy.orders[0].price}` : '오류');

  /* ── ④ 그 미체결을 자동 감시가 돌려도 172,400 에 체결되면 안 된다 ── */
  const tick = await pg.evaluate(() => window.__diag.autoTickTest());
  const badBuy = (tick.log || []).filter(t => t && t.side === 'buy' && t.code === '005930' && t.price > 171700);
  ok('자동 감시 1회 — 매수 171,700 은 172,400 에 체결되지 않음',
    !!tick.orders && tick.orders.length === 1 && badBuy.length === 0,
    `미체결 ${tick.orders && tick.orders.length}건 · 지정가 초과 매수체결 ${badBuy.length}건`);

  /* ── ⑤ 매수 지정가 172,400 (현재가와 같음) → 체결가는 주문가를 넘지 않는다 ── */
  const buy2 = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'buy', ex: 'NXT', price: 172400, qty: 1 }));
  const b2 = buy2.log && buy2.log[buy2.log.length - 1];
  ok('매수 지정가 172,400 · 현재 172,400 → 체결가 ≤ 172,400',
    b2 && b2.price <= 172400 && b2.side === 'buy', b2 ? `체결가 ${b2.price}` : '체결 없음');

  /* ── ⑥ 화면에 보이는 주문가가 그대로 접수된다 (입력칸 우선) ── */
  const shown = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'buy', ex: 'SOR', price: 200000, qty: 1 }));
  ok('입력칸에 보이는 200,000원이 그대로 접수 가격',
    shown.orderPrice === 200000, `접수 ${shown.orderPrice} · 화면 현재가 ${shown.cur}`);

  /* ── ⑦ 주문폼 현재가와 머리말 가격이 같은 값인지 (DOM 실제 값) ── */
  const dom = await pg.evaluate(() => {
    window.__diag.openTrade && window.__diag.openTrade('005930');
    return null;
  });
  await pg.waitForTimeout(600);
  const domPx = await pg.evaluate(() => {
    const h = document.getElementById('orderStockPrice');
    const p = document.getElementById('priceHint');
    return { head: h ? h.textContent : null, hint: p ? p.textContent : null };
  });
  const headNum = Number(String(domPx.head || '').replace(/[^0-9]/g, ''));
  const hintNum = Number(String(domPx.hint || '').replace(/[^0-9]/g, ''));
  ok('거래 화면 머리말 현재가 = 주문가격 옆 현재가',
    headNum > 0 && hintNum >= headNum && Math.abs(headNum - hintNum) < 1000,
    `머리말 ${domPx.head} / 주문폼 ${domPx.hint}`);

  ok('앱 실행 중 예외 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close();
  srv.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) { failed.forEach(f => console.log(' - ' + f.name)); process.exitCode = 1; }
};

main().catch(e => { console.error(e); process.exit(2); });
