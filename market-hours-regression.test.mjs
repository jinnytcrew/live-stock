import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  KRS, getMarketHoursState, getMarketBadgeInfo, getMarketSessionSummary,
  getAllowedOrderTypes, shiftMarketClockText, qualifyPendingNxtBadge, isNxtOnlyExecutionWindow
} from './market-hours.mjs';

const at = (h, m, s = 0, day = true) => {
  const hm = h * 60 + m, hms = h * 3600 + m * 60 + s;
  return getMarketHoursState({ hm, hms, day });
};
const badge = (h, m, s = 0, more = {}) => getMarketBadgeInfo({
  hm: h * 60 + m, hms: h * 3600 + m * 60 + s, day: true, ...more
});
const ORDER_TYPES = {
  SOR: ['보통지정가','시장가','최유리지정가','최우선지정가','보통지정가 IOC','시장가 IOC','최유리 IOC','최우선 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK'],
  KRX: ['보통지정가','시장가','조건부지정가','최유리','최우선','중간가','스톱지정가','시간외종가','보통지정가 IOC','시장가 IOC','최유리 IOC','중간가 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK','중간가 FOK'],
  NXT: ['보통지정가','시장가','중간가','스톱지정가','최유리','최우선','KRX종가매매','보통지정가 IOC','시장가 IOC','최유리 IOC','중간가 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK','중간가 FOK']
};
const types = (exchange, h, m, sec = 0, more = {}) => getAllowedOrderTypes({
  exchange, hm: h * 60 + m, hms: h * 3600 + m * 60 + sec,
  day: true, hasNxt: true, orderTypes: ORDER_TYPES, ...more
});

test('KRX morning closing-price session and opening auction overlap only until 08:40', () => {
  assert.equal(at(8, 29).krx.orderable, false);
  assert.equal(at(8, 30).krx.phase, KRS.PRE_CLOSE);
  assert.equal(at(8, 30).krx.alsoAuction, true);
  assert.equal(at(8, 30).krx.tradable, true);
  assert.equal(at(8, 39, 59).krx.phase, KRS.PRE_CLOSE);
  assert.equal(at(8, 40).krx.phase, KRS.PRE_AUC);
  assert.equal(at(8, 40).krx.orderable, true);
  assert.equal(at(8, 59, 59).krx.phase, KRS.PRE_AUC);
  assert.equal(at(9, 0).krx.phase, KRS.REG);
});

test('NXT premarket shuts at 08:50 and main market starts at 09:00:30 exactly', () => {
  assert.equal(at(7, 59, 59).nxt.orderable, false);
  assert.equal(at(8, 0).nxt.phase, '프리마켓');
  assert.equal(at(8, 49, 59).nxt.tradable, true);
  assert.equal(at(8, 50).nxt.orderable, false);
  assert.equal(at(9, 0, 29).nxt.orderable, false);
  assert.equal(at(9, 0, 30).nxt.phase, '메인마켓');
  assert.equal(at(15, 19, 59).nxt.tradable, true);
  assert.equal(at(15, 20).nxt.orderable, false);
});

test('KRX closing auction, time-after close intake, close-price execution and aftermarket endpoints', () => {
  assert.equal(at(15, 20).krx.phase, KRS.CLOSE_AUC);
  assert.equal(at(15, 29, 59).krx.tradable, false);
  assert.equal(at(15, 30).krx.phase, KRS.AFT_CLOSE_ORDER);
  assert.equal(at(15, 30).krx.orderable, true);
  assert.equal(at(15, 30).krx.tradable, false);
  assert.equal(at(15, 39, 59).krx.phase, KRS.AFT_CLOSE_ORDER);
  assert.equal(at(15, 40).krx.phase, KRS.AFT_CLOSE);
  assert.equal(at(15, 40).krx.tradable, true);
  assert.equal(at(16, 0).krx.phase, KRS.AFT_MARKET);
  assert.equal(at(19, 59, 59).krx.orderable, true);
  assert.equal(at(20, 0).krx.orderable, false);
});

