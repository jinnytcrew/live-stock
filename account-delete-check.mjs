/* 계정 탈퇴(delfail) 회귀 검사 — v17.8.35
   실제 _worker.js 를 불러와 /api/accounts 의 signup·sync·login·delete 를 그대로 돌린다.
   KV 의 '최종 일관성'(지운 직후에도 옛 값이 읽히는 성질)을 흉내 내어,
   실제로 지워졌으면 delfail 이 아니라 ok:true 가 나오는지 확인한다.

   실행: node account-delete-check.mjs
*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const SRC = new URL('./_worker.js', import.meta.url).pathname;
const TMP = '/tmp/_worker_delete_check.mjs';
fs.copyFileSync(SRC, TMP);

/* ── KV 모형 ────────────────────────────────────────────────────────────────
   staleReads : delete 직후 이 횟수만큼 옛 값을 그대로 돌려준다(전파 지연 흉내)
   throwOn    : 이 접두사 키의 delete 를 실패시킨다(KV 한도 초과 등 실제 실패)  */
class MockKV {
  constructor(map, opts) {
    this.m = new Map(Object.entries(map || {}));
    this.stale = new Map();          // key -> 옛 값(남은 횟수)
    this.staleReads = (opts && opts.staleReads) || 0;
    this.throwOn = (opts && opts.throwOn) || null;
    this.deleted = [];
    this.puts = 0;
  }
  async get(k, o) {
    if (this.stale.has(k)) {
      const left = this.stale.get(k);
      if (left.n > 0) { this.stale.set(k, { n: left.n - 1, v: left.v }); return parseMaybe(left.v, o); }
      this.stale.delete(k);
    }
    return parseMaybe(this.m.get(k), o);
  }
  async put(k, v) { this.puts++; this.m.set(k, String(v)); }
  async delete(k) {
    if (this.throwOn && String(k).startsWith(this.throwOn)) throw new Error('KV delete() limit exceeded for the day');
    const old = this.m.get(k);
    this.m.delete(k);
    this.deleted.push(k);
    if (old != null && this.staleReads > 0) this.stale.set(k, { n: this.staleReads, v: old });
  }
  async list(o) {
    const prefix = (o && o.prefix) || '';
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
  }
}
function parseMaybe(v, o) {
  if (v == null) return null;
  const json = o === 'json' || (o && o.type === 'json');
  if (!json) return typeof v === 'string' ? v : JSON.stringify(v);
  try { return JSON.parse(v); } catch (e) { return null; }
}

/* 검사마다 워커를 새로 불러온다 — 모듈 안의 인스턴스 캐시(_accCache 등րան)가
   검사 사이에 남아 결과를 흐리지 않게 하고, 실제 '다른 인스턴스'처럼 굴게 한다. */
