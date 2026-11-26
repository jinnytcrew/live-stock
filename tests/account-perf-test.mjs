/* ══════════════════════════════════════════════════════════════════════════════
   account-perf-test.mjs — '내 계좌(MY 자산)' 진입·보유종목 클릭 지연 실측
   ────────────────────────────────────────────────────────────────────────────
   2026-11-26 사용자 제보
     "내 계좌에서 다른 메뉴로 가거나 내 계좌에서 보유 종목을 클릭하거나 할 때
      계속 시간 지연되고 렉 걸리는데"
   를 숫자로 잡는다. 실제 index.html·app.js 를 브라우저에 띄우고, 시계를 재어
     · 클릭 핸들러가 돌려주기까지(동기)
     · 화면이 실제로 그려지기까지(두 번의 requestAnimationFrame)
     · 그 사이 메인스레드를 막은 long task 수·총 시간
   를 기록한다. safeRun 계측(window.__perfOn)으로 렌더러별 소요 시간도 함께 본다.

   실행: node tests/account-perf-test.mjs            (수치만 보고)
        node tests/account-perf-test.mjs --assert    (회귀 기준까지 검사)
   ══════════════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8479;
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

/* ── 종목·시세·차트·호가 mock ──────────────────────────────────────────── */
const STOCKS = [
  ['005930', '삼성전자', 175400, 170700], ['000660', 'SK하이닉스', 214000, 208500],
  ['035420', 'NAVER', 231500, 229000], ['005380', '현대차', 253000, 250500],
  ['051910', 'LG화학', 402000, 398000], ['068270', '셀트리온', 191500, 189000],
  ['005490', 'POSCO홀딩스', 341000, 344500], ['012330', '현대모비스', 246500, 244000],
  ['035720', '카카오', 45250, 44800], ['207940', '삼성바이오로직스', 812000, 805000],
  ['000270', '기아', 118500, 117000], ['006400', '삼성SDI', 356000, 352000],
];
const HOLD = STOCKS.map(([code, name, px, prev], i) => ({
  code, qty: 10 + i * 3, avg: Math.round(prev * 0.93), plan: { stop: Math.round(prev * 0.9), target: Math.round(prev * 1.15), horizon: 'swing', autoStop: 1, autoTake: 1, why: '수동' },
}));
const USER = {
  cash: 12000000, usdCash: 0, usdSettling: [], watchlist: STOCKS.map(s => s[0]).slice(0, 5),
  acctType: 'general', acctActive: 'a1',
  acctList: [{ id: 'a1', type: 'general', name: '일반' }],
  acctBooks: { a1: { cash: 12000000, usdCash: 0, usdSettling: [], holdings: HOLD, tradeLog: [] } },
  holdings: HOLD, tradeLog: [], bookOrders: [], sendLog: [],
  watchFolders: [{ id: 'f1', name: '관심', codes: STOCKS.map(s => s[0]).slice(0, 5) }],
};

function candles(n) {
  const out = [];
  let px = 150000;
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - (n - i) * 86400000);
    px = Math.round(px * (1 + (Math.sin(i / 7) * 0.012)));
    out.push({ d: d.toISOString().slice(0, 10), t: d.getTime(), o: px - 400, h: px + 900, l: px - 1100, c: px, v: 300000 + (i % 9) * 10000 });
  }
  return out;
}
const CANDLES = candles(260);
const QUOTES = {};
STOCKS.forEach(([code, name, px, prev]) => {
  QUOTES[code] = { code, name, price: px, prevClose: prev, open: prev, high: Math.max(px, prev) * 1.01 | 0,
    low: Math.min(px, prev) * 0.99 | 0, volume: 1200000, value: px * 1200000 };
});

