/* ═══════════════════════════════════════════════════════════════════════════
   assets/logo.js — 종목 로고 엔진 (v2.7)
   ───────────────────────────────────────────────────────────────────────────
   [v2.6에서 무엇이 잘못됐나 — 깜빡임의 진짜 원인]
   목록은 시세 틱마다 innerHTML로 통째로 다시 그려진다. v2.6은 행마다 <img>를
   새로 만들었기 때문에, 다시 그릴 때마다
       ① 새 <img>가 opacity:0 으로 생성 → 뒤의 모노그램(색 배지)이 보임
       ② onload 는 다음 프레임 이후에 비동기로 발생 → .on 클래스가 그때서야 붙음
       ③ 0.18s 페이드인
   이 반복됐다. 즉 "로고 ↔ 색 배지"가 1~2초마다 교대로 나타나는 게 깜빡임의 정체다.
   (첨부 녹화에서 삼성전자가 감청색 로고 ↔ 청록색 '삼' 배지로 번갈아 뜬 이유)

   [v2.7 해결책]
   · <img> 를 완전히 없애고 CSS background-image 로 그린다.
     이미 캐시된 이미지의 background-image 는 요소가 만들어지는 그 프레임에
     동기적으로 칠해진다 → 다시 그려도 빈틈이 생기지 않는다.
   · 어떤 소스가 되는지는 화면 밖 Image() 로 한 번만 탐색(probe)하고,
     결과(성공 소스 번호 / 실패)를 localStorage에 저장한다.
     → 두 번째 렌더부터, 그리고 다음 방문부터는 첫 프레임에 이미 정답이 그려진다.
   · 탐색이 끝나면 이미 화면에 있는 같은 종목 배지들을 제자리에서 갱신한다
     (전체 다시 그리기 없음 → 깜빡임 없음).
   · 이미지 실측 크기를 검사해 1×1 투명 픽셀·플레이스홀더를 진짜 로고로 오인하지 않는다.
     (엉뚱한 로고가 뜨던 원인 중 하나)
   · 우선주 → 본주 대체는 '이름이 실제로 우선주일 때만' 한다.
     예전엔 코드 끝자리가 5~9이면 무조건 본주 로고를 가져와 다른 회사 로고가 붙을 수 있었다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1. 이미지 소스 ─────────────────────────────────────────────────────── */
const SRC = [
  (c) => `https://static.toss.im/png-icons/securities/icn-A${c}.png`,
  (c) => `https://ssl.pstatic.net/imgstock/fn/real/logo/stock/A${c}.png`,
  (c) => `https://thumb.tossinvest.com/image/resized/96x0/https%3A%2F%2Fstatic.toss.im%2Fpng-icons%2Fsecurities%2Ficn-A${c}.png`,
  (c) => `https://file.alphasquare.co.kr/media/images/stock_logo/kr/${c}.png`,
  (c) => `https://static.toss.im/png-icons/securities/icn-A${c}-carrot.png`,
  (c) => `https://ssl.pstatic.net/imgstock/fn/real/logo/stock/A${c}_h.png`,
  /* [v2.9.8] 자체 서버 중계 — 브라우저가 못 가는 소스(토스·네이버)를 서버가 대신 받아 온다.
     사용자 기기 전수검사에서 성공 2,483건이 100% 알파스퀘어였다. 즉 나머지 소스는
     이 통신망에서 브라우저가 아예 접근하지 못한다는 뜻이라, 클라이언트만으로는 방법이 없다.
     증권사 MTS가 자체 CDN을 앞단에 두는 것과 같은 구조다. */
  (c) => `/api/logo?code=${c}`,
];

/* ★ 이 값을 바꾸면 저장된 성공/실패 기록이 통째로 무효화된다.
   [v2.9.4에서 이 장치가 왜 필요했나]
   v2.9.3에서 그룹 계열사 상속(SK이터닉스 → SK 대표 로고)을 넣었는데도
   화면에는 여전히 밋밋한 'SK' 글자 배지가 나왔다. 원인은 새 로직이 아니라 캐시였다.
   475150은 이전 버전에서 이미 '로고 없음'으로 기록됐고(3일 만료), want() 가
   그 기록을 보고 재탐색을 건너뛰어 새로 추가한 그룹 단계가 실행조차 되지 않았다.
   앞으로 소스 목록·그룹 표·탐색 순서를 손댈 때는 반드시 이 숫자를 올린다. */
const PLAN_VER = 10;
const BASE_FLAG = 100;              // idx >= 100 → 본주 코드로 받은 로고

