/* v17.8.49 라이브 검증 — 푸시 발송 경로(서버) 왕복 + 라이브 호가 화면 캡처 */
import fs from 'node:fs';
const BASE='https://live-stock.jinnytcrew.workers.dev';
const TEST_ID='qa17849temp';
const out=[]; const ok=(n,p,d)=>{out.push(p);console.log((p?'PASS':'FAIL')+'  '+n+(d?'  — '+d:''))};

/* ── 1) 서버 푸시 경로: 구독 저장 → 실제 발송 시도 ── */
const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const b64u=(b)=>Buffer.from(new Uint8Array(b)).toString('base64url');
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/qa17849-'+Math.random().toString(36).slice(2,12),
  keys:{p256dh:b64u(await crypto.subtle.exportKey('raw',kp.publicKey)),auth:b64u(crypto.getRandomValues(new Uint8Array(16)))}};
const r1=await fetch(BASE+'/api/push?act=sub',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({id:TEST_ID,sub,ua:'qa-17849'})}).then(r=>r.json());
ok('구독 저장(서버)',!!(r1&&r1.ok),JSON.stringify(r1));
const r2=await fetch(BASE+'/api/push?act=test',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({id:TEST_ID})}).then(r=>r.json());
console.log('  발송 결과',JSON.stringify(r2));
ok('발송 경로 실행·구독 인식(sent/total)',r2&&r2.total>0,'total='+(r2&&r2.total));
const st=(r2&&(r2.status||r2.detail))||'';
ok('FCM 이 VAPID 서명을 거부하지 않음(401/403 아님)',!/401|403/.test(JSON.stringify(r2)),String(st).slice(0,80));

/* ── 2) 라이브 화면 — 호가·현재가 일치 캡처 ── */
const {chromium}=await import('playwright');
const br=await chromium.launch();
const pg=await br.newPage({viewport:{width:430,height:932}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(BASE+'/',{waitUntil:'load'});
await pg.waitForFunction(()=>!!(window.__diag&&window.__diag.openTrade),null,{timeout:45000});
await pg.evaluate(()=>window.__diag.openTrade('356680'));
await pg.waitForTimeout(2500);
await pg.evaluate(()=>{const b=document.getElementById('dBuyEntry');if(b)b.click();});
await pg.waitForTimeout(6000);
await pg.evaluate(()=>{document.querySelectorAll('.overlay,.upd-overlay,#permGate,#permBanner,.ask-ov,#bootGate,#authGate,.boot-gate').forEach(o=>o.remove());document.body.classList.remove('locked','booting','needs-auth');document.documentElement.classList.remove('booting','locked');});
await pg.waitForTimeout(300);
const book=await pg.evaluate(()=>{
  const b=document.getElementById('orderBookBody');
  const g=(s)=>{const e=b&&b.querySelector(s);return e?e.textContent:'';};
  return {ask:g('.ob-rt-r.ask b'),bid:g('.ob-rt-r.bid b'),px:(()=>{const l=b?b.querySelectorAll('.ob-rt-m b'):[];return l.length?l[l.length-1].textContent:'';})(),
    hint:document.getElementById('priceHint')?document.getElementById('priceHint').textContent:'',
    head:document.getElementById('orderStockPrice')?document.getElementById('orderStockPrice').textContent:'',
    badge:b&&b.querySelector('.ob-badge')?b.querySelector('.ob-badge').textContent:'',
    rows:b?b.querySelectorAll('.ob-r').length:0, live:document.getElementById('orderBookLive')?document.getElementById('orderBookLive').textContent:''};
});
console.log('[live book]',JSON.stringify(book));
const num=s=>+(String(s).replace(/[^\d]/g,'')||0);
const a=num(book.ask),bb=num(book.bid),p=num(book.px||book.head);
ok('매도1 ≥ 현재가 ≥ 매수1 (한 스냅샷 일치)',a>=p&&p>=bb&&a>0,`ask ${book.ask} / now ${book.px||book.head} / bid ${book.bid}`);
ok('주문가격 보조문구가 같은 호가',book.hint.includes(book.ask)&&book.hint.includes(book.bid),book.hint.slice(0,70));
ok('호가 LIVE 표기',/LIVE/.test(book.live),book.live);
ok('앱 예외 없음',errs.length===0,errs.join('|').slice(0,100));
await pg.evaluate(()=>{const g=document.getElementById('bootGate');if(g){g.style.display='none';g.remove();}
 const st=document.getElementById('bootCss'); if(st)st.remove();});
await pg.waitForTimeout(600);
const pane=await pg.$('.order-book-pane');
if(pane)await pane.screenshot({path:'/workspace/screenshots/live-17849-book-live.png'});
await pg.screenshot({path:'/workspace/screenshots/live-17849-screen-live.png'});
await br.close();

/* ── 3) 테스트 구독 정리 ── */
const un=await fetch(BASE+'/api/push?act=unsub',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({id:TEST_ID,endpoint:sub.endpoint})}).then(r=>r.json()).catch(()=>null);
console.log('[cleanup] unsub',JSON.stringify(un));
console.log(out.every(Boolean)?'\nLIVE VERIFY PASSED':'\nLIVE VERIFY: see FAILs');