test('NXT close-price order intake and trade run as separate session alongside after-market intake/trading', () => {
  assert.equal(at(14, 59, 59).nxtClosing.orderable, false);
  assert.equal(at(15, 0).nxtClosing.orderable, true);
  assert.equal(at(15, 0).nxtClosing.tradable, false);
  assert.equal(at(15, 20).nxtClosing.orderable, true);
  assert.equal(at(15, 30).nxtClosing.tradable, true);
  assert.equal(at(15, 30).nxt.phase, '애프터마켓 주문접수');
  assert.equal(at(15, 39, 59).nxt.tradable, false);
  assert.equal(at(15, 40).nxt.phase, '애프터마켓');
  assert.equal(at(15, 40).nxtClosing.tradable, true);
  assert.equal(at(16, 0).nxtClosing.orderable, false);
  assert.equal(at(20, 0).nxt.orderable, false);
});

test('every cross-market badge boundary includes simultaneous sessions and exact market', () => {
  assert.equal(badge(8, 0, 0, {hasNxt:true})[0], 'NXT 프리');
  assert.equal(badge(8, 30, 0, {hasNxt:true})[0], 'KRX 장전·NXT 프리');
  assert.equal(badge(8, 40, 0, {hasNxt:true})[0], 'KRX 동시·NXT 프리');
  assert.equal(badge(8, 50, 0, {hasNxt:true})[0], 'KRX 동시호가');
  assert.equal(badge(9, 0, 0, {hasNxt:true})[0], 'KRX 정규장');
  assert.equal(badge(9, 0, 30, {hasNxt:true})[0], 'KRX·NXT 정규');
  assert.equal(badge(15, 0, 0, {hasNxt:true})[0], 'KRX·NXT 정규·종가접수');
  assert.equal(badge(15, 0, 0, {hasNxt:false})[0], 'KRX 정규장');
  assert.equal(badge(15, 20, 0, {hasNxt:true})[0], 'KRX 마감·NXT 종가접수');
  assert.equal(badge(15, 30, 0, {hasNxt:true})[0], 'KRX 종가접수·NXT 종가');
  assert.equal(badge(15, 40, 0, {hasNxt:true})[0], 'KRX 종가·NXT 종가/애프터');
  assert.equal(badge(16, 0, 0, {hasNxt:true})[0], 'KRX·NXT 애프터');
  assert.equal(badge(17, 0, 0, {hasNxt:false,krxAfterEligible:false})[0], 'KRX 애프터 제외');
  assert.equal(badge(17, 0, 0, {hasNxt:true,krxAfterEligible:false})[0], 'NXT 애프터');
  assert.match(badge(17, 0, 0, {hasNxt:true,krxAfterEligible:false})[2], /KRX 애프터 대상에서 제외/);
  assert.equal(badge(20, 0, 0, {hasNxt:true})[0], '장 종료');
  assert.equal(getMarketBadgeInfo({hm:600,hms:36000,day:false,hasNxt:true})[0], '휴장');
});

test('home summary uses same session truth and discloses concurrent close-order sessions', () => {
  assert.match(getMarketSessionSummary({hm:480,hms:28800,day:true}).label,/NXT 프리마켓/);
  assert.match(getMarketSessionSummary({hm:600,hms:36000,day:true}).label,/KRX·NXT 정규/);
  assert.match(getMarketSessionSummary({hm:900,hms:54000,day:true}).label,/NXT 종가접수/);
  assert.match(getMarketSessionSummary({hm:920,hms:55200,day:true}).label,/NXT 종가접수/);
  assert.match(getMarketSessionSummary({hm:930,hms:55800,day:true}).label,/NXT 종가체결/);
  assert.match(getMarketSessionSummary({hm:940,hms:56400,day:true}).label,/NXT 종가\/애프터/);
  assert.match(getMarketSessionSummary({hm:960,hms:57600,day:true}).label,/KRX·NXT 애프터/);
  assert.match(getMarketSessionSummary({hm:1200,hms:72000,day:true}).label,/장 종료/);
});

