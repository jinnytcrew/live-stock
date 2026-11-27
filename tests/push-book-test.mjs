#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════
   LIVE증권 v17.8.49 회귀 검사 — tests/push-book-test.mjs
   실행: node tests/push-book-test.mjs

   검사하는 것 (둘 다 2026-11-27 사용자 제보로 드러난 실제 고장)
     ① 웹 푸시 암호화(RFC 8291 / aes128gcm)와 VAPID 서명(RFC 8292)
        — _worker.js 의 실제 함수 본문을 그대로 떼어 내 실행하고, 규격대로
          직접 복호화·서명검증 해 본다. '보냈다'가 아니라 '열리는가'를 본다.
     ② /api/book 의 호가-현재가 일치 판정
        — 실시간 최우선 호가와 지연 깊이가 어긋날 때 depthOk=false 가 되는지,
          맞을 때는 true 인지, bestAsk/bestBid 가 실시간 값인지 소스로 확인한다.
   ══════════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const worker = fs.readFileSync(path.join(root, '_worker.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pass = (m) => console.log('PASS  ' + m);

/* ── ① 워커의 푸시 함수 본문을 그대로 떼어 온다 ───────────────────────────── */
const startAt = worker.indexOf('function b64uToBytes');
const endAt = worker.indexOf('const _pushTest =');
assert.ok(startAt > 0 && endAt > startAt, '푸시 암호화 함수 블록을 찾을 수 있다');
const src = worker.slice(startAt, endAt);

const ctx = vm.createContext({
  crypto: globalThis.crypto, atob: globalThis.atob, btoa: globalThis.btoa,
  TextEncoder: globalThis.TextEncoder, Uint8Array, DataView, setTimeout, clearTimeout, console
});
vm.runInContext(src + '\n;globalThis.__api={encryptPayload,vapidGenerate,vapidAuth,b64uToBytes,bytesToB64u,cat,utf8,hmac,hkdf};', ctx);
const { encryptPayload, vapidGenerate, vapidAuth, b64uToBytes, bytesToB64u, cat, utf8, hkdf } = ctx.__api;

const b64u = (buf) => bytesToB64u(new Uint8Array(buf));

/* 구독자(브라우저) 쪽 키쌍 — 실제 PushSubscription 이 들고 있는 값과 같은 모양 */
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));

const payload = JSON.stringify({ title: 'LIVE증권 · 체결', body: '삼성전자 매수 10주 · 171,000원 체결', code: '005930', level: 2 });
const body = await encryptPayload(b64u(uaPub), b64u(authSecret), payload);

/* ── 머리말 해석: salt(16) | rs(4) | idlen(1) | keyid(asPub) | 암호문 ── */
assert.ok(body.length > 16 + 4 + 1 + 65, 'aes128gcm 본문 길이가 머리말보다 크다');
const salt = body.slice(0, 16);
const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
assert.equal(rs, 4096, 'record size 는 4096');
const idlen = body[20];
assert.equal(idlen, 65, 'keyid 길이는 비압축 P-256 점(65바이트)');
const asPub = body.slice(21, 21 + idlen);
const ct = body.slice(21 + idlen);

/* ── 수신 측 복호화 (RFC 8291 3.3~3.5) ── */
const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const ikm = await hkdf(authSecret, shared, cat(utf8('WebPush: info'), new Uint8Array([0]), uaPub, asPub), 32);
const cek = await hkdf(salt, ikm, cat(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
const nonce = await hkdf(salt, ikm, cat(utf8('Content-Encoding: nonce'), new Uint8Array([0])), 12);
const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ct));
assert.equal(plain[plain.length - 1], 2, '마지막 조각 표시(0x02)가 있다');
const text = new TextDecoder().decode(plain.slice(0, plain.length - 1));
assert.equal(text, payload, '복호화한 본문이 보낸 내용과 같다');
pass('aes128gcm 암호화 → 규격대로 복호화 성공(본문 일치)');

