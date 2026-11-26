/* ══════════════════════════════════════════════════════════════════════════════
   limit-lock-ui-test.mjs — 상·하한가 잠금 UI 동작 검증 (실제 앱 화면)
   ────────────────────────────────────────────────────────────────────────────
   사용자 요청 2026-11-26
     "상/하한가 종목들은 매수/매도 대기가 있을 건데 지금은 상,하한가여도 거래가
      바로 다 되잖아. 상,하한가 시 거래 시스템 보완해서 개편해줘."
   화면에서 실제로 일어나야 하는 일을 브라우저에서 그대로 확인한다.
     · 상한가 잠금: 매수(지정가·시장가)는 '상한가 매수대기'로 접수되고 체결되지 않는다
     · 상한가 잠금: 매도는 즉시 체결된다
     · 잠금이 풀리면(매도 잔량 출회) 대기 주문이 체결된다
     · 하한가는 반대(매도 대기 / 매수 즉시 체결)
     · 종목 상세·주문 화면·호가창·미체결 목록에 잠금 표시가 보인다

   실행: node tests/limit-lock-ui-test.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8481;
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

/* 기준가 100,000원 · 상한가 130,000원 · 하한가 70,000원 */
const USER = {
  cash: 50000000, usdCash: 0, usdSettling: [], watchlist: ['005930'],
  acctType: 'general', acctActive: 'a1',
  acctList: [{ id: 'a1', type: 'general', name: '일반' }],
  acctBooks: { a1: { cash: 50000000, usdCash: 0, usdSettling: [], holdings: [{ code: '005930', qty: 5, avg: 95000 }], tradeLog: [] } },
  holdings: [{ code: '005930', qty: 5, avg: 95000 }], tradeLog: [], bookOrders: [], sendLog: [],
};

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const main = async () => {
  const { chromium } = await import('playwright');
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 430, height: 932 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String((e && e.message) || e)));
  await pg.route('**/*', r => {
    const u = r.request().url();
    if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"datas":[],"candles":[],"list":[],"quotes":[]}' });
    return r.continue();
  });
  await pg.addInitScript((user) => {
    localStorage.setItem('session', JSON.stringify('tester'));
    localStorage.setItem('accounts', JSON.stringify({ tester: { pass: 'x', name: '테스터' } }));
    localStorage.setItem('user:tester', JSON.stringify(user));
    localStorage.setItem('settings', JSON.stringify({ orderPass: false, realHours: false }));
  }, USER);
  await pg.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => !!(window.__diag && window.__diag.quoteTest), null, { timeout: 30000 });
  await pg.evaluate(() => {
    document.querySelectorAll('.overlay').forEach(o => o.hidden = true);
    const bg = document.getElementById('bootGate'); if (bg) bg.remove();
    document.body.classList.remove('locked', 'booting', 'needs-auth');
  });
  const setPx = (px, prev) => pg.evaluate(({ px, prev }) => window.__diag.quoteTest('005930', {
    price: px, prevClose: prev, open: prev, high: px, low: prev, uniPx: { price: px, prevClose: prev, t: Date.now() },
  }), { px, prev });

  /* ── ① 상한가 잠금 — 호가에 매도 잔량이 없다 ── */
  await setPx(130000, 100000);
  const upLock = await pg.evaluate(() => window.__diag.bookTest('005930', {
    prevClose: 100000, sell: [], buy: [{ p: 130000, q: 58000, r: 100 }, { p: 129900, q: 12000, r: 20 }],
  }));
  ok('상한가 판정 — 현재가 130,000 · 매도 잔량 0 → 잠금',
    upLock && upLock.at === 'up' && upLock.locked === true,
    `at=${upLock && upLock.at} locked=${upLock && upLock.locked} src=${upLock && upLock.src}`);

  /* ── ② 종목 상세에 잠금 안내가 보인다 ── */
  await pg.evaluate(() => window.__diag.openTrade('005930'));
  await pg.waitForTimeout(400);
  const detailTxt = await pg.evaluate(() => {
    const el = document.getElementById('dLimitLock');
    return { hidden: el ? el.hidden : null, text: (el ? el.textContent : '').replace(/\s+/g, ' ').trim() };
  });
  ok('종목 상세에 상한가 잠금 안내 표시',
    detailTxt.hidden === false && /상한가 잠금/.test(detailTxt.text) && /매수대기/.test(detailTxt.text),
    detailTxt.text.slice(0, 70));

  /* ── ③ 상한가 잠금 중 지정가 매수(130,000) → 즉시 체결 아님 · 매수 대기 접수 ── */
  const buy1 = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'buy', ex: 'KRX', price: 130000, qty: 1 }));
  const o1 = buy1.orders && buy1.orders[0];
  ok('상한가 잠금 · 매수 130,000 → 체결 없이 미체결 접수(lock=up)',
    buy1.orders && buy1.orders.length === 1 && buy1.orders[0].price === 130000 &&
    buy1.orders[0].lock === 'up' && (buy1.log || []).length === 0,
    `미체결 ${(buy1.orders || []).length}건 · lock=${o1 && o1.lock} · 체결 ${(buy1.log || []).length}건`);

  /* ── ④ 미체결 목록·주문 화면에 '상한가 매수대기' 배지 ── */
  await pg.evaluate(async () => {
    const d = document.getElementById('dBuyEntry'); if (d) d.click();
    await new Promise(r => setTimeout(r, 200));
  });
  await pg.waitForTimeout(300);
  const badge = await pg.evaluate(() => {
    const pb = document.getElementById('pendBox');
    const ob = document.getElementById('orderBookBody');
    return { pend: pb ? (pb.hidden ? '' : pb.textContent.replace(/\s+/g, ' ').trim()) : '', book: ob ? ob.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  ok('미체결 목록에 상한가 매수대기 표시',
    /상한가 매수대기/.test(badge.pend), badge.pend.slice(0, 60));
  ok('호가창에 상한가 잠금 표시',
    /상한가/.test(badge.book) && /잔량 없음|대기/.test(badge.book), badge.book.slice(0, 60));

  /* ── ⑤ 자동 감시가 돌아도 체결되지 않는다 ── */
  const tick1 = await pg.evaluate(() => window.__diag.autoTickTest());
  ok('자동 감시 1회 — 상한가 잠금 중 매수는 체결되지 않음',
    (tick1.orders || []).length === 1 && (tick1.log || []).length === 0,
    `미체결 ${(tick1.orders || []).length}건 · 체결 ${(tick1.log || []).length}건`);

  /* ── ⑥ 상한가 잠금 중 매도 → 대기 중인 매수와 즉시 체결 ── */
  const sell1 = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'sell', ex: 'KRX', price: 130000, qty: 5 }));
  const s1 = sell1.log && sell1.log[sell1.log.length - 1];
  ok('상한가 잠금 · 매도 130,000 → 즉시 체결',
    s1 && s1.side === 'sell' && s1.price === 130000, s1 ? `체결가 ${s1.price}` : '체결 없음');

  /* ── ⑦ 시장가 매수도 잠금 시 상한가 대기 ── */
  await pg.evaluate(() => window.__diag.clearOrders());
  const trBefore = await pg.evaluate(() => window.__diag.snapshot().tr);
  const mkt = await pg.evaluate(() => window.__diag.marketOrderTest({ code: '005930', side: 'buy', qty: 1 }));
  ok('상한가 잠금 · 시장가 매수 → 상한가(130,000) 매수 대기',
    (mkt.orders || []).length === 1 && mkt.orders[0].price === 130000 && mkt.orders[0].lock === 'up' && mkt.tr === trBefore,
    `미체결 ${(mkt.orders || []).length}건 · 접수 ${mkt.orders && mkt.orders[0] && mkt.orders[0].price} · lock=${mkt.orders && mkt.orders[0] && mkt.orders[0].lock} · 체결증가 ${mkt.tr - trBefore}`);

  /* ── ⑧ 잠금이 풀리면(매도 잔량 출회) 대기 주문이 체결된다 ── */
  const un = await pg.evaluate(() => {
    window.__diag.bookTest('005930', { prevClose: 100000, sell: [{ p: 130000, q: 4200, r: 30 }], buy: [{ p: 129900, q: 800, r: 6 }] });
    return window.__diag.lockOf('005930', 130000);
  });
  const tick2 = await pg.evaluate(() => window.__diag.autoTickTest());
  ok('매도 잔량 출회 → 잠금 해제 판정', un && un.locked === false, `locked=${un && un.locked} src=${un && un.src}`);
  ok('잠금 해제 후 대기하던 매수가 체결 (체결가 ≤ 주문가)',
    (tick2.orders || []).length === 0 && (tick2.log || []).length > 0,
    `미체결 ${(tick2.orders || []).length}건 · 체결 ${(tick2.log || []).length}건`);

  /* ── ⑨ 하한가 잠금 — 매수 잔량 0 ── */
  await pg.evaluate(() => window.__diag.clearOrders());
  await pg.evaluate(() => window.__diag.mutate(50000000));      /* 보유 10주·예수금 복원(⑥에서 전량 매도) */
  await setPx(70000, 100000);
  const dnLock = await pg.evaluate(() => window.__diag.bookTest('005930', {
    prevClose: 100000, sell: [{ p: 70000, q: 61000, r: 100 }], buy: [],
  }));
  ok('하한가 판정 — 현재가 70,000 · 매수 잔량 0 → 잠금',
    dnLock && dnLock.at === 'down' && dnLock.locked === true, `at=${dnLock && dnLock.at} locked=${dnLock && dnLock.locked}`);
  const tr2Before = await pg.evaluate(() => window.__diag.snapshot().tr);
  const sell2 = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'sell', ex: 'KRX', price: 70000, qty: 2 }));
  const tr2After = await pg.evaluate(() => window.__diag.snapshot().tr);
  ok('하한가 잠금 · 매도 70,000 → 체결 없이 하한가 매도대기',
    (sell2.orders || []).length === 1 && sell2.orders[0].lock === 'down' && tr2After === tr2Before,
    `미체결 ${(sell2.orders || []).length}건 · lock=${sell2.orders && sell2.orders[0] && sell2.orders[0].lock} · 체결증가 ${tr2After - tr2Before}`);
  const buyDown = await pg.evaluate(() => window.__diag.orderTest({ code: '005930', side: 'buy', ex: 'KRX', price: 70000, qty: 1 }));
  ok('하한가 잠금 · 매수 70,000 → 즉시 체결',
    (buyDown.log || []).length > 0 && buyDown.log[buyDown.log.length - 1].side === 'buy',
    (buyDown.log || []).length ? `체결가 ${buyDown.log[buyDown.log.length - 1].price}` : '체결 없음');

  /* ── ⑩ 하한가가 풀리면 대기 매도가 체결된다 ── */
  await setPx(70500, 100000);
  const tick3 = await pg.evaluate(() => window.__diag.autoTickTest());
  const t3 = tick3.log && tick3.log[tick3.log.length - 1];
  ok('하한가 해제(70,500) → 대기 매도 체결 (체결가 ≥ 주문가)',
    (tick3.orders || []).length === 0 && t3 && t3.side === 'sell' && t3.price >= 70000,
    t3 ? `체결가 ${t3.price}` : '체결 없음');

  /* ── ⑪ 실제 주문 버튼 경로(비밀번호 없이) — 상한가 매수 대기 ── */
  await pg.evaluate(() => window.__diag.clearOrders());
  await setPx(130000, 100000);
  await pg.evaluate(() => window.__diag.bookTest('005930', { prevClose: 100000, sell: [], buy: [{ p: 130000, q: 90000, r: 100 }] }));
  const click = await pg.evaluate(async () => {
    window.__diag.openTrade('005930');
    await new Promise(r => setTimeout(r, 250));
    const d = document.getElementById('dBuyEntry'); if (d) d.click();
    await new Promise(r => setTimeout(r, 250));
    const px = document.getElementById('pxInput'), qty = document.getElementById('qtyInput');
    if (px) { px.value = '130,000'; px.dispatchEvent(new Event('input', { bubbles: true })); }
    if (qty) { qty.value = '1'; qty.dispatchEvent(new Event('input', { bubbles: true })); }
    const btn = document.getElementById('submitBtn'); if (btn) btn.click();
    await new Promise(r => setTimeout(r, 250));
    const toasts = [...document.querySelectorAll('#toastWrap .toast')].map(x => x.textContent.replace(/\s+/g, ' '));
    return { orders: window.__diag.snapshot().books2, toasts };
  });
  ok('주문 버튼(실제 UI)으로 상한가 매수 → 미체결 접수 + 안내',
    click.orders === 1 && click.toasts.some(t => /상한가 매수 대기/.test(t)),
    `미체결 ${click.orders}건 · 안내 "${(click.toasts.find(t => /상한가/.test(t)) || '').slice(0, 40)}"`);

  ok('앱 실행 중 예외 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close();
  srv.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) { failed.forEach(f => console.log(' - ' + f.name)); process.exitCode = 1; }
};

main().catch(e => { console.error(e); process.exit(2); });