/* ── 1-b. 그룹 계열사 로고 상속 ────────────────────────────────────────────
   SK이터닉스(475150)처럼 자기 코드로는 로고 이미지가 없는 계열사가 많다.
   그러면 모노그램으로 떨어지는데, 이름 첫 글자가 'SK'라 해시 색(초록) 위에 흰 SK가
   찍혀 "SK인데 색이 틀린 로고"처럼 보였다(첨부 사진). 실제 이 회사의 CI는 SK 그룹 CI다.
   → 자기 코드로 못 찾으면 그룹 대표 종목 코드로 한 번 더 찾고,
     그마저 실패해도 모노그램 색만은 그룹 고유색으로 칠한다.
   ★ 접두어가 명확히 그룹을 뜻하는 것만 넣는다. 예를 들어 '한미'는 한미약품과
     한미반도체가 서로 무관하므로 넣지 않는다. 긴 접두어를 먼저 둔다(HD현대 > 현대). */
const GROUPS = [
  ['HD현대', '267250', '#00a4a7'], ['KT&G', '033780', '#e60012'],
  ['SK', '034730', '#e6002d'], ['LG', '003550', '#a50034'],
  ['GS', '078930', '#0068b7'], ['CJ', '001040', '#e4002b'],
  ['LS', '006260', '#0067b1'], ['DL', '000210', '#003876'],
  ['KT', '030200', '#e6002d'], ['HL', '060980', '#0b3b8c'],
  ['HJ', '097230', '#0d4d9c'], ['OCI', '456040', '#00559c'],
  ['POSCO', '005490', '#00519e'], ['포스코', '005490', '#00519e'],
  ['한화', '000880', '#f37021'], ['롯데', '004990', '#ed1c24'],
  ['삼성', '005930', '#1428a0'], ['현대', '005380', '#002c5f'],
  ['두산', '000150', '#002f87'], ['효성', '004800', '#003da5'],
  ['코오롱', '002020', '#00a5e3'], ['한진', '002320', '#0b4da2'],
  ['아모레', '090430', '#96172e'], ['신세계', '004170', '#c8102e'],
  ['미래에셋', '006800', '#f05a28'], ['금호', '073240', '#c8102e'],
  ['영풍', '000670', '#0b5ea8'], ['세아', '306200', '#0d4a8f'],
];
function groupOf(name) {
  const nm = String(name || '').trim().toUpperCase();
  for (const g of GROUPS) { if (nm.startsWith(g[0].toUpperCase())) return g; }
  return null;
}
const GROUP_FLAG = 200;             // idx >= 200 → 그룹 대표 종목 코드로 받은 로고
const FUND_FLAG  = 300;             // idx >= 300 → ETF·ETN 운용사/발행사 로고
const SPAC_FLAG  = 400;             // idx >= 400 → 스팩 발기 증권사 로고

/* ── 1-d. 스팩(기업인수목적회사) ────────────────────────────────────────────
   남은 '로고 없음' 56종을 훑어보니 절반 가까이가 스팩이었다
   (엔에이치스팩31·32·33호, 유안타제15호스팩, 에이치엠씨제7호스팩,
    한국제15호스팩, 디비금융제13호스팩 …).
   스팩은 껍데기 법인이라 자기 CI가 애초에 존재하지 않는다. 그래서 어떤 소스를
   뒤져도 나올 수가 없었다. 실제 증권사 앱은 이 자리에 '발기 증권사 CI'를 쓴다.
   종목명 앞부분이 곧 발기인이므로 그걸로 증권사를 찾는다. */
const SPACS = [
  ['엔에이치', '005940'], ['NH', '005940'],
  ['유안타', '003470'], ['에이치엠씨', '001500'],
  ['한국', '071050'], ['디비금융', '016610'], ['DB', '016610'],
  ['하나금융', '086790'], ['하나', '086790'],
  ['미래에셋', '006800'], ['삼성', '016360'], ['신한', '055550'],
  ['케이비', '105560'], ['KB', '105560'], ['대신', '003540'],
  ['교보', '030610'], ['아이비케이', '024110'], ['IBK', '024110'],
  ['상상인', '001290'], ['에스케이', '001510'], ['SK', '001510'],
  ['유진', '001200'], ['신영', '001720'], ['키움', '039490'],
  ['메리츠', '008560'], ['한화', '003530'], ['비엔케이', '138930'],
  ['BNK', '138930'], ['이베스트', '078020'], ['엘에스', '078020'],
  ['흥국', '000540'], ['현대', '001500'],
];
function spacOf(name) {
  const nm = String(name || '').trim();
  if (!/스팩/.test(nm)) return null;                 // 스팩이 아닌 종목은 절대 건드리지 않는다
  const up = nm.toUpperCase();
  for (const sp of SPACS) { if (up.startsWith(sp[0].toUpperCase())) return sp; }
  return null;
}

