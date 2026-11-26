#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════════════███
   LIVE증권 v17.8.46 회귀 검사 · name-mobile-check.mjs
   ────────────────────────────────────────────────────────────────────────────
   [왜 만들었나] 두 가지 결함이 반복해서 돌아왔다.
     ① 종목명 자리에 종목코드가 찍히는 문제 — v17.8.42 에서 클랜 모달 한 곳만
        고쳤는데, 보유 종목·자산 구성 도넛에서 033250(체시스)이 그대로 나왔다.
     ② 모바일 상단 프로필 이름이 '한…' 으로 잘리고, 스크롤한 뒤 하단 '메뉴'를
        누르면 드로어 위쪽이 화면 밖으로 잘리던 문제.

   [무엇을 재나]
     A. 정적 마스터(STOCKS 66종)에 없는 종목(033250 체시스·0167A0 ETF)을 넣고
        · 보유 표·자산 구성 범례·관심종목·미리보기·상세 머리말 어디에도
          이름 자리에 숫자 코드가 남지 않는지 문서 전체를 훑는다
        · 서버 이름(/api/meta)이 늦게 와도 처음부터 코드가 보이지 않는지
     B. 320/360/390/412px 에서 Max 등급 배지가 붙은 상태로 프로필 이름이
        잘리지 않는지(scrollWidth ≤ clientWidth)
     C. 1200px 스크롤한 뒤 헤더가 top 0 에 붙어 있는지, 하단 '메뉴'로 연 드로어의
        첫 항목이 헤더 아래에서 시작하고 위가 잘리지 않는지

   [실행] node name-mobile-check.mjs   (프로젝트 루트, playwright 필요)
   ════════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8497;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const CODES = { '033250': '체시스', '0167A0': 'SOL AI반도체TOP2플러스', '180640': '한진칼', '005930': '삼성전자' };
const HOLD = [
  { code: '005930', qty: 15, avg: 172400 },
  { code: '180640', qty: 6, avg: 245000 },
  { code: '033250', qty: 218, avg: 4870 },
  { code: '0167A0', qty: 22, avg: 11025 },
];
const USER = {
  cash: 5000000, usdCash: 0, usdSettling: [], watchlist: Object.keys(CODES),
  acctType: 'general', acctActive: 'a1',
  acctList: [{ id: 'a1', type: 'general', name: '일반', openedAt: Date.now(), pw: 'x', cashSet: 1 }],
  acctBooks: { a1: { cash: 5000000, usdCash: 0, usdSettling: [], holdings: HOLD, tradeLog: [] } },
  holdings: HOLD, tradeLog: [], bookOrders: [], priceTargets: {},
  watchFolders: [{ id: 'f1', name: '내 관심', code: '', codes: Object.keys(CODES), icon: '⭐' }],
};

let fail = 0, passN = 0;
const ok = (m) => { passN++; console.log('  ✔ ' + m); };
const bad = (m) => { fail++; console.log('  ✘ ' + m); };
const check = (cond, m, detail) => cond ? ok(m) : bad(m + (detail ? ' — ' + detail : ''));

/* 이름 자리에 코드가 남았는지 문서 전체를 훑는다.
   .cd / .cdl-td / i / title 은 코드를 일부러 보여 주는 자리라 제외한다. */
const scan = `(() => {
  const codes = ${JSON.stringify(Object.keys(CODES))};
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.textContent || '').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || el.closest('.cd, .cdl-td, i, .code-line, [data-code-badge]')) continue;
    if (el.closest('[hidden]')) continue;
    const hit = codes.find(c => t === c || t.split(/[\\s·|,→]/).includes(c));
    if (hit) out.push({ code: hit, text: t.slice(0, 30), cls: String(el.className).slice(0, 40) });
  }
  return out;
})()`;