test('KRX order policy: only session-valid order names appear; after-market allows limit order types only', () => {
  const pre = types('KRX',8,35);
  assert.deepEqual(pre,['보통지정가','시장가','시간외종가']);
  const auc = types('KRX',8,55);
  assert.deepEqual(auc,['보통지정가','시장가']);
  const regular = types('KRX',10,0);
  assert.ok(regular.includes('시장가'));
  assert.ok(!regular.includes('시간외종가'));
  const timeAfter = types('KRX',15,35);
  assert.deepEqual(timeAfter,['시간외종가']);
  const after = types('KRX',16,0);
  assert.ok(after.includes('보통지정가 IOC'));
  assert.ok(after.includes('보통지정가 FOK'));
  assert.ok(after.includes('최유리'));
  assert.ok(!after.includes('시장가'));
  assert.ok(!after.includes('시장가 IOC'));
  assert.ok(!after.includes('중간가'));
  assert.ok(!after.includes('시간외종가'));
  assert.deepEqual(types('KRX',16,0,0,{krxAfterEligible:false}),[]);
});

test('NXT order policy: no NXT order when not listed/suspended and no market orders in pre/after', () => {
  assert.deepEqual(types('NXT',8,5),['보통지정가','최유리','최우선','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK']);
  assert.ok(!types('NXT',8,5).includes('시장가'));
  assert.deepEqual(types('NXT',8,55),[]);
  assert.deepEqual(types('NXT',9,0),[]);
  assert.ok(types('NXT',9,0,30).includes('시장가'));
  assert.ok(types('NXT',15,10).includes('KRX종가매매'));
  assert.deepEqual(types('NXT',15,25),['KRX종가매매']);
  assert.deepEqual(types('NXT',15,35),['보통지정가','KRX종가매매']);
  assert.deepEqual(types('NXT',15,45),['보통지정가','최유리','최우선','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK','KRX종가매매']);
  assert.deepEqual(types('NXT',16,10),['보통지정가','최유리','최우선','보통지정가 IOC','최유리 IOC','보통지정가 FOK','최유리 FOK']);
  assert.deepEqual(types('NXT',9,10,0,{hasNxt:false}),[]);
  assert.deepEqual(types('NXT',9,10,0,{nxtSuspended:true}),[]);
});

test('SOR order policy cannot bypass market-specific limit-only restrictions', () => {
  const pre = types('SOR',8,5);
  assert.ok(pre.length>0);
  assert.ok(pre.every(t=>!/(시장가|중간가)/.test(t)));
  const openingAuction = types('SOR',8,55);
  assert.deepEqual(openingAuction,['보통지정가','시장가']);
  const closeOrderIntake = types('SOR',15,35);
  assert.deepEqual(closeOrderIntake,[]);
  const nxtAfter = types('SOR',15,45);
  assert.ok(nxtAfter.includes('보통지정가'));
  assert.ok(!nxtAfter.some(t=>/(시장가|중간가)/.test(t)));
  const after = types('SOR',16,10);
  assert.ok(after.length>0);
  assert.ok(!after.some(t=>/(시장가|중간가)/.test(t)));
});

test('holiday blocks both markets and every order type', () => {
  const h = at(10,0,0,false);
  assert.equal(h.krx.orderable,false);
  assert.equal(h.nxt.orderable,false);
  assert.equal(h.nxtClosing.orderable,false);
  assert.equal(getMarketBadgeInfo({hm:600,hms:36000,day:false,hasNxt:true})[0],'휴장');
  for(const exchange of ['KRX','NXT','SOR']) {
    assert.deepEqual(getAllowedOrderTypes({exchange,hm:600,hms:36000,day:false,hasNxt:true,orderTypes:ORDER_TYPES}),[]);
  }
});

test('special-day clock text shifts every displayed timetable consistently', () => {
  assert.equal(shiftMarketClockText('KRX 09:00~15:20 · NXT 09:00:30~15:20',60), 'KRX 10:00~16:20 · NXT 10:00:30~16:20');
  assert.equal(shiftMarketClockText('NXT 15:40~20:00',60), 'NXT 16:40~21:00');
  assert.equal(shiftMarketClockText('09:00~15:20',0), '09:00~15:20');
});