/* ── 1-c. ETF·ETN 운용사 로고 ──────────────────────────────────────────────
   전수검사에서 '로고 없음' 1,809종 가운데 1,155종이 ETF·ETN이었다.
   ETF는 개별 회사가 아니라 상품이라 어느 소스에도 종목 코드별 이미지가 없다.
   실제 증권사 MTS는 이 자리에 '운용사 CI'를 쓴다(KODEX는 삼성, TIGER는 미래에셋).
   그래서 브랜드에서 운용사를 찾아 그 운용사 상장사 코드의 로고를 가져온다. */
const FUNDS = [
  ['KODEX', '016360'], ['삼성', '016360'],                    // 삼성자산운용 → 삼성증권
  ['TIGER', '006800'], ['미래에셋', '006800'],                // 미래에셋자산운용
  ['RISE', '105560'], ['KBSTAR', '105560'], ['KB', '105560'], // KB자산운용
  ['ACE', '071050'], ['KINDEX', '071050'], ['한국투자', '071050'],
  ['SOL', '055550'], ['신한', '055550'],                      // 신한자산운용
  ['PLUS', '000880'], ['ARIRANG', '000880'], ['한화', '000880'],
  ['HANARO', '005940'], ['NH', '005940'],                     // NH아문디
  ['KOSEF', '039490'], ['히어로즈', '039490'], ['키움', '039490'],
  ['WOORI', '316140'], ['우리', '316140'],
  ['BNK', '138930'], ['파워', '030610'], ['대신', '003540'],
  ['UNICORN', '001500'], ['하나', '086790'], ['IBK', '024110'],
  ['메리츠', '138040'], ['교보', '030610'], ['DB', '016610'],
  /* [v3.0] 위 브랜드들의 운용사·발행사 상장 대표 종목 */
  ['1Q', '086790'],        // 하나자산운용 → 하나금융지주
  ['WON', '316140'],       // 우리자산운용 → 우리금융지주
  ['HK', '000540'],        // 흥국자산운용 → 흥국화재
  ['KOACT', '016360'],     // 삼성액티브자산운용 → 삼성증권
  ['N2', '005940'],        // NH투자증권 ETN
  ['한투', '071050'], ['KIS', '071050'], ['TRUE', '071050'],
  ['QV', '008560'],        // 메리츠증권 ETN
  ['ITF', '016360'], ['마이티', '003540'],
  ['유진', '001200'], ['KCGI', '003300'], ['DAISHIN343', '003540'],
  ['신영', '001720'], ['VITA', '001200'],
];
function fundOf(name) {
  const nm = String(name || '').trim().toUpperCase();
  for (const f of FUNDS) { if (nm.startsWith(f[0].toUpperCase())) return f; }
  return null;
}


/* 우선주 판별: 코드 끝자리만으로 판단하지 않고 종목명을 함께 본다.
   '삼성전자우', '현대차2우B', '대신증권우' … 처럼 이름이 우/우B로 끝나야 한다. */
const PREF_RE = /\d?우(B|C)?$/;
function baseCode(code, name) {
  if (!PREF_RE.test(String(name || '').trim())) return '';
  return (/^\d{5}[1-9]$/.test(code)) ? code.slice(0, 5) + '0' : '';
}
function urlOf(code, name, idx) {
  let c;
  if (idx >= SPAC_FLAG) { const sp = spacOf(nameOf[code] || name); c = sp && sp[1] !== code ? sp[1] : ''; }
  else if (idx >= FUND_FLAG) { const f = fundOf(nameOf[code] || name); c = f && f[1] !== code ? f[1] : ''; }
  else if (idx >= GROUP_FLAG) { const g = groupOf(nameOf[code] || name); c = g && g[1] !== code ? g[1] : ''; }
  else if (idx >= BASE_FLAG) c = baseCode(code, name);
  else c = code;
  const f = SRC[idx % BASE_FLAG];
  return (c && f) ? f(c) : '';
}
/* [v2.9.5] 잘 먹히는 소스를 앞으로 당긴다.
   실측(사용자 기기 109종 검사)에서 성공 81건이 전부 '알파스퀘어'였다.
   즉 토스·네이버는 이 네트워크에서 막혀 있고, 종목마다 실패 요청을 3번씩 먼저
   보내고 있었다는 뜻이다. 한 소스가 3번 이기면 그 소스를 1순위로 승격시켜
   요청 수를 1/4로 줄인다(검사 속도와 목록 로딩 체감이 크게 달라진다). */