let inst = 0;
async function freshWorker() {
  const mod = await import(TMP + '?v=' + (++inst) + '&s=' + Date.now());
  assert.ok(typeof mod.default.fetch === 'function', 'fetch 핸들러가 있어야 한다');
  return mod.default.fetch;
}
async function call(wh, kv, body) {
  const req = new Request('https://live-stock.jinnytcrew.workers.dev/api/accounts', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const res = await wh(req, { APP_KV: kv }, { waitUntil() {} });
  return await res.json();
}
const has = (kv, k) => kv.m.has(k);

const PASS_HASH = 's' + crypto.createHash('sha256').update('livejt|TestPass1234!').digest('hex');
let caseNo = 0;
const nextUID = () => 'delcase' + (++caseNo) + 'user';

let pass = 0;
const ok = (name) => { pass++; console.log('  ✔ ' + name); };

/* ── 1. 가입 → 미체결 저장 → 탈퇴: ok:true 이고 두 자리 키가 모두 사라진다 ─── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV();
  const up = await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'deltest@example.com', cash: 1000000 });
  assert.equal(up.ok, true, '가입은 성공해야 한다');
  assert.ok(has(kv, 'live-accounts:acc:' + UID), '계정 주 키가 생겨야 한다');
  assert.ok(has(kv, 'app:acc:' + UID), '반대 접두사 사본도 함께 쓰인다(구조 확인)');
  assert.ok(has(kv, 'live-accounts:usr:' + UID), '사용자 데이터 키가 생겨야 한다');

  /* 미체결 주문 1건 저장 → 미체결 색인에 등록된다 */
  const sy = await call(wh, kv, { action: 'sync', id: UID, pass: PASS_HASH, baseRv: 0,
    user: { cash: 1000000, holdings: [{ code: '005930', qty: 1, avg: 70000 }], tradeLog: [],
      bookOrders: [{ id: 'b1', code: '005930', side: 'buy', qty: 1, price: 60000, acct: 'ac1' }] } });
  assert.equal(sy.ok, true, '동기화는 성공해야 한다');
  const idx0 = JSON.parse(kv.m.get('live-accounts:pendidx') || '{"u":{}}');
  assert.ok(idx0.u && idx0.u[UID], '미체결 주문이 있으면 색인에 올라간다');

  const del = await call(wh, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, true, '실제로 지워졌으면 ok:true 여야 한다(회귀: delfail)');
  assert.equal(del.deleted, UID);
  assert.equal(has(kv, 'live-accounts:acc:' + UID), false, '계정 주 키가 지워져야 한다');
  assert.equal(has(kv, 'app:acc:' + UID), false, '반대 접두사 계정 사본도 지워져야 한다');
  assert.equal(has(kv, 'live-accounts:usr:' + UID), false, '사용자 데이터 키가 지워져야 한다');
  const idx1 = JSON.parse(kv.m.get('live-accounts:pendidx') || '{"u":{}}');
  assert.equal(idx1.u[UID], undefined, '미체결 색인에서 빠져야 한다');
  const mark = JSON.parse(kv.m.get('live-accounts:del:' + UID) || 'null');
  assert.ok(mark && mark.at > 0, '탈퇴 표식이 남아야 한다');
  ok('가입 → 미체결 저장 → 탈퇴: ok:true · 계정/사용자/색인 정리 · 탈퇴 표식');
}

