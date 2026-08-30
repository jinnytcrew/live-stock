#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   LIVE증권 모바일 QA 게이트  ·  mobile-qa-check.mjs
   ────────────────────────────────────────────────────────────────────────────
   배포 전에 반드시 한 번 돌린다. 실기 사진으로 발견해 온 모바일 결함
   (가로 잘림 · 글자 잘림 · 장식 띠 어긋남 · 창이 탭바에 가림)을
   실제 브라우저 좌표로 전 화면에서 측정한다. 하나라도 걸리면 종료 코드 1.

   [실행 — GitHub Codespaces 기준]
     npm i -D playwright            # 처음 한 번
     npx playwright install chromium --with-deps
     node mobile-qa-check.mjs       # 프로젝트 루트에서

   [원리] 눈으로 훑는 검사는 반드시 놓친다. 여기서는 모든 화면의 모든 요소를
   좌표로 재기 때문에, 실기에서 "잘려 보이는" 것은 여기서 숫자로 먼저 걸린다.
   이 파일이 검출하는 결함 유형과 그 유형이 실제로 났던 사례·수리 원칙은
   mobile-qa-README.md 의 '재발 방지 규칙집'에 있다.
   ════════════════════════════════════════════════════════════════════════════ */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));   /* 이 파일이 놓인 곳 = 프로젝트 루트 */
const PORT = 8399;
const VIEWPORTS = [[412, 915], [360, 800]];          // 갤럭시 기본 · 좁은 폰
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json' };

/* ── 정적 서버 ─────────────────────────────────────────────────────────────── */
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' ) p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* ── 브라우저 안에서 돌릴 측정기 ──────────────────────────────────────────── */
const SCAN = (W) => {
  const rep = { overflow: [], clip: [], band: [] };
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
    }
    return false;
  };
  const firstLineRect = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const rg = document.createRange(); rg.selectNodeContents(n);
        const rects = rg.getClientRects();
        if (rects.length) return rects[0];
      }
      if (n.nodeType === 1) { const r = firstLineRect(n); if (r) return r; }
    }
    return null;
  };
  const name = (el) => el.id ? '#' + el.id
    : el.className ? '.' + String(el.className).split(' ').filter(Boolean).slice(0, 3).join('.')
    : el.tagName;
  for (const el of document.querySelectorAll('*')) {
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;

    /* ① 화면 밖으로 나가는 요소 — 가로 스크롤 줄 안은 정상 */
    const over = Math.round(r.right - W);
    if (over > 2 && !inScroller(el)) {
      const p = el.parentElement;
      const pOver = p ? p.getBoundingClientRect().right - W > 2 : false;
      if (!pOver) rep.overflow.push({ sel: name(el), txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24), over,
        /* 원인 추적용 — 부모 폭과 이 요소의 폭·최소폭을 함께 남긴다.
           환경마다 다르게 나는 결함은 이 숫자가 있어야 바로 짚을 수 있다. */
        w: Math.round(r.width), pw: p ? Math.round(p.getBoundingClientRect().width) : 0,
        minw: getComputedStyle(el).minWidth });
    }

    /* ② 글자가 상자 밖으로 잘리는 잎 노드 */
    if (!el.children.length && (el.textContent || '').trim()) {
      const cs = getComputedStyle(el);
      if (!(cs.overflow === 'visible' && cs.overflowY === 'visible')) {
        const cx = el.scrollWidth - el.clientWidth, cy = el.scrollHeight - el.clientHeight;
        const ell = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
        if ((cx > 1 && !ell) || cy > 3)
          rep.clip.push({ sel: name(el), txt: (el.textContent || '').trim().slice(0, 22), cx, cy });
      }
    }

    /* ③ 장식 띠(::before/::after 가는 세로 막대)와 글자 중심의 어긋남 */
    for (const pseudo of ['::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === 'none' || cs.position !== 'absolute') continue;
      const vis = (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') ||
                  (cs.backgroundImage && cs.backgroundImage !== 'none');
      if (!vis) continue;
      const w = parseFloat(cs.width), h = parseFloat(cs.height), topPx = parseFloat(cs.top);
      if (!(w > 0 && w <= 12 && h > 0) || !isFinite(topPx)) continue;
      if (Math.abs(h - r.height) <= 4) continue;      // 카드 전체 액센트 띠는 대상 아님
      let ty = 0;
      const m = cs.transform.match(/matrix\(([^)]+)\)/);
      if (m) ty = parseFloat(m[1].split(',')[5]) || 0;
      const tr = firstLineRect(el);
      if (!tr) continue;
      const off = (r.top + topPx + ty + h / 2) - (tr.top + tr.height / 2);
      if (Math.abs(off) > 2.5)
        rep.band.push({ sel: name(el) + pseudo, txt: (el.textContent || '').trim().slice(0, 16), off: Math.round(off * 10) / 10 });
    }
  }
  for (const k of Object.keys(rep)) {          // 같은 선택자는 하나만
    const seen = new Set();
    rep[k] = rep[k].filter(o => !seen.has(o.sel) && seen.add(o.sel));
  }
  rep.docW = document.documentElement.scrollWidth;
  return rep;
};