let hotSrc = -1;
try { const h = parseInt(localStorage.getItem('lgHot'), 10); if (h >= 0 && h < SRC.length) hotSrc = h; } catch (e) {}
const srcWins = {};
function noteWin(idx) {
  const k = idx % BASE_FLAG;
  srcWins[k] = (srcWins[k] || 0) + 1;
  if (hotSrc !== k && srcWins[k] >= 3) {
    hotSrc = k;
    try { localStorage.setItem('lgHot', String(k)); } catch (e) {}
  }
}
/* [v2.9.8] 죽은 소스를 아예 버린다.
   이 기기에서 토스·네이버는 4,292종 검사 내내 단 한 건도 성공하지 못했다.
   그런데도 종목마다 실패할 요청을 계속 먼저 보내고 있었다.
   한 소스가 60번 넘게 실패하고 성공이 0이면 후보에서 제외한다.
   (마지막 소스 = 자체 서버 중계는 최후 보루라 절대 버리지 않는다.) */
const RELAY = SRC.length - 1;
/* [v3.1 · 치명 — 이번 검사에서 로고가 전멸한 주범]
   실패 횟수(srcFail)는 localStorage에 쌓이는데 성공 횟수(srcWins)는 메모리라
   새로고침마다 0이 됐다. 그래서 접속하자마자 '실패 60회 이상 + 성공 0' 조건이
   과거 실패가 쌓인 모든 직접 소스에 성립해, 지난번엔 멀쩡히 되던 알파스퀘어까지
   제외됐다. 4,292종이 통째로 중계 함수 한 곳에 몰렸고, 동시 실행 한도에 걸려
   줄줄이 시간 초과 → '없음' 1,962종. (사용자가 /api/logo?code=069500 을 단독으로
   열었을 땐 KODEX 로고가 바로 떴다 — 서버는 정상, 몰림이 문제였다는 증거.)
   → 실패 집계는 세션 안에서만 세고 절대 저장하지 않는다. */
let srcFail = {};
try { localStorage.removeItem('lgFail'); } catch (e) {}
function noteFail(idx) { const k = idx % BASE_FLAG; srcFail[k] = (srcFail[k] || 0) + 1; }
function dead(i) { return i !== RELAY && !srcWins[i] && (srcFail[i] || 0) >= 60; }
function order() {
  const b = SRC.map((_, i) => i).filter(i => !dead(i));
  const o = hotSrc >= 0 && b.indexOf(hotSrc) >= 0 ? [hotSrc].concat(b.filter(i => i !== hotSrc)) : b;
  /* [v3.4.1] 중계를 항상 1순위로 — CDN 캐시라 가장 빠르고, 서버가 6개 소스+페이지+파비콘을
     대신 뒤져 주므로 브라우저가 소스를 하나씩 두드리며 기다릴 이유가 없다. */
  const o2 = o.indexOf(RELAY) >= 0 ? [RELAY].concat(o.filter(i => i !== RELAY)) : o.concat([RELAY]);
  return o2.length ? o2 : [RELAY];
}
function plan(code, name) {                 // 시도 순서(소스 번호 배열)
  const list = order();
  if (baseCode(code, name)) order().forEach(i => list.push(BASE_FLAG + i));
  const g = groupOf(name);
  if (g && g[1] !== code) order().forEach(i => list.push(GROUP_FLAG + i));   // 계열사 → 그룹 CI
  const fd = fundOf(name);
  if (fd && fd[1] !== code) order().forEach(i => list.push(FUND_FLAG + i));  // ETF·ETN → 운용사 CI
  const sp = spacOf(name);
  if (sp && sp[1] !== code) order().forEach(i => list.push(SPAC_FLAG + i));  // 스팩 → 발기 증권사 CI
  return list;
}

