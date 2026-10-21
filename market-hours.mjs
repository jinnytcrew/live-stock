/* LIVE증권 국내주식 거래 세션의 단일 기준표 (한국시간, 정규 영업일)
 * KRX 애프터마켓(2026-09-14 시행)과 기존 시간외 단일가 폐지를 반영한다.
 * orderable: 주문 접수 가능 / tradable: 해당 세션의 실제 체결 진행 중
 * 화면 배지·상단 시장 상태·거래시간표·주문창은 이 모듈을 공통 참조한다.
 */
export const KRS = Object.freeze({
  PRE_CLOSE: '장전 시간외 종가',
  PRE_AUC: '장 시작 동시호가',
  REG: '정규장',
  CLOSE_AUC: '장 마감 동시호가',
  AFT_CLOSE_ORDER: '장후 시간외 종가 주문접수',
  AFT_CLOSE: '장후 시간외 종가',
  AFT_MARKET: '애프터마켓',
  NONE: ''
});

const minute = (h, m) => h * 60 + m;
const second = (h, m, s = 0) => h * 3600 + m * 60 + s;

/* 시간 특례일에는 판정뿐 아니라 모든 화면의 설명 시각도 같은 분만큼 조정한다. */
export function shiftMarketClockText(value, shiftMinutes = 0) {
  const shift = Number(shiftMinutes) || 0;
  if (!shift) return String(value ?? '');
  return String(value ?? '').replace(/(?<!\d)(\d{2}):(\d{2})(?!\d)/g, (_m, hh, mm) => {
    const total = ((Number(hh) * 60 + Number(mm) + shift) % 1440 + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
}
const emptyKrx = () => ({ open: false, phase: KRS.NONE, tradable: false, orderable: false, alsoAuction: false });
const emptyNxt = () => ({ open: false, phase: '', tradable: false, orderable: false, limitOnly: false });

export function getMarketHoursState({ hm = 0, hms = hm * 60, day = true } = {}) {
  const out = {
    hm, hms, day,
    krx: emptyKrx(),
    nxt: emptyNxt(),
    nxtClosing: { phase: '종가매매', orderable: false, tradable: false }
  };
  if (!day) return out;

  // KRX 장전 시간외종가와 장 시작 동시호가의 접수 시간은 08:30부터 겹친다.
  if (hm >= minute(8, 30) && hm < minute(8, 40)) {
    out.krx = { open: false, phase: KRS.PRE_CLOSE, tradable: true, orderable: true, alsoAuction: true };
  } else if (hm >= minute(8, 40) && hm < minute(9, 0)) {
    out.krx = { open: false, phase: KRS.PRE_AUC, tradable: false, orderable: true, alsoAuction: false };
  } else if (hm >= minute(9, 0) && hm < minute(15, 20)) {
    out.krx = { open: true, phase: KRS.REG, tradable: true, orderable: true, alsoAuction: false };
  } else if (hm >= minute(15, 20) && hm < minute(15, 30)) {
    out.krx = { open: true, phase: KRS.CLOSE_AUC, tradable: false, orderable: true, alsoAuction: false };
  } else if (hm >= minute(15, 30) && hm < minute(15, 40)) {
    out.krx = { open: false, phase: KRS.AFT_CLOSE_ORDER, tradable: false, orderable: true, alsoAuction: false };
  } else if (hm >= minute(15, 40) && hm < minute(16, 0)) {
    out.krx = { open: false, phase: KRS.AFT_CLOSE, tradable: true, orderable: true, alsoAuction: false };
  } else if (hm >= minute(16, 0) && hm < minute(20, 0)) {
    out.krx = { open: false, phase: KRS.AFT_MARKET, tradable: true, orderable: true, alsoAuction: false };
  }

  // NXT: 프리 08:00~08:50, 메인 09:00:30~15:20, 애프터 체결 15:40~20:00.
  if (hms >= second(8, 0) && hms < second(8, 50)) {
    out.nxt = { open: false, phase: '프리마켓', tradable: true, orderable: true, limitOnly: true };
  } else if (hms >= second(9, 0, 30) && hms < second(15, 20)) {
    out.nxt = { open: true, phase: '메인마켓', tradable: true, orderable: true, limitOnly: false };
  } else if (hms >= second(15, 30) && hms < second(15, 40)) {
    out.nxt = { open: false, phase: '애프터마켓 주문접수', tradable: false, orderable: true, limitOnly: true };
  } else if (hms >= second(15, 40) && hms < second(20, 0)) {
    out.nxt = { open: false, phase: '애프터마켓', tradable: true, orderable: true, limitOnly: true };
  }

  // NXT 종가매매는 별도 세션이다: 호가 접수 15:00~16:00, 체결 15:30~16:00.
  if (hms >= second(15, 0) && hms < second(16, 0)) {
    out.nxtClosing = { phase: '종가매매', orderable: true, tradable: hms >= second(15, 30) };
  }
  return out;
}

/* NXT 단독 실행창 판정: NXT에서 실제 체결 중이고 KRX는 실제 체결 중이 아닐 때만 true.
 * KRX 장후 종가(15:40~16:00)와 KRX/NXT 애프터(16:00~20:00)가 겹치는 구간을 NXT 단독으로 잘못 분류하지 않는다. */
export function isNxtOnlyExecutionWindow({ hm = 0, hms = hm * 60, day = true } = {}) {
  if (!day) return false;
  const s = getMarketHoursState({ hm, hms, day });
  return !!((s.nxt.tradable || s.nxtClosing.tradable) && !s.krx.tradable);
}

const detail = (label, tone, title) => [label, tone, title];

/* 거래소별 상태와 겹치는 세션까지 반영한 가격/종목 배지. */
export function getMarketBadgeInfo({ hm = 0, hms = hm * 60, day = true, hasNxt = false, krxAfterEligible = true } = {}) {
  const s = getMarketHoursState({ hm, hms, day });
  if (!day) return detail('휴장', 'hol', '주말·공휴일에는 KRX와 NXT가 모두 휴장합니다.');
  const k = s.krx, n = s.nxt, c = s.nxtClosing;

  if (hasNxt && n.phase === '프리마켓') {
    if (k.phase === KRS.PRE_CLOSE) return detail('KRX 장전·NXT 프리', 'uni', '08:30~08:40 KRX 장전 시간외종가 체결 및 장 시작 동시호가 접수, NXT 프리마켓 실시간 체결이 함께 진행됩니다.');
    if (k.phase === KRS.PRE_AUC) return detail('KRX 동시·NXT 프리', 'uni', '08:40~08:50 KRX 시가 동시호가 주문 접수와 NXT 프리마켓 체결이 함께 진행됩니다.');
    return detail('NXT 프리', 'nxt', 'NXT 프리마켓 실시간 접속매매(08:00~08:50).');
  }

  if (hasNxt && n.phase === '메인마켓') {
    if (c.orderable) return detail('KRX·NXT 정규·종가접수', 'uni', 'KRX 정규 접속매매와 NXT 메인마켓이 진행 중이며, NXT 종가매매는 15:00~16:00 주문 접수·15:30~16:00 체결입니다.');
    return detail('KRX·NXT 정규', 'uni', hms < second(9, 0, 30)
      ? 'KRX 정규장 접속매매는 09:00에 시작했고 NXT 메인마켓은 09:00:30에 시작합니다.'
      : 'KRX 정규장(09:00~15:20)과 NXT 메인마켓(09:00:30~15:20)이 운영 중입니다.');
  }

  if (k.phase === KRS.PRE_CLOSE) return detail('KRX 장전종가', 'krx', 'KRX 장전 시간외종가 체결 중(08:30~08:40). 장 시작 동시호가 주문도 함께 접수합니다.');
  if (k.phase === KRS.PRE_AUC) return detail('KRX 동시호가', 'krx', 'KRX 장 시작 동시호가 주문 접수 중(08:30~09:00).');
  if (k.phase === KRS.REG && c.orderable && hasNxt) return detail('KRX·NXT 정규·종가접수', 'uni', 'KRX 정규 접속매매 중이며 NXT 종가매매 주문 접수(15:00~16:00)가 진행 중입니다.');
  if (k.phase === KRS.REG) return detail('KRX 정규장', 'krx', 'KRX 정규장 접속매매(09:00~15:20). NXT 메인마켓은 09:00:30에 시작합니다.');
  if (k.phase === KRS.CLOSE_AUC && hasNxt && c.orderable) return detail('KRX 마감·NXT 종가접수', 'uni', '15:20~15:30 KRX 장 마감 동시호가와 NXT 종가매매 주문 접수가 함께 진행됩니다.');
  if (k.phase === KRS.CLOSE_AUC) return detail('KRX 마감호가', 'krx', 'KRX 장 마감 동시호가(15:20~15:30).');
  if (k.phase === KRS.AFT_CLOSE_ORDER && hasNxt) return detail('KRX 종가접수·NXT 종가', 'uni', '15:30~15:40 KRX 장후 시간외종가 주문 접수, NXT 종가매매 체결, NXT 애프터마켓 주문 접수가 함께 진행됩니다. NXT 애프터 체결은 15:40부터입니다.');
  if (k.phase === KRS.AFT_CLOSE_ORDER) return detail('KRX 종가접수', 'krx', 'KRX 장후 시간외종가 주문 접수(15:30~16:00). 실제 체결은 15:40부터입니다.');
  if (k.phase === KRS.AFT_CLOSE && hasNxt) return detail('KRX 종가·NXT 종가/애프터', 'uni', '15:40~16:00 KRX 시간외종가, NXT 종가매매, NXT 애프터마켓이 겹치는 시간입니다.');
  if (k.phase === KRS.AFT_CLOSE) return detail('KRX 시간외종가', 'krx', 'KRX 당일 종가 고정 체결(15:40~16:00).');

  if (hasNxt && n.phase === '애프터마켓 주문접수') return detail('NXT 애프터 접수', 'nxt', 'NXT 애프터마켓 호가 접수(15:30~15:40). 실제 애프터 체결은 15:40부터이며 종가매매 체결은 별도로 진행 중입니다.');
  if (hasNxt && n.phase === '애프터마켓') {
    if (k.phase === KRS.AFT_MARKET) {
      if (krxAfterEligible) return detail('KRX·NXT 애프터', 'uni', 'KRX와 NXT 애프터마켓이 16:00~20:00 실시간 접속매매로 운영 중입니다. 종목별 거래 제한이 적용될 수 있습니다.');
      return detail('NXT 애프터', 'nxt', '이 종목은 KRX 애프터 대상에서 제외되어 NXT 애프터마켓에서만 거래할 수 있습니다(15:40~20:00).');
    }
    return detail('NXT 애프터', 'nxt', 'NXT 애프터마켓 실시간 접속매매(15:40~20:00).');
  }

  if (k.phase === KRS.AFT_MARKET) {
    return krxAfterEligible
      ? detail('KRX 애프터', 'krx', 'KRX 애프터마켓 실시간 접속매매(16:00~20:00). 시간외 단일가 매매는 폐지됐습니다.')
      : detail('KRX 애프터 제외', 'post', '이 종목은 KRX 애프터마켓 거래 대상에서 제외되어 이 시장에서는 거래할 수 없습니다.');
  }
  if (hasNxt && c.orderable) return detail(c.tradable ? 'NXT 종가매매' : 'NXT 종가접수', 'nxt', c.tradable ? 'NXT 종가매매 체결(15:30~16:00).' : 'NXT 종가매매 주문 접수(15:00~16:00). 실제 체결은 15:30부터입니다.');
  if (hm < minute(8, 0)) return detail('장 시작 전', 'prem', 'NXT 프리마켓은 08:00, KRX 주문 접수는 08:30에 시작합니다.');
  if (hm >= minute(20, 0)) return detail('장 종료', 'post', 'KRX·NXT 애프터마켓이 20:00에 종료됐습니다.');
  return detail('거래 대기', 'post', '현재 시각에는 이 종목의 거래소 세션이 진행되지 않습니다.');
}


/* NXT 공식 편입 명단이 아직 도착하지 않은 종목을 KRX 전용이라고 오인 표시하지 않는다. */
export function qualifyPendingNxtBadge(badge, { hm = 0, day = true, pending = false } = {}) {
  if (!pending || !day || hm < minute(8, 0) || hm >= minute(20, 0)) return badge;
  const [label, tone, title] = badge || ['거래소 확인 중', 'post', ''];
  const compact = {
    '장 시작 전': 'NXT 확인 중',
    'KRX 장전종가': 'KRX 장전 · NXT 확인',
    'KRX 동시호가': 'KRX 동시 · NXT 확인',
    'KRX 정규장': 'KRX 정규 · NXT 확인',
    'KRX 마감호가': 'KRX 마감 · NXT 확인',
    'KRX 종가접수': 'KRX 종가접수 · NXT 확인',
    'KRX 시간외종가': 'KRX 종가 · NXT 확인',
    'KRX 애프터': 'KRX 애프터 · NXT 확인',
    'KRX 애프터 제외': 'KRX 애프터제외 · NXT 확인',
    '거래 대기': '거래소 확인 중'
  };
  const nextLabel = compact[label] || `${label} · NXT 확인`;
  return [nextLabel, tone, `${title || ''} NXT 공식 편입 명단 확인 중 — 확정 전에는 NXT 가능 종목으로 간주하지 않습니다.`.trim()];
}

/* 상단 시장 상태와 홈 '오늘의 장'에서 공유하는 시간 요약. */
export function getMarketSessionSummary({ hm = 0, hms = hm * 60, day = true } = {}) {
  const s = getMarketHoursState({ hm, hms, day });
  if (!day) return { label: '휴장', sub: '주말·공휴일 · KRX와 NXT 모두 휴장', tone: 'off' };
  const k = s.krx, n = s.nxt, c = s.nxtClosing;
  if (k.phase === KRS.PRE_CLOSE) return { label: 'KRX 장전 시간외종가 · NXT 프리마켓', sub: '08:30~08:40 KRX 전일 종가 고정 체결 및 장 시작 동시호가 접수 · NXT 프리마켓 실시간 체결', tone: 'pre' };
  if (k.phase === KRS.PRE_AUC) return { label: n.phase === '프리마켓' ? 'KRX 동시호가 · NXT 프리마켓' : 'KRX 장 시작 동시호가', sub: 'KRX 08:30~09:00 시가 단일가 주문 접수' + (n.phase === '프리마켓' ? ' · NXT 프리마켓은 08:50 종료' : ' · NXT 메인마켓은 09:00:30 시작'), tone: 'pre' };
  if (k.phase === KRS.REG) {
    if (c.orderable) return { label: 'KRX·NXT 정규 · NXT 종가접수', sub: 'KRX 정규 접속매매(09:00~15:20) · NXT 메인마켓(09:00:30~15:20) · NXT 종가매매 주문 접수(15:00~16:00)', tone: 'on' };
    if (n.phase === '메인마켓') return { label: 'KRX·NXT 정규 거래', sub: 'KRX 정규 접속매매(09:00~15:20) · NXT 메인마켓(09:00:30~15:20)', tone: 'on' };
    return { label: 'KRX 정규장 · NXT 개장 대기', sub: 'KRX 접속매매 중 · NXT 메인마켓은 09:00:30에 개장', tone: 'on' };
  }
  if (k.phase === KRS.CLOSE_AUC) return { label: c.orderable ? 'KRX 마감 동시호가 · NXT 종가접수' : 'KRX 장 마감 동시호가', sub: '15:20~15:30 KRX 종가 결정 · NXT 메인마켓 종료 · NXT 종가매매 주문 접수 중', tone: 'on' };
  if (k.phase === KRS.AFT_CLOSE_ORDER) return { label: 'KRX 종가접수 · NXT 종가체결', sub: 'KRX 시간외종가 주문 접수(15:30~16:00) · NXT 종가매매 체결(15:30~16:00) · NXT 애프터 주문 접수(15:30~15:40)', tone: 'aft' };
  if (k.phase === KRS.AFT_CLOSE) return { label: 'KRX 종가 · NXT 종가/애프터', sub: '15:40~16:00 KRX 시간외종가 및 NXT 종가매매·애프터마켓 체결 · NXT 애프터는 20:00 종료', tone: 'aft' };
  if (k.phase === KRS.AFT_MARKET) return { label: 'KRX·NXT 애프터마켓', sub: '16:00~20:00 실시간 접속매매 · KRX ETF/ETN 등 종목별 제외 대상이 있습니다.', tone: 'aft' };
  if (n.phase === '프리마켓') return { label: 'NXT 프리마켓', sub: '08:00~08:50 실시간 접속매매 · KRX 주문 접수는 08:30부터', tone: 'pre' };
  if (n.phase === '메인마켓') return { label: 'NXT 메인마켓', sub: '09:00:30~15:20 실시간 접속매매', tone: 'on' };
  if (n.phase === '애프터마켓 주문접수') return { label: 'NXT 종가체결 · 애프터 주문접수', sub: 'NXT 종가매매 체결(15:30~16:00) · 애프터 주문 접수(15:30~15:40), 체결은 15:40부터', tone: 'aft' };
  if (n.phase === '애프터마켓') return { label: 'NXT 애프터마켓', sub: '15:40~20:00 실시간 접속매매', tone: 'aft' };
  if (c.orderable) return { label: c.tradable ? 'NXT 종가매매' : 'NXT 종가 주문접수', sub: c.tradable ? '15:30~16:00 KRX 종가 기준 체결' : '15:00~16:00 주문 접수 · 15:30부터 체결', tone: 'aft' };
  if (hm < minute(8, 0)) return { label: '장 시작 전', sub: 'NXT 프리마켓 08:00 · KRX 주문 접수 08:30', tone: 'off' };
  if (hm >= minute(20, 0)) return { label: '장 종료', sub: 'KRX·NXT 애프터마켓 종료 · 다음 영업일 08:00 재개', tone: 'off' };
  return { label: '거래 대기', sub: '현재 거래소별 체결 세션이 진행되지 않습니다.', tone: 'off' };
}


/* 거래소·세션별 주문 유형 정책도 공통 모듈에서 계산한다.
 * orderTypes는 앱이 표시하는 명칭 배열을 받아, UI와 제출 전 검증이 같은 결과를 쓴다.
 */
export function getAllowedOrderTypes({
  exchange = 'KRX', hm = 0, hms = hm * 60, day = true,
  hasNxt = false, nxtSuspended = false, krxAfterEligible = true,
  orderTypes = {}, realHours = true
} = {}) {
  const all = Array.isArray(orderTypes[exchange]) ? orderTypes[exchange] : [];
  if (!realHours) return all.slice();
  const s = getMarketHoursState({ hm, hms, day });
  const k = s.krx, n = s.nxt, c = s.nxtClosing;
  const pick = (items, source = all) => source.filter(t => items.has(t));
  const closeType = 'KRX종가매매';

  if (exchange === 'KRX') {
    if (!k.orderable) return [];
    if (k.phase === KRS.PRE_CLOSE) return all.filter(t => /시간외종가/.test(t) || (k.alsoAuction && /^(보통지정가|시장가)$/.test(t)));
    if (k.phase === KRS.AFT_CLOSE_ORDER || k.phase === KRS.AFT_CLOSE) return all.filter(t => /시간외종가/.test(t));
    if (k.phase === KRS.AFT_MARKET) {
      if (!krxAfterEligible) return [];
      // KRX 애프터마켓은 지정가 유형만: 일반 지정가·최유리·최우선 및 지정가 IOC/FOK.
      return pick(new Set(['보통지정가','최우선','최유리','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK']));
    }
    if (k.phase === KRS.PRE_AUC || k.phase === KRS.CLOSE_AUC) return pick(new Set(['보통지정가','시장가']));
    if (k.phase === KRS.REG) return all.filter(t => !/시간외/.test(t));
    return [];
  }

  if (exchange === 'NXT') {
    if (!hasNxt || nxtSuspended) return [];
    const close = c.orderable ? all.filter(t => t === closeType) : [];
    // 프리마켓: 접속매매는 지정가 계열만. 지원되는 지정가 IOC/FOK도 세션 제한에 맞춰 허용.
    if (n.phase === '프리마켓') {
      return pick(new Set(['보통지정가','최유리','최우선','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK']));
    }
    // 15:30~15:40은 애프터 체결 전 호가 접수 구간: 보통지정가와 별도 종가매매만 받는다.
    if (n.phase === '애프터마켓 주문접수') {
      return [...pick(new Set(['보통지정가'])), ...close];
    }
    // 애프터 실제 체결(15:40~20:00)은 지정가 계열만. 시장가·중간가·스톱은 제외.
    if (n.phase === '애프터마켓') {
      return [...pick(new Set(['보통지정가','최유리','최우선','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK'])), ...close];
    }
    // 종가매매 주문은 15:00부터 접수하되 15:30부터 체결 가능.
    if (c.orderable && !n.orderable) return close;
    if (c.orderable && n.phase === '메인마켓') return [...all.filter(t => t !== closeType), ...close];
    if (n.phase === '메인마켓') return all.filter(t => t !== closeType);
    return [];
  }

  if (exchange === 'SOR') {
    // SOR는 제한 세션에서 KRX/NXT 양쪽이 공통으로 지원하는 안전한 지정가 유형만 노출.
    const limitNames = new Set(['보통지정가','최유리지정가','최우선지정가','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK']);
    const limits = pick(limitNames);
    const nxtLive = hasNxt && !nxtSuspended && n.tradable;
    const krxAfter = k.phase === KRS.AFT_MARKET && krxAfterEligible;
    // NXT 프리·애프터 중 SOR가 라우팅할 때도 시장가/중간가 유형을 우회 허용하지 않는다.
    if (n.phase === '프리마켓') return hasNxt && !nxtSuspended ? limits : [];
    if (n.phase === '애프터마켓 주문접수') return [];
    if (n.phase === '애프터마켓' || k.phase === KRS.AFT_MARKET) return (nxtLive || krxAfter) ? limits : [];
    // 장후 종가 주문/체결 세션은 SOR 접속매매가 아니며, NXT 애프터가 실제 체결 중일 때만 제한적으로 허용.
    if (k.phase === KRS.AFT_CLOSE_ORDER || k.phase === KRS.AFT_CLOSE) return n.phase === '애프터마켓' && nxtLive ? limits : [];
    if (k.phase === KRS.PRE_AUC || k.phase === KRS.CLOSE_AUC) return pick(new Set(['보통지정가','시장가']));
    if (k.phase === KRS.PRE_CLOSE) return hasNxt && !nxtSuspended ? limits : pick(new Set(['보통지정가','시장가']));
    if (k.phase === KRS.REG || n.phase === '메인마켓') return all.slice();
    return [];
  }
  return [];
}