function apiBody(url) {
  const u = new URL(url, 'http://x');
  const p = u.pathname;
  if (p === '/api/quote' || p === '/api/nxtquote') {
    const codes = String(u.searchParams.get('codes') || '').split(',').filter(Boolean);
    return { ok: true, quotes: codes.map(c => QUOTES[c] || QUOTES['005930']).filter(Boolean) };
  }
  if (p === '/api/chart') return { ok: true, candles: CANDLES };
  if (p === '/api/askprice') {
    const code = u.searchParams.get('code');
    const q = QUOTES[code] || QUOTES['005930'];
    const sell = [], buy = [];
    for (let i = 0; i < 5; i++) {
      sell.push({ p: q.price + 100 * (5 - i), q: 1200 + i * 300, r: 30 + i * 8 });
      buy.push({ p: q.price - 100 * (i + 1), q: 900 + i * 260, r: 24 + i * 7 });
    }
    return { ok: true, code, prevClose: q.prevClose, totalSell: 9000, totalBuy: 8000, sell, buy,
      bestAsk: sell[sell.length - 1].p, bestBid: buy[0].p, spread: 200, levels: 5, at: Date.now() };
  }
  if (p === '/api/nxtlist') return { ok: true, list: [], asOf: '2026-11-26' };
  if (p === '/api/version') return { ok: true, v: 'test' };
  return { ok: true, items: [], datas: [], candles: [], list: [] };
}

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const fry = ms => Math.round(ms * 10) / 10;