/* ── 2. 결과 저장소 ─────────────────────────────────────────────────────── */
const OK_KEY = 'lgOk3', NO_KEY = 'lgNo3', VER_KEY = 'lgPlanVer', CAP = 8000;
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
let okMap = rd(OK_KEY), noMap = rd(NO_KEY), saveT = null;
/* 탐색 계획이 바뀌었으면 옛 판정을 버리고 전부 다시 찾는다 */
try {
  if (String(localStorage.getItem(VER_KEY) || '') !== String(PLAN_VER)) {
    /* [v3.4.1] 예전엔 성공 판정까지 통째로 지워, 버전을 올릴 때마다 전 화면이
       색 배지로 돌아갔다가 재탐색이 끝나야 로고가 떴다('글자 뜨다가 로고 뜨는' 원인).
       성공 판정은 유효한 이미지이므로 그대로 두고, 실패 기록만 지워 새 규칙으로 재도전한다. */
    noMap = {};
    localStorage.removeItem(NO_KEY);
    localStorage.removeItem('lgFail'); localStorage.removeItem('lgHot');
    localStorage.setItem(VER_KEY, String(PLAN_VER));
  }
} catch (e) { okMap = {}; noMap = {}; }

function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      const trim = (o) => { const k = Object.keys(o); if (k.length <= CAP) return o;
        const n = {}; k.slice(-CAP).forEach((x) => { n[x] = o[x]; }); return n; };
      okMap = trim(okMap); noMap = trim(noMap);
      localStorage.setItem(OK_KEY, JSON.stringify(okMap));
      localStorage.setItem(NO_KEY, JSON.stringify(noMap));
    } catch (e) { /* 저장 실패는 표시에 영향 없음 */ }
  }, 1500);
}

/* ── 3. 탐색(probe) — 화면 밖에서 한 종목당 한 번만 ────────────────────── */
const busy = new Set();             // 탐색 진행 중인 코드
const nameOf = {};                  // 코드 → 이름(탐색 시 우선주 판정에 필요)
let queue = [], live = 0;
const MAX_LIVE = 5;                 // 동시 요청 상한 — 목록을 한 번에 그려도 몰리지 않게
const MIN_PX = 12;                  // 이보다 작으면 플레이스홀더로 간주

const NO_TTL = 3 * 86400e3;          // 실패 기록은 3일 뒤 자동 만료
function isDead(code) {
  const t = noMap[code];
  if (!t) return false;
  if (Date.now() - t > NO_TTL) { delete noMap[code]; return false; }
  return true;
}
function want(code, name) {
  if (!code || okMap[code] != null || isDead(code) || busy.has(code)) return;
  busy.add(code); nameOf[code] = name || nameOf[code] || '';
  queue.push(code); pump();
}
function pump() {
  while (live < MAX_LIVE && queue.length) { live++; run(queue.shift()); }
}
function run(code) {
  const nm = nameOf[code] || '';
  const order = plan(code, nm);
  let k = 0;
  const step = () => {
    if (k >= order.length) { finish(code, null); return; }
    const idx = order[k++], url = urlOf(code, nm, idx);
    if (!url) { step(); return; }
    const im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    let settled = false;
    const bail = () => { if (!settled) { settled = true; step(); } };
    im.onload = () => {
      if (settled) return; settled = true;
      /* 실측 크기 검사 — 1×1 투명 픽셀이나 빈 응답을 로고로 착각하지 않는다 */
      if ((im.naturalWidth || 0) < MIN_PX || (im.naturalHeight || 0) < MIN_PX) { step(); return; }
      finish(code, idx);
    };
    im.onerror = () => { noteFail(idx); bail(); };
    setTimeout(bail, url.indexOf('/api/') === 0 ? 10000 : 8000);                       // 응답 없는 소스에서 멈추지 않도록
    im.src = url;
  };
  step();
}
function finish(code, idx) {
  busy.delete(code); live = Math.max(0, live - 1);
  if (idx == null) {
    /* 오프라인 상태에서 전부 실패한 것을 '로고 없음'으로 굳히면 안 된다.
       온라인일 때만 실패로 기록하고, 그마저도 3일 뒤 다시 시도한다. */
    let online = true; try { online = navigator.onLine !== false; } catch (e) {}
    if (online) noMap[code] = Date.now();
  } else { okMap[code] = idx; delete noMap[code]; noteWin(idx); paint(code); }
  persist(); pump();
}