/* ── VAPID 서명 검증 ── */
const v = await vapidGenerate();
assert.ok(v.publicKey && v.privateJwk, 'VAPID 키를 만든다');
const auth = await vapidAuth(v.privateJwk, v.publicKey, 'https://fcm.googleapis.com', 'mailto:2026livestock@gmail.com');
assert.match(auth, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/, 'VAPID 헤더 형식(vapid t=…, k=…)');
const jwt = auth.slice('vapid t='.length, auth.indexOf(', k='));
const [h, p, s] = jwt.split('.');
const hdr = JSON.parse(new TextDecoder().decode(b64uToBytes(h)));
const clm = JSON.parse(new TextDecoder().decode(b64uToBytes(p)));
assert.equal(hdr.alg, 'ES256', 'JWT 헤더 alg=ES256');
assert.equal(hdr.typ, 'JWT', 'JWT 헤더 typ=JWT');
assert.equal(clm.aud, 'https://fcm.googleapis.com', 'JWT aud 는 푸시 서비스 origin');
assert.ok(clm.exp > Math.floor(Date.now() / 1000) + 3600, 'JWT exp 는 1시간 이상 남는다');
assert.equal(clm.sub, 'mailto:2026livestock@gmail.com', 'JWT sub 전달');
const vk = await crypto.subtle.importKey('raw', b64uToBytes(v.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
const okSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk, b64uToBytes(s), utf8(h + '.' + p));
assert.ok(okSig, 'VAPID JWT 서명이 공개키로 검증된다');
assert.equal(auth.slice(auth.indexOf(', k=') + 4), v.publicKey, 'k= 에 공개키가 실린다');
pass('VAPID JWT(ES256) — 공개키로 서명 검증 성공, aud·exp·sub 정확');

/* ── 서버 쪽 저장/읽기 경로가 실제로 연결되어 있는지(정적 검사) ── */
assert.match(worker, /async function blobStore\(\)[\s\S]{0,1600}getStoreX\(\{ name: "nxt-universe" \}, _ENV\)/,
  'blobStore 는 실제 저장소(getStoreX)를 돌려준다 — 예전 undefined shim 이 아니다');
assert.match(worker, /async function stJSONGet[\s\S]{0,400}JSON\.parse/, 'KV 문자열을 JSON 으로 되돌리는 경로가 있다');
assert.match(worker, /async function pushVapid\(st\)[\s\S]{0,300}stJSONGet\(st, "push:vapid"\)/, 'VAPID 키를 파싱해 읽는다(매번 새로 만들지 않는다)');
assert.match(worker, /async function pushSubsOf\(st, id\)[\s\S]{0,200}stJSONGet/, '구독 목록을 파싱해 읽는다');
assert.match(worker, /await afPushUser\(rec\.uid,/, '크론(afRun)이 체결 시 푸시를 보낸다');
assert.match(worker, /"book": book_default/, '/api/book 라우트가 등록되어 있다');
pass('blobStore·KV 파싱·크론 푸시·/api/book 등록 — 서버 경로가 실제로 이어져 있다');

/* ── ② /api/book 의 일치 판정 규칙 ── */
assert.match(worker, /const depthOk = !!\(sell\.length \|\| buy\.length\) && \(rt \? \(near\(nvAsk, ask\) && near\(nvBid, bid\)\) : true\)/,
  '깊이 일치 판정: 실시간 최우선 호가와 1~2호가 안일 때만 depthOk');
assert.match(worker, /bestAsk: ask, bestBid: bid/, 'bestAsk/bestBid 는 실시간 값(시장가 체결가 기준)');
assert.match(worker, /const near = \(a, b\) => \(a == null \|\| b == null\) \? false : Math\.abs\(a - b\) <= tk \* 2;/,
  '일치 폭은 호가단위 2칸');
/* 일치 판정을 실제로 계산해 본다 — 순수 함수로 같은 식을 세워 확인 */
const tk = 10;                     // 14,000~20,000 구간 호가단위
const near = (a, b) => (a == null || b == null) ? false : Math.abs(a - b) <= tk * 2;
assert.equal(near(14220, 14180), false, '200원 벌어진 지연 호가(사용자 영상)는 불일치로 판정');
assert.equal(near(14370, 14380), true, '한 호가 차이는 같은 순간으로 판정');
assert.equal(near(14370, 14430), false, '6호가 차이는 불일치');
pass('/api/book 일치 판정 — 영상의 200원 괴리는 불일치로 걸러진다');

/* ── ③ 클라이언트가 안드로이드에서도 알림을 띄우는 경로인지 ── */
assert.match(app, /async function notifyNative\(/, '통합 알림 함수가 있다');
assert.match(app, /await reg\.showNotification\(title,o\)/, '서비스 워커 showNotification 을 먼저 쓴다(안드로이드 크롬 대응)');
const bare = (app.match(/try\{ new Notification\(/g) || []).length;
assert.ok(bare <= 2, `맨 new Notification 호출은 대체 경로에만 남는다(현재 ${bare}곳)`);
assert.ok((app.match(/notifyNative\(/g) || []).length >= 6, '모든 알림 종류가 통합 경로를 쓴다');
assert.match(app, /if\(Notification\.permission==='granted'\)notifyOk=true/, '이미 허용된 사용자는 시작 시 notifyOk 가 켜진다');
assert.match(sw, /type==='set-uid'/, '서비스 워커가 계정 id 를 받아 둔다');
assert.match(sw, /const uid = await swIdGet\(\)/, '구독 자동 갱신 때 id 를 실어 보낸다');
pass('알림 표시 경로 — 서비스 워커 우선 + 안드로이드 대응 + 구독 갱신 id');

console.log('\nPUSH/BOOK QA PASSED (오프라인 검사: 암호화·서명·판정 규칙·경로 연결)');
