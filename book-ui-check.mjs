/* v17.8.49 호가창 로컬 검증 — /api/book 응답을 목으로 주고 화면을 실제로 그려 본다 */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const ROOT='/workspace/repos/live-stock-v48',PORT=8493;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);
if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('nf');}
res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);});
await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));

const PRICE=14370;
const BOOK_STALE={ok:true,code:'356680',price:14370,ask:14380,bid:14370,prevClose:13530,
  bestAsk:14380,bestBid:14370,spread:10,depthOk:false,rtSrc:'daum',rtTime:'095500',
  sell:[{p:14220,q:106,r:10},{p:14210,q:199,r:19},{p:14200,q:2412,r:100},{p:14190,q:195,r:19},{p:14180,q:21,r:2}],
  buy:[{p:14170,q:273,r:27},{p:14160,q:161,r:16},{p:14150,q:477,r:48},{p:14140,q:120,r:12},{p:14130,q:60,r:6}],
  totalSell:5492,totalBuy:3182,levels:5,at:Date.now()};
const BOOK_OK={...BOOK_STALE,depthOk:true,
  sell:[{p:14390,q:106,r:10},{p:14385,q:199,r:19},{p:14380,q:2412,r:100},{p:14375,q:195,r:19},{p:14370,q:21,r:2}],
  buy:[{p:14365,q:273,r:27},{p:14360,q:161,r:16},{p:14350,q:477,r:48},{p:14340,q:120,r:12},{p:14330,q:60,r:6}]};

const {chromium}=await import('playwright');
const br=await chromium.launch();
const results=[];
const ok=(n,p,d)=>{results.push(p);console.log((p?'PASS':'FAIL')+'  '+n+(d?'  — '+d:''))};

for(const [label,body] of [['stale',BOOK_STALE],['ok',BOOK_OK]]){
  const pg=await br.newPage({viewport:{width:430,height:932},serviceWorkers:'block'});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  pg.on('request',r=>{ if(/book|askprice/.test(r.url())) console.log('NET',r.url()); });
  pg.on('requestfailed',r=>{ if(/book/.test(r.url())) console.log('NETFAIL',r.url(),r.failure()&&r.failure().errorText); });
  await pg.route('**/*',async r=>{
    const u=r.request().url();
    if(/\/api\/book/.test(u))console.log('REQ',u);
    if(u.includes('/api/book'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...body,at:Date.now()})});
    if(u.includes('/api/quote'))return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({ok:true,n:1,quotes:[{code:'356680',name:'엑스게이트',price:14370,change:840,rate:6.21,prevClose:13530,open:13710,high:14990,low:13540,volume:1200730,value:17330000000,marketStatus:'OPEN',time:new Date().toISOString()}]})});
    if(/\/api\//.test(u))return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[],"datas":[],"quotes":[],"indices":[],"fx":[]}'});
    return r.continue();
  });
  await pg.addInitScript(()=>{localStorage.setItem('session',JSON.stringify('tester'));localStorage.setItem('accounts',JSON.stringify({tester:{pass:'x',name:'테스터'}}));
    localStorage.setItem('user:tester',JSON.stringify({cash:5000000,holdings:[{code:'356680',qty:10,avg:13000}],watchlist:['356680'],tradeLog:[],bookOrders:[],acctBooks:{a1:{cash:5000000,holdings:[{code:'356680',qty:10,avg:13000}],tradeLog:[]}},acctList:[{id:'a1',type:'general',name:'일반'}],acctActive:'a1',acctType:'general'}));
    localStorage.setItem('settings',JSON.stringify({orderPass:false,realHours:true}));});
  await pg.goto('http://127.0.0.1:'+PORT+'/index.html',{waitUntil:'load'});
  await pg.waitForFunction(()=>!!(window.__diag&&window.__diag.openTrade),null,{timeout:30000});
  await pg.evaluate(()=>{document.querySelectorAll('.overlay').forEach(o=>o.hidden=true);const b=document.getElementById('bootGate');if(b)b.remove();document.body.classList.remove('locked','booting','needs-auth');});
  await pg.evaluate(()=>window.__diag.openTrade('356680'));
  await pg.waitForTimeout(2000);
  await pg.evaluate(()=>{ const b=document.getElementById('dBuyEntry'); if(b)b.click(); });
  await pg.waitForTimeout(4000);
  const info=await pg.evaluate(()=>{
    const body=document.getElementById('orderBookBody');    const txt=body?body.innerText:'';
    const ask=body&&body.querySelector('.ob-rt-r.ask b')?body.querySelector('.ob-rt-r.ask b').textContent:'';
    const bid=body&&body.querySelector('.ob-rt-r.bid b')?body.querySelector('.ob-rt-r.bid b').textContent:'';
    const badge=body&&body.querySelector('.ob-badge')?body.querySelector('.ob-badge').textContent:'';
    const hint=document.getElementById('priceHint')?document.getElementById('priceHint').textContent:'';
    const live=document.getElementById('orderBookLive')?document.getElementById('orderBookLive').textContent:'';
    return {ask,bid,badge,hint,live,hasRt:txt.includes('매도1'),rows:body?body.querySelectorAll('.ob-r').length:0,html:body?body.innerHTML.slice(0,120):''};
  });
  console.log(`[${label}]`,JSON.stringify(info));
  ok(`[${label}] 실시간 매도1·매수1 표시`, info.ask.replace(/\D/g,'')==='14380'&&info.bid.replace(/\D/g,'')==='14370', `${info.ask}/${info.bid}`);
  ok(`[${label}] 주문가격 보조문구가 같은 값`, /14,380/.test(info.hint)&&/14,370/.test(info.hint), info.hint.slice(0,60));
  if(label==='stale') ok('[stale] 지연 배지 표시', /지연/.test(info.badge), info.badge.slice(0,30));
  else ok('[ok] 지연 배지 없음', !info.badge, info.badge);
  ok(`[${label}] 앱 예외 없음`, errs.length===0, errs.join('|'));
  if(label==='stale'){
    await pg.evaluate(()=>{ document.querySelectorAll('.overlay,.upd-overlay,#permGate,#permBanner').forEach(o=>o.remove()); });
    await pg.waitForTimeout(400);
    const el=await pg.$('#orderBookBody');
    if(el) await el.screenshot({path:'/workspace/screenshots/live-17849-book-v3.png'});
    const pane=await pg.$('.order-book-pane');
    if(pane) await pane.screenshot({path:'/workspace/screenshots/live-17849-pane-v3.png'});
  }
  await pg.close();
}
await br.close();srv.close();
console.log(results.every(Boolean)?'\nBOOK UI PASSED':'\nBOOK UI FAILED');