/* 이미 화면에 그려진 같은 종목 배지를 제자리에서 승격시킨다(전체 재렌더 없음) */
function paint(code) {
  let els; try { els = document.querySelectorAll('.lgo[data-lg="' + code + '"]'); } catch (e) { return; }
  const u = urlOf(code, nameOf[code] || '', okMap[code]);
  if (!u || !els) return;
  /* [v3.1] 제자리 승격 경로에 alt(대체 로고 여백)가 빠져 있었다.
     그래서 문자열 재렌더를 거친 행만 여백이 붙고, 탐색 직후 승격된 행은 그대로라
     SK이터닉스가 다른 SK 종목보다 커 보였다. */
  const isAlt = okMap[code] >= BASE_FLAG;
  els.forEach((el) => {
    el.style.backgroundImage = "url('" + u + "')";
    el.classList.add('on', 'fade');               // 최초 1회만 부드럽게
    el.classList.toggle('alt', isAlt);
  });
}

/* ── 4. 모노그램 ────────────────────────────────────────────────────────── */
const PAL = ['#e0453c', '#e8722c', '#c99000', '#3f9e4d', '#00968f', '#1a7fd4',
  '#3b56c4', '#7a4fd0', '#c93a86', '#5b6b7c', '#0f766e', '#8a5a2b',
  '#2f74ff', '#c0392b', '#16786a', '#6d4aa8'];

/* ETF·ETN 브랜드 → [접두어, 표기, 운용사 고유색]
   접두어 뒤에 반드시 공백(또는 끝)이 와야 한다. 국내 ETF명은 예외 없이
   '브랜드 + 공백 + 기초지수' 형태라서, 이 조건이 없으면 파워로직스·대신증권
   같은 일반 종목이 ETF 브랜드로 오인된다. */
const BRANDS = [
  ['KODEX', 'KD', '#1428a0'], ['TIGER', 'TG', '#f05a28'],
  ['RISE', 'RS', '#a87c00'], ['KBSTAR', 'RS', '#a87c00'],
  ['ACE', 'AC', '#d0021b'], ['KINDEX', 'AC', '#d0021b'],
  ['SOL', 'SL', '#0046ff'], ['PLUS', 'PL', '#e05a00'], ['ARIRANG', 'PL', '#e05a00'],
  ['HANARO', 'HN', '#00854a'], ['KOSEF', 'KS', '#d5122a'],
  ['TIMEFOLIO', 'TF', '#1c1f26'], ['TIME', 'TF', '#1c1f26'],
  ['KIWOOM', 'KW', '#d5122a'], ['히어로즈', 'HR', '#d5122a'],
  /* [v3.0] 검사에서 '없음'으로 떨어진 ETF·ETN 브랜드를 보강.
     TIME(타임폴리오)·1Q(하나)·WON(우리)·HK(흥국)·KoAct(삼성액티브)·N2/한투/KIS(ETN 발행사)는
     규칙에 없어서 브랜드 배지 대신 아무 색 원이 찍히고 있었다. */
  ['1Q', '1Q', '#00857e'], ['WON', 'WN', '#0067ac'], ['HK', 'HK', '#c8102e'],
  ['KOACT', 'KA', '#1428a0'], ['N2', 'N2', '#00a650'], ['한투', '한투', '#d0021b'],
  ['KIS', 'KI', '#d0021b'], ['TRUE', 'TR', '#d0021b'], ['QV', 'QV', '#e2231a'],
  ['ITF', 'IT', '#1428a0'], ['FOCUS', 'FC', '#5b6b7c'], ['마이티', 'MT', '#0b3b8c'],
  ['유진', 'YJ', '#00478f'], ['KCGI', 'KC', '#1b3f8b'], ['DAISHIN343', 'DS', '#0b3b8c'],
  ['하나', 'HN', '#00857e'], ['신영', 'SY', '#0b4da2'], ['키움', 'KW', '#d5122a'],
  ['에셋플러스', 'AP', '#2b6cb0'], ['BNKR', 'BK', '#2a5caa'], ['VITA', 'VT', '#5b6b7c'],
  ['WOORI', 'WR', '#0067ac'], ['BNK', 'BK', '#2a5caa'],
  ['마이다스', 'MD', '#6b4fbb'], ['파워', 'PW', '#1b4f9c'],
  ['UNICORN', 'UC', '#002c5f'], ['대신343', 'DS', '#0b3b8c'],
  ['에셋플러스', 'AP', '#2b6cb0'], ['TRUSTON', 'TR', '#0d5f4f'],
].map(([p, mark, color]) => [new RegExp('^' + p + '(?=\\s|$)', 'i'), mark, color]);