const run = async () => {
  const _pw = await import('playwright');
  const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch();

  const boot = async (w, h, opts = {}) => {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e.message).slice(0, 140)));
    await pg.route('**/*', r => {
      const u = r.request().url();
      if (/\/api\//.test(u)) {
        let body = '{"ok":true,"items":[],"datas":[],"candles":[],"quotes":[],"markets":{},"n":0}';
        if (/\/api\/meta/.test(u)) {
          const qs = new URL(u).searchParams.get('codes') || '';
          const m = {};
          if (!opts.metaFail) {
            qs.split(',').filter(Boolean).forEach(c => {
              const k = c.toUpperCase();
              m[k] = { market: '코스피', name: CODES[k] || '' };
            });
          }
          body = JSON.stringify({ ok: true, markets: m });
        }
        if (/\/api\/quote/.test(u)) {
          /* quotes 에 이름이 실려 오는 경우(정상)와 이름이 비어 오는 경우를 모두 재현한다 */
          body = JSON.stringify({ ok: true, quotes: Object.entries(CODES).map(([code, name]) => ({ code, name: opts.quoteNames === false ? '' : name, price: 10000, prevClose: 9900 })) });
        }
        const delay = opts.metaDelay && /\/api\/meta/.test(u) ? opts.metaDelay : 0;
        return setTimeout(() => r.fulfill({ status: 200, contentType: 'application/json', body }), delay);
      }
      return r.continue();
    });
    await pg.addInitScript(user => {
      localStorage.setItem('session', JSON.stringify('tester'));
      localStorage.setItem('accounts', JSON.stringify({ tester: { pass: 'x', name: '한연우' } }));
      localStorage.setItem('user:tester', JSON.stringify(user));
      localStorage.setItem('settings', JSON.stringify({ orderPass: false, realHours: false }));
      localStorage.setItem('permAsked', '1'); localStorage.setItem('permGateDone', '1');
    }, USER);
    await pg.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2600);
    const clean = () => pg.evaluate(() => {
      document.querySelectorAll('.overlay').forEach(o => o.hidden = true);
      document.querySelectorAll('.upd-overlay').forEach(o => o.remove());
      const b = document.getElementById('bootGate'); if (b) b.remove();
      document.body.classList.remove('locked', 'booting', 'needs-auth');
      const slot = document.querySelector('[data-tier-slot]');
      if (slot && !slot.querySelector('.tier-mini')) {
        const s = document.createElement('span'); s.className = 'tier-mini max'; s.textContent = 'Max'; slot.appendChild(s);
      }
      const n = document.getElementById('uName'); if (n) n.textContent = '한연우';
    });
    await clean();
    await pg.waitForTimeout(400);
    return { ctx, pg, errs, clean };
  };

  /* ─────────── A. 종목명 ─────────── */
  for (const [w, h] of [[390, 844], [360, 800]]) {
    console.log(`\n════ ${w}×${h} · 종목명 ════`);
    /* 이름 응답을 일부러 1.2초 늦춘다 — 도착 전 화면에 코드가 새는지 본다 */
    const { ctx, pg, errs } = await boot(w, h, { metaDelay: 1200 });
    await pg.evaluate(() => document.querySelector('#tabbar [data-bv="account"]').click());
    await pg.waitForTimeout(300);
    const early = await pg.evaluate(scan);
    check(early.length === 0, '이름 도착 전에도 이름 자리에 코드가 없다', JSON.stringify(early.slice(0, 4)));
    await pg.waitForTimeout(2600);
    await pg.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.hidden = true); });

    const names = await pg.evaluate(() => ({
      rows: [...document.querySelectorAll('#holdBody tr[data-code]')].map(tr => ({
        code: tr.dataset.code, name: (tr.querySelector('.nm') || {}).textContent || '',
      })),
      legend: [...document.querySelectorAll('#allocLegend .al-r span')].map(s => s.textContent.trim()),
    }));
    check(names.rows.length === 4, '보유 종목 4줄이 그려진다', JSON.stringify(names.rows));
    const wrong = names.rows.filter(r => !r.name || r.name === r.code);
    check(wrong.length === 0, '보유 표 종목명이 모두 이름이다', JSON.stringify(wrong));
    check(names.legend.some(t => t === '체시스'), '자산 구성 범례에 체시스가 나온다', JSON.stringify(names.legend));
    check(!names.legend.includes('033250'), '자산 구성 범례에 033250 이 없다', JSON.stringify(names.legend));

    const body = await pg.evaluate(scan);
    check(body.length === 0, 'MY 자산 화면 어디에도 이름 자리 코드가 없다', JSON.stringify(body.slice(0, 4)));

    /* 관심종목 — 모듈 스코프 함수는 page.evaluate 에서 안 보이므로 화면 버튼으로 이동한다 */
    await pg.evaluate(() => document.querySelector('#tabbar [data-bv="watch"]').click());
    await pg.waitForTimeout(1800);
    const wnames = await pg.evaluate(() => [...document.querySelectorAll('#watchBody tr[data-code] .nm')].map(s => s.textContent.trim()));
    check(wnames.length >= 4 && !wnames.some(t => Object.keys(CODES).includes(t)), '관심종목 이름이 코드가 아니다', JSON.stringify(wnames));

    /* 미리보기 패널 — 관심종목 줄을 눌러 연다 */
    await pg.evaluate(() => { const tr = document.querySelector('#watchBody tr[data-code="033250"]'); if (tr) tr.click(); });
    await pg.waitForTimeout(1500);
    const side = await pg.evaluate(() => (document.querySelector('.ssp-name') || {}).textContent || '');
    check(side === '체시스', '미리보기 머리말이 체시스', side);

    /* 상세 화면 머리말 — 미리보기의 '종목 상세' 버튼 */
    await pg.evaluate(() => { const b = document.getElementById('stockSideDetail'); if (b) b.click(); });
    await pg.waitForTimeout(2200);
    await pg.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.hidden = true); });
    const dname = await pg.evaluate(() => (document.getElementById('dName') || {}).textContent || '');
    check(dname.includes('체시스'), '종목 상세 머리말이 체시스', dname);
    check(errs.length === 0, '자바스크립트 오류 없음', JSON.stringify(errs.slice(0, 3)));
    await ctx.close();
  }

  /* ─────────── A-2. 이름 서버가 죽어도 코드가 이름 자리에 새지 않는다 ─────────── */
  {
    console.log('\n════ 390×844 · 이름 서버 실패 ════');
    const { ctx, pg } = await boot(390, 844, { metaFail: true, quoteNames: false });
    await pg.evaluate(() => document.querySelector('#tabbar [data-bv="account"]').click());
    await pg.waitForTimeout(3000);
    await pg.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.hidden = true); });
    const rows = await pg.evaluate(() => [...document.querySelectorAll('#holdBody tr[data-code]')].map(tr => ({
      code: tr.dataset.code, name: (tr.querySelector('.nm') || {}).textContent || '',
    })));
    check(rows.length === 4, '이름을 못 받아도 보유 줄은 남는다', JSON.stringify(rows));
    check(rows.every(r => r.name !== r.code), '이름을 못 받으면 코드 대신 — 를 보여 준다', JSON.stringify(rows));
    const body = await pg.evaluate(scan);
    check(body.length === 0, '이름 서버 실패 시에도 이름 자리 코드가 없다', JSON.stringify(body.slice(0, 4)));
    await ctx.close();
  }

  /* ─────────── B. 프로필 이름 ─────────── */
  for (const w of [320, 360, 390, 412]) {
    console.log(`\n════ ${w} · 프로필 ════`);
    const { ctx, pg } = await boot(w, 800);
    const m = await pg.evaluate(() => {
      const n = document.getElementById('uName'), chip = document.getElementById('profileBtn');
      const hr = document.querySelector('.header-inner');
      const cb = chip.getBoundingClientRect();
      return {
        text: n.textContent, scrollW: n.scrollWidth, clientW: n.clientWidth,
        clipped: n.scrollWidth > n.clientWidth + 1,
        chipH: Math.round(cb.height), chipRight: Math.round(cb.right), vw: innerWidth,
        headerOverflow: Math.round(hr.scrollWidth - hr.clientWidth),
      };
    });
    check(!m.clipped, `${w}px 에서 프로필 이름이 잘리지 않는다`, JSON.stringify(m));
    check(m.chipH >= 28, `${w}px 에서 프로필 버튼 높이가 28px 이상`, JSON.stringify(m));
    check(m.chipRight <= m.vw + 1 && m.headerOverflow <= 0, `${w}px 에서 헤더가 화면을 넘지 않는다`, JSON.stringify(m));
    await ctx.close();
  }

  /* ─────────── C. 스크롤 후 메뉴 ─────────── */
  for (const [w, h] of [[390, 844], [360, 800]]) {
    console.log(`\n════ ${w}×${h} · 스크롤 후 메뉴 ════`);
    const { ctx, pg } = await boot(w, h);
    await pg.evaluate(() => document.querySelector('#tabbar [data-bv="account"]').click());
    await pg.waitForTimeout(1500);
    await pg.evaluate(() => window.scrollTo(0, 1400));
    await pg.waitForTimeout(500);
    const stick = await pg.evaluate(() => {
      const h = document.querySelector('.site-header').getBoundingClientRect();
      return { scrollY: Math.round(scrollY), top: Math.round(h.top), h: Math.round(h.height) };
    });
    check(stick.top === 0, '스크롤해도 헤더가 화면 위에 붙어 있다', JSON.stringify(stick));

    await pg.evaluate(() => { document.body.classList.remove('locked'); document.getElementById('mobileMenuToggle').click(); });
    await pg.waitForTimeout(600);
    const menu = await pg.evaluate(() => {
      const nav = document.getElementById('mainNav');
      const nr = nav.getBoundingClientRect();
      const hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
      const btns = [...nav.querySelectorAll('button')].map(b => {
        const r = b.getBoundingClientRect();
        return { t: b.textContent.trim().slice(0, 6), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      const tb = document.querySelector('.tabbar');
      const tbTop = tb ? Math.round(tb.getBoundingClientRect().top) : innerHeight;
      return {
        open: nav.classList.contains('open'), top: Math.round(nr.top), bottom: Math.round(nr.bottom),
        headerBottom: Math.round(hb), vh: innerHeight, count: btns.length, tabbarTop: tbTop,
        first: btns[0], last: btns[btns.length - 1], scrollH: nav.scrollHeight, clientH: nav.clientHeight,
        cutTop: btns.filter(b => b.top < 0 && b.bottom > 0).map(b => b.t),
        navCutTop: nr.top < 0,
      };
    });
    check(menu.open, '하단 메뉴 탭으로 드로어가 열린다');
    check(!menu.navCutTop, '드로어 위쪽이 화면 밖으로 잘리지 않는다', JSON.stringify(menu));
    check(menu.top >= menu.headerBottom - 1, '드로어가 헤더 바로 아래에서 시작한다', JSON.stringify(menu));
    check(menu.first && menu.first.top >= menu.top - 1, '드로어 첫 항목(홈)이 잘리지 않는다', JSON.stringify(menu.first));
    check(menu.cutTop.length === 0, '중간에 잘린 항목이 없다', JSON.stringify(menu.cutTop));
    check(menu.count >= 16, '메뉴 항목이 16개 모두 있다', String(menu.count));
    check(menu.bottom <= menu.tabbarTop + 1, '드로어가 하단 탭바 뒤로 숨지 않는다', JSON.stringify(menu));
    /* 마지막 항목까지 스크롤로 닿을 수 있는지 — 드로어 안에서 끝까지 내려 본다 */
    const reach = await pg.evaluate(() => {
      const nav = document.getElementById('mainNav');
      nav.scrollTop = nav.scrollHeight;
      const last = [...nav.querySelectorAll('button')].pop();
      const r = last.getBoundingClientRect();
      const tb = document.querySelector('.tabbar');
      const tbTop = tb ? tb.getBoundingClientRect().top : innerHeight;
      return { text: last.textContent.trim(), bottom: Math.round(r.bottom), tabbarTop: Math.round(tbTop) };
    });
    check(reach.bottom <= reach.tabbarTop + 1, '마지막 항목(관리자)까지 탭바 위에서 닿는다', JSON.stringify(reach));

    /* 드로어에서 항목을 눌러 이동해도 스크롤이 튀지 않는지 */
    await pg.evaluate(() => { const b = document.querySelector('#mainNav [data-view="watch"]'); if (b) b.click(); });
    await pg.waitForTimeout(1000);
    const closed = await pg.evaluate(() => ({ open: document.getElementById('mainNav').classList.contains('open'), view: document.querySelector('.view.on') ? document.querySelector('.view.on').id : '' }));
    check(!closed.open, '항목을 누르면 드로어가 닫힌다', JSON.stringify(closed));
    await ctx.close();
  }

  await br.close();
  srv.close();
  console.log(`\n════ ${fail === 0 ? '전 항목 통과' : '실패 ' + fail + '건'} (통과 ${passN}) ════`);
  process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error('FAIL', e); srv.close(); process.exit(1); });