test('NXT-only price selection does not classify overlapping KRX trading as NXT-only', () => {
  assert.equal(isNxtOnlyExecutionWindow({hm:480,hms:28800,day:true}), true);    // 08:00 NXT pre
  assert.equal(isNxtOnlyExecutionWindow({hm:510,hms:30600,day:true}), false);   // 08:30 KRX/NXT overlap
  assert.equal(isNxtOnlyExecutionWindow({hm:525,hms:31500,day:true}), true);   // 08:45 KRX auction, NXT trades
  assert.equal(isNxtOnlyExecutionWindow({hm:930,hms:55800,day:true}), true);   // 15:30 NXT close execution, KRX not trading
  assert.equal(isNxtOnlyExecutionWindow({hm:940,hms:56400,day:true}), false);  // 15:40 KRX close + NXT aftermarket
  assert.equal(isNxtOnlyExecutionWindow({hm:960,hms:57600,day:true}), false);  // 16:00 both aftermarkets
  assert.equal(isNxtOnlyExecutionWindow({hm:600,hms:36000,day:false}), false);
});

test('unknown NXT eligibility is labelled pending rather than falsely KRX-only during NXT hours', () => {
  assert.equal(qualifyPendingNxtBadge(['KRX 정규장','krx','KRX regular'],{hm:600,day:true,pending:true})[0], 'KRX 정규 · NXT 확인');
  assert.equal(qualifyPendingNxtBadge(['장 시작 전','off','before'],{hm:485,day:true,pending:true})[0], 'NXT 확인 중');
  assert.equal(qualifyPendingNxtBadge(['KRX 애프터 제외','post','excluded'],{hm:1020,day:true,pending:true})[0], 'KRX 애프터제외 · NXT 확인');
  assert.equal(qualifyPendingNxtBadge(['휴장','hol','holiday'],{hm:600,day:false,pending:true})[0], '휴장');
  assert.equal(qualifyPendingNxtBadge(['장 종료','post','closed'],{hm:1200,day:true,pending:true})[0], '장 종료');
});

test('app consumes the shared timetable, badge policy and dynamic order policy instead of old coarse bands', async () => {
  const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(app,/getMarketBadgeInfo, getMarketSessionSummary, getAllowedOrderTypes/);
  assert.match(app,/qualifyPendingNxtBadge/);
  assert.match(app,/isNxtOnlyExecutionWindow/);
  assert.match(app,/const _ks=krSession\(\),on=!!_ks\.krx\.tradable,nx=!!\(_ks\.nxt\.tradable\|\|_ks\.nxtClosing\.tradable\)/);
  assert.match(app,/const matching=!!\(_k\.krx\.tradable\|\|_k\.nxt\.tradable\|\|_k\.nxtClosing\.tradable\)/);
  assert.match(app,/function mktBadgeInfo\(code\)[\s\S]*?getMarketBadgeInfo\(/);
  assert.match(app,/function marketSession\(\)[\s\S]*?getMarketSessionSummary\(/);
  assert.match(app,/function orderTypesForExchange\([\s\S]*?getAllowedOrderTypes\(/);
  assert.match(app,/const allowed=orderTypesForExchange\(ordExchange,s\.code\)/);
  assert.doesNotMatch(app,/hmA>=1080\?'장 종료'/);
  assert.doesNotMatch(app,/else if\(\/프리마켓\|NXT\/.test\(sess\.label\)/);
  assert.match(app,/function krxRegularOpen\(\)\{const k=krSession\(\);return !!\(k\.day&&k\.krx\.phase===KRS\.REG\);\}/);
  assert.match(app,/function nxtOnlyWindow\(\)\{const k=krSession\(\);return isNxtOnlyExecutionWindow/);
  assert.doesNotMatch(app,/window\.__NXTWIN/);
});

test('release versions and cache keys are coherent across client, worker, and service worker', async () => {
  const [html, sw, version, worker] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./sw.js', import.meta.url), 'utf8'),
    readFile(new URL('./version-info.js', import.meta.url), 'utf8'),
    readFile(new URL('./_worker.js', import.meta.url), 'utf8')
  ]);
  assert.match(html,/app\.js\?v=676/);
  assert.match(sw,/v17\.7\.5-premium-stock-ui1/);
  assert.match(version,/version:\s*'17\.7\.5'/);
  assert.match(worker,/var APP_VER = "17\.7\.5"/);
  assert.match(worker,/version: "17\.7\.5"/);
});