function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function monogram(code, name) {
  const nm = String(name || '').trim().replace(/^\(주\)\s*/, '');
  for (const [re, mark, color] of BRANDS) {
    if (re.test(nm)) return { txt: mark, color, brand: true };
  }
  const clean = nm.replace(/[^0-9A-Za-z가-힣]/g, '');
  let txt = '?';
  if (clean) txt = /[가-힣]/.test(clean[0]) ? clean.slice(0, 1) : clean.slice(0, 2).toUpperCase();
  /* 계열사면 해시 색이 아니라 그룹 고유색을 쓴다 — 이미지가 끝내 없어도
     'SK인데 초록' 같은 어긋난 인상이 생기지 않는다. */
  const g = groupOf(nm);
  return { txt, color: (g ? g[2] : PAL[fnv(String(code || nm || '?')) % PAL.length]), brand: false };
}

/* ── 5. 렌더 ────────────────────────────────────────────────────────────── */
/**
 * 종목 로고 HTML.
 * 로고를 이미 알고 있으면 background-image가 박힌 상태로 즉시 반환한다(깜빡임 0).
 * 모르면 모노그램을 반환하고 뒤에서 조용히 탐색한 뒤 제자리 승격시킨다.
 * @param {string} code 종목코드
 * @param {string} name 종목명
 * @param {string} size '' | 'xs' | 'sm' | 'lg' | 'xl'
 */
export function stockLogo(code, name, size) {
  const c = String(code || '').toUpperCase();
  const m = monogram(c, name);
  if (c && name) nameOf[c] = name;
  const known = !!(c && okMap[c] != null);
  const url = known ? urlOf(c, nameOf[c] || '', okMap[c]) : '';
  /* [v3.0] SK이터닉스처럼 '대체 로고'(그룹 CI·운용사 CI·본주)를 쓰는 종목은
     원본 이미지의 여백이 제각각이라 같은 SK 로고인데도 혼자 크게 보였다(첨부 사진).
     대체 계층에서 온 이미지는 안쪽 여백을 강제로 넣어 크기를 맞춘다. */
  const alt = known && okMap[c] >= BASE_FLAG ? ' alt' : '';
  const cls = 'lgo' + (size ? ' ' + size : '') + (m.brand ? ' bd' : '') + (url ? ' on' + alt : '');
  const bg = url ? ";background-image:url('" + url + "')" : '';
  if (!known && c) want(c, name);
  return `<span class="${cls}" style="--lgc:${m.color}${bg}"${c ? ` data-lg="${esc(c)}"` : ''}><i aria-hidden="true">${esc(m.txt)}</i></span>`;
}

/* 진단용 — 콘솔에서 상태 확인·초기화 */
try {
  window.__lgStat = () => ({ ok: Object.keys(okMap).length, fail: Object.keys(noMap).length, busy: busy.size, queued: queue.length, hotSrc, srcWins, srcFail, order: order() });
  window.__lgReset = () => { okMap = {}; noMap = {};
    srcFail = {}; hotSrc = -1;
    try { localStorage.removeItem(OK_KEY); localStorage.removeItem(NO_KEY); localStorage.removeItem('lgFail'); localStorage.removeItem('lgHot'); } catch (e) {}
    return '로고 캐시를 비웠습니다. 화면을 새로고침하세요.'; };
  window.__lgWhich = (c) => { c = String(c).toUpperCase();
    return okMap[c] != null ? urlOf(c, nameOf[c] || '', okMap[c]) : (isDead(c) ? '(이미지 없음 · 모노그램)' : '(탐색 전)'); };
} catch (e) { /* window 없는 환경 */ }

/* ── 6. 정밀 검사용 API ─────────────────────────────────────────────────
   저장된 판정을 믿지 않고 실제로 이미지를 받아 본다.
   어느 소스에서 나왔는지, 자기 로고인지 대체(그룹 CI·본주)인지까지 돌려준다. */