const main = async () => {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (e) {
    try { ({ chromium } = await import('playwright-core')); }
    catch (e2) {
      console.error('\nplaywright 가 없습니다. 먼저:  npm i -D playwright && npx playwright install chromium --with-deps\n');
      process.exit(2);
    }
  }
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const br = await chromium.launch(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {});
  let fails = 0, warns = 0;
  const bad = (msg) => { console.log('  FAIL  ' + msg); fails++; };
  const good = (msg) => console.log('  ok    ' + msg);

  for (const [W, H] of VIEWPORTS) {
    const pg = await br.newPage({ viewport: { width: W, height: H } });
    await pg.route('**/*', r => /\/api\//.test(r.request().url())
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' })
      : r.continue());
    await pg.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2800);
    await pg.evaluate(() => {
      document.querySelectorAll('.overlay').forEach(o => o.hidden = true);
      const bg = document.getElementById('bootGate'); if (bg) bg.remove();
      document.body.classList.remove('locked','booting');
    });
    const views = await pg.evaluate(() => [...document.querySelectorAll('[id^="view-"]')].map(v => v.id.slice(5)));
    console.log('\n════ ' + W + '×' + H + ' · 화면 ' + views.length + '개 ════');

    for (const v of views) {
      await pg.evaluate((v) => {
        document.querySelectorAll('[id^="view-"]').forEach(e => e.hidden = true);
        const t = document.getElementById('view-' + v); if (t) t.hidden = false;
      }, v);
      await pg.waitForTimeout(150);
      const r = await pg.evaluate(SCAN, W);
      const label = 'view-' + v;
      if (r.docW > W + 1) bad(label + ' · 문서 폭 ' + r.docW + 'px > 화면 ' + W + 'px');
      for (const o of r.overflow.slice(0, 6)) bad(label + ' · 화면 밖 ' + o.sel + ' "' + o.txt + '" (+' + o.over +
        'px · 폭 ' + o.w + ' / 부모 ' + o.pw + ' · min-width:' + o.minw + ')');
      for (const o of r.clip.slice(0, 6)) bad(label + ' · 글자 잘림 ' + o.sel + ' "' + o.txt + '" (가로+' + o.cx + ' 세로+' + o.cy + ')');
      for (const o of r.band.slice(0, 6)) bad(label + ' · 띠 어긋남 ' + o.sel + ' ' + o.off + 'px');
      if (!r.overflow.length && !r.clip.length && !r.band.length && r.docW <= W + 1) good(label);
    }

    /* 창(모달)이 하단 탭바 위에 있는가 — 설정·프로필 창이 잘리던 결함의 재발 감시 */
    const z = await pg.evaluate(() => {
      const tb = document.querySelector('.tabbar');
      const tz = tb ? +getComputedStyle(tb).zIndex || 0 : 0;
      return [...document.querySelectorAll('.overlay')].map(o => ({
        id: o.id || o.className, z: +getComputedStyle(o).zIndex || 0, tz
      }));
    });
    for (const o of z) (o.z > o.tz) ? null : bad('창 ' + o.id + ' z=' + o.z + ' ≤ 탭바 z=' + o.tz + ' (아래가 가려짐)');
    if (z.every(o => o.z > o.tz)) good('창 ' + z.length + '개 전부 탭바 위 (z-order)');

    /* 누를 수 있는 크기 — 경고만(칩·배지처럼 의도적으로 작은 것이 있어 실패로 치지 않는다) */
    const tiny = await pg.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        if (b.closest('[hidden]') || b.closest('.overlay')) continue;
        const r = b.getBoundingClientRect();
        if (r.width && r.height && r.height < 30)
          out.push((b.id ? '#'+b.id : '.'+String(b.className).split(' ')[0]) + ' ' + Math.round(r.height) + 'px');
      }
      return [...new Set(out)].slice(0, 8);
    });
    if (tiny.length) { console.log('  주의  높이 30px 미만 버튼 ' + tiny.length + '종: ' + tiny.join(', ')); warns += tiny.length; }
    await pg.close();
  }
  await br.close();
  srv.close();
  console.log('\n' + (fails ? '════ 실패 ' + fails + '건 — 배포 전에 고치세요 ════'
                            : '════ 모바일 QA 전 항목 통과' + (warns ? ' (주의 ' + warns + '건)' : '') + ' ════'));
  process.exit(fails ? 1 : 0);
};
main().catch(e => { console.error(e); process.exit(2); });