const main = async () => {
  const { chromium } = await import('playwright');
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 430, height: 932 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String((e && e.message) || e)));
  await pg.route('**/*', r => {
    const u = r.request().url();
    if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiBody(u)) });
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
    window.__perfOn = true;
  });
  /* 시세가 한 번 들어와 보유 평가가 채워진 상태에서 잰다 */
  await pg.waitForTimeout(1500);

  /* long task 수집기 — 측정 구간마다 초기화한다 */
  await pg.evaluate(() => {
    window.__lt = [];
    try {
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lt.push(e.duration); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) { }
  });

  const measure = async (label, action) => {
    return await pg.evaluate(async ({ label, action }) => {
      const lt0 = (window.__lt || []).length;
      window.__perfLog = [];
      const t0 = performance.now();
      if (action === 'account') document.querySelector('#tabbar button[data-bv="account"], #mainNav button[data-view="account"]').click();
      else if (action === 'hold') document.querySelector('#holdBody tr[data-code]').click();
      else if (action === 'watch') document.querySelector('#tabbar button[data-bv="watch"], #mainNav button[data-view="watch"]').click();
      else if (action === 'home') document.querySelector('#tabbar button[data-bv="home"], #mainNav button[data-view="home"]').click();
      else if (action === 'idle4s') {
        /* 시세 폴링이 도는 동안의 렌더 횟수·소요 — 화면은 그대로 둔다 */
        window.__mut = 0;
        try { new MutationObserver(m => { window.__mut += m.length; }).observe(document.getElementById('holdBody'), { childList: true, subtree: true }); } catch (e) { }
        window.__perfLog = [];
        await new Promise(r => setTimeout(r, 4000));
        const lt = (window.__lt || []);
        const rows = (window.__perfLog || []).filter(x => x && x.ms >= 1).sort((a, b) => b.ms - a.ms);
        return { label: 'accountIdle(4s)', sync: 0, firstPaint: 0, settled: 4000,
          ltCount: lt.length, ltTotal: Math.round(lt.reduce((a, b) => a + b, 0)), ltMax: Math.round(Math.max(0, ...lt)),
          mut: window.__mut, slow: rows.slice(0, 10).map(r => ({ l: r.l, ms: r.ms })) };
      }
      const sync = performance.now() - t0;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const firstPaint = performance.now() - t0;
      /* 한 프레임 더 — 늦게 도착한 그리기까지 포함 */
      await new Promise(r => setTimeout(r, 90));
      const settled = performance.now() - t0;
      const lt = (window.__lt || []).slice(lt0);
      const rows = (window.__perfLog || []).filter(x => x && x.ms >= 1).sort((a, b) => b.ms - a.ms);
      return {
        label, sync: Math.round(sync * 10) / 10, firstPaint: Math.round(firstPaint * 10) / 10,
        settled: Math.round(settled * 10) / 10,
        ltCount: lt.length, ltTotal: Math.round(lt.reduce((a, b) => a + b, 0)),
        ltMax: Math.round(Math.max(0, ...lt)),
        slow: rows.slice(0, 12).map(r => ({ l: r.l, ms: r.ms })),
      };
    }, { label, action });
  };

  const out = [];
  /* 워밍업 — 첫 진입은 모듈 초기화 비용이 섞인다 */
  await measure('warmup-home', 'home');
  await pg.waitForTimeout(400);

  out.push(await measure('home→account', 'account'));
  await pg.waitForTimeout(300);
  out.push(await measure('account→watch', 'watch'));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.__diag.showView('account'));
  await pg.waitForTimeout(400);
  out.push(await measure('account→holdingClick', 'hold'));
  await pg.waitForTimeout(300);
  /* 내 계좌에 머무는 동안 시세가 올 때마다 표를 다시 그리는 비용 — 4초간 관찰 */
  await pg.evaluate(() => window.__diag.showView('account'));
  await pg.waitForTimeout(400);
  out.push(await measure('accountIdle(4s)', 'idle4s'));

  console.log('\n── 실측 (ms) ────────────────────────────────────────────────');
  console.log('구간                        동기   첫프레임   안정   longtask(수/합/최대)');
  for (const r of out) {
    console.log(`${r.label.padEnd(24)} ${String(r.sync).padStart(6)} ${String(r.firstPaint).padStart(9)} ${String(r.settled).padStart(6)}   ${r.ltCount}/${r.ltTotal}/${r.ltMax}` + (r.mut != null ? `  · 표 다시그리기 ${r.mut}회` : ''));
    if (r.slow.length) console.log('   느린 그리기: ' + r.slow.map(s => `${s.l}=${s.ms}ms`).join(' · '));
  }

  const acc = out.find(r => r.label === 'home→account');
  const hold = out.find(r => r.label === 'account→holdingClick');
  const watch = out.find(r => r.label === 'account→watch');
  const idle = out.find(r => r.label === 'accountIdle(4s)');

  console.log('\n── 회귀 기준 ───────────────────────────────────────────────');
  /* 기준값은 v17.8.45 수정 후 실측(동기 25~33 · 첫프레임 105~137 · 롱태스크 62~83ms)에
     여유를 둔 값이다. 수정 전 수치(동기 95~230 · 첫프레임 261~356 · 롱태스크 142~233)는
     모두 여기서 걸렸다 — 그 상태로 되돌아가면 이 검사가 빨간불을 띄운다. */
  ok('내 계좌 진입 — 클릭 즉시(동기) 60ms 이내', acc.sync <= 60, `${acc.sync}ms`);
  ok('내 계좌 진입 — 첫 프레임 180ms 이내', acc.firstPaint <= 180, `${acc.firstPaint}ms`);
  ok('보유 종목 클릭 — 동기 40ms 이내', hold.sync <= 40, `${hold.sync}ms`);
  ok('보유 종목 클릭 — 상세 전환 첫 프레임 200ms 이내', hold.firstPaint <= 200, `${hold.firstPaint}ms`);
  ok('내 계좌 → 관심종목 — 첫 프레임 160ms 이내', watch.firstPaint <= 160, `${watch.firstPaint}ms`);
  ok('내 계좌에 머무는 4초 — 롱태스크 총합 400ms 이내', idle.ltTotal <= 400, `${idle.ltCount}건/${idle.ltTotal}ms`);
  ok('앱 실행 중 예외 없음', errs.length === 0, errs.slice(0, 3).join(' | '));

  await br.close();
  srv.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  if (failed.length && process.argv.includes('--assert')) { failed.forEach(f => console.log(' - ' + f.name)); process.exitCode = 1; }
};

main().catch(e => { console.error(e); process.exit(2); });