export function logoProbe(code, name, opts) {
  const c = String(code || '').toUpperCase();
  const nm = String(name || nameOf[c] || '');
  const timeout = (opts && opts.timeout) || 7000;
  return new Promise((resolve) => {
    if (!c) { resolve({ code: c, name: nm, ok: false, via: 'none' }); return; }
    const order = plan(c, nm);
    let k = 0;
    const step = () => {
      if (k >= order.length) {
        resolve({ code: c, name: nm, ok: false, via: 'none', tried: order.length });
        return;
      }
      const idx = order[k++], url = urlOf(c, nm, idx);
      if (!url) { step(); return; }
      const im = new Image();
      im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      let done = false;
      const bail = () => { if (!done) { done = true; step(); } };
      im.onload = () => {
        if (done) return; done = true;
        if ((im.naturalWidth || 0) < MIN_PX || (im.naturalHeight || 0) < MIN_PX) { step(); return; }
        const via = idx >= SPAC_FLAG ? 'spac' : idx >= FUND_FLAG ? 'fund' : idx >= GROUP_FLAG ? 'group' : idx >= BASE_FLAG ? 'base' : 'own';
        const g = via === 'group' ? groupOf(nm) : via === 'fund' ? fundOf(nm) : via === 'spac' ? spacOf(nm) : null;
        resolve({ code: c, name: nm, ok: true, idx, url, via,
          src: idx % BASE_FLAG, w: im.naturalWidth, h: im.naturalHeight,
          proxy: g ? g[1] : (via === 'base' ? baseCode(c, nm) : '') });
      };
      im.onerror = () => { noteFail(idx); bail(); };
      setTimeout(bail, url.indexOf('/api/') === 0 ? Math.max(timeout, 9000) : timeout);
      im.src = url;
    };
    step();
  });
}
/* 검사 결과를 그대로 캐시에 반영해, 검사 직후부터 화면에 바로 뜨게 한다 */
export function logoApply(res) {
  if (!res || !res.code) return;
  if (res.ok) { okMap[res.code] = res.idx; delete noMap[res.code]; noteWin(res.idx); paint(res.code); }
  else noMap[res.code] = Date.now();
  persist();
}
export const LOGO_SRC_NAMES = ['토스', '네이버', '토스썸네일', '알파스퀘어', '토스(변형)', '네이버(고해상)', '자체 서버 중계'];
export function logoPlanVer() { return PLAN_VER; }

/* ── 7. 일괄 검사용 API ─────────────────────────────────────────────────
   서버 일괄 판정(/api/logoscan) 결과를 캐시에 반영한다.
   중계 URL 로 기록하므로 표시 이미지가 항상 같은 소스에서 나온다(크기 일관). */
export function logoMark(code, tier, name) {
  const c = String(code || '').toUpperCase(); if (!c) return;
  if (name) nameOf[c] = name;
  const f = tier === 'spac' ? SPAC_FLAG : tier === 'fund' ? FUND_FLAG : tier === 'group' ? GROUP_FLAG : tier === 'base' ? BASE_FLAG : 0;
  okMap[c] = f + RELAY; delete noMap[c]; paint(c); persist();
}
export function logoMiss(code) {
  const c = String(code || '').toUpperCase();
  if (c) { noMap[c] = Date.now(); delete okMap[c]; persist(); }
}
export function logoProxies(code, name) {
  const c = String(code || '').toUpperCase(), nm = String(name || nameOf[c] || '');
  const g = groupOf(nm), fd = fundOf(nm), sp = spacOf(nm);
  return { base: baseCode(c, nm) || '', group: (g && g[1] !== c) ? g[1] : '',
           fund: (fd && fd[1] !== c) ? fd[1] : '', spac: (sp && sp[1] !== c) ? sp[1] : '' };
}

/* 검사 3단계 전용 — 중계만 계층 순서로 확인(요청 최대 5회, 소스 6개 순회 안 함) */
export function logoProbeRelay(code, name, timeout) {
  const c = String(code || '').toUpperCase(); const nm = String(name || nameOf[c] || '');
  if (nm) nameOf[c] = nm;
  const tiers = [['own', 0], ['base', BASE_FLAG], ['group', GROUP_FLAG], ['fund', FUND_FLAG], ['spac', SPAC_FLAG]];
  return new Promise((resolve) => {
    let k = 0;
    const step = () => {
      if (k >= tiers.length) { resolve({ code: c, name: nm, ok: false, via: 'none' }); return; }
      const [via, flag] = tiers[k++]; const url = urlOf(c, nm, flag + RELAY);
      if (!url) { step(); return; }
      const im = new Image(); im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      let done = false; const bail = () => { if (!done) { done = true; step(); } };
      im.onload = () => { if (done) return; done = true;
        if ((im.naturalWidth || 0) < MIN_PX) { step(); return; }
        const g = via === 'group' ? groupOf(nm) : via === 'fund' ? fundOf(nm) : via === 'spac' ? spacOf(nm) : null;
        resolve({ code: c, name: nm, ok: true, idx: flag + RELAY, via, src: RELAY,
          proxy: g ? g[1] : (via === 'base' ? baseCode(c, nm) : '') }); };
      im.onerror = bail; setTimeout(bail, timeout || 20000); im.src = url;
    };
    step();
  });
}

export default stockLogo;