/* ── 2. 전파 지연(지운 직후 옛 값이 읽히는 KV)에서도 ok:true ────────────────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV(null, { staleReads: 2 });
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  const del = await call(wh, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, true, '전파 지연을 삭제 실패로 읽으면 안 된다(이번 버그의 본체)');
  ok('전파 지연 KV: 삭제 직후 재조회가 옛 값을 돌려줘도 ok:true');
}

/* ── 3. 삭제 뒤 되살아나지 않는다 — 낡은 사본이 다시 보여도 로그인 불가 ─────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV();
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  const old = kv.m.get('app:acc:' + UID);          // 탈퇴 전 사본
  const del = await call(wh, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, true);
  kv.m.set('app:acc:' + UID, old);                 // 다른 지역의 낡은 사본이 남아 있는 상황
  kv.m.set('live-accounts:acc:' + UID, old);
  const li = await call(wh, kv, { action: 'login', id: UID, pass: PASS_HASH });
  assert.equal(li.ok, false, '탈퇴한 계정은 사본으로 로그인되지 않아야 한다');
  assert.equal(li.err, 'nouser');
  assert.equal(kv.m.get('app:acc:' + UID), old, '낡은 사본 자체를 건드리지는 않는다');
  const del2 = await call(wh, kv, { action: 'login', id: UID, pass: PASS_HASH });
  assert.equal(del2.ok, false);
  ok('탈퇴 표식: 낡은 사본이 남아도 로그인 차단');
}

/* ── 4. 탈퇴 → 같은 아이디로 재가입은 막지 않는다 ─────────────────────────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV();
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  const del = await call(wh, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, true);
  await new Promise((r) => setTimeout(r, 5));       // created > 표식 시각
  const again = await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '재가입', email: 'a@b.c' });
  assert.equal(again.ok, true, '탈퇴 뒤 재가입은 가능해야 한다');
  const li = await call(wh, kv, { action: 'login', id: UID, pass: PASS_HASH });
  assert.equal(li.ok, true, '재가입한 계정으로는 로그인돼야 한다');
  ok('재가입: 탈퇴 표식이 새 계정을 막지 않는다');
}

/* ── 5. 비밀번호가 틀리면 지우지 않는다(기존 인증 유지) ─────────────────────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV();
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  const bad = await call(wh, kv, { action: 'delete', id: UID, pass: 's' + '0'.repeat(64) });
  assert.equal(bad.ok, false);
  assert.equal(bad.err, 'wrongpass');
  assert.ok(has(kv, 'live-accounts:acc:' + UID), '계정이 남아 있어야 한다');
  assert.ok(has(kv, 'app:acc:' + UID), '사본도 남아 있어야 한다');
  const no = await call(wh, kv, { action: 'delete', id: 'nobody999', pass: PASS_HASH });
  assert.equal(no.err, 'noacct');
  ok('인증: 틀린 비밀번호는 wrongpass · 없는 계정은 noacct — 삭제되지 않음');
}

/* ── 6. 진짜 실패(delete 예외)는 delfail 로 알린다 ──────────────────────────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const kv = new MockKV(null, { throwOn: 'live-accounts:acc:' });
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  const del = await call(wh, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, false, '지우지 못했으면 성공이라고 말하면 안 된다');
  assert.equal(del.err, 'delfail');
  assert.ok(has(kv, 'live-accounts:acc:' + UID), '계정이 그대로 남아야 한다');
  ok('실패 구분: delete() 예외 → delfail · 계정 유지');
}

/* ── 7. 곁다리 기록(친구·알림·클랜)도 함께 지운다 ──────────────────────────── */
{
  const wh = await freshWorker();
  const UID = nextUID();
  const map = {};
  map['live-social:fr:' + UID] = JSON.stringify({ profile: { name: '탈퇴테스트' }, friends: [] });
  map['nxt-universe:push:' + UID] = JSON.stringify([{ endpoint: 'https://x' }]);
  map['nxt-universe:pushst:' + UID] = JSON.stringify({ at: 1 });
  map['live-clans:clan:c1'] = JSON.stringify({ cid: 'c1', code: 'ABC123', name: '테스트클랜', leader: 'other1',
    members: { [UID]: { name: '탈퇴테스트', role: 'sub' }, other1: { name: '리더', role: 'sub' } } });
  const kv = new MockKV(map);
  await call(wh, kv, { action: 'signup', id: UID, pass: PASS_HASH, name: '탈퇴테스트', email: 'a@b.c' });
  /* 클랜 소속을 계정에 적어 둔다(가입 직후 사본에 직접) */
  const acc = JSON.parse(kv.m.get('live-accounts:acc:' + UID));
  acc.clanId = 'c1';
  kv.m.set('live-accounts:acc:' + UID, JSON.stringify(acc));
  kv.m.set('app:acc:' + UID, JSON.stringify(acc));
  const wh2 = await freshWorker();                  // 위에서 바꾼 사본을 KV 에서 읽도록 새 인스턴스
  const del = await call(wh2, kv, { action: 'delete', id: UID, pass: PASS_HASH });
  assert.equal(del.ok, true);
  assert.equal(has(kv, 'live-social:fr:' + UID), false, '친구 프로필이 지워져야 한다');
  assert.equal(has(kv, 'nxt-universe:push:' + UID), false, '알림 구독이 지워져야 한다');
  assert.equal(has(kv, 'nxt-universe:pushst:' + UID), false, '알림 상태가 지워져야 한다');
  const clan = JSON.parse(kv.m.get('live-clans:clan:c1'));
  assert.equal(clan.members[UID], undefined, '클랜 명단에서 빠져야 한다');
  assert.ok(clan.members.other1, '다른 구성원 기록은 남아야 한다');
  assert.equal(clan.leader, 'other1', '리더가 아니면 리더는 그대로');
  ok('곁다리 정리: 친구·알림·클랜 명단에서 내 기록 삭제(남의 기록은 보존)');
}

console.log(`\n계정 탈퇴 검사 ${pass}건 통과`);
