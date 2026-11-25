/* ══════════════════════════════════════════════════════════════════════════════
   fill-source-guard.mjs — 주문가·체결가 규칙이 코드에서 빠지지 않게 지키는 검사
   ────────────────────────────────────────────────────────────────────────────
   브라우저 없이도 돌 수 있는 구조 검사다. 2026-11-26 08:26 제보(지정가 171,700 →
   172,400 체결)를 고친 세 가지 규칙이 다음 판에서 실수로 지워지면 여기서 잡힌다.
     ① 주문 화면 현재가 = 통합가(livePx)      ② 접수 가격 = 화면 입력칸 값
     ③ 체결가 = 주문가 범위(매수 min·매도 max)  ④ 주문에 창구(ex) 기록
   실행: node tests/fill-source-guard.mjs
   ══════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, '_worker.js'), 'utf8');

const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const body = (src, sig) => {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  return src.slice(i, i + 1400);
};

/* ① 주문 화면 현재가 — KRX 마지막 체결가가 아니라 통합가 */
{
  const b = body(app, 'function currentPrice(){');
  ok('currentPrice() 가 통합가(livePx)를 쓴다', /livePx\(/.test(b));
}

/* ② 접수 가격 — 입력칸 값 우선 */
{
  const b = body(app, 'function getOrderPrice(){');
  ok('getOrderPrice() 가 입력칸(pxInput) 값을 먼저 읽는다', /pxInput/.test(b) && /intOf/.test(b));
}

/* ③ 클라이언트 체결가 클램프 */
{
  const i = app.indexOf('const fill=o.side===\'buy\'?Math.min(q.price,o.price):Math.max(q.price,o.price);');
  ok('미체결 체결가를 주문가 범위로 확정(매수 min·매도 max)', i > 0);
  ok('자동 체결이 창구별 시세(orderQuote)를 쓴다', /const q=orderQuote\(o\);/.test(app));
  ok('자동 체결이 창구 시간(orderWindowOpen)을 본다', /orderWindowOpen\(o\)/.test(app));
}

/* ④ 주문에 창구(ex)·유형(type) 저장 */
{
  const i = app.indexOf('bookOrders.push({id:');
  const seg = app.slice(i, i + 500);
  ok('미체결 주문에 접수 거래소(ex)를 저장', /ex:/.test(seg));
}

/* ⑤ 서버 — 창구별 시세·세션, 체결가 클램프, 원 주문가 기록 */
{
  ok('서버가 주문 창구별 시세를 고른다(afOrderQuote)', /function afOrderQuote\(/.test(worker) && /afOrderQuote\(quotes\[String\(o\.code\)\], o\.ex\)/.test(worker));
  ok('서버 체결가도 주문가 범위로 확정', /Math\.min\(qpx, lim\)/.test(worker) && /Math\.max\(qpx, lim\)/.test(worker));
  ok('서버가 체결 기록에 원 주문가(orderPx)를 남긴다', /orderPx: \(fill !== lim \? lim : undefined\)/.test(worker));
  ok('서버 알림 문구에 주문가를 붙인다', /주문가 " \+ lim\.toLocaleString/.test(worker));
}

/* ⑥ 체결 화면이 주문가 차이를 설명한다 */
{
  ok('체결 목록에 주문가 → 체결가 안내를 그린다', /order-history-note/.test(app) && /t\.orderPx/.test(app));
}

/* ⑦ 버전 일치 */
{
  const ver = (fs.readFileSync(path.join(ROOT, 'version-info.js'), 'utf8').match(/version: '([\d.]+)'/) || [])[1];
  const appver = (worker.match(/var APP_VER = "([\d.]+)"/) || [])[1];
  ok('version-info.js 와 _worker.js 의 버전이 같다', !!ver && ver === appver, `${ver} / ${appver}`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 통과`);
if (failed.length) process.exitCode = 1;
