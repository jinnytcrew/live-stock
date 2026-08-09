

/* ===== 고급 서비스: 실시간 급등주 예측 =====
   증권사·전문가가 공개한 대표 조건검색식을 참고해 3종 전략을 구성했다.
   실시간 시세(등락률·거래대금·고저 대비 위치)와 일봉(이평·신고가)을 함께 사용한다.
   ※ 규칙 기반 추정이며 미래 수익을 보장하지 않는다. */
const SURGE_STRATS=[
  {id:'flow', name:'세력 유입형', sub:'거래대금 급증 + 고가권 마감',
   desc:'평소보다 자금이 몰리고 당일 고가 부근에서 버티는 종목. 증권사 「전일대비 거래량 증가」 + 「당일 고가 근접」 조건을 결합했습니다.',
   cond:['거래대금이 20일 평균의 3배 이상','종가가 당일 고가 대비 상위 20% 이내','등락률 +2% 이상','거래대금 30억 이상']},
  {id:'trend', name:'추세 지속형', sub:'이평 정배열 + 신고가 근접',
   desc:'5·20·60일선이 정배열이고 최근 고점에 근접한 종목. 「이평 정배열(5,20,60)」 + 「25봉 최고종가 -3% 이내」 조건을 사용했습니다.',
   cond:['5일선 > 20일선 > 60일선 (정배열)','25일 최고가 대비 -3% 이내','종가가 20일선 위','거래량 전일 대비 증가']},
  {id:'squeeze', name:'에너지 응축형', sub:'이평 수렴 후 돌파',
   desc:'20·60일선이 5% 이내로 모였다가 위로 뚫는 자리. 「이평선 이격도 5% 이내 수렴」 후 돌파 조건입니다.',
   cond:['20일선·60일선 이격도 5% 이내','당일 20일선 상향 돌파','거래대금이 20일 평균의 2배 이상','등락률 +1% 이상']},
];
let surgeRes=null,surgeBusy=false,surgeRegime=null,surgeBT=null;
let surgeAt=0,scrAt=0;   // [추가] 고급 서비스 자동 갱신 — 마지막 스캔/검색 시각
/* ══ 세션 기준 엔진 ══ [수정] 고급 서비스는 24시간 실시간이다.
   문제는 데이터 소스가 거래일 아침(대략 08시 전후)에 당일 값(등락률·거래대금·시고저)을 0으로
   초기화한다는 것 — 그 시간대에 그대로 스캔하면 '전 종목 0%'라는 가짜 결과가 나온다.
   해결: 값이 살아 있는 동안 2분마다 '마지막 장 스냅샷'을 저장해 두고,
   종목별로 ①당일 값이 살아 있으면(NXT 프리마켓 포함) 그걸 쓰고 ②초기화 상태면 스냅샷(마지막 장)을 쓴다.
   → 8시 전·주말·휴장일엔 자동으로 '마지막 장 기준', 개장 후엔 '당일 기준'. 화면은 절대 멈추지 않는다. */
function liveMeaningful(s){return !!(s&&s.price!=null&&s.prevClose&&((s.value||0)>0||(s.volume||0)>0||(s.open||0)>0||s.price!==s.prevClose));}
let sessSnap=null;try{sessSnap=JSON.parse(localStorage.getItem('sessSnap')||'null');}catch(e){}
let _snapAt=0;
function maybeSnapSession(){
  const now=Date.now();if(now-_snapAt<120e3)return;
  const codes=Object.keys(byCode);if(codes.length<30)return;
  let tot=0,mean=0;const q={};
  for(const c of codes){const st=byCode[c];if(!st||st.price==null||!st.prevClose)continue;tot++;
    if(!liveMeaningful(st))continue;mean++;
    const chg=chgPct(st)??0;
    const pos=(st.high!=null&&st.low!=null&&st.high>st.low)?(st.price-st.low)/(st.high-st.low)*100:50;
    const body=(st.open>0)?((st.price-st.open)/st.open*100):0;
    q[c]=[Math.round(chg*100)/100,Math.round((st.value||0)/1e8*10)/10,Math.round(pos),Math.round(body*100)/100,st.volume||0];}
  if(tot<30||mean/tot<0.3)return;   // 초기화 상태(대부분 0)면 스냅샷을 덮어쓰지 않는다
  _snapAt=now;
  const k=new Date(now+9*3600e3);
  sessSnap={day:`${k.getUTCMonth()+1}/${k.getUTCDate()} (${'일월화수목금토'[k.getUTCDay()]})`,at:now,q};
  try{localStorage.setItem('sessSnap',JSON.stringify(sessSnap));}catch(e){}
}
/* 종목별 유효 세션 값 — live: 당일 값 사용 여부 */
function qBasis(st){
  if(liveMeaningful(st)){
    const chg=chgPct(st)??0;
    const pos=(st.high!=null&&st.low!=null&&st.high>st.low)?(st.price-st.low)/(st.high-st.low)*100:50;
    const body=(st.open>0)?((st.price-st.open)/st.open*100):0;
    return {chg,val:(st.value||0)/1e8,pos,body,vol:st.volume||0,live:true};
  }
  const sn=sessSnap&&sessSnap.q&&sessSnap.q[st.code];
  if(sn)return {chg:sn[0],val:sn[1],pos:sn[2],body:sn[3],vol:sn[4]||0,live:false};
  return {chg:0,val:0,pos:50,body:0,vol:0,live:false,none:true};
}
/* 화면 표기용 기준 라벨 */
function sessionBasis(){
  let n=0,m=0;
  for(const c in byCode){const st=byCode[c];if(!st||st.price==null||!st.prevClose)continue;n++;if(liveMeaningful(st))m++;if(n>=150)break;}
  const liveNow=n>=10&&m/n>0.3;
  const k=new Date(Date.now()+9*3600e3),w=k.getUTCDay(),hm=k.getUTCHours()*60+k.getUTCMinutes();
  if(liveNow){
    if(w>=1&&w<=5&&hm>=540&&hm<=930)return{mode:'live',key:'live-open',label:'당일 장중 실시간'};
    if(w===0||w===6)return{mode:'live',key:'live-fri',label:'금요일 장 마감 기준 · 실시간 감시'};
    if(hm<540)return{mode:'live',key:'live-prev',label:'전일 장 기준 · 실시간 감시'};
    return{mode:'live',key:'live-close',label:'당일 장 마감 기준 · 실시간 감시'};
  }
  if(sessSnap)return{mode:'snap',key:'snap-'+sessSnap.day,label:`마지막 장(${sessSnap.day}) 기준 · 실시간 감시`};
  return{mode:'none',key:'none',label:'직전 장 데이터 수집 중 · 실시간 감시'};
}

/* ══ 실시간 시장 분위기(마켓 무드) 엔진 ══ [v1.99]
   지수(코스피·코스닥 실시간) + 상승 종목 비율 + 업종/테마 강세(네이버 업종 등락) +
   금융 뉴스 헤드라인 감성(긍/부정 키워드 사전)을 5분 주기로 종합해 0~100 무드 점수를 만든다.
   ※ 유튜브·개별 전문가 채널 전체를 실시간 크롤링하는 건 브라우저 앱에선 불가능하지만,
      지수·업종·뉴스 헤드라인 조합만으로도 '반도체 초강세' 같은 당일 분위기는 충분히 잡힌다. */
let moodCache=null,_moodAt=0,_moodBusy=false,_thmMoodAt=0;
const MOOD_POS=['급등','강세','상승','최고','신고가','호실적','서프라이즈','상향','수주','흑자','반등','매수세','사상 최대','돌파','순매수','호조','랠리','훈풍','최대 실적','질주','상한가'];
const MOOD_NEG=['급락','약세','하락','최저','신저가','부진','쇼크','하향','적자','우려','불안','매도세','폭락','이탈','순매도','침체','경고','냉각','충격','하한가','비상'];
function scoreTitles(ts){let p=0,n=0;
  (ts||[]).forEach(t=>{MOOD_POS.forEach(w=>{if(t.includes(w))p++;});MOOD_NEG.forEach(w=>{if(t.includes(w))n++;});});
  const tot=p+n;return tot>=3?{pos:p,neg:n,pct:Math.round(p/tot*100),n:(ts||[]).length}:null;}
async function ensureMood(){
  if(_moodBusy||Date.now()-_moodAt<5*60e3)return moodCache;
  _moodBusy=true;
  try{fnBump();
    const r=await fetch('/api/news?market=1',{cache:'default'});
    const j=await r.json();
    if(j&&j.ok)moodCache={titles:j.titles||[],items:j.items||[],sent:scoreTitles(j.titles)};   // [v2.4] 홈 뉴스 코너와 수집 창구 공유
    _moodAt=Date.now();
  }catch(e){}
  /* 업종 등락(주도 섹터) 데이터도 10분마다 재수집 — 섹터 화면을 보고 있을 땐 건드리지 않음 */
  if(Date.now()-_thmMoodAt>10*60e3&&currentView!=='sector'){
    _thmMoodAt=Date.now();
    try{delete thmCache.upjong;}catch(e){}
    loadThemes('upjong');
  }else if(!thmCache.upjong&&!thmLoading.upjong)loadThemes('upjong');
  _moodBusy=false;return moodCache;
}
function topSectorStats(){
  const list=thmCache&&thmCache.upjong;if(!list||!list.length)return null;
  const rated=list.filter(g=>g.rate!=null);if(!rated.length)return null;
  const srt=rated.slice().sort((a,b)=>b.rate-a.rate);
  return {top:srt[0],bottom:srt[srt.length-1],avgTop3:srt.slice(0,3).reduce((a,g)=>a+g.rate,0)/Math.min(3,srt.length)};
}
/* 종목이 속한 업종/테마의 오늘 등락 — 주도주 목록 일치 → 업종명 매칭 순 */
function stockSectorRate(code){
  const pools=[thmCache&&thmCache.upjong,thmCache&&thmCache.theme].filter(Boolean);
  let best=null;
  for(const list of pools)for(const g of list){
    if(g.rate==null)continue;
    if((g.leaders||[]).some(l=>l&&l.code===code)){
      if(!best||Math.abs(g.rate)>Math.abs(best.rate))best={name:g.name,rate:g.rate,lead:true};
    }
  }
  if(best)return best;
  const secNm=(curFund&&curFund.code===code)?String(sumStat(['업종','섹터'])||''):String((byCode[code]&&byCode[code].tags&&byCode[code].tags[0])||'');
  if(secNm.length>=2)for(const list of pools)for(const g of list){
    if(g.rate==null||!g.name||g.name.length<2)continue;
    if(secNm.includes(g.name)||g.name.includes(secNm))return {name:g.name,rate:g.rate};
  }
  return null;
}
function marketMood(){
  const ks=(market.indices||[]).find(x=>x.key==='KOSPI'),kq=(market.indices||[]).find(x=>x.key==='KOSDAQ');
  const r1=(ks&&ks.rate!=null)?ks.rate:null,r2=(kq&&kq.rate!=null)?kq.rate:null;
  let n=0,up=0;
  for(const c of ALLCODES){const st=byCode[c];if(!st||st.price==null||!st.prevClose)continue;n++;if(qBasis(st).chg>0)up++;}
  const breadth=n>=30?up/n:null;                       // [수정] 표본 30 미만이면 0.5로 희석시키지 않고 제외 — 접속 직후 '약세 35점' 오판 원인
  const sect=topSectorStats();
  const sent=moodCache&&moodCache.sent?moodCache.sent.pct:null;
  let sc=50;const drv=[];
  if(r1!=null){sc+=Math.max(-14,Math.min(14,r1*6));drv.push(['코스피 '+pctS(r1),r1>=0?'up':'down']);}
  if(r2!=null){sc+=Math.max(-8,Math.min(8,r2*4));drv.push(['코스닥 '+pctS(r2),r2>=0?'up':'down']);}
  if(breadth!=null){sc+=(breadth-0.5)*36;drv.push(['상승종목 '+Math.round(breadth*100)+'%',breadth>=0.5?'up':'down']);}
  if(sect&&sect.top){sc+=Math.max(-8,Math.min(12,sect.top.rate*1.1));
    drv.push([sect.top.name+' '+pctS(sect.top.rate)+(sect.top.rate>=4?' 초강세':''),sect.top.rate>=0?'up':'down']);}
  if(sent!=null){sc+=(sent-50)*0.22;drv.push(['뉴스 심리 '+sent+'%'+(moodCache.sent.n?` (${moodCache.sent.n}건)`:''),sent>=50?'up':'down']);}
  sc=Math.max(3,Math.min(97,Math.round(sc)));
  const label=sc>=72?'강한 강세':sc>=58?'강세':sc>=42?'중립':sc>=28?'약세':'침체';
  const mult=sc>=72?1.22:sc>=58?1.12:sc>=42?1:sc>=28?0.85:0.72;
  return {score:sc,label,mult,drivers:drv,breadth,sent,sect};
}

/* [수정] 아래 세 함수는 호출만 되고 정의가 누락되어 있어 '고급 서비스 · 급등 스캔'이
   ReferenceError로 통째로 동작하지 않았다. 실제 시세 기준으로 구현한다. */
// 시장 국면 — 지수 등락률과 상승 종목 비율로 강세/중립/약세를 판정하고 성공률 보정계수를 준다.
function marketRegime(){
  /* [v1.99] 지수+상승비율만 보던 국면 판정을 마켓 무드 엔진(지수·업종 강세·뉴스 심리)으로 교체.
     '반도체가 초강세인데 전체 지표만 보고 약세 35점' 같은 오판을 업종·뉴스 축이 바로잡는다. */
  const m=marketMood();
  const mkt=(market.indices||[]).find(x=>x.key==='KOSPI');
  return {label:m.score>=58?'강세':m.score<=41?'약세':'중립',
    rate:(mkt&&mkt.rate!=null)?mkt.rate:0,breadth:m.breadth==null?0.5:m.breadth,
    score:m.score,mult:m.mult,mood:m};
}
// 급등 후보에서 제외할 종목 — 제외 사유 문자열을 반환(제외 대상이 아니면 빈 문자열)
function surgeExclude(s,chg,valEok){
  if(!s||s.price==null||!s.prevClose)return '시세 없음';
  if(isFundLike(s.code))return 'ETF·ETN 제외';
  const n=String(s.name||'');
  if(/스팩|기업인수목적/.test(n))return '스팩 제외';
  if(/우$|[0-9]우[BC]?$|우선주/.test(n))return '우선주 제외';
  if(/리츠$/.test(n))return '리츠 제외';
  if(chg>=29)return '상한가 · 추격 위험';
  if((valEok!=null?valEok*1e8:(s.value||0))<3e8)return '거래대금 3억 미만';
  if(s.price<1000)return '저가주(1,000원 미만)';
  return '';
}
// 목표가·손절가 — 당일 변동폭(고가-저가)을 변동성 대용으로 사용하고 최소/최대 폭을 제한한다.
function surgeLevels(s,chg){
  const px=s.price||0;
  let range=(s.high!=null&&s.low!=null&&s.high>s.low)?(s.high-s.low)/px*100:3;
  range=Math.max(2,Math.min(12,range));
  const upPct=Math.min(20,range*1.8),dnPct=Math.min(10,range*0.9);
  const tick=(v)=>{const t=v<2000?1:v<5000?5:v<20000?10:v<50000?50:v<200000?100:v<500000?500:1000;
    return Math.round(v/t)*t;};
  return {target:tick(px*(1+upPct/100)),stop:tick(px*(1-dnPct/100)),upPct,dnPct};
}
function surgeLog(){try{return JSON.parse(localStorage.getItem('surgeLog')||'[]')}catch(e){return []}}
function saveSurgeLog(l){try{localStorage.setItem('surgeLog',JSON.stringify(l.slice(0,400)))}catch(e){}}
function surgeAcc(sid){
  const done=surgeLog().filter(x=>x.hit!==null&&(!sid||x.s===sid));
  if(!done.length)return null;
  return {n:done.length,hit:done.filter(x=>x.hit).length,rate:done.length?Math.round(done.filter(x=>x.hit).length/done.length*100):0};
}
function recordSurge(sid,code,name,price){
  const l=surgeLog(),d=kstDay();
  if(l.some(x=>x.d===d&&x.s===sid&&x.c===code))return;
  l.unshift({d,s:sid,c:code,n:name,p:price,hit:null});saveSurgeLog(l);
}
function verifySurge(){ // 3거래일 경과 후 +5% 이상이면 적중
  const l=surgeLog();let ch=false;
  const today=kstDay();
  l.forEach(x=>{
    if(x.hit!==null)return;
    const days=Math.floor((new Date(today)-new Date(x.d))/86400000);
    if(days<3)return;
    const st=byCode[x.c];
    if(st&&st.price!=null&&x.p){x.hit=(st.price/x.p-1)>=0.05;ch=true;}
    else if(days>=10){x.hit=false;ch=true;}
  });
  if(ch)saveSurgeLog(l);
}
// 일봉에서 기술적 지표를 폭넓게 계산한다.
// (이동평균·이격도·신고가·매물대(거래량 가중)·볼린저밴드·RSI·MACD·거래량 추세·캔들 형태)
function dailyFeat(cd){
  if(!cd||cd.length<62)return null;
  const c=cd.map(x=>x.c).filter(v=>v>0);
  if(c.length<62)return null;
  const ma=(n)=>{const a=c.slice(-n);return a.reduce((x,y)=>x+y,0)/a.length;};
  const ma5=ma(5),ma20=ma(20),ma60=ma(60);
  // 표준편차 → 볼린저밴드
  const last20=c.slice(-20),m20=ma20;
  const sd=Math.sqrt(last20.reduce((a,b)=>a+Math.pow(b-m20,2),0)/last20.length);
  // RSI(14)
  let gain=0,loss=0;
  for(let i=c.length-14;i<c.length;i++){const d=c[i]-c[i-1];if(d>0)gain+=d;else loss-=d;}
  const rs=loss===0?100:gain/loss;
  const rsi=loss===0?100:100-100/(1+rs);
  // MACD(12,26,9)
  const ema=(arr,n)=>{const k=2/(n+1);let e=arr[0];for(let i=1;i<arr.length;i++)e=arr[i]*k+e*(1-k);return e;};
  const macdSeries=[];
  for(let i=26;i<=c.length;i++){const seg=c.slice(0,i);macdSeries.push(ema(seg.slice(-12),12)-ema(seg.slice(-26),26));}
  const macd=macdSeries[macdSeries.length-1];
  const signal=ema(macdSeries.slice(-9),9);
  // 거래량
  const vol=cd.map(x=>x.v||0);
  const v20=vol.slice(-21,-1).reduce((a,b)=>a+b,0)/20||1;
  const v5=vol.slice(-6,-1).reduce((a,b)=>a+b,0)/5||1;
  // 매물대: 최근 60일 거래량 가중 평균가(VWAP) — 이 위로 올라오면 매물 소화로 본다
  const seg=cd.slice(-60);
  const vw=seg.reduce((a,x)=>a+(x.c*(x.v||0)),0)/(seg.reduce((a,x)=>a+(x.v||0),0)||1);
  // 연속 상승일
  let streak=0;
  for(let i=c.length-1;i>0;i--){if(c[i]>c[i-1])streak++;else break;}
  const d=cd[cd.length-1];
  return {ma5,ma20,ma60,sd,bbUp:m20+2*sd,rsi,macd,signal,v20,v5,vwap60:vw,streak,
    hi25:Math.max(...cd.slice(-25).map(x=>x.h||x.c)),
    hi60:Math.max(...cd.slice(-60).map(x=>x.h||x.c)),
    lo20:Math.min(...cd.slice(-20).map(x=>x.l||x.c)),
    prevClose:c[c.length-2], lastC:c[c.length-1], lastV:(cd[cd.length-1].v||0),
    open:d.o||d.c, high:d.h||d.c, low:d.l||d.c};
}
async function runSurge(){
  if(surgeBusy)return; surgeBusy=true;
  $('surgeBody').innerHTML='<div class="empty">실시간 시세로 후보를 고르는 중…</div>';
  verifySurge();
  // 1) 유니버스: 내장 종목 + 실시간 순위 종목
  const uni=[...new Set([...ALLCODES, ...Object.values(rankCache).flat().map(x=>x&&x.code).filter(Boolean)])];
  const rows=uni.map(c=>byCode[c]).filter(s=>s&&s.price!=null&&s.prevClose&&s.high!=null&&s.low!=null);
  if(rows.length<5){$('surgeBody').innerHTML='<div class="empty">시세를 더 받아온 뒤 다시 시도해 주세요.</div>';surgeBusy=false;return;}
  const feat=rows.map(s=>{
    const q=qBasis(s);                                 // [수정] 당일 값이 초기화 상태면 자동으로 '마지막 장' 값 사용
    return {s,chg:q.chg,pos:q.pos/100,val:q.val,noneQ:!!q.none};
  });
  // 2) 1차 필터: 폭락일에도 후보가 남도록 완화(상대적 강세 종목까지 포함)
  const excl=[];
  const pool=feat.filter(f=>{
    const why=surgeExclude(f.s,f.chg,f.val);
    if(why){excl.push({name:f.s.name,why});return false;}
    return f.val>=10 && (f.chg>=-1 || f.pos>=0.6);      // 거래대금 10억↑ & (하락 제한적 or 고가권)
  }).sort((a,b)=>(b.chg*2+b.pos*10+Math.log10(b.val+1)*3)-(a.chg*2+a.pos*10+Math.log10(a.val+1)*3)).slice(0,16);
  window._surgeExcl=excl;
  let cand=pool;
  if(cand.length<3){   // [수정] 마지막 장 스냅샷조차 없는 첫 접속 — 내장 종목으로 후보를 채우고 일봉 값으로 판정
    const seen=new Set(cand.map(x=>x.s.code));
    feat.filter(f=>!seen.has(f.s.code)&&!isFundLike(f.s.code)&&f.s.price>=1000&&!/우$|우선주|스팩|리츠$/.test(f.s.name||''))
      .slice(0,16-cand.length).forEach(f=>cand.push({...f,noneQ:true}));
  }
  $('surgeBody').innerHTML=`<div class="empty">후보 ${cand.length}종목의 일봉을 분석 중…</div>`;
  const daily={};
  for(const f of cand){ try{ fnBump(); daily[f.s.code]=dailyFeat(await ensureDailySummary(f.s.code)); }catch(e){ daily[f.s.code]=null; } }

  // 3) 전략별 '조건 충족도' 채점 — 완전 충족(신호)과 부분 충족(관찰)을 모두 반환한다.
  //    조건을 100% 만족하는 날만 결과를 내면 대부분의 날에 화면이 비어 실효성이 없다.
  const out={};
  SURGE_STRATS.forEach(st=>out[st.id]=[]);
  for(const f of cand){
    const d=daily[f.s.code], s=f.s;
    if(d&&f.noneQ){   // 실시간·스냅샷 둘 다 없던 종목 — 마지막 일봉으로 세션 값 복원
      if(d.prevClose)f.chg=(d.lastC-d.prevClose)/d.prevClose*100;
      f.val=d.lastC*(d.lastV||0)/1e8;
      f.pos=(d.high>d.low)?(d.lastC-d.low)/(d.high-d.low):0.5;
    }
    const volRatio=(d&&d.v20)?(s.volume||0)/d.v20:null;
    const push=(sid,checks,extra)=>{
      const met=checks.filter(c=>c.ok).length;
      const ratio=met/checks.length;
      if(ratio<0.5)return;                                  // 절반도 못 채우면 제외
      const score=Math.round(ratio*70+Math.min(30,(extra||0)));
      out[sid].push({...f,score,full:met===checks.length,met,total:checks.length,
        why:checks.map(c=>`${c.ok?'✓':'·'} ${c.t}`),
        plain:checks.filter(c=>c.ok&&c.p).map(c=>c.p),        // 충족한 조건의 일상어 설명
        miss:checks.filter(c=>!c.ok&&c.p).map(c=>c.p)});      // 못 채운 조건
    };
    if(!d)continue;
    const gap20=(s.price/d.ma20-1)*100;                       // 20일선 이격도
    const gapMA=Math.abs(d.ma20/d.ma60-1)*100;                // 20/60 수렴도
    const near25=(s.price/d.hi25)*100, near60=(s.price/d.hi60)*100;
    const body=(d.open>0)?((s.price-d.open)/d.open*100):0;    // 시가 대비(장대양봉)
    const volTrend=d.v5/d.v20;
    // 세력 유입형 (자금 유입 + 매물대 돌파)
    push('flow',[
      {t:`거래대금 ${volRatio!=null?volRatio.toFixed(1)+'배':'—'}`, ok:volRatio!=null&&volRatio>=3,
        p:`평소보다 거래가 ${volRatio!=null?volRatio.toFixed(1):'?'}배 몰렸어요`},
      {t:`고가권 ${Math.round(f.pos*100)}%`, ok:f.pos>=0.8,
        p:'오늘 가장 비쌌던 값 근처에서 마감했어요 (밀리지 않았다는 뜻)'},
      {t:`등락률 ${pctS(f.chg)}`, ok:f.chg>=2, p:`오늘 ${pctS(f.chg)} 움직였어요`},
      {t:`거래대금 ${f.val.toFixed(0)}억`, ok:f.val>=30, p:`오늘 약 ${f.val.toFixed(0)}억 원어치가 거래됐어요`},
      {t:`매물대 ${s.price>=d.vwap60?'돌파':'미돌파'}`, ok:s.price>=d.vwap60,
        p:'예전에 물려 있던 사람들의 가격대를 넘어섰어요'},
      {t:`거래량 추세 ${volTrend.toFixed(1)}배`, ok:volTrend>=1, p:'최근 5일 동안 거래가 꾸준히 늘고 있어요'},
      {t:`양봉 ${body>=0?'+':''}${body.toFixed(1)}%`, ok:body>=2, p:'장 시작가보다 높은 값으로 끝났어요'},
      {t:'20일선 위', ok:s.price>d.ma20, p:'최근 한 달 평균 가격보다 위에 있어요'},
    ], (volRatio||0)*3+f.pos*8);
    // 추세 지속형 (정배열 + 신고가 + 과열 회피)
    push('trend',[
      {t:'이평 정배열', ok:d.ma5>d.ma20&&d.ma20>d.ma60,
        p:'1주일·1달·3달 평균 가격이 모두 위를 향해요 (흐름이 한 방향)'},
      {t:`25일 고점 대비 ${near25.toFixed(1)}%`, ok:s.price>=d.hi25*0.97, p:'최근 한 달 최고가에 거의 닿았어요'},
      {t:'20일선 위', ok:s.price>d.ma20, p:'최근 한 달 평균 가격보다 위에 있어요'},
      {t:`거래량 ${volRatio!=null?volRatio.toFixed(1)+'배':'—'}`, ok:volRatio!=null&&volRatio>=1, p:'거래가 평소만큼은 붙어 있어요'},
      {t:`이격도 ${gap20.toFixed(1)}%`, ok:gap20<=25, p:'너무 급하게 오르진 않아서 과열 위험이 낮아요'},
      {t:`MACD ${d.macd>d.signal?'상향':'하향'}`, ok:d.macd>d.signal, p:'상승에 힘이 붙고 있는 신호가 나왔어요'},
      {t:`RSI ${d.rsi.toFixed(0)}`, ok:d.rsi>=50&&d.rsi<=75, p:'과열도 냉각도 아닌 적당한 온도예요'},
      {t:`60일 고점 대비 ${near60.toFixed(1)}%`, ok:s.price>=d.hi60*0.92, p:'최근 3개월 최고가 근처예요'},
    ], Math.max(0,(near25-90))*1.0);
    // 에너지 응축형 (수렴 + 볼린저 돌파)
    push('squeeze',[
      {t:`이평 수렴 ${gapMA.toFixed(1)}%`, ok:gapMA<=5, p:'한동안 가격이 좁은 범위에 눌려 있었어요 (에너지 축적)'},
      {t:'20일선 돌파', ok:s.prevClose<=d.ma20&&s.price>d.ma20, p:'오늘 한 달 평균선을 위로 뚫었어요'},
      {t:`거래량 ${volRatio!=null?volRatio.toFixed(1)+'배':'—'}`, ok:volRatio!=null&&volRatio>=2,
        p:`거래가 평소의 ${volRatio!=null?volRatio.toFixed(1):'?'}배로 늘었어요`},
      {t:`등락률 ${pctS(f.chg)}`, ok:f.chg>=1, p:`오늘 ${pctS(f.chg)} 움직였어요`},
      {t:`볼린저 ${s.price>=d.bbUp?'상단 돌파':'밴드 내'}`, ok:s.price>=d.bbUp, p:'평소 움직이던 범위의 위쪽을 벗어났어요'},
      {t:`지지선 대비 +${((s.price/d.lo20-1)*100).toFixed(0)}%`, ok:s.price>=d.lo20*1.05, p:'최근 바닥에서 충분히 올라와 있어요'},
      {t:`RSI ${d.rsi.toFixed(0)}`, ok:d.rsi>=45, p:'하락 분위기에서는 벗어난 상태예요'},
      {t:`연속 상승 ${d.streak}일`, ok:d.streak>=2, p:`${d.streak}일 연속 오르고 있어요`},
    ], Math.max(0,(5-gapMA))*2.5+(volRatio||0)*2);
  }
  Object.keys(out).forEach(k=>out[k].sort((a,b)=>b.score-a.score));
  surgeRes=out; surgeRegime={...marketRegime(),basis:sessionBasis()}; surgeBusy=false;
  surgeAt=Date.now();proLiveStamp('surgeLive');
  // 예측 기록
  SURGE_STRATS.forEach(st=>{(out[st.id]||[]).filter(x=>x.full).slice(0,3).forEach(x=>recordSurge(st.id,x.s.code,x.s.name,x.s.price));});
  renderSurge();
}
function surgeProb(sid,score){
  const a=surgeAcc(sid);
  const bt=surgeBT&&surgeBT[sid];
  // 우선순위: 실제 예측 기록 → 과거 백테스트 → 보수적 기본값
  const base=a&&a.n>=5?a.rate:(bt&&bt.n>=10?bt.rate:42);
  const adj=(score-60)*0.35;
  const mult=surgeRegime?surgeRegime.mult:1;
  return Math.max(8,Math.min(90,Math.round((base+adj)*mult)));
}
/* ===== 급등 스캔 결과 UX (사용자 맞춤형 개편) =====
   기존 화면은 전략 3개를 나란히 보여주고 '이평 정배열 / 이격도 / 볼린저 상단' 같은
   전문 용어를 그대로 노출해, 일반 사용자가 "그래서 뭘 보라는 건지" 알기 어려웠다.
   → ① 결론을 맨 위 한 줄로  ② 전략을 합쳐 종목 하나당 카드 하나로
      ③ 이유를 일상어 3줄로  ④ 확률을 '10번 중 몇 번'으로  ⑤ 쉽게/자세히 모드 분리 */
const SURGE_EASY={
  flow:   {icon:'💰', name:'돈이 몰리는 중',   one:'평소보다 훨씬 많은 돈이 들어왔고, 오늘 높은 값에서 버틴 종목입니다.'},
  trend:  {icon:'📈', name:'계속 오르는 중',   one:'흐름이 이미 위를 향하고 있고, 최근 최고가 근처까지 올라온 종목입니다.'},
  squeeze:{icon:'🎯', name:'눌렸다 튀는 자리', one:'한동안 좁게 눌려 있다가 오늘 위로 뚫고 나온 종목입니다.'},
};
// [주의] 이 줄은 store 선언보다 위에서 실행되므로 localStorage를 직접 읽는다(TDZ 회피).
let surgeMode=(()=>{try{return JSON.parse(localStorage.getItem('surgeMode'))||'easy';}catch(e){return 'easy';}})();
const saveSurgeMode=(v)=>{try{localStorage.setItem('surgeMode',JSON.stringify(v));}catch(e){}};
// 확률 표기 — 숫자를 그대로 보여주되 '무엇의 확률인지'를 문구로 분명히 한다.
function probTone(p){return p>=60?'hi':p>=45?'mid':'lo';}
// 확률의 근거가 무엇인지 솔직하게 밝힌다(표본이 적으면 적다고 말한다)
function surgeBasis(sid){
  const a=surgeAcc(sid), bt=surgeBT&&surgeBT[sid];
  if(a&&a.n>=5)return {txt:`이 앱이 실제로 기록한 예측 ${a.n}회 기준`, weak:false};
  if(bt&&bt.n>=10)return {txt:`과거 일봉 백테스트 ${bt.n.toLocaleString()}회 기준`, weak:false};
  return {txt:'검증 표본이 부족해 보수적 기본값을 씁니다', weak:true};
}
// 전략별로 흩어진 결과를 종목 단위로 합친다(여러 전략에 겹치면 더 강한 신호)
function surgeMerged(){
  const m=new Map();
  SURGE_STRATS.forEach(st=>{
    (surgeRes&&surgeRes[st.id]||[]).forEach(x=>{
      const entry={sid:st.id,score:x.score,full:x.full,met:x.met,total:x.total,
        why:x.why,plain:x.plain||[],miss:x.miss||[],prob:Math.round(surgeProb(st.id,x.score)*(x.full?1:0.75))};
      const cur=m.get(x.s.code);
      if(!cur)m.set(x.s.code,{s:x.s,chg:x.chg,val:x.val,pos:x.pos,hits:[entry]});
      else cur.hits.push(entry);
    });
  });
  const arr=[...m.values()].map(o=>{
    o.hits.sort((a,b)=>b.prob-a.prob);
    o.best=o.hits[0];
    o.fullN=o.hits.filter(h=>h.full).length;
    o.prob=Math.max(8,Math.min(92,o.best.prob+(o.hits.length>1?5*(o.hits.length-1):0)));
    const seen=new Set(); o.reasons=[];
    o.hits.forEach(h=>h.plain.forEach(t=>{if(!seen.has(t)){seen.add(t);o.reasons.push(t);}}));
    return o;
  });
  return arr.sort((a,b)=>(b.fullN-a.fullN)||(b.hits.length-a.hits.length)||(b.prob-a.prob));
}
function surgeCard(o,rank){
  const _p=dispQuote(o.s.code);                                   // [수정] 카드 현재가도 헤더와 같은 통합가
  const px=((_p&&_p.price!=null)?_p.price:o.s.price)||0;
  const lv=surgeLevels((_p&&_p.price!=null)?{...o.s,price:px}:o.s,o.chg);
  const upP=px?((lv.target-px)/px*100):0, dnP=px?((px-lv.stop)/px*100):0;
  const rr=dnP>0?(upP/dnP):0;
  const tags=o.hits.map(h=>`<span class="sg-tag t-${h.sid}">${SURGE_EASY[h.sid].icon} ${SURGE_EASY[h.sid].name}</span>`).join('');
  const dup=o.hits.length>1?`<span class="sg-dup">신호 ${o.hits.length}개 겹침</span>`:'';
  const basis=surgeBasis(o.best.sid);
  const strength=o.fullN>0?'<span class="sg-badge full">조건 전부 충족</span>'
    :`<span class="sg-badge part">조건 ${o.best.met}/${o.best.total} 충족 · 관찰 단계</span>`;
  const reasons=o.reasons.slice(0,3).map(t=>`<li>${t}</li>`).join('');
  const adv=surgeMode==='pro'?`<div class="sgc-adv">${o.hits.map(h=>
      `<div class="sgc-adv-s"><b>${SURGE_STRATS.find(x=>x.id===h.sid).name}</b> <span>${h.met}/${h.total} · 점수 ${h.score}</span>
       <div class="sgc-adv-w">${h.why.join(' · ')}</div></div>`).join('')}</div>`:'';
  return `<div class="sgc" data-code="${o.s.code}">
    <div class="sgc-h"><span class="sgc-rk${rank<=3?' top':''}">${rank}</span>${stockLogo(o.s.code,o.s.name,'sm')}
      <b class="sgc-nm">${o.s.name}</b>${mktTag(o.s.code,o.s.market)}${dup}
      <span class="sgc-px num ${dirOf(o.chg)}">${KRW(px)}<em>${pctS(o.chg)}</em></span></div>
    <div class="sgc-tags">${tags}${strength}</div>
    <div class="sgc-conf">
      <div class="sgc-conf-t"><span>예측 성공 확률</span>
        <b class="num ${probTone(o.prob)}">${o.prob}%</b></div>
      <div class="sgc-bar ${probTone(o.prob)}"><i style="width:${o.prob}%"></i></div>
      <div class="sgc-conf-n">목표가에 닿을 확률입니다 · <i class="${basis.weak?'weak':''}">${basis.txt}</i></div>
    </div>
    <ul class="sgc-why">${reasons}</ul>
    <div class="sgc-plan">
      <div><span>목표가</span><b class="up">${KRW(lv.target)}</b><i>+${upP.toFixed(1)}%</i></div>
      <div><span>손절가</span><b class="down">${KRW(lv.stop)}</b><i>-${dnP.toFixed(1)}%</i></div>
      <div><span>손익비</span><b>${rr?rr.toFixed(1):'—'} : 1</b><i>${rr>=1.5?'유리':rr>=1?'보통':'불리'}</i></div>
    </div>
    <div class="sgc-note">1주 사면 목표 도달 시 <b class="up">+${KRW(Math.round(lv.target-px))}원</b>,
      손절 시 <b class="down">-${KRW(Math.round(px-lv.stop))}원</b>입니다.</div>
    ${adv}
    <div class="sgc-go">종목 화면에서 차트·재무 보기 →</div>
  </div>`;
}
function renderSurge(){
  const acc=surgeAcc(null);
  const accEl=$('surgeAcc');
  if(accEl)accEl.innerHTML=acc?`지난 예측 적중 <b>${acc.rate}%</b> <i>(${acc.hit}/${acc.n})</i>`:'적중 기록 쌓는 중';

  // 전략 소개 카드 — 쉽게 보기에서는 용어 대신 한 줄 설명
  const stratsEl=$('surgeStrats');
  if(stratsEl)stratsEl.innerHTML=SURGE_STRATS.map(st=>{
    const a=surgeAcc(st.id), e=SURGE_EASY[st.id];
    if(surgeMode==='easy')
      return `<div class="ss-card easy"><div class="ss-t">${e.icon} ${e.name}</div>
        <div class="ss-one">${e.one}</div>
        <div class="ss-acc">${a?`이 신호 적중률 <b>${a.rate}%</b> (${a.hit}/${a.n})`:'아직 기록이 쌓이는 중'}</div></div>`;
    return `<div class="ss-card"><div class="ss-t">${st.name}<span>${st.sub}</span></div>
      <div class="ss-acc">${a?`적중률 <b>${a.rate}%</b> (${a.hit}/${a.n})`:'적중 기록 없음'}</div>
      <ul class="ss-cond">${st.cond.map(c=>`<li>${c}</li>`).join('')}</ul>
      <div class="ss-desc">${st.desc}</div></div>`;
  }).join('');

  const rg=surgeRegime||marketRegime();
  const tone=rg.label==='강세'?'good':rg.label==='약세'?'bad':'mid';
  const modeBar=`<div class="sg-mode">
    <button class="${surgeMode==='easy'?'on':''}" data-m="easy">쉽게 보기</button>
    <button class="${surgeMode==='pro'?'on':''}" data-m="pro">자세히 보기</button></div>`;

  const bind=()=>{
    const b=$('surgeBody');if(!b)return;
    b.querySelectorAll('.sg-mode button').forEach(x=>x.onclick=()=>{
      surgeMode=x.dataset.m;saveSurgeMode(surgeMode);renderSurge();});
    b.querySelectorAll('.sgc').forEach(r=>r.onclick=()=>openTrade(r.dataset.code));
    const t=$('sgExToggle');
    if(t)t.onclick=()=>{const el=$('sgExList');if(el)el.hidden=!el.hidden;};
  };

  if(!surgeRes){
    $('surgeBody').innerHTML=modeBar+
      `<div class="sg-verdict ${tone}"><b>첫 자동 스캔을 준비하고 있습니다…</b>
        <span>이 화면은 실시간 자동으로 돌아갑니다. 잠시만 기다리시면 결과가 표시됩니다.</span></div>`;
    bind();return;
  }
  const list=surgeMerged();
  const fullN=list.filter(o=>o.fullN>0).length;
  const headline=list.length===0?'오늘은 조건에 맞는 종목이 없습니다'
    :fullN>0?`조건을 <b>전부</b> 만족한 종목이 ${fullN}개 있습니다`
    :`완전히 만족한 종목은 없고, 관찰할 만한 종목이 ${list.length}개입니다`;
  const regimeMsg=rg.label==='약세'
    ?'지금은 <b>약세 국면</b>입니다. 같은 신호라도 실패 확률이 눈에 띄게 올라가니 비중을 줄이세요.'
    :rg.label==='강세'
    ?'지금은 <b>강세 국면</b>입니다. 이런 신호가 비교적 잘 통하는 환경입니다.'
    :'지금은 <b>중립 국면</b>입니다. 특별한 가감 없이 그대로 보시면 됩니다.';

  const verdict=`<div class="sg-verdict ${tone}">
    <b>${headline}</b>
    <span>${regimeMsg}</span>
    <div class="sg-gauge"><i style="width:${rg.score}%"></i></div>
    <div class="sg-gauge-l"><span>약세</span><em>시장 온도 ${rg.score}점 · 상승 종목 ${Math.round(rg.breadth*100)}%</em><span>강세</span></div>
    <div class="sg-basis"><i class="lv-dot"></i>LIVE · ${(rg.basis&&rg.basis.label)||sessionBasis().label}${surgeAt?` · ${String(new Date(surgeAt).getHours()).padStart(2,'0')}:${String(new Date(surgeAt).getMinutes()).padStart(2,'0')} 스캔`:''}</div>
  </div>`;

  const guide=surgeMode==='easy'?`<div class="sg-guide">
    <b>이 화면 보는 법</b>
    <ol><li><b>예측 성공 확률</b>은 같은 조건이 과거에 목표가까지 갔던 비율입니다. 확정된 예측이 아닙니다.</li>
      <li>‘신호 겹침’이 붙은 종목은 서로 다른 근거가 동시에 나온 경우입니다.</li>
      <li>목표가·손절가는 <b>사기 전에</b> 정해 두는 기준입니다. 손익비가 1보다 작으면 불리한 자리입니다.</li></ol></div>`:'';

  const cards=list.length?list.slice(0,10).map((o,i)=>surgeCard(o,i+1)).join('')
    :'<div class="empty">조건을 채운 종목이 없습니다. 시세를 더 받아온 뒤 다시 스캔해 주세요.</div>';

  const ex=window._surgeExcl||[];
  const exHtml=ex.length?`<div class="sg-ex">
    <button id="sgExToggle"><b>미리 걸러낸 종목 ${ex.length}건</b> 보기</button>
    <div id="sgExList" hidden>${[...new Set(ex.map(e=>e.why))].map(w=>`<span>${w}</span>`).join('')}
      <p>우선주·스팩·저가주·상한가 근접처럼 급등주 검색식이 흔히 빠지는 함정을 자동으로 제외합니다.</p></div></div>`:'';

  const disc=`<div class="sg-disc">이 결과는 과거 가격·거래량 패턴에 기반한 <b>참고 정보</b>이며 수익을 보장하지 않습니다.
    투자 판단과 그 결과는 본인에게 있습니다.</div>`;

  $('surgeBody').innerHTML=modeBar+verdict+guide+cards+exHtml+disc;
  bind();
}

/* ===== 전략 백테스트 =====
   일봉으로 과거 시점에 각 조건식을 적용해, 이후 3거래일 내 +5% 도달 여부를 집계한다.
   '유튜브 검색식'의 가장 큰 함정인 생존 편향(성공 사례만 보여주기)을 피하려면
   반드시 이런 사후 검증이 필요하다. */
function btOne(cd,sid,i,target,hold){
  target=target||5; hold=hold||3;
  if(i<62||i+hold>=cd.length)return null;
  const c=cd.slice(0,i+1).map(x=>x.c);
  const ma=(n)=>{const a=c.slice(-n);return a.reduce((x,y)=>x+y,0)/a.length;};
  const d=cd[i],prev=cd[i-1];
  const vol=cd.slice(0,i+1).map(x=>x.v||0);
  const v20=vol.slice(-21,-1).reduce((a,b)=>a+b,0)/20||1;
  const volRatio=(d.v||0)/v20;
  const chg=prev.c?(d.c/prev.c-1)*100:0;
  const pos=(d.h>d.l)?(d.c-d.l)/(d.h-d.l):0.5;
  const ma5=ma(5),ma20=ma(20),ma60=ma(60);
  const hi25=Math.max(...cd.slice(i-24,i+1).map(x=>x.h||x.c));
  let hit=false;
  if(sid==='flow') hit=volRatio>=3&&pos>=0.8&&chg>=2;
  if(sid==='trend') hit=ma5>ma20&&ma20>ma60&&d.c>=hi25*0.97&&d.c>ma20&&volRatio>=1;
  if(sid==='squeeze'){const gap=Math.abs(ma20/ma60-1)*100;hit=gap<=5&&prev.c<=ma20&&d.c>ma20&&volRatio>=2&&chg>=1;}
  if(!hit)return null;
  const fut=Math.max(...cd.slice(i+1,i+1+hold).map(x=>x.c));
  return {win:(fut/d.c-1)>=target/100, ret:(fut/d.c-1)*100};
}
/* [수정] 왜 24종목만 분석했나?
   이전 코드는 `ALLCODES.slice(0,24)`로 **하드코딩**돼 있었습니다. 종목마다 일봉을 1회씩
   불러와야 해서(=서버리스 함수 호출 1회) 무료 크레딧을 아끼려는 조치였습니다.
   → 이제 분석 범위를 직접 고를 수 있고, 한 번 받은 일봉은 캐시되어 재실행은 추가 호출이 없습니다. */
const _ls=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}};
const _lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
let btUniv=_ls('btUniv','basic'), btTarget=_ls('btTarget',5), btHold=_ls('btHold',3);
function btUniverse(){
  const base=ALLCODES.slice();
  if(btUniv==='quick')return base.slice(0,24);
  if(btUniv==='basic')return base;
  // 확장: 내장 66종 + 관심종목 + 최근 조회 + 실시간 순위권 종목
  const extra=[...watchlist,
    ...((typeof srchHist!=='undefined'&&srchHist)?srchHist.map(x=>x&&x.code):[]),
    ...Object.values(rankCache).flat().map(x=>x&&x.code)];
  return [...new Set([...base,...extra.filter(c=>c&&/^[0-9A-Z]{6}$/.test(c))])].slice(0,160);
}
function renderBtOpts(){
  const el=$('btOpts');if(!el)return;
  const seg=(id,cur,opts)=>`<div class="bt-seg" data-g="${id}">${opts.map(([v,l,sub])=>
    `<button class="${String(cur)===String(v)?'on':''}" data-v="${v}">${l}${sub?`<i>${sub}</i>`:''}</button>`).join('')}</div>`;
  const n=btUniverse().length;
  el.innerHTML=`
    <div class="bt-opt-row"><span class="bt-lb">분석 범위</span>${seg('univ',btUniv,[
      ['quick','빠르게','24종목'],['basic','기본','66종목'],['wide','넓게','최대 160종목']])}</div>
    <div class="bt-opt-row"><span class="bt-lb">목표 수익률</span>${seg('target',btTarget,[['3','+3%'],['5','+5%'],['10','+10%']])}</div>
    <div class="bt-opt-row"><span class="bt-lb">보유 기간</span>${seg('hold',btHold,[['3','3일'],['5','5일'],['10','10일']])}</div>
    <div class="bt-opt-note">현재 설정: <b>${n}종목</b> · 신호 발생 후 <b>${btHold}거래일</b> 안에 <b>+${btTarget}%</b> 도달했는지 검증합니다.
      처음 실행 시 종목당 1회씩 일봉을 받아옵니다(재실행은 캐시 사용 · 추가 호출 없음).</div>`;
  el.querySelectorAll('.bt-seg button').forEach(b=>b.onclick=()=>{
    const g=b.closest('.bt-seg').dataset.g,v=b.dataset.v;
    if(g==='univ'){btUniv=v;_lsSet('btUniv',v);}
    if(g==='target'){btTarget=Number(v);_lsSet('btTarget',btTarget);}
    if(g==='hold'){btHold=Number(v);_lsSet('btHold',btHold);}
    renderBtOpts();
  });
}
let btBusy=false;
async function runBacktest(){
  if(btBusy)return; btBusy=true;
  const el=$('btBody');
  const codes=btUniverse();
  el.innerHTML='<div class="empty">최근 일봉으로 과거 신호를 재현하는 중…</div>';
  const res={};SURGE_STRATS.forEach(s=>res[s.id]={n:0,win:0,ret:0});
  let done=0,used=0,skipped=0;
  for(const code of codes){
    let cd=null;
    const cached=!!(_sumDaily[code]||(candleCache[code+':D']&&candleCache[code+':D'].length));
    try{ if(!cached)fnBump(); cd=await ensureDailySummary(code); }catch(e){}
    done++;
    if(done%3===0||done===codes.length)
      el.innerHTML=`<div class="empty">분석 중… ${done}/${codes.length}종목<br><span class="sm">유효 ${used} · 데이터 부족 ${skipped}</span></div>`;
    if(!cd||cd.length<70){skipped++;continue;}
    used++;
    for(const st of SURGE_STRATS){
      for(let i=62;i<cd.length-btHold;i++){
        const r=btOne(cd,st.id,i,btTarget,btHold);
        if(r){res[st.id].n++;if(r.win)res[st.id].win++;res[st.id].ret+=r.ret;}
      }
    }
  }
  btBusy=false;
  window._btMeta={codes:codes.length,used,skipped,target:btTarget,hold:btHold,at:new Date().toLocaleString('ko-KR')};
  _lsSet('btMeta',window._btMeta);
  surgeBT={};
  SURGE_STRATS.forEach(s=>{const r=res[s.id];
    surgeBT[s.id]={n:r.n,win:r.win,rate:r.n?Math.round(r.win/r.n*100):0,avg:r.n?(r.ret/r.n):0};});
  try{localStorage.setItem('surgeBT',JSON.stringify(surgeBT));}catch(e){}
  renderBacktest();
  if(proTab==='surge')renderSurge();
}
function renderBacktest(){
  const el=$('btBody');if(!el)return;
  if(!surgeBT){try{surgeBT=JSON.parse(localStorage.getItem('surgeBT')||'null');}catch(e){}}
  if(!surgeBT){el.innerHTML='<div class="empty">‘백테스트 실행’을 누르면 과거 데이터로 전략을 검증합니다.</div>';return;}
  el.innerHTML=`<div class="bt-grid">${SURGE_STRATS.map(st=>{
    const b=surgeBT[st.id]||{n:0,rate:0,avg:0};
    const grade=b.n<10?'표본 부족':b.rate>=55?'양호':b.rate>=45?'보통':'주의';
    return `<div class="bt-card"><div class="bt-n">${st.name}</div>
      <div class="bt-r num ${b.rate>=50?'up':'down'}">${b.n?b.rate+'%':'—'}</div>
      <div class="bt-s">신호 ${b.n.toLocaleString()}회 · 평균 ${b.avg>=0?'+':''}${b.avg.toFixed(2)}%</div>
      <div class="bt-g ${b.rate>=55?'ok':b.rate>=45?'mid':'bad'}">${grade}</div></div>`;}).join('')}</div>
    <div class="pro-note">${(()=>{const m=window._btMeta||_ls('btMeta',null);
      return m?`<b>${m.used}종목</b>(요청 ${m.codes}종목 중 일봉 확보분)의 최근 일봉에 조건식을 그대로 적용해 <b>신호 발생 후 ${m.hold}거래일 내 +${m.target}% 도달</b> 비율을 계산했습니다. <i>실행 ${m.at}</i>`
        :'최근 일봉에 조건식을 그대로 적용해 목표 도달 비율을 계산했습니다.';})()}
      거래비용·슬리피지·유동성 제약은 반영되지 않았고, 표본과 기간이 제한적이라 <b>실제 성과와 다를 수 있습니다.</b>
      이 수치는 전략의 상대적 특성을 이해하기 위한 참고자료입니다.</div>`;
}

/* ===== 조건 검색기 ===== */
function scrUniverse(scope){
  if(scope==='core')return ALLCODES.slice();
  if(scope==='etf')return (etfList||[]).map(x=>x.code);
  return [...new Set([...ALLCODES,...(etfList||[]).map(x=>x.code),...(stockAll||[]).map(x=>x.code),
    ...Object.values(rankCache).flat().map(x=>x&&x.code).filter(Boolean)])];
}
function runScreener(){
  const nz=(id)=>{const v=$(id)&&$(id).value;return v===''||v==null?null:Number(v);};
  const f={chgMin:nz('scrChgMin'),chgMax:nz('scrChgMax'),valMin:nz('scrValMin'),valMax:nz('scrValMax'),
    pxMin:nz('scrPxMin'),pxMax:nz('scrPxMax'),volMin:nz('scrVolMin'),posMin:nz('scrPosMin'),posMax:nz('scrPosMax'),
    bodyMin:nz('scrBodyMin')};
  const mk=$('scrMkt').value,kind=$('scrKind').value,nxt=$('scrNxt').value;
  const sort=$('scrSort').value,limit=Number($('scrLimit').value||120),scope=$('scrScope').value;
  const uni=scrUniverse(scope);
  let rows=uni.map(c=>byCode[c]).filter(s=>s&&s.price!=null&&s.prevClose).map(s=>{
    const q=qBasis(s);   // [수정] 초기화 시간대엔 자동으로 '마지막 장' 값으로 검색 — 24시간 실시간
    return {s,chg:q.chg,pos:q.pos,body:q.body,val:q.val,vol:q.vol};
  });
  rows=rows.filter(x=>{
    if(f.chgMin!=null&&x.chg<f.chgMin)return false;
    if(f.chgMax!=null&&x.chg>f.chgMax)return false;
    if(f.valMin!=null&&x.val<f.valMin)return false;
    if(f.valMax!=null&&x.val>f.valMax)return false;
    if(f.pxMin!=null&&x.s.price<f.pxMin)return false;
    if(f.pxMax!=null&&x.s.price>f.pxMax)return false;
    if(f.volMin!=null&&x.vol<f.volMin)return false;
    if(f.posMin!=null&&x.pos<f.posMin)return false;
    if(f.posMax!=null&&x.pos>f.posMax)return false;
    if(f.bodyMin!=null&&x.body<f.bodyMin)return false;
    if(mk&&x.s.market!==mk)return false;
    if(kind==='etf'&&!isFundLike(x.s.code))return false;
    if(kind==='stock'&&isFundLike(x.s.code))return false;
    if(nxt){const cap=nxtCapability(x.s.code);
      if(cap===null)return false;                 // 명단 미확보 시엔 필터 결과를 못 믿으니 제외
      if(nxt==='y'&&cap!==true)return false;
      if(nxt==='n'&&cap!==false)return false;}
    return true;
  });
  const cmp={val:(a,b)=>b.val-a.val,chg:(a,b)=>b.chg-a.chg,chgAsc:(a,b)=>a.chg-b.chg,
    vol:(a,b)=>b.vol-a.vol,pos:(a,b)=>b.pos-a.pos,px:(a,b)=>b.s.price-a.s.price};
  rows.sort(cmp[sort]||cmp.val);
  const shown=rows.slice(0,limit);
  const preNote=`<div class="rank-note basis"><i class="lv-dot"></i>LIVE · ${sessionBasis().label}</div>`;
  $('scrBody').innerHTML=preNote+(shown.length?
    `<div class="rank-note">조건 충족 <b>${rows.length.toLocaleString()}</b>종목 · 표시 ${shown.length.toLocaleString()}건</div>`+
    shown.map((x,i)=>stockRow(x.s.code,x.s.name,x.s.market,'',i+1)).join('')
    :'<div class="empty">조건을 만족하는 종목이 없습니다. 조건을 완화해 보세요.</div>');
  bindStockClicks($('scrBody'));
  scrAt=Date.now();proLiveStamp('scrLive');
}
function scrReset(){
  ['scrChgMin','scrChgMax','scrValMin','scrValMax','scrPxMin','scrPxMax','scrVolMin','scrPosMin','scrPosMax','scrBodyMin'].forEach(id=>{if($(id))$(id).value='';});
  ['scrMkt','scrKind','scrNxt'].forEach(id=>{if($(id))$(id).value='';});
  if($('scrSort'))$('scrSort').value='val';
  if($('scrScope'))$('scrScope').value='all';
  $('scrBody').innerHTML='';
}
function scrPreset(name){
  scrReset();
  const set=(id,v)=>{if($(id))$(id).value=v;};
  if(name==='surge'){set('scrChgMin',3);set('scrValMin',50);set('scrPosMin',70);set('scrSort','chg');}
  if(name==='vol'){set('scrValMin',300);set('scrSort','val');}
  if(name==='strong'){set('scrPosMin',85);set('scrValMin',30);set('scrSort','pos');}
  if(name==='drop'){set('scrChgMax',-5);set('scrValMin',30);set('scrSort','chgAsc');}
  runScreener();
}
/* ===== 시장 온도계 ===== */
function renderThermo(){
  const uni=[...new Set([...ALLCODES,...Object.values(rankCache).flat().map(x=>x&&x.code).filter(Boolean)])];
  const rows=uni.map(c=>byCode[c]).filter(s=>s&&s.price!=null&&s.prevClose);
  if(rows.length<5){$('thermoBody').innerHTML='<div class="empty">'+(secError?'시세를 불러오지 못했습니다.':'시세 수신 중…')+'</div>';return;}
  const basisChip=`<div class="rank-note basis"><i class="lv-dot"></i>LIVE · ${sessionBasis().label}</div>`;
  const chg=rows.map(s=>qBasis(s).chg);   // [수정] 초기화 시간대 '온도 25점' 오판 방지 — 마지막 장 기준 유지
  const up=chg.filter(v=>v>0).length,dn=chg.filter(v=>v<0).length,flat=chg.length-up-dn;
  const strong=chg.filter(v=>v>=3).length,weak=chg.filter(v=>v<=-3).length;
  const avg=chg.reduce((a,b)=>a+b,0)/chg.length;
  const n=chg.length;
  // 세 축을 가중 평균해 한쪽으로 쏠려도 0/100에 붙지 않게 한다.
  const cl=(v)=>Math.max(0,Math.min(100,v));
  const tBreadth=up/n*100;                                  // 상승 종목 비율
  const tAvg=cl(50+avg*12);                                 // 평균 등락률(±4% ≈ 0~100)
  const tStrong=cl(50+((strong-weak)/n)*120);               // 강한 상승/하락 종목 격차
  const temp=Math.round(0.45*tBreadth+0.35*tAvg+0.20*tStrong);
  const label=temp>=75?'과열':temp>=60?'강세':temp>=40?'중립':temp>=25?'약세':'침체';
  $('thermoBody').innerHTML=basisChip+`
    <div class="th-top"><div class="th-val num">${temp}<i>℃</i></div><div class="th-lb">${label}</div></div>
    <div class="th-bar"><i style="left:${temp}%"></i></div>
    <div class="th-grid">
      <div><span>상승</span><b class="up num">${up}</b></div>
      <div><span>보합</span><b class="num">${flat}</b></div>
      <div><span>하락</span><b class="down num">${dn}</b></div>
      <div><span>+3% 이상</span><b class="up num">${strong}</b></div>
      <div><span>-3% 이하</span><b class="down num">${weak}</b></div>
      <div><span>평균 등락</span><b class="num ${dirOf(avg)}">${pctS(avg)}</b></div>
    </div>
    <div class="th-sub">상승 비율 ${tBreadth.toFixed(0)} · 등락 강도 ${tAvg.toFixed(0)} · 강세 격차 ${tStrong.toFixed(0)} (가중 평균)</div>
    <div class="pro-note">분석 대상 ${rows.length}종목의 실시간 등락 분포입니다. 온도는 평균 등락률과 상승 종목 비율로 산출한 참고 지표입니다.</div>`;
}
/* ===== 포트폴리오 진단 ===== */
function renderPortDiag(){
  if(!holdings.length){$('portBody').innerHTML='<div class="empty">보유 종목이 없습니다. 거래·주문에서 매수하면 진단이 표시됩니다.</div>';return;}
  const items=holdings.map(h=>{const s=byCode[h.code]||{};const px=s.price??h.avg;const amt=px*h.qty;
    return {code:h.code,name:s.name||h.code,amt,pnl:(px-h.avg)*h.qty,rate:(px/h.avg-1)*100,tag:(s.tags&&s.tags[0])||'기타'};});
  const total=items.reduce((a,b)=>a+b.amt,0)||1;
  items.forEach(x=>x.w=x.amt/total*100);
  const hhi=Math.round(items.reduce((a,b)=>a+Math.pow(b.w/100,2),0)*10000);
  const conc=hhi>=5000?'매우 높음':hhi>=2500?'높음':hhi>=1500?'보통':'낮음';
  const sec={};items.forEach(x=>{sec[x.tag]=(sec[x.tag]||0)+x.w;});
  const secArr=Object.entries(sec).sort((a,b)=>b[1]-a[1]);
  const top=secArr[0];
  const win=items.filter(x=>x.pnl>0).length;
  $('portBody').innerHTML=`
    <div class="pd-cards">
      <div class="pd-c"><span>보유 종목수</span><b class="num">${items.length}</b></div>
      <div class="pd-c"><span>집중도(HHI)</span><b class="num">${hhi.toLocaleString()}</b><i>${conc}</i></div>
      <div class="pd-c"><span>최대 섹터 비중</span><b class="num">${top[1].toFixed(1)}%</b><i>${top[0]}</i></div>
      <div class="pd-c"><span>수익 종목</span><b class="num">${win} / ${items.length}</b></div>
    </div>
    <div class="pd-t">종목별 비중</div>
    <div class="etf-hold">${items.slice().sort((a,b)=>b.w-a.w).map(x=>`<div class="etf-hold-r"><div class="etf-hold-n">${x.name} <span class="num ${dirOf(x.rate)}">${pctS(x.rate)}</span></div>
      <div class="etf-hold-w"><div class="etf-bar"><i style="width:${Math.min(100,x.w)}%"></i></div><span class="num">${x.w.toFixed(1)}%</span></div></div>`).join('')}</div>
    <div class="pd-t">섹터 분포</div>
    <div class="etf-hold">${secArr.map(([k,v])=>`<div class="etf-hold-r"><div class="etf-hold-n">${k}</div>
      <div class="etf-hold-w"><div class="etf-bar"><i style="width:${Math.min(100,v)}%"></i></div><span class="num">${v.toFixed(1)}%</span></div></div>`).join('')}</div>
    <div class="pro-note">${hhi>=2500?'특정 종목 비중이 커 <b>분산이 부족</b>합니다. 한 종목의 변동이 전체 손익을 크게 좌우할 수 있습니다.':'비교적 고르게 분산되어 있습니다.'}
      ${top[1]>=50?` 또한 <b>${top[0]}</b> 섹터 비중이 ${top[1].toFixed(0)}%로 높아 업종 리스크에 노출됩니다.`:''}</div>`;
}
/* ===== 종목 비교 ===== */
function renderCompare(){
  const codes=[...new Set([...watchlist,...holdings.map(h=>h.code)])].slice(0,6);
  if(!codes.length){$('cmpBody').innerHTML='<div class="empty">관심종목이나 보유종목을 추가하면 비교표가 표시됩니다.</div>';return;}
  const rows=codes.map(c=>byCode[c]).filter(s=>s&&s.price!=null);
  $('cmpBody').innerHTML=`<div class="cmp-wrap"><table class="cmp"><thead><tr><th>종목</th><th>현재가</th><th>등락률</th><th>고가대비</th><th>거래대금</th></tr></thead><tbody>`+
    rows.map(s=>{const chg=chgPct(s)??0;
      const pos=(s.high>s.low)?(s.price-s.low)/(s.high-s.low)*100:50;
      const _cp=dispQuote(s.code),_px=(_cp&&_cp.price!=null)?_cp.price:s.price;   // [수정] 통합가
      return `<tr data-code="${s.code}"><td>${stockLogo(s.code,s.name,'sm')}${s.name}${mktTag(s.code,s.market)}</td><td class="num">${KRW(_px)}</td>
        <td class="num ${dirOf(chg)}">${pctS(chg)}</td><td class="num">${pos.toFixed(0)}%</td><td class="num">${((s.value||0)/1e8).toFixed(0)}억</td></tr>`;}).join('')+
    '</tbody></table></div>';
  $('cmpBody').querySelectorAll('tr[data-code]').forEach(r=>r.onclick=()=>openTrade(r.dataset.code));
}
function runRisk(){
  const cap=Number($('rkCap').value||0),risk=Number($('rkRisk').value||2),buy=Number($('rkBuy').value||0),stop=Number($('rkStop').value||0);
  const el=$('rkBody');
  if(!cap||!buy||!stop||stop>=buy){el.innerHTML='<div class="empty">총 투자금·매수가·손절가를 입력하세요. (손절가는 매수가보다 낮아야 합니다)</div>';return;}
  const lossPer=buy-stop;                       // 1주당 손실
  const allow=cap*risk/100;                     // 허용 손실 금액
  const qty=Math.floor(allow/lossPer);
  const amount=qty*buy;
  const weight=amount/cap*100;
  const stopPct=(1-stop/buy)*100;
  el.innerHTML=`<div class="pd-cards">
      <div class="pd-c"><span>적정 매수 수량</span><b class="num">${KRW(qty)}주</b></div>
      <div class="pd-c"><span>투입 금액</span><b class="num">${KRW(amount)}원</b><i>비중 ${weight.toFixed(1)}%</i></div>
      <div class="pd-c"><span>손절 시 손실</span><b class="num down">-${KRW(qty*lossPer)}원</b><i>총자산의 ${risk}%</i></div>
      <div class="pd-c"><span>손절폭</span><b class="num">${stopPct.toFixed(1)}%</b></div>
    </div>
    <div class="pro-note">${weight>40?'⚠️ 한 종목 비중이 <b>'+weight.toFixed(0)+'%</b>로 매우 큽니다. 손절폭이 좁을수록 수량이 커지므로, 비중 상한도 함께 정하는 것이 안전합니다.':'허용 손실('+risk+'%) 기준으로 계산한 수량입니다. 손절가를 지키지 못하면 이 계산은 의미가 없습니다.'}</div>`;
}
/* ===== [D3] 관심종목 목표가 알림 ===== */
function targetCell(code){
  const t=priceTargets[code]||{};
  const up=t.up?t.up.price:'', dn=t.down?t.down.price:'';
  const tags=(t.up?'<span class="tgt-tag">▲'+KRW(t.up.price)+'</span>':'')+(t.down?'<span class="tgt-tag">▼'+KRW(t.down.price)+'</span>':'');
  return `<div class="tgt-wrap" data-tc="${code}" onclick="event.stopPropagation()">
    <input class="num" data-tt="up" inputmode="numeric" placeholder="▲상승" value="${up}">
    <input class="num" data-tt="down" inputmode="numeric" placeholder="▼하락" value="${dn}">${tags}</div>`;
}
function bindTargetInputs(root){
  if(!root)return;
  root.querySelectorAll('.tgt-wrap input').forEach(inp=>{
    inp.onclick=(e)=>e.stopPropagation();
    inp.onchange=(e)=>{e.stopPropagation();
      const code=inp.closest('.tgt-wrap').dataset.tc, type=inp.dataset.tt;
      setTarget(code,type,inp.value.replace(/[^0-9]/g,''));};
  });
}

let priceTargets={};   // 계정별 값은 reloadPerUser()에서 로드
let notifyOk=false;
function saveTargets(){ pset('priceTargets',priceTargets); }
async function askNotify(){
  try{ if(!('Notification' in window))return false;
    if(Notification.permission==='granted'){notifyOk=true;return true;}
    if(Notification.permission==='denied')return false;
    const p=await Notification.requestPermission(); notifyOk=(p==='granted'); return notifyOk;
  }catch(e){ return false; }
}
function setTarget(code,type,val){
  const c=String(code||'').toUpperCase(); if(!/^[0-9A-Z]{6}$/.test(c))return;
  priceTargets[c]=priceTargets[c]||{};
  if(val==null||val===''||!(+val>0))delete priceTargets[c][type]; else priceTargets[c][type]={price:+val,fired:false};
  if(!Object.keys(priceTargets[c]).length)delete priceTargets[c];
  saveTargets(); askNotify(); renderWatch();
  toast('ok','목표가 설정',(byCode[c]&&byCode[c].name||c)+' · '+(type==='up'?'상승':'하락')+' '+(val?KRW(+val)+'원':'해제'));
}
/* 시세가 갱신될 때마다 목표가 도달 여부를 확인한다 */
function checkTargets(code){
  const t=priceTargets[code]; if(!t)return;
  const st=byCode[code]; if(!st||st.price==null)return;
  const fire=(kind,tt)=>{
    if(!(userPrefs.alerts&&userPrefs.alerts.target!==false))return;   // [S10] 알림 마스터 스위치
    if(!tt||tt.fired)return;
    tt.fired=true; saveTargets();
    const nm=(st.name||code), msg=nm+' '+KRW(st.price)+'원 · 목표가 '+KRW(tt.price)+'원 '+(kind==='up'?'도달(상승)':'도달(하락)');
    toast(kind==='up'?'buy':'sell','목표가 도달',msg);
    try{ if(notifyOk&&document.hidden)new Notification('LIVE증권 · 목표가 도달',{body:msg}); }catch(e){}
  };
  if(t.up&&st.price>=t.up.price)fire('up',t.up);
  if(t.down&&st.price<=t.down.price)fire('down',t.down);
  // 목표가에서 3% 이상 멀어지면 재무장(같은 알림 반복 방지 + 다음 도달은 다시 알림)
  if(t.up&&t.up.fired&&st.price<t.up.price*0.97){t.up.fired=false;saveTargets();}
  if(t.down&&t.down.fired&&st.price>t.down.price*1.03){t.down.fired=false;saveTargets();}
}

/* ===== [D4] 자산 추이 (일별 평가금액) ===== */
let equityHist=[]; try{equityHist=JSON.parse(localStorage.getItem('equityHist')||'[]')||[];}catch(e){equityHist=[];}
/* ══ [v2.9.3] 총자산 추이 — 하루 1점에서 분 단위 시계열로 ═══════════════════
   [무엇이 잘못됐나]
   예전 recordEquity 는 "같은 날이면 마지막 값을 덮어쓴다"였다. 그래서 첫날에는
   점이 딱 하나뿐이고, 그 하나마저 호출될 때마다 현재값으로 갱신됐다.
   결과적으로 시작값 == 현재값 이 되어 무슨 거래를 하든 그래프는 항상 수평선이었다.
   (첨부 사진: 케이씨텍 +5,200원 평가손익이 났는데도 "아직 변동이 없어 기준선으로 표시")
   [해결]
   ① 3분 버킷으로 장중 점을 쌓는다 — 같은 버킷 안이면 값만 갱신, 값이 그대로면 점을 늘리지 않는다.
   ② 지난 날짜의 장중 점은 그날 마지막 값 하나로 접어 저장량을 억제한다(하루 1점 유지).
   ③ 첫 거래 직후에도 곡선이 보이도록 매매 기록에서 과거 점을 복원한다(아래 seedEquityFromTrades).
   ══════════════════════════════════════════════════════════════════════════ */
const EQ_BUCKET=3*60e3;
function eqTotalNow(){
  /* [v4.5] 자산 추이에 NaN 이 한 번이라도 들어가면 그래프가 통째로 깨진다.
     보유 한 줄이 손상돼도 전체가 오염되지 않도록 정수로 정규화해 합산한다. */
  const ev=(Array.isArray(holdings)?holdings:[]).reduce((a,h)=>{
    if(!h)return a;const st=byCode[h.code]||{};
    const q=Math.trunc(Number(h.qty))||0, av=Math.trunc(Number(h.avg))||0;
    if(q<=0)return a;
    const px=Math.trunc(Number(st.price!=null?st.price:av))||av;
    return a+px*q;},0);
  const c=Math.trunc(Number(cash))||0;
  return Math.max(0,ev)+Math.max(0,c);
}
/* ══ [v4.5 · 치명] 날짜를 한국시간(KST)으로 통일한다 ═══════════════════════
   [무엇이 잘못됐나]
   거래 기록·자산추이·급등로그는 new Date().toISOString() 즉 UTC 날짜를 썼는데,
   매매일지 조회 필터(jrFiltered)는 isoLocal() 즉 기기 로컬 날짜를 썼다.
   한국은 UTC+9 라서 00:00~09:00(KST) 사이의 매매는 UTC 로는 '어제'다.
   → 새벽 1시에 산 종목이 date:'2026-08-04' 로 저장되고, '오늘(2026-08-05)'
     필터에 걸리지 않아 당일매매가 비고 금일정산금액이 0으로 떴다.
     자산 추이도 하루 밀려 '2026-08-04 · 1일차'로 표시됐다.
   [해결] 이 앱의 모든 '하루'는 한국 증시 기준이므로 KST 로 못 박는다.
   ═════════════════════════════════════════════════════════════════════════ */
function kstDay(t){ return new Date((t==null?Date.now():+t)+9*3600e3).toISOString().slice(0,10); }
function kstMonth(t){ return kstDay(t).slice(0,7); }
/* n일 전 KST 날짜 (매매일지 '1일전/2일전' 조회용) */
function kstDayAgo(n){ return kstDay(Date.now()-(+n||0)*86400e3); }
function eqDay(t){ return kstDay(t); }
function compactEquity(){
  const today=eqDay(Date.now()), keepOld={}, todayPts=[];
  equityHist.forEach(pt=>{
    if(!pt||pt.v==null)return;
    if(pt.d===today)todayPts.push(pt); else keepOld[pt.d]=pt;   // 지난 날은 마지막 값만
  });
  /* 당일 점이 너무 불어나면 처음/끝을 남기고 절반씩 솎아낸다(모양은 유지된다) */
  let td=todayPts;
  while(td.length>300){
    const keep=[td[0]];
    for(let i=1;i<td.length-1;i+=2)keep.push(td[i]);
    keep.push(td[td.length-1]); td=keep;
  }
  equityHist=Object.keys(keepOld).sort().map(k=>keepOld[k]).concat(td);
  if(equityHist.length>600)equityHist=equityHist.slice(-600);
}
function recordEquity(){
  if(!currentUser)return;
  const total=Math.round(eqTotalNow());
  if(!(total>0))return;
  const now=Date.now(), day=eqDay(now);
  const last=equityHist[equityHist.length-1];
  if(!last){ equityHist.push({d:day,t:now,v:total}); }
  else{
    const lt=last.t||Date.parse(last.d+'T15:30:00+09:00')||0;
    /* [v3.1 · 톱니 그래프 원인 ①]
       시세가 두 소스(통합·KRX 등)를 오가며 A,B,A,B… 두 값을 번갈아 주면
       '값이 바뀌면 무조건 새 점' 규칙이 그 왕복을 전부 점으로 남겼다.
       거래 1건뿐인데 산맥처럼 보인 이유다. 왕복은 접고, 3분 버킷 안에서는 값만 갱신한다.
       (첫날 기준선은 seedEquityFromTrades 가 1회 플래그로 따로 보장하므로 안전) */
    if(last.v===total){ last.t=Math.max(lt,now); }
    else{
      const p2=equityHist[equityHist.length-2];
      if(p2&&p2.v===total&&(now-(p2.t||0))<EQ_BUCKET){ equityHist.pop(); p2.t=now; }   // A,B,A 왕복 → 접기
      else if(now-lt<EQ_BUCKET){ last.v=total; last.t=now; }                            // 같은 버킷 → 갱신
      else equityHist.push({d:day,t:now,v:total});
    }
  }
  compactEquity();
  try{localStorage.setItem('equityHist',JSON.stringify(equityHist));}catch(e){}
}
/* 매매 기록으로 과거 구간을 복원한다.
   현재 상태에서 거래를 역순으로 되돌리면 '첫 거래 직전' 상태가 나오고,
   거기서 다시 앞으로 진행하며 각 거래 직후의 총자산을 찍는다.
   과거 시세는 보관하지 않으므로 각 종목은 '그때 체결가'로 평가한다(근사).
   마지막 점은 recordEquity 가 실제 현재값으로 다시 찍으므로 오차가 남지 않는다. */
function seedEquityFromTrades(){
  if(!currentUser)return;
  const logs=(Array.isArray(tradeLog)?tradeLog:[])
    .filter(x=>x&&x.t&&x.code&&x.qty>0&&x.price>0).slice().sort((a,b)=>a.t-b.t);
  if(!logs.length)return;
  /* [v3.0.1 · 치명] 예전 조건은 '점이 3개 이상이면 건너뛴다' 였다.
     그런데 시세가 몇 번만 흔들려도 점이 금방 3개를 넘어서, 정작 필요한
     '매수 직전 기준선'이 영영 안 들어갔다. 그래서 평가손익이 +1,800원인데도
     그래프는 오늘 장중 잡음만 보여 주며 -12원(-0.00%)이 찍혔다(첨부 사진).
     → 사용자당 딱 한 번만 실행하도록 플래그로 바꾼다. 점 개수와 무관하다. */
  let seeded=false;
  try{seeded=localStorage.getItem('eqSeeded:'+currentUser)==='1';}catch(e){}
  if(seeded)return;
  try{localStorage.setItem('eqSeeded:'+currentUser,'1');}catch(e){}
  let c=cash; const pos={};
  holdings.forEach(h=>{pos[h.code]=(pos[h.code]||0)+h.qty;});
  for(let i=logs.length-1;i>=0;i--){               // 거꾸로 되감기
    const L=logs[i], amt=L.price*L.qty;
    if(L.side==='sell'){ c-=amt; pos[L.code]=(pos[L.code]||0)+L.qty; }
    else { c+=amt; pos[L.code]=(pos[L.code]||0)-L.qty; }
  }
  const mark={};
  const valNow=()=>Object.keys(pos).reduce((a,k)=>a+(pos[k]>0?pos[k]*(mark[k]||(byCode[k]&&byCode[k].price)||0):0),0)+c;
  const pts=[];
  if(c>0)pts.push({t:logs[0].t-6e4,v:Math.round(c)});          // 첫 거래 직전 = 예수금만
  for(const L of logs){                            // 다시 앞으로
    const amt=L.price*L.qty;
    if(L.side==='sell'){ c+=amt; pos[L.code]=(pos[L.code]||0)-L.qty; }
    else { c-=amt; pos[L.code]=(pos[L.code]||0)+L.qty; }
    mark[L.code]=L.price;
    pts.push({t:L.t,v:Math.round(valNow())});
  }
  const merged=pts.filter(x=>x.v>0).map(x=>({d:eqDay(x.t),t:x.t,v:x.v}))
    .concat(equityHist.map(x=>({d:x.d,t:x.t||Date.parse(x.d+'T15:30:00+09:00')||0,v:x.v})))
    .filter(x=>x.v>0).sort((a,b)=>a.t-b.t);
  const out=[];
  merged.forEach(x=>{ const L=out[out.length-1];
    if(!L||(x.v!==L.v&&x.t-L.t>1e3))out.push(x); else if(L)L.t=Math.max(L.t,x.t); });
  equityHist=out;
  compactEquity();
  try{localStorage.setItem('equityHist',JSON.stringify(equityHist));}catch(e){}
}
function drawEquity(){
  const cv=$('equityChart'); if(!cv)return;
  const leg=$('eqLegend');
  const pts=equityHist.slice(-120);
  /* [v2.5.1] 무한 증식 버그 수정: 예전엔 H를 cv.height(이미 dpr가 곱해진 값)에서 읽어
     그리기마다 dpr배로 커졌다(150→450→1350…). 이제 CSS 표시 높이만 기준으로 삼는다. */
  const ctx=cv.getContext('2d'); const W=cv.clientWidth||cv.width, H=cv.clientHeight||150;
  const dpr=window.devicePixelRatio||1; cv.width=W*dpr; cv.height=H*dpr; ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);
  if(!pts.length){   /* [v2.5.7] 기록 전에도 현재 평가액 기준선을 그린다 */
    const v=totalAssetsNow(),y0=H*0.5,col=getCss('--sub-2','#9aa5b4');
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(10,y0);ctx.lineTo(W-14,y0);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(W-14,y0,4,0,Math.PI*2);ctx.fill();
    if(leg)leg.innerHTML=`현재 평가액 <b class="num">${KRW(Math.round(v))}원</b> · 거래가 쌓이면 추이가 그려집니다`;
    return;
  }
  if(pts.length===1){   /* [수정] 1일차부터 표시 — 오늘 값을 기준선+점으로 그린다 */
    const v=pts[0].v, y0=H*0.5;
    const col=getCss('--up','#e5484d');
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([5,4]);
    ctx.beginPath();ctx.moveTo(10,y0);ctx.lineTo(W-14,y0);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=col;ctx.beginPath();ctx.arc(W-14,y0,4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=col;ctx.font='bold 11px Pretendard';ctx.textAlign='right';ctx.textBaseline='bottom';
    ctx.fillText(KRW(Math.round(v))+'원',W-10,y0-8);
    if(leg)leg.textContent=(pts[0].d||'오늘')+' · 1일차 평가금액 '+KRW(Math.round(v))+'원 — 내일부터 변화가 선으로 이어집니다.';
    return;
  }
  const vs=pts.map(p=>p.v); let mn=Math.min(...vs), mx=Math.max(...vs); const pad=8;
  /* [v3.1 · 톱니 원인 ②] 값 폭이 24원이어도 min-max 정규화가 그걸 화면 전체 높이로
     늘려 +0.01%가 절벽처럼 보였다. 폭이 0.3% 미만이면 세로축을 그만큼 넓혀
     실제 비율에 가깝게 보여 준다. */
  {const _p=Math.max(1000,(mx||1)*0.0015); if(mx-mn<_p){const _c=(mx+mn)/2; mn=_c-_p/2; mx=_c+_p/2;}
   const _e=(mx-mn)*0.22; mn-=_e; mx+=_e;}   // [v3.7] 선이 위·아래 변에 붙지 않게 22% 여백
  const x=(i)=>pad+(W-pad*2)*i/(pts.length-1);
  const y=(v)=>H-pad-(H-pad*2)*((v-mn)/((mx-mn)||1));
  const up=vs[vs.length-1]>=vs[0];
  const col=up?getCss('--up','#e5484d'):getCss('--down','#3478f6');
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,col+'33'); g.addColorStop(1,col+'00');
  ctx.beginPath(); ctx.moveTo(x(0),y(vs[0])); pts.forEach((p,i)=>ctx.lineTo(x(i),y(p.v)));
  ctx.lineTo(x(pts.length-1),H-pad); ctx.lineTo(x(0),H-pad); ctx.closePath(); ctx.fillStyle=g; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x(0),y(vs[0])); pts.forEach((p,i)=>ctx.lineTo(x(i),y(p.v)));
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
  /* [v2.5] 벤치마크 — 코스피를 같은 기간 정규화(시작=내 자산 시작값)해 회색 점선으로 겹친다 */
  let bmTxt='';
  try{
    const kh=(market.history&&market.history.KOSPI)||[];
    if(kh.length>=2&&pts.length>=2){
      const kb=kh.slice(-pts.length);
      if(kb.length>=2){
        const k0=kb[0],scale=vs[0]/k0;
        const ky=(v)=>y(v*scale);
        ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(148,163,184,.85)';ctx.lineWidth=1.6;
        ctx.beginPath();kb.forEach((v,i)=>{const xi=pad+(W-pad*2)*i/(kb.length-1);i?ctx.lineTo(xi,ky(v)):ctx.moveTo(xi,ky(v));});
        ctx.stroke();ctx.setLineDash([]);
        const kr=(kb[kb.length-1]-k0)/k0*100;
        bmTxt=' · 코스피 <b class="'+(kr>=0?'up':'down')+'">'+pctS(kr)+'</b><span class="eq-bm">‑ ‑ 코스피(정규화)</span>';
      }
    }
  }catch(e){}
  if(leg){const chg=vs[vs.length-1]-vs[0], rate=vs[0]?chg/vs[0]*100:0;
    leg.innerHTML=pts[0].d+' → '+pts[pts.length-1].d+' · 내 자산 <b class="'+(chg>=0?'up':'down')+'">'+signed(chg)+'원 ('+pctS(rate)+')</b>'+bmTxt;}
}
function getCss(v,f){try{return getComputedStyle(document.documentElement).getPropertyValue(v).trim()||f;}catch(e){return f;}}

/* ===== [D5] 거래내역 CSV 내보내기 ===== */
function exportTradesCsv(){
  if(!tradeLog.length){toast('warn','내보낼 거래내역이 없습니다','매매 후 다시 시도하세요');return;}
  const head=['일자','시각','종목명','종목코드','구분','수량','단가','거래대금','수수료','세금','실현손익','수익률(%)'];
  const esc=(v)=>{const t=String(v==null?'':v); return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const rows=tradeLog.map(t=>[t.date,new Date(t.ts).toLocaleTimeString('ko-KR'),t.name,t.code,
    t.side==='buy'?'매수':'매도',t.qty,t.price,t.amount,t.fee,t.tax,t.pnl||0,(t.roi||0).toFixed(2)]);
  const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});   // BOM: 엑셀 한글 깨짐 방지
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='LIVE증권_거래내역_'+kstDay()+'.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('ok','CSV 내보내기 완료',tradeLog.length.toLocaleString()+'건을 저장했습니다');
}

/* ===== [D1] NXT 명단 변경 이력 ===== */
let nhCache=null;
function renderNxtHist(){ if(nhCache)paintNxtHist(nhCache); }
async function loadNxtHist(){
  const b=$('nhBody'); if(!b)return;
  b.innerHTML='<div class="empty">명단 이력을 불러오는 중…</div>';
  try{ fnBump(); const r=await fetch('/api/nxthistory',{cache:'default'}); nhCache=await r.json(); paintNxtHist(nhCache); }
  catch(e){ b.innerHTML='<div class="empty">이력을 불러오지 못했습니다.</div>'; }
}
function paintNxtHist(j){
  const b=$('nhBody'); if(!b)return;
  if(!j||!j.ok){ b.innerHTML='<div class="empty">'+((j&&j.error)||'이력을 만들지 못했습니다')+'</div>'; return; }
  const c=j.current||{};
  const rowsOf=(arr,cls)=>arr.length?('<div class="nh-list">'+arr.slice(0,60).map(x=>
      `<div class="nh-row ${cls}" data-code="${x.code}"><span>${x.name||x.code}</span><i>${x.code}</i></div>`).join('')
      +(arr.length>60?`<div class="ea-more">외 ${(arr.length-60).toLocaleString()}종</div>`:'')+'</div>')
    :'<div class="nh-none">해당 없음</div>';
  b.innerHTML=`<div class="nh-cur"><b>현재 ${(c.count||0).toLocaleString()}종목</b>
      · 코스피 ${(c.kospi||0).toLocaleString()} / 코스닥 ${(c.kosdaq||0).toLocaleString()}
      · 기준일 <b>${c.asOf||'?'}</b>${c.quarter?' · '+c.quarter:''}</div>
    ${j.previous?`<div class="nh-cmp">직전(${j.previous.asOf} · ${j.previous.count.toLocaleString()}종목) 대비 변경</div>`:'<div class="nh-cmp">직전 이력이 없어 이번 분기 공식 편출 목록만 표시합니다.</div>'}
    <div class="nh-sec"><div class="nh-h up">편입 ${(j.added||[]).length}</div>${rowsOf(j.added||[],'in')}</div>
    <div class="nh-sec"><div class="nh-h down">편출 ${((j.removed||[]).length||(j.officialRemoved||[]).length)}</div>${rowsOf((j.removed&&j.removed.length?j.removed:j.officialRemoved)||[],'out')}</div>
    ${(j.timeline||[]).length>1?'<div class="nh-tl">기록된 기준일: '+j.timeline.map(t=>t.asOf).join(' → ')+'</div>':''}`;
  b.querySelectorAll('.nh-row').forEach(r=>r.onclick=()=>{const cd=r.dataset.code;if(/^[0-9A-Z]{6}$/.test(cd)){ensureStock(cd,'','');openTrade(cd);}});
}

/* ===== 내일 장 추천주 ===== */
let picksCache=null, picksBusy=false;
function renderPicks(){
  if(picksCache&&picksCache.picks&&picksCache.picks.length)paintPicks(picksCache);
}
/* [수정] 무한 로딩 2가지 원인 해결:
   ① 모든 요청에 t=시각 파라미터 → URL 이 매번 달라져 엣지 CDN 캐시를 확실히 우회
      (cache:'no-store' 는 브라우저 캐시만 우회하고 CDN 은 못 뚫는다)
   ② '새로 생성'은 예전 결과의 generatedAt 을 기억해 두고, '다른 generatedAt'(=새 결과)이
      나올 때까지 기다린다. 예전엔 재생성 중 옛 캐시 결과를 받으면 그걸 새 결과로 착각하고 멈췄다. */
async function loadPicks(force){
  if(picksBusy)return; picksBusy=true;
  const btn=$('picksRun'); if(btn){btn.disabled=true;btn.textContent='분석 중…';}
  const prevGen=(force&&picksCache&&picksCache.generatedAt)||null;   // 재생성이면 '이전 결과' 식별자
  $('picksBody').innerHTML='<div class="empty">다음 개장일 추천주를 분석하는 중입니다… (처음 한 번은 최대 30초)</div>';
  try{
    fnBump(3);
    const r=await fetch('/api/picks?'+(force?'refresh=1&':'')+'t='+Date.now(),{cache:'no-store'});
    picksCache=await r.json();
    paintPicks(picksCache);
    const stale=prevGen&&picksCache&&picksCache.generatedAt===prevGen;   // 재생성 요청인데 옛 결과가 돌아옴
    if(picksCache&&(picksCache.building||stale))pollPicks(0,prevGen);
  }catch(e){ $('picksBody').innerHTML='<div class="empty">분석에 실패했습니다. 잠시 후 다시 시도해 주세요.</div>'; }
  finally{ picksBusy=false; if(btn){btn.disabled=false;btn.textContent='새로 생성';} }
}
async function pollPicks(n,prevGen){
  if(n>20){   // 최대 약 3분 — 정직하게 상태를 알린다
    const last=picksCache;
    if(last&&last.picks&&last.picks.length){ paintPicks(last); }
    else $('picksBody').innerHTML='<div class="empty">생성이 예상보다 오래 걸리고 있습니다. 잠시 뒤 「새로 생성」을 다시 눌러 주세요.</div>';
    return;
  }
  await new Promise(r=>setTimeout(r,9000));
  try{
    /* [수정] 백그라운드 생성이 오래 걸리거나 배포 환경에서 막혀 있으면
       4회째(약 36초)부터 sync=1 로 서버가 즉석에서 짧게 계산한 결과라도 받아 화면을 채운다. */
    const sync=n>=3?'sync=1&':'';
    const r=await fetch('/api/picks?'+sync+'t='+Date.now(),{cache:'no-store'});
    const j=await r.json();
    const isNew=j&&j.picks&&j.picks.length&&(!prevGen||j.generatedAt!==prevGen);
    if(isNew){picksCache=j;paintPicks(j);return;}
    if(j&&j.building===false&&j.ok===false){picksCache=j;paintPicks(j);return;}   // [수정] 실패 사유를 그대로 보여 주고 대기 종료
    if(j&&j.building){picksCache=j;paintPicks(j);}   // 옛 결과(prevGen과 동일)면 화면 유지한 채 계속 대기
    pollPicks(n+1,prevGen);
  }catch(e){ pollPicks(n+1,prevGen); }
}
function paintPicks(j){
  const body=$('picksBody'); if(!body)return;
  if($('picksTitle'))$('picksTitle').textContent=(j.isReopen?'재개장일':'내일 장')+' 추천주';
  if($('picksSub'))$('picksSub').textContent=(j.dayLabel||'')+' 개장 기준 · 추세·모멘텀·수급 스코어링';
  if($('picksAsOf')&&j.generatedAt){const d=new Date(j.generatedAt);$('picksAsOf').textContent='생성 '+d.getHours()+':'+String(d.getMinutes()).padStart(2,'0')+(j.cached?' · 캐시':'');}
  proLiveStamp('picksLive');
  if(j.building){ body.innerHTML='<div class="empty" style="padding-bottom:6px">'+(j.message||'분석 중입니다…')+'</div>'+'<div class="skel-row"></div><div class="skel-row"></div><div class="skel-row"></div>'; return; }
  if(!j.ok||!j.picks||!j.picks.length){ body.innerHTML='<div class="empty">추천 결과를 만들지 못했습니다. '+(j.why||'')+' 잠시 후 다시 시도해 주세요.</div>'; return; }
  /* [D6] 과거 추천의 실제 성과(적중률) */
  const a=j.accuracy;
  const accHtml=a&&a.samples? `<div class="pk-acc">과거 추천 적중률 <b class="${a.hitRate>=50?'up':'down'}">${a.hitRate}%</b>
      · 평균 수익률 <b class="${a.avgReturn>=0?'up':'down'}">${a.avgReturn>0?'+':''}${a.avgReturn}%</b>
      <span class="pk-acc-n">(표본 ${a.samples.toLocaleString()}건 · 대상일 종가 기준 자동 채점)</span></div>`
    : '<div class="pk-acc pk-acc-none">적중률은 추천이 하루 이상 쌓이면 자동으로 계산됩니다.</div>';
  /* [A1] 확신도 — 엄선 게이트를 통과했는지 사용자가 구분할 수 있게 */
  const g=j.gate;
  const gateHtml=g?(g.passed
    ?`<div class="pk-gate ok">✔ 엄선 기준 통과 ${g.strongN}종 · 커트라인 ${g.minScore}점${g.weakMkt?' · <b>약세장 보수 모드</b>':''}</div>`
    :`<div class="pk-gate warn">⚠ 오늘은 엄선 기준(추세·수급·과열 배제)을 채운 종목이 부족해 조건을 완화했습니다 — <b>확신 낮음</b></div>`)
    :'';
  /* [A3] 최근 채점 이력 — 목표 적중률 70% 진척을 직접 확인 */
  const days=j.accDays;
  const daysHtml=days&&days.length?`<details class="pk-days"><summary>최근 채점 ${days.length}일 펼쳐보기</summary>
    <div class="pk-days-list">${days.map(x=>`<div class="pk-day"><span>${String(x.d).slice(5)}</span><b class="${x.n&&x.hit/x.n>=0.7?'up':x.n&&x.hit/x.n>=0.5?'':'down'}">${x.hit}/${x.n} 적중</b><i class="${x.avgRet>=0?'up':'down'}">${x.avgRet>0?'+':''}${x.avgRet}%</i></div>`).join('')}</div></details>`:'';
  body.innerHTML=gateHtml+accHtml+daysHtml+'<div class="picks-list">'+j.picks.map((p,i)=>{
    const dir=p.rate>0?'up':p.rate<0?'down':'flat';
    const badge=nxtCapability(p.code)===true?'<span class="nxt-badge sm">NXT</span>':'';
    const st=p.stats||{};
    const meta=[st.trendUp?'정배열':null,'RSI '+st.rsi,'거래량 '+st.volRatio+'배',(st.mom20>=0?'+':'')+st.mom20+'%(20일)'].filter(Boolean).join(' · ');
    return `<div class="pick-row" data-code="${p.code}">
      <div class="pk-rank">${i+1}</div>${stockLogo(p.code,p.name)}
      <div class="pk-main"><div class="pk-nm">${p.name} ${badge}<span class="pk-cd">${p.code}</span></div>
        <div class="pk-tags">${(p.tags||[]).map(t=>`<span class="pk-tag${/주의|과매수/.test(t)?' warn':''}">${t}</span>`).join('')}</div>
        <div class="pk-meta">${meta}</div>
        <div class="pk-why">${(st.trendUp?['이평선 정배열']:[]).concat(st.volRatio>=2.2?['거래량 '+st.volRatio+'배 급증']:[]).concat((p.tags||[]).includes('20일 고가 근접')?['신고가 돌파 임박']:[]).concat(st.rsi>=48&&st.rsi<=74?['RSI '+st.rsi+' 건전 구간']:[]).slice(0,3).join(' + ')||'종합 점수 상위'} → 편입</div></div>
      <div class="pk-px"><b class="num">${KRW(p.price)}</b><i class="num ${dir}">${pctS(p.rate)}</i></div>
      <div class="pk-score" title="종합 점수(0~100)"><div class="pk-sc-bar"><i style="width:${p.score}%"></i></div><b>${p.score}</b></div>
    </div>`;
  }).join('')+'</div>'
  /* ══ [v4.11] 티어표 — 엄선 통과분(위 카드) 뒤에 확장 풀을 S/A/B/C로 배치 ══
     엄선 게이트가 3종만 통과시키는 날에도 후보군 전체를 등급으로 볼 수 있다. */
  +(()=>{
    const picked=new Set((j.picks||[]).map(p=>p.code));
    const pool=(j.tiers||[]).filter(x=>x&&x.code&&!picked.has(x.code));
    if(!pool.length)return '';
    const T=[['S',85,'s'],['A',72,'a'],['B',60,'b'],['C',48,'c']], CAP={S:8,A:12,B:14,C:14};
    const buckets={S:[],A:[],B:[],C:[]};
    pool.forEach(x=>{for(const[t,min] of T){if(x.score>=min){if(buckets[t].length<CAP[t])buckets[t].push(x);return;}}});
    const total=buckets.S.length+buckets.A.length+buckets.B.length+buckets.C.length;
    if(!total)return '';
    const row=(t,cls,x)=>`<div class="pk-tr" data-code="${x.code}">
      <span class="pk-tier ${cls}">${t}</span>
      <span class="pk-tr-nm">${x.name}<i class="num">${x.code}</i></span>
      <span class="pk-tr-sc"><i style="width:${Math.min(100,x.score)}%"></i><b class="num">${x.score}</b></span>
      <span class="pk-tr-rt num ${dirOf(x.rate)}">${pctS(x.rate)}</span></div>`;
    return `<div class="pk-tiers"><div class="pk-tiers-h">후보군 티어표 <span>· 점수순 상위 ${total}종 (S≥85 · A≥72 · B≥60 · C≥48)</span></div>
      ${T.map(([t,_,cls])=>buckets[t].length?`<div class="pk-tier-grp">${buckets[t].map(x=>row(t,cls,x)).join('')}</div>`:'').join('')}
      <div class="pk-tiers-n">티어표는 엄선 게이트를 거치지 않은 점수순 후보군입니다 — 위 TOP 추천과 달리 과열·수급 배제 검증 전 단계예요.</div></div>`;
  })();
  bindStockClicks(body);
}

/* [추가] 고급 서비스 '자동 실시간' 표시 — 마지막 자동 갱신 시각 배지 */
function proLiveStamp(id){const el=$(id);if(!el)return;const t=new Date();
  el.innerHTML='<i class="dot on"></i>자동 '+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');}
let proTab='picks';
function setProTab(t){
  proTab=t;
  document.querySelectorAll('#proTabs button').forEach(b=>b.classList.toggle('on',b.dataset.pt===t));
  ['picks','nxthist','surge','accum','screener','thermo','port','compare','bt','risk'].forEach(k=>{const el=$('pro-'+k);if(el)el.hidden=(k!==t);});
  if(t==='picks')renderPicks();
  if(t==='accum')acInit();
  if(t==='nxthist')renderNxtHist();
  if(t==='thermo')renderThermo();
  if(t==='port')renderPortDiag();
  if(t==='compare')renderCompare();
  if(t==='surge')renderSurge();
  if(t==='bt'){renderBtOpts();renderBacktest();}
  /* [추가] 버튼을 누르지 않아도 열자마자 자동 분석 시작 */
  if(t==='picks'&&!picksCache&&!picksBusy)loadPicks(false);
  if(t==='surge'&&!surgeBusy&&(!surgeRes||Date.now()-surgeAt>5*60e3))runSurge();
  if(t==='screener')runScreener();
}

/* ===== 전체 종목 검사 도구 (KRX/NXT 판별·시세 무결성) ===== */
let saRun=false;
/* [D2] 현재 분기 시행일보다 명단 기준일이 오래됐는지 */
function isListStale(asOf){
  if(!asOf)return true;
  const now=new Date(); const y=now.getFullYear();
  const qStartMonth=[1,4,7,10].filter(m=>m<=now.getMonth()+1).pop()||1;
  const curQ=`${y}-${String(qStartMonth).padStart(2,'0')}-01`;
  // 시행일로부터 3일 지나도 옛 명단이면 갱신 실패로 본다(주말·공휴일 여유)
  const graceOk=(now-new Date(curQ))/86400000>3;
  return graceOk && String(asOf)<curQ;
}
function showNxtStaleBanner(asOf){
  if($('nxtStaleBar'))return;
  const d=document.createElement('div'); d.id='nxtStaleBar'; d.className='stale-bar';
  d.innerHTML='<b>NXT 명단 자동 갱신 필요</b> — 새 분기가 시작됐는데 명단이 '+asOf+' 기준입니다. '
    +'<button id="nxtStaleFix">지금 갱신 시도</button><button id="nxtStaleClose" class="x">✕</button>';
  document.body.appendChild(d);
  $('nxtStaleClose').onclick=()=>hideNxtStaleBanner();
  $('nxtStaleFix').onclick=async()=>{
    $('nxtStaleFix').textContent='갱신 중…'; $('nxtStaleFix').disabled=true;
    try{ await fetch('/api/nxtrefresh?run=1',{cache:'no-store'}); toast('ok','갱신 요청됨','1~2분 뒤 자동으로 반영됩니다'); }
    catch(e){ toast('warn','갱신 요청 실패','잠시 후 다시 시도해 주세요'); }
    setTimeout(()=>{NXTLIST.at=0;loadNxtList(true);loadNxtStatus();},90000);
    hideNxtStaleBanner();
  };
}
function hideNxtStaleBanner(){ const b=$('nxtStaleBar'); if(b)b.remove(); }

/* NXT 명단 자동 갱신 상태 표시 */
async function loadNxtStatus(){
  const el=$('nxtStatus'); if(!el)return;
  try{
    const r=await fetch('/api/nxtlist',{cache:'default'});
    const j=await r.json();
    if(!j||!j.ok){ el.innerHTML='<span class="ns-warn">NXT 명단을 불러오지 못했습니다.</span> 잠시 후 자동으로 다시 시도합니다.'; return; }
    const n=(j.codes||[]).length;
    const src=String(j.source||'');
    const auto=/official/.test(src)?'넥스트레이드 공식 사이트에서 자동 수집':/snapshot/.test(src)?'앱에 내장된 공식 정기변경 파일':'자동 판별';
    const q=j.quarter?(' · '+j.quarter):'';
    /* [D2] 분기가 지났는데 명단이 아직 옛 기준일이면 = 자동 갱신이 안 된 것 → 눈에 띄게 알린다 */
    const stale=isListStale(j.asOf);
    el.innerHTML='<b>NXT 거래대상 '+n.toLocaleString()+'종목</b> · 기준일 <b>'+(j.asOf||'?')+'</b>'+q
      +'<br>출처: '+auto
      +(stale?' <span class="ns-warn">· 새 분기 명단을 아직 못 받았습니다</span>':' <span class="ns-ok">· 분기 정기변경(1·4·7·10월) 시 자동 반영</span>');
    if(stale)showNxtStaleBanner(j.asOf); else hideNxtStaleBanner();
  }catch(e){ el.textContent='NXT 명단 상태를 확인하지 못했습니다.'; }
}
function saIssueKo(k){return ({'add':'실제 NXT 체결 · 분기 중 신규 편입','no-data':'시세 없음',
  'badge-nxt':'이름 옆 NXT 배지가 공식 명단과 불일치','badge-src':'가격 옆 시세 배지(KRX/NXT/통합) 산출 실패',
  'badge-session':'세션 규칙표와 다른 배지(휴장/장 전/장 종료/KRX/NXT/통합 판정 불일치)',
  'price-src':'표시 가격이 통합/NXT 시세로 확보되지 않음(값이 KRX 종가에 고정될 위험)','no-mkt':'코스피/코스닥 시장 태그 누락'}[k])||k||'기타';}
async function runStockAudit(){
  if(saRun)return; saRun=true;
  $('saStart').hidden=true; $('saStop').hidden=false;
  $('saBarWrap').hidden=false; $('saStat').hidden=false; $('saFails').innerHTML='';
  const BATCH=40, LANES=4;                 // polling 배치 40종목 × 4레인 = 160종목 동시(빠르게)
  let total=0,okN=0,memberN=0,doneN=0; const fails=[],bfails=[]; const t0=Date.now();   // bfails=[추가] 배지 무결성 위반
  try{fnBump();const r=await fetch('/api/stockaudit?from=0&count=1',{cache:'default'});const j=await r.json();total=j.total||0;}catch(e){}
  if(!total){$('saStat').innerHTML='검사를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';saRun=false;$('saStart').hidden=false;$('saStop').hidden=true;return;}
  const paint=()=>{
    const pct=Math.min(100,Math.round(doneN/total*100));
    $('saBar').style.width=pct+'%';
    const el=Math.round((Date.now()-t0)/1000), speed=doneN/Math.max(1,el), eta=speed>0?Math.round((total-doneN)/speed):0;
    const addN=fails.filter(f=>f.issue==='add').length,bTot=bfails.length;
    $('saStat').innerHTML=`진행 <b>${doneN.toLocaleString()} / ${total.toLocaleString()}</b> (${pct}%) · 공식 명단 NXT <b class="up">${memberN.toLocaleString()}</b>`
      +` · 분기 중 신규 편입 <b class="up">${addN.toLocaleString()}</b>`
      +` · 배지 이상 <b class="${bTot?'down':'up'}">${bTot.toLocaleString()}</b>`
      +` · 경과 ${Math.floor(el/60)}분 ${el%60}초${doneN<total?` · 남은 시간 약 ${Math.floor(eta/60)}분 ${eta%60}초`:''}`;
    const groups={'add':[],'no-data':[]};
    fails.forEach(f=>{(groups[f.issue]||(groups[f.issue]=[])).push(f);});
    const listOf=(arr,label,cls)=>arr.length?`<div class="ea-grp ${cls||''}">${label} <b>${arr.length}</b></div>
      <div class="ea-list">${arr.slice(0,30).map(f=>`<div class="ea-row" data-code="${f.code}"><span>${f.name||f.code}</span><i>${saIssueKo(f.issue)}</i></div>`).join('')}</div>
      ${arr.length>30?`<div class="ea-more">외 ${(arr.length-30).toLocaleString()}종</div>`:''}`:'';
    let html='';
    if(doneN>=total){
      html+=`<div class="ea-sum"><div class="ea-exp"><b class="up">넥스트레이드 공식 명단(2026년 3분기 정기변경, 610종)을 기준으로 전 종목을 대조했습니다.</b> `
        +`배지는 이 공식 명단을 그대로 따르므로 KRX/NXT 구분이 확정입니다. 아래는 공식 명단에 없지만 실제 NXT 체결이 관측된 종목(분기 중 신규 편입 후보)입니다.`
        +(!nxtActive()?` <b class="down">지금은 NXT 운영시간(08:00~20:00)이 아니라 신규 편입 탐지는 운영시간 검사가 정확합니다. 공식 명단 판정 자체는 시간과 무관하게 정확합니다.</b>`:'')+`</div></div>`;
    }
    /* [추가] 배지 무결성 결과 — 완료 시 요약 칩 + 문제 종목 목록 */
    if(doneN>=total){
      const bn={nx:bfails.filter(f=>f.issue==='badge-nxt').length,src:bfails.filter(f=>f.issue==='badge-src').length,
        ss:bfails.filter(f=>f.issue==='badge-session').length,ps:bfails.filter(f=>f.issue==='price-src').length,
        mk:bfails.filter(f=>f.issue==='no-mkt').length};
      html+=`<div class="ea-sum"><span class="ea-chip ${bn.nx?'bad':'ok'}">이름 옆 NXT 배지 불일치 <b>${bn.nx.toLocaleString()}</b></span>`
        +`<span class="ea-chip ${bn.src?'bad':'ok'}">가격 옆 시세 배지 오류 <b>${bn.src.toLocaleString()}</b></span>`
        +`<span class="ea-chip ${bn.ss?'bad':'ok'}">세션 배지 규칙 불일치 <b>${bn.ss.toLocaleString()}</b></span>`
        +((nxtOnlyWindow()||!krxRegularOpen())?`<span class="ea-chip ${bn.ps?'bad':'ok'}">표시 가격 소스 미확보 <b>${bn.ps.toLocaleString()}</b></span>`
          :'<span class="ea-chip ok">가격 소스 검사 — 정규장(KRX 값)엔 생략</span>')
        +`<span class="ea-chip ${bn.mk?'warn':'ok'}">시장 태그 누락 <b>${bn.mk.toLocaleString()}</b></span>`
        +`<div class="ea-exp">${(bn.nx+bn.src+bn.ss+bn.ps+bn.mk)===0
          ?'<b class="up">전 종목 배지 검사 통과</b> — 이름 옆 NXT 배지, 가격 옆 KRX/NXT/통합 배지(세션 일치 포함), 코스피/코스닥 태그가 전 종목에서 정상입니다.'
          :'아래 종목은 배지 표기가 어긋납니다. 종목을 눌러 실제 화면을 확인해 보세요.'}</div></div>`;
    }
    const bg={'badge-nxt':bfails.filter(f=>f.issue==='badge-nxt'),'badge-src':bfails.filter(f=>f.issue==='badge-src'),
      'badge-session':bfails.filter(f=>f.issue==='badge-session'),'price-src':bfails.filter(f=>f.issue==='price-src'),
      'no-mkt':bfails.filter(f=>f.issue==='no-mkt')};
    html+=listOf(groups['add'],'분기 중 신규 편입 (실제 NXT 체결)')+listOf(groups['no-data'],'시세 없음')
      +listOf(bg['badge-nxt'],'NXT 배지 불일치','bad')+listOf(bg['badge-session'],'세션 배지 규칙 불일치','bad')
      +listOf(bg['price-src'],'표시 가격 소스 미확보','bad')
      +listOf(bg['badge-src'],'시세 배지 오류','bad')+listOf(bg['no-mkt'],'시장 태그 누락');
    $('saFails').innerHTML=html;
    $('saFails').querySelectorAll('.ea-row').forEach(r=>r.onclick=()=>{const c=r.dataset.code;if(/^[0-9A-Z]{6}$/.test(c)){ensureStock(c,'','');openTrade(c);}});
  };
  let next=0;
  const lane=async()=>{
    while(saRun&&next<total){
      const from=next; next+=BATCH; let j=null;
      try{fnBump();const r=await fetch(`/api/stockaudit?from=${from}&count=${BATCH}`,{cache:'default'});j=await r.json();}catch(e){}
      if(!j||!j.ok){doneN=Math.min(total,doneN+BATCH);paint();continue;}
      (j.results||[]).forEach(x=>{ if(x.ok&&x.nxt)memberN++; if(!x.ok)fails.push(x); else okN++;
        /* [추가] 배지 무결성 3종 검사 — 화면 배지 로직을 그대로 재현해 전 종목 대조
           ① 이름 옆 NXT 배지(nxtCapability) vs 넥스트레이드 공식 명단
           ② 가격 옆 시세 배지 — 어떤 입력에서도 KRX/NXT/통합 중 하나가 나와야 함
           ③ 코스피/코스닥 시장 태그 존재 */
        const capC=nxtCapability(x.code);
        if(typeof x.nxt==='boolean'&&(capC===true||capC===false)&&(capC===true)!==x.nxt)
          bfails.push({code:x.code,name:x.name,issue:'badge-nxt'});
        const sb=srcBadgeHtml((dispQuote(x.code)||{}).src);
        if(!sb||!/px-src (nxt|uni|krx)/.test(sb))bfails.push({code:x.code,name:x.name,issue:'badge-src'});
        if(!x.market)bfails.push({code:x.code,name:x.name,issue:'no-mkt'});
        /* [v1.99.1] 세션 배지 검사 — 서버가 관측한 NXT 체결가를 실제 표시 파이프라인(nxtPx→dispQuote)에
           주입해, NXT 운영시간에 'NXT 종목인데 KRX 배지'(케이씨텍 사례)가 나오는지 전 종목 실검증한다.
           검사 자체가 nxtPx 커버리지를 채워 주므로, 검사 후엔 목록 화면 배지도 곧바로 정확해진다. */
        /* [v2.0] 세션 배지 검사 — 규칙표를 검사기 안에서 독립 재계산해 실제 배지 함수와 대조 */
        {
          const hmA=(()=>{const k=kstNow();return k.getUTCHours()*60+k.getUTCMinutes();})();
          const capA=nxtCapability(x.code)===false;
          const expect=marketSessionKST()==='holiday'?'휴장'
            :capA?(hmA<510?'장 전':hmA>=1080?'장 종료':'KRX')
            :(hmA<480?'장 전':hmA>=1200?'장 종료':(nxtLiveBandKST()?'NXT':'통합'));
          const got=mktBadgeInfo(x.code)[0];
          if(got!==expect)bfails.push({code:x.code,name:x.name,issue:'badge-session'});
        }
        /* [v2.0] 표시 가격 소스 검사 — 장외/라이브에 통합·NXT '값'이 실제로 확보되는지(주입 검증) */
        if(x.nxt===true&&nxtCapability(x.code)!==false){
          const live=nxtOnlyWindow(),reg=krxRegularOpen();
          if(live&&x.nxtPrice){
            ensureStock(x.code,x.name||'',x.market||'');
            nxtPx[x.code]={price:x.nxtPrice,prevClose:x.prevClose||x.nxtPrice,t:Date.now()};
            if((dispQuote(x.code)||{}).src!=='NXT')bfails.push({code:x.code,name:x.name,issue:'price-src'});
          }else if(!live&&!reg&&(x.uniPrice||x.nxtPrice)){
            const st2=ensureStock(x.code,x.name||'',x.market||'');
            if(st2){
              if(x.uniPrice)st2.uniPx={price:x.uniPrice,prevClose:x.prevClose||null,t:Date.now()};
              if(x.nxtPrice)st2.nxtPx={price:x.nxtPrice,prevClose:x.prevClose||null,t:Date.now()};
              if((dispQuote(x.code)||{}).src!=='통합')bfails.push({code:x.code,name:x.name,issue:'price-src'});
            }
          }
        }
      });
      doneN=Math.min(total,doneN+(j.results||[]).length); paint();
    }
  };
  await Promise.all(Array.from({length:LANES},lane));
  saRun=false;$('saStart').hidden=false;$('saStop').hidden=true;
  if(doneN>=total)$('saStat').innerHTML+=' · <b>검사 완료</b>';
}

/* ===== 전체 ETF 점검 도구 ===== */
let eaRun=false;

/* ══ [v2.9.4] 종목 로고 정밀 검사 ══════════════════════════════════════════
   저장된 판정을 믿지 않고 전 종목의 로고를 실제로 내려받아 대조한다.
   판정 구분:
     자체     — 그 종목 코드로 로고를 찾음(가장 정확)
     본주대체 — 우선주라 본주 코드 로고를 씀(정상)
     그룹대체 — 계열사라 그룹 대표 로고를 씀(SK이터닉스 → SK CI. 정상이지만 표시)
     없음     — 어느 소스에도 없어 색 배지로 대체됨(실제 로고와 다를 수 있는 항목)
   결과는 즉시 캐시에 반영돼 검사 직후부터 화면에 그대로 뜬다.
   ═══════════════════════════════════════════════════════════════════════ */
let laRun=false;
async function runLogoAudit(){
  if(laRun)return; laRun=true;
  $('laStart').hidden=true; $('laStop').hidden=false;
  $('laBarWrap').hidden=false; $('laStat').hidden=false; $('laFails').innerHTML='';
  /* 대상 = 전 종목(코스피+코스닥) + 전체 ETF + 지금 메모리에 있는 코드 — 하나도 빠뜨리지 않는다 */
  $('laStat').innerHTML='검사 대상 목록을 준비하는 중…';
  let uni=[];
  try{ uni=await loadStockAll(n=>{ $('laStat').innerHTML=`전 종목 목록 불러오는 중… <b>${n.toLocaleString()}</b>종`; })||[]; }catch(e){}
  if(!uni.length&&stockLoading){                       // 혹시 다른 경로가 붙들고 있으면 기다린다
    const t0=Date.now();
    while(stockLoading&&Date.now()-t0<90000)await new Promise(r=>setTimeout(r,300));
    uni=(Array.isArray(stockAll)?stockAll:[]);
  }
  try{ if(!etfList)await loadEtfList(); }catch(e){}
  const map=new Map();
  (Array.isArray(uni)?uni:[]).forEach(x=>{if(x&&x.code)map.set(x.code,{code:x.code,name:x.name||'',market:x.market||'',via:'uni'});});
  (Array.isArray(etfList)?etfList:[]).forEach(x=>{if(x&&x.code&&!map.has(x.code))map.set(x.code,{code:x.code,name:x.name||'',market:x.market||'',via:'etf'});});
  Object.keys(byCode).forEach(c=>{if(!map.has(c))map.set(c,{code:c,name:(byCode[c]||{}).name||'',market:(byCode[c]||{}).market||'',via:'mem'});});
  const list=[...map.values()];
  const total=list.length;
  /* [v2.9.6] '정말 전 종목인가'를 스스로 증명하게 만든다.
     서버가 따로 세는 거래소 기준 종목 수(/api/stockaudit 의 total)와 대조해
     커버리지를 % 로 보여 준다. 어긋나면 경고를 띄운다 — 숫자를 믿어 달라고 하지 않는다. */
  let exTotal=0;
  try{ fnBump(); const r=await fetch('/api/stockaudit?from=0&count=1',{cache:'default'}); const j=await r.json(); exTotal=+(j&&j.total)||0; }catch(e){}
  const etfSet=new Set((Array.isArray(etfList)?etfList:[]).map(x=>x&&x.code).filter(Boolean));
  let nKp=0,nKd=0,nEtf=0,nEtc=0;
  list.forEach(x=>{ if(etfSet.has(x.code)){nEtf++;return;}
    const m=String(x.market||(byCode[x.code]||{}).market||'');
    if(/코스피|KOSPI/i.test(m))nKp++; else if(/코스닥|KOSDAQ/i.test(m))nKd++; else nEtc++; });
  const uniN=(Array.isArray(uni)?uni:[]).length;
  const cov=exTotal?Math.round(uniN/exTotal*1000)/10:0;
  if(!total){ $('laStat').textContent='검사할 종목 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    laRun=false;$('laStart').hidden=false;$('laStop').hidden=true; return; }
  const t0=Date.now();
  let done=0, laStage='1단계 · 서버 일괄 판정 ';   // [v4.5] 어느 단계인지 보이게 한다
  const bySrc={}, own=[],base=[],group=[],fund=[],spac=[],none=[];
  const paint=()=>{
    const dn=Math.max(0,Math.min(done,total));
    const pct=total?Math.min(100,Math.round(dn/total*100)):0;
    $('laBar').style.width=pct+'%';
    const el=Math.round((Date.now()-t0)/1000), sp=dn/Math.max(1,el), eta=sp>0?Math.round((total-dn)/sp):0;
    const okN=own.length+base.length+group.length+fund.length+spac.length;
    /* [v4.5] 확보율 분모를 '검사 진행분'으로 두되, 아직 0건이면 계산하지 않는다.
       예전엔 Math.max(1,done) 이라 done=0 인 동안 okN/1 = 163400% 같은 값이 나왔다.
       분자가 분모를 넘는 일도 없도록 100%로 잘라 둔다. */
    const okPct=dn>0?Math.min(100,Math.round(okN/dn*100)):0;
    $('laStat').innerHTML=`<span class="la-stage">${laStage}</span>`
      +`진행 <b>${dn.toLocaleString()} / ${total.toLocaleString()}</b> (${pct}%)`
      +` · 로고 확보 <b class="up">${okN.toLocaleString()}</b> (${okPct}%)`
      +` · 자체 <b>${own.length.toLocaleString()}</b> · 본주대체 <b>${base.length.toLocaleString()}</b>`
      +` · 그룹대체 <b>${group.length.toLocaleString()}</b> · 운용사대체 <b>${fund.length.toLocaleString()}</b>`
      +` · 스팩대체 <b>${spac.length.toLocaleString()}</b>`
      +` · 없음 <b class="${none.length?'down':'up'}">${none.length.toLocaleString()}</b>`
      +` · 경과 ${Math.floor(el/60)}분 ${el%60}초${dn<total?` · 남은 시간 약 ${Math.floor(eta/60)}분 ${eta%60}초`:''}`;
    let html='';
    if(dn>=total){
      const rows=Object.keys(bySrc).sort((a,b)=>bySrc[b]-bySrc[a])
        .map(k=>`<tr><td>${(window.__scanNames||LOGO_SRC_NAMES)[k]||('소스'+k)}</td><td class="num">${bySrc[k].toLocaleString()}</td><td class="num">${Math.round(bySrc[k]/Math.max(1,okN)*100)}%</td></tr>`).join('');
      html+=`<div class="ea-sum">
        <span class="ea-chip ${exTotal&&cov>=99?'ok':'bad'}">거래소 기준 대조 <b>${uniN.toLocaleString()} / ${exTotal?exTotal.toLocaleString():'?'}</b>${exTotal?` (${cov}%)`:' · 확인 불가'}</span>
        <span class="ea-chip">코스피 <b>${nKp.toLocaleString()}</b></span>
        <span class="ea-chip">코스닥 <b>${nKd.toLocaleString()}</b></span>
        <span class="ea-chip">ETF·ETN <b>${nEtf.toLocaleString()}</b></span>
        ${nEtc?`<span class="ea-chip">시장 미상 <b>${nEtc.toLocaleString()}</b></span>`:''}
        </div>
        ${exTotal&&cov<99?`<div class="ea-sum"><div class="ea-exp"><b class="down">주의 — 목록이 거래소 기준보다 ${(exTotal-uniN).toLocaleString()}종 적습니다(${cov}%).</b> 목록을 다 받지 못한 상태라 일부 종목이 검사에서 빠졌을 수 있습니다. 잠시 후 다시 검사해 주세요.</div></div>`:''}
        ${!exTotal?`<div class="ea-sum"><div class="ea-exp"><b class="down">거래소 기준 종목 수를 확인하지 못했습니다.</b> 아래 숫자가 전 종목을 다 담았는지 보장할 수 없습니다.</div></div>`:''}
        <div class="ea-sum"><div class="ea-exp"><b class="up">검사 대상 ${total.toLocaleString()}종(코스피·코스닥 전 종목 + ETF·ETN + 화면에 올라온 코드)의 로고를 실제로 내려받아 대조했습니다.</b>
        코넥스는 목록 제공 범위 밖이라 포함되지 않습니다.
        '자체'는 그 종목 코드로 직접 찾은 로고, '본주대체'는 우선주가 본주 로고를 쓴 경우, '그룹대체'는 계열사가 그룹 대표 로고를 쓴 경우입니다(모두 실제 CI와 일치).
        맨 아래 목록은 회사 자체에 CI 이미지가 없는 종목입니다(신규 상장 직후·초소형주 등). 오류가 아니라 색 배지로 표시하는 것이 정상이며, 증권사 앱도 같은 방식입니다. 탐색 계획 버전 v${logoPlanVer()}.</div></div>
        <table class="ea-tbl"><thead><tr><th>소스</th><th>건수</th><th>비중</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    const listOf=(arr,label,cls,fmt)=>arr.length?`<div class="ea-grp ${cls||''}">${label} <b>${arr.length.toLocaleString()}</b></div>
      <div class="ea-list">${arr.slice(0,40).map(fmt).join('')}</div>
      ${arr.length>40?`<div class="ea-more">외 ${(arr.length-40).toLocaleString()}종</div>`:''}`:'';
    html+=listOf(spac,'스팩 발기 증권사 CI 대체','',
      f=>`<div class="ea-row" data-code="${f.code}"><span>${htmlEsc(f.name||f.code)}</span><i>${f.code} → ${f.proxy}</i></div>`);
    html+=listOf(none,'CI 이미지가 존재하지 않는 종목 (색 배지로 표시 · 정상)','',
      f=>`<div class="ea-row" data-code="${f.code}"><span>${htmlEsc(f.name||f.code)}</span><i>${f.code}</i></div>`);
    html+=listOf(group,'그룹 CI 대체','',
      f=>`<div class="ea-row" data-code="${f.code}"><span>${htmlEsc(f.name||f.code)}</span><i>${f.code} → ${f.proxy}</i></div>`);
    html+=listOf(fund,'운용사 CI 대체 (ETF·ETN)','',
      f=>`<div class="ea-row" data-code="${f.code}"><span>${htmlEsc(f.name||f.code)}</span><i>${f.code} → ${f.proxy}</i></div>`);
    html+=listOf(base,'본주 로고 대체 (우선주)','',
      f=>`<div class="ea-row" data-code="${f.code}"><span>${htmlEsc(f.name||f.code)}</span><i>${f.code} → ${f.proxy}</i></div>`);
    $('laFails').innerHTML=html;
    bindStockClicks($('laFails'));
  };
  paint();
  /* [v3.1] 검사 방식을 '이미지 1만 번 받기' → '서버 일괄 판정'으로 교체.
     예전엔 종목마다 브라우저가 이미지를 직접 받아 봤다. 직접 소스가 막힌 환경에선
     전 종목이 /api/logo 함수 한 곳에 몰렸고, 동시 실행 한도에 걸려 멀쩡한 로고까지
     시간 초과로 '없음'이 됐다. 이제 24종씩 서버가 원본을 병렬 확인하고 결과만 준다. */
  /* [v4.4] Cloudflare 서브요청 50회 상한에 맞춤 (8종목 × 소스 6곳 = 48)
     [v4.5 · 치명] 이 아래 묶음 생성 for 문이 위 한 줄 주석(//) 뒤에 붙어 있어
     통째로 주석 처리돼 있었다. chunks 가 영원히 빈 배열이라
       · 1차 서버 일괄 판정이 한 번도 실행되지 않고(진행 0/2,875 · 0%)
       · done 이 0 이라 '로고 확보 %' 분모가 1이 되어 163400% 가 찍히고
       · 전 종목이 2·3차 대체 경로로 흘러 '자체' 로고가 그룹/운용사 대체로 오분류됐다.
     주석과 코드를 분리해 원래 설계대로 되돌린다. */
  const CH=8, chunks=[];
  for(let i=0;i<list.length;i+=CH)chunks.push(list.slice(i,i+CH));
  const scanned={}; let scanOK=true;
  /* [v3.4.1 · 치명] 예전엔 묶음 하나만 실패해도 scanOK=false 로 전체를 버리고
     구형 개별 방식으로 4,290종을 처음부터 다시 돌았다. 그래서 진행이 6,210/4,290 으로
     넘치고(1,920 = 실패 전까지 센 80묶음), 검사가 한없이 길어졌으며, 서버 판정이면
     잡혔을 종목(HS효성 등)이 브라우저 개별 탐색에서 시간 초과로 '없음'이 됐다.
     이제 묶음마다 3회 재시도하고, 그래도 안 되면 그 묶음만 3단계 정밀 확인으로 넘긴다. */
  const scanBatch=async(codes)=>{ let last=null;
    for(let a=0;a<3;a++){
      try{
        fnBump();
        const r=await fetch('/api/logoscan?codes='+codes.join(','),{cache:'no-store'});
        if(r.status===404){const e=new Error('404');e.noEndpoint=true;throw e;}
        if(!r.ok)throw new Error('scan '+r.status);
        const j=await r.json();
        if(j&&j.srcNames)window.__scanNames=j.srcNames;
        Object.keys(j.ok||{}).forEach(c=>{scanned[c]=j.ok[c];});
        (j.no||[]).forEach(c=>{if(scanned[c]==null)scanned[c]=-1;});
        return;
      }catch(e){ last=e; if(e&&e.noEndpoint)throw e; await new Promise(rs=>setTimeout(rs,350*(a+1))); }
    }
    throw last; };
  let ci=0;
  const scanLane=async()=>{ while(laRun&&ci<chunks.length){ const k=ci++;
    try{ await scanBatch(chunks[k].map(x=>x.code)); }
    catch(e){
      if(e&&e.noEndpoint){ scanOK=false; return; }          // 엔드포인트 자체가 없을 때만 구형 방식
      chunks[k].forEach(x=>{ if(scanned[x.code]==null)scanned[x.code]=-2; });   // 이 묶음만 3단계로
    }
    done=Math.min(total,done+chunks[k].length); if(ci%2===0||ci>=chunks.length)paint(); } };
  await Promise.all(Array.from({length:6},scanLane));

  if(!scanOK){
    /* 구버전 서버 배포 등으로 일괄 판정이 없으면 예전 방식으로(중계는 10초 대기) */
    laStage='대체 경로 · 개별 확인 ';
    done=0;                              // [v3.4.1] 스캔 단계 집계와 겹쳐 6,210/4,290 이 되던 것 방지
    let cur=0;
    const lane=async()=>{ while(laRun&&cur<total){ const it=list[cur++];
      let r=null; try{ r=await logoProbe(it.code,it.name,{timeout:9000}); }catch(e){}
      if(r&&r.ok){ logoApply(r); bySrc[r.src]=(bySrc[r.src]||0)+1;
        (r.via==='own'?own:r.via==='base'?base:r.via==='fund'?fund:group).push({code:r.code,name:r.name,proxy:r.proxy}); }
      else { if(r)logoApply(r); none.push({code:it.code,name:it.name}); }
      done++; if(done%40===0||done===total)paint(); } };
    await Promise.all(Array.from({length:8},lane));
  } else {
    /* 1차: 자기 코드로 직접 성공한 종목 — 표시용으로 중계 URL 을 기록(항상 같은 소스라 크기 일관) */
    const misses=[];
    for(const it of list){ const v=scanned[it.code];
      if(v!=null&&v>=0){ logoMark(it.code,'own',it.name); bySrc[v]=(bySrc[v]||0)+1; own.push({code:it.code,name:it.name}); }
      else misses.push(it); }
    paint();
    laStage='2단계 · 본주·그룹·운용사 대체 확인 ';
    /* 2차: 본주 → 그룹 → 운용사 대체. 프록시 코드는 대부분 이미 판정돼 있고, 없으면 추가 판정 */
    const extra=new Set();
    misses.forEach(it=>{ const px=logoProxies(it.code,it.name);
      [px.base,px.group,px.fund,px.spac].forEach(c=>{ if(c&&scanned[c]==null)extra.add(c); }); });
    const ex=[...extra];
    for(let i=0;i<ex.length&&laRun;i+=CH){ try{ await scanBatch(ex.slice(i,i+CH)); }catch(e){} }
    const still=[];
    for(const it of misses){ const px=logoProxies(it.code,it.name);
      const tier=px.base&&scanned[px.base]>=0?'base':px.group&&scanned[px.group]>=0?'group'
        :px.fund&&scanned[px.fund]>=0?'fund':px.spac&&scanned[px.spac]>=0?'spac':'';
      if(tier){ logoMark(it.code,tier,it.name);
        const proxy=tier==='base'?px.base:tier==='group'?px.group:tier==='fund'?px.fund:px.spac;
        (tier==='base'?base:tier==='group'?group:tier==='fund'?fund:spac).push({code:it.code,name:it.name,proxy}); }
      else still.push(it); }
    paint();
    laStage='3단계 · 남은 종목 개별 정밀 확인 ';
    /* 3차: 남은 소수만 개별 정밀 확인 — 페이지 탐색·홈페이지 파비콘까지 도는 중계 경로.
       [v3.7] 2회전: 진짜 없는 종목은 서버가 명부·파비콘을 뒤지느라 첫 요청이 시간 안에
       못 끝날 수 있다. 1회전이 서버 캐시를 데워 두므로, 실패분만 잠시 뒤 한 번 더 확인한다. */
    let pool=still;
    for(let pass=0;pass<2&&pool.length&&laRun;pass++){
      const fails=[]; let si=0;
      const p3End=Date.now()+120e3;
      const probeLane=async()=>{ while(laRun&&si<pool.length&&Date.now()<p3End){ const it=pool[si++];
        let r=null; try{ r=await logoProbeRelay(it.code,it.name,20000); }catch(e){}
        if(r&&r.ok){ logoApply(r); bySrc[r.src]=(bySrc[r.src]||0)+1;
          (r.via==='own'?own:r.via==='base'?base:r.via==='fund'?fund:r.via==='spac'?spac:group).push({code:r.code,name:r.name,proxy:r.proxy}); }
        else fails.push(it);
        if((none.length+own.length)%30===0)paint(); } };
      await Promise.all(Array.from({length:6},probeLane));
      pool=fails;
      if(pass===0&&pool.length)await new Promise(rs=>setTimeout(rs,1500));
    }
    pool.forEach(it=>{ logoMiss(it.code); none.push({code:it.code,name:it.name}); });
    laStage='검사 완료 · ';
  }
  paint();
  laRun=false; $('laStart').hidden=false; $('laStop').hidden=true;
}

async function runEtfAudit(){
  if(eaRun)return; eaRun=true;
  $('eaStart').hidden=true; $('eaStop').hidden=false;
  $('eaBarWrap').hidden=false; $('eaStat').hidden=false; $('eaFails').innerHTML='';
  const BATCH=12, LANES=3;              // 배치 12종목 × 요청 3개 겹치기 = 36종목 동시 진행
  let total=0,okN=0,failN=0,doneN=0;
  const fails=[];
  const t0=Date.now();
  // 1) 전체 개수 파악
  try{fnBump();const r=await fetch(`/api/etfaudit?from=0&count=1`,{cache:'default'});const j=await r.json();total=j.total||0;}catch(e){}
  if(!total){$('eaStat').innerHTML='점검을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';eaRun=false;$('eaStart').hidden=false;$('eaStop').hidden=true;return;}
  const paint=()=>{
    const pct=Math.min(100,Math.round(doneN/total*100));
    $('eaBar').style.width=pct+'%';
    const el=Math.round((Date.now()-t0)/1000);
    const speed=doneN/Math.max(1,el);
    const eta=speed>0?Math.round((total-doneN)/speed):0;
    const nd=fails.filter(f=>eaBucket(f)==='nodata').length;
    $('eaStat').innerHTML=`진행 <b>${doneN.toLocaleString()} / ${total.toLocaleString()}</b> (${pct}%) · 정상 <b class="up">${(okN+nd).toLocaleString()}</b> · 확인필요 <b class="down">${(failN-nd).toLocaleString()}</b>
      · 경과 ${Math.floor(el/60)}분 ${el%60}초${doneN<total?` · 남은 시간 약 ${Math.floor(eta/60)}분 ${eta%60}초`:''}`;
    if(fails.length){
      const buckets={nodata:[],check:[],error:[]};
      fails.forEach(f=>{buckets[eaBucket(f)].push(f);});
      const realIssue=buckets.check.length+buckets.error.length;
      const sum=`<div class="ea-sum">
        <span class="ea-chip ok">구성 미제공(해외·합성) <b>${buckets.nodata.length}</b></span>
        <span class="ea-chip warn">확인필요 <b>${buckets.check.length}</b></span>
        <span class="ea-chip bad">조회 실패 <b>${buckets.error.length}</b></span>
        <div class="ea-exp">해외자산·합성(스왑)·채권·원자재 ETF는 국내 구성종목이 <b>원래 제공되지 않습니다</b>.
          정상이며 조치가 필요 없습니다. 실제로 살펴볼 대상은 <b>${realIssue}종</b>입니다.</div></div>`;
      const listOf=(arr,label)=>arr.length?`<div class="ea-grp">${label} <b>${arr.length}</b></div>
        <div class="ea-list">${arr.slice(0,25).map(f=>`<div class="ea-row" data-code="${f.code}"><span>${f.name}</span><i>${eaIssueKo(f.issue)}</i></div>`).join('')}</div>
        ${arr.length>25?`<div class="ea-more">외 ${(arr.length-25).toLocaleString()}종</div>`:''}`:'';
      $('eaFails').innerHTML=sum+listOf(buckets.check,'확인필요')+listOf(buckets.error,'조회 실패')+listOf(buckets.nodata,'구성 미제공(정상)');
      $('eaFails').querySelectorAll('.ea-row').forEach(r=>r.onclick=()=>etfOpen(r.dataset.code));
    }
  };
  // 2) 여러 요청을 겹쳐 보내며 진행
  let next=0;
  const lane=async()=>{
    while(eaRun&&next<total){
      const from=next; next+=BATCH;
      let j=null;
      try{fnBump();const r=await fetch(`/api/etfaudit?from=${from}&count=${BATCH}`,{cache:'default'});j=await r.json();}catch(e){}
      if(!j||!j.ok){doneN=Math.min(total,doneN+BATCH);paint();continue;}
      (j.results||[]).forEach(x=>{ if(x.ok&&!x.issue)okN++; else {failN++;fails.push(x);} });
      doneN=Math.min(total,doneN+(j.results||[]).length);
      paint();
    }
  };
  await Promise.all(Array.from({length:LANES},lane));
  eaRun=false;$('eaStart').hidden=false;$('eaStop').hidden=true;
  if(doneN>=total)$('eaStat').innerHTML+=' · <b>점검 완료</b>';
}
function eaIssueKo(k){
  return ({'no-holdings':'구성종목 없음','no-pdf-table':'구성종목 표 없음','page-empty':'페이지 응답 없음','bad-name':'이름 이상','no-metrics':'지표 없음'}[k])||(String(k||'').startsWith('fetch:')?'조회 실패':k||'기타');
}
/* [추가] '구성종목 없음' 74종의 정체 — 대부분 해외자산·합성(스왑)·채권·원자재 ETF다.
   이런 상품은 국내 구성종목 데이터가 **원래 제공되지 않는다**(운용 방식상 국내 주식을 담지 않음).
   따라서 '확인필요'가 아니라 '구성 미제공(정상)'으로 분리해야 결과가 정확해진다. */
const EA_NODATA_RE=new RegExp([
  // 지역·시장
  '글로벌','미국','해외','선진','신흥','차이나','중국','홍콩','일본','유럽','독일','인도','베트남','대만','브라질','멕시코','아세안',
  '나스닥','S&P','러셀','다우','필라델피아','유로스톡스','니케이','항셍','MSCI','FTSE',
  // 해외 개별종목 테마 (국내 구성종목이 없음)
  '팔란티어','테슬라','엔비디아','애플','마이크로소프트','아마존','알파벳','구글','메타','브로드컴','버크셔','코인베이스',
  '비트코인','이더리움','디지털자산','블록체인',
  // 운용 방식·자산군
  '합성','\\\\(H\\\\)','TIF','TDF','채권','국채','회사채','단기자금','머니마켓','CD금리','KOFR','금리','통안',
  '달러','엔화','유로','금현물','은현물','원유','WTI','천연가스','구리','농산물','원자재',
  '리츠','리얼티','인프라','커버드콜','배당프리미엄','타겟','만기'
].join('|'),'i');
function eaBucket(f){
  const noHold=(f.issue==='no-holdings'||f.issue==='no-pdf-table');
  if(noHold&&EA_NODATA_RE.test(String(f.name||'')))return 'nodata';   // 정상 · 구성 미제공
  if(noHold)return 'check';                                            // 국내 ETF인데 없음 → 확인필요
  return 'error';                                                      // 실제 조회 실패
}
const EA_BUCKET_KO={nodata:'구성 미제공(해외·합성)',check:'구성종목 확인필요',error:'조회 실패'};
import { LiveFeed } from '/feed.js?v=94';
import { BUNDLED_VERSION as __BUNDLED_VER } from '/version-info.js?v=332';   // [v2.2] 실행 중 번들의 진짜 버전
import { stockLogo, logoProbe, logoApply, logoMark, logoMiss, logoProxies, logoProbeRelay, LOGO_SRC_NAMES, logoPlanVer } from '/logo.js?v=332';                                  // [v2.6] 종목 로고
const $=(id)=>document.getElementById(id);
/* [추가] 안전한 클릭 바인딩 — 요소가 없거나 핸들러가 실패해도 스크립트 전체가 죽지 않는다. */
function bindClick(id,fn){const el=$(id);if(!el)return;el.onclick=(ev)=>{try{return fn(ev);}catch(e){console.error('[click:'+id+']',e);}};}
/* [추가] 예외가 조용히 삼켜져 '화면만 비어 보이는' 상황을 막기 위한 진단 배너.
   콘솔을 못 여는 환경(모바일)에서도 무엇이 실패했는지 바로 보인다. */
/* [정리] 전역 오류 처리는 아래 reportErr 핸들러 한 벌로 통합했다(중복 등록 제거).
   reportErr 안에서 진단 배너(showErrBanner)까지 함께 띄운다. */
function showErrBanner(msg){
  if(!msg)return;
  let b=$('errBanner');
  if(!b){b=document.createElement('div');b.id='errBanner';
    b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:#2b1113;color:#ffd8db;border:1px solid #f5384e;border-radius:10px;padding:8px 12px;font-size:12px;line-height:1.5;max-height:30vh;overflow:auto';
    b.onclick=()=>b.remove();
    document.body.appendChild(b);}
  const line=document.createElement('div');line.textContent='⚠ '+String(msg).slice(0,180);
  b.appendChild(line);
  if(b.childElementCount>6)b.removeChild(b.firstChild);
}
/* ===== 앱 버전 (플레이스토어식 업데이트 시스템의 기준값 — 배포마다 여기와 자산 ?v= 를 함께 올린다) ===== */
/* [v2.2 근본 수정] 예전엔 여기 '1.91.0'이 하드코딩된 채 방치돼, 배포를 아무리 해도
   '현재 버전'이 영원히 1.91.0으로 보였고 → 업데이트 버튼이 "안 되는 것처럼" 보였다.
   이제 클라이언트도 번들에 동봉된 version-info(릴리스마다 자동 동기화)를 그대로 읽는다. */
const APP_VERSION=(__BUNDLED_VER&&__BUNDLED_VER.version)||'0.0.0';
try{window.__boot&&(__boot.step(2),__boot.ver(APP_VERSION));}catch(e){}   // [v4.9] 입장화면: 버전·환경 확인
const APP_BUILD=(()=>{try{const m=String(import.meta.url).match(/[?&]v=([\w.]+)/);return m?m[1]:'';}catch(e){return '';}})();

/* ===== [주요#2] 계정별 저장키 =====
   검색기록·최근본·정렬 같은 개인 기록이 예전엔 기기 공용 키라 계정을 바꿔도 남았다.
   이제 '키:계정ID'(게스트는 :guest)로 분리하고, 예전 공용 값은 처음 한 번 옮겨 온다. */
function pkey(base){return base+':' + (typeof currentUser!=='undefined'&&currentUser?currentUser:'guest');}
function pget(base,def){
  try{
    const v=localStorage.getItem(pkey(base));
    if(v!=null)return JSON.parse(v);
    const legacy=localStorage.getItem(base);           // 예전 공용 키 → 1회 이관
    if(legacy!=null){localStorage.setItem(pkey(base),legacy);localStorage.removeItem(base);return JSON.parse(legacy);}
  }catch(e){}
  return def;
}
function pset(base,val){try{localStorage.setItem(pkey(base),JSON.stringify(val));}catch(e){}}

/* ===== 사용자 설정(userPrefs) — 설정 메뉴 전 항목의 단일 저장소. 계정별 + 클라우드 동기화 ===== */
const PREF_DEF={numFmt:'won',startView:'home',fontSize:'md',watchDefaultSort:'chg',
  homeSections:{idx:true,ai:true,cal:true},pollSpeed:'normal',dataSaver:false,
  alerts:{target:true,session:false,swing:false,swingPct:5},reduceMotion:false,colorblind:false,homeSumTab:'all'};
let userPrefs=Object.assign({},PREF_DEF);
function loadPrefs(fromCloud){
  const saved=fromCloud||pget('prefs',null)||{};
  userPrefs=Object.assign({},PREF_DEF,saved,{homeSections:Object.assign({},PREF_DEF.homeSections,saved.homeSections||{}),alerts:Object.assign({},PREF_DEF.alerts,saved.alerts||{})});
  applyPrefs();
}
function savePrefs(){pset('prefs',userPrefs);try{cloudSync();}catch(e){}}
function applyPrefs(){
  const de=document.documentElement;
  de.dataset.fs=userPrefs.fontSize||'md';
  de.classList.toggle('reduce-motion',!!userPrefs.reduceMotion);
  de.classList.toggle('cb-palette',!!userPrefs.colorblind);
  /* 홈 섹션 표시/숨김 — 래퍼를 런타임에 찾아 토글(HTML 수정 불필요) */
  const secOf=(id)=>{const e=document.getElementById(id);return e?e.closest('.sec'):null;};
  const secs={idx:secOf('idxGrid'),ai:secOf('aiBrief'),cal:secOf('calGrid')};
  Object.entries(secs).forEach(([k,el])=>{if(el)el.hidden=!(userPrefs.homeSections&&userPrefs.homeSections[k]!==false);});
  try{if(feed&&feed._reschedule)feed._reschedule();}catch(e){}
}
/* [S6] 갱신 주기 배율 — LiveFeed 간격 계산에 곱해진다 */
function pollFactor(){return ({fast:0.5,normal:1,eco:2.5})[userPrefs.pollSpeed]||1;}
try{window.pollFactor=pollFactor;}catch(e){}   // feed.js 에서 갱신 주기 배율을 읽을 수 있게 전역 노출

const KRW=(n)=>{
  if(n==null||isNaN(n))return '—';
  n=Math.round(n);
  const f=(typeof userPrefs!=='undefined'&&userPrefs.numFmt)||'won';
  if(f==='compact'){const a=Math.abs(n);
    if(a>=1e9)return (n/1e9).toFixed(1).replace(/\.0$/,'')+'B';
    if(a>=1e6)return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
    if(a>=1e3)return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K';
    return String(n);}
  if(f==='kor'){const a=Math.abs(n);
    if(a>=1e12)return (n/1e12).toFixed(1).replace(/\.0$/,'')+'조';
    if(a>=1e8)return (n/1e8).toFixed(1).replace(/\.0$/,'')+'억';
    if(a>=1e4)return Math.round(n/1e4).toLocaleString('ko-KR')+'만';
    return n.toLocaleString('ko-KR');}
  return n.toLocaleString('ko-KR');
};
const DEC=(n,d=2)=>(n==null||isNaN(n))?'—':Number(n).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(n)=>(n>0?'+':'')+KRW(n);
const signedDec=(n,d=2)=>(n>0?'+':'')+DEC(n,d);
const pctS=(n)=>(n>0?'+':'')+(+n).toFixed(2)+'%';
const dirOf=(n)=>n>0?'up':n<0?'down':'flat';
const arrow=(d)=>d==='up'?'▲':d==='down'?'▼':'―';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let UP='#f5384e',DOWN='#2f74ff';
/* ===== 사용자 설정(테마·거래·색상 등) ===== */
const DEFAULT_SETTINGS={theme:'auto', realHours:true, color:'kr', orderPass:true};
let settings=(()=>{try{return Object.assign({},DEFAULT_SETTINGS,JSON.parse(localStorage.getItem('settings')||'{}'))}catch(e){return {...DEFAULT_SETTINGS}}})();
function saveSettings(){try{localStorage.setItem('settings',JSON.stringify(settings))}catch(e){}}
function prefersDark(){try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){return false;}}
function applyTheme(){
  if(settings.theme==='auto'){
    const h=new Date().getHours()+new Date().getMinutes()/60;
    const dark=(h>=18.5||h<6.5);
    document.documentElement.setAttribute('data-theme',dark?'dark':'light');
    return;
  }
  const t=settings.theme==='auto'?(prefersDark()?'dark':'light'):(settings.theme==='dark'?'dark':'light');
  document.documentElement.setAttribute('data-theme',t);
}
/* [D7] 시스템 테마가 바뀌면 '시스템' 설정일 때 즉시 따라간다 */
try{const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const onCh=()=>{if(settings.theme==='auto')applyTheme();};
  if(mq.addEventListener)mq.addEventListener('change',onCh); else if(mq.addListener)mq.addListener(onCh);
}catch(e){}
function applyColor(){document.documentElement.setAttribute('data-color',settings.color==='global'?'global':'kr');
  if(settings.color==='global'){UP='#16a34a';DOWN='#e5484d';}else{UP='#f5384e';DOWN='#2f74ff';}}
// 폴링 예산·간격(표준 고정): 장중 빠르게 / 사용량 늘면 단계적으로 완화
function speedCfg(){ return {capM:50000,capD:3000,q:[1500,3000,8000,60000],m:[3000,6000,15000,120000]}; }
applyTheme();applyColor();
function tickSize(p){if(p<2000)return 1;if(p<5000)return 5;if(p<20000)return 10;if(p<50000)return 50;if(p<200000)return 100;if(p<500000)return 500;return 1000;}
const roundTick=(p)=>{const t=tickSize(p);return Math.round(p/t)*t;};
const store={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}},del(k){try{localStorage.removeItem(k);}catch{}}};
/* [보안] 레거시 해시 — 구버전 계정 호환에만 쓴다. 새 비밀번호에는 쓰지 않는다. */
function legacyHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return 'h'+(h>>>0).toString(16);}
/* [보안] 비밀번호 해시 = SHA-256(고정 도메인 접두 + 비밀번호). Web Crypto 사용.
   서버는 이 값을 그대로 저장하지 않고 계정별 솔트를 덧붙여 다시 해싱한다. */
/* ══ [v4.49] 로그인 비밀번호 규칙 ══════════════════════════════════════════
   기존에는 '6자 이상' 하나뿐이라 'aaaaaa' 도 통과했다. 이 앱은 계정 하나에
   보유·거래기록·계좌가 묶여 있고 어느 기기에서나 같은 아이디로 들어오므로,
   실제 증권사 수준의 최소 요건을 건다.
   ① 8자 이상 32자 이하 ② 영문·숫자·특수문자 각 1개 이상
   ③ 아이디·이름을 그대로 담지 않기 ④ 같은 문자 3연속 금지(aaa, 111)
   ⑤ 키보드·숫자 연속 3자 금지(abc, 123, qwe) ⑥ 흔한 비밀번호 금지
   판정은 { ok, msg } 로 돌려주고, 강도 막대는 pwStrength() 가 따로 계산한다. */
var PW_MIN=8, PW_MAX=32;
var PW_COMMON=['password','passw0rd','12345678','123456789','qwerty123','qwertyui',
  'iloveyou','admin123','letmein1','welcome1','abc12345','asdf1234','1q2w3e4r','zaq12wsx',
  'p@ssw0rd','football','baseball','sunshine','princess','dragon12','monkey12','master12'];
function pwSeq3(s){
  const L=s.toLowerCase();
  const rows=['abcdefghijklmnopqrstuvwxyz','0123456789','qwertyuiop','asdfghjkl','zxcvbnm'];
  for(let i=0;i+2<L.length;i++){
    const a=L.slice(i,i+3), b=a.split('').reverse().join('');
    for(const r of rows)if(r.includes(a)||r.includes(b))return true;
  }
  return false;
}
function pwCheck(pw,id,name){
  const s=String(pw==null?'':pw);
  if(s.length<PW_MIN)return {ok:false,msg:`비밀번호는 ${PW_MIN}자 이상으로 만들어 주세요.`};
  if(s.length>PW_MAX)return {ok:false,msg:`비밀번호는 ${PW_MAX}자까지 쓸 수 있습니다.`};
  if(/\s/.test(s))return {ok:false,msg:'비밀번호에 공백은 쓸 수 없습니다.'};
  if(!/[A-Za-z]/.test(s))return {ok:false,msg:'영문자를 1자 이상 넣어 주세요.'};
  if(!/[0-9]/.test(s))return {ok:false,msg:'숫자를 1자 이상 넣어 주세요.'};
  if(!/[^A-Za-z0-9]/.test(s))return {ok:false,msg:'특수문자(!@#$ 등)를 1자 이상 넣어 주세요.'};
  if(/(.)\1\1/.test(s))return {ok:false,msg:'같은 문자를 3번 연달아 쓸 수 없습니다.'};
  if(pwSeq3(s))return {ok:false,msg:'abc·123·qwe 처럼 연속된 문자는 쓸 수 없습니다.'};
  const low=s.toLowerCase();
  if(PW_COMMON.some(x=>low.includes(x)))return {ok:false,msg:'너무 흔한 비밀번호입니다. 다른 조합으로 바꿔 주세요.'};
  const uid=String(id||'').toLowerCase(), nm=String(name||'').toLowerCase();
  if(uid.length>=3&&low.includes(uid))return {ok:false,msg:'비밀번호에 아이디를 담을 수 없습니다.'};
  if(nm.length>=3&&low.includes(nm))return {ok:false,msg:'비밀번호에 이름을 담을 수 없습니다.'};
  return {ok:true,msg:''};
}
/* 0~4 단계 강도 — 규칙 통과 여부와 별개로 '얼마나 튼튼한지'를 보여 준다 */
function pwStrength(pw){
  const s=String(pw==null?'':pw); if(!s)return {lv:0,label:'',pct:0};
  let sc=0;
  if(s.length>=8)sc++; if(s.length>=12)sc++; if(s.length>=16)sc++;
  if(/[A-Z]/.test(s)&&/[a-z]/.test(s))sc++;
  if(/[0-9]/.test(s))sc++;
  if(/[^A-Za-z0-9]/.test(s))sc++;
  if(new Set(s).size>=s.length*0.7)sc++;
  if(/(.)\1\1/.test(s)||pwSeq3(s))sc-=2;
  const lv=Math.max(0,Math.min(4,Math.round(sc*4/7)));
  return {lv,label:['매우 약함','약함','보통','안전','매우 안전'][lv],pct:[8,30,55,78,100][lv]};
}
/* 입력창 아래에 강도 막대와 안내를 붙인다 — 눌러 보고서야 실패를 아는 일이 없게 */
function pwWire(inputId,meterId,idGetter,nameGetter){
  const inp=$(inputId), box=$(meterId);
  if(!inp||!box||inp._pwWired)return; inp._pwWired=true;
  const paint=()=>{
    const v=inp.value||'';
    if(!v){box.innerHTML='';box.hidden=true;return;}
    box.hidden=false;
    const st=pwStrength(v), ck=pwCheck(v,idGetter?idGetter():'',nameGetter?nameGetter():'');
    box.innerHTML=`<div class="pw-bar"><i class="lv${st.lv}" style="width:${st.pct}%"></i></div>
      <div class="pw-hint ${ck.ok?'ok':'no'}">${ck.ok?`✓ 사용할 수 있어요 · 강도 ${st.label}`:ck.msg}</div>`;
  };
  inp.addEventListener('input',paint); inp.addEventListener('blur',paint);
}
async function pwHash(s){
  try{
    const buf=new TextEncoder().encode('livejt|'+String(s));
    const d=await crypto.subtle.digest('SHA-256',buf);
    return 's'+[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){ return legacyHash(s); }   // 구형 브라우저 폴백
}
/* PIN(4자리 주문 비밀번호)은 로컬 검증용 — 여기서도 SHA-256 을 쓴다. */
const hash=legacyHash;

/* 종목 유니버스 */
const STOCKS=[
  ['삼성전자','005930','반도체'],['SK하이닉스','000660','반도체'],['LG에너지솔루션','373220','2차전지'],
  ['삼성바이오로직스','207940','바이오'],['현대차','005380','자동차'],['기아','000270','자동차'],
  ['NAVER','035420','인터넷'],['카카오','035720','인터넷'],['셀트리온','068270','바이오'],
  ['POSCO홀딩스','005490','철강'],['KB금융','105560','금융'],['신한지주','055550','금융'],
  ['현대모비스','012330','자동차'],['삼성SDI','006400','2차전지'],['LG화학','051910','화학'],
  ['삼성물산','028260','지주'],['한국전력','015760','에너지'],['삼성생명','032830','금융'],
  ['LG전자','066570','가전'],['SK텔레콤','017670','통신'],['KT','030200','통신'],
  ['삼성전기','009150','전자부품'],['HMM','011200','해운'],['고려아연','010130','비철금속'],
  ['크래프톤','259960','게임'],['하나금융지주','086790','금융'],['한화에어로스페이스','012450','방산'],
  ['HD한국조선해양','009540','조선'],['에코프로비엠','247540','2차전지'],['에코프로','086520','2차전지'],
  ['알테오젠','196170','바이오'],['카카오게임즈','293490','게임'],['하이브','352820','엔터'],
  ['에스엠','041510','엔터'],['JYP Ent.','035900','엔터'],['삼성화재','000810','금융'],
  ['기업은행','024110','금융'],['메리츠금융지주','138040','금융'],['우리금융지주','316140','금융'],
  ['LG이노텍','011070','전자부품'],['한화오션','042660','조선'],['삼성중공업','010140','조선'],
  ['HD현대중공업','329180','조선'],['삼성에스디에스','018260','IT'],['CJ제일제당','097950','음식료'],
  ['오리온','271560','음식료'],['유한양행','000100','제약'],['한미약품','128940','제약'],
  ['SK바이오팜','326030','바이오'],['한미반도체','042700','반도체장비'],['리노공업','058470','반도체장비'],
  ['현대건설','000720','건설'],['S-Oil','010950','정유'],['SK이노베이션','096770','정유'],
  ['포스코인터내셔널','047050','상사'],['LG디스플레이','034220','디스플레이'],['현대로템','064350','방산'],
  ['한화시스템','272210','방산'],['LG','003550','지주'],['SK','034730','지주'],
  ['포스코퓨처엠','003670','2차전지'],['두산에너빌리티','034020','발전'],['엔씨소프트','036570','게임'],
  ['넷마블','251270','게임'],['셀트리온제약','068760','제약'],['SK스퀘어','402340','지주'],
];
const KOSDAQ_CODES=new Set(['247540','086520','196170','293490','041510','068760','058470','035900']);
const byCode={};STOCKS.forEach(([n,c,t])=>byCode[c]={name:n,code:c,tags:[t],market:KOSDAQ_CODES.has(c)?'코스닥':'코스피',nxt:null,price:null,prevClose:null,open:null,high:null,low:null,volume:null,value:null,ticks:[]});
function ensureStock(code,name,market,kind){
  if(byCode[code]){const s=byCode[code];if(name&&(s.name==='—'||s.name===s.code))s.name=name;if(kind&&!s.kind)s.kind=kind;
    if(market&&!s.market)s.market=market;
    if(!s.market)resolveMarket(code);
    return s;}
  byCode[code]={name:name||code,code,tags:[],market:market||mktCache[String(code).toUpperCase()]||'',kind:kind||'',nxt:null,price:null,prevClose:null,open:null,high:null,low:null,volume:null,value:null,ticks:[]};
  if(!byCode[code].market)resolveMarket(code);
  return byCode[code];
}
/* ===== 소속 시장(코스피/코스닥) 실데이터 판별 ===== */
// 하드코딩 대신 서버에서 실제 거래소 구분을 받아온다. 결과는 브라우저에 캐시(시장은 거의 안 바뀜).
let mktCache=(()=>{try{return JSON.parse(localStorage.getItem('mktCache')||'{}')}catch(e){return {}}})();
function saveMktCache(){try{localStorage.setItem('mktCache',JSON.stringify(mktCache))}catch(e){}}
let _mktQueue=new Set(),_mktTimer=null;
function resolveMarket(code){
  if(!code)return;
  const c=String(code).toUpperCase();
  const st=byCode[c];
  const needName=st&&(!st.name||st.name===c||st.name==='—');
  if(mktCache[c]&&!needName){if(st&&st.market!==mktCache[c])st.market=mktCache[c];return;}
  if(mktCache[c]&&st&&st.market!==mktCache[c])st.market=mktCache[c];
  _mktQueue.add(c);
  drainMkt();
}
function drainMkt(){
  if(_mktTimer||!_mktQueue.size)return;
  _mktTimer=setTimeout(async()=>{
    const codes=[..._mktQueue].slice(0,20);_mktQueue=new Set([..._mktQueue].slice(20));_mktTimer=null;
    if(!codes.length)return;
    try{
      fnBump();
      const r=await fetch('/api/meta?codes='+codes.join(','),{cache:'no-store'});
      const j=await r.json();
      let changed=false;
      Object.entries(j.markets||{}).forEach(([c,v])=>{
        if(v&&v.market){mktCache[c]=v.market;changed=true;
          const st=byCode[c];if(st){st.market=v.market;
            if(v.name&&(!st.name||st.name==='—'||st.name===c))st.name=v.name;}}
      });
      if(changed){saveMktCache();
        if(currentView==='trade')renderDetail();
        else if(currentView==='search')renderSearch();
        else if(currentView==='watch')renderWatch();}
    }catch(e){}
    if(_mktQueue.size)drainMkt();      // 남은 대기열을 직접 이어서 처리
  },400);
}
// ETF/ETN 여부 판정(재무제표·컨센서스가 존재하지 않는 상품군)
function isFundLike(code){
  const s=byCode[code];if(!s)return false;
  if(/ETF|ETN/i.test(s.kind||''))return true;
  return /^(KODEX|TIGER|SOL|ACE|RISE|PLUS|KOSEF|ARIRANG|HANARO|TIMEFOLIO|KIWOOM|히어로즈|마이다스|파워)/i.test(s.name||'');
}
/* ══════════════════════════════════════════════════════════════════════
   NXT(넥스트레이드) 거래가능 종목 — 명단(whitelist) 방식
   ----------------------------------------------------------------------
   과거 버전은 시세 JSON을 훑어서 "NXT 가능 같아 보이면 가능"이라고 추측했다.
   그래서 원익IPS·HPSP처럼 2026.02.12 자로 매매제외된 종목까지 전부
   'NXT 가능'으로 표시되는 오류가 났다.

   NXT 거래대상은 넥스트레이드가 분기마다 심사해 공표하는 확정 명단이다.
   따라서 판별은 오직 명단 대조뿐이며, 명단을 못 받았을 때는
   '가능'도 '불가'도 아닌 '확인 중'으로 남긴다. (추측해서 틀리느니 침묵한다)
   ══════════════════════════════════════════════════════════════════════ */
const NXTLIST={ready:false,loading:null,set:new Set(),markets:{},removed:new Set(),halted:new Set(),asOf:null,source:null,count:0,err:null,at:0,changed:false};

async function loadNxtList(force){
  if(NXTLIST.ready&&!force)return NXTLIST;
  if(NXTLIST.loading)return NXTLIST.loading;
  // 실패 후 재시도는 45초에 한 번으로 제한(렌더마다 /api/nxtlist 폭주 방지)
  if(!force&&NXTLIST.err&&NXTLIST.at&&Date.now()-NXTLIST.at<45000)return NXTLIST;
  const prevSig=NXTLIST.ready?NXTLIST.count+'@'+(NXTLIST.asOf||''):'';
  NXTLIST.loading=(async()=>{
    try{
      const r=await fetch('/api/nxtlist'+(force?'?refresh=1':''),{cache:force?'no-store':'default'});
      const j=await r.json();
      if(j&&j.ok&&Array.isArray(j.codes)&&j.codes.length){
        NXTLIST.set=new Set(j.codes.map(String));
        NXTLIST.markets=j.markets||{};
        NXTLIST.removed=new Set(j.removed||[]);
        NXTLIST.halted=new Set(j.halted||[]);
        NXTLIST.asOf=j.asOf||null; NXTLIST.source=j.source||null;
        NXTLIST.count=j.codes.length; NXTLIST.ready=true; NXTLIST.err=null;
        NXTLIST.at=Date.now();
        NXTLIST.changed=(prevSig&&prevSig!==j.codes.length+'@'+(j.asOf||''));
      }else{
        NXTLIST.ready=false; NXTLIST.err=(j&&j.status)||'unavailable'; NXTLIST.at=Date.now();
      }
    }catch(e){ NXTLIST.ready=false; NXTLIST.err='fetch-err'; NXTLIST.at=Date.now(); }
    NXTLIST.loading=null;
    // 명단이 들어오면 이미 로드된 종목들의 플래그를 한 번에 갱신한다
    if(NXTLIST.ready){
      Object.keys(byCode).forEach(c=>{byCode[c].nxt=NXTLIST.set.has(c)?true:false;});
      safeRun('nxtListPaint',()=>{
        if(currentView==='search')renderSearch();
        else if(currentView==='trade'&&selected)renderDetail();
        renderWatch();
      });
      /* 지금 받은 게 오래된 번들 스냅샷이면 서버가 백그라운드로 현재 명단을 만든다.
         ~80초 뒤 한 번 더 받아 최신 명단으로 교체한다(한 번만). */
      if(/snapshot|스냅샷/.test(String(NXTLIST.source||''))&&!NXTLIST._reloaded){
        NXTLIST._reloaded=true;
        setTimeout(()=>{ NXTLIST.at=0; loadNxtList(true); },80000);
      }
    }
    return NXTLIST;
  })();
  return NXTLIST.loading;
}

/* 하위 호환용 얇은 래퍼 — 이제 네트워크를 종목별로 때리지 않는다.
   명단 한 번만 받아 오면 전 종목 판별이 끝난다. */
const nxtCache={};
/* [v2.8 · 치명] 무한 렌더 루프 차단
   기존 흐름: renderDetail → renderExchangeRow → nxtCapability()가 null →
              ensureNxt() → loadNxtList()이 (실패 후 45초 스로틀 때문에) 즉시 반환 →
              cap 은 그대로 null → renderDetail() 재호출 → …
   /api/nxtlist 가 실패하거나 빈 응답이면 거래·주문 화면에서 이 고리가 끝없이 돌아
   탭 전체가 얼어붙었다(타이머·렌더 모두 정지). 실측 5,000회 이상 반복 확인.
   해결: ① 같은 종목에 대한 중복 진입을 막고 ② 판정이 '여전히 모름'이거나
        '이전과 동일'하면 다시 그리지 않는다. 상태가 실제로 바뀔 때만 렌더한다. */
const _nxtEnsuring=new Set();
async function ensureNxt(code){
  if(!code||_nxtEnsuring.has(code))return;
  _nxtEnsuring.add(code);
  const before=nxtCapability(code);
  try{ await loadNxtList(false); }
  catch(e){ /* 목록 실패는 아래에서 cap===null 로 처리 */ }
  finally{ _nxtEnsuring.delete(code); }
  const cap=nxtCapability(code);
  nxtCache[code]={nxt:cap,diag:'list:'+(NXTLIST.source||NXTLIST.err||'?')};
  if(byCode[code])byCode[code].nxt=cap;
  if(cap===null||cap===before)return;          // 변화 없음 → 재렌더 금지(루프 차단)
  if(selected===code&&currentView==='trade'){renderDetail();configOrderExchanges();if(infoTab==='summary'&&curFund&&curFund.code===code)renderInfo();}
}

/* ===== 계정/세션 상태 ===== */
let currentUser=null, watchlist=[], holdings=[], cash=0, ipoPlans=[], tradeLog=[], tradeArchive={}, acctPassHash=legacyHash('0000');
var usdCash=0, usdSettling=[];   // [v4.29] 달러 예수금 · T+1 미결제분
var acctType='general';          // [v4.32] 활성 계좌의 종류(호환 유지)
/* ══ [v4.40] 다계좌 시스템 ═══════════════════════════════════════════════════
   지금까지는 계좌가 하나로 고정돼 '선택'도 '미개설'도 없었다. 실제 증권사처럼
   여러 계좌를 열고 고를 수 있게 하고, 계좌별로 예수금·보유·매매일지를 분리한다.
     acctList  : 개설된 계좌 목록 [{id,type,openedAt}]
     acctBooks : 계좌별 잔고·보유·일지
     acctActive: 지금 보고 있는 계좌 id
   계좌가 하나도 없으면 거래·환전이 모두 막히고 개설 안내가 뜬다. */
var acctList=[], acctBooks={}, acctActive='';
function acctOpened(){ return Array.isArray(acctList)&&acctList.length>0; }
/* 계좌가 없으면 어떤 주문·환전도 진행하지 않는다 — 실제 증권사와 같은 원칙 */
function acctRequire(what){
  if(acctOpened())return true;
  toast('warn','계좌를 먼저 개설해 주세요','계좌를 개설해야 '+(what||'거래')+'을(를) 이용할 수 있습니다. 내 계좌 화면에서 1분이면 끝나요.');
  try{ showView('account'); }catch(e){}
  return false;
}
function acctCur(){ return acctList.find(a=>a.id===acctActive)||acctList[0]||null; }
function acctNewId(){ return 'ac'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
/* 현재 화면의 잔고·보유를 활성 계좌 장부에 담아 둔다 */
function acctSnap(){
  if(!acctActive)return;
  const prev=acctBooks[acctActive]||{};
  acctBooks[acctActive]={cash,usdCash,usdSettling:usdSettling.slice(),
    holdings:holdings.slice(),tradeLog:tradeLog.slice(),tradeArchive,ipoPlans:ipoPlans.slice(),
    fx:(fxLive&&Object.keys(fxLive).length)?fxLive:(prev.fx||{})};   // [v4.45] 통화 잔고 보존
}
/* 계좌 장부를 화면 상태로 펼친다 */
function acctLoad(id){
  const bk=acctBooks[id]||{};
  cash=intOf(bk.cash,0); usdCash=+(bk.usdCash||0);
  usdSettling=Array.isArray(bk.usdSettling)?bk.usdSettling.slice():[];
  holdings=Array.isArray(bk.holdings)?bk.holdings.slice():[];
  tradeLog=Array.isArray(bk.tradeLog)?bk.tradeLog.slice():[];
  tradeArchive=(bk.tradeArchive&&typeof bk.tradeArchive==='object')?bk.tradeArchive:{};
  ipoPlans=Array.isArray(bk.ipoPlans)?bk.ipoPlans.slice():[];
  fxLive=(bk.fx&&typeof bk.fx==='object')?bk.fx:{};                  // [v4.45]
  acctActive=id;
  const a=acctCur(); acctType=(a&&ACCT_TYPES[a.type])?a.type:'general';
  if(a&&a.pw)acctPassHash=a.pw;                    // [v4.46] 활성 계좌의 비밀번호로 전환
}
function acctSwitch(id){
  if(id===acctActive||!acctBooks[id]&&!acctList.some(a=>a.id===id))return;
  acctSnap(); acctLoad(id); saveState();
  try{sanitizeAccount(true);}catch(e){}
  try{renderPortfolioNumbers();}catch(e){}
  try{if(currentView==='account'){renderAcctFx();renderAcctSend();}}catch(e){}
  try{renderOrdAcct();}catch(e){}
  try{renderAcctBar();}catch(e){}
  const a=acctCur();
  toast('buy','계좌 전환',(a?ACCT_TYPES[a.type].n:'')+' · 예수금 '+KRW(cash)+'원');
}
/* ══ [v4.46] 계좌 비밀번호를 계좌별로 ═══════════════════════════════════════
   지금까지 계좌 비밀번호는 계정에 하나뿐이었다. 계좌를 여러 개 쓰는데 비밀번호가
   공용이면 실제 증권사와 다르고, 계좌를 나눠 쓰는 의미도 줄어든다.
   → 계좌마다 비밀번호를 두고, 활성 계좌의 것을 주문 확인에 쓴다.
   기존 계정은 쓰던 비밀번호를 그대로 물려받아 아무것도 잃지 않는다. */
function acctPwOf(id){
  const a=acctList.find(x=>x.id===(id||acctActive));
  return (a&&a.pw)?a.pw:acctPassHash;              // 계좌 비번이 없으면 계정 공용 비번
}
function acctPwSet(id,hashed){
  const a=acctList.find(x=>x.id===(id||acctActive));
  if(a&&hashed){ a.pw=hashed; if(id===acctActive||!id)acctPassHash=hashed; saveState(); return true; }
  return false;
}
function acctOpen(type,initCash,pwHashed){
  const t=ACCT_TYPES[type]?type:'general';
  const id=acctNewId();
  acctList.push({id,type:t,openedAt:Date.now(),pw:pwHashed||acctPassHash});
  acctBooks[id]={cash:intOf(initCash,0),usdCash:0,usdSettling:[],holdings:[],tradeLog:[],tradeArchive:{},ipoPlans:[]};
  acctSnap(); acctLoad(id); saveState();
  return id;
}
/* 예전 단일 계좌 사용자를 자동 이전한다 — 데이터를 잃지 않는다 */
/* ══ [v4.45] 다통화 환전 코너 — 내 계좌 ═══════════════════════════════════
   해외 라운지의 환전은 달러 전용이다. 실제 증권사처럼 여러 통화를 다루도록
   통화별 잔고와 환전 화면을 만든다. 환율은 원화 기준으로 환산해 계산한다. */
var CURRENCIES=[
  {c:'USD',n:'미국 달러',f:'🇺🇸',sym:'$',dec:2,spread:10},
  {c:'JPY',n:'일본 엔',   f:'🇯🇵',sym:'¥',dec:0,spread:9,per:100},
  {c:'EUR',n:'유로',      f:'🇪🇺',sym:'€',dec:2,spread:14},
  {c:'CNY',n:'중국 위안', f:'🇨🇳',sym:'¥',dec:2,spread:16},
  {c:'HKD',n:'홍콩 달러', f:'🇭🇰',sym:'HK$',dec:2,spread:14},
  {c:'GBP',n:'영국 파운드',f:'🇬🇧',sym:'£',dec:2,spread:16},
  {c:'CHF',n:'스위스 프랑',f:'🇨🇭',sym:'Fr',dec:2,spread:16},
  {c:'AUD',n:'호주 달러', f:'🇦🇺',sym:'A$',dec:2,spread:14},
  {c:'CAD',n:'캐나다 달러',f:'🇨🇦',sym:'C$',dec:2,spread:14},
  {c:'SGD',n:'싱가포르 달러',f:'🇸🇬',sym:'S$',dec:2,spread:14},
  {c:'VND',n:'베트남 동', f:'🇻🇳',sym:'₫',dec:0,spread:20,per:100},
  /* ══ [v4.61] 취급 통화 확대 ═══════════════════════════════════════════════
     11개로는 아시아·유럽의 주요 통화가 많이 빠져 있었다. 실제 증권사 외화계좌가
     다루는 범위에 맞춰 넓힌다. 스프레드는 통화가 덜 거래될수록 크게 잡는다
     (거래량이 적은 통화일수록 살 때·팔 때 차이가 벌어지는 실제 구조). */
  {c:'TWD',n:'대만 달러',  f:'🇹🇼',sym:'NT$',dec:2,spread:22},
  {c:'THB',n:'태국 바트',  f:'🇹🇭',sym:'฿',dec:2,spread:20},
  {c:'IDR',n:'인도네시아 루피아',f:'🇮🇩',sym:'Rp',dec:0,spread:26,per:100},
  {c:'PHP',n:'필리핀 페소',f:'🇵🇭',sym:'₱',dec:2,spread:24},
  {c:'MYR',n:'말레이시아 링깃',f:'🇲🇾',sym:'RM',dec:2,spread:22},
  {c:'INR',n:'인도 루피',  f:'🇮🇳',sym:'₹',dec:2,spread:26},
  {c:'NZD',n:'뉴질랜드 달러',f:'🇳🇿',sym:'NZ$',dec:2,spread:18},
  {c:'SEK',n:'스웨덴 크로나',f:'🇸🇪',sym:'kr',dec:2,spread:20},
  {c:'NOK',n:'노르웨이 크로네',f:'🇳🇴',sym:'kr',dec:2,spread:20},
  {c:'DKK',n:'덴마크 크로네',f:'🇩🇰',sym:'kr',dec:2,spread:20},
  {c:'PLN',n:'폴란드 즈워티',f:'🇵🇱',sym:'zł',dec:2,spread:24},
  {c:'CZK',n:'체코 코루나',f:'🇨🇿',sym:'Kč',dec:2,spread:24},
  {c:'HUF',n:'헝가리 포린트',f:'🇭🇺',sym:'Ft',dec:0,spread:26,per:100},
  {c:'TRY',n:'튀르키예 리라',f:'🇹🇷',sym:'₺',dec:2,spread:30},
  {c:'ZAR',n:'남아공 란드',f:'🇿🇦',sym:'R',dec:2,spread:28},
  {c:'MXN',n:'멕시코 페소',f:'🇲🇽',sym:'Mex$',dec:2,spread:26},
  {c:'BRL',n:'브라질 헤알',f:'🇧🇷',sym:'R$',dec:2,spread:28},
  {c:'AED',n:'아랍에미리트 디르함',f:'🇦🇪',sym:'د.إ',dec:2,spread:24},
  {c:'SAR',n:'사우디 리얄',f:'🇸🇦',sym:'﷼',dec:2,spread:24},
  {c:'ILS',n:'이스라엘 셰켈',f:'🇮🇱',sym:'₪',dec:2,spread:26},
];
function curInfo(c){ return CURRENCIES.find(x=>x.c===c)||CURRENCIES[0]; }
/* [v4.61] 통화가 많아져 묶음·검색이 필요해졌다 */
var fxFind='', fxGroup='fav';
var FX_GROUP={
  asia:['JPY','CNY','HKD','TWD','THB','IDR','PHP','MYR','INR','SGD','VND'],
  eu:['EUR','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','TRY'],
  am:['USD','CAD','MXN','BRL'],
  etc:['AUD','NZD','ZAR','AED','SAR','ILS']
};
function fxListShown(){
  const q=String(fxFind||'').trim().toLowerCase();
  let list=CURRENCIES.slice();
  if(q){
    list=list.filter(c=>c.c.toLowerCase().includes(q)||c.n.toLowerCase().includes(q));
  }else if(fxGroup==='fav'){
    /* 보유 중인 통화를 먼저, 그다음 거래가 많은 주요 통화 */
    const major=['USD','JPY','EUR','CNY','HKD','GBP','AUD','CAD','CHF','SGD'];
    list=list.filter(c=>fxBal(c.c)>0||major.includes(c.c))
      .sort((a,b)=>(fxBal(b.c)>0?1:0)-(fxBal(a.c)>0?1:0));
  }else if(fxGroup!=='all'){
    const g=FX_GROUP[fxGroup]||[];
    list=list.filter(c=>g.includes(c.c));
  }
  return list;
}
var fxRates=null, _fxAllAt=0;
try{ const s=JSON.parse(localStorage.getItem('fxAll1')||'null');
  if(s&&s.v&&Date.now()-s.at<6*3600e3){ fxRates=s.v; _fxAllAt=s.at; } }catch(e){}
function fxLoadAll(cb){
  if(fxRates&&Date.now()-_fxAllAt<10*60e3){ cb&&cb(fxRates); return; }
  fetch('/api/fxall',{cache:'no-store'}).then(r=>r.json()).then(j=>{
    if(j&&j.rates&&j.rates.KRW){ fxRates=j.rates; _fxAllAt=Date.now();
      try{localStorage.setItem('fxAll1',JSON.stringify({v:fxRates,at:_fxAllAt}));}catch(e){}
      if(fxRates.USD)usFxSet(fxRates.KRW);      // 달러 환율도 함께 갱신
    }
    cb&&cb(fxRates);
  }).catch(()=>cb&&cb(fxRates));
}
/* 통화 1단위의 원화 값 (JPY·VND 는 100단위 관행) */
function krwPer(c){
  if(!fxRates||!fxRates.KRW)return null;
  if(c==='KRW')return 1;
  const r=fxRates[c]; if(!r||!(r>0))return null;
  return fxRates.KRW/r;                          // USD 기준 → 원화 환산
}
/* 계좌별 통화 잔고 */
/* [v4.45] 통화 잔고는 활성 계좌 장부에 담는다.
   acctBooks[acctActive] 는 저장 시점에만 갱신되므로, 없으면 즉시 만들어 둔다. */
var fxLive={};                                   // 화면에서 쓰는 현재 계좌의 통화 잔고
function fxWallet(){
  if(!acctActive)return fxLive;
  if(!acctBooks[acctActive])acctBooks[acctActive]={};
  const bk=acctBooks[acctActive];
  if(!bk.fx||typeof bk.fx!=='object')bk.fx=(fxLive&&Object.keys(fxLive).length)?fxLive:{};
  fxLive=bk.fx;
  return bk.fx;
}
function fxBal(c){ if(c==='USD')return usdCash; const w=fxWallet(); return +(w[c]||0); }
function fxSetBal(c,v){
  const nv=Math.max(0,+v||0);
  if(c==='USD'){ usdCash=+nv.toFixed(2); return; }
  const w=fxWallet(); w[c]=+nv.toFixed(curInfo(c).dec===0?0:2);
}
/* 환전 실행 — 매수/매도 스프레드에 계좌 우대율 적용 */
function fxExchange(dir,cur,amount){
  if(!acctOpened())return {ok:false,msg:'계좌를 먼저 개설해 주세요'};
  const base=krwPer(cur);
  if(!base)return {ok:false,msg:'환율을 아직 받지 못했습니다. 잠시 후 다시 시도해 주세요'};
  const info=curInfo(cur);
  const pref=US_FX_PREF_OF();                    // 계좌 종류별 우대율
  const mg=info.spread*(1-pref)*(base/1385);     // 통화 규모에 비례한 실부담
  const buy=base+mg, sell=Math.max(0.0001,base-mg);
  if(dir==='toCur'){
    const krw=Math.floor(+amount||0);
    if(krw<1000)return {ok:false,msg:'1,000원 이상부터 환전할 수 있습니다'};
    if(krw>cash)return {ok:false,msg:'원화 예수금이 부족합니다 (보유 '+KRW(cash)+'원)'};
    const p=Math.pow(10,info.dec);
    const got=Math.floor(krw/buy*p)/p;
    if(!(got>0))return {ok:false,msg:'금액이 너무 작습니다'};
    cash=intOf(cash-Math.ceil(got*buy),0); fxSetBal(cur,fxBal(cur)+got);
    saveState();
    return {ok:true,msg:`${info.sym}${fmtCur(got,cur)} 환전 완료 · 적용환율 ${fmtRate(buy,cur)} (우대 ${Math.round(pref*100)}%)`};
  }else{
    const p=Math.pow(10,info.dec);
    const amt=Math.floor((+amount||0)*p)/p;
    let avail=fxBal(cur);
    if(cur==='USD')avail=usUsdAvailable();       // 달러는 T+1 미결제분 제외
    if(!(amt>0))return {ok:false,msg:'금액을 확인하세요'};
    if(amt>avail)return {ok:false,msg:`환전 가능액 초과 · 가능 ${info.sym}${fmtCur(avail,cur)}`};
    const krw=Math.floor(amt*sell);
    fxSetBal(cur,fxBal(cur)-amt); cash=intOf(cash+krw,0);
    saveState();
    return {ok:true,msg:`${KRW(krw)}원 환전 완료 · 적용환율 ${fmtRate(sell,cur)} (우대 ${Math.round(pref*100)}%)`};
  }
}
function fmtCur(v,c){ const d=curInfo(c).dec;
  return (+v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function fmtRate(r,c){ const i=curInfo(c);
  return i.per?KRW(Math.round(r*i.per))+'원/'+i.per+i.c : KRW(Math.round(r*100)/100)+'원'; }
/* ══ [v4.56] 계좌 해지 ═════════════════════════════════════════════════════
   [용어] 실제 증권사에서는 '해지'라고 한다(폐설·폐지·삭제가 아니다).
     계약을 끝낸다는 뜻이고, 카드는 '해지', 계좌도 '해지'로 통일한다.
   [실제 규칙을 그대로 따른다]
     · 보유 주식이 남아 있으면 해지할 수 없다 — 먼저 팔거나 옮겨야 한다
     · 예수금·외화가 남아 있으면 해지할 수 없다 — 다른 계좌로 송금하거나 환전해야 한다
     · 마지막 남은 하나뿐인 계좌는 해지할 수 없다(거래 자체가 막히므로)
     · 계좌 비밀번호로 본인 확인을 거친다
   해지해도 그 계좌에서 만든 매매일지는 지우지 않고 보관한다 — 기록은 남아야 한다. */
function acctCloseBlockers(id){
  const a=acctList.find(x=>x.id===id); if(!a)return ['계좌를 찾을 수 없습니다'];
  const bk=(id===acctActive)
    ? {cash,usdCash,holdings,usdSettling,fx:fxLive}
    : (acctBooks[id]||{});
  const out=[];
  if(acctList.length<=1)out.push('마지막 남은 계좌는 해지할 수 없습니다. 다른 계좌를 먼저 개설해 주세요.');
  const hd=(bk.holdings||[]).filter(h=>h&&h.qty>0);
  if(hd.length)out.push(`보유 종목 ${hd.length}개가 남아 있습니다. 전부 매도한 뒤 해지할 수 있습니다.`);
  const c=intOf(bk.cash,0);
  if(c>0)out.push(`예수금 ${KRW(c)}원이 남아 있습니다. 다른 계좌로 송금한 뒤 해지해 주세요.`);
  const ud=+(bk.usdCash||0);
  if(ud>0)out.push(`달러 예수금 $${USD2(ud)}가 남아 있습니다. 원화로 환전한 뒤 해지해 주세요.`);
  if((bk.usdSettling||[]).length)out.push('정산 대기 중인 해외 매도 대금이 있습니다. 정산 후 해지할 수 있습니다.');
  const fx=bk.fx||{};
  const cur=Object.keys(fx).filter(k=>+fx[k]>0);
  if(cur.length)out.push(`외화 잔고(${cur.join(', ')})가 남아 있습니다. 원화로 환전한 뒤 해지해 주세요.`);
  return out;
}
function acctCloseDo(id){
  const i=acctList.findIndex(a=>a.id===id);
  if(i<0)return false;
  const a=acctList[i];
  acctList.splice(i,1);
  delete acctBooks[id];
  /* 해지 이력은 남긴다 — 나중에 '어떤 계좌를 언제 닫았는지' 확인할 수 있게 */
  if(!Array.isArray(window._acctClosed))window._acctClosed=[];
  if(id===acctActive){ const nx=acctList[0]; if(nx)acctLoad(nx.id); }
  saveState();
  toast('warn','계좌 해지 완료',`${acctLabel(a)} (${a.no||''}) 계좌를 해지했습니다`);
  return true;
}
function openAcctClose(){
  if(!acctOpened())return;
  const cur=acctCur();
  const rows=acctList.map(a=>{
    const t=ACCT_TYPES[a.type]||ACCT_TYPES.general;
    const bk=(a.id===acctActive)?{cash}:(acctBooks[a.id]||{});
    const bad=acctCloseBlockers(a.id);
    return `<button type="button" class="ac-row ${bad.length?'no':''}" data-acid="${a.id}">
      <span class="ac-ic">${t.ic}</span>
      <span class="ac-nm"><b>${t.n}</b><i>${a.no||'번호 없음'}</i></span>
      <span class="ac-cash num">${KRW(intOf(bk.cash,0))}원</span>
      <span class="ac-st">${bad.length?'해지 불가':'해지 가능'}</span></button>`;}).join('');
  openLiteGate('계좌 해지',`<div class="acclose">
    <p class="ae-d">해지할 계좌를 고르세요. 실제 증권사와 같이 <b>남은 자산이 없어야</b> 해지할 수 있습니다.
      매매일지는 해지 후에도 보관됩니다.</p>
    <div class="ac-list">${rows}</div>
    <div id="acDetail"></div></div>`);
  document.querySelectorAll('[data-acid]').forEach(b=>b.onclick=()=>acctClosePick(b.dataset.acid));
  if(cur)acctClosePick(cur.id);
}
function acctClosePick(id){
  document.querySelectorAll('[data-acid]').forEach(b=>b.classList.toggle('on',b.dataset.acid===id));
  const box=$('acDetail'); if(!box)return;
  const a=acctList.find(x=>x.id===id); if(!a)return;
  const t=ACCT_TYPES[a.type]||ACCT_TYPES.general;
  const bad=acctCloseBlockers(id);
  if(bad.length){
    box.innerHTML=`<div class="ac-block"><b>이 계좌는 지금 해지할 수 없습니다</b>
      <ul>${bad.map(x=>`<li>${x}</li>`).join('')}</ul>
      <span class="ac-tip">💡 예수금은 <b>송금</b>으로 다른 계좌에 옮기고, 외화는 <b>환전</b>으로 원화로 바꾼 뒤 다시 시도해 주세요.</span></div>`;
    return;
  }
  box.innerHTML=`<div class="ac-ok">
    <b>${t.ic} ${t.n}</b><span>${a.no||''}</span>
    <p>해지하면 이 계좌는 목록에서 사라지고 되돌릴 수 없습니다. 계좌번호도 다시 쓸 수 없습니다.</p>
    <label class="ac-agree" id="acAgree"><span class="ae-ck"></span>위 내용을 확인했으며 해지에 동의합니다</label>
    <div class="ae-msg" id="acMsg"></div>
    <button class="modal-btn danger" id="acGo">계좌 해지하기</button></div>`;
  let agreed=false;
  const ag=$('acAgree');
  ag.onclick=()=>{ agreed=!agreed; ag.classList.toggle('on',agreed);
    ag.querySelector('.ae-ck').textContent=agreed?'✓':''; };
  $('acGo').onclick=()=>{
    const m=$('acMsg'); m.style.color='var(--down)';
    if(!agreed){ m.textContent='해지 동의에 체크해 주세요.'; return; }
    askAcctPw('계좌 해지 확인',`${t.n} 계좌를 해지합니다`,(ok)=>{
      if(!ok){ toast('warn','비밀번호가 올바르지 않습니다','계좌 비밀번호를 다시 확인해 주세요'); return; }
      acctCloseDo(id);
      closeLiteGate();
      renderAcctBar(); try{renderAcctFx();renderAcctSend();renderPortfolioNumbers();renderHoldings();renderOrdAcct();}catch(e){}
    });
  };
}
/* ══ [v4.56] 주문 계좌 선택 ═══════════════════════════════════════════════
   [왜] 계좌를 여러 개 열 수 있게 해 놓고, 정작 주문 화면에서는 어느 계좌로
   체결되는지 보이지도 바꾸지도 못했다. 내 계좌 화면까지 갔다 와야 했다.
   → 매수·매도 탭 바로 위에 계좌를 놓고, 여기서 바꾸면 즉시 전환된다.
   국내·해외 주문 박스가 같은 조각을 쓰므로 한 곳만 고치면 둘 다 반영된다. */
function ordAcctHTML(id){
  if(!acctOpened())return '';
  const cur=acctCur(); if(!cur)return '';
  const t=ACCT_TYPES[cur.type]||ACCT_TYPES.general;
  return `<div class="oa-wrap">
    <label for="${id}">주문 계좌</label>
    <select id="${id}">${acctList.map(a=>{
      const ty=ACCT_TYPES[a.type]||ACCT_TYPES.general;
      const bk=(a.id===acctActive)?{cash}:(acctBooks[a.id]||{});
      return `<option value="${a.id}" ${a.id===acctActive?'selected':''}>${ty.ic} ${ty.n} · ${KRW(intOf(bk.cash,0))}원</option>`;
    }).join('')}</select>
    <span class="oa-no">${cur.no||''}</span></div>`;
}
function wireOrdAcct(id,after){
  const el=$(id); if(!el)return;
  el.onchange=(e)=>{ acctSwitch(e.target.value); try{after&&after();}catch(x){} };
}
function renderOrdAcct(){
  const box=$('ordAcct'); if(!box)return;
  box.innerHTML=ordAcctHTML('ordAcctSel');
  wireOrdAcct('ordAcctSel',()=>{ try{renderOrdAcct();}catch(e){}
    try{if(typeof renderOrder==='function')renderOrder();}catch(e){}
    try{if(typeof updateSummary==='function')updateSummary();}catch(e){} });
}
/* ══ [v4.51] 송금 ══════════════════════════════════════════════════════════
   [왜 필요했나] 계좌를 여러 개 열 수 있는데 그 사이에 돈을 옮길 방법이 없었다.
   ISA 에 예수금을 몰아넣었다가 해외 계좌로 옮기고 싶어도, 예수금을 손으로 고쳐
   쓰는 수밖에 없었다 — 그건 이체가 아니라 숫자 조작이라 배우는 게 없다.
   [설계] 실제 이체 절차를 그대로 옮긴다.
     · 받는 계좌를 '계좌번호'로 지정한다(직접 입력 또는 내 계좌에서 고르기)
     · 금액 · 받는 분 통장 표시(메모) 를 넣는다
     · 1회/1일 이체한도를 두고, 계좌 비밀번호로 확인한 뒤 실행한다
     · 양쪽 장부에 각각 기록이 남는다
   앱 안의 내 계좌끼리만 오간다 — 바깥으로 나가는 실제 송금이 아니다. */
var SEND_LIMIT_ONE=50000000, SEND_LIMIT_DAY=100000000;
var sendLog=[];                                     // [{at,from,to,amt,memo}]
function sendTodayTotal(){
  const d=kstDay();
  return sendLog.filter(x=>x&&x.day===d).reduce((a,x)=>a+(+x.amt||0),0);
}
function acctByNo(no){
  const clean=String(no||'').replace(/\s/g,'');
  return acctList.find(a=>a.no&&a.no.replace(/\s/g,'')===clean)||null;
}
function acctLabel(a){
  if(!a)return '—';
  const t=ACCT_TYPES[a.type]||ACCT_TYPES.general;
  return `${t.ic} ${t.n}`;
}
function acctCashOf(id){
  if(id===acctActive)return cash;
  return intOf((acctBooks[id]||{}).cash,0);
}
/* 실제 이체 — 보내는 쪽에서 빼고 받는 쪽에 더한 뒤 양쪽 장부에 기록을 남긴다 */
function doSend(toId,amt,memo){
  const from=acctCur();
  if(!from)return {ok:false,msg:'출금 계좌를 찾을 수 없습니다'};
  if(toId===from.id)return {ok:false,msg:'같은 계좌로는 보낼 수 없습니다'};
  const to=acctList.find(a=>a.id===toId);
  if(!to)return {ok:false,msg:'받는 계좌를 찾을 수 없습니다'};
  const v=intOf(amt,0);
  if(v<1000)return {ok:false,msg:'1,000원 이상부터 보낼 수 있습니다'};
  if(v>cash)return {ok:false,msg:`출금 계좌 예수금이 부족합니다 (보유 ${KRW(cash)}원)`};
  if(v>SEND_LIMIT_ONE)return {ok:false,msg:`1회 이체한도는 ${KRW(SEND_LIMIT_ONE)}원입니다`};
  if(sendTodayTotal()+v>SEND_LIMIT_DAY)
    return {ok:false,msg:`1일 이체한도 ${KRW(SEND_LIMIT_DAY)}원을 넘습니다 (오늘 ${KRW(sendTodayTotal())}원 이체함)`};
  const tt=ACCT_TYPES[to.type];
  if(tt&&tt.limit){
    const after=acctCashOf(to.id)+v;
    if(after>tt.limit)
      return {ok:false,msg:`${tt.n}의 연 납입한도는 ${KRW(tt.limit)}원입니다. 이체 후 ${KRW(after)}원이 되어 한도를 넘습니다`};
  }
  cash=intOf(cash-v,0);                       // 보내는 계좌(=현재 활성)에서 차감
  acctSnap();
  const bk=acctBooks[to.id]||(acctBooks[to.id]={cash:0,usdCash:0,usdSettling:[],holdings:[],tradeLog:[],tradeArchive:{},ipoPlans:[]});
  bk.cash=intOf(bk.cash,0)+v;                 // 받는 계좌에 입금
  const rec={at:Date.now(),day:kstDay(),from:from.no||from.id,to:to.no||to.id,
    fromId:from.id,toId:to.id,amt:v,memo:String(memo||'').slice(0,20)};
  sendLog.unshift(rec); if(sendLog.length>200)sendLog.length=200;
  saveState();
  return {ok:true,msg:`${acctLabel(to)}(${to.no||''}) 로 ${KRW(v)}원을 보냈습니다`,rec};
}
var sendToId='';
function renderAcctSend(){
  const sec=$('acctSendSec'); if(!sec)return;
  if(!acctOpened()){ sec.innerHTML=''; return; }
  const me=acctCur();
  const others=acctList.filter(a=>a.id!==me.id);
  if(!others.length){
    sec.innerHTML=`<div class="sec"><div class="sec-title">송금 <span class="sec-sub">· 내 계좌 사이 이체</span></div>
      <div class="panel asend"><div class="asend-empty"><b>보낼 곳이 아직 없습니다</b>
        <span>계좌를 하나 더 개설하면 계좌번호로 예수금을 옮길 수 있어요.</span>
        <button type="button" class="uz-retry" id="asOpenAcct">계좌 개설하기</button></div></div></div>`;
    const b=$('asOpenAcct'); if(b)b.onclick=()=>openAcctOpenSheet();
    return;
  }
  if(!others.some(a=>a.id===sendToId))sendToId='';
  const today=sendTodayTotal();
  sec.innerHTML=`<div class="sec"><div class="sec-title">송금 <span class="sec-sub">· 내 계좌 사이 이체 · 1회 ${KRW(SEND_LIMIT_ONE)}원 · 1일 ${KRW(SEND_LIMIT_DAY)}원</span></div>
    <div class="panel asend">
      <div class="asend-from"><small>출금 계좌</small>
        <b>${acctLabel(me)}</b><i class="num">${me.no||'번호 없음'}</i>
        <span class="num">출금가능 ${KRW(cash)}원</span></div>
      <div class="asend-arrow">↓</div>
      <div class="us-fld"><label><span>받는 계좌번호</span>
        <span class="num">오늘 이체 ${KRW(today)}원 / ${KRW(SEND_LIMIT_DAY)}원</span></label>
        <div class="us-inrow"><input id="asNo" inputmode="numeric" placeholder="900-01-123456-7"
          value="${sendToId?htmlEsc((acctList.find(a=>a.id===sendToId)||{}).no||''):''}">
          <button id="asPick" style="width:96px;font-size:12px">내 계좌</button></div></div>
      <div class="asend-picks" id="asPicks" hidden>${others.map(a=>`
        <button type="button" class="asend-p" data-asto="${a.id}">
          <b>${acctLabel(a)}</b><i class="num">${a.no||'—'}</i>
          <span class="num">${KRW(acctCashOf(a.id))}원</span></button>`).join('')}</div>
      <div class="asend-to" id="asTo"></div>
      <div class="us-fld"><label><span>보낼 금액</span><span class="num">보유 ${KRW(cash)}원</span></label>
        <div class="us-inrow"><input id="asAmt" class="num" inputmode="numeric" placeholder="예: 1,000,000">
          <button id="asMax" style="width:64px;font-size:12px">전액</button></div></div>
      <div class="asend-quick">${[100000,500000,1000000,5000000].map(v=>
        `<button type="button" data-asq="${v}">+${KRW(v)}</button>`).join('')}
        <button type="button" data-asq="0">지우기</button></div>
      <div class="us-fld"><label><span>받는 분 통장 표시</span><span class="num">선택 · 20자</span></label>
        <div class="us-inrow"><input id="asMemo" maxlength="20" placeholder="비워 두면 예금주 이름으로 표시됩니다"></div></div>
      <div id="asMsg" class="ae-msg"></div>
      <button class="us-submit buy" id="asGo">송금하기</button>
      <div class="us-ord-note">※ 앱 안의 내 계좌끼리만 이동합니다. 외부 금융기관으로 나가는 실제 송금이 아닙니다.<br>
      ※ 보유 주식은 함께 옮겨지지 않습니다. 예수금(원화)만 이동합니다.</div>
      ${sendLog.length?`<div class="asend-log"><div class="asl-h">최근 이체</div>
        ${sendLog.slice(0,5).map(r=>`<div class="asl-r"><span>${new Date(r.at).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})}</span>
          <b>${htmlEsc(r.to)}</b><i class="num">${KRW(r.amt)}원</i></div>`).join('')}</div>`:''}
    </div></div>`;
  const noIn=$('asNo'), amt=$('asAmt'), msg=$('asMsg'), toBox=$('asTo');
  const paintTo=()=>{
    const a=acctByNo(noIn.value);
    if(!noIn.value.trim()){ toBox.innerHTML=''; sendToId=''; return; }
    if(!a){ toBox.innerHTML=`<div class="asend-bad">등록되지 않은 계좌번호입니다</div>`; sendToId=''; return; }
    if(a.id===acctActive){ toBox.innerHTML=`<div class="asend-bad">지금 쓰는 계좌입니다. 다른 계좌를 골라 주세요</div>`; sendToId=''; return; }
    sendToId=a.id;
    const h=(a.holder&&a.holder.name)?a.holder.name:(currentUser||'');
    toBox.innerHTML=`<div class="asend-ok"><b>${acctLabel(a)}</b><span>예금주 ${htmlEsc(h)}</span></div>`;
  };
  noIn.oninput=()=>{ let v=noIn.value.replace(/[^0-9]/g,'').slice(0,12);
    if(v.length>11)v=v.slice(0,3)+'-'+v.slice(3,5)+'-'+v.slice(5,11)+'-'+v.slice(11);
    else if(v.length>5)v=v.slice(0,3)+'-'+v.slice(3,5)+'-'+v.slice(5);
    else if(v.length>3)v=v.slice(0,3)+'-'+v.slice(3);
    noIn.value=v; paintTo(); };
  paintTo();
  $('asPick').onclick=()=>{ const p=$('asPicks'); p.hidden=!p.hidden; };
  sec.querySelectorAll('[data-asto]').forEach(b=>b.onclick=()=>{
    const a=acctList.find(x=>x.id===b.dataset.asto);
    if(a){ noIn.value=a.no||''; $('asPicks').hidden=true; paintTo(); } });
  amt.oninput=()=>{ const n=amt.value.replace(/[^0-9]/g,'');
    amt.value=n?Number(n).toLocaleString('en-US'):''; };
  $('asMax').onclick=()=>{ amt.value=KRW(cash); };
  sec.querySelectorAll('[data-asq]').forEach(b=>b.onclick=()=>{
    const add=+b.dataset.asq;
    if(!add){ amt.value=''; return; }
    const cur=parseInt(amt.value.replace(/[^0-9]/g,''))||0;
    amt.value=Number(Math.min(cur+add,cash)).toLocaleString('en-US'); });
  $('asGo').onclick=()=>{
    msg.style.color='var(--down)';
    if(!sendToId){ msg.textContent='받는 계좌번호를 확인해 주세요.'; return; }
    const v=parseInt(String(amt.value).replace(/[^0-9]/g,''))||0;
    if(!(v>0)){ msg.textContent='보낼 금액을 입력해 주세요.'; return; }
    /* 실제 이체와 같이 계좌 비밀번호로 확인한다 */
    askAcctPw('송금 확인',`${KRW(v)}원을 보냅니다`,(ok)=>{
      if(!ok){ msg.textContent='비밀번호가 올바르지 않습니다.'; return; }
      const r=doSend(sendToId,v,$('asMemo').value);
      if(!r.ok){ msg.textContent=r.msg; return; }
      msg.style.color='var(--up)'; msg.textContent=r.msg;
      toast('buy','송금 완료',r.msg);
      renderAcctSend(); renderAcctBar();
      try{renderPortfolioNumbers();renderAcctFx();}catch(e){}
    });
  };
}
/* 계좌 비밀번호 확인 — 주문 확인과 같은 방식을 송금에도 쓴다 */
function askAcctPw(title,sub,cb){
  openLiteGate(title,`<div class="askpw">
    <p class="ae-d">${htmlEsc(sub)} · 계좌 비밀번호 4자리를 입력해 주세요.</p>
    <input id="askPwIn" type="password" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="off">
    <div class="ae-msg" id="askPwMsg"></div>
    <div class="ae-nav two"><button class="modal-btn ghost" id="askPwNo">취소</button>
      <button class="modal-btn" id="askPwOk">확인</button></div></div>`);
  const inp=$('askPwIn'); if(inp)setTimeout(()=>inp.focus(),80);
  const done=(ok)=>{ closeLiteGate(); cb(ok); };
  $('askPwNo').onclick=()=>closeLiteGate();
  const go=()=>{ const v=(inp.value||'').trim();
    if(!/^\d{4}$/.test(v)){ $('askPwMsg').textContent='숫자 4자리를 입력해 주세요.'; return; }
    pwHash(v).then(h=>{ const AP=acctPwOf();
      done(h===AP||legacyHash(v)===AP); }); };
  $('askPwOk').onclick=go;
  if(inp)inp.onkeydown=(e)=>{ if(e.key==='Enter')go(); };
}
/* ══ [v4.40] 계좌 선택 바 + 미개설 안내 ═══════════════════════════════════ */
var aeSel='general';
var fxSel='USD', fxDir='toCur';
/* 내 계좌 환전 코너 */
function renderAcctFx(){
  const sec=$('acctFxSec'); if(!sec)return;
  if(!acctOpened()){ sec.innerHTML=''; return; }
  const info=curInfo(fxSel), base=krwPer(fxSel);
  const pref=US_FX_PREF_OF();
  const mg=base?info.spread*(1-pref)*(base/1385):0;
  const buy=base?base+mg:null, sell=base?Math.max(0.0001,base-mg):null;
  const held=CURRENCIES.filter(c=>fxBal(c.c)>0);
  const toCur=fxDir==='toCur';
  const avail=fxSel==='USD'?usUsdAvailable():fxBal(fxSel);
  sec.innerHTML=`<div class="sec"><div class="sec-title">환전 <span class="sec-sub">· 원화 ↔ ${CURRENCIES.length}개 통화 · 계좌 우대 ${Math.round(pref*100)}%</span></div>
    <div class="panel afx">
      <div class="afx-wallet">
        <div class="afw-i"><small>🇰🇷 KRW 예수금</small><b class="num">${KRW(cash)}원</b></div>
        ${held.length?held.map(c=>`<div class="afw-i held"><small>${c.f} ${c.c}</small><b class="num">${c.sym}${fmtCur(fxBal(c.c),c.c)}</b>
          <i class="num">${krwPer(c.c)?'≈ '+KRW(Math.round(fxBal(c.c)*krwPer(c.c)))+'원':''}</i></div>`).join('')
          :`<div class="afw-i empty2"><small>보유 외화</small><b>아직 없습니다</b></div>`}
      </div>
      <!-- [v4.61] 통화가 31개로 늘어 칩만 늘어놓으면 찾기 어렵다 — 검색과 묶음을 둔다 -->
      <div class="afx-tools">
        <input id="afxFind" class="afx-find" placeholder="통화 검색 (USD, 엔, 유로…)" value="${htmlEsc(fxFind||'')}">
        <div class="afx-groups">${[['fav','보유·주요'],['asia','아시아'],['eu','유럽'],['am','미주'],['etc','기타'],['all','전체']]
          .map(([k,l])=>`<button class="afx-g ${fxGroup===k?'on':''}" data-fxg="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="afx-cur" id="afxCur">${fxListShown().map(c=>
        `<button class="afx-c ${fxSel===c.c?'on':''} ${fxBal(c.c)>0?'has':''}" data-cur="${c.c}"><i>${c.f}</i><b>${c.c}</b>
          <span class="num">${krwPer(c.c)?fmtRate(krwPer(c.c),c.c):'—'}</span></button>`).join('')
        ||'<div class="afx-none">맞는 통화가 없습니다</div>'}</div>
      <div class="us-chips" style="margin:12px 0 8px">
        <button class="us-chip ${toCur?'on':''}" data-fxdir="toCur">원화 → ${info.c} (살 때 ${buy?fmtRate(buy,fxSel):'—'})</button>
        <button class="us-chip ${!toCur?'on':''}" data-fxdir="toKrw">${info.c} → 원화 (팔 때 ${sell?fmtRate(sell,fxSel):'—'})</button>
      </div>
      <div class="us-fld"><label><span>${toCur?'환전할 원화 금액':'환전할 '+info.n+' 금액'}</span>
        <span class="num">${toCur?'보유 '+KRW(cash)+'원':'가능 '+info.sym+fmtCur(avail,fxSel)}</span></label>
        <div class="us-inrow"><input id="afxAmt" inputmode="decimal" placeholder="${toCur?'예: 1000000':'예: 500'}">
          <button id="afxMax" style="width:64px;font-size:12px">전액</button></div></div>
      <div id="afxPrev" class="us-ord-note" style="margin:6px 0 10px"></div>
      <button class="us-submit buy" id="afxGo">${base?'환전 실행':'환율 확인 중 · 눌러서 다시 시도'}</button>
      <div class="us-ord-note">※ 환율은 실시간 기준가에 통화별 스프레드를 적용하며, 계좌 종류에 따라 우대율이 다릅니다.<br>
      ※ 달러는 해외 주식 주문에 바로 쓰이고, 매도 대금은 T+1 정산 후 원화로 환전할 수 있습니다.</div>
    </div></div>`;
  {const f=$('afxFind');
   if(f)f.oninput=()=>{ fxFind=f.value; renderAcctFx();
     const g=$('afxFind'); if(g){g.focus(); g.setSelectionRange(g.value.length,g.value.length);} };}
  sec.querySelectorAll('[data-fxg]').forEach(b=>b.onclick=()=>{ fxGroup=b.dataset.fxg; renderAcctFx(); });
  const amt=$('afxAmt'), pv=$('afxPrev');
  const prev=()=>{ const v=parseFloat(amt.value)||0;
    if(!base||!(v>0)){pv.textContent='';return;}
    if(toCur){ const p=Math.pow(10,info.dec);
      pv.innerHTML=`받게 될 금액: <b class="num">${info.sym}${fmtCur(Math.floor(v/buy*p)/p,fxSel)}</b>`; }
    else pv.innerHTML=`받게 될 원화: <b class="num">${KRW(Math.floor(Math.min(v,avail)*sell))}원</b>`; };
  amt.oninput=prev;
  $('afxMax').onclick=()=>{ amt.value=toCur?cash:avail; prev(); };
  sec.querySelectorAll('[data-cur]').forEach(b2=>b2.onclick=()=>{fxSel=b2.dataset.cur;renderAcctFx();});
  sec.querySelectorAll('[data-fxdir]').forEach(b2=>b2.onclick=()=>{fxDir=b2.dataset.fxdir;renderAcctFx();});
  $('afxGo').onclick=()=>{
    if(!krwPer(fxSel)){ toast('warn','환율을 받는 중입니다','잠시 후 자동으로 표시됩니다');
      fxLoadAll(()=>renderAcctFx()); return; }
    const r=fxExchange(fxDir,fxSel,parseFloat(amt.value)||0);
    toast(r.ok?'buy':'warn',r.ok?'환전 완료':'환전 실패',r.msg);
    if(r.ok){ renderAcctFx(); try{renderPortfolioNumbers();}catch(e){} }
  };
  if(!base)fxLoadAll(()=>{ if(currentView==='account')renderAcctFx(); });
}
function renderAcctBar(){
  const bar=$('acctBar'), guide=$('acctGuide'), hero=$('acctHeroPanel');
  if(!bar||!guide)return;
  if(!acctOpened()){
    bar.innerHTML=''; if(hero)hero.hidden=true;
    guide.innerHTML=`<div class="panel acct-empty">
      <div class="ae-ic">🏦</div>
      <div class="ae-t">아직 개설된 계좌가 없습니다</div>
      <div class="ae-d">주식을 사고팔려면 먼저 계좌를 개설해야 합니다. 종류에 따라 <b>수수료와 환전 우대, 납입한도</b>가 달라요.<br>
        개설은 1분이면 끝나고, 계좌는 <b>여러 개</b> 만들어 목적별로 나눠 쓸 수 있습니다.</div>
      <div class="acct-pick" id="aeTypes"></div>
      <div class="acct-detail" id="aeDetail"></div>
      <div class="fld2" style="margin-top:12px"><label>시작 예수금 (원)</label>
        <input id="aeCash" class="num" inputmode="numeric" value="10,000,000"></div>
      <div class="fld2"><label>계좌 비밀번호 <small style="font-weight:600;color:var(--sub-2)">— 주문할 때 입력합니다 (숫자 4자리)</small></label>
        <input id="aePw" type="password" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="new-password"></div>
      <div class="ae-msg" id="aeMsg"></div>
      <button class="modal-btn" id="aeGo">계좌 개설하기</button>
      <div class="ae-note">모의 계좌입니다 · 실제 금융거래가 아니며 개인정보를 요구하지 않습니다.</div>
    </div>`;
    renderAeTypes(); return;
  }
  guide.innerHTML=''; if(hero)hero.hidden=false;
  const cur=acctCur(), t=ACCT_TYPES[cur.type]||ACCT_TYPES.general;
  bar.innerHTML=`<div class="panel acct-bar">
    <div class="ab-l"><span class="ab-ic">${t.ic}</span>
      <div class="ab-sel"><label for="acctSelect">거래 계좌</label>
        <select id="acctSelect">${acctList.map(a=>{const ty=ACCT_TYPES[a.type]||ACCT_TYPES.general;
          const bk=(a.id===acctActive)?{cash}:(acctBooks[a.id]||{});
          return `<option value="${a.id}" ${a.id===acctActive?'selected':''}>${ty.ic} ${ty.n} · ${KRW(intOf(bk.cash,0))}원</option>`;}).join('')}</select>
        <div class="ab-no">계좌번호 <b>${cur.no||'—'}</b></div>
      </div></div>
    <div class="ab-r">
      <div class="ab-kv"><span>국내</span><b>${(FEE_RATE_BASE*t.feeKr*100).toFixed(4)}%</b></div>
      <div class="ab-kv"><span>해외</span><b>${(US_FEE_BASE*t.feeUs*100).toFixed(2)}%</b></div>
      <div class="ab-kv"><span>환전우대</span><b>${Math.round((t.fxPref!=null?t.fxPref:0.95)*100)}%</b></div>
      <button class="ab-add" id="acctAddBtn">+ 계좌 개설</button>
      <button class="ab-add close" id="acctCloseBtn">계좌 해지</button></div></div>`;
  $('acctSelect').onchange=(e)=>acctSwitch(e.target.value);
  $('acctAddBtn').onclick=()=>openAcctOpenSheet();
  {const cb=$('acctCloseBtn'); if(cb)cb.onclick=()=>openAcctClose();}
}
function renderAeTypes(){
  const box=$('aeTypes'); if(!box)return;
  box.innerHTML=Object.keys(ACCT_TYPES).map(k=>{const a=ACCT_TYPES[k];
    return `<button type="button" class="acct-chip ${aeSel===k?'on':''}" data-ae="${k}"><i>${a.ic}</i><b>${a.n}</b></button>`;}).join('');
  box.querySelectorAll('[data-ae]').forEach(b=>b.onclick=()=>{aeSel=b.dataset.ae;renderAeTypes();});
  const a=ACCT_TYPES[aeSel], dt=$('aeDetail');
  if(dt)dt.innerHTML=`<div class="acct-d"><p>${a.d}</p>
    <div class="acct-kv"><span>국내 수수료</span><b>${(FEE_RATE_BASE*a.feeKr*100).toFixed(4)}%</b></div>
    <div class="acct-kv"><span>해외 수수료</span><b>${(US_FEE_BASE*a.feeUs*100).toFixed(2)}%</b></div>
    <div class="acct-kv"><span>환전 우대</span><b>${Math.round((a.fxPref!=null?a.fxPref:0.95)*100)}%</b></div>
    <div class="acct-kv"><span>연 납입한도</span><b>${a.limit?KRW(a.limit)+'원':'없음'}</b></div>
    <div class="acct-tags">${a.pros.map(x=>`<span class="acct-pro">✓ ${x}</span>`).join('')}
      ${a.cons.map(x=>`<span class="acct-con">· ${x}</span>`).join('')}</div></div>`;
  const go=$('aeGo'); if(go)go.onclick=()=>doAcctOpen();
}
function finishAcctOpen(t,v,a){
  try{sanitizeAccount(true);}catch(e){}
  try{closeLiteGate();}catch(e){}
  renderAcctBar(); try{renderAcctFx();renderAcctSend();renderPortfolioNumbers();renderHoldings();}catch(e){}
  /* [v4.51] 개설 결과를 계좌번호와 함께 보여 준다 — 번호가 없으면 계좌를 텄다는 실감이 안 난다 */
  const no=(a&&a.no)?a.no:'—';
  openLiteGate('계좌 개설 완료',`<div class="ae-done">
    <div class="aed-ic">${t.ic}</div>
    <div class="aed-t">${t.n} 개설이 완료되었습니다</div>
    <div class="aed-no"><small>계좌번호</small><b id="aedNo">${no}</b>
      <button type="button" class="aed-copy" id="aedCopy">복사</button></div>
    <div class="aed-kv"><span>예금주</span><b>${htmlEsc((a&&a.holder&&a.holder.name)||(currentUser||''))}</b></div>
    <div class="aed-kv"><span>시작 예수금</span><b class="num">${KRW(v)}원</b></div>
    <div class="aed-kv"><span>국내 수수료</span><b>${(FEE_RATE_BASE*t.feeKr*100).toFixed(4)}%</b></div>
    <div class="aed-kv"><span>해외 수수료</span><b>${(US_FEE_BASE*t.feeUs*100).toFixed(2)}%</b></div>
    <div class="aed-note">계좌번호는 이 모의 서비스 전용입니다. 실제 금융기관 계좌와 아무 관계가 없으며, 송금도 앱 안의 내 계좌끼리만 이루어집니다.</div>
    <button class="modal-btn" id="aedClose">확인</button></div>`);
  const cp=$('aedCopy');
  if(cp)cp.onclick=()=>{ try{navigator.clipboard.writeText(no);
    cp.textContent='복사됨'; setTimeout(()=>{cp.textContent='복사';},1400);}catch(e){} };
  const cl=$('aedClose'); if(cl)cl.onclick=closeLiteGate;
  toast('buy','계좌 개설 완료',t.n+' · '+no+' · 예수금 '+KRW(v)+'원');
}
/* ══ [v4.51] 계좌 개설 전면 개편 ═══════════════════════════════════════════
   [무엇이 부족했나] 예전 개설 화면은 '계좌 종류 · 시작 예수금 · 비밀번호' 셋뿐이었다.
   실제 증권사에서 계좌를 트면 신원 확인, 투자성향 파악, 약관 동의를 반드시 거치고
   그 결과로 '계좌번호'를 받는다. 번호가 없으니 개설했다는 실감도 나지 않았다.
   [무엇을 넣었나]
     1단계 계좌 선택 — 기존과 같되 비교가 쉽게 정리
     2단계 신청인 정보 — 이름·생년월일·연락처·이메일·직업·투자목적·자금출처·투자성향
     3단계 약관 동의 — 필수 4종(개설약관·개인정보 수집이용·고유식별정보·투자위험고지)
                       + 선택 2종(마케팅 수신·제3자 제공). 전체동의와 개별 펼쳐보기 제공
     4단계 예수금·비밀번호 — 4자리 확인 입력까지
   [계좌번호] 개설 즉시 발급한다. 증권사 실계좌와 헷갈리지 않도록 모의 전용
   기관코드(900)를 앞에 두고, 같은 계정 안에서 중복되지 않게 검사한다. */
var AE_STEP=1, aeForm=null;
/* [v4.52] 선택지를 청소년까지 아우르게 넓혔다 — '학생'을 고르고 나서 자금 출처에
   근로소득밖에 없으면 억지로 사실이 아닌 항목을 고르게 된다. */
var AE_JOBS=['학생','회사원','공무원','자영업','전문직','주부','프리랜서','무직','기타'];
var AE_PURPOSE=['투자 공부','자산 증식','목돈 마련','학자금 마련','노후 준비','주택 마련','기타'];
var AE_SOURCE=['용돈','아르바이트 소득','근로소득','사업소득','금융소득','상속·증여','퇴직금','부모 지원','기타'];
var AE_RISK=[
  ['stable','안정형','원금 손실을 원하지 않습니다. 예금 수준의 변동만 감내합니다.'],
  ['safe','안정추구형','원금 보전을 우선하되 약간의 손실은 감수할 수 있습니다.'],
  ['neutral','위험중립형','기대수익을 위해 그에 상응하는 손실 위험을 받아들입니다.'],
  ['active','적극투자형','높은 수익을 위해 상당한 손실 위험을 감수합니다.'],
  ['aggressive','공격투자형','원금 대부분의 손실도 감수하고 최대 수익을 추구합니다.']
];
var AE_TERMS=[
  ['t1',1,'계좌 개설 및 금융거래 약관','이 서비스는 학습용 모의투자입니다. 실제 매매·실제 자금 이동이 발생하지 않으며, 화면의 모든 손익은 가상입니다. 모의 계좌는 언제든 해지할 수 있습니다.'],
  ['t2',1,'개인정보 수집·이용 동의','수집 항목: 이름, 생년월일, 연락처, 이메일, 직업, 투자목적, 자금출처, 투자성향. 이용 목적: 모의 계좌 개설과 화면 표시. 보관 기간: 계좌 해지 시까지. 이 정보는 이 기기와 회원 계정에만 저장되며 외부에 제공되지 않습니다. 동의를 거부할 수 있으나 그 경우 계좌를 개설할 수 없습니다.'],
  ['t3',1,'고유식별정보 처리 동의','실제 증권사는 주민등록번호로 실명을 확인하고 성인 여부를 따집니다. 이 모의 서비스는 실제 자금이 오가지 않는 학습용이므로 주민등록번호를 받지 않고, 나이로 가입을 제한하지도 않습니다. 생년월일은 화면 표시와 입력 확인에만 쓰입니다.'],
  ['t4',1,'투자위험 고지 확인','주식 투자는 원금 손실이 발생할 수 있고 예금자보호를 받지 않습니다. 해외 주식은 환율 변동에 따라 추가 손익이 생깁니다. 과거 수익률이 미래 수익을 보장하지 않습니다.'],
  ['t5',0,'마케팅 정보 수신 동의 (선택)','새 기능과 학습 콘텐츠 안내를 앱 알림으로 받습니다. 동의하지 않아도 계좌 개설과 모든 기능 이용에 제한이 없습니다.'],
  ['t6',0,'제3자 정보 제공 동의 (선택)','이 모의 서비스는 실제로 제3자에게 정보를 제공하지 않습니다. 실제 증권사 개설 절차를 그대로 보여 주기 위한 항목입니다.']
];
/* 모의 전용 계좌번호 — 900-계좌종류(2)-일련(6)-검증(1) */
var ACCT_CODE={general:'01',isa:'21',pension:'31',irp:'32',overseas:'41',cma:'51',credit:'61'};
function acctNewNo(type){
  const mid=ACCT_CODE[type]||'09';
  for(let tries=0;tries<40;tries++){
    let ser=''; for(let i=0;i<6;i++)ser+=Math.floor(Math.random()*10);
    /* 검증숫자 — 자리별 가중합의 나머지. 아무 번호나 통과하지 않게 하는 실제 방식이다 */
    const body=('900'+mid+ser).split('').map(Number);
    let sum=0; body.forEach((n,i)=>sum+=n*((i%2)?1:3));
    const chk=(10-(sum%10))%10;
    const no=`900-${mid}-${ser}-${chk}`;
    if(!acctList.some(a=>a.no===no))return no;
  }
  return '900-'+mid+'-'+Date.now().toString().slice(-6)+'-0';
}
function aeInit(){
  AE_STEP=1; aeSel='general';
  const acc=(typeof accounts==='function'&&currentUser)?(accounts()[currentUser]||{}):{};
  aeForm={name:acc.name||'',birth:'',phone:'',email:acc.email||'',job:'',purpose:'',source:'',
    risk:'',cash:'10,000,000',pw:'',pw2:'',terms:{}};
}
function aeSave(){
  const g=(id)=>{const e=$(id);return e?String(e.value||'').trim():'';};
  if(AE_STEP===2){ aeForm.name=g('aeName'); aeForm.birth=g('aeBirth'); aeForm.phone=g('aePhone');
    aeForm.email=g('aeEmail'); aeForm.job=g('aeJob'); aeForm.purpose=g('aePurpose');
    aeForm.source=g('aeSource'); aeForm.risk=g('aeRisk'); }
  if(AE_STEP===4){ aeForm.cash=g('aeCash'); aeForm.pw=g('aePw'); aeForm.pw2=g('aePw2'); }
}
function aeGo(step){ aeSave(); AE_STEP=step; renderAeSheet(); }
function aeSay(html,ok){
  const m=$('aeMsg'); if(!m)return;
  m.style.color=ok?'var(--up)':'var(--down)'; m.innerHTML=html;
}
/* 만 나이 — 입력한 생년월일이 실제로 있을 수 있는 날짜인지 가려내는 데 쓴다 */
function aeAge(b){
  const m=String(b||'').match(/^(\d{4})-?(\d{2})-?(\d{2})$/); if(!m)return null;
  const y=+m[1],mo=+m[2],d=+m[3];
  if(mo<1||mo>12||d<1||d>31)return null;
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return null;
  const now=kstNow();
  let age=now.getUTCFullYear()-y;
  const passed=(now.getUTCMonth()+1>mo)||((now.getUTCMonth()+1===mo)&&now.getUTCDate()>=d);
  if(!passed)age--;
  return age;
}
function aeValidStep2(){
  aeSave();
  if(aeForm.name.length<2)return '이름을 2자 이상 입력해 주세요.';
  if(!/^[가-힣A-Za-z ·]+$/.test(aeForm.name))return '이름에는 한글 또는 영문만 쓸 수 있습니다.';
  /* [v4.52] 나이로 막지 않는다 — 실제 자금이 오가지 않는 학습용 모의투자이므로
     성인 기준을 강제할 이유가 없다. 생년월일은 '있을 수 있는 날짜인지'만 확인한다
     (미래 날짜·2월 30일 같은 입력을 걸러내는 용도이지 연령 제한이 아니다). */
  const age=aeAge(aeForm.birth);
  if(age==null)return '생년월일을 <b>YYYY-MM-DD</b> 형식으로 정확히 입력해 주세요.';
  if(age<0)return '생년월일이 오늘보다 뒤입니다. 다시 확인해 주세요.';
  if(age>120)return '생년월일을 다시 확인해 주세요.';
  if(!/^01[016789]-?\d{3,4}-?\d{4}$/.test(aeForm.phone.replace(/\s/g,'')))
    return '휴대전화 번호를 <b>010-1234-5678</b> 형식으로 입력해 주세요.';
  if(!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(aeForm.email))return '이메일 주소를 정확히 입력해 주세요.';
  if(!aeForm.job)return '직업을 선택해 주세요.';
  if(!aeForm.purpose)return '투자 목적을 선택해 주세요.';
  if(!aeForm.source)return '자금 출처를 선택해 주세요.';
  if(!aeForm.risk)return '투자성향을 선택해 주세요.';
  return '';
}
function aeRiskWarn(){
  const t=ACCT_TYPES[aeSel]||ACCT_TYPES.general;
  const lv=AE_RISK.findIndex(r=>r[0]===aeForm.risk);
  if(lv<=1&&(aeSel==='credit'||aeSel==='overseas'))
    return `선택하신 <b>${AE_RISK[lv][1]}</b> 성향에 견주면 <b>${t.n}</b>는 변동이 큰 편입니다. 계속 진행할 수 있지만, 실제 증권사라면 부적합 안내를 받는 조합입니다.`;
  return '';
}
function renderAeSheet(){
  const body=$('liteBody'); if(!body)return;
  const steps=['계좌 선택','신청인 정보','약관 동의','예수금·비밀번호'];
  const bar=`<div class="ae-steps">${steps.map((n,i)=>{
    const k=i+1, st=k<AE_STEP?'done':k===AE_STEP?'on':'';
    return `<div class="ae-st ${st}"><i>${k<AE_STEP?'✓':k}</i><span>${n}</span></div>`;}).join('')}</div>`;
  let inner='';
  if(AE_STEP===1){
    inner=`<p class="ae-d">목적에 맞는 계좌를 고르세요. 계좌마다 예수금·보유·매매일지가 따로 관리되고, 수수료와 세제도 다르게 계산됩니다.</p>
      <div class="acct-pick" id="aeTypes"></div><div class="acct-detail" id="aeDetail"></div>
      <div class="ae-msg" id="aeMsg"></div>
      <div class="ae-nav"><button class="modal-btn" id="aeNext">다음 · 신청인 정보</button></div>`;
  }
  if(AE_STEP===2){
    /* 옵션 묶음만 만드는 조각과, 라벨까지 붙인 한 줄 — 문자열을 나중에 잘라 쓰지 않는다 */
    const opt=(id,arr,val)=>`<select id="${id}"><option value="">선택</option>`
      +arr.map(x=>`<option value="${x}" ${val===x?'selected':''}>${x}</option>`).join('')+`</select>`;
    const sel=(id,label,arr,val,ph)=>`<div class="fld2"><label>${label}</label>
      <select id="${id}"><option value="">${ph}</option>
      ${arr.map(x=>`<option value="${x}" ${val===x?'selected':''}>${x}</option>`).join('')}</select></div>`;
    inner=`<p class="ae-d">실제 증권사 개설 절차와 같은 항목을 받습니다. 입력한 내용은 이 기기와 회원 계정에만 저장되며 외부로 나가지 않습니다.</p>
      <div class="fld2 two">
        <div><label>이름</label><input id="aeName" value="${htmlEsc(aeForm.name)}" placeholder="홍길동" autocomplete="name"></div>
        <div><label>생년월일</label><input id="aeBirth" value="${htmlEsc(aeForm.birth)}" placeholder="2000-01-01" inputmode="numeric" maxlength="10"></div>
      </div>
      <div class="fld2 two">
        <div><label>휴대전화</label><input id="aePhone" value="${htmlEsc(aeForm.phone)}" placeholder="010-1234-5678" inputmode="tel" maxlength="13"></div>
        <div><label>이메일</label><input id="aeEmail" value="${htmlEsc(aeForm.email)}" placeholder="me@example.com" inputmode="email"></div>
      </div>
      ${sel('aeJob','직업',AE_JOBS,aeForm.job,'선택해 주세요')}
      <div class="fld2 two">
        <div><label>투자 목적</label>${opt('aePurpose',AE_PURPOSE,aeForm.purpose)}</div>
        <div><label>자금 출처</label>${opt('aeSource',AE_SOURCE,aeForm.source)}</div>
      </div>
      <div class="fld2"><label>투자성향 <small style="font-weight:600;color:var(--sub-2)">— 감당할 수 있는 손실 정도를 고르세요</small></label>
        <select id="aeRisk"><option value="">선택해 주세요</option>
        ${AE_RISK.map(r=>`<option value="${r[0]}" ${aeForm.risk===r[0]?'selected':''}>${r[1]} — ${r[2]}</option>`).join('')}</select></div>
      <div class="ae-msg" id="aeMsg"></div>
      <div class="ae-nav two"><button class="modal-btn ghost" id="aePrev">이전</button>
        <button class="modal-btn" id="aeNext">다음 · 약관 동의</button></div>`;
  }
  if(AE_STEP===3){
    const allOn=AE_TERMS.every(t=>aeForm.terms[t[0]]);
    inner=`<p class="ae-d">항목을 눌러 내용을 펼쳐 볼 수 있습니다. <b>필수</b> 항목에 모두 동의해야 개설이 진행됩니다.</p>
      <button type="button" class="ae-all ${allOn?'on':''}" id="aeAll">
        <span class="ae-ck">${allOn?'✓':''}</span><b>약관 전체 동의</b>
        <small>필수 4건 · 선택 2건을 한 번에 동의합니다</small></button>
      <div class="ae-terms">${AE_TERMS.map(([k,req,title,txt])=>`
        <div class="ae-t">
          <button type="button" class="ae-trow ${aeForm.terms[k]?'on':''}" data-aet="${k}">
            <span class="ae-ck">${aeForm.terms[k]?'✓':''}</span>
            <span class="ae-tt"><i class="${req?'req':'opt'}">${req?'필수':'선택'}</i>${title}</span>
          </button>
          <button type="button" class="ae-tmore" data-aem="${k}">내용 보기 ▾</button>
          <div class="ae-tbox" id="aetb-${k}" hidden>${txt}</div>
        </div>`).join('')}</div>
      <div class="ae-msg" id="aeMsg"></div>
      <div class="ae-nav two"><button class="modal-btn ghost" id="aePrev">이전</button>
        <button class="modal-btn" id="aeNext">다음 · 예수금 설정</button></div>`;
  }
  if(AE_STEP===4){
    const t=ACCT_TYPES[aeSel]||ACCT_TYPES.general;
    const warn=aeRiskWarn();
    inner=`<div class="ae-recap"><b>${t.ic} ${t.n}</b>
        <span>${htmlEsc(aeForm.name)} · ${htmlEsc(aeForm.birth)} · ${(AE_RISK.find(r=>r[0]===aeForm.risk)||[,'—'])[1]}</span></div>
      ${warn?`<div class="ae-warn">⚠ ${warn}</div>`:''}
      <div class="fld2"><label>시작 예수금 (원) <small style="font-weight:600;color:var(--sub-2)">— 1만원 이상${t.limit?' · 연 납입한도 '+KRW(t.limit)+'원':''}</small></label>
        <input id="aeCash" class="num" inputmode="numeric" value="${htmlEsc(aeForm.cash)}"></div>
      <div class="fld2 two">
        <div><label>계좌 비밀번호 <small style="font-weight:600;color:var(--sub-2)">— 숫자 4자리</small></label>
          <input id="aePw" type="password" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="new-password"></div>
        <div><label>비밀번호 확인</label>
          <input id="aePw2" type="password" inputmode="numeric" maxlength="4" placeholder="0000" autocomplete="new-password"></div>
      </div>
      <div class="ae-note">개설을 누르면 <b>계좌번호</b>가 즉시 발급됩니다. 이 번호는 모의 전용이며 실제 금융기관 계좌와 무관합니다.</div>
      <div class="ae-msg" id="aeMsg"></div>
      <div class="ae-nav two"><button class="modal-btn ghost" id="aePrev">이전</button>
        <button class="modal-btn" id="aeDone">계좌 개설하기</button></div>`;
  }
  body.innerHTML=`<div class="ae-sheet">${bar}${inner}</div>`;
  wireAeSheet();
}
function wireAeSheet(){
  const prev=$('aePrev'); if(prev)prev.onclick=()=>aeGo(AE_STEP-1);
  const next=$('aeNext');
  if(next)next.onclick=()=>{
    if(AE_STEP===2){ const e=aeValidStep2(); if(e)return aeSay(e); }
    if(AE_STEP===3){
      const miss=AE_TERMS.filter(t=>t[1]&&!aeForm.terms[t[0]]);
      if(miss.length)return aeSay(`필수 항목 <b>${miss.length}건</b>에 아직 동의하지 않으셨습니다.`);
    }
    aeGo(AE_STEP+1);
  };
  if(AE_STEP===1)setTimeout(renderAeTypes,10);
  if(AE_STEP===2){
    /* 입력하는 대로 하이픈을 넣어 준다 — 형식 때문에 반려되는 일이 없게 */
    const b=$('aeBirth');
    if(b)b.oninput=()=>{ let v=b.value.replace(/[^0-9]/g,'').slice(0,8);
      if(v.length>6)v=v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6);
      else if(v.length>4)v=v.slice(0,4)+'-'+v.slice(4);
      b.value=v; };
    const ph=$('aePhone');
    if(ph)ph.oninput=()=>{ let v=ph.value.replace(/[^0-9]/g,'').slice(0,11);
      if(v.length>7)v=v.slice(0,3)+'-'+v.slice(3,7)+'-'+v.slice(7);
      else if(v.length>3)v=v.slice(0,3)+'-'+v.slice(3);
      ph.value=v; };
  }
  if(AE_STEP===3){
    const all=$('aeAll');
    if(all)all.onclick=()=>{ const on=!AE_TERMS.every(t=>aeForm.terms[t[0]]);
      AE_TERMS.forEach(t=>aeForm.terms[t[0]]=on); renderAeSheet(); };
    document.querySelectorAll('[data-aet]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.aet; aeForm.terms[k]=!aeForm.terms[k]; renderAeSheet(); });
    document.querySelectorAll('[data-aem]').forEach(b=>b.onclick=()=>{
      const box=$('aetb-'+b.dataset.aem); if(!box)return;
      box.hidden=!box.hidden; b.textContent=box.hidden?'내용 보기 ▾':'접기 ▴'; });
  }
  if(AE_STEP===4){
    const c=$('aeCash');
    if(c)c.oninput=()=>{ const n=c.value.replace(/[^0-9]/g,'');
      c.value=n?Number(n).toLocaleString('en-US'):''; };
    const d=$('aeDone'); if(d)d.onclick=()=>doAcctOpen();
  }
}
function doAcctOpen(){
  aeSave();
  const t=ACCT_TYPES[aeSel]||ACCT_TYPES.general;
  const v=parseInt(String(aeForm.cash||'0').replace(/[^0-9]/g,''))||0;
  const say=(h)=>aeSay(h);
  if(acctList.length>=6)return say('계좌는 최대 <b>6개</b>까지 개설할 수 있습니다.');
  if(['isa','pension','irp'].includes(aeSel)&&acctList.some(a=>a.type===aeSel))
    return say(`<b>${t.n}</b>는 1인 1계좌만 개설할 수 있습니다. 이미 보유 중이에요.`);
  if(v<10000)return say('시작 예수금은 <b>10,000원</b> 이상으로 설정해 주세요.');
  if(v>1000000000)return say('시작 예수금은 <b>10억원</b> 이하로 설정해 주세요.');
  if(t.limit&&v>t.limit)
    return say(`<b>${t.n}</b>의 연 납입한도는 <b>${KRW(t.limit)}원</b>입니다. 금액을 낮추거나 다른 계좌를 선택해 주세요.`);
  const pwv=aeForm.pw, pw2=aeForm.pw2;
  if(!/^\d{4}$/.test(pwv))return say('계좌 비밀번호를 <b>숫자 4자리</b>로 설정해 주세요.');
  if(/^(\d)\1{3}$/.test(pwv)||['0123','1234','2345','3456','4567','5678','6789','9876','4321','3210'].includes(pwv))
    return say('같은 숫자 반복이나 연속된 숫자는 사용할 수 없습니다.');
  if(pwv!==pw2)return say('비밀번호 확인이 일치하지 않습니다.');
  if(aeForm.birth.replace(/[^0-9]/g,'').slice(4)===pwv)
    return say('생년월일과 같은 번호는 비밀번호로 쓸 수 없습니다.');
  if(AE_TERMS.some(x=>x[1]&&!aeForm.terms[x[0]]))return say('필수 약관에 모두 동의해야 개설할 수 있습니다.');
  say('개설 처리 중…',true);
  pwHash(pwv).then(hh=>{
    const id=acctOpen(aeSel,v,hh);
    const a=acctList.find(x=>x.id===id);
    if(a){
      a.no=acctNewNo(aeSel);
      a.holder={name:aeForm.name,birth:aeForm.birth,phone:aeForm.phone,email:aeForm.email,
        job:aeForm.job,purpose:aeForm.purpose,source:aeForm.source,risk:aeForm.risk};
      a.terms={at:Date.now(),agreed:AE_TERMS.filter(x=>aeForm.terms[x[0]]).map(x=>x[0])};
      saveState();
    }
    finishAcctOpen(t,v,a);
  });
}
function openAcctOpenSheet(){
  aeInit();
  openLiteGate('계좌 개설','');
  renderAeSheet();
}
function acctMigrate(){
  if(acctOpened())return;
  const id=acctNewId();
  acctList=[{id,type:(ACCT_TYPES[acctType]?acctType:'general'),openedAt:Date.now(),legacy:1,pw:acctPassHash}];
  acctBooks={[id]:{cash,usdCash,usdSettling:usdSettling.slice(),holdings:holdings.slice(),
    tradeLog:tradeLog.slice(),tradeArchive,ipoPlans:ipoPlans.slice()}};
  acctActive=id;
}
/* ══ [v4.32] 계좌 종류 ══════════════════════════════════════════════════════
   실제 증권사 계좌 체계를 모의로 옮긴다. 고르는 재미만이 아니라 수수료·세제가
   실제로 다르게 계산되도록 엔진에 연결한다(feeKr/feeUs/taxFree/limit).
     feeKr/feeUs : 수수료율 배수(1=기본)  · taxFree : 해외 양도세 면제 여부
     limit       : 연 납입한도(원, 0=없음) · usOk : 해외주식 거래 가능 여부 */
var ACCT_TYPES={
  general:{n:'종합위탁계좌',ic:'📗',d:'가장 기본이 되는 계좌입니다. 국내·해외 주식을 모두 거래할 수 있고 제약이 없습니다.',
    feeKr:1,feeUs:1,taxFree:0,limit:0,usOk:1,
    pros:['국내·해외 모두 거래','입출금·환전 자유','조건 없음'],cons:['별도 세제 혜택 없음']},
  isa:{n:'ISA (중개형)',ic:'🧺',d:'하나의 계좌에 주식·펀드를 담고, 만기 시 순이익 200만원까지 비과세되는 절세 계좌입니다.',
    feeKr:0.8,feeUs:1,taxFree:0,limit:20000000,usOk:1,
    pros:['국내 수수료 20% 우대','순이익 200만원 비과세','손익 통산'],cons:['연 2,000만원 납입한도','3년 의무가입']},
  pension:{n:'연금저축계좌',ic:'🏦',d:'노후 대비용 계좌로 납입액에 세액공제를 받습니다. 대신 55세 전 인출 시 불이익이 있습니다.',
    feeKr:0.7,feeUs:1,taxFree:0,limit:18000000,usOk:1,
    pros:['국내 수수료 30% 우대','납입액 세액공제 13.2~16.5%','과세이연'],cons:['연 1,800만원 한도','중도인출 시 기타소득세 16.5%','개별 해외주식 직접매매 제한(ETF 위주)']},
  irp:{n:'IRP 퇴직연금',ic:'🛡',d:'퇴직금과 개인 납입금을 함께 운용합니다. 안전자산 30% 의무 비중이 있습니다.',
    feeKr:0.7,feeUs:1,taxFree:0,limit:18000000,usOk:1,
    pros:['국내 수수료 30% 우대','세액공제 한도 900만원','퇴직금 통합 관리'],cons:['안전자산 30% 의무','중도해지 제약']},
  overseas:{n:'해외주식 전용계좌',ic:'🌎',d:'해외 거래에 특화된 계좌입니다. 환전 우대와 해외 수수료 인하가 적용됩니다.',
    feeKr:1,feeUs:0.4,taxFree:0,limit:0,usOk:1,fxPref:0.98,
    pros:['해외 수수료 60% 인하 (0.10%)','환전 우대 98%','달러 예수금 관리'],cons:['국내 수수료 우대 없음']},
  youth:{n:'첫걸음 우대계좌',ic:'🌱',d:'처음 투자를 배우는 사람을 위한 계좌입니다. 수수료가 가장 저렴한 대신 예수금 한도가 있습니다.',
    feeKr:0.5,feeUs:0.6,taxFree:0,limit:50000000,usOk:1,
    pros:['국내 수수료 50% 인하','해외 수수료 40% 인하','환전 우대 96%'],cons:['예수금 5,000만원 한도'],fxPref:0.96},
};
function acctInfo(){return ACCT_TYPES[acctType]||ACCT_TYPES.general;}
function acctFeeKr(){return acctInfo().feeKr!=null?acctInfo().feeKr:1;}
function acctFeeUs(){return acctInfo().feeUs!=null?acctInfo().feeUs:1;}
let bookOrders=[];      // [v2.5] 예약 주문 {id,code,name,side,qty,price,createdAt}
let priceAlerts={};     // [v2.5] 가격 알림 {code:{above,below,name}}
let selected='005930',ordSide='buy',ordType='limit',userPrice=null,currentView='home',lastPx={};
const market={indices:[],crypto:[],fx:[]};
let fxData=[],fxOpen=false,fxAt=0;   // /api/fx 실시간 환율(30여 개 통화)
let feed=null;
let connState='init';
let connPaused=false;
function renderConnPill(){
  const p2=n=>String(n).padStart(2,'0'),nw=new Date();
  const ts=`${p2(nw.getHours())}:${p2(nw.getMinutes())}:${p2(nw.getSeconds())}`;
  const el=$('connPill');
  if(el){
    const label=connState==='on'?(fnSafe()?'절약 모드':connPaused?'갱신 대기':'실시간'):connState==='off'?'연결 오류':'연결 중';
    const dot=connState==='on'?'on':connState==='off'?'off':'idle';
    el.innerHTML=`<span class="dot ${dot}"></span>${label} · ${ts}`;
  }
  const dl=$('dLive');
  if(dl){
    const open=($('mktPill')&&$('mktPill').textContent.includes('장중'));
    dl.innerHTML=open
      ? `<span class="dot on"></span>실시간 시세 · ${ts} 갱신`
      : `<span class="dot off"></span>장마감 · 종가 기준 · ${ts}`;
  }
}
// 매초 도는 시계 — 폴링 주기(장중 2초·마감 15초)와 무관하게 헤더 시각을 초 단위로 항상 갱신
try{renderConnPill();}catch(e){}
try{renderMktPill();}catch(e){}
if(!window._connClock)window._connClock=setInterval(()=>{try{renderConnPill();renderMktPill();}catch(e){}},1000);

function accounts(){return store.get('accounts')||{};}
/* ===== 클라우드(Cloudflare KV) 동기화 — 실패 시 로컬로 폴백 ===== */
let CLOUD=true,syncT=null;
async function cloudCall(body){
  if(!CLOUD&&body.action!=='login'&&body.action!=='signup'&&body.action!=='ensure')return null;  // [v4.18] 가입·복구도 항상 시도
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),8000);   // 8초 넘으면 포기(무한 '확인 중' 방지)
  try{const r=await fetch('/api/accounts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});
    if(!r.ok)return null;const j=await r.json();if(j&&j.err==='nostore'){CLOUD=false;return null;}return j;}
  catch{return null;}
  finally{clearTimeout(to);}
}
function cloudSync(){
  if(!currentUser)return;const acc=accounts()[currentUser];if(!acc)return;
  clearTimeout(syncT);
  syncT=setTimeout(()=>cloudCall({action:'sync',id:currentUser,pass:acc.pass,
    /* 폴더·종목메모·개인설정까지 자동 저장 — 기기를 바꿔 로그인해도 그대로 복원된다(수동 내보내기 불필요) */
    user:{watchlist,holdings,cash,usdCash,usdSettling,acctType,acctList,acctBooks,acctActive,sendLog,ipoPlans,tradeLog,tradeArchive,watchFolders,stockMemos,prefs:userPrefs,acctPass:acctPassHash}}),800);
}
function saveState(){ if(!currentUser)return; try{acctSnap();}catch(e){}   // [v4.40] 활성 계좌 장부 반영
  store.set('user:'+currentUser,{watchlist,holdings,cash,usdCash,usdSettling,acctType,acctList,acctBooks,acctActive,sendLog,ipoPlans,tradeLog,tradeArchive,watchFolders,stockMemos,bookOrders,priceAlerts,prefs:userPrefs,acctPass:acctPassHash}); cloudSync(); }
/* [폴더] 관심종목 폴더 상태 */
let watchFolders=[]; let watchTab='all';
/* [v1.99] 관심종목 = 폴더 소속 종목. '전체' 가상 폴더 폐지.
   watchlist는 모든 폴더의 합집합으로 자동 동기화된다(순서는 기존 순서 유지 + 신규 뒤). */
function syncWatchUnion(){
  const set=new Set();watchFolders.forEach(f=>(f.codes||[]).forEach(c=>set.add(c)));
  const kept=watchlist.filter(c=>set.has(c));
  set.forEach(c=>{if(!kept.includes(c))kept.push(c);});
  watchlist=kept;
}
/* 기존 사용자 데이터 이전 — 폴더 밖 종목(옛 '전체' 전용)을 폴더로 승격 */
function migrateWatchModel(){
  let changed=false;
  const inF=new Set();watchFolders.forEach(f=>(f.codes||[]).forEach(c=>inF.add(c)));
  const orphans=watchlist.filter(c=>!inF.has(c));
  if(orphans.length){
    if(!watchFolders.length){
      watchFolders.push({id:'f'+Date.now().toString(36),name:'내 관심',icon:'⭐',codes:orphans.slice(),color:''});
    }else{
      let mf=watchFolders.find(f=>f.name==='미분류');
      if(!mf){mf={id:'f'+(Date.now()+1).toString(36),name:'미분류',icon:'📌',codes:[],color:''};watchFolders.push(mf);}
      orphans.forEach(c=>{if(!mf.codes.includes(c))mf.codes.push(c);});
    }
    changed=true;
  }
  syncWatchUnion();
  if(watchTab==='all'||!watchFolders.some(f=>f.id===watchTab))watchTab=watchFolders.length?watchFolders[0].id:'all';
  if(changed)saveState();
}
let watchSortMode='chg';   // 계정별 값은 reloadPerUser()에서 로드
let stockMemos={};          // [H2] 종목별 메모 — 계정 데이터로 클라우드 동기화
function applyUser(u){
  const d=store.get('user:'+u)||{};
  bookOrders=Array.isArray(d.bookOrders)?d.bookOrders:[];
  priceAlerts=(d.priceAlerts&&typeof d.priceAlerts==='object')?d.priceAlerts:{};
  currentUser=u;
  watchlist=d.watchlist||['005930','000660','035420'];
  holdings=d.holdings||[];
  cash=(d.cash!=null)?d.cash:10000000;
  usdCash=(d.usdCash!=null)?+d.usdCash:0;                       // [v4.29]
  acctType=(d.acctType&&ACCT_TYPES[d.acctType])?d.acctType:'general';   // [v4.32]
  /* [v4.40] 계좌 목록 복원. acctList 키 자체가 없는 예전 사용자만 자동 이전하고,
     키가 있는데 비어 있으면 '아직 개설하지 않은 상태'로 그대로 둔다(그래야 안내가 뜬다). */
  const hasNewFmt=Object.prototype.hasOwnProperty.call(d,'acctList');
  acctList=Array.isArray(d.acctList)?d.acctList.filter(a=>a&&a.id&&ACCT_TYPES[a.type]):[];
  acctBooks=(d.acctBooks&&typeof d.acctBooks==='object')?d.acctBooks:{};
  sendLog=Array.isArray(d.sendLog)?d.sendLog:[];                      // [v4.51] 이체 내역
  /* 예전에 개설된 계좌에는 번호가 없다 — 불러올 때 한 번 발급해 준다 */
  {let need=false; acctList.forEach(a=>{ if(!a.no){ a.no=acctNewNo(a.type); need=true; } });
   if(need)setTimeout(()=>{try{saveState();}catch(e2){}},400);}
  acctActive=(d.acctActive&&acctList.some(a=>a.id===d.acctActive))?d.acctActive:(acctList[0]?acctList[0].id:'');
  if(acctOpened()&&acctActive)acctLoad(acctActive);
  else if(!hasNewFmt)acctMigrate();                      // 예전 사용자 → 계좌 하나로 이전
  else { cash=0; usdCash=0; usdSettling=[]; holdings=[]; }   // 미개설 → 빈 상태
  usdSettling=Array.isArray(d.usdSettling)?d.usdSettling:[];
  ipoPlans=d.ipoPlans||[];
  tradeLog=d.tradeLog||[]; tradeArchive=d.tradeArchive||{};
  /* [v4.5] 저장소·클라우드에서 온 계좌를 그대로 믿지 않는다.
     문자열·소수·NaN·음수 예수금, 수량 0 이하 보유, 중복된 종목 줄을 여기서 바로잡는다.
     (로그인 직후 조용히 수행 — 이후 총자산이 NaN·음수로 표시될 통로를 막는다) */
  try{sanitizeAccount(true);}catch(e){}
  watchFolders=Array.isArray(d.watchFolders)?d.watchFolders
    .filter(f=>f&&f.id&&f.name)
    .map(f=>({id:String(f.id),name:String(f.name).slice(0,12),codes:(f.codes||[]).filter(c=>watchlist.includes(c)),color:f.color||'',icon:f.icon||''})):[];
  migrateWatchModel();   // [v1.99] '전체' 폐지 — 폴더 밖 종목을 폴더로 승격
  watchTab='all';
  stockMemos=(d.stockMemos&&typeof d.stockMemos==='object')?d.stockMemos:{};
  loadPrefs(d.prefs||null);                    // 클라우드에 설정이 있으면 그걸 우선
  reloadPerUser();                             // 검색기록·최근본·정렬을 이 계정 것으로
  acctPassHash=d.acctPass||hash('0000');
  store.set('session',u);
}
/* [v4.1] 게스트 모드 폐지 — 회원가입·로그인해야 이용할 수 있다.
   예전 게스트 모드는 계정 없이 임시 데이터로 앱을 쓰게 했는데, 그 상태에서 쌓은
   투자내역·관심종목이 브라우저 저장소를 지우면 사라지고 기기를 옮기면 이어지지 않았다.
   로그인 화면을 닫을 수 없게 하고, 앱 초기화는 계정이 확정된 뒤에만 실행한다. */
function requireAuth(){
  currentUser=null;
  const g=$('authGate');
  if(g){g.hidden=false;g.classList.add('auth-force');}
  try{document.body.classList.add('locked');}catch(e){}
  /* [v4.24 · 버그] 부팅 완료 신호(step 4·6·done)는 initApp() 안에만 있었다.
     로그인 전에는 initApp 이 실행되지 않아 신호가 영영 오지 않았고,
     입장 화면이 12초 안전장치가 터질 때까지 11%에 멈춰 있다가
     한 번에 100%로 튀었다. 로그인 화면을 띄우는 것도 '준비 끝'이다. */
  try{window.__boot&&(__boot.step(4),__boot.step(5),__boot.step(6),__boot.done());}catch(e){}
}
function unlockApp(){
  const g=$('authGate');
  if(g){g.hidden=true;g.classList.remove('auth-force');}
  try{document.body.classList.remove('locked');}catch(e){}
}
/* 계정 전환 시 개인 기록을 그 계정 키에서 다시 읽는다 */
function reloadPerUser(){
  try{srchHist=pget('srchHist',[]);}catch(e){srchHist=[];}
  try{viewHist=pget('viewHist',[]);}catch(e){viewHist=[];}
  watchSortMode=pget('watchSort',userPrefs.watchDefaultSort||'chg');
  idxFilter=pget('idxFilter','전체');
  try{priceTargets=pget('priceTargets',{})||{};}catch(e){priceTargets={};}
}
function seedTradeLog(){
  const day=(n)=>kstDayAgo(n);
  const mk=(date,code,name,side,qty,price,avg)=>{const amount=price*qty,fee=Math.round(amount*0.00015),tax=side==='sell'?Math.round(amount*0.0018):0;
    const pnl=side==='sell'?Math.round((price-avg)*qty-fee-tax):0,base=side==='sell'?avg*qty:amount;
    return{ts:Date.parse(date)||Date.now(),date,code,name,side,qty,price,amount,fee,tax,avg:avg||price,pnl,roi:base?pnl/base*100:0};};
  return [
    mk(day(8),'005930','삼성전자','buy',20,71000,71000),
    mk(day(5),'005930','삼성전자','sell',20,66200,71000),
    mk(day(3),'000660','SK하이닉스','buy',5,178000,178000),
    mk(day(1),'000660','SK하이닉스','sell',5,169500,178000),
    mk(day(1),'035420','NAVER','buy',6,205000,205000),
  ];
}

/* ===== 로그인/회원가입 UI ===== */
$('tabLogin').onclick=()=>{$('tabLogin').classList.add('on');$('tabSignup').classList.remove('on');$('loginForm').hidden=false;$('signupForm').hidden=true;};
$('tabSignup').onclick=()=>{$('tabSignup').classList.add('on');$('tabLogin').classList.remove('on');$('signupForm').hidden=false;$('loginForm').hidden=true;
  try{renderAcctPick();}catch(e){}};   // [v4.32] 계좌 종류 선택 렌더
/* [v4.18] 아이디는 서버와 똑같은 규칙(소문자·공백제거)으로 정규화한다.
   기기마다 대소문자가 달라 '같은 아이디인데 다른 계정'이 되던 문제의 절반이 여기 있었다. */
function normId(v){return String(v==null?'':v).trim().toLowerCase();}

$('doLogin').onclick=async()=>{
  const raw=$('liId').value.trim();
  const id=normId(raw),pw=$('liPw').value,m=$('liMsg');
  if(!id||!pw){m.textContent='아이디와 비밀번호를 입력하세요.';return;}
  const passH=await pwHash(pw), legacyH=legacyHash(pw);
  const local=accounts()[id]||accounts()[raw];
  const localOk=!!(local&&(local.pass===passH||local.pass===legacyH));
  m.textContent='확인 중…';
  const enter=(j)=>{
    const accs=accounts();
    accs[id]={pass:passH,name:(j&&j.name)||(local&&local.name)||id,email:(j&&j.email)||(local&&local.email)||'',
      acctPass:(j&&j.user&&j.user.acctPass)||(local&&local.acctPass)||legacyHash('0000'),
      created:(j&&j.created)||(local&&local.created)||Date.now()};
    store.set('accounts',accs);
    if(j&&j.user)store.set('user:'+id,j.user);
    applyUser(id);unlockApp();initApp();
  };
  /* ══ [v4.24] 로그인 복구 경로 ══════════════════════════════════════════
     서버 우선으로 확인하되, 서버가 '그런 계정 없음'이라고 하면 그대로 막지 않는다.
     서버 저장소가 순간 장애로 비었거나 키가 어긋난 경우 멀쩡한 사용자가
     자기 계정에서 통째로 잠기기 때문이다. 이 기기의 비밀번호가 맞으면
     로컬 데이터로 들여보낸 뒤, 그 데이터를 서버에 되올려 계정을 복원한다. */
  let cj=await cloudCall({action:'login',id,pass:passH,legacy:legacyH});
  if(cj&&cj.ok){ enter(cj); return; }
  if((!cj||cj.err==='nouser') && raw && raw!==id){          // 옛 대소문자 키 구제
    const cj2=await cloudCall({action:'login',id:raw,pass:passH,legacy:legacyH});
    if(cj2&&cj2.ok){ enter(cj2); return; }
    if(cj2&&cj2.ok===false)cj=cj2;
  }
  if(cj&&cj.err==='toomany'){
    m.innerHTML='로그인 시도가 너무 잦습니다. <b>15분 뒤</b>에 다시 시도해 주세요.'; return;
  }
  if(cj&&cj.err==='invalid'&&!localOk){
    m.textContent='비밀번호가 올바르지 않습니다.'; return;
  }
  /* 서버가 계정을 못 찾았거나 응답이 없다 — 이 기기 자격증명으로 복구 시도 */
  if(localOk){
    enter(null);
    const kind=(cj&&cj.err==='nouser')?'서버에 계정이 없어 이 기기 기록으로 복구합니다'
              :'서버에 연결하지 못해 이 기기 기록으로 열었습니다';
    toast('warn','계정 복구 중',kind+' — 잠시 뒤 자동으로 서버에 저장됩니다.');
    cloudCall({action:'ensure',id,pass:passH,legacy:legacyH,
      name:(local&&local.name)||id,email:(local&&local.email)||'',
      acctPass:(local&&local.acctPass)||'',created:(local&&local.created)||Date.now(),
      user:store.get('user:'+id)||store.get('user:'+raw)||{}})
      .then(r=>{ if(r&&r.ok)toast('ok','계정 복구 완료','이제 다른 기기에서도 같은 아이디로 로그인할 수 있어요.'); });
    return;
  }
  if(cj&&cj.err==='nouser'){
    m.innerHTML='이 아이디로 저장된 계정을 찾지 못했습니다.<br>'
      +'<b>회원가입</b> 탭에서 새로 만들거나, 아래 <b>다른 주소·기기에서 쓰던 계정 복원</b>을 눌러 백업 코드로 되살릴 수 있어요.';
    return;
  }
  m.innerHTML='서버에 연결하지 못했고, 이 기기에도 저장된 계정이 없습니다.<br>잠시 후 다시 시도해 주세요.';
};
/* [v4.1] 게스트 진입 경로 제거 */
// 전체 종목 검사 버튼 연결($ 정의 이후·요소 존재 이후에 바인딩)
if($('saStart'))$('saStart').onclick=runStockAudit;
if($('laStart'))$('laStart').onclick=runLogoAudit;
if($('laStop'))$('laStop').onclick=()=>{laRun=false;$('laStop').hidden=true;$('laStart').hidden=false;};
if($('laReset'))$('laReset').onclick=()=>{
  /* [v3.3.1] toast 는 (종류, 제목, 내용) 3개 인자를 받는데 제목만 넘겨서
     화면에 'undefined / undefined' 가 찍혔다. 인자를 맞추고,
     새로고침을 요구하는 대신 그 자리에서 다시 그려 곧바로 재탐색되게 한다. */
  let n=0;
  try{ const st=window.__lgStat&&window.__lgStat(); n=st?((st.ok||0)+(st.fail||0)):0; }catch(e){}
  try{ window.__lgReset&&window.__lgReset(); }catch(e){}
  try{ document.querySelectorAll('.lgo').forEach(el=>{
    el.classList.remove('on','alt','fade'); el.style.backgroundImage=''; }); }catch(e){}
  safeRun('lgResetPaint',()=>{ if(currentView==='search')renderSearch(); else if(currentView==='watch')renderWatch(); });
  toast('buy','로고 캐시를 비웠습니다',(n?n.toLocaleString()+'종 판정을 지웠습니다. ':'')+'지금부터 전부 다시 찾습니다.');
};
if($('saStop'))$('saStop').onclick=()=>{saRun=false;$('saStop').hidden=true;$('saStart').hidden=false;};
/* ══ [v4.32] 계좌 개설 — 종류 선택 UI ══════════════════════════════════════ */
let suAcctSel='general';
function renderAcctPick(){
  const box=$('suAcctType'); if(!box)return;
  box.innerHTML=Object.keys(ACCT_TYPES).map(k=>{const a=ACCT_TYPES[k];
    return `<button type="button" class="acct-chip ${suAcctSel===k?'on':''}" data-acct="${k}">
      <i>${a.ic}</i><b>${a.n}</b></button>`;}).join('');
  box.querySelectorAll('[data-acct]').forEach(b2=>b2.onclick=()=>{suAcctSel=b2.dataset.acct;renderAcctPick();});
  const a=ACCT_TYPES[suAcctSel];
  const lim=a.limit?KRW(a.limit)+'원':'없음';
  $('suAcctDetail').innerHTML=`<div class="acct-d">
    <p>${a.d}</p>
    <div class="acct-kv"><span>국내 수수료</span><b>${(FEE_RATE_BASE*a.feeKr*100).toFixed(4)}%${a.feeKr<1?` <i class="acct-off">${Math.round((1-a.feeKr)*100)}% 우대</i>`:''}</b></div>
    <div class="acct-kv"><span>해외 수수료</span><b>${(US_FEE_BASE*a.feeUs*100).toFixed(2)}%${a.feeUs<1?` <i class="acct-off">${Math.round((1-a.feeUs)*100)}% 우대</i>`:''}</b></div>
    <div class="acct-kv"><span>환전 우대</span><b>${Math.round((a.fxPref!=null?a.fxPref:0.95)*100)}%</b></div>
    <div class="acct-kv"><span>연 납입한도</span><b>${lim}</b></div>
    <div class="acct-tags">${a.pros.map(x=>`<span class="acct-pro">✓ ${x}</span>`).join('')}
      ${a.cons.map(x=>`<span class="acct-con">· ${x}</span>`).join('')}</div></div>`;
}
/* [v4.49] 실시간 강도·규칙 안내 — 가입 버튼을 누른 뒤에야 실패를 아는 일이 없게 */
try{
  pwWire('suPw','suPwMeter',()=>($('suId')||{}).value||'',()=>($('suName')||{}).value||'');
  pwWire('pmPw','pmPwMeter',()=>currentUser||'',()=>((accounts()[currentUser]||{}).name||''));
}catch(e){}
$('doSignup').onclick=async()=>{
  const id=normId($('suId').value),pw=$('suPw').value,pw2=$('suPw2').value;
  acctType=ACCT_TYPES[suAcctSel]?suAcctSel:'general';           // [v4.32] 선택한 계좌 종류
  acctList=[]; acctBooks={}; acctActive='';                     // [v4.40] 가입 시 첫 계좌를 연다
  const name=$('suName').value.trim()||id,email=$('suEmail').value.trim();
  const cashV=parseInt(($('suCash').value||'0').replace(/[^0-9]/g,''))||0;
  /* [v4.46] 가입 시 계좌 비밀번호 설정 — 비우면 기본 0000 */
  {const apw=(($('suAcctPw')||{}).value||'').trim();
   if(apw&&!/^\d{4}$/.test(apw)){$('suMsg').textContent='계좌 비밀번호는 숫자 4자리로 입력해 주세요.';return;}
   if(apw&&(/^(\d)\1{3}$/.test(apw)||['0123','1234','4321','9876'].includes(apw))){
     $('suMsg').textContent='계좌 비밀번호에 같은 숫자 반복이나 연속된 숫자는 쓸 수 없습니다.';return;}
   if(apw)acctPassHash=await pwHash(apw);}
  /* [v4.32] 계좌 종류별 납입한도 검증 — 고르기만 하고 끝나지 않게 실제로 적용한다 */
  {const _a=ACCT_TYPES[acctType];
   if(_a&&_a.limit&&cashV>_a.limit){
     $('suMsg').innerHTML=`<b>${_a.n}</b>의 연 납입한도는 <b>${KRW(_a.limit)}원</b>입니다.<br>초기 예수금을 한도 이하로 설정하거나 다른 계좌를 선택해 주세요.`;
     return;}}
  const a=$('suAcct').value,a2=$('suAcct2').value;
  const m=$('suMsg');
  if(id.length<4){m.textContent='아이디는 4자 이상으로 정해 주세요.';return;}
  {const ck=pwCheck(pw,id,name); if(!ck.ok){m.textContent=ck.msg;$('suPw').focus();return;}}
  if(pw!==pw2){m.textContent='비밀번호가 일치하지 않습니다.';return;}
  if(!/^\d{4}$/.test(a)){m.textContent='계좌 비밀번호는 숫자 4자리로 입력해 주세요.';return;}
  if(/^(\d)\1{3}$/.test(a)||['0123','1234','2345','3456','4567','5678','6789','4321','9876','8765','7654','3210'].includes(a)){
    m.textContent='계좌 비밀번호에 같은 숫자 반복이나 연속된 숫자는 쓸 수 없습니다.';return;}
  if(a!==a2){m.textContent='계좌 비밀번호가 일치하지 않습니다.';return;}
  const passH=await pwHash(pw),acctH=await pwHash(a);
  m.textContent='가입 처리 중…';
  const cj=await cloudCall({action:'signup',id,pass:passH,name,email,acctPass:acctH,cash:cashV});
  if(cj&&!cj.ok){m.textContent=cj.err==='exists'?'이미 존재하는 아이디입니다.'
    :cj.err==='weak'?'비밀번호가 보안 규칙을 만족하지 않습니다. 다시 확인해 주세요.'
    :'가입에 실패했습니다. 잠시 후 다시 시도하세요.';return;}
  /* [v4.18] 서버에 못 올린 계정을 로컬에만 만들면, 다른 기기에서는 존재하지 않는
     계정이 된다(같은 아이디로 또 가입 → 데이터 분열). 가입은 서버 성공을 필수로 한다. */
  if(!cj||!cj.ok){
    m.innerHTML='서버에 연결하지 못해 가입을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.<br><small>계정을 이 기기에만 만들면 다른 기기에서 로그인할 수 없어 막았습니다.</small>';
    return;
  }
  const accs=accounts(); accs[id]={pass:passH,name,email,acctPass:acctH,created:Date.now()}; store.set('accounts',accs);
  store.set('user:'+id,{watchlist:['005930','000660','035420'],holdings:[],cash:cashV,ipoPlans:[],acctPass:acctH});
  applyUser(id); unlockApp(); initApp();
  try{ acctOpen(acctType,cashV,acctPassHash); }catch(e){}       // [v4.46] 첫 계좌 + 계좌 비밀번호
  toast('buy','가입 완료 · '+name+'님','계정이 서버에 저장되어 어느 기기에서든 같은 아이디로 로그인할 수 있어요');
};
/* ===== 프로필 메뉴 ===== */
function setPmTab(t){document.querySelectorAll('#pmTabs button').forEach(b=>b.classList.toggle('on',b.dataset.pm===t));document.querySelectorAll('.pm-pane').forEach(p=>p.hidden=(p.id!=='pm-'+t));}
/* ══ [v2.3] 프로필 확장 — 아바타 · 내 통계 · 게스트 지원 ══ */
const AVATARS=['🐣','🐻','🐰','🦊','🐼','🐯','🦄','🐸','🐳','🚀','⭐','💎'];
function avatarOf(nm){return (userPrefs&&userPrefs.avatar)||String(nm||'?').slice(0,1).toUpperCase();}
function paintHeaderUser(){
  const nm=currentUser?((accounts()[currentUser]||{}).name||currentUser):'';
  if($('uName'))$('uName').textContent=nm;
  if($('uAv')){$('uAv').textContent=avatarOf(nm);
    $('uAv').style.background=(userPrefs&&userPrefs.avColor)||'';}   // [v4.19]
  if($('pmAv'))$('pmAv').style.background=(userPrefs&&userPrefs.avColor)||'';
}
const AV_COLORS=['','#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#64748b'];
/* [v4.19] 아바타 배경색 */
function renderAvColors(){
  const g=$('avColors'); if(!g)return;
  const cur=(userPrefs&&userPrefs.avColor)||'';
  g.innerHTML=AV_COLORS.map(c=>'<button class="avc '+(cur===c?'on':'')+'" data-c="'+c+'" style="'+(c?('background:'+c):'')+'">'+(c?'':'기본')+'</button>').join('');
  g.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    userPrefs=userPrefs||{}; userPrefs.avColor=b.dataset.c;
    try{savePrefs();}catch(e){}
    renderAvColors(); try{paintHeaderUser();}catch(e){}
    const av=$('pmAv'); if(av)av.style.background=b.dataset.c||'';
  });
}
function renderAvGrid(nm){
  const g=$('avGrid');if(!g)return;
  const cur=userPrefs&&userPrefs.avatar;
  g.innerHTML=AVATARS.map(a=>`<button class="av-o ${cur===a?'on':''}" data-av="${a}">${a}</button>`).join('')
    +`<button class="av-o txt ${!cur?'on':''}" data-av="">${String(nm||'?').slice(0,1).toUpperCase()}<i>이니셜</i></button>`;
  g.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    userPrefs.avatar=b.dataset.av||'';if(!userPrefs.avatar)delete userPrefs.avatar;
    savePrefs();renderAvGrid(nm);
    $('pmAv').textContent=avatarOf(nm);paintHeaderUser();
    toast('buy','아바타 변경',b.dataset.av||'이니셜');});
}
function renderPmStats(){
  try{
    const totEval=holdings.reduce((a,h)=>a+hEvalKRW(h),0);
    const cost=holdings.reduce((a,h)=>a+hCostKRW(h),0);
    const pnl=totEval-cost,rate=cost?pnl/cost*100:0;
    const set=(id,v,cls)=>{const el=$(id);if(el){el.textContent=v;if(cls!==undefined)el.className='num '+cls;}};
    set('psAssets',KRW(cash+totEval)+'원');
    set('psPnl',signed(pnl),dirOf(pnl));set('psRate',pctS(rate),dirOf(pnl));
    set('psCash',KRW(cash)+'원');
    set('psHold',holdings.length+'종목');set('psWatch',watchlist.length+'종목');set('psFolder',watchFolders.length+'개');
    set('psTrades',tradeLog.length.toLocaleString()+'건');   // [v2.5] 실제 체결 기록
    let d0=0;try{d0=+localStorage.getItem('firstUseAt')||0;}catch(e){}
    const days=d0?Math.max(1,Math.ceil((Date.now()-d0)/86400000)):0;
    set('psDays',days?('D+'+days+'일'):'—');
    /* ══ [v4.19] 매매 성적 · 투자 성향 · 배지 ══════════════════════════════
       기존 프로필은 자산 숫자 9칸이 전부라 '내가 어떻게 하고 있는지'를 알 수 없었다.
       매도 기록에서 승률·최고·최저·수수료·평균보유일을 뽑고, 그것으로 성향을 진단한다. */
    const sells=tradeLog.filter(t=>t&&t.side==='sell');
    const wins=sells.filter(t=>(+t.pnl||0)>0), losses=sells.filter(t=>(+t.pnl||0)<0);
    const realized=sells.reduce((a,t)=>a+(+t.pnl||0),0);
    const feeSum=tradeLog.reduce((a,t)=>a+(+t.fee||0)+(+t.tax||0),0);
    const best=sells.length?Math.max(...sells.map(t=>+t.pnl||0)):0;
    const worst=sells.length?Math.min(...sells.map(t=>+t.pnl||0)):0;
    set('psReal',signed(realized),dirOf(realized));
    set('psWin',sells.length?Math.round(wins.length/sells.length*100)+'%':'—',
        sells.length?dirOf(wins.length*2-sells.length):'');
    set('psWinN',wins.length+'건'); set('psLossN',losses.length+'건');
    set('psBest',sells.length?signed(best):'—',dirOf(best));
    set('psWorst',sells.length?signed(worst):'—',dirOf(worst));
    set('psFee',KRW(Math.round(feeSum))+'원');
    /* 평균 보유일 — 종목별 첫 매수 → 매도 간격 */
    const firstBuy={},spans=[];
    tradeLog.slice().sort((a,b)=>(a.ts||0)-(b.ts||0)).forEach(t=>{
      if(!t||!t.code)return;
      if(t.side==='buy'){if(firstBuy[t.code]==null)firstBuy[t.code]=t.ts||0;}
      else if(firstBuy[t.code]!=null){spans.push(Math.max(0,((t.ts||0)-firstBuy[t.code])/86400000));delete firstBuy[t.code];}});
    set('psHoldDays',spans.length?(spans.reduce((a,b)=>a+b,0)/spans.length).toFixed(1)+'일':'—');
    const cnt={};tradeLog.forEach(t=>{if(t&&t.code)cnt[t.code]=(cnt[t.code]||0)+1;});
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
    set('psTop',top?(((byCode[top[0]]||{}).name||top[0])+' '+top[1]+'회'):'—');
    renderPmStyle({sells:sells.length,win:sells.length?wins.length/sells.length:0,
      span:spans.length?spans.reduce((a,b)=>a+b,0)/spans.length:0,
      trades:tradeLog.length,days,hold:holdings.length,watch:watchlist.length,
      realized,cashRatio:(cash+totEval)?cash/(cash+totEval):1});
    renderPmBadges({trades:tradeLog.length,days,win:sells.length?wins.length/sells.length:0,
      sells:sells.length,watch:watchlist.length,folders:watchFolders.length,realized,hold:holdings.length});
  }catch(e){}
}
/* [v4.32] 프로필의 계좌 카드 — 종류·혜택 확인과 변경 */
function renderPmAcct(){
  const box=$('pmAcctBox'); if(!box)return;
  const a=ACCT_TYPES[acctType]||ACCT_TYPES.general;
  box.innerHTML=`<div class="acct-card"><div class="acct-card-h"><i>${a.ic}</i>
      <div><b>${a.n}</b><span>${currentUser||''} · 개설 완료</span></div>
      <button class="acct-chg" id="pmAcctChg">변경</button></div>
    <div class="acct-kv"><span>국내 수수료</span><b>${(FEE_RATE_BASE*a.feeKr*100).toFixed(4)}%</b></div>
    <div class="acct-kv"><span>해외 수수료</span><b>${(US_FEE_BASE*a.feeUs*100).toFixed(2)}%</b></div>
    <div class="acct-kv"><span>환전 우대</span><b>${Math.round((a.fxPref!=null?a.fxPref:0.95)*100)}%</b></div>
    <div class="acct-kv"><span>연 납입한도</span><b>${a.limit?KRW(a.limit)+'원':'없음'}</b></div>
    <div class="acct-tags">${a.pros.map(x=>`<span class="acct-pro">✓ ${x}</span>`).join('')}</div></div>
    <div id="pmAcctPick" hidden></div>`;
  $('pmAcctChg').onclick=()=>{
    const p=$('pmAcctPick');
    if(!p.hidden){p.hidden=true;return;}
    p.hidden=false;
    p.innerHTML=`<div class="acct-pick">${Object.keys(ACCT_TYPES).map(k=>{const t=ACCT_TYPES[k];
      return `<button type="button" class="acct-chip ${acctType===k?'on':''}" data-pacct="${k}"><i>${t.ic}</i><b>${t.n}</b></button>`;}).join('')}</div>
      <div class="pm-note">계좌를 바꾸면 이후 주문부터 새 수수료·환전 우대가 적용됩니다. 보유 종목과 예수금은 그대로 유지돼요.</div>`;
    p.querySelectorAll('[data-pacct]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.pacct, t=ACCT_TYPES[k];
      if(t.limit&&cash>t.limit){
        toast('warn','변경할 수 없습니다',`${t.n}의 연 납입한도는 ${KRW(t.limit)}원입니다. 현재 예수금 ${KRW(cash)}원이 한도를 넘습니다.`);return;}
      acctType=k; saveState(); renderPmAcct();
      toast('buy','계좌 변경 완료',`${t.n}으로 바꿨습니다 · 국내 수수료 ${(FEE_RATE_BASE*t.feeKr*100).toFixed(4)}% · 해외 ${(US_FEE_BASE*t.feeUs*100).toFixed(2)}%`);
    });
  };
}
/* 투자 성향 진단 — 거래빈도·보유기간·현금비중으로 4축을 매긴다 */
function renderPmStyle(s){
  const box=$('pmStyleBox'); if(!box)return;
  if(!s.trades){box.innerHTML='<div class="pm-note">아직 매매 기록이 없어요. 몇 번 거래해 보면 성향을 분석해 드립니다.</div>';return;}
  const perDay=s.days?s.trades/s.days:s.trades;
  const axes=[
    ['매매 빈도', Math.min(100,Math.round(perDay/1.5*100)), perDay>=1.2?'단타 성향':perDay>=0.4?'적당한 빈도':'느긋한 매매'],
    ['보유 기간', Math.min(100,Math.round((s.span/20)*100)), s.span>=10?'중장기 보유':s.span>=3?'스윙':'초단기'],
    ['현금 비중', Math.round(s.cashRatio*100), s.cashRatio>=.6?'보수적':s.cashRatio>=.25?'균형':'공격적'],
    ['분산 정도', Math.min(100,Math.round(s.hold/10*100)), s.hold>=8?'넓게 분산':s.hold>=4?'적당히 분산':'집중 투자'],
  ];
  const label=perDay>=1.2?(s.cashRatio<.25?'⚡ 공격적 단타형':'🔥 활발한 단타형')
            :s.span>=10?'🌳 장기 투자형':(s.cashRatio>=.6?'🛡 신중한 관망형':'⚖ 균형 스윙형');
  box.innerHTML=`<div class="pm-style-label">${label}</div>`
    +axes.map(([n,v,t])=>`<div class="pm-ax"><span>${n}</span>
      <i><b style="width:${Math.max(4,Math.min(100,v))}%"></b></i><em>${t}</em></div>`).join('')
    +`<div class="pm-note">최근 매매 기록으로 추정한 참고 지표입니다.</div>`;
}
/* 활동 배지 — 달성한 것만 색이 들어온다 */
function renderPmBadges(s){
  const box=$('pmBadges'); if(!box)return;
  const B=[
    ['🌱','첫 걸음','첫 거래를 마쳤어요',s.trades>=1],
    ['📘','기록가','거래 20건 달성',s.trades>=20],
    ['🏦','베테랑','거래 100건 달성',s.trades>=100],
    ['⭐','수집가','관심종목 10종 이상',s.watch>=10],
    ['🗂','정리왕','관심 폴더 3개 이상',s.folders>=3],
    ['🧺','분산 투자','보유 5종목 이상',s.hold>=5],
    ['🎯','승률왕','매도 10건 이상·승률 60%↑',s.sells>=10&&s.win>=.6],
    ['💰','수익 실현','실현손익 플러스',s.realized>0],
    ['📅','일주일','가입 7일차',s.days>=7],
    ['🗓','한 달','가입 30일차',s.days>=30],
  ];
  const got=B.filter(b=>b[3]).length;
  box.innerHTML=`<div class="pm-badge-n">${got} / ${B.length} 획득</div>`
    +B.map(([ic,t,d,on])=>`<div class="pm-badge ${on?'on':''}" title="${d}"><i>${ic}</i><b>${t}</b><span>${d}</span></div>`).join('');
}
function openProfile(){
  const guest=!currentUser;
  const acc=guest?{}:(accounts()[currentUser]||{});
  const nm=guest?((userPrefs&&userPrefs.nick)||'게스트'):(acc.name||currentUser);
  $('pmAv').textContent=avatarOf(nm);$('pmName').textContent=nm;
  $('pmId').textContent=guest?'게스트 · 이 브라우저에만 저장':'@'+currentUser;
  $('pmNameIn').value=guest?((userPrefs&&userPrefs.nick)||''):(acc.name||'');
  $('pmEmailIn').value=guest?'':(acc.email||'');
  if($('pmBioIn'))$('pmBioIn').value=(userPrefs&&userPrefs.bio)||'';
  /* [v4.19] 프로필 첫 화면 요약 카드 — 아이디만 덩그러니 있던 자리를 채운다 */
  try{
    const hero=$('pmHero');
    if(hero){
      let ev=0;(holdings||[]).forEach(x=>{const st=byCode[x.code]||{};ev+=((st.price!=null?st.price:x.avg)||0)*(x.qty||0);});
      const tot=(cash||0)+ev, base=(holdings||[]).reduce((a,x)=>a+(x.avg||0)*(x.qty||0),0);
      const pnl=ev-base, rate=base?pnl/base*100:0;
      let d0=0;try{d0=+localStorage.getItem('firstUseAt')||0;}catch(e){}
      const days=d0?Math.max(1,Math.ceil((Date.now()-d0)/86400000)):1;
      hero.innerHTML='<div class="pmh-top"><b>'+KRW(Math.round(tot))+'원</b><span>총자산</span></div>'
        +'<div class="pmh-row"><span class="'+dirOf(pnl)+'">'+signed(pnl)+' ('+pctS(rate)+')</span>'
        +'<span>보유 '+holdings.length+' · 관심 '+watchlist.length+' · D+'+days+'</span></div>';
    }
  }catch(e){}
  try{renderAvColors();}catch(e){}
  try{renderPmAcct();}catch(e){}
  const em=$('pmEmailIn');if(em)em.closest('.fld2').style.display=guest?'none':'';
  if($('pmPw'))$('pmPw').value='';if($('pmAcct'))$('pmAcct').value='';
  $('pmProfileMsg').textContent='';$('pmSecMsg').textContent='';$('pmDataMsg').textContent='';
  /* 게스트: 보안·계정이전 숨기고 로그인 유도 카드 표시 */
  document.querySelectorAll('#pmTabs button').forEach(b=>{
    if(b.dataset.pm==='security'||b.dataset.pm==='data')b.style.display=guest?'none':'';});
  const gn=$('pmGuestNote');if(gn)gn.hidden=!guest;
  const lo=$('pmLogout');if(lo)lo.style.display=guest?'none':'';
  const lg=$('pmLoginGo');if(lg)lg.onclick=()=>{$('profileGate').hidden=true;$('authGate').hidden=false;};
  renderAvGrid(nm);renderPmStats();
  document.querySelectorAll('#pm-stats .pm-quick button[data-go]').forEach(b=>b.onclick=()=>{$('profileGate').hidden=true;showView(b.dataset.go);});
  const sg=$('psSetGo');if(sg)sg.onclick=()=>{$('profileGate').hidden=true;const gear=$('setGear');if(gear)gear.click();};
  $('pmCloudNote').innerHTML=CLOUD?'계정이 <b>서버에 저장</b>되어 브라우저를 지워도 같은 주소에서 다시 로그인할 수 있어요. 다른 주소로 옮길 땐 아래 백업을 쓰세요.':'계정을 다른 주소·기기로 옮기려면 백업 파일을 내려받아 새 주소의 로그인 화면에서 복원하세요.';
  setPmTab('profile');$('profileGate').hidden=false;
}
$('profileBtn').onclick=openProfile;
{const sp=$('pmSaveProfile');
 if(sp){const orig=sp.onclick;
   sp.addEventListener('click',()=>{
     if(currentUser)return;                       // 회원은 기존 저장 로직이 처리
     const v=($('pmNameIn').value||'').trim().slice(0,12);
     userPrefs.nick=v||'';if(!v)delete userPrefs.nick;savePrefs();
     $('pmProfileMsg').textContent='닉네임을 이 브라우저에 저장했어요.';
     $('pmName').textContent=v||'게스트';paintHeaderUser();
   },true);}}
/* 사용 시작일 기록 + 헤더 아바타 초기 반영 */
try{if(!localStorage.getItem('firstUseAt'))localStorage.setItem('firstUseAt',String(Date.now()));}catch(e){}
try{paintHeaderUser();}catch(e){}
{const hg=$('heroGo');if(hg)hg.onclick=()=>showView('account');}
{const nm=$('newsMore');if(nm)nm.onclick=()=>window.open('https://finance.naver.com/news/mainnews.naver','_blank','noopener');}
/* [v2.5] 신규 버튼 와이어 */
{const b=$('starLab');if(b)b.onclick=()=>{const st=$('starBtn');if(st)st.click();};}
document.addEventListener('click',(e)=>{                       // [v2.5.3] 사업요약 전문 보기
  const b=e.target.closest&&e.target.closest('#bizMore');
  if(!b||!_bizFull)return;
  const s2=byCode[selected]||{};
  openLiteGate('사업요약 · '+(s2.name||selected),`<div class="biz-full">${_bizFull}</div>
    <div class="lg-row"><button class="btn-ghost" id="bizSrc">네이버 금융 기업정보 ↗</button><button class="btn-ghost" id="bizDart">공시 보기 ↗</button></div>`);
  const o=$('bizSrc');if(o)o.onclick=()=>window.open('https://finance.naver.com/item/coinfo.naver?code='+selected,'_blank','noopener');
  const d=$('bizDart');if(d)d.onclick=()=>window.open('https://finance.naver.com/item/news_notice.naver?code='+selected,'_blank','noopener');
});
{const b=$('alertBtn');if(b)b.onclick=openAlertGate;}
{const b=$('cmpBtn');if(b)b.onclick=()=>cmpToggle(selected);}
{const b=$('dartBtn');if(b)b.onclick=()=>{if(selected)window.open('https://finance.naver.com/item/news_notice.naver?code='+selected,'_blank','noopener');};}
{const b=$('holdMgBtn');if(b)b.onclick=openHoldGate;}
{const b=$('briefTts');if(b)b.onclick=toggleBriefTts;}
{const b=$('stratStatBtn');if(b)b.onclick=openStratStats;}
{const b=$('monthRptBtn');if(b)b.onclick=openMonthReport;}
$('pmClose').onclick=()=>{$('profileGate').hidden=true;};
$('profileGate').onclick=(e)=>{if(e.target.id==='profileGate')$('profileGate').hidden=true;};
/* ===== 설정 모달 ===== */
function segSel(id,v){const el=$(id);if(el)el.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));}
/* [수정] 설정이 세로 한 줄로 길게 이어지던 문제 — .set-sec 제목을 기준으로
   6개 카테고리 탭(화면·홈/시작·데이터·알림·계정·정보)으로 묶어 한 화면씩 보여 준다. */
let _setCat='disp';
const SET_CATS=[['disp','🎨 화면'],['home','🏠 홈·시작'],['data','📡 데이터'],['alert','🔔 알림'],['acct','🔐 계정'],['info','ℹ️ 정보']];
function setCatOf(title){
  if(/시작|홈/.test(title))return 'home';          // '시작·홈 화면'이 /화면/에 먼저 걸리지 않도록 순서 중요
  if(/출처|버전|관리자/.test(title))return 'info';  // '정보 · 데이터 출처'가 /데이터/에 걸리지 않도록
  if(/화면/.test(title))return 'disp';
  if(/갱신|사용량|크레딧/.test(title))return 'data';
  if(/알림/.test(title))return 'alert';
  if(/주문|계정/.test(title))return 'acct';
  return 'info';
}
function buildSetTabs(){
  const body=$('setBody'),tabs=$('setTabs');if(!body||!tabs)return;
  let cat='disp';
  Array.from(body.children).forEach(node=>{
    if(node.classList&&node.classList.contains('set-sec'))cat=setCatOf(node.textContent||'');
    if(node.id==='admPanel'){node.dataset.cat='info';return;}   // 관리자 패널 통째로 정보 탭
    node.dataset.cat=cat;
  });
  tabs.innerHTML=SET_CATS.map(([id,label])=>`<button data-sc="${id}" class="${_setCat===id?'on':''}">${label}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{_setCat=b.dataset.sc;showSetCat();});
  showSetCat();
}
function showSetCat(){
  const body=$('setBody'),tabs=$('setTabs');if(!body)return;
  if(tabs)tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.sc===_setCat));
  Array.from(body.children).forEach(node=>{
    const hide=(node.dataset.cat||'disp')!==_setCat;
    if(node.id==='admPanel'){node.style.display=(!node.hidden&&node.dataset.cat===_setCat)?'':'none';return;}
    node.style.display=hide?'none':'';
  });
  body.scrollTop=0;
}
function renderSettingsUI(){
  segSel('setTheme',settings.theme);segSel('setColor',settings.color);
  $('setReal').classList.toggle('on',settings.realHours);$('setReal').setAttribute('aria-checked',settings.realHours);
  $('setOrderPass').classList.toggle('on',settings.orderPass);$('setOrderPass').setAttribute('aria-checked',settings.orderPass);
  $('setRealDesc').textContent=settings.realHours?'켜짐 · 실제 장 시간에만 주문 가능 (KRX 08:30~18:00 · NXT 종목 08:00~20:00)':'꺼짐 · 시간과 무관하게 항상 매수/매도 가능';
  const b=_fbGet();
  $('setUsage').innerHTML=`이번 달 <b>${b.mc.toLocaleString()}</b> / ${fnCapM().toLocaleString()}회 <b>(${fnUsagePct()}%)</b> · 오늘 <b>${b.dc.toLocaleString()}</b> / ${fnCapD().toLocaleString()}회<br><span class="set-d">한도에 닿으면 자동으로 갱신을 늦춰 서버 호출 한도 초과를 막습니다.</span>`;
  renderSettingsExtra();
  buildSetTabs();
}

/* ===== 설정 확장 — 신규 컨트롤 상태 반영 + 1회 배선 ===== */
let _setWired=false;
function renderSettingsExtra(){
  const P=userPrefs;
  segSel('setNumFmt',P.numFmt);segSel('setStartView',P.startView);segSel('setFont',P.fontSize);
  segSel('setWatchSort',P.watchDefaultSort);segSel('setPoll',P.pollSpeed);
  const sw=(id,on)=>{const e=$(id);if(!e)return;e.classList.toggle('on',!!on);e.setAttribute('aria-checked',!!on);};
  sw('setSaver',P.dataSaver);
  sw('setHomeIdx',P.homeSections.idx!==false);sw('setHomeAi',P.homeSections.ai!==false);sw('setHomeCal',P.homeSections.cal!==false);
  sw('setAlTarget',P.alerts.target!==false);sw('setAlSession',!!P.alerts.session);sw('setAlSwing',!!P.alerts.swing);
  const sp=$('setSwingPct');if(sp)sp.value=P.alerts.swingPct||5;
  sw('setMotion',P.reduceMotion);sw('setCb',P.colorblind);
  const vc=$('verCur');if(vc)vc.textContent='v'+APP_VERSION+(APP_BUILD?' · 빌드 '+APP_BUILD:'');
  renderVerCard();
  refreshNxtStatusRow(false);
  if(_setWired)return; _setWired=true;
  const seg=(id,key,after)=>{document.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{
    userPrefs[key]=b.dataset.v;savePrefs();applyPrefs();renderSettingsExtra();if(after)after(b.dataset.v);});};
  seg('setNumFmt','numFmt',()=>{safeRun('fmt',()=>{renderMarket();renderWatch();renderHoldings&&renderHoldings();});});
  seg('setStartView','startView');
  seg('setFont','fontSize');
  seg('setWatchSort','watchDefaultSort',(v)=>{watchSortMode=v;pset('watchSort',v);renderWatch();});
  seg('setPoll','pollSpeed');
  const tg=(id,fn)=>{const e=$(id);if(e)e.onclick=()=>{fn();savePrefs();applyPrefs();renderSettingsExtra();};};
  tg('setSaver',()=>P.dataSaver=!P.dataSaver);
  tg('setHomeIdx',()=>P.homeSections.idx=!(P.homeSections.idx!==false));
  tg('setHomeAi',()=>P.homeSections.ai=!(P.homeSections.ai!==false));
  tg('setHomeCal',()=>P.homeSections.cal=!(P.homeSections.cal!==false));
  tg('setAlTarget',()=>P.alerts.target=!(P.alerts.target!==false));
  tg('setAlSession',()=>{P.alerts.session=!P.alerts.session;if(P.alerts.session)askNotify();});
  tg('setAlSwing',()=>{P.alerts.swing=!P.alerts.swing;if(P.alerts.swing)askNotify();});
  const sp2=$('setSwingPct');if(sp2)sp2.onchange=()=>{const v=Math.max(1,Math.min(30,+sp2.value||5));P.alerts.swingPct=v;sp2.value=v;savePrefs();};
  tg('setMotion',()=>P.reduceMotion=!P.reduceMotion);
  tg('setCb',()=>{P.colorblind=!P.colorblind;refreshColors();});
  const cc=$('setCacheClear');if(cc)cc.onclick=async()=>{
    if(!await askConfirm('캐시 비우기','종목 목록·차트·기업정보 캐시를 지우고 다음 조회 때 새로 받아옵니다.'))return;
    try{localStorage.removeItem('stockAll');}catch(e){}
    try{Object.keys(candleCache).forEach(k=>delete candleCache[k]);}catch(e){}
    try{Object.keys(fundCache).forEach(k=>delete fundCache[k]);}catch(e){}
    try{Object.keys(rankCache).forEach(k=>delete rankCache[k]);}catch(e){}
    stockAll=null;toast('buy','캐시 비움','다음 조회부터 최신 데이터를 받습니다');};
  const nr=$('nxtStatBtn');if(nr)nr.onclick=()=>refreshNxtStatusRow(true);
  const nm2=$('nxtManBtn');if(nm2)nm2.onclick=async()=>{
    const tok=await askText('관리자 토큰',{password:true,placeholder:'NXT_ADMIN_TOKEN',maxLen:80});
    if(!tok)return;
    const m=$('nxtStatMsg');m.textContent='갱신 요청 중…';
    try{fnBump();const r=await fetch('/api/nxtrefresh?run=1',{headers:{Authorization:'Bearer '+tok}});const j=await r.json();
      m.textContent=j.ok?'백그라운드 갱신을 시작했습니다. 1~2분 뒤 상태를 새로고침하세요.':'실패: '+(j.err||r.status);
    }catch(e){m.textContent='요청 실패';}};
  const tr2=$('setTradeReset');if(tr2)tr2.onclick=async()=>{
    if(!await askConfirm('거래내역 초기화','모든 매매일지 기록이 삭제됩니다. 보유종목·예수금은 유지됩니다.',{okLabel:'초기화',danger:true}))return;
    tradeLog=[];tradeArchive={};saveState();toast('warn','거래내역 초기화 완료','');};
  const cr=$('setCashReset');if(cr)cr.onclick=async()=>{
    const v=await askText('예수금 리셋',{placeholder:'새 예수금(원) 예: 10000000',value:String(cash||0),maxLen:12});
    if(v===null)return;const nv=Math.max(0,Math.round(+String(v).replace(/[^0-9]/g,'')||0));
    cash=nv;saveState();renderPortfolioNumbers&&renderPortfolioNumbers();toast('buy','예수금 변경',KRW(nv)+'원');};
  const hr=$('setHistClear');if(hr)hr.onclick=async()=>{
    if(!await askConfirm('검색·열람 기록 삭제','최근 검색어와 최근 본 종목 기록을 모두 지웁니다.'))return;
    srchHist=[];viewHist=[];saveHist();saveViewHist();renderHist();renderViewHist();toast('warn','기록 삭제 완료','');};
  const ad=$('setAcctDel');if(ad)ad.onclick=async()=>{
    if(!currentUser){toast('warn','로그인이 필요합니다','다시 로그인해 주세요');requireAuth();return;}
    if(!await askConfirm('계정 삭제',`'${currentUser}' 계정과 클라우드의 모든 데이터가 영구 삭제됩니다.
되돌릴 수 없습니다.`,{okLabel:'영구 삭제',danger:true}))return;
    const pw=await askText('비밀번호 확인',{password:true,placeholder:'로그인 비밀번호'});
    if(!pw)return;
    const passH=await pwHash(pw), legacyH=legacyHash(pw);
    const j=await cloudCall({action:'delete',id:currentUser,pass:passH,legacy:legacyH});
    if(!j||!j.ok){toast('warn','삭제 실패',j&&j.err==='wrongpass'?'비밀번호가 올바르지 않습니다':(j&&j.err)||'네트워크 오류');return;}
    const accs=accounts();delete accs[currentUser];store.set('accounts',accs);
    store.del('user:'+currentUser);store.del('session');
    toast('warn','계정이 삭제되었습니다','');setTimeout(()=>location.reload(),700);};
  const vb=$('verCheckBtn');if(vb)vb.onclick=()=>checkUpdate(true);
  const ub=$('verApplyBtn');if(ub)ub.onclick=()=>applyUpdate();
  wireAdminPanel();
}

/* ===== [S19] 플레이스토어식 업데이트 시스템 ===== */
let verLatest=null,verBuildLatest=null;
function cmpVerC(a,b){const A=String(a||'0').split('.').map(x=>+x||0),B=String(b||'0').split('.').map(x=>+x||0);
  for(let i=0;i<3;i++){if((A[i]||0)>(B[i]||0))return 1;if((A[i]||0)<(B[i]||0))return -1;}return 0;}
function renderVerCard(){
  const box=$('verCard'); if(!box)return;
  const hasNew=hasNewVersion();
  const st=$('verState');
  if(st)st.innerHTML=verLatest
    ?(hasNew?`<span class="ver-new">새 버전 v${verLatest.version} 사용 가능</span>`:`<span class="ver-ok">✓ 최신 버전입니다</span>`)
    :'<span class="set-d">「업데이트 확인」을 눌러 최신 버전을 확인하세요</span>';
  const nb=$('verNotes');
  if(nb){
    /* [v2.9] 여기도 문자열 조립 대신 노드 생성 — 노트 본문에 태그 문자가 있어도 안전
       [v4.8 · 버그] 서버(/api/version)가 옛 버전 정보를 들고 있으면 '현재 버전 v4.7.0'
       옆에 'v4.6.0 업데이트 내용'이 나란히 표시됐다. 서버가 더 새 버전을 알릴 때만
       서버 노트를 쓰고, 그 외에는 번들에 동봉된 현재 버전의 노트를 보여 준다. */
    const bundled={version:APP_VERSION,notes:(__BUNDLED_VER&&__BUNDLED_VER.notes)||[],releasedAt:(__BUNDLED_VER&&__BUNDLED_VER.releasedAt)||''};
    const show=(verLatest&&cmpVerC(verLatest.version,APP_VERSION)>0)?verLatest:bundled;
    nb.textContent='';
    if(show&&show.notes&&show.notes.length){
      const h=document.createElement('div'); h.className='ver-nt-h';
      h.textContent=`v${show.version} 업데이트 내용`;
      const i2=document.createElement('i'); i2.textContent=fmtRelease(show.releasedAt);
      h.appendChild(i2); nb.appendChild(h);
      show.notes.forEach(t=>{const d=document.createElement('div');d.className='ver-nt';d.textContent='· '+String(t);nb.appendChild(d);});
    }else{
      const d=document.createElement('div'); d.className='ver-nt';
      d.textContent='최신 버전을 사용 중입니다.'; nb.appendChild(d);
    }
  }
  const ub=$('verApplyBtn'); if(ub)ub.hidden=!hasNew;
  const dot=document.querySelector('#setGear .gear-dot');
  if(dot)dot.hidden=!hasNew;
}
async function probeLatestBuild(){
  /* 서버의 index.html(no-cache)을 직접 읽어 최신 배포의 자산 버전(?v=)을 알아낸다.
     버전 문자열과 무관하게 '새 빌드가 올라왔는지'를 가장 확실하게 판정하는 방법. */
  try{
    const r=await fetch('/?vchk='+Date.now(),{cache:'no-store'});
    const h=await r.text();
    const m=h.match(/assets\/app\.js\?v=([\w.]+)/);
    return m?m[1]:null;
  }catch(e){return null;}
}
async function checkUpdate(manual){
  const st=$('verState'); if(manual&&st)st.textContent='확인 중…';
  try{
    fnBump();
    const r=await fetch('/api/version?t='+Date.now(),{cache:'no-store'});
    const j=await r.json();
    if(j&&j.ok&&j.version){verLatest=j;try{localStorage.setItem('verChkAt',String(Date.now()));localStorage.setItem('verLast',JSON.stringify(j));}catch(e){}}
  }catch(e){ if(manual&&st)st.innerHTML='<span class="set-d">확인 실패 — 네트워크를 확인해 주세요</span>'; }
  try{
    const bv=await probeLatestBuild();                 // [v2.2] 빌드 번호 이중 확인
    if(bv)verBuildLatest=bv;
  }catch(e){}
  renderVerCard();
  maybeShowUpdBanner();
  if(manual&&!hasNewVersion())toast('buy','최신 버전 사용 중','v'+APP_VERSION+(APP_BUILD?' · 빌드 '+APP_BUILD:''));
}
function hasNewVersion(){
  const byVer=verLatest&&cmpVerC(verLatest.version,APP_VERSION)>0;
  const byBuild=!!(verBuildLatest&&APP_BUILD&&verBuildLatest!==APP_BUILD);
  return byVer||byBuild;
}
/* ══ [v4.16] 홈 화면 아이콘 자동 교체 ═════════════════════════════════════
   [문제] 아이콘을 새로 만들어도 홈 화면 바로가기는 옛 그림 그대로였다.
   재설치를 안내했지만, 사용자가 [지금 업데이트]만 눌러도 바뀌어야 맞다.
   [원리] Chrome(안드로이드)은 앱을 열 때 매니페스트를 다시 읽어, 내용이
   바뀌었으면 홈 화면 아이콘(WebAPK)을 백그라운드로 교체한다. 문제는
     ① 매니페스트가 캐시에 갇히면 '바뀐 사실'을 아예 모르고
     ② <link rel=manifest> 주소가 그대로면 재확인을 게을리한다는 점이었다.
   [해결] 업데이트 시 매니페스트·아이콘을 캐시 무시로 강제로 다시 받고,
   link 주소를 새 버전으로 바꿔 끼워 브라우저가 즉시 재평가하게 만든다.
   (_headers 에서 매니페스트·아이콘을 no-cache 로 둔 것과 한 벌로 동작한다) */
/* 앱을 열 때마다 매니페스트를 조용히 재확인한다.
   브라우저가 '바뀐 매니페스트'를 보게 만들어 두면, 사용자가 아무것도 안 해도
   다음 실행 즈음에는 홈 화면 아이콘이 알아서 교체된다(Chrome WebAPK 갱신). */
function pingManifest(){
  try{
    const l=document.querySelector('link[rel="manifest"]');
    if(l)fetch(l.href,{cache:'no-cache'}).catch(()=>{});
  }catch(e){}
}
async function refreshAppIcons(){
  /* ══ [v4.23] 아이콘 자동 갱신 — 가능한 신호를 전부 보낸다 ═══════════════
     [설계 원칙] 주소는 절대 바꾸지 않는다. 매니페스트도 아이콘도 고정 주소다.
       · 매니페스트 주소를 바꾸면 Chrome 이 '전에 보던 것'과 비교를 못 한다
       · 아이콘 파일명을 바꾸면 구버전 참조가 404 → Chrome 이 30일간 확인 중단
     [대신 이렇게 알린다]
       ① 매니페스트를 같은 주소로 강제 재수신 → Chrome 이 새 내용을 인지
       ② 아이콘 3종을 cache:'reload' 로 강제 재수신 → 브라우저 캐시의 그림 교체
          (Chrome 은 갱신 판정 때 아이콘을 실제로 받아 해시를 비교한다)
       ③ 매니페스트 안의 version·description 이 배포마다 바뀌므로 내용 자체가 달라진다
     이 셋이면 Chrome 이 감지하지 못할 경로가 남지 않는다. */
  const bust=(u)=>fetch(u,{cache:'reload',credentials:'same-origin'}).catch(()=>{});
  try{ await bust('/manifest.webmanifest'); }catch(e){}
  try{ await Promise.all(['/icon-192.png','/icon-512.png','/icon-maskable-512.png','/favicon.png'].map(bust)); }catch(e){}
  /* 브라우저 이미지 캐시에 새 그림을 확실히 앉힌다 */
  try{ await Promise.all(['/icon-192.png','/icon-512.png'].map(u=>new Promise(r=>{
    const im=new Image(); im.onload=im.onerror=()=>r(); im.src=u+'#'+Date.now();
  }))); }catch(e){}
  try{ localStorage.setItem('iconSyncAt',String(Date.now())); }catch(e){}
}
/* ══ [v4.23] 앱을 열 때마다 조용히 아이콘 동기화를 시도한다 ════════════════
   사용자가 [지금 업데이트]를 누르지 않아도, 새 버전이 배포되면 알아서 최신 아이콘을
   받아 두고 Chrome 이 갱신을 예약하도록 만든다. 하루 한 번만 돌려 부담을 주지 않는다. */
function autoIconSync(){
  try{
    const last=+(localStorage.getItem('iconSyncAt')||0);
    const ver=localStorage.getItem('iconSyncVer')||'';
    const cur=(typeof APP_VERSION!=='undefined')?APP_VERSION:'';
    const stale=Date.now()-last>20*3600e3;
    if(!stale && ver===cur) return;                  // 오늘 이미 했고 버전도 그대로면 건너뛴다
    refreshAppIcons().then(()=>{
      try{ localStorage.setItem('iconSyncVer',cur); }catch(e){}
    });
  }catch(e){}
}
/* 홈 화면 아이콘 교체 조건 안내 — Chrome 이 실제로 요구하는 조건을 그대로 알려 준다 */
function iconUpdateHelpText(){
  return '홈 화면 아이콘은 안드로이드가 백그라운드에서 바꿔 줍니다. '
    +'다음 조건이 모두 맞아야 진행돼요 — ① 앱을 <b>완전히 종료</b>(최근 앱에서 밀어 닫기) '
    +'② <b>충전기 연결</b> ③ <b>Wi-Fi 연결</b>. 보통 몇 분~하루 안에 바뀝니다.<br>'
    +'바로 바꾸고 싶으면 크롬 주소창에 <b>about:webapks</b> 를 열고 LIVE증권 항목의 '
    +'<b>Update</b> 를 누르세요. 아이폰은 홈 화면에서 삭제 후 다시 추가해야 합니다.';
}

async function applyUpdate(){
  /* [v2.2] 업데이트 파이프라인:
     ① 진행 안내 모달 표시 → ② Cache Storage·서비스워커·무거운 로컬 캐시 정리
     → ③ 서버에서 새 index.html 확보 확인 → ④ ?upd= 캐시버스터로 재기동
     → ⑤ 재부팅 후 부트 코드가 ?upd= 를 감지해 '업데이트 완료 vX.Y' 확인 토스트 표시 */
  const ov=document.createElement('div');
  ov.className='upd-overlay';
  ov.innerHTML=`<div class="upd-box"><div class="upd-spin"></div>
    <b>업데이트를 적용하고 있어요</b><p id="updStep">준비 중…</p>
    <small>몇 초면 끝나요. 화면이 자동으로 다시 열립니다.</small></div>`;
  document.body.appendChild(ov);
  const step=(t)=>{const el=ov.querySelector('#updStep');if(el)el.textContent=t;};
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  try{
    step('오래된 캐시를 비우는 중…');
    try{if(window.caches&&caches.keys){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}}catch(e){}
    try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));}}catch(e){}
    try{localStorage.removeItem('stockAll');localStorage.removeItem('verLast');}catch(e){}
    await wait(350);
    step('앱 아이콘을 갱신하는 중…');
    await refreshAppIcons();
    await wait(300);
    step('새 파일을 내려받는 중…');
    const bv=await probeLatestBuild();      // 서버에서 최신 HTML 이 실제로 오는지 검증
    await wait(300);
    step(bv?('새 빌드 '+bv+' 확인 — 다시 시작합니다'):'다시 시작합니다…');
    await wait(450);
  }catch(e){}
  const u=new URL(location.href);
  u.searchParams.set('upd',String(Date.now()));
  location.replace(u.pathname+'?'+u.searchParams.toString());
}
/* 재기동 직후 — 업데이트 완료 확인 및 주소 정리 */
/* ══ [v2.3.1] 최적화 업데이트 게이트 ══
   요구사항: 관리자가 새 ZIP을 올린 뒤에는 — 사용자가 그냥 새로고침으로 새 번들을 받았더라도 —
   반드시 안내창을 보고 [지금 업데이트]를 눌러야 '완전 최적화'(캐시 정리→재기동→완료 확인)가 끝난다.
   원리: localStorage 'lastRunVer'에 "최적화가 완료된 버전|빌드"를 기록해 두고,
   부팅 시 실행 중 버전과 다르면(=새 번들 첫 실행) 게이트 모달을 띄운다.
   정식 파이프라인(?upd= 재기동)을 거친 부팅만 lastRunVer를 갱신한다. */
const RUN_KEY=APP_VERSION+'|'+(APP_BUILD||'');
/* [v2.5.1] 배포 일시 표기 — 'YYYY-MM-DD' 와 'YYYY-MM-DD HH:MM' 둘 다 지원 */
function fmtRelease(v){
  if(!v)return '';
  const m=String(v).match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if(!m)return String(v);
  const base=`${+m[1]}년 ${+m[2]}월 ${+m[3]}일`;
  return m[4]?`${base} ${m[4]}:${m[5]} 배포`:`${base} 배포`;
}
/* [v2.9 · 치명] 릴리스 노트는 innerHTML 로 꽂히는데 이스케이프가 없었다.
   노트 본문에 '</div>' 같은 글자가 들어가면 그 태그가 진짜로 해석돼 모달 컨테이너를
   중간에 닫아 버리고, 뒤쪽 내용 전체가 모달 밖 body 로 쏟아진다(v2.8.0 배포에서 실제 발생).
   노트는 설정 › 버전 관리에서 관리자가 자유롭게 입력하는 값이라 주입 통로이기도 하다.
   → 화면에 꽂기 전에 반드시 이 함수를 통과시킨다. */
function htmlEsc(v){
  return String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showUpdateGate(prevKey){
  if(document.getElementById('updGate'))return;
  try{if(sessionStorage.getItem('updGateSkip')===RUN_KEY)return;}catch(e){}
  const bv=(typeof __BUNDLED_VER!=='undefined')?__BUNDLED_VER:{};
  const notes=Array.isArray(bv.notes)?bv.notes:[];      // [v2.5.1] 전문 표시 — 더 이상 자르지 않는다
  const g=document.createElement('div');
  g.id='updGate';g.className='upd-overlay';
  g.innerHTML=`<div class="upd-box gate">
    <div class="ug-top">
      <div class="ug-badge">🚀</div>
      <div class="ug-h">새 업데이트가 도착했어요</div>
      <div class="ug-meta"><span class="ug-pill">v${APP_VERSION}${APP_BUILD?' · 빌드 '+APP_BUILD:''}</span>${bv.releasedAt?`<span class="ug-date">${fmtRelease(bv.releasedAt)}</span>`:''}</div>
    </div>
    <div class="ug-body">
      <div class="ug-nt">업데이트 내용</div>
      <ul class="ug-notes" id="ugNotes"></ul>
    </div>
    <div class="ug-foot">
      <p class="ug-d">캐시를 정리하고 다시 시작해 새 버전으로 <b>완전 최적화</b>합니다. 관심종목·계좌 데이터는 그대로 유지돼요.</p>
      <p class="ug-d ug-icon">📱 <b>홈 화면 아이콘</b> — ${iconUpdateHelpText()}</p>
      <button class="ug-go" id="ugGo">지금 업데이트</button>
      <button class="ug-skip" id="ugLater">나중에</button>
    </div>
  </div>`;
  /* [v2.9 · 치명 재발 방지] 릴리스 노트는 innerHTML 로 조립하지 않는다.
     v2.8.0 노트 본문에 '</div>' 라는 글자가 들어 있었는데, 이게 글자가 아니라
     진짜 태그로 해석되면서 모달 상자를 중간에 닫아 버렸다. 그 결과 나머지 항목과
     하단 버튼이 상자 밖으로 튀어나가 화면이 무너졌다(첨부 사진).
     htmlEsc 를 거치더라도 문자열 조립 방식은 언젠가 또 새는 지점이 생긴다.
     → 아예 노드를 만들어 textContent 로 넣는다. 어떤 문자가 와도 태그가 될 수 없다. */
  const ul=g.querySelector('#ugNotes');
  if(notes.length){ notes.forEach(n=>{const li=document.createElement('li');li.textContent=String(n);ul.appendChild(li);}); }
  else { const d=document.createElement('div'); d.className='ug-none';
    d.textContent='이번 배포의 상세 내용은 설정 › 버전 정보에서 볼 수 있어요.'; ul.replaceWith(d); }
  document.body.appendChild(g);
  g.querySelector('#ugGo').onclick=()=>{g.remove();applyUpdate();};
  g.querySelector('#ugLater').onclick=()=>{try{sessionStorage.setItem('updGateSkip',RUN_KEY);}catch(e){}g.remove();
    toast('warn','최적화 대기 중','다음 접속 때 다시 안내할게요');};
}
(function updBootCheck(){
  try{
    const u=new URL(location.href);
    const viaPipeline=u.searchParams.has('upd');
    let lastRun='';try{lastRun=localStorage.getItem('lastRunVer')||'';}catch(e){}
    /* [v2.3.2 수정] 게이트가 안 뜨던 원인: 게이트 도입 '이전'부터 쓰던 기존 사용자는
       lastRunVer 기록이 없어서 '최초 사용자'로 오판 → 조용히 기록만 하고 넘어갔다.
       이전 세션의 흔적(자동 버전확인 시각·자산 추이·세션 스냅샷)이 있으면 기존 사용자다. */
    let returning=false;
    try{returning=!!(localStorage.getItem('verChkAt')||localStorage.getItem('equityHist')||localStorage.getItem('sessSnap'));}catch(e){}
    if(viaPipeline){
      try{localStorage.setItem('lastRunVer',RUN_KEY);}catch(e){}   // 정식 파이프라인 완료만 기록
    }else if(!lastRun&&!returning){
      try{localStorage.setItem('lastRunVer',RUN_KEY);}catch(e){}   // 진짜 최초 사용자만 조용히 통과
    }else if(lastRun!==RUN_KEY){
      setTimeout(()=>{try{showUpdateGate(lastRun);}catch(e){}},700); // 새 번들 첫 실행 → 게이트
    }
    if(!viaPipeline)return;
    u.searchParams.delete('upd');
    history.replaceState(null,'',u.pathname+(u.searchParams.toString()?('?'+u.searchParams.toString()):'')+u.hash);
    try{localStorage.removeItem('updSkip');}catch(e){}
    setTimeout(()=>{toast('buy','업데이트 완료','v'+APP_VERSION+(APP_BUILD?' · 빌드 '+APP_BUILD:'')+' 실행 중');checkUpdate(false);},900);
  }catch(e){}
})();
function autoCheckUpdate(){
  /* [v2.2.1] 접속할 때마다 최신 여부를 즉시 확인한다(응답은 s-maxage 캐시라 비용 미미).
     새 버전이 있으면 checkUpdate 끝에서 상단 안내 배너가 자동으로 뜬다. */
  try{const c=JSON.parse(localStorage.getItem('verLast')||'null');if(c)verLatest=c;}catch(e){}
  renderVerCard();
  checkUpdate(false);
}
/* ══ 접속 시 새 버전 안내 배너 ══
   관리자가 새 ZIP을 배포해 서버 버전/빌드가 실행 중인 것과 달라지면,
   다음 접속(또는 20초 내 자동 확인) 때 화면 상단에 안내 배너가 내려온다.
   [지금 업데이트]=업데이트 파이프라인 실행 · [나중에]=이번 버전에 한해 숨김(다음 버전이 나오면 다시 표시). */
function updBannerKey(){return String((verLatest&&verLatest.version)||'')+'|'+String(verBuildLatest||'');}
function maybeShowUpdBanner(){
  try{
    if(!hasNewVersion()){const ex=$('updBanner');if(ex)ex.remove();return;}
    const key=updBannerKey();
    let skip='';try{skip=localStorage.getItem('updSkip')||'';}catch(e){}
    if(skip===key)return;
    if($('updBanner'))return;
    const v=(verLatest&&verLatest.version)?('v'+verLatest.version):('빌드 '+verBuildLatest);
    const note=(verLatest&&Array.isArray(verLatest.notes)&&verLatest.notes[0])?String(verLatest.notes[0]).slice(0,64)+'…':'새 기능과 수정 사항이 준비됐어요.';
    const b=document.createElement('div');
    b.id='updBanner';b.className='upd-banner';
    b.innerHTML=`<div class="ub-ic">🚀</div>
      <div class="ub-b"><b>새 버전 ${v}이 준비됐어요</b><span>${note}</span></div>
      <button class="ub-go" id="ubGo">지금 업데이트</button>
      <button class="ub-later" id="ubLater" aria-label="나중에">나중에</button>`;
    document.body.appendChild(b);
    requestAnimationFrame(()=>b.classList.add('show'));
    $('ubGo').onclick=()=>{b.remove();applyUpdate();};
    $('ubLater').onclick=()=>{try{localStorage.setItem('updSkip',key);}catch(e){}b.classList.remove('show');setTimeout(()=>b.remove(),350);};
  }catch(e){}
}

/* ===== 관리자 패널 — 버전 행 7번 연속 탭으로 열림 =====
   별도 계정 DB 없이 서버 환경변수 NXT_ADMIN_TOKEN 하나로 인증한다(가장 안전·단순).
   토큰은 이 브라우저 세션에만 잠깐 보관되고 저장되지 않는다. */
let _admTap=0,_admTapAt=0;
function wireAdminPanel(){
  const row=$('verRow'); if(!row||row._admWired)return; row._admWired=true;
  row.addEventListener('click',()=>{
    const now=Date.now();
    if(now-_admTapAt>2500)_admTap=0;
    _admTapAt=now;_admTap++;
    if(_admTap>=7){_admTap=0;openAdminPanel();}
  });
  const sv=$('admSave'); if(sv)sv.onclick=saveAdminNotice;
  const ld=$('admLoad'); if(ld)ld.onclick=loadAdminCurrent;
}
function openAdminPanel(){
  const pn=$('admPanel'); if(!pn)return;
  pn.hidden=false;
  try{const t=sessionStorage.getItem('admtok');if(t)$('admTok').value=t;}catch(e){}
  loadAdminCurrent();
  toast('buy','관리자 모드','업데이트 공지를 편집할 수 있습니다');
}
async function loadAdminCurrent(){
  const m=$('admMsg'); if(m)m.textContent='현재 공지 불러오는 중…';
  try{
    const r=await fetch('/api/version?t='+Date.now(),{cache:'no-store'});const j=await r.json();
    if(j&&j.ok){$('admVer').value=j.version||'';$('admNotes').value=(j.notes||[]).join('\n');
      if(m)m.textContent='현재 게시: v'+j.version+' ('+(j.src==='blob'?'관리자 저장본':'내장 기본값')+')';}
  }catch(e){ if(m)m.textContent='불러오기 실패'; }
}
async function saveAdminNotice(){
  const tok=($('admTok').value||'').trim(), ver=($('admVer').value||'').trim();
  const notes=($('admNotes').value||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const m=$('admMsg');
  if(!tok){m.textContent='관리자 토큰을 입력하세요 (환경변수 NXT_ADMIN_TOKEN 값)';return;}
  if(!/^\d+\.\d+\.\d+$/.test(ver)){m.textContent='버전은 1.91.0 형식이어야 합니다';return;}
  if(!notes.length){m.textContent='업데이트 내용을 한 줄 이상 입력하세요';return;}
  try{sessionStorage.setItem('admtok',tok);}catch(e){}
  m.textContent='저장 중…';
  try{
    const r=await fetch('/api/version',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({version:ver,notes})});
    const j=await r.json();
    if(j&&j.ok){m.textContent='✓ 게시 완료 — 모든 사용자의 「업데이트 확인」에 v'+ver+' 이 표시됩니다';verLatest=j.saved;renderVerCard();}
    else m.textContent='실패: '+((j&&j.err)||r.status);
  }catch(e){ m.textContent='저장 실패 — 네트워크 확인'; }
}

/* ===== [S9] NXT 명단 상태 ===== */
async function refreshNxtStatusRow(force){
  const el=$('nxtStatTxt'); if(!el)return;
  if(force)el.textContent='확인 중…';
  try{
    fnBump();
    const r=await fetch('/api/nxtlist'+(force?'?t='+Date.now():''),{cache:force?'no-store':'default'});
    const j=await r.json();
    if(j&&j.count)el.innerHTML=`현재 <b>${j.count.toLocaleString()}종목</b> · 기준일 <b>${j.asOf||'—'}</b>${j.official?' · 공식 명단':''}`;
    else el.textContent='명단 정보를 불러오지 못했습니다';
  }catch(e){ el.textContent='확인 실패'; }
}

/* ===== [S11·S12] 알림 엔진 ===== */
let _sessAlerted={},_swingAlerted={};
/* [v4.5] KST() 는 이 파일에 정의된 적이 없어 호출 즉시 ReferenceError 였다.
   try/catch 에 삼켜져 장 시작·마감 알림과 보유종목 급변동 알림이 통째로 죽어 있었다. */
function _todayKey(){return kstDay();}
function notifyUser(title,body){
  try{toast('buy',title,body||'');}catch(e){}
  try{if(notifyOk&&'Notification' in window)new Notification(title,{body:body||''});}catch(e){}
}
setInterval(()=>{try{
  if(!(userPrefs.alerts&&userPrefs.alerts.session))return;
  const k=kstNow(),hm=k.getUTCHours()*100+k.getUTCMinutes(),day=_todayKey();
  if(hm===859&&_sessAlerted[day]!=='o'){_sessAlerted[day]='o';notifyUser('곧 장 시작','1분 뒤 KRX 정규장이 열립니다 (09:00)');}
  if(hm===1529&&_sessAlerted[day+'c']!=='c'){_sessAlerted[day+'c']='c';notifyUser('곧 장 마감','1분 뒤 정규장이 마감됩니다 (15:30)');}
}catch(e){}},30000);
function swingWatch(code,st){
  const A=userPrefs.alerts||{};
  if(!A.swing)return;
  if(!holdings.some(h=>h.code===code))return;
  const p=chgPct(st); if(p==null)return;
  const th=A.swingPct||5;
  if(Math.abs(p)<th)return;
  const key=_todayKey()+':'+code+':'+(p>0?'u':'d');
  if(_swingAlerted[key])return;
  _swingAlerted[key]=1;
  notifyUser('보유종목 급변동',`${(byCode[code]&&byCode[code].name)||code} ${pctS(p)} (기준 ±${th}%)`);
}

/* ===== [H4] 온보딩 (기기당 1회) ===== */
function maybeOnboard(){
  try{if(localStorage.getItem('onboarded'))return;}catch(e){}
  const ov=document.createElement('div');ov.className='overlay ob-ov';ov.id='obOv';
  const steps=[
    {t:'모의투자입니다',d:'실제 시세로 연습하는 <b>가상 매매</b> 서비스예요. 어떤 주문도 실제로 체결되지 않고, 돈이 오가지 않습니다.'},
    {t:'실시간 데이터',d:'시세·지수·실적 일정은 네이버·야후·한국경제 등 <b>공개 데이터</b>를 실시간으로 읽어 옵니다. 프리마켓엔 NXT 체결가까지 반영돼요.'},
    {t:'폴더와 알림',d:'관심종목을 <b>폴더</b>로 정리하고, 목표가·급변동 <b>알림</b>을 설정해 보세요. 로그인하면 모든 데이터가 계정에 자동 저장됩니다.'}];
  let i=0;
  ov.innerHTML=`<div class="modal ob-modal"><div class="ob-t" id="obT"></div><div class="ob-d" id="obD"></div>
    <div class="ob-dots" id="obDots"></div>
    <div class="ask-btns"><button class="ask-cancel" id="obSkip">건너뛰기</button><button class="ask-ok" id="obNext">다음</button></div></div>`;
  document.body.appendChild(ov);
  const paint=()=>{$('obT').textContent=steps[i].t;$('obD').innerHTML=steps[i].d;
    $('obDots').innerHTML=steps.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('');
    $('obNext').textContent=i===steps.length-1?'시작하기':'다음';};
  const done=()=>{try{localStorage.setItem('onboarded','1');}catch(e){}ov.remove();};
  $('obSkip').onclick=done;
  $('obNext').onclick=()=>{if(i<steps.length-1){i++;paint();}else done();};
  paint();
}

/* ===== [H5] 검색 바로가기 ===== */
function renderSearchShortcuts(){
  const el=$('srchShort'); if(!el)return;
  el.innerHTML=`<div class="sh-chips">
    <span class="sh-chip sc" data-go="rise">🔥 급등 순위</span>
    <span class="sh-chip sc" data-go="pop">👀 인기 검색</span>
    <span class="sh-chip sc" data-go="theme">🧩 업종·테마</span></div>`;
  el.querySelectorAll('.sc').forEach(c=>c.onclick=()=>{
    const g=c.dataset.go;
    if(g==='theme'){showView('sector');return;}
    searchRankTab=g==='rise'?'상승률':'조회수';
    const inp=$('searchInput'); if(inp)inp.value='';
    srchPage=1;renderSearch();renderHist();
  });
}
function refreshColors(){ // 색상 변경 시 캔버스류 다시 그림(CSS는 변수로 자동 반영)
  if(currentView==='home')renderMarket();
  else if(currentView==='trade'){renderDetail();try{drawChart();}catch(e){}}
  else if(currentView==='sector')renderSector();
}
$('setGear').onclick=()=>{renderSettingsUI();$('setGate').hidden=false;};
document.querySelectorAll('#tabbar button').forEach(b=>b.onclick=()=>showView(b.dataset.bv));
$('setClose').onclick=()=>{$('setGate').hidden=true;};
$('setGate').onclick=(e)=>{if(e.target.id==='setGate')$('setGate').hidden=true;};
$('setTheme').onclick=(e)=>{const b=e.target.closest('button');if(!b)return;settings.theme=b.dataset.v;saveSettings();applyTheme();renderSettingsUI();};
/* [v2.5] 테마 '자동' — 18:30~06:30 다크(일몰 근사), 30분마다 재판정 */
setInterval(()=>{try{if(settings.theme==='auto')applyTheme();}catch(e){}},30*60e3);
$('setColor').onclick=(e)=>{const b=e.target.closest('button');if(!b)return;settings.color=b.dataset.v;saveSettings();applyColor();refreshColors();renderSettingsUI();};
$('setReal').onclick=()=>{settings.realHours=!settings.realHours;saveSettings();renderSettingsUI();try{renderTradeGate();}catch(e){}};
$('setOrderPass').onclick=()=>{settings.orderPass=!settings.orderPass;saveSettings();renderSettingsUI();};
document.querySelectorAll('#pmTabs button').forEach(b=>b.onclick=()=>setPmTab(b.dataset.pm));
$('pmLogout').onclick=()=>{store.del('session');requireAuth();location.reload();};   // [v4.1] 로그아웃 → 잠금
$('pmSaveProfile').onclick=async()=>{
  const name=$('pmNameIn').value.trim(),email=$('pmEmailIn').value.trim(),acc=accounts()[currentUser];if(!acc)return;
  try{userPrefs=userPrefs||{};userPrefs.bio=($('pmBioIn')?$('pmBioIn').value.trim():'').slice(0,40);savePrefs();}catch(e){}
  acc.name=name||currentUser;acc.email=email;const accs=accounts();accs[currentUser]=acc;store.set('accounts',accs);
  cloudCall({action:'profile',id:currentUser,pass:acc.pass,name:acc.name,email:acc.email});
  const dn=acc.name;$('uName').textContent=dn;$('uAv').textContent=avatarOf(dn);$('pmName').textContent=dn;$('pmAv').textContent=avatarOf(dn);
  $('pmProfileMsg').style.color='var(--up)';$('pmProfileMsg').textContent='저장되었습니다.';
};
/* ══ [v4.19] 백업에서 복원 ═══════════════════════════════════════════════
   내려받기만 있고 되돌리는 길이 없어, 백업 파일이 사실상 무용지물이었다.
   붙여넣기·파일 두 경로를 모두 제공하고, 덮어쓰기 전에 반드시 확인을 받는다. */
function pmApplyRestore(text){
  const m=$('pmDataMsg'); const bad=(t)=>{m.style.color='var(--down)';m.textContent=t;};
  let j; try{ j=JSON.parse(String(text||'').trim()); }catch(e){ return bad('백업 코드를 읽을 수 없습니다. 내용을 다시 확인해 주세요.'); }
  const d=(j&&j.user)?j.user:j;
  if(!d||typeof d!=='object')return bad('백업 형식이 아닙니다.');
  const hasAny=['watchlist','holdings','cash','tradeLog','watchFolders'].some(k=>d[k]!==undefined);
  if(!hasAny)return bad('이 파일에는 복원할 계좌 데이터가 없습니다.');
  const n=(Array.isArray(d.holdings)?d.holdings.length:0), w=(Array.isArray(d.watchlist)?d.watchlist.length:0);
  if(!confirm(`복원하면 지금 계정의 데이터가 백업 내용으로 덮어써집니다.\n\n· 보유 ${n}종목 · 관심 ${w}종목 · 매매 ${Array.isArray(d.tradeLog)?d.tradeLog.length:0}건\n\n되돌릴 수 없습니다. 계속할까요?`))return;
  try{
    if(Array.isArray(d.watchlist))watchlist=d.watchlist.slice();
    if(Array.isArray(d.holdings))holdings=d.holdings.slice();
    if(d.cash!=null)cash=d.cash;
    if(d.usdCash!=null)usdCash=+d.usdCash||0;
    if(d.acctType&&ACCT_TYPES[d.acctType])acctType=d.acctType;
    if(Array.isArray(d.usdSettling))usdSettling=d.usdSettling.slice();
    if(Array.isArray(d.ipoPlans))ipoPlans=d.ipoPlans.slice();
    if(Array.isArray(d.tradeLog))tradeLog=d.tradeLog.slice();
    if(d.tradeArchive&&typeof d.tradeArchive==='object')tradeArchive=d.tradeArchive;
    if(Array.isArray(d.watchFolders))watchFolders=d.watchFolders.slice();
    if(d.stockMemos&&typeof d.stockMemos==='object')stockMemos=d.stockMemos;
    if(d.prefs&&typeof d.prefs==='object')userPrefs=Object.assign({},userPrefs,d.prefs);
    try{sanitizeAccount(true);}catch(e){}
    try{syncWatchUnion();}catch(e){}
    saveState();
    m.style.color='var(--up)';m.textContent='복원했습니다. 화면을 새로 그립니다…';
    setTimeout(()=>{try{$('profileGate').hidden=true;}catch(e){}
      ['renderPortfolioNumbers','renderHoldings','renderWatch','renderJournal'].forEach(f=>{try{window[f]&&window[f]();}catch(e){}});
      toast('buy','백업 복원 완료','보유 '+holdings.length+'종목 · 관심 '+watchlist.length+'종목을 되살렸습니다.');},600);
  }catch(e){ bad('복원 중 문제가 생겼습니다: '+String(e).slice(0,60)); }
}
{const b=$('pmRestore'); if(b)b.onclick=()=>pmApplyRestore($('pmRestoreIn')?$('pmRestoreIn').value:'');}
{const b=$('pmRestoreFile'); if(b)b.onclick=()=>{const f=$('pmRestoreFileIn'); if(f)f.click();};}
{const f=$('pmRestoreFileIn'); if(f)f.onchange=()=>{
   const file=f.files&&f.files[0]; if(!file)return;
   const rd=new FileReader();
   rd.onload=()=>{ if($('pmRestoreIn'))$('pmRestoreIn').value=String(rd.result||''); pmApplyRestore(rd.result); };
   rd.onerror=()=>{const m=$('pmDataMsg');m.style.color='var(--down)';m.textContent='파일을 읽지 못했습니다.';};
   rd.readAsText(file); f.value='';
 };}
$('pmSaveSec').onclick=async()=>{
  const pw=$('pmPw').value,a=$('pmAcct').value,m=$('pmSecMsg'),acc=accounts()[currentUser];if(!acc)return;
  const pw2=(($('pmPw2')||{}).value)||'';
  /* ══ [v4.50] 비밀번호 변경 안전장치 ═════════════════════════════════════════
     ① 확인 입력 — 예전에는 새 비밀번호를 한 번만 받았다. 오타가 나면 그대로 저장돼
        본인이 자기 계정에서 잠기고, 서버에도 이미 바뀐 뒤라 되돌릴 방법이 없었다.
     ② 기존과 동일 금지 — '바꿨다'고 안내해 놓고 실제로는 그대로인 상태를 막는다. */
  if(pw){const ck=pwCheck(pw,currentUser,acc.name);
    if(!ck.ok){m.style.color='var(--down)';m.textContent=ck.msg;return;}
    if(pw!==pw2){m.style.color='var(--down)';m.textContent='새 비밀번호가 일치하지 않습니다.';return;}
    if(await pwHash(pw)===acc.pass||legacyHash(pw)===acc.pass){
      m.style.color='var(--down)';m.textContent='지금 쓰는 비밀번호와 다른 것으로 바꿔 주세요.';return;}}
  if(a&&!/^\d{4}$/.test(a)){m.style.color='var(--down)';m.textContent='계좌 비밀번호는 숫자 4자리로 입력해 주세요.';return;}
  if(a&&(/^(\d)\1{3}$/.test(a)||['0123','1234','2345','3456','4567','5678','6789','4321','9876','8765','7654','3210'].includes(a))){
    m.style.color='var(--down)';m.textContent='계좌 비밀번호에 같은 숫자 반복이나 연속된 숫자는 쓸 수 없습니다.';return;}
  if(!pw&&!a){m.style.color='var(--down)';m.textContent='변경할 항목을 입력하세요.';return;}
  const body={action:'profile',id:currentUser,pass:acc.pass};
  if(pw)body.newPass=await pwHash(pw); if(a)body.acctPass=await pwHash(a);
  cloudCall(body);
  if(pw)acc.pass=await pwHash(pw); if(a){const ah=await pwHash(a);acc.acctPass=ah;acctPassHash=ah;const u=store.get('user:'+currentUser)||{};u.acctPass=ah;store.set('user:'+currentUser,u);}
  const accs=accounts();accs[currentUser]=acc;store.set('accounts',accs);
  m.style.color='var(--up)';m.textContent='변경되었습니다.';$('pmPw').value='';$('pmAcct').value='';
  {const e2=$('pmPw2'); if(e2)e2.value=''; const mt=$('pmPwMeter'); if(mt){mt.innerHTML='';mt.hidden=true;}}
};
$('pmBackup').onclick=()=>{$('backupDownload').click();$('pmDataMsg').style.color='var(--up)';$('pmDataMsg').textContent='백업 파일을 저장했습니다.';};
$('pmBackupCopy').onclick=()=>{$('backupCopy').click();$('pmDataMsg').style.color='var(--up)';$('pmDataMsg').textContent='백업 코드를 복사했습니다.';};

/* ===== 계정 백업 / 복원 (다른 주소 이전용) ===== */
function exportAccountData(){
  const accs=store.get('accounts')||{};const users={};
  Object.keys(accs).forEach(id=>{const u=store.get('user:'+id);if(u)users[id]=u;});
  return {v:1,app:'live-stock',ts:Date.now(),accounts:accs,users};
}
function encodeBackup(obj){return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));}
function decodeBackup(code){
  let s=String(code||'').trim();
  try{return JSON.parse(decodeURIComponent(escape(atob(s))));}catch{}
  try{return JSON.parse(s);}catch{}
  return null;
}
function importAccountData(code){
  const d=decodeBackup(code);
  if(!d||!d.accounts||typeof d.accounts!=='object')throw new Error('백업 코드 형식이 올바르지 않습니다.');
  const accs=store.get('accounts')||{};Object.assign(accs,d.accounts);store.set('accounts',accs);
  Object.keys(d.users||{}).forEach(id=>{if(!store.get('user:'+id))store.set('user:'+id,d.users[id]);});
  return Object.keys(d.accounts).length;
}
// 로그인 화면 복원
if($('showRestore'))$('showRestore').onclick=()=>{const b=$('restoreBox');b.hidden=!b.hidden;$('showRestore').textContent='다른 주소·기기에서 쓰던 계정 복원 '+(b.hidden?'▾':'▴');};
if($('doRestore'))$('doRestore').onclick=()=>{
  const m=$('restoreMsg');
  try{const n=importAccountData($('restoreCode').value);m.style.color='var(--up)';m.textContent=`계정 ${n}개 복원 완료! 이제 로그인하세요.`;}
  catch(e){m.style.color='var(--down)';m.textContent=String(e.message||e);}
};
if($('restoreFile'))$('restoreFile').onchange=(e)=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{$('restoreCode').value=rd.result;$('doRestore').click();};rd.readAsText(f);};
// 계좌 화면 백업
if($('backupCopy'))$('backupCopy').onclick=async()=>{
  const code=encodeBackup(exportAccountData());$('backupCode').value=code;
  try{await navigator.clipboard.writeText(code);toast('buy','백업 코드 복사됨','새 주소의 로그인 화면에서 복원하세요');}
  catch{$('backupCode').select();toast('warn','복사 실패','코드를 길게 눌러 직접 복사하세요');}
};
if($('backupDownload'))$('backupDownload').onclick=()=>{
  const data=exportAccountData();const code=encodeBackup(data);$('backupCode').value=code;
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='live증권-백업-'+kstDay()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast('buy','백업 파일 저장됨','파일 또는 코드로 새 주소에서 복원하세요');
};

/* ===== 앱 시작 ===== */
function initApp(){
  // 헤더 유저칩
  safeRun('userChip',()=>{
    const nm=currentUser?(accounts()[currentUser]?.name||currentUser):'';
    if($('uName'))$('uName').textContent=nm;
    if($('uAv'))$('uAv').textContent=avatarOf(nm);
    if($('uChev'))$('uChev').textContent=currentUser?'▾':'로그인';
  });
  // 피드: 관심종목 + 보유종목 + 현재 선택 종목을 모두 실시간 구독
  const codes=Array.from(new Set([...watchlist,...holdings.map(h=>h.code),selected].filter(Boolean)));
  feed=new LiveFeed(codes,{getInterval:quoteIv,active:quoteShouldPoll,onFetch:(n)=>fnBump(n||1),pinned:codes});
  feed.on('status',(s)=>{
    connState=s.online?'on':'off';
    connPaused=!!s.paused;
    renderMktPill();
    renderConnPill();
  });
  feed.on('snapshot',(q)=>applyQuote(q,true));
  feed.on('quote',(q)=>applyQuote(q,false));
  safeRun('feed.start',()=>feed.start());
  try{if(window.__boot&&!window.__b5){window.__b5=1;__boot.step(5);}}catch(e){}   // [v4.9] 입장화면: 시세 연결
  safeRun('feedCodes',syncFeedCodes);   // 보유종목까지 byCode 등록 + 실시간 구독
  safeRun('connPill',renderConnPill);
  safeRun('pollMarket',pollMarket);
  safeRun('pollSectors',pollSectors);
  /* NXT 거래대상 명단을 가장 먼저 확보한다 — 이후 모든 NXT 판별의 근거.
     명단은 분기마다(1/1·4/1·7/1·10/1 프리마켓) 정기 변경되고 수시 매매제외도 생기므로
     주기적으로 다시 받고, 앱을 다시 열 때도 오래됐으면 갱신한다. */
  safeRun('nxtList',()=>{
    loadNxtList(false);
    setInterval(()=>loadNxtList(true),3*60*60*1000);            // 3시간마다
    document.addEventListener('visibilitychange',()=>{          // 앱 복귀 시
      if(document.hidden)return;
      if(Date.now()-(NXTLIST.at||0)>60*60*1000)loadNxtList(true);
    });
  });
  safeRun('nxtPrices',()=>{pollNxtPrices();scheduleNxtPrices();});
  safeRun('exchange',scheduleExchange);
  safeRun('aiBrief',()=>{renderAiBrief();aiSchedule();});
  safeRun('tfSeg',buildTfSeg);
  safeRun('maSeg',buildMaSeg);
  renderAll();
  safeRun('ipo',pollIpo);
  safeRun('cash',()=>{$('cashInput').value=KRW(cash);});
  showView(userPrefs.startView||'home');   // [S2] 시작 화면 설정
  safeRun('onboard',maybeOnboard);          // [H4] 첫 방문 안내
  safeRun('verAuto',autoCheckUpdate);       // [S19] 하루 1회 업데이트 자동 확인
}
/* [수정] 렌더러 하나가 예외를 던지면 그 뒤 전부(pollIpo·showView·예수금 표시까지)가 중단돼
   화면 전체가 '—'로 남았다. 각 렌더러를 격리해 한 곳이 실패해도 나머지는 정상 동작하게 한다. */
function safeRun(label,fn){
  try{ const r=fn(); if(r&&typeof r.then==='function')r.catch(e=>reportErr(label,e)); return r; }
  catch(e){ reportErr(label,e); }
}
/* [추가] 오류가 조용히 삼켜져 화면만 비는 상황을 없애기 위해, 실제 오류를 화면 하단에 표시한다.
   주소 끝에 ?debug=1 을 붙이면 상세(스택)까지 보인다. */
const _errLog=[];
function reportErr(label,e){
  const msg=(e&&e.message)||String(e);
  _errLog.push({label,msg,stack:String((e&&e.stack)||'').split('\n').slice(0,4).join('\n'),t:new Date().toLocaleTimeString('ko-KR')});
  try{console.error('['+label+']',e);}catch(_){}
  renderErrBar();
}
function renderErrBar(){
  if(!_errLog.length)return;
  let bar=document.getElementById('errBar');
  if(!bar){
    bar=document.createElement('div'); bar.id='errBar';
    bar.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#2b1113;border:1px solid #c0392b;color:#ffd7d7;font-size:12px;line-height:1.5;padding:10px 12px;border-radius:10px;max-height:38vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    document.body.appendChild(bar);
  }
  const dbg=/[?&]debug=1/.test(location.search);
  const last=_errLog.slice(-6);
  bar.innerHTML='<b>화면 오류 '+_errLog.length+'건</b> '
    +'<button id="errCopy" style="float:right;margin-left:6px;background:#c0392b;color:#fff;border:0;border-radius:6px;padding:3px 8px;cursor:pointer">복사</button>'
    +'<button id="errClose" style="float:right;background:transparent;color:#ffd7d7;border:1px solid #c0392b;border-radius:6px;padding:3px 8px;cursor:pointer">닫기</button>'
    +last.map(x=>'<div style="margin-top:6px"><code>'+x.t+' · '+x.label+'</code> — '+x.msg
      +(dbg?'<pre style="white-space:pre-wrap;margin:4px 0 0;opacity:.75">'+x.stack+'</pre>':'')+'</div>').join('');
  const cp=document.getElementById('errCopy');
  if(cp)cp.onclick=()=>{const t=_errLog.map(x=>x.t+' ['+x.label+'] '+x.msg+'\n'+x.stack).join('\n\n');
    if(navigator.clipboard)navigator.clipboard.writeText(t); };
  const cl=document.getElementById('errClose');
  if(cl)cl.onclick=()=>{bar.remove();};
}
window.addEventListener('error',(ev)=>{ if(ev&&ev.message){reportErr('window',{message:ev.message+' @'+(ev.filename||'').split('/').pop()+':'+ev.lineno,stack:''}); try{showErrBanner(ev.message);}catch(_){}} });
window.addEventListener('unhandledrejection',(ev)=>{ const r=ev&&ev.reason; const msg=(r&&r.message)||String(r); reportErr('promise',{message:msg,stack:(r&&r.stack)||''}); try{showErrBanner(msg);}catch(_){} });
/* [C3] 오프라인 감지 — 끊기면 배너, 복구되면 자동으로 다시 불러온다 */
function netBanner(show){let b=$('netBanner');
  if(show){if(!b){b=document.createElement('div');b.id='netBanner';b.className='net-banner';b.textContent='네트워크 연결이 끊겼습니다. 복구되면 자동으로 다시 불러옵니다.';document.body.appendChild(b);}b.hidden=false;}
  else if(b)b.hidden=true;}
window.addEventListener('offline',()=>netBanner(true));
window.addEventListener('online',()=>{netBanner(false);try{toast('buy','연결 복구','최신 데이터를 다시 불러옵니다.');}catch(e){}
  safeRun('reconnect',()=>{try{pollMarket();}catch(e){} try{renderWatch();}catch(e){} if(currentView==='pro'&&typeof loadPicks==='function')loadPicks(false);});});
function renderAll(){
  safeRun('portfolio',renderPortfolioNumbers);
  safeRun('home',renderHome);
  safeRun('market',renderMarket);
  safeRun('watch',renderWatch);
  safeRun('holdings',renderHoldings);
  safeRun('search',renderSearch);
  safeRun('detail',renderDetail);
  safeRun('price',()=>syncPriceField(true));
}

/* ===== 라우팅 ===== */
function showView(name){
  try{return _showView(name);}catch(e){console.error('[showView]',e);}
}
function _showView(name){
  currentView=name;
  document.querySelectorAll('.view').forEach(v=>v.hidden=(v.id!=='view-'+name));
  const navName=(name==='ustrade')?'us':name;   // [v4.28] 해외 거래 화면도 '해외 주식' 탭 유지
  document.querySelectorAll('.main-nav button').forEach(b=>b.classList.toggle('on',b.dataset.view===navName));
  document.querySelectorAll('#tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.bv===name));   // 모바일 하단 내비 동기화
  $('mainNav').classList.remove('open');window.scrollTo(0,0);
  {const cta=$('usCta'); if(cta)cta.hidden=(name!=='ustrade');}   // [v4.50] 주문바는 상세에서만
  if(name!=='ustrade'){ try{usChartMount(false);}catch(e){}        // [v4.57] 차트 카드 제자리로
    try{ document.querySelectorAll('#tfSeg [data-tf]').forEach(b=>{b.style.display='';}); }catch(e){} }
  // [수정] 화면별 렌더러가 예외를 던져도 탭 전환 자체는 성공하도록 격리
  if(name==='home'){safeRun('home',renderHome);safeRun('market',renderMarket);safeRun('aiBrief',()=>{renderAiBrief();aiSchedule();});}
  if(name==='watch')safeRun('watch',renderWatch);
  if(name==='sector')safeRun('sector',()=>{setSecTab(secTab);applySectorMkt();});   // [v4.40]
  if(name==='etf'){safeRun('etfLounge',renderEtfLounge);safeRun('etfLoad',loadEtfList);}
  if(name==='us')safeRun('usLounge',renderUsLounge);
  if(name==='ustrade')safeRun('usTrade',renderUsTrade);
  if(name==='pro')safeRun('pro',()=>setProTab(proTab));
  if(name==='search'){
    safeRun('searchEtf',()=>{if(!etfList)loadEtfList();});
    safeRun('searchAll',()=>{if(!stockAll&&!stockLoading)loadStockAll(()=>{if(currentView==='search')renderSearch();}).then(()=>{if(currentView==='search')renderSearch();}).catch(()=>{});});
    safeRun('search',renderSearch);safeRun('hist',renderHist);safeRun('viewHist',renderViewHist);safeRun('short',renderSearchShortcuts);
  safeRun('histWire',()=>{const inp=$('searchInput');
    if(inp&&!inp._histWired){inp._histWired=true;
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')addHistQ(inp.value);});
      inp.addEventListener('input',()=>{if(!inp.value.trim())renderHist();});}});
    safeRun('nxtStatus',loadNxtStatus);}
  if(name==='clan'){safeRun('clan',renderClan);}
  if(name==='friend'){safeRun('friend',renderFriend);}
  if(name==='account'){safeRun('acctbar',renderAcctBar);safeRun('acctfx',renderAcctFx);safeRun('acctsend',renderAcctSend);safeRun('holdings',renderHoldings);safeRun('journal',renderJournal);safeRun('autocard',renderAutoCard);safeRun('inscard',renderInsightCards);safeRun('acctx',renderAcctExtras);
    safeRun('equity',()=>{seedEquityFromTrades();recordEquity();requestAnimationFrame(drawEquity);});
    safeRun('bgList',refreshStockListSoon);
    if(currentView==='home')safeRun('heroeq',drawHeroEq);
    safeRun('acctFeed',syncFeedCodes);   // 보유종목 전부 실시간 구독 보장
    safeRun('cash',()=>{if($('cashInput'))$('cashInput').value=KRW(cash);});}
  if(name==='trade'){safeRun('candles',loadCandles);safeRun('fund',()=>loadFundamentals(selected));
    safeRun('chart',()=>requestAnimationFrame(drawChart));}
}
document.addEventListener('click',(e)=>{const n=e.target.closest('[data-view]');if(n){e.preventDefault();showView(n.dataset.view);}});
$('navToggle').onclick=(e)=>{e.stopPropagation();$('mainNav').classList.toggle('open');};
/* [수정] 이전에는 showView('trade')가 renderDetail·configOrderExchanges·syncPriceField 뒤에 있어서
   그중 하나라도 예외를 던지면 "종목을 눌러도 화면이 안 넘어가는" 증상이 났다.
   → 화면 전환을 가장 먼저 수행하고, 나머지 단계는 전부 개별 격리한다. */
function openTrade(code){
  if(usMeta&&usMeta[code]){ try{openUS(code);}catch(e){} return; }   // [v4.41] 해외는 전용 화면으로
  if(!code)return;
  selected=code;userPrice=null;invExpanded=false;
  safeRun('openTrade:view',()=>showView('trade'));          // ① 무조건 먼저 이동
  safeRun('openTrade:market',()=>resolveMarket(code));
  safeRun('openTrade:hist',()=>{const s0=byCode[code];if(s0&&currentView==='search')addHist(code,s0.name,s0.market);});
  safeRun('openTrade:view',()=>{const s0=byCode[code]||{};viewHist=viewHist.filter(x=>x.code!==code);
    viewHist.unshift({code,name:s0.name||code,market:s0.market||'',t:Date.now()});viewHist=viewHist.slice(0,12);saveViewHist();});
  safeRun('openTrade:feed',()=>{feed&&feed.addCode(code,{pin:true});});
  safeRun('openTrade:quote',()=>ensureQuote(code));
  safeRun('openTrade:nxt',()=>ensureNxt(code));
  safeRun('openTrade:ex',()=>loadExchange(code));
  safeRun('openTrade:acct',()=>renderOrdAcct());          // [v4.56] 주문 계좌 선택
  safeRun('openTrade:detail',()=>renderDetail());
  safeRun('openTrade:exch',()=>configOrderExchanges());
  safeRun('openTrade:price',()=>syncPriceField(true));
  safeRun('openTrade:candles',()=>loadCandles());
  safeRun('openTrade:fund',()=>loadFundamentals(code));
  safeRun('openTrade:etftab',()=>syncEtfTab(code));
  safeRun('openTrade:gate',()=>renderTradeGate());   // [v4.5] 세션 배너
  safeRun('openTrade:flags',()=>{renderAdvFlags();loadStockFlags(code);});   // [v4.9] 심화 정보
}
// ETF일 때만 'ETF정보' 탭을 노출하고, ETF 상세를 미리 불러온다
function syncEtfTab(code){
  etfHoldOpen=false;
  const etf=isFundLike(code),btn=$('tabEtf');
  if(btn)btn.hidden=!etf;
  if(etf){curEtf=etfCache[code]||null;loadEtf(code);}
  else{curEtf=null;if(infoTab==='etf'){infoTab='summary';document.querySelectorAll('.info-tabs button').forEach(x=>x.classList.toggle('on',x.dataset.info==='summary'));}}
}
async function ensureQuote(code){
  if(byCode[code]&&byCode[code].price!=null)return;
  try{const r=await fetch('/api/quote?codes='+code);const j=await r.json();(j.quotes||[]).forEach(q=>applyQuote(q,true));}catch{}
}

/* ===== 실시간 반영 ===== */
/* 관심종목 + 보유종목 + 선택종목을 모두 실시간 피드에 구독시킨다(계좌 시세가 안 바뀌던 문제 해결). */
function syncFeedCodes(){
  if(!feed)return;
  [...watchlist,...holdings.map(h=>h.code),selected].filter(Boolean).forEach(c=>{ ensureStock(c,'',''); feed.addCode(c,{pin:true}); });
}
let _npT=null;
function scheduleNamePaint(){ /* 이름이 늦게 도착하면 보이는 화면만 가볍게 다시 그린다 */
  clearTimeout(_npT);
  _npT=setTimeout(()=>{try{
    if(currentView==='watch')renderWatch();
    if(currentView==='account')renderHoldings();
    if(currentView==='search')renderSearch();
  }catch(e){}},250);
}
/* ===== [주요#3] 인앱 모달 — prompt/confirm 대체 =====
   iOS 홈화면 앱(standalone)에선 prompt 가 차단될 수 있어 폴더 생성이 아예 안 됐다.
   Promise 기반: 확인→값, 취소/ESC/바깥탭→null. */
let _askRes=null;
function _askEl(){
  let ov=$('askOv');
  if(ov)return ov;
  ov=document.createElement('div');ov.id='askOv';ov.className='overlay ask-ov';ov.hidden=true;
  ov.innerHTML=`<div class="modal ask-modal" role="dialog" aria-modal="true">
    <div class="ask-t" id="askTitle"></div><div class="ask-d" id="askDesc" hidden></div>
    <input id="askInput" class="ask-in" hidden>
    <textarea id="askArea" class="ask-in ask-area" rows="4" hidden></textarea>
    <div class="ask-opts" id="askOpts" hidden></div>
    <div class="ask-btns"><button class="ask-cancel" id="askCancel">취소</button><button class="ask-ok" id="askOk">확인</button></div>
  </div>`;
  document.body.appendChild(ov);
  const done=(v)=>{ov.hidden=true;const r=_askRes;_askRes=null;if(r)r(v);};
  $('askOk').onclick=()=>{const inp=$('askInput'),ta=$('askArea');
    done(!inp.hidden?inp.value:!ta.hidden?ta.value:true);};
  $('askCancel').onclick=()=>done(null);
  ov.addEventListener('click',e=>{if(e.target===ov)done(null);});
  ov.addEventListener('keydown',e=>{
    if(e.key==='Escape')done(null);
    if(e.key==='Enter'&&!$('askArea').matches(':focus')){e.preventDefault();$('askOk').click();}
  });
  return ov;
}
function _askShow(cfg){
  const ov=_askEl();
  $('askTitle').textContent=cfg.title||'';
  const d=$('askDesc');d.hidden=!cfg.desc;d.textContent=cfg.desc||'';
  const inp=$('askInput');inp.hidden=cfg.mode!=='text';
  if(cfg.mode==='text'){inp.value=cfg.value||'';inp.placeholder=cfg.placeholder||'';inp.maxLength=cfg.maxLen||30;inp.type=cfg.password?'password':'text';}
  const ta=$('askArea');ta.hidden=cfg.mode!=='area';
  if(cfg.mode==='area'){ta.value=cfg.value||'';ta.placeholder=cfg.placeholder||'';}
  const op=$('askOpts');op.hidden=cfg.mode!=='choice';op.innerHTML='';
  $('askOk').textContent=cfg.okLabel||'확인';
  $('askOk').classList.toggle('danger',!!cfg.danger);
  $('askCancel').hidden=cfg.mode==='choice';
  return new Promise(res=>{
    _askRes=res;
    if(cfg.mode==='choice'){
      (cfg.options||[]).forEach(o=>{
        const b=document.createElement('button');b.className='ask-opt';b.innerHTML=o.label;
        b.onclick=()=>{ov.hidden=true;const r=_askRes;_askRes=null;if(r)r(o.v);};
        op.appendChild(b);});
      $('askOk').hidden=true;
      const c=document.createElement('button');c.className='ask-opt ask-opt-cancel';c.textContent='취소';
      c.onclick=()=>{ov.hidden=true;const r=_askRes;_askRes=null;if(r)r(null);};
      op.appendChild(c);
    }else{$('askOk').hidden=false;}
    ov.hidden=false;
    setTimeout(()=>{if(cfg.mode==='text')inp.focus();if(cfg.mode==='area')ta.focus();},30);
  });
}
function askText(title,opt={}){return _askShow({mode:'text',title,...opt}).then(v=>v==null?null:String(v).trim());}
function askMemo(title,opt={}){return _askShow({mode:'area',title,...opt}).then(v=>v==null?null:String(v));}
function askConfirm(title,desc,opt={}){return _askShow({mode:'confirm',title,desc,okLabel:opt.okLabel||'확인',danger:opt.danger}).then(v=>v===true);}
function askChoice(title,options,desc){return _askShow({mode:'choice',title,desc,options});}

function applyQuote(q,isSnap){
  try{ if(q&&q.code&&byCode[q.code])byCode[q.code]._px_at=Date.now(); }catch(e){}   // [v3.4] 마지막 수신 시각
  try{ pxSnapPut(q); }catch(e){}                                                     // [v3.6] 마지막 시세 스냅샷
  const st=byCode[q.code];if(!st)return;
  /* [수정] 관심종목·보유종목이 '475150 undefined'처럼 코드로만 보이던 문제:
     시세 응답에 들어오는 실제 종목명으로 즉시 백필한다. */
  if(q.name&&(!st.name||st.name===st.code||st.name==='—')){st.name=q.name;scheduleNamePaint();}
  const prevP=st.price;
  st.price=q.price;
  st.prevClose=q.prevClose;st.open=q.open;st.high=q.high;st.low=q.low;st.volume=q.volume;st.value=q.value;
  try{swingWatch(q.code,st);}catch(e){}   // [S12] 보유종목 급변동 알림 (전 필드 갱신 후 판정)
  /* NXT 신호 두 종류를 구분해 저장한다.
       nxtExec  = 실제 NXT 체결가가 관측됨. NXT 회원만 체결될 수 있으므로 '회원 증거'다.
                  → 공식 명단에 없는 분기 중 신규 편입 종목을 잡아내는 용도(추가 전용).
       (공식 명단이 최종 판정이므로 약한 신호는 저장하지 않는다) */
  if(q.nxtLive===true){ st.nxtExec=true; st.nxtPx={price:q.nxtPrice,rate:q.nxtRate,prevClose:q.prevClose||null,t:Date.now()}; }
  if(q.uniPrice)st.uniPx={price:q.uniPrice,prevClose:q.prevClose||null,t:Date.now()};   // [v1.99.2] 폴링이 준 통합가
  try{ checkTargets(q.code); }catch(e){}   // [D3] 목표가 도달 확인
  st.ticks.push({t:Date.now(),p:q.price,v:q.volume||0}); if(st.ticks.length>3000)st.ticks.shift();
  renderPortfolioNumbers();
  if(currentView==='watch')updateWatchRow(q.code);
  else if(currentView==='account')renderHoldings();
  else if(currentView==='search')schedSearchPaint();   // [v3.6] 시세 1건마다 전체 재렌더 → 0.2초 병합
  else if(currentView==='trade'&&q.code===selected){renderDetail();if(isMinute(chartTf)){curCandles=minuteSeries(q.code,minutesOf(chartTf));if(view.follow)view.end=curCandles.length-1;drawChart();}if(curFund&&curFund.code===q.code&&(infoTab==='consensus'||infoTab==='summary'))renderInfo();if(infoTab==='ai')renderAiStock($('infoBody'));}
  // 값이 실제로 바뀌면 현재가에 플래시 효과(실시간 체감)
  if(!isSnap&&prevP!=null&&q.price!=null&&q.price!==prevP&&currentView==='trade'&&q.code===selected){
    const el=$('dPrice');if(el){el.classList.remove('flash-up','flash-dn');void el.offsetWidth;el.classList.add(q.price>prevP?'flash-up':'flash-dn');}
  }
}

/* ===== 서버 호출 보호: 함수 호출 사용량 상한(월/일, 속도설정 연동) ===== */
function fnCapM(){return speedCfg().capM;}
function fnCapD(){return speedCfg().capD;}
function _fbGet(){let b={};try{b=JSON.parse(localStorage.getItem('fnbudget')||'{}')}catch(e){}
  const mon=kstMonth(),day=kstDay();
  if(b.mon!==mon)b={mon,mc:0,day,dc:0};if(b.day!==day){b.day=day;b.dc=0;}return b;}
function fnBump(n=1){const b=_fbGet();b.mc+=n;b.dc+=n;try{localStorage.setItem('fnbudget',JSON.stringify(b))}catch(e){}
  if(fnSafe()&&!window._safeToldToday){window._safeToldToday=true;try{toast('warn','절약 모드 전환','무료 크레딧 보호를 위해 갱신 주기를 늦춥니다. 내일 자동 복구됩니다.');}catch(e){}}}
function fnSafe(){const b=_fbGet();return b.mc>=fnCapM()||b.dc>=fnCapD();}
function fnUsagePct(){const b=_fbGet();return Math.min(100,Math.round(b.mc/fnCapM()*100));}
// 현재 구독 종목 기준으로 시세 폴링이 필요한 시간대인지 판단
/* [수정] NXT 시간대(08:00~20:00)에 시세가 전혀 갱신되지 않던 문제.
   이전 조건은 `byCode[코드].nxt === true` 를 요구했는데, 이 플래그는 종목검색·상세 화면에서만
   채워진다. 앱을 켜자마자 홈/관심종목만 본 경우 관심종목의 nxt가 undefined라서
   anyNxt === false → 폴링이 한 번도 돌지 않았다(헤더에 계속 '갱신 대기').
   → NXT 정규 운영시간이면 폴링을 켜고, nxt 플래그는 백그라운드로 채운다. */
/* [v3.9] 시세가 실제로 변하는 시간 — 폴링·갱신 판단의 기준.
   정규장뿐 아니라 동시호가(예상체결가가 계속 바뀐다)와 시간외 단일가도 포함된다. */
function krPriceLive(){const k=krSession();return k.krx.tradable||k.nxt.tradable;}
function quoteShouldPoll(){
  if(krxRegularOpen())return true;                       // KRX 정규장: 모든 종목
  /* [v3.9 · 회귀 수정] NXT 휴지(08:50~09:00)를 도입하면서 그 10분 동안 폴링이 통째로
     멎었다. 하필 개장 직전 동시호가라 예상체결가가 가장 크게 움직이는 구간이다.
     KRX 동시호가·시간외도 값이 변하므로 폴링을 켠다. */
  if(krSession().krx.tradable)return true;
  if(nxtActive()){                                       // NXT 프리·애프터마켓
    const codes=[...new Set([...watchlist,selected])].filter(Boolean);
    const unknown=codes.filter(c=>!byCode[c]||byCode[c].nxt===undefined||byCode[c].nxt===null);
    if(unknown.length)ensureNxtBatch(unknown);           // 플래그를 채워 두되, 기다리지 않는다
    return true;
  }
  return false;
}
// NXT 시간대는 KRX 정규장보다 체결이 뜸하므로 조금 느린 주기를 쓴다(호출 절약)
function nxtOnlyWindow(){try{if(window.__NXTWIN)return true;}catch(e){} return !krxRegularOpen()&&nxtActive();}
function marketShouldPoll(){return krxRegularOpen()||usMarketOpen();} // 지수가 실제 움직이는 시간
// 일 사용량에 따라 단계적으로 속도를 낮춰 하루치 예산이 오래 가도록(월/일 한도 초과 방지)
function budgetTier(){const b=_fbGet();if(b.mc>=fnCapM()||b.dc>=fnCapD())return 3;const r=b.dc/fnCapD();return r<0.5?0:r<0.8?1:2;}
// 장중: 빠르게(단계적) / 마감·주말·휴장: 폴링 일시중단(느린 확인만)
/* NXT 시간대 보완 폴링 — KRX 시세(0.00%) 위에 NXT 체결가를 덧씌운다.
   대상은 화면에 실제로 보이는 종목(관심종목 + 선택 종목)으로 제한해 호출을 아낀다. */
let nxtPxTimer=null, nxtPxBusy=false;
const nxtPx={};                       // code -> {price,change,rate,prevClose}
async function pollNxtPrices(){
  if(nxtPxBusy||document.hidden)return;
  if(!nxtOnlyWindow())return;
  const codes=[...new Set([...watchlist,selected])].filter(Boolean).filter(c=>nxtCapability(c)!==false).slice(0,20);
  if(!codes.length){nxtPxBusy=false;return;}
  nxtPxBusy=true;
  try{
    fnBump();
    const r=await fetch('/api/nxtquote?codes='+codes.join(','),{cache:'no-store'});
    const j=await r.json();
    let n=0;
    ((j&&j.quotes)||[]).forEach(q=>{
      if(!q||!q.code||!q.price)return;
      if(nxtCapability(q.code)===false)return;         // KRX 전용엔 절대 NXT값을 얹지 않는다
      /* [수정] 깜빡임(가격이 떴다가 0%가 되는 현상)의 근본 원인 제거.
         예전엔 여기서 st.price/st.prevClose 를 NXT 값으로 '덮어썼는데',
         바로 뒤이어 도는 KRX 폴링이 같은 자리를 다시 KRX 값(프리마켓엔 전일종가)으로
         되돌려 0.00% ↔ 실제등락률 이 번갈아 보였다.
         이제 원본(KRX)은 st 에 그대로 두고, NXT 값은 nxtPx 에만 담는다.
         화면 표시는 dispQuote() 가 두 값을 합쳐 결정한다(단일 창구). */
      nxtPx[q.code]={price:q.price,change:q.change,rate:q.rate,prevClose:q.prevClose,volume:q.volume,t:Date.now()};
      n++;
    });
    if(n){safeRun('nxtRender',()=>{renderWatch();if(currentView==='trade')renderDetail();renderPortfolioNumbers();});}
  }catch(e){}
  nxtPxBusy=false;
}
/* [추가] 목록 화면(종목검색 순위·테마 구성종목)에서도 프리마켓 시세를 보여 준다.
   NXT 취급 종목만 조회하고, KRX 전용 종목은 그대로 0.00%로 남긴다. */
const nxtListBusy={};
async function primeNxtQuotes(codes){
  if(!nxtOnlyWindow())return;
  const want=[...new Set(codes)].filter(c=>{
    if(!c||nxtListBusy[c])return false;
    if(nxtCapability(c)===false)return false;        // KRX 전용은 건드리지 않는다
    const cur=nxtPx[c];
    return !cur||(Date.now()-(cur.t||0))>8000;
  }).slice(0,32);
  if(!want.length)return;
  want.forEach(c=>nxtListBusy[c]=true);
  try{
    fnBump();
    const r=await fetch('/api/nxtquote?codes='+want.join(','),{cache:'no-store'});
    const j=await r.json();
    let n=0;
    ((j&&j.quotes)||[]).forEach(q=>{
      if(!q||!q.code||!q.price)return;
      nxtPx[q.code]={price:q.price,change:q.change,rate:q.rate,prevClose:q.prevClose,t:Date.now()};
      /* [삭제] 예전엔 여기서 시세가 잡히면 nxt=true 로 단정했다.
         체결가처럼 보이는 값(예상체결가 등)이 잡히기만 해도 NXT 가능이 되어
         KRX 전용 종목을 오염시켰다. 취급 여부는 명단만 결정한다. */
      n++;
    });
    // 응답이 없던 코드는 NXT 미체결로 표시(취급 여부는 /api/nxt 가 판단)
    want.forEach(c=>{ if(!nxtPx[c])nxtPx[c]={price:null,t:Date.now()}; });
    if(n){safeRun('nxtList',()=>{
      if(currentView==='search')renderSearch();
      else if(currentView==='sector'&&thmOpen)renderThemeDetail(thmOpen);
      else if(currentView==='home'){safeRun('mysum',renderMySum);safeRun('mysumtidy',tidyMySum);if(calDetailOpen!=null)renderCalEvents();}
      renderWatch();
    });}
  }catch(e){}
  want.forEach(c=>{delete nxtListBusy[c];});
}

/* 화면에 표시할 대표 시세 — NXT 시간대에는 NXT 체결가, 그 외에는 KRX */
/* 화면 표시 대표 시세 — [v1.99.2] 규칙 확정판(스크린샷 재발 방지):
     · KRX 전용 종목  → 항상 하늘색 KRX
     · NXT 종목       → NXT 단독 라이브(프리 08~09 · 애프터 15:40~20:00) 체결 중엔 핑크 NXT,
                        정규장(09:00~15:30)엔 KRX(폴링가가 곧 최신),
                        그 외 모든 시간(마감 후·주말 포함)엔 남색 '통합'.
       통합가 소스 사슬(전부 배치 폴링 기반 — 종목을 클릭하지 않아도 채워진다):
       ①폴링 통합가(uniPx) ②폴링 NXT 마지막 체결가(nxtPx 스냅샷, 애프터 종가≒통합 최종가)
       ③라이브 창에서 받아 둔 nxtPx 맵 ④종목 상세 캐시(exCache) ⑤그래도 없으면 KRX값+KRX 라벨(정직) */
function dispQuote(code){
  const st=byCode[code];
  if(!st)return null;
  /* [v4.41] 해외 종목은 NXT·정규장 판정 대상이 아니다 — 달러 시세를 그대로 돌려준다.
     이 한 줄로 관심종목·홈 요약·검색 등 dispQuote 를 쓰는 모든 화면이 해외를 지원한다. */
  if(st.us||usMeta[code])return {price:st.price,prevClose:st.prevClose,src:'US',us:1};
  const base={price:st.price,prevClose:st.prevClose,src:'KRX'};
  const cap=nxtCapability(code);
  if(cap===false)return {...base,src:'KRXONLY'};
  if(nxtOnlyWindow()){
    const n=nxtPx[code];
    if(n&&n.price&&n.prevClose)return {price:n.price,prevClose:n.prevClose,src:'NXT'};
  }
  if(!krxRegularOpen()){
    const FRESH=14*3600e3;                                   // 아침 데이터 리셋 전까지만 유효
    const u=st.uniPx;
    if(u&&u.price&&(u.prevClose||st.prevClose)&&Date.now()-(u.t||0)<FRESH)
      return {price:u.price,prevClose:u.prevClose||st.prevClose,src:'통합'};
    const nl=st.nxtPx;
    if(!nxtOnlyWindow()&&nl&&nl.price&&(nl.prevClose||st.prevClose)&&Date.now()-(nl.t||0)<FRESH)
      return {price:nl.price,prevClose:nl.prevClose||st.prevClose,src:'통합'};
    const n3=nxtPx[code];
    if(n3&&n3.price&&n3.prevClose&&Date.now()-(n3.t||0)<FRESH)
      return {price:n3.price,prevClose:n3.prevClose,src:'통합'};
    const u2=(typeof unifiedQuote==='function')?unifiedQuote(code):null;
    if(u2&&u2.price)return {price:u2.price,prevClose:u2.prevClose||st.prevClose,src:'통합'};
  }
  return base;
}
/* [B2] 등락률 계산 단일 창구 — 모든 화면이 이걸 쓴다. 프리마켓엔 dispQuote 가 NXT 체결가를 얹는다. */
function chgPct(s){
  if(!s)return null;
  const q=(typeof dispQuote==='function')?dispQuote(s.code):null;
  const p=q&&q.price!=null?q.price:s.price, pv=q&&q.prevClose?q.prevClose:s.prevClose;
  if(p==null||!pv)return null;
  return (p-pv)/pv*100;
}
function dispRate(code){
  const q=dispQuote(code);
  if(!q||q.price==null||!q.prevClose)return null;
  return {rate:(q.price-q.prevClose)/q.prevClose*100, price:q.price, src:q.src};
}

function scheduleNxtPrices(){
  clearTimeout(nxtPxTimer);
  nxtPxTimer=setTimeout(()=>{safeRun('nxtPoll',pollNxtPrices);scheduleNxtPrices();}, nxtOnlyWindow()?6000:60000);
}

function quoteIv(){ if(!quoteShouldPoll())return 60000;
  const base=speedCfg().q[budgetTier()];
  return nxtOnlyWindow()?Math.max(base,4000):base; }
function marketIv(){ if(!marketShouldPoll())return budgetTier()===3?600000:300000; return speedCfg().m[budgetTier()]; }
function sectorIv(){ if(!krxRegularOpen())return 600000; return [60000,90000,180000,600000][budgetTier()]; }

/* ===== 지수/환율 ===== */
let _mktBusy=false;
function scheduleMarket(){clearTimeout(window._mktT);window._mktT=setTimeout(pollMarket,marketIv());}
async function pollMarket(){
  if(_mktBusy||document.hidden){scheduleMarket();return;} // 진행 중·백그라운드면 이번 회차 건너뛰고 다음 예약
  _mktBusy=true;
  try{fnBump();
    const [r,rf]=await Promise.all([fetch('/api/market',{cache:'default'}),fetch('/api/fx',{cache:'default'}).catch(()=>null)]);
    const j=await r.json();
    if(j.ok){market.indices=j.indices||[];market.crypto=j.crypto||[];if(!fxData.length)market.fx=j.fx||[];
      /* [v3.2] 서버 자가진단 보관 — 빈 지수·이상 등락률·야간선물 기준을 콘솔에서 확인 가능.
         야간선물을 못 받은 날은 카드가 아예 안 뜨므로, 왜 없는지는 여기서 본다. */
      idxHealth={health:j._health||null,futDiag:j._futDiag||null,at:new Date().toLocaleString('ko-KR')};
      if(j._health&&j._health.suspect&&j._health.suspect.length)
        console.warn('[지수 점검] 등락률이 비정상적으로 큰 지수:',j._health.suspect.join(', '));
    }
    /* [수정] 환율은 전용 API(/api/fx)에서 실시간으로 받는다.
       기존엔 ECB 일별 데이터(frankfurter)만 써서 값이 자주 비어 '— 0.00%'로 표시됐다. */
    try{const jf=rf?await rf.json():null;
      if(jf&&jf.ok&&Array.isArray(jf.fx)&&jf.fx.length){
        fxData=jf.fx;fxOpen=!!jf.open;fxAt=jf.at||Date.now();
        const NM={USD:'원/달러',JPY:'원/엔(100)',EUR:'원/유로'};
        market.fx=jf.fx.filter(x=>NM[x.key]).map(x=>({key:x.key+'KRW',name:NM[x.key],price:x.price,change:x.change,rate:x.rate,history:x.history||[],tag:'환율'}));
      }}catch{}
    if(currentView==='home')renderMarket();}catch{}
  finally{_mktBusy=false;scheduleMarket();}
}
function drawSpark(cv,hist,dir){
  if(userPrefs.dataSaver){if(cv){const c2=cv.getContext&&cv.getContext('2d');if(c2)c2.clearRect(0,0,cv.width,cv.height);}return;}   // [S7] 절약 모드
  if(!cv||!hist||hist.length<2)return;
  const dpr=window.devicePixelRatio||1,w=cv.clientWidth||200,h=cv.clientHeight||46;
  cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const min=Math.min(...hist),max=Math.max(...hist),rng=(max-min)||1;
  const X=i=>i/(hist.length-1)*w,Y=v=>h-3-((v-min)/rng)*(h-8);
  const col=dir==='up'?UP:dir==='down'?DOWN:'#8a95a5';
  c.beginPath();hist.forEach((v,i)=>{const x=X(i),y=Y(v);i?c.lineTo(x,y):c.moveTo(x,y);});
  const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,col+'40');g.addColorStop(1,col+'00');
  c.lineTo(w,h);c.lineTo(0,h);c.closePath();c.fillStyle=g;c.fill();
  c.beginPath();hist.forEach((v,i)=>{const x=X(i),y=Y(v);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=col;c.lineWidth=1.6;c.lineJoin='round';c.stroke();
}

/* ===== ETF 라운지 ===== */
let etfList=null,etfLoading=false;
let etfTab='ALL',etfSort='marketSum',etfQuery='',etfLimit=30;
const ETF_TABS=[['ALL','전체'],[1,'국내 시장지수'],[2,'국내 업종·테마'],[4,'해외 주식'],[6,'채권'],[5,'원자재'],[3,'국내 파생'],[7,'기타']];
const ETF_SORTS=[['marketSum','순자산순'],['changeRate','등락률순'],['m3','3개월 수익률순'],['value','거래대금순']];
let etfError=false;
async function loadEtfList(){
  if(etfList||etfLoading)return etfList;
  etfLoading=true;etfError=false;
  // [수정] 1회 실패로 목록이 영원히 비어 보이던 문제 → 재시도 + 실패 표시
  for(let attempt=0;attempt<2&&!etfList;attempt++){
    try{fnBump();const r=await fetch('/api/etflist',{cache:'default'});const j=await r.json();
      const items=(j&&j.items)||[];
      if(items.length){etfList=items;break;}
    }catch(e){}
    if(attempt===0)await new Promise(rs=>setTimeout(rs,800));
  }
  if(!etfList){etfList=[];etfError=true;}
  etfLoading=false;
  if(currentView==='etf')renderEtfLounge();
  return etfList;
}
function etfFiltered(){
  let l=(etfList||[]).slice();
  if(etfTab!=='ALL')l=l.filter(x=>x.tabCode===etfTab);
  const q=etfQuery.trim().toLowerCase().replace(/\s+/g,'');
  if(q)l=l.filter(x=>(x.name||'').toLowerCase().replace(/\s+/g,'').includes(q)||String(x.code).toLowerCase().includes(q));
  const key=etfSort;
  l.sort((a,b)=>{const av=a[key],bv=b[key];
    if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1; return bv-av;});
  return l;
}
/* ══ [v4.10] ETF 목록 전면 리뉴얼 ═════════════════════════════════════════
   [무엇이 잘못됐나] 이름 셀이 flex-wrap 이라 로고 확대(v4.8) 이후 배지·코드가
   제멋대로 줄바꿈되며 행 높이가 폭주했고, 이름은 "TIGER 미국…"으로 잘리고
   분류는 "국내 시 장지수"처럼 단어 중간에서 꺾였다(첨부 사진).
   [새 설계] 고정 7열 그리드 한 행 = 딱 두 줄:
     [순위][로고][ 이름줄(전체·말줄임) + 코드·분류 보조줄 ][현재가][등락][3개월][순자산]
   이름 칸이 남는 폭을 전부 가져가 긴 ETF명도 온전히 보이고, 행 높이가 일정해
   화면당 표시 밀도가 3배 이상 올라간다. */
/* ══ [v4.61] ETF 로고 — 운용사별 색 + 약자 ═════════════════════════════════
   [무엇이 문제였나] ETF 도 일반 종목과 같은 로고 탐색을 태웠는데, 운용사 CI 이미지가
   대부분 '단색 사각형'이라 화면에는 색깔 네모만 줄줄이 남았다. 게다가 이미지가
   로드되면 글자를 숨기게 되어 있어(.lgo.on i{opacity:0}) 약자마저 사라졌다.
   → ETF 는 이미지 탐색을 아예 쓰지 않고, 운용사 고유색 위에 약자를 새긴다.
     KODEX 와 TIGER 가 한눈에 구분되는 게 로고의 목적이다. */
var ETF_BRAND={
  'KODEX':      ['KDX', '#0b3d91'],   // 삼성자산운용
  'TIGER':      ['TGR', '#e8500f'],   // 미래에셋
  'RISE':       ['RSE', '#00a19c'],   // KB
  'SOL':        ['SOL', '#f5a300'],   // 신한
  'ACE':        ['ACE', '#1f4fd8'],   // 한국투자
  'PLUS':       ['PLS', '#7b3fe4'],   // 한화
  'KOSEF':      ['KSF', '#0f7b3f'],   // 키움
  'HANARO':     ['HNR', '#c0142d'],   // NH아문디
  'ARIRANG':    ['ARI', '#00509d'],   // 한화(구)
  'TIMEFOLIO':  ['TMF', '#111827'],
  'KIWOOM':     ['KWM', '#0f7b3f'],
  'WOORI':      ['WOO', '#0069b4'],
  'BNK':        ['BNK', '#e2231a'],
  '히어로즈':    ['HRZ', '#5b21b6'],
  '마이다스':    ['MDS', '#b45309'],
  '마이티':      ['MTY', '#be123c'],
  '파워':        ['PWR', '#1e40af'],
  'FOCUS':      ['FCS', '#0891b2'],
  '트루':        ['TRU', '#4d7c0f'],
  '한투':        ['KIM', '#1f4fd8'],
  '삼성':        ['SSA', '#0b3d91'],
  '미래에셋':    ['MAM', '#e8500f']
};
function etfBrandOf(name){
  const n=String(name||'').trim().toUpperCase();
  for(const k in ETF_BRAND){ if(n.startsWith(k.toUpperCase()))return {key:k,ab:ETF_BRAND[k][0],col:ETF_BRAND[k][1]}; }
  /* 표에 없는 운용사 — 첫 낱말을 약자로 쓰고, 이름 해시로 색을 정해 서로 구분되게 한다 */
  const w=String(name||'').trim().split(/\s+/)[0]||'ETF';
  const ab=/[가-힣]/.test(w[0])?w.slice(0,2):w.slice(0,3).toUpperCase();
  let h=0; for(let i=0;i<w.length;i++)h=(h*31+w.charCodeAt(i))>>>0;
  const pal=['#0b3d91','#e8500f','#00a19c','#7b3fe4','#0f7b3f','#c0142d','#b45309','#5b21b6','#0891b2','#be123c'];
  return {key:w,ab,col:pal[h%pal.length]};
}
function etfLogo(name,size){
  const b=etfBrandOf(name);
  const cls='lgo etf-lg'+(size?' '+size:'')+(b.ab.length>=3?' t3':'');
  return `<span class="${cls}" style="--lgc:${b.col}" title="${htmlEsc(b.key)}"><i aria-hidden="true">${htmlEsc(b.ab)}</i></span>`;
}
function etfRowHtml(x,rank){
  const dir=dirOf(x.changeRate),d3=dirOf(x.m3);
  const lev=x.lev!==1?`<span class="etf-lev ${x.lev<0?'inv':'up'}">${x.lev>0?'+':''}${x.lev}배</span>`:'';
  return `<div class="etf-row" data-code="${x.code}">
    <span class="rk num">${rank}</span>
    ${etfLogo(x.name,'sm')}
    <span class="c1"><span class="e2-nm"><b>${x.name}</b>${lev}<span class="etf-brand">${x.brand}</span></span>
      <span class="e2-sub num">${x.code} · ${x.tab}</span></span>
    <span class="c2 num">${x.price!=null?KRW(x.price):'—'}</span>
    <span class="c3 num ${dir}">${x.changeRate!=null?arrow(dir)+' '+pctS(x.changeRate):'—'}</span>
    <span class="c4 num ${d3}">${x.m3!=null?pctS(x.m3):'—'}</span>
    <span class="c5 num">${eokWon(x.marketSum)}</span>
  </div>`;
}
function renderEtfHero(){
  const el=$('etfHero');if(!el)return;
  const l=(etfList||[]).filter(x=>x.changeRate!=null);
  if(!l.length){el.innerHTML='<div class="empty">ETF 정보를 불러오는 중…</div>';return;}
  const top=l.slice().sort((a,b)=>b.changeRate-a.changeRate).slice(0,3);
  const bot=l.slice().sort((a,b)=>a.changeRate-b.changeRate).slice(0,3);
  const big=l.slice().sort((a,b)=>(b.marketSum||0)-(a.marketSum||0)).slice(0,3);
  const m3=l.filter(x=>x.m3!=null).sort((a,b)=>b.m3-a.m3).slice(0,3);
  const card=(title,sub,rows,fmt)=>`<div class="etf-hero-card"><div class="ehc-t">${title}<span>${sub}</span></div>
    ${rows.map((x,i)=>`<div class="ehc-r" data-code="${x.code}"><span class="ehc-n">${i+1}. ${x.name}</span><span class="ehc-v num ${fmt(x).cls}">${fmt(x).txt}</span></div>`).join('')}</div>`;
  el.innerHTML=
    card('상승 TOP 3','오늘',top,x=>({txt:pctS(x.changeRate),cls:dirOf(x.changeRate)}))+
    card('하락 TOP 3','오늘',bot,x=>({txt:pctS(x.changeRate),cls:dirOf(x.changeRate)}))+
    card('3개월 수익률 TOP 3','최근 3개월',m3,x=>({txt:pctS(x.m3),cls:dirOf(x.m3)}))+
    card('순자산 TOP 3','규모',big,x=>({txt:eokWon(x.marketSum),cls:''}));
  el.querySelectorAll('.ehc-r').forEach(r=>r.onclick=()=>etfOpen(r.dataset.code));
}
function etfOpen(code){
  const x=(etfList||[]).find(y=>y.code===code);
  if(x){ensureStock(x.code,x.name,'','ETF');feed&&feed.addCode(x.code);}
  openTrade(code);
}
function renderEtfLounge(){
  const cnt=$('etfCount');
  if(cnt)cnt.textContent=etfList?`· 총 ${etfList.length.toLocaleString()}종목`:'';
  // 탭/정렬 칩
  const tabs=$('etfTabs');
  if(tabs)tabs.innerHTML=ETF_TABS.map(([v,l])=>`<button class="${etfTab===v?'on':''}" data-t="${v}">${l}</button>`).join('');
  const sorts=$('etfSorts');
  if(sorts)sorts.innerHTML=ETF_SORTS.map(([v,l])=>`<button class="${etfSort===v?'on':''}" data-s="${v}">${l}</button>`).join('');
  safeRun('etfHero',renderEtfHero);   // [수정] 히어로에서 예외가 나도 아래 목록은 반드시 그린다
  const rows=$('etfRows');if(!rows)return;
  if(!etfList){rows.innerHTML='<div class="empty">ETF 목록을 불러오는 중…</div>';loadEtfList();return;}
  const l=etfFiltered();
  if(!l.length){
    rows.innerHTML=etfError
      ?'<div class="empty">ETF 목록을 불러오지 못했습니다. <button class="etf-more" id="etfRetry">다시 시도</button></div>'
      :'<div class="empty">조건에 맞는 ETF가 없습니다.</div>';
    const eb=$('etfRetry');if(eb)eb.onclick=()=>{etfList=null;etfError=false;renderEtfLounge();};
    $('etfMoreRows').hidden=true;return;}
  // [수정] 특정 종목 한 건이 예외를 내면 목록 전체가 비던 문제 → 행 단위로 격리
  rows.innerHTML=l.slice(0,etfLimit).map((x,i)=>{
    try{return etfRowHtml(x,i+1);}catch(e){console.error('[etfRow]',x&&x.code,e);
      return `<div class="etf-row" data-code="${(x&&x.code)||''}"><span class="rk num">·</span><span class="lgo sm"></span><span class="c1"><span class="e2-nm"><b>${(x&&x.name)||'표시 오류'}</b></span><span class="e2-sub num">${(x&&x.code)||''}</span></span><span class="c2 num">—</span><span class="c3 num">—</span><span class="c4 num">—</span><span class="c5 num">—</span></div>`;}
  }).join('');
  const more=$('etfMoreRows');
  if(more){more.hidden=l.length<=etfLimit;more.textContent=`더보기 (${Math.min(etfLimit,l.length).toLocaleString()} / ${l.length.toLocaleString()})`;}
  rows.querySelectorAll('.etf-row').forEach(r=>r.onclick=()=>etfOpen(r.dataset.code));
  if(tabs)tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{etfTab=b.dataset.t==='ALL'?'ALL':Number(b.dataset.t);etfLimit=30;renderEtfLounge();});
  if(sorts)sorts.querySelectorAll('button').forEach(b=>b.onclick=()=>{etfSort=b.dataset.s;etfLimit=30;renderEtfLounge();});
  if(more)more.onclick=()=>{etfLimit+=50;renderEtfLounge();};
}

/* ===== 시장 세션 상세 판별 =====
   KRX 정규장뿐 아니라 동시호가·시간외·NXT(넥스트레이드) 세션까지 구분해 표시한다. */
function marketSession(){
  const t=nowTz('Asia/Seoul'), hm=t.hm;
  const iso=tzDateIso('Asia/Seoul');
  if(t.wd===0||t.wd===6)return {label:'휴장',sub:'주말',tone:'off'};
  let hol=null; try{hol=KR_HOLIDAYS[iso];}catch(e){hol=null;}
  if(hol)return {label:'휴장',sub:hol,tone:'off'};
  const sp=krSpecialLabel(), sh=krShift();
  const M=(h,m)=>h*60+m+sh;      // [v4.2] 특례일이면 모든 경계를 뒤로 민다
  /* [v3.8] 15:30 에 정규장이 끝났다는 사실을 그 순간부터 라벨 앞에 못 박는다.
     예전엔 시간외 세션 이름만 바뀌며 흘러가서, 18:00 에야 끝난 것처럼 느껴졌다. */
  if(hm<M(8,0))   return {label:'장 시작 전',sub:'KRX 08:30 · NXT 08:00 개시',tone:'off'};
  if(hm<M(8,30))  return {label:'NXT 프리마켓',sub:'08:00~08:50 지정가만 · KRX는 08:30부터',tone:'pre'};
  if(hm<M(8,40))  return {label:'장전 시간외 종가',sub:'08:30~08:40 전일 종가 체결 · 동시호가 접수 중',tone:'pre'};
  if(hm<M(9,0))   return {label:'장 시작 동시호가',sub:'08:30~09:00 접수 → 09:00 시가 결정',tone:'pre'};
  if(hm<M(15,20)) return {label:'KRX 정규장',sub:'09:00~15:20 접속매매 · NXT 메인마켓(09:00:30~) 동시 진행',tone:'on'};
  if(hm<M(15,30)) return {label:'장 마감 동시호가',sub:'15:20~15:30 → 15:30 종가 결정 · NXT 휴지',tone:'on'};
  if(hm<M(15,40)) return {label:'정규장 마감 · NXT 애프터 단일가',sub:'15:30~15:40 호가 접수 → 15:40 체결 · KRX 시간외는 15:40부터',tone:'aft'};
  if(hm<M(16,0))  return {label:'정규장 마감 · 시간외 종가',sub:'15:40~16:00 당일 종가 체결 · NXT 애프터',tone:'aft'};
  if(hm<M(18,0))  return {label:'정규장 마감 · 시간외 단일가',sub:'16:00~18:00 10분 단위 · NXT 애프터',tone:'aft'};
  if(hm<M(20,0))  return {label:'정규장 마감 · NXT 애프터',sub:'KRX 전 세션 종료 · NXT ~20:00',tone:'aft'};
  return {label:'장 종료',sub:(sp?sp+' · ':'')+'KRX·NXT 전 세션 종료 · 다음 영업일 08:00 재개',tone:'off'};
}
/* [v3.8] 헤더 배지를 누르면 국내 주식 거래시간 전체를 표로 보여 준다 */
function openHoursSheet(){
  let ov=$('hrOv');
  if(!ov){ov=document.createElement('div');ov.className='overlay';ov.id='hrOv';document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.hidden=true;});}
  const k=krSession(),M=(h,m)=>h*60+m,hm=k.hm;
  const on=(a,b)=>k.day&&hm>=a&&hm<b?' now':'';
  /* [v4.1] NXT 행은 초 단위로 판정한다 — 메인마켓이 09:00:30 에 열리므로
     분 단위로 보면 09:00:00~09:00:29 에도 '진행 중'으로 잘못 표시됐다. */
  const T=(h,m,sec)=>h*3600+m*60+(sec||0), S=k.hms;
  const onS=(a,b)=>k.day&&S>=a&&S<b?' now':'';
  const R=(t,nm,d,cls)=>`<tr class="${cls}"><td class="hr-t">${t}</td><td><b>${nm}</b><div class="hr-d">${d}</div></td></tr>`;
  ov.innerHTML=`<div class="cc-box"><div class="cc-h"><b>국내 주식 거래시간</b><button class="cc-x" id="hrX">✕</button></div>
    <div class="cc-body">
      ${k.special?`<div class="hr-sp">⏰ 오늘은 <b>${k.special}</b> — 아래 시간이 모두 ${k.shift}분씩 뒤로 밀립니다</div>`:""}<div class="hr-now">지금 <b>${marketSession().label}</b><div class="hr-d">${marketSession().sub}</div></div>
      <div class="cc-sec">KRX 한국거래소</div>
      <table class="hr-tb"><tbody>
      ${R('08:30~08:40','장전 시간외 종가','전일 종가로 체결',on(M(8,30),M(8,40)))}
      ${R('08:30~09:00','장 시작 동시호가','주문을 모아 09:00 시가를 단일가로 결정',on(M(8,30),M(9,0)))}
      ${R('09:00~15:20','정규장 접속매매','실시간 체결',on(M(9,0),M(15,20)))}
      ${R('15:20~15:30','장 마감 동시호가','15:30 종가를 단일가로 결정',on(M(15,20),M(15,30)))}
      ${R('15:40~16:00','장후 시간외 종가','당일 종가로 체결',on(M(15,40),M(16,0)))}
      ${R('16:00~18:00','시간외 단일가','10분 단위 · 당일 종가 ±10% (가격제한폭 내)',on(M(16,0),M(18,0)))}
      </tbody></table>
      <div class="cc-sec">NXT 넥스트레이드</div>
      <table class="hr-tb"><tbody>
      ${R('08:00~08:50','프리마켓','KRX보다 30분 일찍 시작 · 지정가 주문만',onS(T(8,0),T(8,50)))}
      ${R('09:00:30~15:20','메인마켓','KRX 시가 형성을 기다려 30초 늦게 개시 · SOR이 유리한 쪽으로 배분',onS(T(9,0,30),T(15,20)))}
      ${R('15:30~15:40','애프터마켓 단일가','호가만 접수하고 15:40에 체결',onS(T(15,30),T(15,40)))}
      ${R('15:40~20:00','애프터마켓 경쟁매매','저녁 8시까지 · 지정가 주문만',onS(T(15,40),T(20,0)))}
      </tbody></table>
      <div class="hr-note">NXT는 <b>08:50~09:00:30</b>과 <b>15:20~15:30</b>에 쉽니다. KRX가 시가·종가를 단일가로 정하는 시간과 겹치지 않게 하기 위해서예요.<br>
      NXT에서 거래되는 종목은 <b>KRX 시간외 단일가(16:00~18:00)를 이용할 수 없습니다</b> — 그 시간엔 NXT 애프터마켓으로 주문하세요.<br>
      프리마켓과 애프터마켓은 지정가 주문만 받고, 가격제한폭은 KRX와 같은 전일 종가 ±30%입니다.<br>
      토·일과 공휴일은 양쪽 모두 휴장입니다.</div>
    </div></div>`;
  ov.hidden=false;
  $('hrX').onclick=()=>{ov.hidden=true;};
}
function renderMktPill(){
  const el=$('mktPill');if(!el)return;
  if(!el._hb){el._hb=1;el.style.cursor='pointer';el.onclick=openHoursSheet;}
  const s=marketSession();
  /* ══ [v4.32] 장 상태 알림판을 국내·해외 통합으로 ═══════════════════════════
     해외 주식을 넣고도 이 배지는 국내 장만 보고 있었다. 한국이 마감이어도 미국이
     열려 있으면 '거래할 수 있는 시장'이 있는 것이므로, 둘을 함께 보여 준다.
     국내가 열려 있으면 국내를 앞세우고, 국내가 닫혔는데 미국이 열렸으면 미국을 앞세운다. */
  let us=null; try{ us=usSession(); }catch(e){}
  const krOn=s.tone==='on';
  const usOn=us&&(us.phase==='regular'||us.phase==='pre'||us.phase==='after');
  const usShort=us?{regular:'미국 정규장',pre:'미국 프리마켓',after:'미국 애프터',closed:'미국 휴장'}[us.phase]:'';
  let label,dot,title;
  if(krOn){ label=s.label+(usOn?' · '+usShort:''); dot='on';
    title=(s.sub||'')+(us?` / ${usShort}${us.phase==='closed'?' · 다음 개장 '+us.next:''}`:''); }
  else if(usOn){ label=usShort; dot=us.phase==='regular'?'on':'idle';
    title=`국내 ${s.label} / 미국 ${us.label} · 정규장 ${us.kst.open}~${us.kst.close} KST`; }
  else { label=s.label+(us?' · 미국 휴장':''); dot=s.tone==='off'?'off':'idle';
    title=(s.sub||'')+(us?` / 미국 다음 개장 ${us.next}`:''); }
  el.innerHTML=`<span class="dot ${dot}"></span>${label}`;
  el.title=title;
}


/* ===== 시장 세션 판단(현지 시간 + 휴장일 반영) ===== */
/* [v4.2] Intl 포맷터 재사용 + 같은 초 안에서는 결과 캐시.
   예전엔 호출마다 new Intl.DateTimeFormat 을 만들었다. 실측 2만 회에 1,954ms 대 116ms —
   16.8배 차이다. krSession 은 지수 카드마다 불리므로 렌더 한 번에 수십 번 돈다. */
const _tzF={}, _tzC={};
function nowTz(tz){
  const now=Date.now(), c=_tzC[tz];
  if(c&&now-c.at<250)return c.v;
  try{const f=_tzF[tz]||(_tzF[tz]=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
    const p=f.formatToParts(new Date());
    const o={};p.forEach(x=>o[x.type]=x.value);const wd={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[o.weekday];
    const h=parseInt(o.hour)%24,mi=parseInt(o.minute),se=parseInt(o.second||'0');
    const v={wd,hm:h*60+mi,hms:h*3600+mi*60+se};
    _tzC[tz]={at:now,v};
    return v;}catch(e){return {wd:0,hm:0,hms:0};}
}
function tzDateIso(tz){try{return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}catch(e){return '';}}
function isKrTradingDay(){const t=nowTz('Asia/Seoul');if(t.wd===0||t.wd===6)return false;return !KR_HOLIDAYS[tzDateIso('Asia/Seoul')];}
function isUsTradingDay(){const t=nowTz('America/New_York');if(t.wd===0||t.wd===6)return false;return !US_HOLIDAYS[tzDateIso('America/New_York')];}
/* ══════════ [v3.8] 국내 주식 거래시간 통합 모델 ══════════════════════════
   [무엇이 틀렸나]
   · krxRegularOpen 이 09:00~15:30 을 통으로 봤다. 그 안의 접속매매(~15:20)와
     종가 동시호가(15:20~15:30) 구분이 없었고, 장전 동시호가(08:30~09:00)와
     시간외 세션(15:40~18:00)은 아예 모델에 없었다.
   · nxtActive 는 08:00~20:00 을 끊김 없는 하나로 봤다. 실제 NXT 는
     08:50~09:00 과 15:20~15:40 에 쉰다. 그 20분 동안 '거래 가능'으로 표시됐다.
   · 그래서 15:30 에 정규장이 끝나도 헤더 배지는 시간외 세션 라벨만 바뀌며
     흘러가다가, 18:00 에야 성격이 확 달라져 그때 '끝났다'고 느껴졌다.

   [실제 시간표 — KST, 영업일 기준]
   KRX  08:30~08:40 장전 시간외 종가 (전일 종가로 체결)
        08:30~09:00 장 시작 동시호가 (주문 접수 → 09:00 시가 단일가)
        09:00~15:20 정규장 접속매매
        15:20~15:30 장 마감 동시호가 (→ 15:30 종가 단일가)
        15:40~16:00 장후 시간외 종가 (당일 종가로 체결)
        16:00~18:00 시간외 단일가 (10분 단위 · 당일 종가 ±10%, 가격제한폭 내)
   NXT  08:00~08:50       프리마켓 (지정가만)
        09:00:30~15:20    메인마켓 — KRX 시가 형성을 기다려 30초 늦게 연다
        15:30~15:40       애프터마켓 단일가 (호가 접수, 15:40 체결)
        15:40~20:00       애프터마켓 경쟁매매 (지정가만)
        휴지 08:50~09:00:30 · 15:20~15:30 — KRX 시가·종가 단일가와 겹치지 않게
   ★ NXT 거래 종목은 KRX 시간외 단일가(16:00~18:00) 이용이 제한된다.
   [v4.0에서 바로잡은 것]
     · NXT 애프터마켓을 15:40 시작으로 봤다 → 실제 15:30 (15:30~15:40 은 단일가 호가접수)
     · 두 번째 휴지를 15:20~15:40 으로 봤다 → 실제 15:20~15:30
     · 메인마켓을 09:00 정각으로 봤다 → 실제 09:00:30
     · 프리·애프터마켓이 지정가 전용이라는 점, KRX 시간외단일가 제한을 반영하지 않았다   */
/* [v4.2] 거래시간 특례일.
   · 새해 첫 거래일은 10:00 개장(폐장·개장 관례)
   · 수능일은 수험생 출근시간 분산을 위해 1시간 늦춰 10:00~16:30
   두 경우 모두 모든 세션이 1시간씩 뒤로 밀린다(시간외·NXT 포함). */
const KR_SPECIAL={
  '2026-01-02':{shift:60,label:'개장일 · 10시 개장'},
  /* ⚠ 수능일은 11월 셋째 주 목요일 관례로 잡은 추정치다.
     교육부가 공식 발표하면 반드시 실제 날짜로 고칠 것. 날짜가 틀리면
     그날 하루 모든 세션 판정이 1시간씩 어긋난다. */
  '2026-11-19':{shift:60,label:'수능일 · 1시간 순연(날짜 확인 필요)'},
};
function krShift(){try{return (KR_SPECIAL[tzDateIso('Asia/Seoul')]||{}).shift||0;}catch(e){return 0;}}
function krSpecialLabel(){try{return (KR_SPECIAL[tzDateIso('Asia/Seoul')]||{}).label||'';}catch(e){return '';}}

const KRS={PRE_CLOSE:'장전 시간외 종가',PRE_AUC:'장 시작 동시호가',REG:'정규장',
  CLOSE_AUC:'장 마감 동시호가',AFT_CLOSE:'장후 시간외 종가',AFT_SINGLE:'시간외 단일가',NONE:''};
function krSession(){
  const t=nowTz('Asia/Seoul');
  /* 특례일에는 시각을 거꾸로 당겨 평소 시간표에 대입한다(10:00 개장 = 평소 09:00) */
  const sh=krShift(), hm=t.hm-sh, S=t.hms-sh*60;
  const M=(h,m)=>h*60+m, T=(h,m,sec)=>h*3600+m*60+(sec||0);
  const day=isKrTradingDay();
  const out={hm:t.hm,hms:t.hms,day,shift:sh,special:krSpecialLabel(),
    krx:{open:false,phase:KRS.NONE,tradable:false,alsoAuction:false},
    nxt:{open:false,phase:'',tradable:false,limitOnly:false}};
  if(!day)return out;
  // ── KRX (기존과 동일) ──
  /* [v4.2] 08:30~08:40 은 '장전 시간외 종가'와 '장 시작 동시호가'가 동시에 진행된다.
     예전엔 phase 가 하나뿐이라 시간외종가만 인정하고 동시호가 주문(보통지정가)을 막았다.
     alsoAuction 플래그로 두 세션이 겹친다는 사실을 남긴다. */
  if(hm>=M(8,30)&&hm<M(8,40))      out.krx={open:false,phase:KRS.PRE_CLOSE,tradable:true,alsoAuction:true};
  else if(hm>=M(8,40)&&hm<M(9,0))  out.krx={open:false,phase:KRS.PRE_AUC,tradable:true};
  else if(hm>=M(9,0)&&hm<M(15,20)) out.krx={open:true,phase:KRS.REG,tradable:true};
  else if(hm>=M(15,20)&&hm<M(15,30))out.krx={open:true,phase:KRS.CLOSE_AUC,tradable:true};
  else if(hm>=M(15,40)&&hm<M(16,0))out.krx={open:false,phase:KRS.AFT_CLOSE,tradable:true};
  else if(hm>=M(16,0)&&hm<M(18,0)) out.krx={open:false,phase:KRS.AFT_SINGLE,tradable:true};
  // ── NXT ──
  if(S>=T(8,0)&&S<T(8,50))            out.nxt={open:false,phase:'프리마켓',tradable:true,limitOnly:true};
  else if(S>=T(9,0,30)&&S<T(15,20))   out.nxt={open:true,phase:'메인마켓',tradable:true,limitOnly:false};
  else if(S>=T(15,30)&&S<T(15,40))    out.nxt={open:false,phase:'애프터마켓 단일가',tradable:true,limitOnly:true};
  else if(S>=T(15,40)&&S<T(20,0))     out.nxt={open:false,phase:'애프터마켓',tradable:true,limitOnly:true};
  return out;
}
function krxRegularOpen(){const s=krSession();return s.krx.open;}
/* KRX 어떤 형태로든 주문이 가능한 시간(장전 시간외~시간외 단일가) */
function krxTradable(){return krSession().krx.tradable;}
/* NXT 실제 거래 가능 시간 — 08:50~09:00, 15:20~15:40 휴지 반영 */
function nxtActive(){return krSession().nxt.tradable;}
// 미국 정규장 09:30~16:00 ET
/* [v4.2] 16:00 정각은 마감이므로 미만으로 바꾼다(예전엔 <=960 이라 16:00 에도 '장중') */
function usMarketOpen(){if(!isUsTradingDay())return false;const t=nowTz('America/New_York');return t.hm>=570&&t.hm<960;}
// 지수별 거래 시간대 판정 (선물·아시아 지수·원자재 추가)
/* [v4.2] 일본·홍콩 증시는 점심에 쉰다. 예전엔 통으로 열린 것으로 봐서
   닛케이가 11:30~12:30, 항셍이 13:00~14:00(KST)에도 '장중'으로 표시됐다. */
function asiaOpen(startHm,endHm,lunch){const t=nowTz('Asia/Seoul');
  if(!(t.wd>=1&&t.wd<=5))return false;
  if(!(t.hm>=startHm&&t.hm<endHm))return false;
  if(lunch&&t.hm>=lunch[0]&&t.hm<lunch[1])return false;
  return true;}
function futuresOpen(){const t=nowTz('America/New_York');
  if(t.wd===6)return false;                       // 토요일 휴장
  if(t.wd===0)return t.hm>=1080;                  // 일요일 18:00 ET 재개
  if(t.wd===5)return t.hm<=1020;                  // 금요일 17:00 ET 마감
  return !(t.hm>1020&&t.hm<1080);                 // 평일 17:00~18:00 정산 휴식
}
function marketOpen(key){
  if(key==='BTC'||key==='ETH')return true;                       // 가상자산: 24시간
  if(key==='KOSPI'||key==='KOSDAQ')return krxRegularOpen();
  if(key==='NASDAQ'||key==='SP500'||key==='DOW'||key==='VIX')return usMarketOpen();
  if(key==='NQF'||key==='ESF'||key==='YMF'||key==='WTI'||key==='GOLD')return futuresOpen();
  if(key==='N225')return asiaOpen(540,930,[690,750]);            // 09:00~15:30 JST(=KST) · 점심 11:30~12:30
  if(key==='HSI')return asiaOpen(630,1020,[780,840]);            // 09:30~16:00 HKT = KST 10:30~17:00 · 점심 KST 13:00~14:00
  return false;
}
const IDX_TAGS=['전체','국내','해외','선물','가상자산','지표','원자재'];
let idxFilter='전체';   // 계정별 값은 reloadPerUser()에서 로드
const _prevMkt={};
function mktFlash(key,price){const pv=_prevMkt[key];_prevMkt[key]=price;return (pv!=null&&price!=null&&price!==pv)?(price>pv?'flash-up':'flash-dn'):'';}
/* KRX 야간선물이 지금 열려 있는가 — 평일 18:00~24:00, 화~토 00:00~05:00 */
/* 야간 실시간이 잡히면 마지막 값을 남겨 둔다 — 비거래 시간에 '최종 종가'로 쓴다 */
function saveNightClose(q){
  try{ if(!q||q.price==null)return;
    localStorage.setItem('k200nfLast',JSON.stringify({price:q.price,change:q.change,rate:q.rate,at:Date.now()}));
  }catch(e){}
}
function lastNightClose(){
  try{ const j=JSON.parse(localStorage.getItem('k200nfLast')||'null');
    if(j&&j.price!=null&&Date.now()-(j.at||0)<7*86400e3)return j;
  }catch(e){}
  return null;
}
function k200NightOpen(){
  try{
    const k=kstNow(), h=k.getUTCHours(), wd=k.getUTCDay();   // 0=일
    if(h>=18) return wd>=1&&wd<=5;                            // 월~금 저녁 개장
    if(h<5)   return wd>=2&&wd<=6;                            // 화~토 새벽까지 이어짐
    return false;
  }catch(e){ return false; }
}
/* 다음 야간장이 열리는 시각 안내 */
function k200NightNext(){
  try{
    const k=kstNow(), wd=k.getUTCDay(), h=k.getUTCHours();
    const NM=['일','월','화','수','목','금','토'];
    let d=0;
    if(h<18&&wd>=1&&wd<=5) d=0;                               // 오늘 저녁 6시
    else { d=1; while(true){ const w=(wd+d)%7; if(w>=1&&w<=5)break; d++; if(d>7)break; } }
    return (d===0?'오늘':d===1?'내일':NM[(wd+d)%7]+'요일')+' 18:00';
  }catch(e){ return ''; }
}
function mktBadge(key,dayBasis){
  const kh=new Date(Date.now()+9*3600e3).getUTCHours();
  /* [v3.2] 야간 판정을 야간선물 카드에도 적용한다 — 예전엔 K200F 에만 걸려 있어
     야간선물 카드가 항상 '닫힘'으로 표시됐다. */
  /* ══ [v4.26 · 원인] 야간거래 시간 판정에 요일이 빠져 있었다 ═══════════════
     KRX 자체 야간거래는 '매매일 18:00 ~ 다음날 05:00'이다. 즉 금요일 18시에 열려
     토요일 05시에 닫히고, 토요일 낮과 일요일에는 아예 열리지 않는다.
     그런데 시각만 보고 판정하는 바람에 토요일 낮 12시에도 '야간 거래 중'으로
     취급돼, 값이 없다며 빈 카드가 떴다(첨부 3번 사진 — 토요일 12:18).
     → 요일까지 보고 진짜 야간장일 때만 실시간을 기다린다. */
  const k200Night=(key==='K200F'||key==='K200NF')&&k200NightOpen();
  /* [v3.7] 야간 시간에 '주간 선물' 카드가 장중으로 표시되던 문제 — 주간물은 주간 장만 본다 */
  const open=(key==='K200NF')?(k200Night&&!dayBasis):(key==='K200F'?marketOpen('KOSPI'):marketOpen(key));
  const lab=(key==='BTC'||key==='ETH')?'24시간'
    /* [v3.2] 배지가 뒤바뀌어 있었다. 야간 시간대엔 '주간 선물'이 닫히고 '야간 선물'이 도는데,
       주간 카드에 '야간 거래'가 붙고 야간 카드엔 '장마감'이 붙었다(첨부 사진). 상품별로 나눈다. */
    :(key==='K200F')?(open?'장중':(k200Night?'주간 마감 · 야간 거래 중':'주간 마감'))
    :(key==='K200NF')?(k200Night?'야간 거래 중':'야간거래 종료')
    :(key==='NQF'||key==='ESF'||key==='YMF')?(open?'거래중':'정산 휴식')
    :(key==='KOSPI'||key==='KOSDAQ')?(()=>{const k=krSession();
        /* [v3.9] 아침 프리마켓(08:00~08:30)에 '정규장 마감'이 뜨던 문제 — 개장 전후를 구분한다 */
        return k.krx.open?(k.krx.phase===KRS.CLOSE_AUC?'마감 동시호가':'장중')
          :(k.krx.tradable?k.krx.phase
            :(k.nxt.tradable?(k.hm<540?'개장 전 · NXT':'정규장 마감 · NXT')
              :(k.hm<540?'개장 전':'장마감')));})()
    :(open?'장중':'장마감');
  return `<span class="mkt-badge ${open?'open':''}">${lab}</span>`;}
/* [v3.7] 어떤 화면(홈 그리드·지수 페이지·탭 필터)에서든 야간 자리표시를 일관 적용 */
/* ══ [v4.8 · 완성] 야간선물 카드에 실제 숫자를 채운다 ═══════════════════════
   [무엇이 잘못됐나] 야간 시간대에 K200NF 실시간 시세가 안 오면
   price:null 자리표시({_wait})만 만들어 '수신 대기 중 —' 빈 카드가 계속 떴다.
   dayBasis 안내줄을 그리는 코드는 있었지만 dayBasis 를 채우는 코드가 없었다.
   [해결] 야간선물의 기준가는 어차피 주간 선물 정산가에서 출발하므로,
   실시간 수신 전에는 K200F 주간 마감값(가격·등락·스파크)으로 카드를 채우고
   '주간 마감 기준' 안내줄을 붙인다. 실시간 K200NF 가 들어오는 즉시
   (idx 배열에 실물이 생기므로) 이 합성 카드는 만들어지지 않고 자동 교체된다. */
function nightFutFromDay(list){
  try{ const live=(list||[]).find(x=>x&&x.key==='K200NF'&&x.price!=null&&!x.nightMissing);
       if(live)saveNightClose(live); }catch(e){}
  /* [v4.12] 주간 종가를 야간 카드 숫자로 쓰지 않는다.
     981.15 를 '코스피200 야간선물'로 표기하면 실제(1,008선)와 다른 오정보가 된다.
     값은 비우고, 참고용으로 주간 마감가만 아래에 밝힌다. */
  const k=(list||[]).find(x=>x&&x.key==='K200F');
  return {key:'K200NF',name:'코스피200 야간선물',tag:'선물',price:null,_wait:true,
    dayRef:(k&&k.price!=null)?k.price:null};
  return {key:'K200NF',name:'코스피200 야간선물',tag:'선물',price:null,_wait:true};
}
function withNightWait(arr){
  try{
    const a=(arr||[]).slice();
    const kh9=new Date(Date.now()+9*3600e3).getUTCHours();
    if((kh9>=18||kh9<6)&&a.some(x=>x&&x.key==='K200F')&&!a.some(x=>x&&x.key==='K200NF')){
      const at=a.findIndex(x=>x&&x.key==='K200F');
      a.splice(at+1,0,nightFutFromDay(a));
    }
    return a;
  }catch(e){return arr;}
}
function idxCardHtml(x){
  if(x&&(x._wait||x.nightMissing)){
    /* [v4.26] 야간장이 아예 안 열리는 시간(주말·낮)에는 '미수신'이 아니라
       마지막 야간 종가를 보여 준다. 그마저 없으면 다음 개장 시각을 안내한다. */
    const openNow=k200NightOpen();
    const last=(x.lastNight!=null)?x.lastNight:lastNightClose();
    if(!openNow&&last!=null){
      const d2=dirOf(last.change||0);
      return `<div class="idx-card" data-key="${x.key}"><div class="ic-top"><span class="tag">선물</span>
        <span class="ic-rt num ${d2}">${last.rate!=null?pctS(last.rate):'—'}</span></div>
        <b class="icw-nm">${x.name}</b>
        <div class="idx-lv num ${d2}">${DEC(last.price)}</div>
        <div class="idx-df num ${d2}">${last.change!=null?signedDec(last.change):'—'}<span class="mkb off">야간거래 종료</span></div>
        <div class="icw-sub2">최종 야간 종가 · 다음 개장 ${k200NightNext()}</div></div>`;
    }
    return `<div class="idx-card wait" data-key="${x.key}"><span class="tag">선물</span>
      <b class="icw-nm">${x.name}</b><div class="icw-px">—</div>
      <div class="icw-sub">${openNow?'야간 시세를 받아오는 중입니다':'야간거래가 열려 있지 않습니다 · 다음 개장 '+k200NightNext()}${(x.dayRef!=null)?`<br><i>주간 마감 ${DEC(x.dayRef)} 참고</i>`:''}</div>
      ${mktBadge(x.key,true)}</div>`;
  }
  const dir=dirOf(x.change),fl=mktFlash(x.key,x.price);
  const tag=x.tag?`<span class="idx-tag t-${x.tag}">${x.tag}</span>`:'';
  // [수정] 태그와 이름을 한 줄에 넣어 이름이 '나스닥 …'으로 잘리고 태그가 세로로 깨지던 문제 →
  //        태그는 윗줄로 분리하고 이름은 폭을 온전히 쓰게 한다.
  return `<div class="idx-card"><div class="idx-tagline">${tag}<span class="idx-ch num ${dir}">${arrow(dir)} ${pctS(x.rate)}</span></div>
    <div class="idx-top"><span class="idx-nm"><span class="idx-nm-t">${x.name}</span></span></div>
    <div class="idx-lv num ${dir} ${fl}">${DEC(x.price)}</div><div class="idx-df num ${dir}">${signedDec(x.change)}${mktBadge(x.key,x.dayBasis)}</div>
    ${x.dayBasis?'<div class="icw-sub">주간 마감 기준 · 야간 실시간 시세 수신 시 자동 교체</div>':''}
    <canvas class="spark" id="spark-idx-${x.key}"></canvas></div>`;}
// [개편] 주요 지수와 가상자산을 한 코너로 합치고, 분류 칩으로 걸러 볼 수 있게 한다.
function allIndexCards(){
  const idx=(market.indices||[]).map(x=>({...x,tag:x.tag||'해외'}));
  /* [v3.7] 야간 시간인데 야간선물 데이터가 안 오면 카드를 통째로 숨기지 말고
     '수신 대기' 자리표시 카드를 보여 준다 — 카드가 사라져 버그처럼 보이던 문제 */
  try{const kh9=new Date(Date.now()+9*3600e3).getUTCHours();
    if((kh9>=18||kh9<6)&&idx.some(x=>x.key==='K200F')&&!idx.some(x=>x.key==='K200NF')){
      const at=idx.findIndex(x=>x.key==='K200F');
      idx.splice(at+1,0,nightFutFromDay(idx));
    }}catch(e){}
  const cry=(market.crypto||[]).map(x=>({...x,tag:x.tag||'가상자산'}));
  return [...idx,...cry].filter(x=>x&&(x.price!=null||x._wait||x.nightMissing));
}
function renderMarket(){
  try{if(currentView==='home')renderHeroMarket();}catch(e){}   // [v2.3.1] 지수 갱신 주기에 시장 카드 동반 갱신
  const ig=$('idxGrid');
  const all=allIndexCards();
  const chips=$('idxChips');
  if(chips){
    const avail=IDX_TAGS.filter(t=>t==='전체'||all.some(x=>x.tag===t));
    if(!avail.includes(idxFilter))idxFilter='전체';
    chips.innerHTML=avail.map(t=>`<button class="${idxFilter===t?'on':''}" data-t="${t}">${t}</button>`).join('');
    chips.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      idxFilter=b.dataset.t;pset('idxFilter',idxFilter);
      renderMarket();});
  }
  if(ig){
    const list=idxFilter==='전체'?all:all.filter(x=>x.tag===idxFilter);
    if(!list.length){ig.innerHTML='<div class="skel-card"></div><div class="skel-card"></div><div class="skel-card"></div>';}
    else{
      ig.innerHTML=withNightWait(list).map(idxCardHtml).join('');
      list.forEach(x=>drawSpark($('spark-idx-'+x.key),x.history,dirOf(x.change)));
    }
  }
  // 좌우 스크롤 버튼 (마우스·데스크톱용, 모바일은 스와이프)
  const rail=$('idxGrid');
  if(rail){
    const step=()=>Math.max(200,rail.clientWidth*0.8);
    const pv=$('idxPrev'), nx=$('idxNext');
    if(pv)pv.onclick=()=>rail.scrollBy({left:-step(),behavior:'smooth'});
    if(nx)nx.onclick=()=>rail.scrollBy({left:step(),behavior:'smooth'});
    const upd=()=>{const max=rail.scrollWidth-rail.clientWidth-2;
      if(pv)pv.classList.toggle('off',rail.scrollLeft<=2);
      if(nx)nx.classList.toggle('off',rail.scrollLeft>=max);};
    rail.onscroll=upd; setTimeout(upd,60);
  }
  const fr=$('fxRow');
  if(fr){
    const st=$('fxStatus');
    if(fxData.length){
      if(st)st.innerHTML=fxOpen?'<i class="dot on"></i>서울외환 장중':'<i class="dot off"></i>장마감 · 최종 고시가';
      fr.innerHTML=fxData.map(x=>{const dir=dirOf(x.change),fl=mktFlash('FX'+x.key,x.price),dp=x.dp!=null?x.dp:2;
        /* [수정] 서버가 flag를 못 준 경우(구버전 캐시)에도 통화코드 앞 두 글자로 국기를 계산해 흰 깃발을 없앤다 */
        const fg=x.flag&&x.flag!=='🏳️'?x.flag:(x.key==='EUR'?'🇪🇺':(/^[A-Z]{2}/.test(x.key)?String.fromCodePoint(0x1f1e6+x.key.charCodeAt(0)-65,0x1f1e6+x.key.charCodeAt(1)-65):'🌐'));
        return `<div class="fx-card"><div class="fx-flag">${fg}</div><div class="fx-info">
          <div class="fx-nm">${x.name}<span class="fx-unit">${x.unit}</span></div>
          <div class="fx-lv num ${fl}">${DEC(x.price,dp)}</div>
          <div class="fx-ch num ${dir}">${arrow(dir)} ${signedDec(x.change,dp)} (${pctS(x.rate)})</div></div>
          <canvas id="spark-fx-${x.key}"></canvas></div>`;}).join('');
      fxData.forEach(x=>drawSpark($('spark-fx-'+x.key),x.history,dirOf(x.change)));
    }else if(market.fx.length){
      if(st)st.textContent='';
      fr.innerHTML=market.fx.map(x=>{const dir=dirOf(x.change),fl=mktFlash(x.key,x.price);
        return `<div class="fx-card"><div class="fx-info"><div class="fx-nm">${x.name} ${mktBadge(x.key)}</div><div class="fx-lv num ${fl}">${DEC(x.price)}</div>
          <div class="fx-ch num ${dir}">${arrow(dir)} ${signedDec(x.change)} (${pctS(x.rate)})</div></div><canvas id="spark-fx-${x.key}"></canvas></div>`;}).join('');
      market.fx.forEach(x=>drawSpark($('spark-fx-'+x.key),x.history,dirOf(x.change)));
    }else{fr.innerHTML='<div class="empty" style="min-width:100%">환율 수신 중…</div>';}
    /* 좌우 화살표(데스크톱) — 모바일은 스와이프 + 항상 보이는 스크롤바 */
    const pv=$('fxPrev'),nx=$('fxNext');
    const step=()=>Math.max(200,fr.clientWidth*0.8);
    if(pv)pv.onclick=()=>fr.scrollBy({left:-step(),behavior:'smooth'});
    if(nx)nx.onclick=()=>fr.scrollBy({left:step(),behavior:'smooth'});
    const upd=()=>{const max=fr.scrollWidth-fr.clientWidth-2;
      if(pv)pv.classList.toggle('off',fr.scrollLeft<=2);
      if(nx)nx.classList.toggle('off',fr.scrollLeft>=max);};
    fr.onscroll=upd;setTimeout(upd,60);
  }
  safeRun('aiBrief',renderAiBrief);
}

/* ===== AI 브리핑 =====
   실제 시세·보유내역·일정 데이터를 읽어 "지금 이 순간 알아야 할 것"만 골라
   존댓말 한두 문장으로 정리한다. 문구는 데이터에 따라 매번 달라진다. */
let aiIdx=0, aiTimer=null, aiCards=[], aiTyping=null;
const aiPick=(a)=>a[Math.floor(Math.random()*a.length)];
const aiNum=(n)=>KRW(Math.round(Math.abs(n||0)));
// 한국어 조사 자동 선택 — "삼성전자이(가)" 같은 어색한 표기를 막는다.
function hasJong(w){
  const last=String(w||'').trim().slice(-1);
  const c=last.charCodeAt(0);
  if(isNaN(c))return false;
  if(c>=0xAC00&&c<=0xD7A3)return (c-0xAC00)%28!==0;   // 한글: 종성 유무
  return false;                                        // 영문·숫자로 끝나면 받침 없는 것으로 처리(NAVER는, LG는)
}
const jGa =(w)=>`${w}${hasJong(w)?'이':'가'}`;
const jEun=(w)=>`${w}${hasJong(w)?'은':'는'}`;
const jEul=(w)=>`${w}${hasJong(w)?'을':'를'}`;

function aiIndexOf(key){return allIndexCards().find(x=>x.key===key)||null;}

function buildBriefs(){
  const out=[], sess=(typeof marketSession==='function')?marketSession():{label:'',tone:''};
  const t=nowTz('Asia/Seoul');
  const add=(o)=>{ if(o&&o.html)out.push(o); };
  const K=(k)=>aiIndexOf(k);
  const kospi=K('KOSPI'), kosdaq=K('KOSDAQ'), nqf=K('NQF'), esf=K('ESF'), vix=K('VIX');
  const ndq=K('NASDAQ'), spx=K('SP500'), n225=K('N225'), btc=K('BTC'), wti=K('WTI'), gold=K('GOLD');
  const usd=(market.fx||[]).find(x=>x.key==='USDKRW');
  const R=(x)=>(x&&x.rate!=null)?x.rate:null;

  /* ── 1. 지금 시각 · 장 상태 + 다음 이벤트까지 남은 시간 ── */
  const greet=t.hm<660?'좋은 아침이에요!':t.hm<1080?'오후도 화이팅이에요!':'오늘 하루 고생 많으셨어요!';
  const mm=(a,b)=>{const d=a*60+b-t.hm; return d>0?(d>=60?`${Math.floor(d/60)}시간 ${d%60}분`:`${d}분`):null;};
  if(sess.label==='KRX 정규장'){
    const left=mm(15,30);
    add({icon:'🔔',cat:'장 상황',mood:'on',
      html:`${greet} 지금은 <b>KRX 정규장</b>이에요.${left?` 마감까지 <b>${left}</b> 남았어요.`:''}`,
      tip:'장 마감 30분 전(15:00~)은 기관 수급이 몰려 방향이 자주 바뀌는 구간이에요.'});
  }else if(/프리마켓|NXT/.test(sess.label)||(t.hm>=480&&t.hm<540)){
    const left=mm(9,0);
    add({icon:'🌅',cat:'장 상황',mood:'on',
      html:`${greet} 지금은 <b>NXT 프리마켓</b>이에요.${left?` KRX 정규장 개장까지 <b>${left}</b>.`:''}`,
      tip:'프리마켓은 거래량이 얇아 가격이 크게 튈 수 있어요. KRX 기준 등락률은 9시 전까지 0.00%로 표시됩니다.'});
  }else if(sess.label==='휴장'){
    add({icon:'😴',cat:'장 상황',mood:'off',
      html:`${greet} 오늘은 <b>휴장</b>${sess.sub?`(${sess.sub})`:''}이라 국내 시장은 쉬어가요.`,
      tip:'표시된 가격은 모두 직전 거래일 종가예요. 쉬는 날엔 포트폴리오 점검을 해 보시는 것도 좋아요.'});
  }else{
    add({icon:'🕒',cat:'장 상황',mood:'off',
      html:`${greet} 지금은 <b>${sess.label}</b>${sess.sub?` (${sess.sub})`:''} 시간대예요.`,
      tip:'NXT 애프터마켓은 20:00까지 열려 있어요.'});
  }

  /* ── 2. 국내 지수: 코스피/코스닥 갭 해석 ── */
  if(kospi&&kospi.price!=null){
    const k=R(kospi)||0, q=R(kosdaq);
    const face=k>=1.5?'🤩':k>=0.3?'😃':k>-0.3?'😐':k>-1.5?'😥':'😱';
    let read='';
    if(q!=null){
      const gap=k-q;
      read=gap>=0.8?'대형주로 돈이 쏠리는 모습이에요. 지수는 버텨도 중소형주는 힘들 수 있어요.'
        :gap<=-0.8?'중소형주가 더 강해요. 시장에 위험을 감수하려는 분위기가 있다는 신호예요.'
        :'대형주와 중소형주가 비슷하게 움직여요. 특정 쏠림 없이 무난한 흐름이에요.';
    }
    add({icon:face,cat:'국내 증시',mood:k>=0?'up':'down',
      html:`코스피 <b>${DEC(kospi.price)}</b> <b class="${dirOf(k)}">${pctS(k)}</b>${q!=null?` · 코스닥 <b class="${dirOf(q)}">${pctS(q)}</b>`:''}`,
      tip:read});
  }

  /* ── 3. 선물로 보는 오늘 밤 미국장 ── */
  if(nqf&&nqf.price!=null){
    const r=R(nqf)||0, e=R(esf);
    const read=Math.abs(r)>=1.5?'선물이 1.5% 넘게 움직였어요. 오늘 밤 미국장 변동이 클 가능성이 높아요.'
      :r>=0.4?'선물이 견조해요. 국내 기술주에도 우호적인 편이에요.'
      :r<=-0.4?'선물이 밀리고 있어요. 국내 반도체·기술주가 눌릴 수 있으니 참고하세요.'
      :'선물이 거의 제자리예요. 밤사이 큰 변동은 예고되지 않았어요.';
    add({icon:'🌙',cat:'미국 선물',mood:r>=0?'up':'down',
      html:`나스닥100 선물 <b class="${dirOf(r)}">${pctS(r)}</b>${e!=null?` · S&P500 선물 <b class="${dirOf(e)}">${pctS(e)}</b>`:''}`,
      tip:read});
  }
  /* ── 4. 간밤 미국장 결과 ── */
  if(ndq&&ndq.price!=null&&t.hm<720){
    const r=R(ndq)||0, sp=R(spx);
    add({icon:r>=0?'🇺🇸':'🌧️',cat:'간밤 미국장',mood:r>=0?'up':'down',
      html:`간밤 나스닥 <b class="${dirOf(r)}">${pctS(r)}</b>${sp!=null?` · S&P500 <b class="${dirOf(sp)}">${pctS(sp)}</b>`:''}로 마감했어요.`,
      tip:r<=-1?'미국장이 크게 밀리면 국내 개장 직후 갭하락이 나오는 경우가 많아요. 성급한 매수는 조금 참아 보세요.'
        :r>=1?'미국장 강세는 국내 개장 갭상승으로 이어지곤 해요. 다만 갭 상승 직후 되밀리는 경우도 잦아요.'
        :'큰 변동은 없었어요. 국내 수급이 방향을 정할 가능성이 커요.'});
  }
  /* ── 5. VIX 공포지수 ── */
  if(vix&&vix.price!=null){
    const v=vix.price, r=R(vix)||0;
    const say=v>=30?'시장이 크게 불안해하고 있어요. 현금 비중을 늘리고 추격 매수는 피하는 게 좋아요.'
      :v>=20?'경계심이 올라와 있어요. 손절선을 반드시 정해 두세요.'
      :v>=14?'평온한 편이에요. 다만 너무 낮은 변동성은 방심의 신호이기도 해요.'
      :'매우 안정적이에요. 급락 대비가 오히려 필요한 구간이에요.';
    add({icon:v>=25?'😰':v>=17?'🙂':'😌',cat:'변동성',mood:v>=22?'down':'up',
      html:`공포지수(VIX) <b>${DEC(v)}</b> <b class="${dirOf(r)}">${pctS(r)}</b>`, tip:say});
  }

  /* ── 6. 내 자산 ── */
  let te=0,tc=0,dayPnl=0;
  (holdings||[]).forEach(h=>{const st=byCode[h.code];const px=(st&&st.price!=null)?st.price:h.avg;
    te+=px*h.qty; tc+=h.avg*h.qty;
    if(st&&st.price!=null&&st.prevClose)dayPnl+=(st.price-st.prevClose)*h.qty;});
  const pnl=te-tc, assets=te+cash, prate=tc?pnl/tc*100:0;
  if((holdings||[]).length){
    const word=pnl>0?aiPick(['잘 버텨 주고 있네요 👏','기분 좋은 숫자예요','흐름이 괜찮아요'])
      :pnl<0?aiPick(['조금 아쉽지만 아직 진행형이에요','기다림도 전략이에요','수치보다 계획이 중요해요'])
      :'정확히 본전이에요';
    add({icon:pnl>=0?'💰':'🫧',cat:'내 자산',mood:pnl>=0?'up':'down',
      html:`총자산 <b>${aiNum(assets)}원</b> · 평가손익 <b class="${dirOf(pnl)}">${pnl>=0?'+':'-'}${aiNum(pnl)}원 (${pctS(prate)})</b>`,
      tip:`${word}${dayPnl?` 오늘 하루만 보면 <b class="${dirOf(dayPnl)}">${dayPnl>=0?'+':'-'}${aiNum(dayPnl)}원</b>이에요.`:''}`});

    const rows=(holdings||[]).map(h=>{const st=byCode[h.code];
      if(!st||st.price==null||!st.prevClose)return null;
      return {n:st.name,c:h.code,r:(st.price-st.prevClose)/st.prevClose*100,
        w:st.price*h.qty, pr:(st.price/h.avg-1)*100};}).filter(Boolean);
    if(rows.length){
      const best=rows.slice().sort((a,b)=>b.r-a.r)[0], worst=rows.slice().sort((a,b)=>a.r-b.r)[0];
      if(best&&best.r>0)add({icon:'🚀',cat:'보유 종목',mood:'up',
        html:`오늘의 효자는 <b>${best.n}</b> <b class="up">${pctS(best.r)}</b>${worst&&worst.r<0?` · 반대로 <b>${worst.n}</b> <b class="down">${pctS(worst.r)}</b>`:''}`,
        tip:best.pr>=20?'수익률이 20%를 넘었어요. 일부라도 이익 실현을 고민해 볼 구간이에요.'
          :'오른 종목을 더 사는 것보다, 왜 올랐는지 먼저 확인하는 습관이 좋아요.'});
      else if(worst)add({icon:'🩹',cat:'보유 종목',mood:'down',
        html:`오늘은 <b>${worst.n}</b>이(가) <b class="down">${pctS(worst.r)}</b>로 가장 힘들어요.`,
        tip:worst.pr<=-15?'평단 대비 -15%를 넘었어요. 손절 기준을 정해 두지 않았다면 지금이라도 정해 보세요.'
          :'하루 등락에 일희일비하지 않아도 괜찮아요. 처음 살 때의 이유가 아직 유효한지만 확인해 보세요.'});
      const tot=rows.reduce((a,b)=>a+b.w,0);
      const top=rows.slice().sort((a,b)=>b.w-a.w)[0];
      if(tot>0&&top&&rows.length>1&&top.w/tot>=0.5)
        add({icon:'⚖️',cat:'위험 점검',mood:'off',
          html:`<b>${top.n}</b> 하나가 주식 자산의 <b>${Math.round(top.w/tot*100)}%</b>를 차지해요.`,
          tip:'한 종목 비중이 절반을 넘으면 그 종목의 악재가 곧 내 계좌의 악재가 돼요. 분산을 고려해 보세요.'});
      const cashR=assets?cash/assets*100:0;
      if(cashR<=10)add({icon:'🪙',cat:'위험 점검',mood:'off',
        html:`예수금 비중이 <b>${cashR.toFixed(0)}%</b>로 거의 없어요.`,
        tip:'현금이 없으면 좋은 기회가 와도 잡을 수 없어요. 10~20% 정도는 남겨 두는 편이 마음도 편해요.'});
      else if(cashR>=80)add({icon:'🧊',cat:'위험 점검',mood:'off',
        html:`자산의 <b>${cashR.toFixed(0)}%</b>가 현금이에요.`,
        tip:'기다리는 것도 훌륭한 포지션이에요. 다만 목표 종목과 매수 가격은 미리 정해 두세요.'});
    }
  }else{
    add({icon:'🌱',cat:'내 자산',mood:'off',
      html:`아직 보유 종목이 없으시네요. 예수금은 <b>${aiNum(cash)}원</b>이에요.`,
      tip:'관심종목에 먼저 담아 두고 며칠 지켜보면, 급하게 사서 후회하는 일이 줄어들어요.'});
  }

  /* ── 7. 관심종목 ── */
  const wl=(watchlist||[]).map(c=>byCode[c]).filter(x=>x&&x.price!=null&&x.prevClose)
    .map(x=>({n:x.name,c:x.code,r:(x.price-x.prevClose)/x.prevClose*100}));
  if(wl.length){
    const hot=wl.filter(x=>Math.abs(x.r)>=3).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r))[0];
    if(hot)add({icon:hot.r>0?'👀':'🔍',cat:'관심종목',mood:hot.r>0?'up':'down',
      html:`<b>${hot.n}</b>${hasJong(hot.n)?'이':'가'} <b class="${dirOf(hot.r)}">${pctS(hot.r)}</b>로 크게 움직였어요.`,
      tip:hot.r>0?'3% 이상 급등은 뉴스나 수급 변화가 있었다는 뜻이에요. 이유를 모르면 따라가지 마세요.'
        :'급락엔 이유가 있어요. 실적·공시부터 확인해 보세요.'});
    else{
      const up=wl.filter(x=>x.r>0).length;
      add({icon:'📋',cat:'관심종목',mood:up*2>=wl.length?'up':'down',
        html:`관심종목 ${wl.length}개 중 <b class="up">${up}개 상승</b> · <b class="down">${wl.length-up}개 하락</b>`,
        tip:'큰 변동 없이 잔잔한 날이에요. 이런 날엔 종목 공부하기 딱 좋아요.'});
    }
  }

  /* ── 8. 세분화 테마 ── */
  try{
    const th=(thmCache&&thmCache.theme)||[];
    const rated=th.filter(x=>x.rate!=null);
    if(rated.length>3){
      const s2=rated.slice().sort((a,b)=>b.rate-a.rate);
      const top=s2[0], second=s2[1], bot=s2[s2.length-1];
      add({icon:'🎯',cat:'주도 테마',mood:top.rate>=0?'up':'down',
        html:`세부 테마 ${rated.length}개 중 <b>${top.name}</b> <b class="${dirOf(top.rate)}">${pctS(top.rate)}</b>${second?` · <b>${second.name}</b> <b class="${dirOf(second.rate)}">${pctS(second.rate)}</b>`:''}`,
        tip:`가장 약한 곳은 <b>${bot.name}</b>(${pctS(bot.rate)})이에요. 주도 테마는 하루아침에 바뀌니 매일 확인해 보세요.`});
    }
  }catch(e){}
  /* ── 9. 내 업종 바스켓 ── */
  try{
    const secs=(typeof sectorStats==='function')?sectorStats():[];
    if(secs&&secs.length>2){
      const top=secs[0];
      if(isFinite(top.avg))add({icon:'🔥',cat:'업종 강도',mood:top.avg>=0?'up':'down',
        html:`내 종목 기준 가장 센 업종은 <b>${top.name}</b> <b class="${dirOf(top.avg)}">${pctS(top.avg)}</b>예요.`,
        tip:'업종이 함께 움직인다면 개별 이슈가 아니라 산업 전체의 흐름일 가능성이 커요.'});
    }
  }catch(e){}

  /* ── 10. 환율 · 원자재 · 코인 ── */
  if(usd&&usd.price!=null){
    const r=R(usd)||0, p=usd.price;
    add({icon:'💵',cat:'환율',mood:'off',
      html:`원/달러 <b>${DEC(p)}원</b> <b class="${dirOf(r)}">${pctS(r)}</b>`,
      tip:p>=1400?'1,400원대는 부담스러운 수준이에요. 외국인 자금이 빠져나가기 쉬운 환경이에요.'
        :r>=0.5?'환율이 오르면 수출주(반도체·자동차)엔 유리, 항공·여행주엔 불리하게 작용하는 편이에요.'
        :r<=-0.5?'환율이 내리면 외국인 순매수가 들어오기 좋은 환경이에요.'
        :'환율은 안정적이에요.'});
  }
  if(wti&&wti.price!=null)add({icon:'🛢️',cat:'원자재',mood:'off',
    html:`WTI 유가 <b>$${DEC(wti.price)}</b> <b class="${dirOf(R(wti)||0)}">${pctS(R(wti)||0)}</b>${gold&&gold.price!=null?` · 금 <b>$${DEC(gold.price)}</b>`:''}`,
    tip:'유가가 오르면 정유·조선엔 호재, 항공·해운·화학엔 부담이에요.'});
  if(btc&&btc.price!=null){
    const r=R(btc)||0;
    add({icon:'🪙',cat:'가상자산',mood:r>=0?'up':'down',
      html:`비트코인 <b>${aiNum(btc.price)}원</b> <b class="${dirOf(r)}">${pctS(r)}</b>`,
      tip:'코인은 주말에도 24시간 움직여서, 월요일 아침 국내 위험자산 심리를 미리 엿보는 참고 지표가 돼요.'});
  }

  /* ── 11. 일정 · 공모주 ── */
  try{
    const evs=(typeof calEventsFor==='function')?calEventsFor(new Date()):[];
    if(evs&&evs.length)add({icon:'📅',cat:'오늘 일정',mood:'off',
      html:`오늘은 <b>${evs[0].title||evs[0].name||'주요 일정'}</b>${evs.length>1?` 외 ${evs.length-1}건`:''}이 있어요.`,
      tip:'FOMC·고용지표 같은 큰 일정 전후로는 변동성이 커지니 신규 진입은 신중하게요.'});
  }catch(e){}
  try{
    const today=new Date(); today.setHours(0,0,0,0);
    const soon=(ipoList||[]).map(it=>{ if(!it.subStart)return null;
      const d=new Date(it.subStart); d.setHours(0,0,0,0);
      const dd=Math.round((d-today)/86400000);
      return (dd>=0&&dd<=3)?{n:it.name,dd}:null;}).filter(Boolean).sort((a,b)=>a.dd-b.dd)[0];
    if(soon)add({icon:'🎟️',cat:'공모주',mood:'off',
      html:`<b>${soon.n}</b> 청약이 ${soon.dd===0?'<b>오늘</b>':`<b>${soon.dd}일 뒤</b>`} 시작해요.`,
      tip:'균등배정은 최소 청약만 해도 참여할 수 있어요. 환불일까지 증거금이 묶이는 점만 기억하세요.'});
  }catch(e){}

  /* ── 12. 오늘의 투자 습관 한 마디 ── */
  const habits=[
    ['📓','사기 전에 <b>파는 이유</b>를 먼저 적어 두면 손실이 절반으로 줄어요.'],
    ['⏰','호가창을 오래 볼수록 매매가 잦아져요. 정해 둔 시간에만 확인해 보세요.'],
    ['🧮','같은 종목을 물타기하기 전에, 그 돈으로 <b>지금 이 종목을 처음 살지</b> 자문해 보세요.'],
    ['🎣','급등한 다음 날 시초가 추격은 통계적으로 가장 불리한 진입이에요.'],
    ['🧊','계획에 없던 매수는 대부분 후회로 끝나요. 오늘 계획을 한 줄로 적어 보세요.'],
    ['🔁','수익난 종목은 빨리 팔고 손실난 종목은 오래 들고 있진 않나요? 가장 흔한 함정이에요.'],
  ];
  const hb=habits[(t.d0||new Date().getDate())%habits.length];
  add({icon:hb[0],cat:'투자 습관',mood:'off',html:hb[1],
    tip:'저는 실제 시세와 회원님의 보유 내역만 읽어 정리해 드려요. 매수·매도 판단은 꼭 직접 내려 주세요!'});

  return out;
}

function aiSetMood(mood){
  const bot=$('aiBot'); if(!bot)return;
  /* [v2.8] mood 가 'on' 이면 m-on 이 붙는데 remove 목록엔 없어 클래스가 계속 쌓였다.
     m- 로 시작하는 것을 전부 걷어낸 뒤 새로 붙인다. */
  [...bot.classList].filter(c=>/^m-/.test(c)).forEach(c=>bot.classList.remove(c));
  bot.classList.add('m-'+(mood||'off'));
  /* [수정] 로봇 교체(v89)로 aiChest 요소가 사라져 죽어 있던 기능 복구 —
     새 SVG의 안테나·가슴 하트 색을 시장 분위기로 바꾼다(상승=빨강, 하락=파랑, 알림=금색, 평시=핑크). */
  const hcol=mood==='up'?'#ff5a6e':mood==='down'?'#4d8df0':mood==='on'?'#ffd66b':'#39d8ff';
  const ah=document.querySelector('#aiBot .mib-heart'); if(ah)ah.setAttribute('fill',hcol);
  const ch2=document.querySelector('#aiBot .mib-chest'); if(ch2)ch2.setAttribute('fill',(mood==='up'||mood==='down'||mood==='on')?hcol:'#3fe3ff');
}
function aiType(el,html){
  clearInterval(aiTyping);
  // 태그를 깨지 않도록 텍스트 노드 단위로 한 글자씩 채운다
  const tmp=document.createElement('div'); tmp.innerHTML=html;
  const nodes=[]; const walk=(n)=>{n.childNodes.forEach(c=>{
    if(c.nodeType===3)nodes.push(c); else walk(c);});};
  walk(tmp);
  const texts=nodes.map(n=>n.nodeValue);
  nodes.forEach(n=>n.nodeValue='');
  el.innerHTML=''; el.appendChild(tmp);
  let ni=0,ci=0;
  aiTyping=setInterval(()=>{
    if(ni>=nodes.length){clearInterval(aiTyping);return;}
    const full=texts[ni];
    ci+=2;
    nodes[ni].nodeValue=full.slice(0,ci);
    if(ci>=full.length){ni++;ci=0;}
  },18);
}
function renderAiBrief(step){
  const wrap=$('aiBrief'); if(!wrap)return;
  aiCards=buildBriefs();
  if(!aiCards.length)return;
  if(step)aiIdx=(aiIdx+1)%aiCards.length;
  if(aiIdx>=aiCards.length)aiIdx=0;
  const c=aiCards[aiIdx];
  const txt=$('aiText');
  if(txt)aiType(txt,`<span class="ai-ico">${c.icon}</span> ${c.html}`+(c.tip?`<span class="ai-tip">${c.tip}</span>`:''));
  const cat=$('aiCat'); if(cat){cat.textContent=c.cat||'브리핑';cat.hidden=!c.cat;}
  aiSetMood(c.mood);
  const tm=$('aiTime'); if(tm)tm.textContent=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
  const live=$('aiLive');
  if(live){const on=krxRegularOpen(), nx=nxtOnlyWindow();
    live.textContent=on?'실시간':nx?'NXT 실시간':'종가 기준';
    live.className='ai-live'+((on||nx)?' on':'');}
  const dots=$('aiDots');
  if(dots){dots.innerHTML=aiCards.map((_,i)=>`<i class="${i===aiIdx?'on':''}" data-i="${i}"></i>`).join('');
    dots.querySelectorAll('i').forEach(d=>d.onclick=(e)=>{e.stopPropagation();aiIdx=Number(d.dataset.i);renderAiBrief();aiSchedule();});}
  const nx=$('aiNext'); if(nx)nx.onclick=(e)=>{e.stopPropagation();renderAiBrief(true);aiSchedule();};
  const bot=$('aiBot'); if(bot)bot.onclick=()=>{bot.classList.add('jump');setTimeout(()=>bot.classList.remove('jump'),600);renderAiBrief(true);aiSchedule();};
}
function aiSchedule(){clearTimeout(aiTimer);
  aiTimer=setTimeout(()=>{if(currentView==='home'&&!document.hidden)renderAiBrief(true);aiSchedule();},9000);}

/* ===== 실시간 주도 섹터 ===== */
const ALLCODES=STOCKS.map(s=>s[1]);
try{window.__boot&&__boot.step(3);}catch(e){}   // [v4.9] 입장화면: 종목 데이터 준비 완료
const SECTORS=(()=>{const m={};STOCKS.forEach(([n,c,t])=>{(m[t]||(m[t]=[])).push(c);});return m;})();
let sectorOpen=null;
function scheduleSectors(){clearTimeout(window._secT);window._secT=setTimeout(pollSectors,sectorIv());}
let secLoaded=false,secError=false;
async function pollSectors(){
  // [수정] 휴장·마감이라도 최초 1회는 종가 기준으로 불러온다(이전엔 영원히 '시세 수신 중…'이었음).
  if(document.hidden||(!krxRegularOpen()&&secLoaded)){scheduleSectors();return;}
  try{
    const CH=40,parts=[];
    for(let i=0;i<ALLCODES.length;i+=CH)parts.push(ALLCODES.slice(i,i+CH));
    fnBump(parts.length);
    const res=await Promise.all(parts.map(cs=>
      fetch('/api/quote?codes='+cs.join(','),{cache:'no-store'}).then(r=>r.json()).catch(()=>null)));
    let n=0;
    res.forEach(j=>((j&&j.quotes)||[]).forEach(q=>{const s=byCode[q.code];if(!s)return;
      s.price=q.price;s.prevClose=q.prevClose;s.open=q.open;s.high=q.high;s.low=q.low;s.volume=q.volume;s.value=q.value;n++;}));
    secError=(n===0);
    if(n)secLoaded=true;
    if(currentView==='sector'){if(secTab==='live')renderSector();else renderPredict();}
    else if(currentView==='search')renderSearch();
  }catch{secError=true;}
  scheduleSectors();
}

/* ===== AI 다음 주도 섹터 예측 =====
   실제 시세(등락률·거래대금·고저 대비 종가위치·시장 대비 상대강도)로 점수를 계산하는
   규칙 기반 모델입니다. 미래를 보장하지 않으며 투자 판단의 근거가 될 수 없습니다. */
function sectorMetrics(){
  const mkt=(market.indices||[]).find(x=>x.key==='KOSPI');
  const mktChg=mkt&&mkt.rate!=null?mkt.rate:0;
  const rows=[];
  for(const [name,codes] of Object.entries(SECTORS)){
    const items=codes.map(c=>byCode[c]).filter(s=>s&&s.price!=null&&s.prevClose);
    if(!items.length)continue;
    let chg=0,valSum=0,posSum=0,posN=0,upN=0;
    items.forEach(s=>{
      const p=chgPct(s)??0; chg+=p; if(p>0)upN++;
      valSum+=(s.value||0);
      if(s.high!=null&&s.low!=null&&s.high>s.low){posSum+=(s.price-s.low)/(s.high-s.low);posN++;}
    });
    const avg=chg/items.length;
    rows.push({name,n:items.length,avg,rel:avg-mktChg,
      valPer:valSum/items.length,                       // 종목당 평균 거래대금
      closePos:posN?posSum/posN:0.5,                    // 당일 고저 대비 종가 위치(0~1)
      breadth:upN/items.length});                       // 상승 종목 비율
  }
  return rows;
}
function predictSectors(){
  const rows=sectorMetrics();
  if(rows.length<3)return null;
  const vals=rows.map(r=>r.valPer).filter(v=>v>0).sort((a,b)=>a-b);
  const medVal=vals.length?vals[Math.floor(vals.length/2)]:1;
  const maxRel=Math.max(...rows.map(r=>Math.abs(r.rel)),0.5);
  const scored=rows.map(r=>{
    // ① 자금 유입: 종목당 평균 거래대금이 전체 중앙값 대비 얼마나 큰가
    const flow=Math.max(0,Math.min(1,Math.log10((r.valPer||1)/(medVal||1)+1)/0.6));
    // ② 종가 위치: 당일 고점 부근에서 마감할수록 매수세 우위
    const close=Math.max(0,Math.min(1,r.closePos));
    // ③ 상대강도: 시장 대비 초과 수익
    const rel=Math.max(0,Math.min(1,(r.rel/maxRel+1)/2));
    // ④ 참여 폭: 섹터 내 상승 종목 비율
    const breadth=Math.max(0,Math.min(1,r.breadth));
    // ⑤ 과열 감점: 이미 크게 오른 섹터는 '다음' 주도가 될 여지가 작다
    const heat=Math.max(0,Math.min(1,r.avg/8));
    const score=Math.round((flow*0.30+close*0.25+rel*0.20+breadth*0.15)*100-heat*18);
    const parts=[{k:'자금 유입',v:flow},{k:'종가 위치',v:close},{k:'상대강도',v:rel},{k:'참여 폭',v:breadth}];
    const tags=[];
    if(flow>0.6)tags.push('거래대금 집중');
    if(close>0.7)tags.push('고점권 마감');
    if(rel>0.65)tags.push('시장 대비 강세');
    if(breadth>0.7)tags.push('전 종목 동반 상승');
    if(r.avg<0&&close>0.6)tags.push('낙폭 회복 시도');
    if(heat>0.6)tags.push('단기 과열 주의');
    return {...r,score:Math.max(0,Math.min(100,score)),parts,tags};
  }).sort((a,b)=>b.score-a.score);
  // 예상 주목 시점: 점수가 높을수록 임박
  const eta=(sc)=>sc>=78?{t:'1~2 거래일',d:'자금이 이미 유입되는 중'}
    :sc>=64?{t:'3~5 거래일',d:'매수세가 쌓이는 단계'}
    :sc>=50?{t:'1~2주',d:'관심이 서서히 옮겨가는 흐름'}
    :{t:'2~4주',d:'아직 초기 신호'};
  // 신뢰도: 표본(종목 수)과 상위-차상위 점수 격차로 산출
  const gap=scored[0].score-(scored[1]?scored[1].score:0);
  const sample=Math.min(1,scored[0].n/4);
  const conf=Math.round(Math.max(20,Math.min(92,40+gap*2.2+sample*22)));
  return {list:scored,eta,conf,at:Date.now(),leader:sectorStats()[0]?sectorStats()[0].name:null};
}
/* 예측 기록 & 적중률 — 3거래일 뒤 실제 상위 3위 안에 들었는지 자동 확인 */
function predLog(){try{return JSON.parse(localStorage.getItem('predLog')||'[]')}catch(e){return []}}
function savePredLog(l){try{localStorage.setItem('predLog',JSON.stringify(l.slice(0,60)))}catch(e){}}
function recordPrediction(top){
  const l=predLog(),today=kstDay();
  if(l.some(x=>x.d===today))return;
  l.unshift({d:today,s:top.name,sc:top.score,hit:null});savePredLog(l);
}
function verifyPredictions(){
  const l=predLog();if(!l.length)return;
  const top3=sectorStats().slice(0,3).map(x=>x.name);
  const today=kstDay();
  let changed=false;
  l.forEach(x=>{
    if(x.hit!==null)return;
    const days=Math.floor((new Date(today)-new Date(x.d))/86400000);
    if(days>=3){x.hit=top3.includes(x.s);changed=true;}
  });
  if(changed)savePredLog(l);
}
function predAccuracy(){
  const done=predLog().filter(x=>x.hit!==null);
  if(!done.length)return null;
  return {n:done.length,hit:done.filter(x=>x.hit).length};
}
let secTab='theme',predShow=3;
/* ===== 테마·업종 세분화 주도 섹터 =====
   기존에는 내장 66종목을 28개 업종으로 묶은 게 전부라 '반도체' 한 덩어리로만 보였다.
   → 네이버 금융의 실제 테마(290여 개)·업종(70여 개)을 그대로 가져와
     '반도체 장비 / 반도체 재료·부품 / 시스템반도체 / HBM / 전력반도체'처럼 세분화한다. */
const thmCache={}, thmStockCache={};
let thmLoading={}, thmError={}, thmQuery='', thmSort='rate_desc', thmLimit=40, thmOpen=null;
const THM_SORTS=[['rate_desc','상승률 상위'],['rate_asc','하락률 상위'],['up_desc','상승 종목 많은 순'],['name','이름순']];

async function loadThemes(type){
  if(thmCache[type])return thmCache[type];
  if(thmLoading[type])return null;
  thmLoading[type]=true; thmError[type]=false;
  try{
    fnBump();
    const r=await fetch('/api/themes?type='+type,{cache:'default'});
    const j=await r.json();
    const items=(j&&j.items)||[];
    if(items.length)thmCache[type]=items; else thmError[type]=true;
  }catch(e){ thmError[type]=true; }
  thmLoading[type]=false;
  if(currentView==='sector'&&(secTab===type))renderThemes();
  return thmCache[type]||null;
}

function thmFiltered(){
  const list=(thmCache[secTab]||[]).slice();
  const q=thmQuery.trim().toLowerCase().replace(/\s+/g,'');
  const hit=q?list.filter(x=>String(x.name).toLowerCase().replace(/\s+/g,'').includes(q)
    ||(x.leaders||[]).some(l=>String(l.name).toLowerCase().replace(/\s+/g,'').includes(q))):list;
  const val=(x)=>x.rate==null?-999:x.rate;
  if(thmSort==='rate_desc')hit.sort((a,b)=>val(b)-val(a));
  if(thmSort==='rate_asc')hit.sort((a,b)=>val(a)-val(b));
  if(thmSort==='up_desc')hit.sort((a,b)=>(b.up||0)-(a.up||0)||val(b)-val(a));
  if(thmSort==='name')hit.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko'));
  return hit;
}

function thmRowHtml(g,rank){
  const dir=dirOf(g.rate==null?0:g.rate);
  const open=thmOpen===g.no;
  const leaders=(g.leaders||[]).map(l=>l.name).filter(Boolean).slice(0,2).join(' · ');
  return `<div class="thm-row ${open?'open':''}" data-no="${g.no}">
      <span class="c1"><span class="thm-rk${rank<=3?' top':''}">${rank}</span>
        <b>${g.name}</b>${leaders?`<i>${leaders}</i>`:''}</span>
      <span class="c2 num up">${g.up==null?'—':g.up}</span>
      <span class="c3 num down">${g.down==null?'—':g.down}</span>
      <span class="c4 num ${dir}">${g.rate==null?'—':pctS(g.rate)}</span>
    </div>
    <div class="thm-detail" id="thmd-${g.no}" ${open?'':'hidden'}></div>`;
}

function renderThemes(){
  const rows=$('thmRows'); if(!rows)return;
  const sorts=$('thmSorts');
  if(sorts){sorts.innerHTML=THM_SORTS.map(([v,l])=>`<button class="${thmSort===v?'on':''}" data-s="${v}">${l}</button>`).join('');
    sorts.querySelectorAll('button').forEach(b=>b.onclick=()=>{thmSort=b.dataset.s;thmLimit=40;renderThemes();});}
  const cx=$('thmClear'); if(cx)cx.hidden=!thmQuery;

  const all=thmCache[secTab];
  if(!all){
    rows.innerHTML=thmError[secTab]
      ?'<div class="empty">목록을 불러오지 못했습니다. <button class="etf-more" id="thmRetry">다시 시도</button></div>'
      :'<div class="empty">'+(secTab==='upjong'?'업종':'테마')+' 목록을 불러오는 중…</div>';
    const rt=$('thmRetry'); if(rt)rt.onclick=()=>{delete thmCache[secTab];thmError[secTab]=false;renderThemes();loadThemes(secTab);};
    if(!thmError[secTab])loadThemes(secTab);
    const sm=$('thmSum'); if(sm)sm.innerHTML='';
    const mb=$('thmMore'); if(mb)mb.hidden=true;
    return;
  }
  const list=thmFiltered();
  // 요약: 전체 중 오른 섹터 비율
  const sm=$('thmSum');
  if(sm){
    const withRate=all.filter(x=>x.rate!=null);
    const up=withRate.filter(x=>x.rate>0).length;
    const top=withRate.slice().sort((a,b)=>b.rate-a.rate)[0];
    const bot=withRate.slice().sort((a,b)=>a.rate-b.rate)[0];
    sm.innerHTML=`<b>${all.length.toLocaleString()}개</b> ${secTab==='upjong'?'업종':'테마'} 중
      <b class="up">${up}개 상승</b> · <b class="down">${withRate.length-up}개 하락</b>
      ${top?`<span>최강 <b>${top.name}</b> <em class="up">${pctS(top.rate)}</em></span>`:''}
      ${bot?`<span>최약 <b>${bot.name}</b> <em class="down">${pctS(bot.rate)}</em></span>`:''}
      ${thmQuery?`<span class="thm-q">‘${thmQuery}’ 검색 결과 ${list.length}건</span>`:''}`;
  }
  {
  }
  if(!list.length){rows.innerHTML='<div class="empty">검색 결과가 없습니다.</div>';const mb=$('thmMore');if(mb)mb.hidden=true;return;}
  rows.innerHTML=list.slice(0,thmLimit).map((g,i)=>thmRowHtml(g,i+1)).join('');
  const more=$('thmMore');
  if(more){more.hidden=list.length<=thmLimit;
    more.textContent=`더보기 (${Math.min(thmLimit,list.length)} / ${list.length})`;
    more.onclick=()=>{thmLimit+=40;renderThemes();};}
  rows.querySelectorAll('.thm-row').forEach(r=>r.onclick=()=>toggleTheme(r.dataset.no));
  if(thmOpen)renderThemeDetail(thmOpen);
}

function toggleTheme(no){
  thmOpen=(thmOpen===no)?null:no;
  renderThemes();
  if(thmOpen)loadThemeStocks(secTab,thmOpen);
}

async function loadThemeStocks(type,no){
  const key=type+':'+no;
  if(thmStockCache[key]){renderThemeDetail(no);return;}
  renderThemeDetail(no);
  try{
    fnBump();
    const r=await fetch(`/api/themestocks?type=${type}&no=${no}`,{cache:'default'});
    const j=await r.json();
    thmStockCache[key]=(j&&j.items)||[];
  }catch(e){ thmStockCache[key]=[]; }
  const codes=(thmStockCache[key]||[]).map(x=>x.code);
  codes.forEach(c=>{const it=thmStockCache[key].find(y=>y.code===c);ensureStock(c,it&&it.name);});
  await primeQuotes(codes.slice(0,80));
  ensureNxtBatch(codes.slice(0,40));
  primeNxtQuotes(codes.slice(0,32));
  if(thmOpen===no)renderThemeDetail(no);
}

function renderThemeDetail(no){
  const el=$('thmd-'+no); if(!el)return;
  const key=secTab+':'+no;
  const items=thmStockCache[key];
  if(!items){el.innerHTML='<div class="thm-load">구성 종목을 불러오는 중…</div>';return;}
  if(!items.length){el.innerHTML='<div class="thm-load">구성 종목을 확인할 수 없습니다.</div>';return;}
  const rows=items.map(x=>{
    const q=dispQuote(x.code);
    const px=q&&q.price!=null?q.price:null, pv=q?q.prevClose:null;
    const r=(px!=null&&pv)?((px-pv)/pv*100):null;
    return {...x,px,r,src:q&&q.src};
  }).sort((a,b)=>(b.r==null?-999:b.r)-(a.r==null?-999:a.r));
  const up=rows.filter(x=>x.r!=null&&x.r>0).length, valid=rows.filter(x=>x.r!=null).length;
  const avg=valid?rows.filter(x=>x.r!=null).reduce((a,b)=>a+b.r,0)/valid:null;
  el.innerHTML=`<div class="thm-d-top">구성 종목 <b>${rows.length}</b>개
      ${valid?` · 실시간 상승 <b class="up">${up}</b> / 하락 <b class="down">${valid-up}</b> · 평균 <b class="${dirOf(avg)}">${avg==null?'—':pctS(avg)}</b>`:''}
    </div>
    <div class="thm-d-list">${rows.slice(0,40).map(x=>`
      <div class="thm-s" data-code="${x.code}">
        <span class="ts-n">${stockLogo(x.code,x.name,'xs')}${x.name}<i>${x.code}</i></span>
        <span class="ts-p num">${mktBadgeHtml(x.code)}${x.px!=null?KRW(x.px):'—'}</span>
        <span class="ts-r num ${dirOf(x.r==null?0:x.r)}">${x.r==null?'—':pctS(x.r)}</span>
      </div>`).join('')}</div>
    ${rows.length>40?`<div class="thm-d-note">상위 40종목만 표시합니다.</div>`:''}`;
  el.querySelectorAll('.thm-s').forEach(n=>n.onclick=(e)=>{e.stopPropagation();openTrade(n.dataset.code);});
}

function setSecTab(t){
  secTab=t;
  document.querySelectorAll('#secTabs button').forEach(b=>b.classList.toggle('on',b.dataset.st===t));
  const g=$('secPaneGroup'),l=$('secPaneLive'),a=$('secPaneAi');
  const isGroup=(t==='theme'||t==='upjong');
  if(g)g.hidden=!isGroup; if(l)l.hidden=(t!=='live'); if(a)a.hidden=(t!=='ai');
  if(isGroup){thmLimit=40;thmOpen=null;renderThemes();loadThemes(t);}
  else if(t==='live')renderSector();
  else renderPredict();
}
function renderPredict(){
  const el=$('predBody');if(!el)return;
  const P=predictSectors();
  if(!P){el.innerHTML='<div class="empty">시세를 더 받아온 뒤 예측을 계산합니다…</div>';return;}
  verifyPredictions();recordPrediction(P.list[0]);
  const acc=predAccuracy();
  const top=P.list.slice(0,predShow);
  const p2=n=>String(n).padStart(2,'0');const nw=new Date(P.at);
  const cards=top.map((r,i)=>{
    const e=P.eta(r.score);
    const conf=Math.max(15,Math.min(95,P.conf-i*12));
    return `<div class="pred-card ${i===0?'lead':''}" data-sec="${r.name}">
      <div class="pc-top"><span class="pc-rank">${i+1}순위</span><span class="pc-score num">${r.score}<i>점</i></span></div>
      <div class="pc-name">${r.name}</div>
      <div class="pc-eta"><span class="pc-eta-k">예상 주목 시점</span><b>${e.t}</b><i>${e.d}</i></div>
      <div class="pc-bars">${r.parts.map(pt=>`<div class="pc-bar"><span>${pt.k}</span>
        <div class="pcb"><i style="width:${Math.round(pt.v*100)}%"></i></div><em class="num">${Math.round(pt.v*100)}</em></div>`).join('')}</div>
      <div class="pc-tags">${r.tags.length?r.tags.map(t=>`<span>${t}</span>`).join(''):'<span class="mute">특이 신호 없음</span>'}</div>
      <div class="pc-conf"><span>신뢰도</span><div class="pcc"><i style="width:${conf}%"></i></div><em class="num">${conf}%</em></div>
      <div class="pc-now">현재 등락 <b class="num ${dirOf(r.avg)}">${pctS(r.avg)}</b> · 시장 대비 <b class="num ${dirOf(r.rel)}">${pctS(r.rel)}</b></div>
    </div>`;
  }).join('');
  const rot=P.leader?`<div class="pred-rot"><span class="rot-k">현재 주도</span><b>${P.leader}</b><span class="rot-a">→</span>
    <span class="rot-k">다음 후보</span>${top.map(r=>`<b class="cand">${r.name}</b>`).join('<span class="rot-d">·</span>')}</div>`:'';
  el.innerHTML=`
    <div class="pred-head">
      <div class="ph-l"><b>AI 다음 주도 섹터 예측</b>
        <span>실시간 시세 기반 · ${p2(nw.getHours())}:${p2(nw.getMinutes())}:${p2(nw.getSeconds())} 계산</span></div>
      <div class="ph-r">${acc?`<span class="pred-acc">최근 적중률 <b>${Math.round(acc.hit/acc.n*100)}%</b> (${acc.hit}/${acc.n})</span>`:''}
        <button id="predRefresh">다시 계산</button></div>
    </div>
    ${rot}
    <div class="pred-grid">${cards}</div>
    ${P.list.length>3?`<button class="etf-more" id="predMore">${predShow>=P.list.length?'접기 ▲':`더보기 (${predShow} / ${P.list.length}개 섹터) ▼`}</button>`:''}
    <div class="pred-note">전 종목의 <b>당일 거래대금·고저 대비 종가 위치·시장 대비 상대강도·섹터 내 상승 참여 폭</b>을 종합해
      아직 크게 오르지 않았지만 자금이 유입되는 섹터를 찾아내는 <b>규칙 기반 모델</b>입니다.
      과거 데이터로 계산한 추정이며 <b>미래 수익을 보장하지 않습니다.</b> 투자 판단과 그 결과는 투자자 본인에게 귀속됩니다.</div>`;
  const rb=$('predRefresh');if(rb)rb.onclick=()=>renderPredict();
  const mb=$('predMore');
  if(mb)mb.onclick=()=>{predShow=(predShow>=P.list.length)?3:Math.min(P.list.length,predShow+3);renderPredict();};
  el.querySelectorAll('.pred-card').forEach(c=>c.onclick=()=>{sectorOpen=c.dataset.sec;renderSector();
    const t=document.querySelector('.sec-card');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});});
}

function sectorStats(){
  const rows=[];
  for(const [name,codes] of Object.entries(SECTORS)){
    const items=codes.map(c=>byCode[c]).filter(s=>s.price!=null&&s.prevClose);
    if(!items.length)continue;
    let sum=0,up=0,down=0;
    items.forEach(s=>{const p=(s.price-s.prevClose)/s.prevClose*100;sum+=p;if(p>0)up++;else if(p<0)down++;});
    const avg=sum/items.length;
    const stocks=items.map(s=>({s,p:(s.price-s.prevClose)/s.prevClose*100})).sort((a,b)=>b.p-a.p);
    rows.push({name,avg,up,down,n:items.length,stocks});
  }
  return rows.sort((a,b)=>b.avg-a.avg);
}
function renderSector(){
  const rows=sectorStats();
  if(!rows.length){
    const msg=secError?'시세를 불러오지 못했습니다. <button class="etf-more" id="secRetry">다시 시도</button>'
      :(secLoaded?'표시할 종목이 없습니다.':'시세 수신 중… 잠시만 기다려 주세요.');
    $('sectorBody').innerHTML='<div class="panel"><div class="empty">'+msg+'</div></div>';
    const rb=$('secRetry');if(rb)rb.onclick=()=>{secLoaded=false;secError=false;pollSectors();};
    return;}
  const maxAbs=Math.max(...rows.map(r=>Math.abs(r.avg)),0.5);
  $('sectorBody').innerHTML=rows.map((r,i)=>{
    const dir=dirOf(r.avg),col=r.avg>0?UP:r.avg<0?DOWN:'#8a95a5';
    const w=Math.max(4,Math.abs(r.avg)/maxAbs*100);
    const open=sectorOpen===r.name;
    const chips=r.stocks.map(({s,p})=>`<div class="sec-chip" data-code="${s.code}"><span>${s.name}</span><span class="c ${dirOf(p)}">${pctS(p)}</span></div>`).join('');
    return `<div class="panel sec-card">
      <div class="sec-hd" data-sec="${r.name}">
        <div class="sec-rank ${i===0?'top':''}">${i+1}</div>
        <div><div class="sec-nm">${r.name}</div><div class="sec-meta">${r.n}개 종목 · ▲${r.up} ▼${r.down} · ${open?'접기 ▲':'종목 보기 ▼'}</div>
          <div class="sec-bar"><i style="width:${w}%;background:${col}"></i></div></div>
        <div class="sec-chg ${dir}">${pctS(r.avg)}</div>
      </div>
      ${open?`<div class="sec-stocks">${chips}</div>`:''}
    </div>`;}).join('');
  $('sectorBody').querySelectorAll('.sec-hd').forEach(h=>h.onclick=()=>{sectorOpen=sectorOpen===h.dataset.sec?null:h.dataset.sec;renderSector();});
  bindStockClicks($('sectorBody'));
}

/* ===== 리스트/홈 ===== */
function listByChange(codes){
  const r=(s)=>{const q=(typeof dq==='function')?dq(s.code):dispQuote(s.code);
    const p=q&&q.price!=null?q.price:s.price,pv=q&&q.prevClose?q.prevClose:s.prevClose;
    return (pv&&p!=null)?(p-pv)/pv:-9;};
  return codes.map(c=>byCode[c]).filter(Boolean).sort((a,b)=>r(b)-r(a));}
function miniRow(s){
  const _mq=dispQuote(s.code);                                     // [수정] 통합가 기준으로 가격·등락 통일
  const px=(_mq&&_mq.price!=null)?_mq.price:s.price,pv=(_mq&&_mq.prevClose)||s.prevClose;
  const diff=(px!=null&&pv)?px-pv:null,p=diff!=null?diff/pv*100:null,dir=diff==null?'flat':dirOf(diff);
  return `<div class="mini-row" data-code="${s.code}"><div class="sr-l">${stockLogo(s.code,s.name,'sm')}<div class="sr-t"><div class="nm">${s.name}</div><div class="cd num">${s.code}</div></div></div>
    <div class="px num ${dir}">${KRW(px)}</div><div class="ch num ${dir}">${diff==null?'—':arrow(dir)+' '+pctS(p)}</div></div>`;}
/* [D6] 내 관심종목 오늘 요약 — [수정] 개장 전·접속 직후처럼 시세가 아직 없을 때
   '표시할 종목이 없어요'라고 잘못 말하던 것을 '시세 수신 중'으로 바꾸고, 시세가 오면 자동으로 채운다. */
function renderMySum(){const el=$('myWatchSum'); if(!el)return;
    let tab=userPrefs.homeSumTab||'all';
    if(tab!=='all'&&!watchFolders.some(f=>f.id===tab)){tab='all';userPrefs.homeSumTab='all';}
    const src=tab==='all'?watchlist:(watchFolders.find(f=>f.id===tab)||{codes:[]}).codes.filter(c=>watchlist.includes(c));
    const rows=src.map(c=>byCode[c]).filter(Boolean);
    const chgs=rows.map(s=>({s,p:chgPct(s)})).filter(x=>x.p!=null);
    const selHtml=watchFolders.length?`<select class="ms-sel" id="msSel">${['all',...watchFolders.map(f=>f.id)].map(id=>{
        const f=watchFolders.find(x=>x.id===id);
        return `<option value="${id}"${tab===id?' selected':''}>${id==='all'?'전체':(f.icon?f.icon+' ':'')+f.name}</option>`;}).join('')}</select>`:'';
    if(!chgs.length){
      if(rows.length){
        const sn=rows.map(st=>({s:st,p:(sessSnap&&sessSnap.q&&sessSnap.q[st.code])?sessSnap.q[st.code][0]:null})).filter(x=>x.p!=null);
        if(sn.length){   // [수정] 마지막 장 스냅샷으로 요약 — '받는 중'만 떠 있던 문제
          const up=sn.filter(x=>x.p>0).length,dn=sn.filter(x=>x.p<0).length;
          const best=sn.slice().sort((a,b)=>b.p-a.p)[0];
          el.hidden=false;
          el.innerHTML=`<b>MY 관심종목</b> ${selHtml} <span>상승 <i class="up">${up}</i> · 하락 <i class="down">${dn}</i> <i class="ms-basis">마지막 장 기준</i></span>`
            +(best?` · 베스트 <span class="ms-best" data-code="${best.s.code}">${best.s.name} <i class="${best.p>=0?'up':'down'}">${pctS(best.p)}</i></span>`:'');
          const bb=el.querySelector('.ms-best'); if(bb)bb.onclick=()=>openTrade(bb.dataset.code);
          const sp2=$('msSel'); if(sp2)sp2.onchange=()=>{userPrefs.homeSumTab=sp2.value;savePrefs();renderMySum();};
          const tries2=+(el.dataset.rt||0);
          if(tries2<8){el.dataset.rt=tries2+1;clearTimeout(el._rt);el._rt=setTimeout(()=>{if(currentView==='home')renderMySum();},2500);}
          return;
        }
        el.hidden=false;
        el.innerHTML=`<b>MY 관심종목</b> ${selHtml} <span class="ms-empty">실시간 시세 받는 중…</span>`;
        const tries=+(el.dataset.rt||0);
        if(tries<8){el.dataset.rt=tries+1;clearTimeout(el._rt);el._rt=setTimeout(()=>{if(currentView==='home')renderMySum();},2500);}
        const sp=$('msSel'); if(sp)sp.onchange=()=>{userPrefs.homeSumTab=sp.value;savePrefs();renderMySum();};
        return;
      }
      /* [v3.0.1] 관심종목·폴더가 하나도 없을 때 빈 흰 상자만 덩그러니 남던 문제.
         원인 둘: ① .mysum 의 display:flex 가 hidden 속성의 display:none 을 이겨서
         숨겨지지도 않았고 ② 숨기는 것 자체가 답이 아니었다 — 뭘 해야 할지 알려 줘야 한다. */
      if(!watchFolders.length&&!watchlist.length){
        el.hidden=false;
        el.innerHTML=`<b>MY 관심종목</b> <span class="ms-empty">아직 담은 종목이 없어요. 종목을 담으면 여기서 등락을 한눈에 볼 수 있어요.</span>`
          +`<button class="ms-go" id="msGo">종목 담으러 가기 →</button>`;
        const gb=$('msGo'); if(gb)gb.onclick=()=>showView('search');
        return;
      }
      if(!watchFolders.length){
        el.hidden=false;
        el.innerHTML=`<b>MY 관심종목</b> <span class="ms-empty">담은 종목 ${watchlist.length}개의 시세를 불러오는 중이에요.</span>`;
        return;
      }
      el.hidden=false;
      el.innerHTML=`<b>MY 관심종목</b> ${selHtml} <span class="ms-empty">이 폴더에 담긴 종목이 없어요</span>`;
    }else{
      el.dataset.rt=0;
      const up=chgs.filter(x=>x.p>0).length,dn=chgs.filter(x=>x.p<0).length;
      const best=chgs.slice().sort((a,b)=>b.p-a.p)[0];
      el.hidden=false;
      el.innerHTML=`<b>MY 관심종목</b> ${selHtml} <span>상승 <i class="up">${up}</i> · 하락 <i class="down">${dn}</i></span>`
        +(best?` · 베스트 <span class="ms-best" data-code="${best.s.code}">${best.s.name} <i class="${best.p>=0?'up':'down'}">${pctS(best.p)}</i></span>`:'');
      const b=el.querySelector('.ms-best'); if(b)b.onclick=()=>openTrade(b.dataset.code);
    }
    const sel=$('msSel'); if(sel)sel.onchange=()=>{userPrefs.homeSumTab=sel.value;savePrefs();renderMySum();};
}
/* [v2.3.1] 히어로 우측 '오늘의 시장' — 마켓 무드 엔진 재사용(지수·업종·뉴스 심리 종합) */
/* [v3.2] 지수 자가진단 보관소 — 콘솔에서 __idxCheck() 로 확인 */
let idxHealth=null;
try{ window.__idxCheck=()=>idxHealth||'아직 지수를 받지 않았습니다. 홈 화면을 한 번 열어 주세요.'; }catch(e){}
/* ══ [v4.41] '오늘의 시장'에 미국 시장을 함께 담는다 ═════════════════════════
   국내 지수만 보여 주던 카드에, 미국 장 상태와 대표 지수 ETF(S&P500·나스닥100)
   등락을 붙여 하루의 흐름을 한 카드에서 이어 볼 수 있게 한다. */
function usMoodHtml(){
  try{
    const ses=usSession();
    const pick=(t,nm)=>{const q=usQ[t]; if(!q||q.price==null||!q.prev)return '';
      const r=(q.price-q.prev)/q.prev*100;
      return `<span class="hm-i"><i>${nm}</i><b class="num ${r>=0?'up':'down'}">${pctS(r)}</b></span>`;};
    const rows=pick('SPY','S&P500')+pick('QQQ','나스닥100');
    const dot=ses.phase==='regular'?'on':ses.phase==='closed'?'off':'ext';
    if(!rows){
      usEnsureQuotes(['SPY','QQQ'],true).then(()=>{if(currentView==='home')renderHeroMarket();});
      return `<div class="hm-us"><span class="hm-usl"><i class="hmu-dot ${dot}"></i>🇺🇸 ${ses.label}</span>
        <span class="hm-uswait">지수 수신 중…</span></div>`;
    }
    return `<div class="hm-us"><span class="hm-usl"><i class="hmu-dot ${dot}"></i>🇺🇸 ${ses.label}</span>
      <span class="hm-usi">${rows}</span></div>`;
  }catch(e){ return ''; }
}
function renderHeroMarket(){
  const el=$('heroMarket');if(!el)return;
  try{
    const m=marketMood();
    const ks=(market.indices||[]).find(x=>x.key==='KOSPI'),kq=(market.indices||[]).find(x=>x.key==='KOSDAQ');
    const idx=(o,nm)=>o&&o.rate!=null?`<span class="hm-i"><i>${nm}</i><b class="num ${o.rate>=0?'up':'down'}">${pctS(o.rate)}</b></span>`:'';
    const drv=(m.drivers||[]).slice(0,2).map(d=>`<span class="hm-d ${d[1]}">${d[0]}</span>`).join('');
    el.innerHTML=`<div class="hm-top"><span class="hm-t">오늘의 시장</span><span class="hm-lb ${m.score>=58?'up':m.score<=41?'down':''}">${m.label}</span></div>
      <div class="hm-score"><b class="num">${m.score}</b><span>/100</span></div>
      <div class="hm-gauge"><i style="width:${m.score}%"></i></div>
      <div class="hm-idx">${idx(ks,'코스피')}${idx(kq,'코스닥')}</div>
      ${usMoodHtml()}
      ${drv?`<div class="hm-drv">${drv}</div>`:''}
      ${invCache?`<div class="hm-invrow">${invLineHtml(invCache)}</div>`:''}
      <div class="hm-go">AI 브리핑 자세히 →</div>`;
  if(!invCache)ensureInvestors().then(v=>{if(v&&currentView==='home')renderHeroMarket();});
  }catch(e){el.innerHTML='<div class="hm-load">시장 온도를 재는 중…</div>';}
}
{const hm=$('heroMarket');
 if(hm){const go=()=>{const t=$('aiBrief');if(t)(t.closest('.sec')||t).scrollIntoView({behavior:'smooth',block:'start'});};
   hm.onclick=go;hm.onkeydown=(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};}}
/* ══ [v2.5.2] 내 계좌 신규 코너 4종 ══ */
const ALLOC_COL=['#5b8def','#f0688f','#f5b544','#3fc7a8','#9b7bf0','#4fb3f6','#f2884b'];
const ALLOC_CASH='#c3ccd8';
/* ① 자산 구성 도넛 — 보유 종목 평가금액 + 예수금 비중 */
function drawAlloc(){
  const wrap=$('allocCard'),cv=$('allocCv'),lg=$('allocLegend');
  if(!wrap||!cv||!lg)return;
  const items=[];
  /* [v4.34] 평가액 계산을 헬퍼로 바꾸면서 st 를 없앴는데 아래에서 그대로 쓰고 있었다
     → 'st is not defined' 로 자산 구성 그래프가 매번 죽었다. */
  holdings.forEach(h=>{const st=byCode[h.code]||{}; const v=hEvalKRW(h);
    if(v>0)items.push({name:st.name||(h.us&&usMeta[h.code]?usMeta[h.code].kr:h.code),code:h.code,v});});
  if(!items.length){wrap.hidden=true;return;}
  items.sort((a,b)=>b.v-a.v);
  const list=items.slice(0,6),rest=items.slice(6);
  if(rest.length)list.push({name:'기타 '+rest.length+'종목',v:rest.reduce((a,x)=>a+x.v,0)});
  if(cash>0)list.push({name:'예수금',v:cash,cash:1});
  {const ud=Math.round((+usdCash||0)*(usFx()||0)); if(ud>0)list.push({name:'달러 예수금',v:ud,cash:1});}
  const total=list.reduce((a,x)=>a+x.v,0);
  if(!(total>0)){wrap.hidden=true;return;}
  wrap.hidden=false;
  /* 캔버스는 CSS 표시 크기만 기준으로 잡는다(자기증식 방지) */
  const W=cv.clientWidth||150,H=cv.clientHeight||150,dpr=window.devicePixelRatio||1;
  cv.width=W*dpr;cv.height=H*dpr;
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);
  const cx=W/2,cy=H/2,R=Math.min(W,H)/2-3,r=R*0.63;
  let a0=-Math.PI/2;
  list.forEach((it,i)=>{
    const a1=a0+(it.v/total)*Math.PI*2;
    x.beginPath();x.moveTo(cx,cy);x.arc(cx,cy,R,a0,a1);x.closePath();
    x.fillStyle=it.cash?ALLOC_CASH:ALLOC_COL[i%ALLOC_COL.length];x.fill();
    a0=a1;
  });
  x.globalCompositeOperation='destination-out';
  x.beginPath();x.arc(cx,cy,r,0,Math.PI*2);x.fill();
  x.globalCompositeOperation='source-over';
  x.textAlign='center';x.textBaseline='middle';
  x.fillStyle=getCss('--text','#101828');x.font='900 13px Pretendard,system-ui';
  x.fillText(KRW(Math.round(total/10000))+'만',cx,cy-3);
  x.fillStyle=getCss('--sub-2','#8b95a5');x.font='800 9px Pretendard,system-ui';
  x.fillText('총자산',cx,cy+13);
  lg.innerHTML=list.map((it,i)=>`<button class="al-r"${it.code?` data-code="${it.code}"`:''}>
    <i style="background:${it.cash?ALLOC_CASH:ALLOC_COL[i%ALLOC_COL.length]}"></i>
    <span>${it.name}</span><b class="num">${(it.v/total*100).toFixed(1)}%</b></button>`).join('');
  lg.querySelectorAll('.al-r[data-code]').forEach(b=>b.onclick=()=>openTrade(b.dataset.code));
}
/* ② 손익 순위 — 보유 종목 수익률 상·하위 */
function renderTopMovers(){
  const el=$('moversCard');if(!el)return;
  const rows=holdings.map(h=>{
    const st=byCode[h.code],px=(st&&st.price!=null)?st.price:null;
    if(px==null||!(h.avg>0))return null;
    return {name:(st&&st.name)||h.code,code:h.code,rate:(px-h.avg)/h.avg*100,pnl:(px-h.avg)*h.qty};
  }).filter(Boolean);
  if(rows.length<2){el.hidden=true;return;}
  el.hidden=false;
  const srt=rows.slice().sort((a,b)=>b.rate-a.rate);
  const best=srt.slice(0,3);
  const worst=srt.slice(-3).reverse().filter(x=>best.indexOf(x)<0);
  const mx=Math.max(1,...rows.map(x=>Math.abs(x.rate)));
  const row=(x)=>`<button class="mv-r" data-code="${x.code}">
    ${stockLogo(x.code,x.name,'xs')}<span class="mv-n">${x.name}</span>
    <span class="mv-bar"><i class="${x.rate>=0?'up':'down'}" style="width:${Math.max(6,Math.min(100,Math.abs(x.rate)/mx*100))}%"></i></span>
    <b class="num ${x.rate>=0?'up':'down'}">${pctS(x.rate)}</b>
    <span class="mv-p num ${x.rate>=0?'up':'down'}">${signed(Math.round(x.pnl))}</span></button>`;
  el.innerHTML=`<div class="sec-title" style="margin-top:16px">손익 순위 <span class="sec-sub">· 평단 대비 수익률</span></div>
    <div class="panel mv-panel"><div class="mv-h">📈 수익 상위</div>${best.map(row).join('')}
    ${worst.length?`<div class="mv-h dn">📉 손실 상위</div>${worst.map(row).join('')}`:''}</div>`;
  el.querySelectorAll('.mv-r').forEach(b=>b.onclick=()=>openTrade(b.dataset.code));
}
/* ③ 목표 자산 진행률 */
function renderGoalCard(){
  const el=$('goalCard');if(!el)return;
  const cur=totalAssetsNow();
  const goal=Math.max(0,Math.round(+(userPrefs.assetGoal||0)));
  el.innerHTML=`<div class="sec-title" style="margin-top:16px">목표 자산 <span class="sec-sub">· 예수금 포함 총자산 기준</span></div>`
    +(goal>0?`<div class="panel goal-panel">
        <div class="gl-top"><span class="gl-k">${KRW(cur)}원 / ${KRW(goal)}원</span><span class="gl-pct">${Math.min(999,cur/goal*100).toFixed(1)}%</span></div>
        <div class="gl-bar"><i style="width:${Math.max(1,Math.min(100,cur/goal*100))}%"></i></div>
        <div class="gl-foot"><span class="gl-sub">${cur>=goal?'🎉 목표를 달성했어요! 새 목표를 세워 보세요':`목표까지 <b>${KRW(goal-cur)}원</b> 남았어요`}</span>
        <button class="gl-set" id="goalSet">목표 수정</button></div>
      </div>`
    :`<div class="panel goal-panel gl-empty">
        <div class="gl-ic">🎯</div>
        <div><b>목표 자산을 정해 보세요</b><p>목표를 세우면 달성률과 남은 금액을 한눈에 볼 수 있어요.</p></div>
        <button class="gl-set primary" id="goalSet">목표 설정</button>
      </div>`);
  const b=$('goalSet');if(b)b.onclick=openGoalGate;
}
function openGoalGate(){
  const cur=totalAssetsNow();
  openLiteGate('목표 자산 설정',`
    <div class="pm-note" style="margin-top:0">현재 총자산 <b class="num">${KRW(cur)}원</b> · 달성하고 싶은 금액을 입력하세요.</div>
    <div class="fld2"><label>목표 금액 (원)</label><input id="goalIn" class="num" inputmode="numeric" value="${userPrefs.assetGoal||''}" placeholder="예: 20000000"></div>
    <div class="goal-preset">${[10000000,30000000,50000000,100000000].map(v=>`<button data-g="${v}">${v>=100000000?(v/100000000)+'억':(v/10000000)+'천만'}</button>`).join('')}</div>
    <div class="lg-row"><button class="btn-primary" id="goalSave">저장</button><button class="btn-ghost" id="goalClr">목표 해제</button></div>`);
  const inp=$('goalIn');
  document.querySelectorAll('.goal-preset button').forEach(b=>b.onclick=()=>{inp.value=b.dataset.g;});
  $('goalSave').onclick=()=>{
    const v=parseInt(String(inp.value||'').replace(/[^0-9]/g,''))||0;
    if(v<10000){toast('warn','금액을 확인하세요','1만원 이상 입력해 주세요');return;}
    userPrefs.assetGoal=v;savePrefs();closeLiteGate();renderGoalCard();
    toast('buy','목표 자산 설정',KRW(v)+'원');
  };
  $('goalClr').onclick=()=>{delete userPrefs.assetGoal;savePrefs();closeLiteGate();renderGoalCard();toast('warn','목표 해제','');};
}
/* ④ 매매 통계 & 투자 등급 */
const INV_LV=[[0,'🌱','새싹 투자자'],[10,'🐣','주린이'],[30,'🐜','성실한 개미'],[100,'📈','중수 트레이더'],[300,'🏆','베테랑'],[1000,'👑','큰손']];
function renderTradeStats(){
  const el=$('tstatCard');if(!el)return;
  const n=tradeLog.length;
  const sells=tradeLog.filter(r=>r.side==='sell');
  const wins=sells.filter(r=>(r.pnl||0)>0).length;
  const winRate=sells.length?wins/sells.length*100:null;
  const realized=sells.reduce((a,r)=>a+(r.pnl||0),0);
  const avgRoi=sells.length?sells.reduce((a,r)=>a+(r.roi||0),0)/sells.length:null;
  const cnt={};tradeLog.forEach(r=>{cnt[r.name]=(cnt[r.name]||0)+1;});
  const most=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
  let li=0;for(let i=0;i<INV_LV.length;i++)if(n>=INV_LV[i][0])li=i;
  const nx=INV_LV[li+1];
  const prog=nx?Math.min(100,(n-INV_LV[li][0])/(nx[0]-INV_LV[li][0])*100):100;
  const cell=(k,v,cls)=>`<div class="ts-c"><span>${k}</span><b class="num ${cls||''}">${v}</b></div>`;
  el.innerHTML=`<div class="sec-title" style="margin-top:16px">매매 통계 <span class="sec-sub">· 기록된 체결 기준</span></div>
    <div class="panel ts-panel">
      <div class="ts-lv"><div class="ts-badge">${INV_LV[li][1]}</div>
        <div><div class="ts-lvn">${INV_LV[li][2]}</div>
        <div class="ts-lvs">${nx?`다음 등급 <b>${nx[2]}</b>까지 ${nx[0]-n}건`:'최고 등급에 도달했어요'}</div></div></div>
      <div class="ts-prog"><i style="width:${Math.max(2,prog)}%"></i></div>
      <div class="ts-grid">
        ${cell('총 체결',n.toLocaleString()+'건')}
        ${cell('매도 승률',winRate==null?'—':winRate.toFixed(0)+'%')}
        ${cell('실현 손익',sells.length?signed(realized):'—',sells.length?dirOf(realized):'')}
        ${cell('평균 수익률',avgRoi==null?'—':pctS(avgRoi),avgRoi==null?'':dirOf(avgRoi))}
        ${cell('보유 종목',holdings.length+'종목')}
        ${cell('최다 거래',most?most[0]:'—')}
      </div>
      ${n===0?'<div class="ic-n">첫 주문을 넣으면 통계가 쌓이기 시작해요.</div>':''}
    </div>`;
}
function renderAcctExtras(){
  safeRun('alloc',drawAlloc);
  safeRun('movers',renderTopMovers);
  safeRun('goal',renderGoalCard);
  safeRun('tstat',renderTradeStats);
}
/* ══ [v2.5] 클랜(길드) ══ — 계정 기반 · 월간 수익률 리그 · 초대 코드 */
let clanCache=null,_clanBusy=false;
let _bizFull=null;   // [v2.5.3] 사업요약 전문(더보기용)
async function clanCall(action,extra){
  if(!currentUser)return {ok:false,err:'guest'};
  const acc=accounts()[currentUser]||{};
  try{fnBump();
    const r=await fetch('/api/clan',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action,id:currentUser,pass:acc.pass,name:acc.name||currentUser,...extra})});
    return await r.json();
  }catch(e){return {ok:false,err:'net'};}
}
let clanTab='league';
function clanSeenKey(cid){return 'clanSeen:'+cid;}
function clanUnread(){
  const c=clanCache&&clanCache.clan;if(!c||!c.chat)return 0;
  let last='';try{last=localStorage.getItem(clanSeenKey(c.cid))||'';}catch(e){}
  if(!last)return 0;
  const idx=c.chat.findIndex(m=>m.mid===last);
  return idx<0?Math.min(c.chat.length,9):Math.max(0,c.chat.length-1-idx);
}
function clanMarkSeen(){
  const c=clanCache&&clanCache.clan;if(!c||!c.chat||!c.chat.length)return;
  try{localStorage.setItem(clanSeenKey(c.cid),c.chat[c.chat.length-1].mid);}catch(e){}
  paintClanDots();
}
function paintClanDots(){
  const n=clanUnread();
  const d=$('clanDot');if(d)d.hidden=!n;
  const t=$('clanTabChatN');if(t){t.hidden=!n;t.textContent=n>9?'9+':String(n);}
}
async function renderClan(){
  const el=$('clanBody');if(!el)return;
  if(!currentUser){
    el.innerHTML=`<div class="wl-first"><div class="wf-ic">🛡️</div><b>클랜은 로그인 후 이용할 수 있어요</b>
      <p>클랜을 만들거나 초대 코드로 참여해서<br>친구들과 <b>월간 수익률 리그</b>와 <b>채팅</b>을 즐겨 보세요.</p>
      <button class="btn-primary" id="clanLoginGo">로그인 / 회원가입</button></div>`;
    const b=$('clanLoginGo');if(b)b.onclick=()=>{$('authGate').hidden=false;};
    return;
  }
  if(!clanCache&&!_clanBusy){
    _clanBusy=true;el.innerHTML='<div class="empty">클랜 정보를 불러오는 중…</div>';
    const r=await clanCall('get',{ym:monthPerf().ym});_clanBusy=false;
    if(r&&r.ok)clanCache=r;
    else{el.innerHTML=`<div class="empty">클랜 서버 연결 실패 (${(r&&r.err)||'net'})<br>잠시 후 다시 시도해 주세요.</div>`;return;}
  }
  const c=clanCache&&clanCache.clan;
  if(!c){renderClanLobby(el);return;}
  const staff=c.leader===c.me||(c.members.find(m=>m.id===c.me)||{}).role==='sub';
  el.innerHTML=`
    <div class="clan-hero panel">
      <div class="ch-l"><div class="ch-ic">${c.emblem||'🛡️'}</div>
        <div><div class="ch-nm">${c.name} <span class="ch-lv">Lv.${c.level?c.level.lv:1}</span></div>
        <div class="ch-sub">멤버 ${c.members.length}/30 · ${new Date(c.createdAt).toLocaleDateString('ko-KR')} 창설 · ${c.open?'공개':'비공개'} 클랜${c.leader===c.me?' · 내가 리더':staff?' · 부리더':''}</div>
        ${c.intro?`<div class="ch-intro">${c.intro}</div>`:''}</div></div>
      <div class="ch-r">
        <button class="ch-code" id="clanCodeBtn" title="탭하면 복사">초대 코드 <b>${c.code}</b> 📋</button>
        ${c.leader===c.me?'<button class="ch-adm" id="clanAdm">⚙ 관리</button>':''}
      </div>
    </div>
    <div id="clanNotice"></div>
    <div class="clan-tabs" id="clanTabs">
      <button data-ct="league" class="${clanTab==='league'?'on':''}">🏆 리그</button>
      <button data-ct="chat" class="${clanTab==='chat'?'on':''}">💬 채팅<i class="ct-n" id="clanTabChatN" hidden></i></button>
      <button data-ct="feed" class="${clanTab==='feed'?'on':''}">📋 활동</button>
      <button data-ct="explore" class="${clanTab==='explore'?'on':''}">🔎 탐색</button>
    </div>
    <div id="clanPane"></div>
    <div class="clan-foot"><button class="btn-ghost" id="clanLeave">${c.leader===c.me&&c.members.length>1?'클랜 나가기(리더 자동 위임)':c.leader===c.me?'클랜 해체':'클랜 나가기'}</button></div>`;
  $('clanCodeBtn').onclick=()=>{try{navigator.clipboard.writeText(c.code);toast('buy','초대 코드 복사',c.code);}catch(e){toast('on','초대 코드',c.code);}};
  const adm=$('clanAdm');if(adm)adm.onclick=openClanAdmin;
  $('clanTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{clanTab=b.dataset.ct;renderClan();});
  $('clanLeave').onclick=async()=>{
    const ok=await askConfirm('클랜 나가기',c.leader===c.me&&c.members.length<=1?'클랜이 해체됩니다. 계속할까요?':'클랜에서 나갈까요?',{okLabel:'나가기',danger:true});
    if(!ok)return;
    const r=await clanCall('leave');
    if(r.ok){clanCache=null;toast('warn','클랜에서 나왔습니다','');renderClan();}};
  paintClan();
  clanAutoSync(true);
}
/* 클랜 미가입 화면 — 창설 · 코드 참여 · 공개 클랜 탐색 */
async function renderClanLobby(el){
  el.innerHTML=`<div class="clan-join">
      <div class="cj-card"><div class="cj-ic">🏗️</div><b>클랜 만들기</b><p>엠블럼과 이름을 정해 내 클랜을 창설합니다.</p>
        <div class="em-grid" id="emGrid"></div>
        <input id="cjName" maxlength="16" placeholder="클랜 이름 (2~16자)">
        <input id="cjIntro" maxlength="60" placeholder="한 줄 소개 (선택)">
        <label class="cj-open"><input type="checkbox" id="cjOpen" checked> 공개 클랜(탐색 목록에 노출)</label>
        <button class="btn-primary" id="cjCreate">창설</button></div>
      <div class="cj-card"><div class="cj-ic">🎟️</div><b>초대 코드로 참여</b><p>친구에게 받은 6자리 코드를 입력하세요.</p>
        <input id="cjCode" maxlength="6" placeholder="예: K7X2M9" style="text-transform:uppercase"><button class="btn-primary" id="cjJoin">참여</button></div>
    </div>
    <div class="sec-title" style="margin-top:18px">공개 클랜 탐색 <span class="sec-sub">· 평균 수익률 순</span></div>
    <div class="fr-add panel"><input id="clSearch" maxlength="16" placeholder="클랜 이름 검색"><button class="btn-primary" id="clSearchGo">검색</button></div>
    <div class="panel fr-list" id="clanList"><div class="empty">공개 클랜을 불러오는 중…</div></div>
    <div class="pm-note">클랜은 최대 30명 · 자산 금액은 공유되지 않고 <b>월간 수익률(%)만</b> 리그에 표시됩니다. 매달 1일 순위가 초기화되고 지난 시즌 1위는 명예의 전당에 남습니다.</div>`;
  let emblem='🛡️';
  const EMB=['🛡️','⚔️','🔥','🚀','💎','🐂','🐻','🦅','🌙','⭐','🍀','👑'];
  const eg=$('emGrid');
  const paintEm=()=>{eg.innerHTML=EMB.map(e=>`<button class="em-o ${e===emblem?'on':''}" data-em="${e}">${e}</button>`).join('');
    eg.querySelectorAll('button').forEach(b=>b.onclick=()=>{emblem=b.dataset.em;paintEm();});};
  paintEm();
  $('cjCreate').onclick=async()=>{const nm=($('cjName').value||'').trim();
    if(nm.length<2){toast('warn','클랜 이름은 2자 이상','');return;}
    const r=await clanCall('create',{clanName:nm,emblem,intro:$('cjIntro').value,open:$('cjOpen').checked,ym:monthPerf().ym});
    if(r.ok){clanCache=r;toast('buy','클랜 창설!',nm);renderClan();clanAutoSync(true);}
    else toast('warn','창설 실패',r.err==='already'?'이미 클랜에 속해 있어요':r.err||'');};
  $('cjJoin').onclick=async()=>{const cd=($('cjCode').value||'').trim().toUpperCase();
    if(cd.length<4){toast('warn','코드를 확인하세요','');return;}
    const r=await clanCall('join',{code:cd,ym:monthPerf().ym});
    if(r.ok){clanCache=r;toast('buy','클랜 가입!',r.clan.name);renderClan();clanAutoSync(true);}
    else toast('warn','참여 실패',{nocode:'코드를 찾을 수 없어요',full:'정원(30명)이 가득 찼어요',already:'이미 클랜에 속해 있어요'}[r.err]||r.err||'');};
  const loadList=async(q)=>{
    const r=await clanCall('list',{q});
    const box=$('clanList');if(!box)return;
    if(!r.ok||!r.clans||!r.clans.length){box.innerHTML='<div class="empty">공개된 클랜이 아직 없어요. 첫 클랜을 만들어 보세요!</div>';return;}
    box.innerHTML=r.clans.map(x=>`<div class="fr-r"><span class="cl-em">${x.emblem||'🛡️'}</span>
      <b>${x.name} <i class="ch-lv sm">Lv.${x.lv||1}</i></b>
      ${x.intro?`<span class="cr-msg">“${x.intro}”</span>`:''}
      <span class="cr-meta">${x.n}명</span>
      <span class="cr-r num ${x.avg==null?'':(x.avg>=0?'up':'down')}">${x.avg==null?'—':pctS(x.avg)}</span>
      <button class="fr-ok" data-join="${x.cid}">가입</button></div>`).join('');
    box.querySelectorAll('[data-join]').forEach(b=>b.onclick=async()=>{
      const r2=await clanCall('join',{cid:b.dataset.join,ym:monthPerf().ym});
      if(r2.ok&&r2.clan){clanCache=r2;toast('buy','클랜 가입!',r2.clan.name);renderClan();clanAutoSync(true);}
      else if(r2.ok&&r2.applied)toast('on','가입 신청 완료','리더가 승인하면 참여됩니다');
      else toast('warn','가입 실패',{full:'정원이 가득 찼어요',already:'이미 클랜에 속해 있어요'}[r2.err]||r2.err||'');});
  };
  $('clSearchGo').onclick=()=>loadList(($('clSearch').value||'').trim());
  loadList('');
}
/* 탭별 동적 영역 */
function paintClan(){
  const c=clanCache&&clanCache.clan;if(!c)return;
  const pane=$('clanPane');if(!pane)return;
  const staff=c.leader===c.me||(c.members.find(m=>m.id===c.me)||{}).role==='sub';
  const nt=$('clanNotice');
  if(nt)nt.innerHTML=c.notice?`<div class="clan-notice"><b>📢 공지</b><span>${c.notice}</span></div>`:'';
  if(clanTab==='league'){
    const mp=monthPerf();
    pane.innerHTML=`
      <div class="clan-stat panel">
        <div class="cs-c"><span>클랜 평균</span><b class="num ${c.stat.avg==null?'':(c.stat.avg>=0?'up':'down')}">${c.stat.avg==null?'—':pctS(c.stat.avg)}</b></div>
        <div class="cs-c"><span>최고 수익률</span><b class="num ${c.stat.best==null?'':(c.stat.best>=0?'up':'down')}">${c.stat.best==null?'—':pctS(c.stat.best)}</b></div>
        <div class="cs-c"><span>멤버</span><b class="num">${c.stat.n}명</b></div>
        <div class="cs-c"><span>클랜 누적 체결</span><b class="num">${(c.stat.trades||0).toLocaleString()}건</b></div>
      </div>
      ${c.missions?`<div class="panel mission-wrap"><div class="mw-h">🎯 클랜 미션</div>
        ${c.missions.map(m=>`<div class="ms-r ${m.done?'done':''}"><span class="ms-k">${m.done?'✅':'⬜'} ${m.k}</span>
          <span class="ms-bar"><i style="width:${Math.min(100,m.cur/m.goal*100)}%"></i></span>
          <span class="ms-v num">${m.unit==='%'?m.cur.toFixed(1):m.cur.toLocaleString()}/${m.unit==='%'?Number(m.goal).toFixed(1):Number(m.goal).toLocaleString()}${m.unit}</span></div>`).join('')}
        </div>`:''}
      <div class="sec-title" style="margin-top:16px">이번 달 수익률 리그 <span class="sec-sub">· ${c.ym||mp.ym} 시즌 · 자동 반영 · 이름을 누르면 상세</span></div>
      <div class="panel clan-rank" id="clanRank"></div>
      <div class="clan-my panel">
        <div class="cmy-l"><span class="cm-k">내 이번 달 수익률</span><b class="num ${mp.rate>=0?'up':'down'}">${pctS(mp.rate)}</b><i class="cmy-live">실시간 자동 반영</i></div>
        <input id="clanMsg" maxlength="30" placeholder="한 줄 상태 메시지 (30자)" value="${(c.members.find(m=>m.id===c.me)||{}).msg||''}">
        <button class="btn-primary" id="clanMsgSave">메시지 저장</button>
      </div>
      <div id="clanHof"></div>`;
    const rk=$('clanRank');
    rk.innerHTML=c.members.map((m,i)=>{
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':`<i class="cr-n">${i+1}</i>`;
      const role=m.id===c.leader?'<i class="cr-l">리더</i>':m.role==='sub'?'<i class="cr-l sub">부리더</i>':'';
      return `<div class="cr ${m.id===c.me?'me':''}" data-mem="${m.id}">
        <span class="cr-m">${medal}</span>
        <b class="cr-nm">${m.name} ${role}</b>
        ${m.msg?`<span class="cr-msg">“${m.msg}”</span>`:''}
        <span class="cr-meta">${m.tr?m.tr+'건':''}${m.updatedAt?` · ${agoStr2(m.updatedAt)}`:''}</span>
        <span class="cr-r num ${m.rate==null?'':(m.rate>=0?'up':'down')}">${m.rate==null?'미집계':pctS(m.rate)}</span></div>`;}).join('')
      ||'<div class="empty">아직 멤버가 없어요</div>';
    rk.querySelectorAll('[data-mem]').forEach(b=>b.onclick=()=>openMemberCard(b.dataset.mem));
    $('clanMsgSave').onclick=async()=>{
      const r=await clanCall('sync',{msg:$('clanMsg').value,rate:monthPerf().rate,ym:monthPerf().ym,tr:tradeLog.length,hold:holdings.length});
      if(r.ok){clanCache=r;paintClan();toast('buy','상태 메시지 저장','');}else toast('warn','저장 실패',r.err||'');};
    const hof=$('clanHof');
    if(hof)hof.innerHTML=(c.hof&&c.hof.length)?`<div class="sec-title" style="margin-top:18px">명예의 전당 <span class="sec-sub">· 지난 시즌 1위</span></div>
      <div class="panel hof-wrap">${c.hof.map(h=>`<div class="hof-r"><span class="hof-ym">${h.ym}</span><b>${h.name}</b><span class="num ${h.rate>=0?'up':'down'}">${pctS(h.rate)}</span></div>`).join('')}</div>`:'';
  }
  else if(clanTab==='chat'){
    if(!pane.querySelector('.clan-chat')){
      pane.innerHTML=`<div class="panel clan-chat">
        <div class="cc-list" id="clanChatList"></div>
        <div class="cc-in"><input id="clanChatIn" maxlength="200" placeholder="메시지를 입력하세요 (200자)"><button id="clanChatGo">보내기</button></div>
      </div>`;
      $('clanChatGo').onclick=sendClanChat;
      $('clanChatIn').onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();sendClanChat();}};
    }
    const cl=$('clanChatList');
    const list=c.chat||[];
    const atBottom=cl.scrollHeight-cl.scrollTop-cl.clientHeight<40;
    cl.innerHTML=list.length?list.map(m=>m.sys
      ?`<div class="cc-sys">${m.text}</div>`
      :`<div class="cc-m ${m.id===c.me?'mine':''}"><span class="cc-n">${m.name}</span><span class="cc-t">${m.text}</span><span class="cc-ts">${agoStr2(m.ts)}</span></div>`).join('')
      :'<div class="cc-empty">첫 메시지를 남겨 보세요 👋</div>';
    if(atBottom)cl.scrollTop=cl.scrollHeight;
    clanMarkSeen();
  }
  else if(clanTab==='feed'){
    const lv=c.level||{lv:1,pct:0,exp:0};
    pane.innerHTML=`
      <div class="panel lv-panel">
        <div class="lv-top"><span class="lv-b">Lv.${lv.lv}</span><span class="lv-k">클랜 레벨</span><span class="lv-e num">${(lv.exp||0).toLocaleString()} EXP</span></div>
        <div class="ts-prog"><i style="width:${Math.max(2,lv.pct||0)}%"></i></div>
        <div class="lv-n">멤버 활동(체결)·채팅·규모·운영 기간이 쌓이면 레벨이 오릅니다${c.goal!=null?` · 클랜 목표 수익률 <b>${pctS(c.goal)}</b>`:''}</div>
      </div>
      ${(staff&&c.pending&&c.pending.length)?`<div class="sec-title" style="margin-top:16px">가입 신청 <span class="sec-sub">· ${c.pending.length}건</span></div>
        <div class="panel fr-list">${c.pending.map(p=>`<div class="fr-r"><b>${p.name}</b><span class="fr-id">@${p.id}</span>
          <span class="fr-btns"><button class="fr-ok" data-ap="${p.id}">승인</button><button class="fr-no" data-dn="${p.id}">반려</button></span></div>`).join('')}</div>`:''}
      <div class="sec-title" style="margin-top:16px">활동 기록</div>
      <div class="panel feed-wrap">${(c.feed&&c.feed.length)?c.feed.map(f=>`<div class="fd-r"><span class="fd-t">${f.t}</span><span class="fd-ts">${agoStr2(f.ts)}</span></div>`).join(''):'<div class="empty">아직 활동 기록이 없어요</div>'}</div>`;
    pane.querySelectorAll('[data-ap]').forEach(b=>b.onclick=async()=>{
      const r=await clanCall('approve',{target:b.dataset.ap});
      if(r.ok){clanCache=r;paintClan();toast('buy','가입 승인','');}else toast('warn','승인 실패',r.err||'');});
    pane.querySelectorAll('[data-dn]').forEach(b=>b.onclick=async()=>{
      const r=await clanCall('deny',{target:b.dataset.dn});
      if(r.ok){clanCache=r;paintClan();toast('warn','신청 반려','');}});
  }
  else if(clanTab==='explore'){
    pane.innerHTML=`<div class="fr-add panel"><input id="clSearch2" maxlength="16" placeholder="클랜 이름 검색"><button class="btn-primary" id="clSearchGo2">검색</button></div>
      <div class="sec-title" style="margin-top:14px">전체 클랜 랭킹 <span class="sec-sub">· 공개 클랜 평균 수익률 순</span></div>
      <div class="panel fr-list" id="clanList2"><div class="empty">불러오는 중…</div></div>`;
    const load=async(q)=>{
      const r=await clanCall('list',{q});
      const box=$('clanList2');if(!box)return;
      if(!r.ok||!r.clans||!r.clans.length){box.innerHTML='<div class="empty">공개된 클랜이 없습니다.</div>';return;}
      box.innerHTML=r.clans.map((x,i)=>`<div class="fr-r ${x.cid===c.cid?'me':''}">
        <span class="cr-m">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`<i class="cr-n">${i+1}</i>`}</span>
        <span class="cl-em">${x.emblem||'🛡️'}</span>
        <b>${x.name}${x.cid===c.cid?' <i class="cr-l">우리 클랜</i>':''} <i class="ch-lv sm">Lv.${x.lv||1}</i></b>
        <span class="cr-meta">${x.n}명</span>
        <span class="cr-r num ${x.avg==null?'':(x.avg>=0?'up':'down')}">${x.avg==null?'—':pctS(x.avg)}</span></div>`).join('');
    };
    $('clSearchGo2').onclick=()=>load(($('clSearch2').value||'').trim());
    load('');
  }
  paintClanDots();
}
/* 멤버 상세 + 운영진 권한 */
function openMemberCard(id){
  const c=clanCache&&clanCache.clan;if(!c)return;
  const m=c.members.find(x=>x.id===id);if(!m)return;
  const staff=c.leader===c.me||(c.members.find(x=>x.id===c.me)||{}).role==='sub';
  const isLeader=c.leader===c.me;
  openLiteGate(m.name+' 님',`
    <div class="ps-grid" style="grid-template-columns:repeat(2,1fr)">
      <div class="ps-c"><span>이번 달 수익률</span><b class="num ${m.rate==null?'':(m.rate>=0?'up':'down')}">${m.rate==null?'미집계':pctS(m.rate)}</b></div>
      <div class="ps-c"><span>누적 체결</span><b class="num">${(m.tr||0).toLocaleString()}건</b></div>
      <div class="ps-c"><span>보유 종목</span><b class="num">${m.hold||0}종목</b></div>
      <div class="ps-c"><span>역할</span><b>${m.id===c.leader?'리더':m.role==='sub'?'부리더':'멤버'}</b></div>
      <div class="ps-c"><span>가입</span><b>${m.joinedAt?new Date(m.joinedAt).toLocaleDateString('ko-KR'):'—'}</b></div>
      <div class="ps-c"><span>최근 활동</span><b>${m.updatedAt?agoStr2(m.updatedAt):'—'}</b></div>
    </div>
    ${m.msg?`<div class="pm-note">“${m.msg}”</div>`:''}
    ${(staff&&m.id!==c.me&&m.id!==c.leader)?`<div class="lg-row">
      ${isLeader?`<button class="btn-ghost" id="mcRole">${m.role==='sub'?'부리더 해제':'부리더 임명'}</button>
      <button class="btn-ghost" id="mcTransfer">리더 위임</button>`:''}
      <button class="btn-ghost" id="mcKick">내보내기</button></div>`:''}
    <div class="pm-note">자산 금액은 공유되지 않으며, 수익률은 월초 총자산 대비로 계산됩니다.</div>`);
  const rl=$('mcRole');if(rl)rl.onclick=async()=>{
    const r=await clanCall('role',{target:m.id,role:m.role==='sub'?'':'sub'});
    if(r.ok){clanCache=r;closeLiteGate();paintClan();toast('buy','역할 변경','');}};
  const tf=$('mcTransfer');if(tf)tf.onclick=async()=>{
    const ok=await askConfirm('리더 위임','이 멤버에게 리더를 넘길까요?',{okLabel:'위임'});
    if(!ok)return;
    const r=await clanCall('transfer',{target:m.id});
    if(r.ok){clanCache=r;closeLiteGate();renderClan();toast('buy','리더 위임 완료','');}};
  const kk=$('mcKick');if(kk)kk.onclick=async()=>{
    const ok=await askConfirm('멤버 내보내기','이 멤버를 클랜에서 내보낼까요?',{okLabel:'내보내기',danger:true});
    if(!ok)return;
    const r=await clanCall('kick',{target:m.id});
    if(r.ok){clanCache=r;closeLiteGate();paintClan();}};
}
function agoStr2(ts){
  if(!ts)return '';
  const d=Date.now()-ts;
  if(d<60e3)return '방금';
  if(d<3600e3)return Math.floor(d/60e3)+'분 전';
  if(d<86400e3)return Math.floor(d/3600e3)+'시간 전';
  return Math.floor(d/86400e3)+'일 전';
}
async function sendClanChat(){
  const inp=$('clanChatIn');if(!inp)return;
  const text=(inp.value||'').trim();if(!text)return;
  inp.value='';
  const r=await clanCall('chat',{text});
  if(r.ok){clanCache=r;paintClan();}
  else{inp.value=text;toast('warn','전송 실패',r.err==='slow'?'조금 천천히 보내 주세요':r.err||'');}
}
/* 리더 관리 — 엠블럼·이름·소개·공개여부·목표·공지·코드 */
function openClanAdmin(){
  const c=clanCache&&clanCache.clan;if(!c)return;
  const EMB=['🛡️','⚔️','🔥','🚀','💎','🐂','🐻','🦅','🌙','⭐','🍀','👑'];
  let emblem=c.emblem||'🛡️';
  openLiteGate('클랜 관리',`
    <div class="pm-sec-t">엠블럼</div>
    <div class="em-grid" id="caEm"></div>
    <div class="fld2"><label>클랜 이름</label><input id="caName" maxlength="16" value="${c.name}"></div>
    <div class="fld2"><label>한 줄 소개 (60자)</label><input id="caIntro" maxlength="60" value="${c.intro||''}" placeholder="예: 초보도 환영하는 장기투자 클랜"></div>
    <div class="fld2"><label>공지 (80자)</label><input id="caNotice" maxlength="80" value="${c.notice||''}" placeholder="예: 이번 주 목표는 반도체 비중 줄이기!"></div>
    <div class="fld2"><label>클랜 목표 수익률 (%)</label><input id="caGoal" class="num" inputmode="decimal" value="${c.goal??''}" placeholder="예: 5"></div>
    <label class="cj-open"><input type="checkbox" id="caOpen" ${c.open?'checked':''}> 공개 클랜(탐색 목록 노출 · 코드 없이 가입 가능)</label>
    <div class="lg-row"><button class="btn-primary" id="caSave">저장</button><button class="btn-ghost" id="caCode">초대 코드 재발급</button></div>`);
  const eg=$('caEm');
  const paintEm=()=>{eg.innerHTML=EMB.map(e=>`<button class="em-o ${e===emblem?'on':''}" data-em="${e}">${e}</button>`).join('');
    eg.querySelectorAll('button').forEach(b=>b.onclick=()=>{emblem=b.dataset.em;paintEm();});};
  paintEm();
  $('caSave').onclick=async()=>{
    const g=($('caGoal').value||'').trim();
    const r=await clanCall('settings',{clanName:$('caName').value,emblem,intro:$('caIntro').value,open:$('caOpen').checked,goal:g===''?0:parseFloat(g)});
    if(!r.ok){toast('warn','저장 실패',r.err||'');return;}
    clanCache=r;
    const r2=await clanCall('notice',{notice:$('caNotice').value});
    if(r2.ok)clanCache=r2;
    closeLiteGate();renderClan();toast('buy','클랜 정보 저장','');};
  $('caCode').onclick=async()=>{
    const ok=await askConfirm('초대 코드 재발급','기존 코드는 즉시 사용할 수 없게 됩니다. 계속할까요?',{okLabel:'재발급'});
    if(!ok)return;
    const r=await clanCall('newcode');
    if(r.ok){clanCache=r;closeLiteGate();renderClan();toast('buy','새 초대 코드',r.clan.code);}};
}
/* ── 수익률 자동 반영(버튼 없이) ── */
let _clanRate=null,_clanAt=0;
function clanAutoSync(force){
  if(!currentUser||!clanCache||!clanCache.clan)return;
  const mp=monthPerf();
  const moved=_clanRate==null||Math.abs(mp.rate-_clanRate)>=0.03;
  const stale=Date.now()-_clanAt>10*60e3;
  if(!force&&!moved&&!stale)return;
  if(!force&&Date.now()-_clanAt<25e3)return;
  _clanRate=mp.rate;_clanAt=Date.now();
  clanCall('sync',{rate:mp.rate,ym:mp.ym,tr:tradeLog.length,hold:holdings.length}).then(r=>{
    if(r&&r.ok){clanCache=r;if(currentView==='clan')paintClan();else paintClanDots();}});
}
setInterval(()=>{try{clanAutoSync(false);}catch(e){}},60e3);
/* 채팅·순위 폴링 — 클랜 화면이면 12초, 아니면 90초(새 메시지 알림용) */
let _clanPollAt=0;
setInterval(()=>{try{
  if(!currentUser||!clanCache||!clanCache.clan||document.hidden)return;
  const onClan=currentView==='clan';
  if(!onClan&&Date.now()-_clanPollAt<90e3)return;
  _clanPollAt=Date.now();
  const before=(clanCache.clan.chat||[]).length;
  const lastMid=(clanCache.clan.chat||[]).slice(-1)[0];
  clanCall('get',{ym:monthPerf().ym}).then(r=>{
    if(!r||!r.ok||!r.clan)return;
    clanCache=r;
    if(onClan)paintClan();else paintClanDots();
    const chat=r.clan.chat||[];
    const fresh=chat.filter(m=>!m.sys&&m.id!==r.clan.me&&(!lastMid||m.ts>lastMid.ts));
    if(!onClan&&fresh.length&&chat.length>before)notifyClanChat(r.clan,fresh[fresh.length-1]);
  });
}catch(e){}},12e3);
function notifyClanChat(c,m){
  try{
    if('Notification' in window&&Notification.permission==='granted')
      new Notification(`${c.emblem||'🛡️'} ${c.name}`,{body:`${m.name}: ${m.text}`.slice(0,90),icon:'/icon-192.png',tag:'clan-chat'});
  }catch(e){}
}

/* ══ [v2.5.6] 권한 온보딩 ══
   핵심: 브라우저가 이미 '차단' 상태면 requestPermission() 은 시스템 창을 띄우지 않고 즉시 denied 를 반환한다(웹 표준).
   따라서 ① 상태가 default 일 때만 시스템 창을 띄우고(제스처 컨텍스트를 잃지 않도록 await 없이 즉시 호출)
        ② 이미 차단이면 기기·브라우저별 해제 경로를 단계별로 안내하고
        ③ 사용자가 설정에서 바꾸면 permissions.onchange + 폴링으로 즉시 감지해 자동으로 성공 처리한다.
   iOS 사파리는 '홈 화면에 추가'한 앱에서만 웹 알림을 지원하므로(iOS 16.4+) 그 경로를 따로 안내한다. */
const PERM_KEY='permOnboard1';
function storageOK(){try{localStorage.setItem('__t','1');localStorage.removeItem('__t');return true;}catch(e){return false;}}
function notiState(){try{return ('Notification' in window)?Notification.permission:'unsupported';}catch(e){return 'unsupported';}}
function permDone(){try{return localStorage.getItem(PERM_KEY)==='1';}catch(e){return false;}}
function uaInfo(){
  const ua=navigator.userAgent||'';
  const iOS=/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1);
  const samsung=/SamsungBrowser/.test(ua);
  const edge=/Edg[A-Z]?\//.test(ua);
  const firefox=/Firefox|FxiOS/.test(ua);
  const chrome=!samsung&&!edge&&!firefox&&/Chrome|CriOS/.test(ua);
  const safari=!samsung&&!edge&&!firefox&&!chrome&&/Safari/.test(ua);
  let standalone=false;
  try{standalone=(window.navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);}catch(e){}
  return {iOS,samsung,edge,firefox,chrome,safari,standalone,android:/Android/.test(ua)};
}
/* 기기별 해제 경로 — 사용자가 그대로 따라 할 수 있게 단계로 제공 */
function permSteps(){
  const u=uaInfo();
  if(u.iOS&&!u.standalone)return {t:'아이폰·아이패드는 홈 화면 앱에서만 알림을 지원해요',
    s:['사파리 아래(또는 위) <b>공유 버튼</b> 탭','<b>홈 화면에 추가</b> 선택 후 추가','홈 화면의 <b>LIVE증권 아이콘</b>으로 실행','앱에서 이 화면의 <b>알림 허용</b>을 다시 탭']};
  if(u.iOS)return {t:'아이폰 설정에서 알림을 켜 주세요',
    s:['<b>설정</b> 앱 → <b>알림</b>','목록에서 <b>LIVE증권</b> 선택','<b>알림 허용</b> 켜기','앱으로 돌아와 <b>다시 확인</b> 탭']};
  if(u.samsung)return {t:'삼성 인터넷에서 알림을 허용해 주세요',
    s:['주소창 왼쪽 <b>자물쇠/사이트 아이콘</b> 탭','<b>권한</b> → <b>알림</b> → <b>허용</b>으로 변경','또는 <b>≡ 메뉴 → 설정 → 사이트 및 다운로드 → 사이트 권한 → 알림</b>','돌아와서 <b>다시 확인</b> 탭 (시크릿 모드에서는 알림이 항상 차단됩니다)']};
  if(u.firefox)return {t:'파이어폭스에서 알림을 허용해 주세요',
    s:['주소창 왼쪽 <b>자물쇠</b> 탭','<b>차단됨 → 알림</b> 옆 <b>✕</b>를 눌러 차단 해제','페이지 새로고침 후 <b>다시 확인</b> 탭']};
  if(u.safari)return {t:'사파리에서 알림을 허용해 주세요',
    s:['맥 상단 <b>Safari → 설정 → 웹사이트 → 알림</b>','이 사이트를 <b>허용</b>으로 변경','<b>다시 확인</b> 탭']};
  return {t:'브라우저에서 알림을 허용해 주세요',
    s:['주소창 왼쪽 <b>자물쇠(사이트 정보)</b> 탭','<b>사이트 설정 → 알림 → 허용</b>','페이지 새로고침 후 <b>다시 확인</b> 탭']};
}
/* 구형 사파리는 콜백 방식만 지원하므로 둘 다 처리 */
function requestNoti(){
  return new Promise((res)=>{
    try{
      if(!('Notification' in window))return res('unsupported');
      const r=Notification.requestPermission((st)=>res(st||notiState()));
      if(r&&typeof r.then==='function')r.then((st)=>res(st||notiState())).catch(()=>res(notiState()));
    }catch(e){res(notiState());}
  });
}
let _permWatch=null;
function watchPermChange(cb){
  stopPermWatch();
  let last=notiState();
  const tick=()=>{const now=notiState();if(now!==last){last=now;cb(now);}};
  const timer=setInterval(tick,1200);                 // 설정 변경 후 돌아오는 경우 대비
  const onVis=()=>{if(!document.hidden)tick();};
  document.addEventListener('visibilitychange',onVis);
  let status=null;
  try{
    if(navigator.permissions&&navigator.permissions.query)
      navigator.permissions.query({name:'notifications'}).then((st)=>{status=st;st.onchange=()=>cb(st.state);}).catch(()=>{});
  }catch(e){}
  _permWatch=()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVis);if(status)status.onchange=null;};
}
function stopPermWatch(){if(_permWatch){try{_permWatch();}catch(e){}_permWatch=null;}}
function permTestNotification(){
  try{
    const n=new Notification('LIVE증권 알림이 켜졌어요',{body:'목표가 도달과 예약 주문 체결을 바로 알려드릴게요.',icon:'/icon-192.png',tag:'perm-ok'});
    setTimeout(()=>{try{n.close();}catch(e){}},5000);
  }catch(e){ /* iOS 등 일부 환경은 생성자 알림을 막는다 — 토스트로 대체 */ }
}
function openPermGate(){
  if($('permGate'))return;
  const u=uaInfo();
  const g=document.createElement('div');
  g.id='permGate';g.className='upd-overlay';
  const row=(ic,t,d)=>`<div class="pg-r"><span class="pg-ic">${ic}</span><div><b>${t}</b><p>${d}</p></div></div>`;
  g.innerHTML=`<div class="upd-box gate perm">
    <div class="ug-top"><div class="ug-badge">🔔</div>
      <div class="ug-h">시작하기 전에 권한을 허용해 주세요</div>
      <div class="ug-meta"><span class="ug-pill">LIVE증권 최초 설정</span></div></div>
    <div class="ug-body">
      ${row('🔔','알림 권한','목표가 도달, 예약 주문 체결, 클랜 채팅 등 중요 알림을 받으려면 필요합니다.')}
      ${row('💾','브라우저 저장소','관심종목·보유 종목·설정을 이 기기에 저장합니다. 저장이 막히면 새로고침마다 초기화됩니다.')}
      ${row('📲','홈 화면 추가 (선택)','앱처럼 전체 화면으로 쓰려면 브라우저 메뉴에서 홈 화면에 추가하세요.')}
      <div class="pg-warn" id="pgWarn" hidden></div>
      <div class="pg-steps" id="pgSteps" hidden></div>
    </div>
    <div class="ug-foot">
      <p class="ug-d" id="pgFoot">권한을 <b>거부하면 알림을 받을 수 없어 원활한 사이트 이용이 불가합니다.</b> 개인정보는 수집하지 않으며 알림은 이 브라우저에서만 발송됩니다.</p>
      <button class="ug-go" id="pgAllow">알림 허용하기</button>
      <button class="ug-skip" id="pgLater">나중에 설정</button>
    </div>
  </div>`;
  document.body.appendChild(g);
  const warnBox=$('pgWarn'),stepBox=$('pgSteps'),btn=$('pgAllow');
  const warn=(html)=>{warnBox.hidden=!html;warnBox.innerHTML=html||'';};
  const showSteps=(shake)=>{
    const st=permSteps();
    stepBox.hidden=false;
    stepBox.innerHTML=`<div class="pg-st-t">${st.t}</div><ol class="pg-ol">${st.s.map(x=>`<li>${x}</li>`).join('')}</ol>`;
    if(shake){stepBox.classList.remove('shake');void stepBox.offsetWidth;stepBox.classList.add('shake');}
    stepBox.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const finish=()=>{
    try{localStorage.setItem(PERM_KEY,'1');}catch(e){}
    stopPermWatch();g.remove();paintPermBanner();
    toast('buy','권한 허용 완료','가격·체결·클랜 알림을 받을 수 있어요');
    permTestNotification();
  };
  const paintState=(st)=>{
    if(st==='granted'){finish();return;}
    if(st==='unsupported'){
      if(u.iOS&&!u.standalone){
        warn('📲 아이폰·아이패드 사파리는 <b>홈 화면에 추가한 앱</b>에서만 웹 알림을 지원합니다(iOS 16.4 이상). 아래 순서대로 추가한 뒤 다시 열어 주세요.');
        btn.textContent='추가 방법 다시 보기';
      }else{
        warn('이 브라우저는 웹 알림을 지원하지 않습니다. 사이트 안에서는 화면 알림으로 안내되지만, <b>창을 닫으면 알림을 받을 수 없어</b> 원활한 이용이 어렵습니다.');
        btn.textContent='확인하고 계속';
      }
      showSteps(false);
      return;
    }
    if(st==='denied'){
      warn('❌ 알림이 <b>차단</b> 상태입니다. 이 상태로는 목표가 도달·예약 체결·클랜 채팅 알림을 <b>전혀 받을 수 없어 원활한 이용이 불가</b>합니다. 아래 순서대로 허용으로 바꿔 주세요.');
      btn.textContent='허용했어요 · 다시 확인';
      showSteps(false);
      return;
    }
    warn('');stepBox.hidden=true;btn.textContent='알림 허용하기';
  };
  if(!storageOK())warn('⚠️ 이 브라우저는 저장소 사용이 차단돼 있습니다(시크릿 모드 등). 관심종목·계좌가 저장되지 않아 <b>원활한 이용이 불가</b>하니 일반 창에서 접속해 주세요.');
  paintState(notiState());
  /* 설정에서 바꾸면 즉시 반영 */
  watchPermChange((st)=>{ if(st==='granted')finish(); else paintState(st); });
  btn.onclick=()=>{
    const st=notiState();
    if(st==='granted'){finish();return;}
    if(st==='default'){
      /* [중요] 제스처 컨텍스트를 잃지 않도록 await 없이 즉시 호출해야 시스템 창이 뜬다 */
      requestNoti().then((res)=>{
        if(res==='granted')finish();
        else{paintState(res);showSteps(true);toast('warn','알림이 허용되지 않았어요','아래 안내대로 허용한 뒤 다시 확인을 눌러 주세요');}
      });
      return;
    }
    if(st==='unsupported'&&!(u.iOS&&!u.standalone)){
      try{localStorage.setItem(PERM_KEY,'1');}catch(e){}
      stopPermWatch();g.remove();paintPermBanner();return;
    }
    /* 이미 차단(denied) — 브라우저가 재요청 창을 띄우지 않으므로 상태만 다시 읽고 안내를 강조한다 */
    const now=notiState();
    if(now==='granted'){finish();return;}
    showSteps(true);
    toast('warn','아직 차단 상태예요','안내대로 바꾼 뒤 다시 눌러 주세요');
  };
  $('pgLater').onclick=()=>{try{localStorage.setItem(PERM_KEY,'1');}catch(e){}stopPermWatch();g.remove();paintPermBanner();
    toast('warn','권한 설정을 건너뜀','하단 배너에서 언제든 다시 허용할 수 있어요');};
}
/* 하단 배너 — 알림이 꺼져 있으면 상시 안내(세션당 닫기 가능) */
function paintPermBanner(){
  if(_authOpen()){const b=document.getElementById('permBan'); if(b)b.remove(); return;}   // [v4.36]
  const st=notiState();
  const need=(st==='denied'||st==='default'||st==='unsupported')&&permDone();
  let b=$('permBanner');
  let hid=false;try{hid=sessionStorage.getItem('permBanHide')==='1';}catch(e){}
  if(!need||hid){if(b)b.remove();return;}
  if(b)return;
  b=document.createElement('div');
  b.id='permBanner';b.className='perm-banner';
  b.innerHTML=`<span>🔔 알림 권한이 꺼져 있어 <b>가격·체결·클랜 알림</b>을 받을 수 없습니다. 원활한 이용을 위해 허용해 주세요.</span>
    <button id="pbGo">권한 허용</button><button id="pbX" aria-label="닫기">✕</button>`;
  document.body.appendChild(b);
  $('pbGo').onclick=()=>openPermGate();
  $('pbX').onclick=()=>{try{sessionStorage.setItem('permBanHide','1');}catch(e){}b.remove();};
}
/* ══ [v4.36 · 치명] 권한 안내창이 로그인창을 덮어 아무것도 못 누르던 문제 ══════
   권한 오버레이는 z-index 9999, 로그인 오버레이는 200 이라 로그인 화면 위를
   권한창이 완전히 가려 버렸다. 게다가 배경이 반투명이라 로그인창이 보이긴 해서
   '버튼이 먹통'인 것처럼만 느껴졌다.
   → 로그인/가입이 끝나기 전에는 권한창을 띄우지 않는다. 로그인 후에 물어본다. */
function _authOpen(){ const g=document.getElementById('authGate'); return !!(g&&!g.hidden); }
function permGateTry(){
  try{
    if(_authOpen()){ setTimeout(permGateTry,1200); return; }   // 로그인 끝날 때까지 대기
    if(!permDone())openPermGate(); else paintPermBanner();
  }catch(e){}
}
setTimeout(permGateTry,1400);
setInterval(()=>{try{paintPermBanner();}catch(e){}},60e3);
/* 앱 사용 중 권한이 허용으로 바뀌면 배너를 즉시 정리 */
document.addEventListener('visibilitychange',()=>{if(!document.hidden)try{paintPermBanner();}catch(e){}});

/* ══ [v2.5.3] 친구 ══ — 아이디로 신청·수락, 월간 수익률 랭킹 공유 */
let frCache=null,_frBusy=false,_frRate=null,_frAt=0;
async function frCall(action,extra){
  if(!currentUser)return {ok:false,err:'guest'};
  const acc=accounts()[currentUser]||{};
  try{fnBump();
    const r=await fetch('/api/friends',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action,id:currentUser,pass:acc.pass,name:acc.name||currentUser,...extra})});
    return await r.json();
  }catch(e){return {ok:false,err:'net'};}
}
function frDot(){
  const d=$('frDot');if(!d)return;
  const n=(frCache&&frCache.reqIn)?frCache.reqIn.length:0;
  d.hidden=!n;
}
async function renderFriend(){
  const el=$('friendBody');if(!el)return;
  if(!currentUser){
    el.innerHTML=`<div class="wl-first"><div class="wf-ic">👥</div><b>친구 기능은 로그인 후 이용할 수 있어요</b>
      <p>아이디만 알면 친구를 맺고<br>이번 달 수익률을 나란히 비교할 수 있어요.</p>
      <button class="btn-primary" id="frLoginGo">로그인 / 회원가입</button></div>`;
    const b=$('frLoginGo');if(b)b.onclick=()=>{$('authGate').hidden=false;};
    return;
  }
  if(!frCache&&!_frBusy){
    _frBusy=true;el.innerHTML='<div class="empty">친구 목록을 불러오는 중…</div>';
    const mp=monthPerf();
    const r=await frCall('sync',{rate:mp.rate,msg:(frCache&&frCache.me&&frCache.me.msg)||'',tr:tradeLog.length});
    _frBusy=false;
    if(r&&r.ok)frCache=r;
    else{el.innerHTML=`<div class="empty">친구 서버 연결 실패 (${(r&&r.err)||'net'})<br>잠시 후 다시 시도해 주세요.</div>`;return;}
  }
  const f=frCache||{friends:[],reqIn:[],reqOut:[],me:{}};
  const mp=monthPerf();
  const rank=[...(f.friends||[]),{id:currentUser,name:(f.me&&f.me.name)||currentUser,rate:mp.rate,msg:(f.me&&f.me.msg)||'',tr:tradeLog.length,ts:Date.now(),self:1}]
    .sort((a,z)=>(z.rate??-1e9)-(a.rate??-1e9));
  el.innerHTML=`
    <div class="fr-me panel">
      <div class="fm-l"><div class="fm-av">${avatarOf((f.me&&f.me.name)||currentUser)}</div>
        <div><div class="fm-n">${(f.me&&f.me.name)||currentUser}</div>
          <button class="fm-id" id="frIdCopy" title="탭하면 복사">내 친구 아이디 <b>${currentUser}</b> 📋</button></div></div>
      <div class="fm-r"><span class="cm-k">이번 달 수익률</span><b class="num ${mp.rate>=0?'up':'down'}">${pctS(mp.rate)}</b><i class="cmy-live">자동 반영</i></div>
    </div>
    <div class="fr-add panel">
      <input id="frIdIn" maxlength="24" placeholder="친구 아이디 입력">
      <button class="btn-primary" id="frAddGo">친구 신청</button>
    </div>
    ${(f.reqIn&&f.reqIn.length)?`<div class="sec-title" style="margin-top:16px">받은 친구 신청 <span class="sec-sub">· ${f.reqIn.length}건</span></div>
      <div class="panel fr-list">${f.reqIn.map(x=>`<div class="fr-r"><b>${x.name}</b><span class="fr-id">@${x.id}</span>
        <span class="fr-btns"><button class="fr-ok" data-ac="${x.id}">수락</button><button class="fr-no" data-rj="${x.id}">거절</button></span></div>`).join('')}</div>`:''}
    <div class="sec-title" style="margin-top:16px">친구 수익률 랭킹 <span class="sec-sub">· ${mp.ym} · 월초 자산 대비</span></div>
    <div class="panel fr-list">${rank.length>1?rank.map((x,i)=>`
      <div class="fr-r ${x.self?'me':''}">
        <span class="cr-m">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`<i class="cr-n">${i+1}</i>`}</span>
        <b>${x.name}${x.self?' <i class="cr-l">나</i>':''}</b>
        ${x.msg?`<span class="cr-msg">“${x.msg}”</span>`:''}
        <span class="cr-meta">${x.tr?x.tr+'건':''}${x.ts?` · ${agoStr2(x.ts)}`:''}</span>
        <span class="cr-r num ${x.rate==null?'':(x.rate>=0?'up':'down')}">${x.rate==null?'미집계':pctS(x.rate)}</span>
        ${x.self?'':`<i class="cr-x" data-del="${x.id}" title="친구 삭제">✕</i>`}</div>`).join('')
      :'<div class="empty">아직 친구가 없어요. 위에서 아이디로 신청해 보세요!</div>'}</div>
    ${(f.reqOut&&f.reqOut.length)?`<div class="sec-title" style="margin-top:16px">보낸 신청</div>
      <div class="panel fr-list">${f.reqOut.map(x=>`<div class="fr-r"><b>${x.name}</b><span class="fr-id">@${x.id}</span>
        <span class="fr-btns"><button class="fr-no" data-cx="${x.id}">취소</button></span></div>`).join('')}</div>`:''}
    <div class="pm-note">친구에게는 <b>이름·이번 달 수익률·상태 메시지·체결 건수</b>만 공개되고 자산 금액은 공유되지 않습니다.</div>`;
  $('frIdCopy').onclick=()=>{try{navigator.clipboard.writeText(currentUser);toast('buy','아이디 복사',currentUser);}catch(e){}};
  $('frAddGo').onclick=async()=>{
    const t=($('frIdIn').value||'').trim();
    if(!t){toast('warn','아이디를 입력하세요','');return;}
    const r=await frCall('add',{target:t});
    if(r.ok){frCache=r;renderFriend();frDot();toast('buy','친구 신청 완료',t+'님에게 신청을 보냈어요');}
    else toast('warn','신청 실패',{nouser:'그런 아이디가 없어요',already:'이미 친구예요',sent:'이미 신청을 보냈어요',self:'본인은 추가할 수 없어요'}[r.err]||r.err||'');};
  const act=async(a,t)=>{const r=await frCall(a,{target:t});if(r.ok){frCache=r;renderFriend();frDot();}};
  el.querySelectorAll('[data-ac]').forEach(b=>b.onclick=()=>act('accept',b.dataset.ac));
  el.querySelectorAll('[data-rj]').forEach(b=>b.onclick=()=>act('reject',b.dataset.rj));
  el.querySelectorAll('[data-cx]').forEach(b=>b.onclick=()=>act('cancel',b.dataset.cx));
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
    const ok=await askConfirm('친구 삭제','이 친구를 목록에서 삭제할까요?',{okLabel:'삭제',danger:true});
    if(ok)act('remove',b.dataset.del);});
  frDot();
}
function frAutoSync(force){
  if(!currentUser)return;
  const mp=monthPerf();
  const moved=_frRate==null||Math.abs(mp.rate-_frRate)>=0.03;
  if(!force&&!moved&&Date.now()-_frAt<10*60e3)return;
  if(!force&&Date.now()-_frAt<25e3)return;
  _frRate=mp.rate;_frAt=Date.now();
  frCall('sync',{rate:mp.rate,msg:(frCache&&frCache.me&&frCache.me.msg)||'',tr:tradeLog.length}).then(r=>{
    if(r&&r.ok){frCache=r;frDot();if(currentView==='friend')renderFriend();}});
}
setInterval(()=>{try{frAutoSync(false);}catch(e){}},60e3);
setTimeout(()=>{try{if(currentUser)frAutoSync(true);}catch(e){}},6000);
/* ══ [v2.5] 신규 기능 렌더러 묶음 ══ */
/* 비교함(최대 4종목) */
function cmpList(){try{return JSON.parse(localStorage.getItem('cmpSet')||'[]');}catch(e){return [];}}
function cmpSave(a){try{localStorage.setItem('cmpSet',JSON.stringify(a.slice(0,4)));}catch(e){}}
function cmpToggle(code){
  let a=cmpList();
  if(a.includes(code))a=a.filter(c=>c!==code);
  else{if(a.length>=4){toast('warn','비교함 가득','최대 4종목까지 담을 수 있어요');return;}a.push(code);}
  cmpSave(a);renderCmpUi();
  toast('on','비교함',a.includes(code)?'담았어요 ('+a.length+'/4)':'뺐어요 ('+a.length+'/4)');
}
function renderCmpUi(){
  const a=cmpList();
  const btn=$('cmpBtn');if(btn)btn.classList.toggle('on',a.includes(selected));
  const bar=$('cmpBar');
  if(bar){
    if(!a.length){bar.hidden=true;}
    else{bar.hidden=false;
      bar.innerHTML=`<span class="cb-t">⚖ 비교함</span>`+a.map(c=>{
        const nm=(byCode[c]&&byCode[c].name)||c;
        return `<span class="cb-c">${nm}<i data-x="${c}">✕</i></span>`;}).join('')
        +`<button class="cb-go" id="cbGo">비교 보기</button><button class="cb-clr" id="cbClr">비우기</button>`;
      bar.querySelectorAll('i[data-x]').forEach(i=>i.onclick=()=>cmpToggle(i.dataset.x));
      const go=$('cbGo');if(go)go.onclick=openCmpGate;
      const cl=$('cbClr');if(cl)cl.onclick=()=>{cmpSave([]);renderCmpUi();};
      primeQuotes(a);
    }
  }
}
function openCmpGate(){
  const a=cmpList();if(a.length<2){toast('warn','비교하려면 2종목 이상','종목 화면의 ⚖ 버튼으로 담아 보세요');return;}
  const rows=a.map(c=>{
    const st=byCode[c]||{},q=dispQuote(c)||{};
    const px=q.price!=null?q.price:st.price,pv=q.prevClose||st.prevClose;
    const ch=(px!=null&&pv)?(px-pv)/pv*100:null,dir=ch==null?'flat':dirOf(ch);
    const b=mktBadgeInfo(c);
    return `<tr data-code="${c}"><td>${st.name||c}<br><span class="cd num">${c}</span></td>
      <td class="num ${dir}">${px!=null?KRW(px):'—'}</td><td class="num ${dir}">${ch!=null?pctS(ch):'—'}</td>
      <td class="num">${st.value!=null?KRW(Math.round(st.value/1e8))+'억':'—'}</td>
      <td><span class="px-src ${b[1]}">${b[0]}</span></td></tr>`;}).join('');
  openLiteGate('종목 비교',`<div class="table-wrap"><table class="cmp-tbl"><thead><tr><th>종목</th><th>현재가</th><th>등락</th><th>거래대금</th><th>세션</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="pm-note">행을 누르면 해당 종목으로 이동합니다. 상세 지표 비교는 각 종목의 AI 종목 분석 탭을 활용하세요.</div>`);
  document.querySelectorAll('#liteBody tr[data-code]').forEach(r=>r.onclick=()=>{closeLiteGate();openTrade(r.dataset.code);});
}
/* 경량 범용 모달 */
function openLiteGate(title,html){
  let g=$('liteGate');
  if(!g){g=document.createElement('div');g.id='liteGate';g.className='overlay';
    g.innerHTML=`<div class="modal lite-modal"><div class="modal-head"><div class="t" id="liteTitle"></div><button class="x" id="liteClose">✕</button></div><div class="lite-body" id="liteBody"></div></div>`;
    document.body.appendChild(g);
    $('liteClose').onclick=closeLiteGate;
    g.addEventListener('click',e=>{if(e.target===g)closeLiteGate();});}
  $('liteTitle').textContent=title;$('liteBody').innerHTML=html;g.hidden=false;
}
function closeLiteGate(){const g=$('liteGate');if(g)g.hidden=true;}
/* 가격 알림 모달 */
function openAlertGate(){
  const code=selected,st=byCode[code]||{},cur=priceAlerts[code]||{};
  const q=dispQuote(code)||{},px=q.price!=null?q.price:st.price;
  openLiteGate('가격 알림 · '+(st.name||code),`
    <div class="pm-note" style="margin-top:0">현재가 <b class="num">${px!=null?KRW(px)+'원':'—'}</b> · 도달 시 알림이 오고 해당 방향 설정은 해제됩니다.</div>
    <div class="fld2"><label>상승 알림가 (이상)</label><input id="alUp" class="num" inputmode="numeric" value="${cur.above||''}" placeholder="예: ${px?KRW(tickPx(px*1.05)):''}"></div>
    <div class="fld2"><label>하락 알림가 (이하)</label><input id="alDn" class="num" inputmode="numeric" value="${cur.below||''}" placeholder="예: ${px?KRW(tickPx(px*0.95)):''}"></div>
    <div class="lg-row"><button class="btn-primary" id="alSave">저장</button><button class="btn-ghost" id="alClear">알림 해제</button></div>`);
  $('alSave').onclick=async()=>{
    const up=parseInt(($('alUp').value||'').replace(/[^0-9]/g,''))||0;
    const dn=parseInt(($('alDn').value||'').replace(/[^0-9]/g,''))||0;
    if(!up&&!dn){toast('warn','알림가를 입력하세요','');return;}
    priceAlerts[code]={name:st.name,above:up||undefined,below:dn||undefined};
    subscribeAutoCodes();saveState();closeLiteGate();
    toast('on','가격 알림 설정',(up?`↑${KRW(up)} `:'')+(dn?`↓${KRW(dn)}`:''));
    try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch(e){}
    updateDetailBells();
  };
  $('alClear').onclick=()=>{delete priceAlerts[code];saveState();closeLiteGate();toast('warn','가격 알림 해제','');updateDetailBells();};
}
function updateDetailBells(){
  const ab=$('alertBtn');if(ab)ab.classList.toggle('on',!!priceAlerts[selected]);
  renderCmpUi();
}
/* 보유 종목 관리(손절·익절·배당·목표 비중) */
function openHoldGate(){
  const code=selected,h=holdings.find(x=>x.code===code);
  if(!h){toast('warn','보유 종목이 아닙니다','매수 후 설정할 수 있어요');return;}
  const st=byCode[code]||{};
  openLiteGate('보유 관리 · '+(st.name||code),`
    <div class="pm-note" style="margin-top:0">보유 ${KRW(h.qty)}주 · 평단 ${KRW(h.avg)}원 — 손절·익절 도달 시 <b>전량 자동 매도</b>됩니다.</div>
    <div class="fld2"><label>손절가 (이하 도달 시)</label><input id="hgStop" class="num" inputmode="numeric" value="${h.stopPx||''}"></div>
    <div class="fld2"><label>익절가 (이상 도달 시)</label><input id="hgTake" class="num" inputmode="numeric" value="${h.takePx||''}"></div>
    <div class="fld2"><label>예상 배당수익률 % (연)</label><input id="hgDiv" class="num" inputmode="decimal" value="${h.divPct||''}" placeholder="예: 2.5"></div>
    <div class="fld2"><label>목표 비중 % (리밸런싱)</label><input id="hgTgt" class="num" inputmode="decimal" value="${h.targetPct||''}" placeholder="예: 20"></div>
    <div class="lg-row"><button class="btn-primary" id="hgSave">저장</button><button class="btn-ghost" id="hgClear">모두 해제</button></div>`);
  const numv=(id,f)=>{const v=parseFloat(($(id).value||'').replace(/[^0-9.]/g,''));return isFinite(v)&&v>0?(f?v:Math.round(v)):null;};
  $('hgSave').onclick=()=>{
    const sp=numv('hgStop'),tp=numv('hgTake'),dv=numv('hgDiv',1),tg=numv('hgTgt',1);
    if(sp)h.stopPx=sp;else delete h.stopPx;
    if(tp)h.takePx=tp;else delete h.takePx;
    if(dv&&dv<=30)h.divPct=dv;else delete h.divPct;
    if(tg&&tg<=100)h.targetPct=tg;else delete h.targetPct;
    subscribeAutoCodes();saveState();closeLiteGate();
    toast('buy','보유 관리 저장',(sp?`손절 ${KRW(sp)} `:'')+(tp?`익절 ${KRW(tp)}`:'')||'설정 저장');
    if(currentView==='account'){safeRun('holdings',renderHoldings);safeRun('autocard',renderAutoCard);}
  };
  $('hgClear').onclick=()=>{delete h.stopPx;delete h.takePx;delete h.divPct;delete h.targetPct;saveState();closeLiteGate();toast('warn','보유 관리 해제','');};
}
/* 내 계좌: 예약·자동 카드 + 배당 + 리밸런싱 */
function renderAutoCard(){
  const el=$('autoCard');if(!el)return;
  const rows=[];
  bookOrders.forEach(o=>rows.push(`<div class="au-r"><span class="au-k ${o.side}">${o.side==='buy'?'예약 매수':'예약 매도'}</span><b>${o.name}</b><span class="num">${KRW(o.qty)}주 · ${KRW(o.price)}원</span><i data-bo="${o.id}">✕</i></div>`));
  holdings.forEach(h=>{
    if(h.stopPx)rows.push(`<div class="au-r"><span class="au-k down">손절</span><b>${(byCode[h.code]&&byCode[h.code].name)||h.code}</b><span class="num">${KRW(h.stopPx)}원 이하 전량</span><i data-sl="${h.code}">✕</i></div>`);
    if(h.takePx)rows.push(`<div class="au-r"><span class="au-k up">익절</span><b>${(byCode[h.code]&&byCode[h.code].name)||h.code}</b><span class="num">${KRW(h.takePx)}원 이상 전량</span><i data-tk="${h.code}">✕</i></div>`);
  });
  Object.entries(priceAlerts).forEach(([c,a])=>{
    rows.push(`<div class="au-r"><span class="au-k on">알림</span><b>${a.name||c}</b><span class="num">${a.above?'↑'+KRW(a.above):''} ${a.below?'↓'+KRW(a.below):''}</span><i data-al="${c}">✕</i></div>`);});
  el.hidden=!rows.length;
  if(!rows.length)return;
  el.innerHTML=`<div class="sec-title" style="margin:14px 0 10px">예약 · 자동 주문 · 알림 <span class="sec-sub">· 12초마다 감시 · 접속 중에만 작동</span></div>
    <div class="panel au-panel">${rows.join('')}</div>`;
  el.querySelectorAll('i[data-bo]').forEach(i=>i.onclick=()=>{bookOrders=bookOrders.filter(o=>o.id!==i.dataset.bo);saveState();renderAutoCard();toast('warn','예약 취소','');});
  el.querySelectorAll('i[data-sl]').forEach(i=>i.onclick=()=>{const h=holdings.find(x=>x.code===i.dataset.sl);if(h){delete h.stopPx;saveState();renderAutoCard();}});
  el.querySelectorAll('i[data-tk]').forEach(i=>i.onclick=()=>{const h=holdings.find(x=>x.code===i.dataset.tk);if(h){delete h.takePx;saveState();renderAutoCard();}});
  el.querySelectorAll('i[data-al]').forEach(i=>i.onclick=()=>{delete priceAlerts[i.dataset.al];saveState();renderAutoCard();});
}
function renderInsightCards(){
  const dv=$('divCard'),rb=$('rebalCard');
  if(dv){
    const withDiv=holdings.filter(h=>h.divPct);
    if(!withDiv.length){dv.hidden=true;}
    else{dv.hidden=false;
      const tot=withDiv.reduce((a,h)=>{const st=byCode[h.code];const ev=((st&&st.price!=null?st.price:h.avg)*h.qty);return a+ev*h.divPct/100;},0);
      dv.innerHTML=`<div class="ic-k">💰 연 예상 배당금</div><div class="ic-v num">${KRW(Math.round(tot))}원</div>
        <div class="ic-s">${withDiv.map(h=>`${(byCode[h.code]&&byCode[h.code].name)||h.code} ${h.divPct}%`).join(' · ')}</div>
        <div class="ic-n">보유 관리에서 입력한 배당수익률 기준 추정치</div>`;}
  }
  if(rb){
    const withT=holdings.filter(h=>h.targetPct);
    if(withT.length<1){rb.hidden=true;}
    else{rb.hidden=false;
      const totEval=holdings.reduce((a,h)=>a+hEvalKRW(h),0)||1;
      const rows=withT.map(h=>{
        const st=byCode[h.code],px=(st&&st.price!=null)?st.price:h.avg;
        const curP=px*h.qty/totEval*100,d=h.targetPct-curP;
        const dQty=px?Math.round(Math.abs(d)/100*totEval/px):0;
        return `<div class="rb-r"><b>${(st&&st.name)||h.code}</b><span class="num">${curP.toFixed(1)}% → ${h.targetPct}%</span>
          <span class="rb-a ${d>=0?'up':'down'}">${Math.abs(d)<1||!dQty?'유지':(d>0?`+${KRW(dQty)}주 매수`:`${KRW(dQty)}주 매도`)}</span></div>`;}).join('');
      rb.innerHTML=`<div class="ic-k">⚖ 리밸런싱 제안 <span class="sec-sub">· 목표 비중 대비</span></div>${rows}
        <div class="ic-n">보유 관리(종목 화면)에서 목표 비중을 설정할 수 있어요 · 참고용 제안</div>`;}
  }
}
/* 월간 리포트 */
function openMonthReport(){
  const ym=kstMonth();
  const rows=tradeLog.filter(r=>String(r.date||'').startsWith(ym));
  const buys=rows.filter(r=>r.side==='buy'),sells=rows.filter(r=>r.side==='sell');
  const buyAmt=buys.reduce((a,r)=>a+r.amount,0),sellAmt=sells.reduce((a,r)=>a+r.amount,0);
  const pnl=sells.reduce((a,r)=>a+(r.pnl||0),0);
  const wins=sells.filter(r=>(r.pnl||0)>0).length,winRate=sells.length?Math.round(wins/sells.length*100):null;
  const cnt={};rows.forEach(r=>{cnt[r.name]=(cnt[r.name]||0)+1;});
  const most=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
  const byPnl=sells.slice().sort((a,b)=>(b.pnl||0)-(a.pnl||0));
  const best=byPnl[0],worst=byPnl[byPnl.length-1];
  const mp=monthPerf();
  openLiteGate(`${ym.replace('-','년 ')}월 리포트`,`
    <div class="ps-grid" style="grid-template-columns:repeat(2,1fr)">
      <div class="ps-c"><span>이달 수익률(자산)</span><b class="num ${mp.rate>=0?'up':'down'}">${pctS(mp.rate)}</b></div>
      <div class="ps-c"><span>실현 손익</span><b class="num ${pnl>=0?'up':'down'}">${signed(pnl)}</b></div>
      <div class="ps-c"><span>매수 금액</span><b class="num">${KRW(buyAmt)}원</b></div>
      <div class="ps-c"><span>매도 금액</span><b class="num">${KRW(sellAmt)}원</b></div>
      <div class="ps-c"><span>거래 횟수</span><b class="num">${rows.length}건</b></div>
      <div class="ps-c"><span>매도 승률</span><b class="num">${winRate==null?'—':winRate+'%'}</b></div>
    </div>
    ${most?`<div class="pm-note">최다 거래: <b>${most[0]}</b> ${most[1]}회${best&&(best.pnl||0)>0?` · 베스트 실현: <b>${best.name}</b> <b class="up">${signed(best.pnl)}</b>`:''}${worst&&(worst.pnl||0)<0?` · 아쉬움: <b>${worst.name}</b> <b class="down">${signed(worst.pnl)}</b>`:''}</div>`:'<div class="pm-note">이번 달 거래 기록이 아직 없습니다.</div>'}`);
}
/* AI 브리핑 음성 읽기 */
let _ttsOn=false;
function toggleBriefTts(){
  try{
    const btn=$('briefTts');
    if(_ttsOn){speechSynthesis.cancel();_ttsOn=false;if(btn)btn.classList.remove('on');return;}
    const box=$('aiBrief');if(!box)return;
    const txt=(box.innerText||'').replace(/\s+/g,' ').slice(0,900);
    if(!txt){toast('warn','읽을 브리핑이 없어요','');return;}
    const u=new SpeechSynthesisUtterance(txt);u.lang='ko-KR';u.rate=1.05;
    u.onend=()=>{_ttsOn=false;if(btn)btn.classList.remove('on');};
    speechSynthesis.cancel();speechSynthesis.speak(u);
    _ttsOn=true;if(btn)btn.classList.add('on');
  }catch(e){toast('warn','이 브라우저는 음성 읽기를 지원하지 않아요','');}
}
/* PRO 전략 성적 */
function openStratStats(){
  const rows=SURGE_STRATS.map(st=>{
    const a=surgeAcc(st.id)||{n:0,rate:null};
    const r=a.n>=3?a.rate:null;
    return `<div class="ss-r"><b>${st.name||st.id}</b>
      <div class="ss-bar"><i style="width:${r==null?0:Math.min(100,r)}%"></i></div>
      <span class="num">${r==null?'표본 부족':r+'% ('+a.n+'건)'}</span></div>`;}).join('');
  openLiteGate('급등 전략 성적표',`${rows}
    <div class="pm-note">각 전략이 포착한 신호가 3거래일 내 +5%에 도달한 비율(자동 축적 · 표본 3건 이상부터 표시)</div>`);
}
/* ══ [v2.5] 자동 주문·가격 알림 엔진 ══
   12초 시계로 예약 지정가·손절·익절·가격 알림을 감시한다(표시 시세와 같은 dispQuote 기준). */
function autoWatchCodes(){
  const set=new Set();
  bookOrders.forEach(o=>set.add(o.code));
  holdings.forEach(h=>{if(h.stopPx||h.takePx)set.add(h.code);});
  Object.keys(priceAlerts).forEach(c=>set.add(c));
  return [...set];
}
function subscribeAutoCodes(){try{autoWatchCodes().forEach(c=>{ensureStock(c,'','');feed&&feed.addCode(c);});}catch(e){}}
let _autoLast={};
function autoOrderTick(){
  if(!currentUser)return;
  let changed=false;
  /* 예약 지정가 */
  for(const o of bookOrders.slice()){
    const q=dispQuote(o.code);if(!q||q.price==null)continue;
    const hit=o.side==='buy'?q.price<=o.price:q.price>=o.price;
    if(!hit)continue;
    const st=byCode[o.code];if(!st)continue;
    /* [v4.5] 예전엔 체결을 시도하기 '전에' 예약을 지웠다. 예수금이 모자라 체결이
       실패하면 예약이 아무 안내 없이 사라졌다. 성공했을 때만 목록에서 뺀다. */
    const okd=executeOrderCore(st,{side:o.side,price:o.price,qty:o.qty},'예약 체결');
    if(okd){bookOrders=bookOrders.filter(x=>x.id!==o.id);changed=true;}
    else if(o.side==='buy'&&orderCost('buy',o.price,o.qty).cost>cash){
      bookOrders=bookOrders.filter(x=>x.id!==o.id);changed=true;
      toast('warn','예약 주문 취소 · 예수금 부족',`${o.name} ${KRW(o.qty)}주 · ${KRW(o.price)}원 조건에 도달했지만 예수금이 모자라 체결하지 못했습니다.`);
    }
  }
  /* 손절·익절(보유 전량) */
  for(const h of holdings.slice()){
    const q=dispQuote(h.code);if(!q||q.price==null)continue;
    const st=byCode[h.code];if(!st)continue;
    if(h.stopPx&&q.price<=h.stopPx){const px=q.price;delete h.stopPx;delete h.takePx;
      executeOrderCore(st,{side:'sell',price:px,qty:h.qty},'손절 자동');changed=true;continue;}
    if(h.takePx&&q.price>=h.takePx){const px=q.price;delete h.stopPx;delete h.takePx;
      executeOrderCore(st,{side:'sell',price:px,qty:h.qty},'익절 자동');changed=true;}
  }
  /* 가격 알림(도달 시 1회) */
  for(const [c,a] of Object.entries(priceAlerts)){
    const q=dispQuote(c);if(!q||q.price==null)continue;
    const nm=a.name||(byCode[c]&&byCode[c].name)||c;
    if(a.above&&q.price>=a.above){notifyPrice(nm,c,'목표가 도달 ↑',a.above,q.price);delete a.above;changed=true;}
    if(a.below&&q.price<=a.below){notifyPrice(nm,c,'하락 알림 ↓',a.below,q.price);delete a.below;changed=true;}
    if(!a.above&&!a.below)delete priceAlerts[c];
  }
  if(changed){saveState();try{clanAutoSync(true);frAutoSync(true);}catch(e){}
    if(currentView==='account'){safeRun('holdings',renderHoldings);safeRun('autocard',renderAutoCard);}
    safeRun('mysum',renderMySum);safeRun('mysumtidy',tidyMySum);}
}
function notifyPrice(nm,code,kind,target,cur){
  toast('on',`${nm} ${kind}`,`설정 ${KRW(target)}원 · 현재 ${KRW(cur)}원`);
  try{
    if('Notification' in window&&Notification.permission==='granted')
      new Notification(`LIVE증권 · ${nm}`,{body:`${kind} — 설정 ${KRW(target)}원 · 현재 ${KRW(cur)}원`,icon:'/icon-192.png',tag:'px-'+code});
  }catch(e){}
}
setInterval(()=>{try{autoOrderTick();}catch(e){}},12e3);
setTimeout(subscribeAutoCodes,3000);
/* ── [v2.5] 월간 수익률(클랜 리그 기준) — 월초 총자산 대비 ── */
function totalAssetsNow(){ return eqTotalNow(); }   // [v4.5] 계산식 이원화 제거 — 자산 추이와 클랜 리그가 같은 값을 쓴다
function monthPerf(){
  const ym=kstMonth();
  const cur=totalAssetsNow();
  let mb=userPrefs.monthBase;
  if(!mb||mb.ym!==ym||!(mb.base>0)){mb={ym,base:cur};userPrefs.monthBase=mb;savePrefs();return {ym,rate:0,base:cur};}
  return {ym,rate:mb.base?(cur-mb.base)/mb.base*100:0,base:mb.base};
}
/* ── [v2.5] 초성 검색 ── */
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function choOf(str){let r='';for(const ch of String(str)){const c=ch.charCodeAt(0);
  if(c>=0xAC00&&c<=0xD7A3)r+=CHO[Math.floor((c-0xAC00)/588)];else r+=ch;}return r;}
const _choCache=new Map();
function choMatch(name,q){
  if(!/^[ㄱ-ㅎ]{2,}$/.test(q))return false;
  let c=_choCache.get(name);if(c===undefined){c=choOf(name);_choCache.set(name,c);}
  return c.includes(q);
}
/* ── [v2.5] 관심종목 실적 D-1 알림(하루 1회) ── */
function earnCheckDaily(){
  try{
    if(!watchlist.length||typeof calEventsFor!=='function')return;
    const ymd=kstDay();
    if(localStorage.getItem('earnNotiYmd')===ymd)return;
    const tm=new Date(Date.now()+86400000);
    const evs=calEventsFor(tm)||[];
    const names=new Set(watchlist.map(c=>(byCode[c]&&byCode[c].name)||''));
    const hits=evs.filter(e=>e.cat==='kearn'&&e.title&&[...names].some(n=>n&&e.title.includes(n))).slice(0,4);
    if(hits.length){
      localStorage.setItem('earnNotiYmd',ymd);
      toast('on','내일 실적 발표 — 관심종목',hits.map(h=>h.title.split(' ')[0]).join(', '));
    }
  }catch(e){}
}
setTimeout(earnCheckDaily,9000);
/* ══ [v2.4] 홈 실시간 뉴스 ══ — 네이버 금융 '주요뉴스'(방송사·주요 경제지 공식 보도 큐레이션) */
const TV_PRESS=/SBS|KBS|MBC|YTN|연합뉴스TV|한국경제TV|매일경제TV|이데일리TV|MTN|JTBC|채널A|TV조선|MBN|아리랑/;
function agoStr(ts){
  if(!ts)return '';
  const m=String(ts).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(!m)return ts;
  const t=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]).getTime();
  const d=Date.now()-t;
  if(d<60e3)return '방금 전';
  if(d<3600e3)return Math.floor(d/60e3)+'분 전';
  if(d<86400e3)return Math.floor(d/3600e3)+'시간 전';
  return m[2]+'.'+m[3];
}
let _newsShown=8;
function renderHomeNews(){
  const el=$('homeNews');if(!el)return;
  const items=(moodCache&&moodCache.items)||[];
  if(!items.length){
    el.innerHTML='<div class="hn-load">뉴스를 불러오는 중…</div>';
    ensureMood().then(()=>{if(currentView==='home'&&moodCache&&moodCache.items&&moodCache.items.length)renderHomeNews();});
    return;
  }
  const list=items.slice(0,_newsShown);
  el.innerHTML=list.map(x=>{
    const tv=TV_PRESS.test(x.press||'');
    return `<a class="hn-row" href="${x.url}" target="_blank" rel="noopener noreferrer">
      <span class="hn-p ${tv?'tv':''}">${tv?'📺 ':''}${x.press||'뉴스'}</span>
      <span class="hn-t">${x.t}</span>
      <span class="hn-time">${agoStr(x.time)}</span></a>`;
  }).join('')
  +(items.length>_newsShown?`<button class="hn-more" id="hnMore">뉴스 ${Math.min(items.length,24)-_newsShown}건 더 보기</button>`
    :_newsShown>8?`<button class="hn-more" id="hnMore" data-less="1">접기</button>`:'');
  const mb=$('hnMore');
  if(mb)mb.onclick=()=>{_newsShown=mb.dataset.less?8:24;renderHomeNews();};
}
/* [v2.3.2] 투자자 동향(코스피 개인/외국인/기관 순매수) — 10분 캐시 */
let invCache=null,_invAt=0,_invBusy=false;
async function ensureInvestors(){
  if(_invBusy||Date.now()-_invAt<10*60e3)return invCache;
  _invBusy=true;
  try{fnBump();const r=await fetch('/api/investors?market=1',{cache:'default'});const j=await r.json();
    if(j&&j.ok)invCache=j;_invAt=Date.now();}catch(e){}
  _invBusy=false;return invCache;
}
const fmtJo=(eok)=>{if(eok==null)return '—';const a=Math.abs(eok);const s=eok<0?'-':'+';
  return a>=10000?s+(a/10000).toFixed(1)+'조':s+a.toLocaleString()+'억';};
function invLineHtml(v){
  if(!v)return '';
  const c=(x)=>x>=0?'up':'down';
  return `<span class="hm-inv"><i>외국인</i><b class="num ${c(v.foreign)}">${fmtJo(v.foreign)}</b><i>기관</i><b class="num ${c(v.inst)}">${fmtJo(v.inst)}</b><i>개인</i><b class="num ${c(v.personal)}">${fmtJo(v.personal)}</b></span>`;
}
/* [v2.3.2] 히어로 자산 카드 하단 — 자산 추이 스파크 + 미니 요약(허전한 여백 채움) */
/* [v2.9.3] 장중 점이 생기면서 '최근 N일'이 맞지 않게 됐다 — 실제 기록 구간으로 표기 */
function eqSpanLabel(){
  const a=equityHist[0],b=equityHist[equityHist.length-1];
  if(!a||!b)return '최근';
  const days=new Set(equityHist.map(x=>x.d)).size;
  if(days>1)return '최근 '+days+'일';
  const t0=a.t||0,t1=b.t||0,mn=Math.round((t1-t0)/6e4);
  return mn>=60?('오늘 '+Math.round(mn/60)+'시간'):mn>=1?('오늘 '+mn+'분'):'오늘';
}
function drawHeroEq(){
  const cv=$('heroEq');if(!cv)return;
  /* [v2.5.7] 기록이 없어도 항상 그린다 — 변동이 없으면 현재 평가액에서 수평선으로 표시 */
  let pts=equityHist.slice(-60).map(x=>x.v);
  const curTot=totalAssetsNow();
  const note=$('haMini');
  /* ══ [v4.61] 기록이 하루뿐일 때 ═══════════════════════════════════════════
     예전에는 같은 값 두 개를 만들어 억지로 직선을 그었다. 화면에는 아무 의미 없는
     가로줄만 남아 '차트가 고장 난 것처럼' 보였다(가장 자주 나오는 첫날 상태인데도).
     → 점이 두 개 미만이면 선 대신 '기록이 쌓이는 중'이라고 말해 준다.
        거짓 그래프를 그리는 것보다 아무것도 없다고 말하는 편이 정직하다. */
  if(pts.length<2){
    cv.style.display='none';
    if(note)note.innerHTML=`<span class="ha-seed">📈 평가액 <b>${KRW(curTot)}원</b>
      · 자산 추이 그래프는 <b>내일부터</b> 그려집니다 (하루에 한 점씩 쌓입니다)</span>`;
    return;
  }
  cv.style.display='block';
  const dpr=window.devicePixelRatio||1,W=cv.clientWidth||420,H=52;
  cv.width=W*dpr;cv.height=H*dpr;
  const x=cv.getContext('2d');x.scale(dpr,dpr);
  let lo=Math.min(...pts),hi=Math.max(...pts);
  {const _p=Math.max(1000,(hi||1)*0.0015); if(hi-lo<_p){const _c=(hi+lo)/2; lo=_c-_p/2; hi=_c+_p/2;}}   // [v3.7] 미세 잡음 확대 완화
  const pad=(hi-lo)*0.24||1;lo-=pad;hi+=pad;   // [v3.7] 선이 카드 윗변에 붙던 문제 — 여백 확대
  const X=i=>4+i/(pts.length-1)*(W-8),Y=v=>4+(1-(v-lo)/(hi-lo))*(H-8);
  const up=pts[pts.length-1]>=pts[0];
  const col=up?'#ffcf57':'#7fb2ff';
  x.beginPath();x.moveTo(X(0),H);pts.forEach((v,i)=>x.lineTo(X(i),Y(v)));x.lineTo(X(pts.length-1),H);x.closePath();
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,up?'rgba(255,207,87,.35)':'rgba(127,178,255,.3)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fill();
  x.strokeStyle=col;x.lineWidth=2;x.beginPath();pts.forEach((v,i)=>{i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v));});x.stroke();
  const d=pts[pts.length-1]-pts[0],r=pts[0]?d/pts[0]*100:0;
  if(note){
    /* [v3.0.1] '변동 없음' 판정을 양 끝값 비교에서 전체 최고·최저 비교로 바꾼다.
       기록에 오르내림이 분명히 있는데도 우연히 시작값과 현재값이 같으면
       "아직 변동이 없어 기준선으로 표시"가 떴다(첨부 사진). 그래프는 이미 꺾여 있는데. */
    const flat=(Math.max(...pts)-Math.min(...pts))<1;
    note.innerHTML=flat
      ?`평가액 <b class="num">${KRW(Math.round(curTot))}원</b> · 아직 변동이 없어 기준선으로 표시돼요 · 보유 <b>${holdings.length}</b> · 관심 <b>${watchlist.length}</b>`
      :`${eqSpanLabel()} <b class="num">${(d>=0?'+':'')+KRW(Math.round(d))}원 (${(r>=0?'+':'')+r.toFixed(2)}%)</b> · 보유 <b>${holdings.length}</b> · 관심 <b>${watchlist.length}</b>`;
  }
}
/* [v2.3.2] 점프바 우측 — 실시간 인기 종목 티커(조회수 랭킹 상위 5) */
let _hhTry=0;
var homeHotMkt='kr';
async function renderHomeHot(){
  const el=$('homeHot'), wrap=$('homeHotWrap'); if(!el)return;
  /* [v4.41] 시장 탭 배선 — 한 번만 건다 */
  const mt=$('homeHotMkt');
  if(mt&&!mt._w){mt._w=1;
    mt.querySelectorAll('[data-hmkt]').forEach(b=>b.onclick=()=>{
      homeHotMkt=b.dataset.hmkt;
      mt.querySelectorAll('[data-hmkt]').forEach(x=>x.classList.toggle('on',x===b));
      renderHomeHot();});}
  if(homeHotMkt==='us'){ renderHomeHotUs(); return; }
  try{
    const items=(await loadRank('조회수'))||[];
    const top=items.slice(0,5).filter(x=>x&&x.code);
    /* [v4.41] 국내 목록이 비어도 묶음을 감추지 않는다 — 감추면 해외 탭까지 사라져 전환할 수 없다 */
    if(wrap)wrap.hidden=false;
    if(!top.length){ el.innerHTML=`<span class="hh-t">🔥 인기</span><span class="hh-wait">국내 순위를 불러오지 못했습니다</span>`; return; }
    el.innerHTML=`<span class="hh-t">🔥 인기</span>`+top.map((x,i)=>{
      const st=byCode[x.code],q=st?dispQuote(x.code):null;
      const p=(q&&q.price!=null&&q.prevClose)?(q.price-q.prevClose)/q.prevClose*100:null;
      return `<button class="hh-c" data-code="${x.code}"><i class="hh-r${i<3?' top':''}">${i+1}</i>${stockLogo(x.code,x.name||(st&&st.name)||x.code,'xs')}${x.name||x.code}${p!=null?` <b class="num ${p>=0?'up':'down'}">${pctS(p)}</b>`:''}</button>`;
    }).join('');
    el.querySelectorAll('.hh-c').forEach(b=>b.onclick=()=>openTrade(b.dataset.code));
    /* [v2.9.6 · 치명] 무한 재호출 차단.
       시세를 못 채우면 조건이 계속 참이라 primeQuotes → renderHomeHot → primeQuotes …
       가 끝없이 돌았다. /api/quote 가 죽었거나 신규상장·거래정지처럼 전일종가가
       없는 종목이 인기 5위 안에 들면 실제로 발생한다(탭 정지 + 함수 호출 한도 소진).
       보충 시도는 2회까지만 하고, 값이 다 채워지면 카운터를 되돌린다. */
    const _need=top.some(x=>{const st=byCode[x.code];return !st||st.price==null||!st.prevClose;});
    if(!_need)_hhTry=0;
    else if(_hhTry<2){ _hhTry++;
      primeQuotes(top.map(x=>x.code)).then(()=>{if(currentView==='home')safeRun('homehot2',()=>renderHomeHot());}); }
  }catch(e){ const w2=$('homeHotWrap'); if(w2)w2.hidden=false;
    if(el)el.innerHTML=`<span class="hh-t">🔥 인기</span><span class="hh-wait">국내 순위를 불러오지 못했습니다</span>`; }
}
/* [v4.41] 홈 인기 — 해외(거래대금 상위 5) */
function renderHomeHotUs(){
  const el=$('homeHot'), wrap=$('homeHotWrap'); if(!el)return;
  const ready=US_UNI.map(u=>u[0]).filter(t=>usQ[t]&&usQ[t].price!=null);
  if(ready.length<5){
    if(wrap)wrap.hidden=false;
    if(_usQFail>=2){ /* [v4.48] 무한 '불러오는 중' 수리 — 실패가 이어지면 멈추고 버튼으로만 재시도 */
      el.innerHTML=`<span class="hh-t">🔥 인기</span><span class="hh-wait">해외 시세 서버가 응답하지 않습니다</span><button class="hh-c" id="hhUsRetry">다시 시도</button>`;
      const b=$('hhUsRetry'); if(b)b.onclick=()=>{_usQFail=0;renderHomeHotUs();};
      return;
    }
    el.innerHTML=`<span class="hh-t">🔥 인기</span><span class="hh-wait">해외 시세를 불러오는 중…</span>`;
    usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(()=>{ if(currentView==='home'&&homeHotMkt==='us')renderHomeHotUs(); });
    return;
  }
  const val=t=>(usQ[t].price||0)*(usQ[t].vol||0);
  const top=ready.slice().sort((a,b)=>val(b)-val(a)).slice(0,5);
  if(wrap)wrap.hidden=false;
  el.innerHTML=`<span class="hh-t">🔥 인기</span>`+top.map((t,i)=>{
    const q=usQ[t],m=usMeta[t];
    const p=(q.prev)?(q.price-q.prev)/q.prev*100:null;
    return `<button class="hh-c" data-ushot="${t}"><i class="hh-r${i<3?' top':''}">${i+1}</i>${usTick(t)}${m.kr}${p!=null?` <b class="num ${p>=0?'up':'down'}">${pctS(p)}</b>`:''}</button>`;
  }).join('');
  el.querySelectorAll('[data-ushot]').forEach(b=>b.onclick=()=>openUS(b.dataset.ushot));
}
/* [v2.5.1] 내용이 비어 있는 관심 요약 카드가 빈 흰 상자로 남던 문제 */
function tidyMySum(){const el=$('myWatchSum');if(el&&!el.hidden&&!String(el.textContent||'').trim())el.hidden=true;}
function renderHomeHead(){
  const g=$('homeGreet');
  if(g){const k=kstNow(),h=k.getUTCHours();
    const nm=(currentUser&&(currentUser.name||currentUser.nick))?`, ${currentUser.name||currentUser.nick}님`:'';
    g.textContent=(h<5?'좋은 새벽이에요':h<12?'좋은 아침이에요':h<18?'좋은 오후예요':'좋은 저녁이에요')+nm;}
  const c=$('homeSess');
  if(c){const ses=marketSessionKST();
    const lab=ses==='holiday'?['hol','휴장일']:ses==='pre'?['prem','장 시작 전']:ses==='post'?['post','장 종료']:(nxtLiveBandKST()?['nxt','NXT 세션 진행 중']:['uni','정규장 진행 중']);
    const k=kstNow();
    c.innerHTML=`<i class="hs-dot ${lab[0]}"></i>${lab[1]} · ${'일월화수목금토'[k.getUTCDay()]}요일 ${String(k.getUTCHours()).padStart(2,'0')}:${String(k.getUTCMinutes()).padStart(2,'0')} KST`;}
}
function renderHome(){
  loadCalendarEvents();
  renderCalendar();
  safeRun('mysum',renderMySum);safeRun('mysumtidy',tidyMySum);
  safeRun('homehead',renderHomeHead);
  safeRun('heromkt',renderHeroMarket);
  /* [v2.9.3] 그리기 전에 기록을 먼저 갱신한다.
     예전엔 홈이 계좌 화면보다 먼저 그려지는 바람에 점이 하나뿐인 상태를 보고
     '아직 변동이 없어 기준선으로 표시'를 띄웠다(실제로는 손익이 나 있었다). */
  safeRun('heroeq',()=>{seedEquityFromTrades();recordEquity();drawHeroEq();});
  safeRun('bgList',refreshStockListSoon);
  safeRun('homehot',renderHomeHot);
  /* [v4.41] 홈에서도 해외 시세가 필요하다 — 보유 해외 종목과 대표 지수 ETF를 받아 둔다 */
  safeRun('homeus',()=>{
    const need=['SPY','QQQ'].concat((holdings||[]).filter(x=>x&&x.us).map(x=>x.code));
    if(need.length)usEnsureQuotes([...new Set(need)],true).then(()=>{
      if(currentView!=='home')return;
      try{renderHeroMarket();}catch(e){}
      try{renderPortfolioNumbers();}catch(e){}
      try{renderMySum();}catch(e){}
    });
  });
  safeRun('homenews',renderHomeNews);
}

/* ===== 투자 캘린더 (실제 일정) ===== */
// 경제지표·실적·이벤트 주요 일정 (cat: econ 경제 / earn 실적 / theme 종목·테마 / ipo 공모)
// ===== 실제 데이터 기반 투자 캘린더 =====
// 2026 국내 증시 휴장일(공휴일·근로자의날·연말 폐장) — 실제 확정 일정
const KR_HOLIDAYS={
  '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴',
  '2026-03-02':'삼일절 대체휴일','2026-05-01':'근로자의 날','2026-05-05':'어린이날',
  '2026-05-25':'부처님오신날 대체휴일','2026-06-03':'제9회 전국동시지방선거','2026-08-17':'광복절 대체휴일',
  '2026-09-24':'추석 연휴','2026-09-25':'추석','2026-09-28':'추석 대체휴일',
  '2026-10-05':'개천절 대체휴일','2026-10-09':'한글날','2026-12-25':'성탄절','2026-12-31':'연말 휴장'
};
// 2026 미국 증시(NYSE·나스닥) 휴장일
const US_HOLIDAYS={
  '2026-01-01':'신정','2026-01-19':'마틴 루터 킹 데이','2026-02-16':'대통령의 날','2026-04-03':'성금요일',
  '2026-05-25':'메모리얼 데이','2026-06-19':'준틴스','2026-07-03':'독립기념일(대체)','2026-09-07':'노동절',
  '2026-11-26':'추수감사절','2026-12-25':'성탄절'
};
// 2026 일본 증시(도쿄증권거래소) 휴장일
const JP_HOLIDAYS={
  '2026-01-01':'신정','2026-01-02':'연말연시','2026-01-03':'연말연시','2026-01-12':'성인의 날',
  '2026-02-11':'건국기념일','2026-02-23':'천황탄생일','2026-03-20':'춘분의 날','2026-04-29':'쇼와의 날',
  '2026-05-03':'헌법기념일','2026-05-04':'녹색의 날','2026-05-05':'어린이날','2026-05-06':'대체휴일',
  '2026-07-20':'바다의 날','2026-08-11':'산의 날','2026-09-21':'경로의 날','2026-09-22':'국민의 휴일',
  '2026-09-23':'추분의 날','2026-10-12':'스포츠의 날','2026-11-03':'문화의 날','2026-11-23':'근로감사의 날',
  '2026-12-31':'연말 휴장'
};
// 2026 FOMC 기준금리 결정일(둘째 날 발표) — 미 연준 공식 일정
const FOMC_2026=new Set(['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09']);
// n번째 요일(wd: 0=일~6=토) 계산
function nthWeekday(y,m,wd,n){const first=new Date(y,m-1,1);let day=(wd-first.getDay()+7)%7+1;day+=(n-1)*7;return new Date(y,m-1,day);}
const CAL_IC={econ:['cal-ic-econ','📄'],earn:['cal-ic-earn','📢'],theme:['cal-ic-theme','📈'],ipo:['cal-ic-ipo','📅'],market:['cal-ic-econ','🏛️'],holiday:['cal-ic-ipo','🏖️'],fomc:['cal-ic-econ','🏦'],deriv:['cal-ic-theme','⚡'],jobs:['cal-ic-econ','📊'],trade:['cal-ic-econ','🚢']};
const CAL_WD=['일','월','화','수','목','금','토'];
let calMonth=null,calSel=null,calDetailOpen=null,calShowAll=false;const calDetailCache={};   // [수정] 주간 스트립 → 월간 달력 + 일정 상세(아코디언)
function isoLocal(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function sundayOf(d){const x=new Date(d);x.setDate(x.getDate()-x.getDay());x.setHours(0,0,0,0);return x;}
function calEventsFor(d){
  const iso=isoLocal(d),evs=[];
  // 실데이터: 공모주(38커뮤니케이션)
  (ipoList||[]).forEach(it=>{
    if(it.subStart===iso)evs.push({cat:'ipo',t:it.name+' 공모청약 시작',sub:'공모 · '+(it.brokers&&it.brokers.length?'청약 증권사: '+it.brokers.slice(0,2).join(', '):'신규 청약')});
    else if(it.subEnd===iso)evs.push({cat:'ipo',t:it.name+' 공모청약 마감',sub:'공모 · 청약 마감일'});
    if(it.refund===iso)evs.push({cat:'ipo',t:it.name+' 청약 환불일',sub:'공모 · 환불'});
    if(it.listing===iso)evs.push({cat:'ipo',t:it.name+' 신규 상장',sub:'공모 · 상장'});
  });
  // 주요 일정(실제 확정 데이터): 증시 휴장 · FOMC · 파생 만기 · 미국 지표
  if(KR_HOLIDAYS[iso])evs.push({cat:'holiday',t:'휴장 한국',sub:KR_HOLIDAYS[iso],country:'kr'});
  if(US_HOLIDAYS[iso])evs.push({cat:'holiday',t:'휴장 미국',sub:US_HOLIDAYS[iso],country:'us'});
  if(JP_HOLIDAYS[iso])evs.push({cat:'holiday',t:'휴장 일본',sub:JP_HOLIDAYS[iso],country:'jp'});
  if(FOMC_2026.has(iso))evs.push({cat:'fomc',t:'미 연준 FOMC 기준금리 결정',imp:1,sub:'통화정책 · 한국시간 새벽 발표'});
  const y=d.getFullYear(),m=d.getMonth()+1;
  if(isoLocal(nthWeekday(y,m,4,2))===iso){const quad=[3,6,9,12].includes(m);
    evs.push({cat:'deriv',t:quad?'선물·옵션 동시만기 (네 마녀의 날)':'옵션 만기일',imp:quad?1:0,sub:'파생 · 만기일 변동성 확대'});}
  if(isoLocal(nthWeekday(y,m,5,1))===iso)evs.push({cat:'jobs',t:'미국 고용보고서 (비농업·실업률)',sub:'경제지표 · 한국시간 밤 발표',country:'us'});
  if(d.getDate()===1&&d.getDay()!==0&&d.getDay()!==6)evs.push({cat:'trade',t:'한국 수출입 동향 (관세청)',sub:'경제지표 · 월초 발표',country:'kr'});
  // 실데이터: 주요 기업 실적 발표(야후 파이낸스) — 국내/미국
  (earningsEvents||[]).forEach(e=>{if(e.date===iso)evs.push({cat:'earn',t:e.title,sub:e.tag||'실적',country:e.country,sure:e.sure,
    code:e.code||null,ticker:e.ticker||null,epsF:e.epsF!=null?e.epsF:null,revF:e.revF!=null?e.revF:null,past:!!e.past});});
  return evs;
}
let earningsEvents=null;
function loadCalendarEvents(){
  if(earningsEvents!==null)return; earningsEvents=[];
  fetch('/api/calendar',{cache:'default'}).then(r=>r.json()).then(j=>{earningsEvents=(j&&j.events)||[];if(currentView==='home')renderCalendar();}).catch(()=>{});
}
/* 억원 단위 표기 — 1조 이상 O.O조, 그 외 O,OOO억 (음수 지원) */
function fmtEok(v){if(v==null||!isFinite(v))return '—';const a=Math.abs(v),sg=v<0?'-':'';
  if(a>=10000)return sg+(a/10000).toFixed(1).replace(/\.0$/,'')+'조';
  return sg+Math.round(a).toLocaleString()+'억';}
function yoyBadge(y){
  if(!y)return '';
  if(y.turn)return `<i class="cd-yy ${y.turn==='흑자전환'?'up':'down'}">${y.turn}</i>`;
  if(y.pct==null)return '';
  const up=y.pct>=0;return `<i class="cd-yy ${up?'up':'down'}">YoY ${up?'+':''}${y.pct.toFixed(1)}%</i>`;}
function renderCalendar(){
  const grid=$('calGrid');if(!grid)return;
  const today=new Date();today.setHours(0,0,0,0);
  if(!calMonth)calMonth=new Date(today.getFullYear(),today.getMonth(),1);
  if(!calSel)calSel=new Date(today);
  const y=calMonth.getFullYear(),mo=calMonth.getMonth();
  const tt=$('calTitle');if(tt)tt.textContent=`${y}년 ${mo+1}월`;
  const first=new Date(y,mo,1),startD=new Date(first);startD.setDate(1-first.getDay());
  const selIso=isoLocal(calSel),todayIso=isoLocal(today);
  const DOT={ipo:'#f5a623',earn:'#8b5cf6',holiday:'#f43f5e',deriv:'#ec4899'};   // 그 외(경제지표)=청록
  let html='';
  for(let i=0;i<42;i++){
    const d=new Date(startD);d.setDate(startD.getDate()+i);
    const iso=isoLocal(d),dim=d.getMonth()!==mo;
    const dots=calEventsFor(d).slice(0,4).map(e=>`<i style="background:${DOT[e.cat]||'#0ea5a4'}"></i>`).join('');
    const wc=d.getDay()===0?' sun':d.getDay()===6?' sat':'';
    html+=`<button class="cal-cell${dim?' dim':''}${iso===todayIso?' today':''}${iso===selIso?' on':''}${wc}" data-d="${iso}"><span class="cal-n num">${d.getDate()}</span><span class="cal-dots">${dots}</span></button>`;
  }
  grid.innerHTML=html;
  grid.querySelectorAll('.cal-cell').forEach(b=>b.onclick=()=>{const [yy,mm,dd]=b.dataset.d.split('-').map(Number);
    calSel=new Date(yy,mm-1,dd);calDetailOpen=null;calShowAll=false;
    if(mm-1!==mo||yy!==y)calMonth=new Date(yy,mm-1,1);   // 앞뒤 달 날짜를 누르면 그 달로 넘어감
    renderCalendar();});
  renderCalEvents();
}
function renderCalEvents(){
  const box=$('calEvents');if(!box||!calSel)return;
  const today=new Date();today.setHours(0,0,0,0);
  const evs=calEventsFor(calSel);
  const diff=Math.round((today-calSel)/86400000);
  const dday=diff===0?'오늘':diff>0?'D+'+diff:'D-'+(-diff);
  const mm=String(calSel.getMonth()+1).padStart(2,'0'),dd2=String(calSel.getDate()).padStart(2,'0');
  const lab=`${mm}.${dd2}.${CAL_WD[calSel.getDay()]}`;
  const head=`<div class="cal-datehd"><span class="cal-date-lab">${lab}</span><span class="cal-dday${diff===0?' today':''}">${dday}</span>${evs.length?`<span class="cal-cnt num">총 ${evs.length}건</span>`:''}</div>`;
  /* [수정] 일정이 긴 날(실적 시즌 10건+)은 5건만 먼저 보여 주고 '더 보기'로 펼친다 — 화면이 끝없이 길어지던 문제 */
  const LIM=5;
  const showEvs=(calShowAll||evs.length<=LIM+1)?evs:evs.slice(0,LIM);
  box.innerHTML=head+(evs.length?showEvs.map((e,i)=>{
    const ic=CAL_IC[e.cat]||CAL_IC.theme;
    const flag=e.country==='kr'?'🇰🇷':e.country==='us'?'🇺🇸':e.country==='jp'?'🇯🇵':'';
    const icEmoji=(e.cat==='earn'&&flag)?flag:ic[1];
    const flagBadge=(flag&&e.cat!=='earn')?`<span class="cal-flag">${flag}</span>`:'';
    const open=calDetailOpen===i;
    return `<div class="cal-ev clickable${open?' open':''}" data-ei="${i}" role="button"><div class="cal-ev-ic ${ic[0]}">${icEmoji}</div><div class="cal-ev-b">
      <div class="cal-ev-t">${flagBadge}${e.t}${e.cat==='earn'?(e.sure?'<span class="cal-sure ok">확정</span>':'<span class="cal-sure est">추정</span>'):''}${e.imp?'<span class="cal-imp">중요</span>':''}</div>
      <div class="cal-ev-tag">${e.sub||''}</div></div><span class="cal-chev">${open?'▾':'▸'}</span></div>${open?`<div class="cal-detail">${calDetailHtml(e)}</div>`:''}`;
  }).join('')+(evs.length>showEvs.length?`<button class="cal-more" id="calMore">실적 일정 ${evs.length-showEvs.length}개 더 보기 ▾</button>`
      :(calShowAll&&evs.length>LIM+1?`<button class="cal-more" id="calMore">접기 ▴</button>`:''))
    :'<div class="cal-empty">이 날짜에는 표시할 주요 일정이 없습니다.</div>');
  {const mb=$('calMore');if(mb)mb.onclick=()=>{calShowAll=!calShowAll;if(!calShowAll)calDetailOpen=null;renderCalEvents();};}
  box.querySelectorAll('.cal-ev.clickable').forEach(el=>el.onclick=()=>{
    const i=+el.dataset.ei;calDetailOpen=(calDetailOpen===i?null:i);
    if(calDetailOpen===i){const e=evs[i];if(e&&e.cat==='earn'&&e.code)loadCalDetail(e.code);}
    renderCalEvents();});
  box.querySelectorAll('.cal-stk').forEach(el=>el.onclick=(ev)=>{ev.stopPropagation();openTrade(el.dataset.code);});
}
/* 실적 상세 데이터 로드 — undefined=미요청 · null=로딩 중 · false=실패 · 객체=데이터 */
function loadCalDetail(code){
  if(calDetailCache[code]!==undefined)return;
  calDetailCache[code]=null;
  fetch('/api/calendar?detail='+code,{cache:'default'}).then(r=>r.json()).then(j=>{
    calDetailCache[code]=(j&&j.ok)?j:false;
    if(j&&j.ok){ensureStock(code,'');primeQuotes([code]).then(()=>{if(calDetailOpen!=null)renderCalEvents();}).catch(()=>{});}
    renderCalEvents();
  }).catch(()=>{calDetailCache[code]=false;renderCalEvents();});
}
function calDetailHtml(e){
  if(e.cat==='earn'&&e.code){
    const det=calDetailCache[e.code];
    if(det===undefined||det===null)return '<div class="cd-loading">실적 데이터를 불러오는 중…</div>';
    if(det===false)return calEarnFallback(e);
    return calEarnDetailHtml(e,det);
  }
  return calStaticDetail(e);
}
function calEarnFallback(e){
  const rows=[];
  if(e.revF!=null)rows.push(`<div class="cd-sum"><span>매출액 전망</span><b class="num">${fmtEok(e.revF)}</b></div>`);
  if(e.epsF!=null)rows.push(`<div class="cd-sum"><span>주당순이익(EPS) 전망</span><b class="num">${Math.round(e.epsF).toLocaleString()}원</b></div>`);
  return (rows.length?rows.join('')+'<div class="cd-note">트레이딩뷰 컨센서스 · 분기 재무는 불러오지 못했습니다</div>'
    :'<div class="cd-loading">상세 재무 데이터를 찾지 못했습니다.</div>');
}
function calEarnDetailHtml(e,det){
  const code=e.code,st=byCode[code];
  const nm=(st&&st.name&&st.name!=='—'&&st.name!==code)?st.name:String(e.t).replace(/ 실적 발표.*$/,'');
  let chip;
  const _kq=st?dispQuote(code):null,_kp=(_kq&&_kq.price!=null)?_kq.price:(st&&st.price),_kv=(_kq&&_kq.prevClose)||(st&&st.prevClose);
  if(st&&_kp!=null){const chg=_kv?_kp-_kv:0,rt=_kv?chg/_kv*100:0,dir=dirOf(chg);   // [수정] 통합가
    chip=`<button class="cal-stk" data-code="${code}"><b>${nm}</b><span class="num">${KRW(_kp)}</span><span class="num ${dir}">${arrow(dir)} ${pctS(rt)}</span><i>주문 ›</i></button>`;}
  else chip=`<button class="cal-stk" data-code="${code}"><b>${nm}</b><span class="cd-src num">${code}</span><i>주문 ›</i></button>`;
  let html=chip;
  const nx=det.next;
  if(nx&&!e.past){
    html+=`<div class="cd-sec">다음 발표 전망 <span>${nx.label||''} · 증권사 추정 평균</span></div>`;
    const row=(k,v,yy)=>v==null?'':`<div class="cd-sum"><span>${k}</span><b class="num">${fmtEok(v)}</b>${yoyBadge(yy)}</div>`;
    html+=row('매출액',nx.rev,nx.yoy&&nx.yoy.rev)+row('영업이익',nx.op,nx.yoy&&nx.yoy.op)+row('당기순이익',nx.ni,nx.yoy&&nx.yoy.ni);
  }else if(!e.past&&(e.revF!=null||e.epsF!=null)){
    html+=`<div class="cd-sec">다음 발표 전망 <span>트레이딩뷰 컨센서스</span></div>`;
    if(e.revF!=null)html+=`<div class="cd-sum"><span>매출액</span><b class="num">${fmtEok(e.revF)}</b></div>`;
    if(e.epsF!=null)html+=`<div class="cd-sum"><span>주당순이익(EPS)</span><b class="num">${Math.round(e.epsF).toLocaleString()}원</b></div>`;
  }
  const lt=det.latest;
  if(lt){
    html+=`<div class="cd-sec">최근 발표 실적 <span>${(lt.label||lt.p||'').replace(' (예상)','')} · 전년 동기 대비 · 단위 ${det.unit||'억원'}</span></div>`;
    html+=cdMetric('매출액',lt,'rev')+cdMetric('영업이익',lt,'op')+cdMetric('당기순이익',lt,'ni');
  }
  const qs=(det.quarters||[]).filter(q=>q.op!=null);
  if(qs.length>=3){
    const mx=Math.max(...qs.map(q=>Math.abs(q.op)),1);
    html+=`<div class="cd-sec">영업이익 추이 <span>${det.period||'분기'} · 단위 ${det.unit||'억원'}</span></div><div class="cd-spark">`
      +qs.map(q=>{const h=Math.max(6,Math.round(Math.abs(q.op)/mx*46));
        return `<span class="cd-bar${q.op<0?' neg':''}${q.est?' est':''}" title="${q.label} ${fmtEok(q.op)}"><i style="height:${h}px"></i><em class="num">${String(q.p).slice(2).replace('/','.')}</em></span>`;}).join('')
      +`</div>`;
  }
  html+=`<div class="cd-note">${det.src||'네이버 금융'} · (예상) 표기는 증권사 컨센서스 평균</div>`;
  return html;
}
function cdMetric(name,lt,f){
  const v=lt[f];if(v==null)return '';
  const y=lt.yoy&&lt.yoy[f];
  let sum='';
  if(y&&y.turn)sum=`<b class="${y.turn==='흑자전환'?'up':'down'}">${y.turn}</b>`;
  else if(y&&y.pct!=null)sum=`<b class="${y.pct>=0?'up':'down'}">전년 동기보다 ${y.pct>=0?'+':''}${y.pct.toFixed(1)}% ${y.pct>=0?'증가':'감소'}</b>`;
  if(y&&y.prev!=null){
    const mx=Math.max(Math.abs(y.prev),Math.abs(v),1);
    const h1=Math.max(8,Math.round(Math.abs(y.prev)/mx*52)),h2=Math.max(8,Math.round(Math.abs(v)/mx*52));
    return `<div class="cd-metric"><div class="cd-mt">${name} ${sum}</div><div class="cd-pair">
      <div class="cd-col prev${y.prev<0?' neg':''}"><span class="cd-val num">${fmtEok(y.prev)}</span><i style="height:${h1}px"></i><em>전년 동기</em></div>
      <div class="cd-col cur${v<0?' neg':''}"><span class="cd-val num">${fmtEok(v)}</span><i style="height:${h2}px"></i><em>최근 발표</em></div>
    </div></div>`;
  }
  return `<div class="cd-metric"><div class="cd-mt">${name} ${sum}</div><div class="cd-sum"><span>발표치</span><b class="num">${fmtEok(v)}</b></div></div>`;
}
function calStaticDetail(e){
  if(e.cat==='fomc')return `<div class="cd-desc">미국 연방공개시장위원회(FOMC)가 이틀간의 회의를 마치고 <b>기준금리</b>를 결정합니다. 결과는 한국시간 <b>다음 날 새벽 3시</b>(서머타임 해제 시 4시)에 나오고 30분 뒤 의장 기자회견이 이어집니다. 금리 방향에 따라 다음 날 국내 증시 개장부터 환율·성장주가 크게 반응할 수 있습니다.</div>`;
  if(e.cat==='jobs')return `<div class="cd-desc">미국 노동부가 <b>비농업 고용자 수·실업률·시간당 임금</b>을 발표합니다. 한국시간 <b>밤 9시 30분</b>(서머타임 해제 시 10시 30분) 공개되며, 연준 금리 결정에 직결되는 핵심 지표라 발표 직후 미국 선물과 원/달러 환율이 급하게 움직이는 일이 많습니다.</div>`;
  if(e.cat==='trade')return `<div class="cd-desc">관세청이 <b>월간 수출입 동향</b>(수출액·수입액·무역수지)을 발표합니다. 반도체·자동차 등 품목별 수출 증감이 함께 공개돼 수출 대형주의 방향을 가늠하는 자료로 쓰입니다.</div>`;
  if(e.cat==='deriv')return `<div class="cd-desc">코스피200 <b>선물·옵션 만기일</b>입니다. 만기 청산을 위한 프로그램 매매가 장 마감 동시호가에 몰리며 지수가 갑자기 출렁일 수 있습니다.${/네 마녀/.test(e.t)?' 특히 선물·옵션 4종 만기가 겹치는 <b>동시만기(네 마녀의 날)</b>라 변동성이 더 큽니다.':''}</div>`;
  if(e.cat==='holiday')return `<div class="cd-desc"><b>${e.sub||'공휴일'}</b>로 해당 거래소가 휴장합니다. 이날은 주문 접수·체결·결제가 없으며, 해외 증시가 열려 있으면 다음 개장일에 그 흐름이 한꺼번에 반영될 수 있습니다.</div>`;
  if(e.cat==='ipo'){
    const nm=String(e.t).replace(/ (공모청약 시작|공모청약 마감|청약 환불일|신규 상장)$/,'');
    const it=(ipoList||[]).find(x=>x.name===nm);
    if(it){let rows='';
      if(it.priceBand)rows+=`<div class="cd-sum"><span>공모가 밴드</span><b class="num">${it.priceBand}원</b></div>`;
      if(it.subStart)rows+=`<div class="cd-sum"><span>청약 기간</span><b class="num">${it.subStart.slice(5).replace('-','.')} ~ ${(it.subEnd||'').slice(5).replace('-','.')}</b></div>`;
      if(it.refund)rows+=`<div class="cd-sum"><span>환불일</span><b class="num">${it.refund.slice(5).replace('-','.')}</b></div>`;
      if(it.listing)rows+=`<div class="cd-sum"><span>상장 예정</span><b class="num">${it.listing.slice(5).replace('-','.')}</b></div>`;
      if(it.brokers&&it.brokers.length)rows+=`<div class="cd-sum"><span>청약 증권사</span><b>${it.brokers.join(', ')}</b></div>`;
      if(it.sector)rows+=`<div class="cd-sum"><span>업종</span><b>${it.sector}</b></div>`;
      if(it.demand)rows+=`<div class="cd-sum"><span>수요예측 경쟁률</span><b class="num">${Number(it.demand).toLocaleString()}:1</b></div>`;
      return rows+'<div class="cd-note">출처 38커뮤니케이션 · 최종 조건은 DART 공시로 확인하세요</div>';}
    return `<div class="cd-desc">공모주 일정입니다. 홈 아래 <b>공모주 청약 캘린더</b>에서 공모가·주관사 등 자세한 조건을 확인할 수 있습니다.</div>`;
  }
  if(e.cat==='earn')return `<div class="cd-desc">미국 기업 실적 발표${e.ticker?` (<b>${String(e.ticker)}</b>)`:''}입니다. 대부분 미국 장 마감 뒤(한국시간 새벽) 공개되며, 결과에 따라 다음 날 국내 관련주가 함께 움직이는 경우가 많습니다.</div>`;
  return `<div class="cd-desc">${e.sub||'주요 시장 일정입니다.'}</div>`;
}
if($('calPrev'))$('calPrev').onclick=()=>{const b=calMonth||new Date();calMonth=new Date(b.getFullYear(),b.getMonth()-1,1);calDetailOpen=null;calShowAll=false;renderCalendar();};
if($('calNext'))$('calNext').onclick=()=>{const b=calMonth||new Date();calMonth=new Date(b.getFullYear(),b.getMonth()+1,1);calDetailOpen=null;calShowAll=false;renderCalendar();};
if($('calToday'))$('calToday').onclick=()=>{const t=new Date();t.setHours(0,0,0,0);calMonth=new Date(t.getFullYear(),t.getMonth(),1);calSel=t;calDetailOpen=null;calShowAll=false;renderCalendar();};

/* ===== 주식 매매일지 ===== */
let jTab='today',jDays=0,jMonths=1,jCost=true;
const jSegOpts={today:[[0,'오늘'],[1,'1일전'],[2,'2일전']],date:[[1,'1개월'],[2,'2개월'],[3,'3개월']],stock:[[1,'1개월'],[2,'2개월'],[3,'3개월']]};
function jrFiltered(){
  /* [v4.5] 조회 기준을 KST 로 맞춘다. 예전엔 기록은 UTC, 조회는 기기 로컬이라
     한국시간 새벽(00:00~09:00) 매매가 '오늘'에서 통째로 빠졌다. */
  if(jTab==='today'){const iso=kstDayAgo(jDays);
    return{rows:tradeLog.filter(t=>t.date===iso),iso};}
  const f=new Date(Date.now()+9*3600e3); f.setUTCMonth(f.getUTCMonth()-jMonths);
  const fromIso=f.toISOString().slice(0,10);
  return{rows:tradeLog.filter(t=>t&&t.date&&t.date>=fromIso),iso:null};
}
function jrAgg(list,keyFn){
  const m={};
  list.forEach(t=>{const k=keyFn(t);const g=m[k]||(m[k]={key:k,name:t.name,code:t.code,date:t.date,buyAmt:0,sellAmt:0,buyQty:0,sellQty:0,buyBase:0,pnl:0,fee:0,tax:0,costBasis:0});
    if(t.side==='buy'){g.buyAmt+=t.amount;g.buyQty+=t.qty;g.buyBase+=t.price*t.qty;}
    else{g.sellAmt+=t.amount;g.sellQty+=t.qty;g.pnl+=t.pnl;g.costBasis+=t.avg*t.qty;}
    g.fee+=t.fee;g.tax+=t.tax;});
  return Object.values(m);
}
const jPnl=(g)=>jCost?g.pnl:g.pnl+g.fee+g.tax;
const jRoi=(g)=>{const p=jPnl(g);return g.costBasis?p/g.costBasis*100:0;};
function renderJournal(){
  if(!$('jrSeg'))return;
  $('jrSeg').innerHTML=jSegOpts[jTab].map(([v,l])=>{const on=(jTab==='today'?jDays:jMonths)===v;return `<button class="${on?'on':''}" data-jv="${v}">${l}</button>`;}).join('');
  $('jrSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{const v=+b.dataset.jv;if(jTab==='today')jDays=v;else jMonths=v;renderJournal();});
  $('jrCost').classList.toggle('on',jCost);
  const {rows}=jrFiltered();
  const byDate=jTab==='date';
  const groups=jrAgg(rows,t=>byDate?t.date:t.code).sort((a,b)=>byDate?(a.date<b.date?1:-1):(b.sellAmt+b.buyAmt)-(a.sellAmt+a.buyAmt));
  const buyTot=groups.reduce((s,g)=>s+g.buyAmt,0),sellTot=groups.reduce((s,g)=>s+g.sellAmt,0);
  const pnlTot=groups.reduce((s,g)=>s+jPnl(g),0),basisTot=groups.reduce((s,g)=>s+g.costBasis,0),costTot=groups.reduce((s,g)=>s+g.fee+g.tax,0);
  const roiTot=basisTot?pnlTot/basisTot*100:0;
  const cell=(k,v,dir)=>`<div class="jr-sk">${k}</div><div class="jr-sv ${dir||''}">${v}</div>`;
  if(jTab==='today'){
    const settle=sellTot-buyTot;
    $('jrSummary').innerHTML=`<div class="jr-srow">${cell('금일정산금액',KRW(settle),dirOf(settle))}${cell('총손익금액',signed(pnlTot),dirOf(pnlTot))}</div>
      <div class="jr-srow">${cell('총매매비용',KRW(costTot))}${cell('총수익률',pctS(roiTot),dirOf(pnlTot))}</div>`;
  }else{
    $('jrSummary').innerHTML=`<div class="jr-srow">${cell('기간매수금액',KRW(buyTot))}${cell('총손익금액',signed(pnlTot),dirOf(pnlTot))}</div>
      <div class="jr-srow">${cell('기간매도금액',KRW(sellTot))}${cell('총수익률',pctS(roiTot),dirOf(pnlTot))}</div>`;
  }
  $('jrColhead').innerHTML=`<div class="jr-c1">${byDate?'일자':'종목명'}</div>
    <div class="jr-c2"><span class="up">매수금액</span><span class="down">매도금액</span></div>
    <div class="jr-c3"><span>손익금액</span><span>수익률</span></div>
    <div class="jr-c4">매매비용</div>`;
  if(!groups.length){$('jrRows').innerHTML='<div class="jr-empty">📁<br>조회 내역이 없습니다.</div>';return;}
  $('jrRows').innerHTML=groups.map((g,i)=>{const p=jPnl(g),dir=dirOf(p),roi=jRoi(g);
    const c1=byDate?g.date.replace(/-/g,'/'):g.name;
    return `<div class="jr-row" data-ji="${i}">
      <div class="jr-c1">${c1}</div>
      <div class="jr-c2"><span>${KRW(g.buyAmt)}</span><span>${KRW(g.sellAmt)}</span></div>
      <div class="jr-c3"><span class="${dir}">${g.sellQty?signed(p):'0'}</span><span class="${dir}">${g.sellQty?pctS(roi):'0.00%'}</span></div>
      <div class="jr-c4">${KRW(g.fee+g.tax)}</div></div>`;}).join('');
  $('jrRows').querySelectorAll('.jr-row').forEach(r=>r.onclick=()=>openJournalDetail(groups[+r.dataset.ji],byDate,rows));
}
function jKV(k,v,dir){return `<div class="jd-kv"><span>${k}</span><b class="${dir||''}">${v}</b></div>`;}
function openJournalDetail(g,byDate,rows){
  let body;
  if(byDate){
    const stocks=jrAgg(rows.filter(t=>t.date===g.date),t=>t.code).sort((a,b)=>(b.sellAmt+b.buyAmt)-(a.sellAmt+a.buyAmt));
    body=`<div class="jd-sub">${g.date.replace(/-/g,'.')} · 매매비용 포함</div>
      <div class="jd-daterows">${stocks.map(s=>{const p=jPnl(s),dir=dirOf(p);
        return `<div class="jd-drow"><div class="jd-dnm">${s.name}</div>
          <div class="jd-damt"><span class="up">${KRW(s.buyAmt)}</span><span class="down">${KRW(s.sellAmt)}</span></div>
          <div class="jd-dpnl"><span class="${dir}">${s.sellQty?signed(p):'0'}</span><span class="${dir}">${s.sellQty?pctS(jRoi(s)):'0.00%'}</span></div>
          <div class="jd-dcost">${KRW(s.fee+s.tax)}</div></div>`;}).join('')}</div>`;
  }else{
    const buyAvg=g.buyQty?Math.round(g.buyBase/g.buyQty):0,sellAvg=g.sellQty?Math.round(g.sellAmt/g.sellQty):0;
    const p=jPnl(g),dir=dirOf(p);
    body=`<div class="jd-sub">${g.name} · 매매비용 포함</div>
      <div class="jd-side"><div class="jd-side-t up">매수</div>
        ${jKV('수량',KRW(g.buyQty)+'주')}${jKV('평균단가',KRW(buyAvg)+'원')}${jKV('매수금액',KRW(g.buyAmt)+'원','up')}</div>
      <div class="jd-side"><div class="jd-side-t down">매도</div>
        ${jKV('수량',KRW(g.sellQty)+'주')}${jKV('매도단가',KRW(sellAvg)+'원')}${jKV('매도금액',KRW(g.sellAmt)+'원','down')}</div>
      <div class="jd-side"><div class="jd-side-t">정산</div>
        ${jKV('수수료',KRW(g.fee)+'원')}${jKV('세금',KRW(g.tax)+'원')}${jKV('매매비용',KRW(g.fee+g.tax)+'원')}
        ${jKV('손익금액',(g.sellQty?signed(p):'0')+'원',dir)}${jKV('수익률',g.sellQty?pctS(jRoi(g)):'0.00%',dir)}</div>`;
  }
  $('jCard').innerHTML=`<div class="jd-head"><div class="jd-title">상세보기</div><button class="jd-x" id="jClose">✕</button></div>
    <div class="jd-body">${body}</div><button class="jd-ok" id="jOk">확인</button>`;
  $('jGate').hidden=false;
  $('jClose').onclick=$('jOk').onclick=()=>{$('jGate').hidden=true;};
}
document.querySelectorAll('.jr-tabs button').forEach(b=>b.onclick=()=>{jTab=b.dataset.jtab;document.querySelectorAll('.jr-tabs button').forEach(x=>x.classList.toggle('on',x===b));renderJournal();});
$('jrCost').onclick=()=>{jCost=!jCost;renderJournal();};
$('jGate').addEventListener('click',e=>{if(e.target===$('jGate'))$('jGate').hidden=true;});

/* 검색 */
let searchToken=0,searchTimer=null,searchRankTab='조회수';const remoteCache={};
let searchMkt='kr';   // [v4.38] 순위 시장 선택 (kr | us)
const rankCache={},rankError={},rankType={'조회수':'search','상승률':'rise','하락률':'fall'};
let nxtBatchTimer=null,nxtBatchQ=new Set();
async function primeQuotes(codes){
  const uniq=[...new Set(codes.filter(Boolean))];
  /* [수정] NXT 시간대 배지·가격 누락의 근본 원인 — NXT 보완 프라임(primeNxtQuotes)이
     순위·테마 경로에만 연결돼 있어, 텍스트 검색 결과(케이씨텍·케이아이엔엑스 등)와
     캘린더 칩·비교표처럼 primeQuotes 만 타는 화면은 NXT 체결가를 영영 못 받았다.
     이제 범용 프라임이 KRX 조회와 무관하게 NXT 보완도 항상 함께 시도한다(창구 단일화). */
  try{primeNxtQuotes(uniq);}catch(e){}
  const now=Date.now();
  const need=uniq.filter(c=>{const st=byCode[c];if(!st)return false;
    if(st.price==null){
      /* [v3.6 · 치명] 조회했는데 응답에 실리지 않는 종목(거래정지·상장폐지 예정 등)을
         화면을 그릴 때마다 다시 요청했다. 검색 화면은 시세가 올 때마다 재렌더되므로
         '재렌더 → 재요청 → 응답 도착 → 재렌더 → …' 고리가 닫혀 요청이 폭주했다.
         응답에 빠진 횟수만큼 재시도 간격을 1분씩 늘린다(최대 6분). */
      const miss=st._pxMiss||0;
      if(miss&&now-(st._pxTry||0)<Math.min(miss,6)*60e3)return false;
      st._pxTry=now;return true;
    }
    /* [v3.4] 예전엔 '가격이 비어 있을 때'만 받아 왔다. 한 번 값이 차면 다시는 조회하지 않아,
       실시간 구독에 없는 화면(순위·테마·비교·캘린더)은 첫 값에서 그대로 굳었다.
       장중에는 오래된 값(20초 초과)을 다시 받는다. */
    /* [v3.9] 정규장·동시호가는 20초, 시간외 단일가는 10분 단위 체결이라 60초 */
    {const _k=krSession();
     if(_k.krx.open&&now-(st._px_at||0)>20e3)return true;
     if(_k.krx.tradable&&!_k.krx.open&&now-(st._px_at||0)>60e3)return true;}
    /* [v1.99.2] 장외 시간: NXT 종목인데 통합가 소스(uniPx/nxtPx)가 없으면 — 순위 폴백처럼
       가격만 미리 채워진 경로 — 배치 재조회로 통합가를 받아 온다(10분 간 1회만). */
    if(!krxRegularOpen()&&nxtCapability(c)!==false&&!st.uniPx&&!st.nxtPx&&!nxtPx[c]
       &&now-(st._uniTry||0)>10*60e3){st._uniTry=now;return true;}
    return false;});
  if(!need.length)return;
  // [수정] 45개에서 잘라 버리던 것을 40개씩 나눠 전부 조회
  const parts=[];for(let i=0;i<need.length&&i<200;i+=40)parts.push(need.slice(i,i+40));
  fnBump(parts.length);
  const res=await Promise.all(parts.map(cs=>
    fetch('/api/quote?codes='+cs.join(','),{cache:'no-store'}).then(r=>r.json()).catch(()=>null)));
  res.forEach(j=>((j&&j.quotes)||[]).forEach(q=>applyQuote(q,true)));
  const got=new Set(); res.forEach(j=>((j&&j.quotes)||[]).forEach(q=>{if(q&&q.code)got.add(q.code);}));
  need.forEach(c=>{const st=byCode[c];if(!st)return; if(got.has(c))st._pxMiss=0; else st._pxMiss=(st._pxMiss||0)+1;});
}
// [수정] 실패 시 빈 배열이 캐시에 남아(빈 배열도 truthy) 해당 탭이 세션 내내 비어 보이던 버그 수정
async function loadRank(tab){
  if(rankCache[tab]&&rankCache[tab].length)return rankCache[tab];
  try{const r=await fetch('/api/popular?type='+rankType[tab]   /* [v4.3] t=Date.now() 제거 — 매 요청이 서로 다른 주소가 돼 CDN 이 절대 캐시하지 못했다 */,{cache:'no-store'});const j=await r.json();
    const items=(j&&j.items)||[];
    /* [추가] 폴백 경로(JSON)는 시세·등락률까지 함께 준다. 받은 즉시 반영해
       '순위는 떴는데 값이 비어 보이는' 구간을 없앤다. */
    items.forEach(it=>{ if(it&&it.code&&it.price){
      const st=ensureStock(it.code,it.name||'','');
      if(st&&st.price==null){ st.price=it.price;
        if(it.rate!=null&&it.rate!==0)st.prevClose=Math.round(it.price/(1+it.rate/100));
        else if(st.prevClose==null)st.prevClose=it.price; }
    }});
    if(items.length){rankCache[tab]=items;rankError[tab]=false;}
    else{rankError[tab]=true;}
  }catch{rankError[tab]=true;}
  return rankCache[tab]||[];
}
/* 명단 하나로 전 종목이 결정되므로, 코드 목록을 받아도 할 일은
   "명단이 아직 없으면 한 번 불러오기" 뿐이다. (기존 배치 API 호출 제거) */
function ensureNxtBatch(codes){
  if(NXTLIST.ready){
    (codes||[]).forEach(c=>{ if(byCode[c])byCode[c].nxt=NXTLIST.set.has(c); });
    return;
  }
  loadNxtList(false);
}
// 소속 시장 배지(코스피/코스닥/코넥스) — 확인된 경우에만 표시
function mktTag(code,market){
  const s=byCode[code];
  // ETF·ETN은 유가증권시장 상장이라 거래소 값이 '코스피'로 오지만,
  // 개별 주식과 혼동되므로 상품 종류 배지로 대체한다.
  if(isFundLike(code)){
    const k=(s&&/ETN/i.test(s.kind||''))?'ETN':'ETF';
    return `<span class="mkt-tag etf">${k}</span>`;
  }
  const mk=market||(s&&s.market)||mktCache[String(code).toUpperCase()]||'';
  if(!mk)return '';
  const cls=mk==='코스닥'?'kq':mk==='코넥스'?'kx':'kp';
  return `<span class="mkt-tag ${cls}">${mk}</span>`;
}
/* ══ [v2.0] 시장 세션 배지 — 사용자 확정 규칙 ══
   · 주말/휴장일(KR_HOLIDAYS): 노랑 '휴장'
   · KRX 전용(거래 08:30~18:00): 00:00~08:30 '장 전' / 08:30~18:00 청록 'KRX' / 18:00~ '장 종료'
   · NXT 종목(거래 08:00~20:00): 00:00~08:00 '장 전' / 08~09·15:30~20 핑크 'NXT' /
       09~15:30 남색 '통합' / 20:00~ '장 종료'
   가격 값은 기존 dispQuote(통합가 사슬)가 계속 담당하고, 배지는 시계+명단만으로 결정되므로
   시세 수신 여부와 무관하게 모든 종목에서 즉시·동일하게 뜬다(클릭 의존성 원천 제거). */
function kstNow(){return new Date(Date.now()+9*3600e3);}
function isKrHolidayTodayKST(){
  const k=kstNow();
  const iso=`${k.getUTCFullYear()}-${String(k.getUTCMonth()+1).padStart(2,'0')}-${String(k.getUTCDate()).padStart(2,'0')}`;
  return !!(typeof KR_HOLIDAYS!=='undefined'&&KR_HOLIDAYS[iso]);
}
function marketSessionKST(){
  const k=kstNow(),w=k.getUTCDay(),hm=k.getUTCHours()*60+k.getUTCMinutes();
  if(w===0||w===6||isKrHolidayTodayKST())return 'holiday';
  if(hm<480)return 'pre';
  if(hm>=1200)return 'post';
  return 'day';
}
function nxtLiveBandKST(){
  const k=kstNow(),hm=k.getUTCHours()*60+k.getUTCMinutes();
  return (hm>=480&&hm<540)||(hm>=930&&hm<1200);
}
function mktBadgeInfo(code){
  if(marketSessionKST()==='holiday')return ['휴장','hol'];
  const hm=(()=>{const k=kstNow();return k.getUTCHours()*60+k.getUTCMinutes();})();
  if(nxtCapability(code)===false){
    /* [v2.0.1] KRX 전용 — KRX 실제 거래 시간표 기준(사용자 첨부 표):
       장전 시간외 종가 08:30 시작 ~ 시간외 단일가 18:00 종료 */
    if(hm<510)return ['장 전','prem'];       // 00:00~08:30
    if(hm>=1080)return ['장 종료','post'];   // 18:00~24:00
    return ['KRX','krx'];                    // 08:30~18:00
  }
  /* NXT 종목 — NXT 시간표(프리 08:00 ~ 애프터 20:00) */
  if(hm<480)return ['장 전','prem'];
  if(hm>=1200)return ['장 종료','post'];
  return nxtLiveBandKST()?['NXT','nxt']:['통합','uni'];
}
function mktBadgeHtml(code){const b=mktBadgeInfo(code);return `<span class="px-src ${b[1]}">${b[0]}</span>`;}
/* [구버전 호환] 시세 출처 배지 — 항상 KRX/NXT/통합 중 하나를 반환한다.
   기존엔 'NXT 취급 종목인데 NXT 체결가가 아직 안 붙은' 경우(케이씨처럼) src가 'KRX'로 떨어지며
   배지가 통째로 사라졌다. 어떤 src 값이 와도(undefined 포함) 빈 문자열이 나올 수 없다. */
function srcBadgeHtml(src){
  if(src==='NXT')return '<span class="px-src nxt">NXT</span>';
  if(src==='통합')return '<span class="px-src uni">통합</span>';
  return '<span class="px-src krx">KRX</span>';   // 'KRX'·'KRXONLY'·미판정 전부 KRX로 명시
}
function stockRow(code,name,market,tag,rank){
  const s=byCode[code];
  // [수정] 프리마켓에는 NXT 취급 종목의 NXT 체결가를 보여 준다(KRX 전용은 그대로 0.00%).
  const q=dispQuote(code);
  const price=q?q.price:(s?s.price:null), prev=q?q.prevClose:(s?s.prevClose:null);
  const diff=(price!=null&&prev)?price-prev:null,p=diff!=null?diff/prev*100:null,dir=diff==null?'flat':dirOf(diff);
  const cap=nxtCapability(code);
  // NXT 가능 종목에만 배지를 붙인다. 그 외(KRX 전용·확인 중)는 배지 없음.
  const badge=cap===true?(NXTLIST.halted.has(code)
      ?'<span class="nxt-badge sm halt" title="NXT 매매체결대상이지만 현재 매매거래정지 상태">NXT 정지</span>'
      :(nxtSuspendInfo(selected)
        ?'<span class="nxt-badge sm sus" title="시장경보·거래정지 지정으로 NXT 매매가 일시 중단된 종목 · 해제 시 자동 복귀">NXT 일시제외</span>'
        :'<span class="nxt-badge sm" title="넥스트레이드 매매체결대상종목 · 08:00~20:00 거래">NXT</span>'))
    :'';
  const srcTag=mktBadgeHtml(code);   // [v2.0] 세션 배지 — 시계+명단 기반, 시세 수신과 무관
  const rk=rank?`<span class="rk${rank<=3?' top':''}">${rank}</span>`:'';
  const mk=market||(s&&s.market)||'';
  return `<div class="sr" data-code="${code}" data-name="${String(name||'').replace(/"/g,'')}" data-market="${mk}">
    <div class="sr-l">${rk}${stockLogo(code,name||(s&&s.name)||code)}<div class="sr-t"><div class="nm">${name||code}${mktTag(code,mk)}${tag?`<span class="tag">${tag}</span>`:''}${badge}</div><div class="cd num">${code}${mk?' · '+mk:''}</div></div></div>
    <div class="px num ${dir}">${srcTag}${price!=null?KRW(price):'—'}</div><div class="ch num ${dir}">${diff==null?'':arrow(dir)+' '+pctS(p)}</div></div>`;
}

/* ===== 전 종목 목록(코스피·코스닥) =====
   종목검색이 내장 66종 + 자동완성 10건에 갇혀 '삼성' 검색 시 관련 종목이 대거 누락됐다.
   전 종목을 페이지 단위로 받아 브라우저에 캐시(24시간)하고 검색에 합친다. */
let stockAll=null,stockLoading=false;
/* [v2.9.7] 목록 캐시 수명을 시간대에 맞춘다.
   예전엔 무조건 24시간이라, 서버 캐시 24시간과 겹치면 신규 상장 종목이
   최대 이틀 동안 검색에 안 나왔다. 장이 도는 시간대에는 짧게 잡는다. */
function stockCacheTtl(){
  const d=new Date(), h=d.getHours(), wd=d.getDay();
  if(wd===0||wd===6)return 12*3600e3;        // 주말 — 신규 상장이 없다
  if(h>=7&&h<=20)return 2*3600e3;            // 평일 장 전후
  return 8*3600e3;                           // 평일 심야
}
function loadStockCache(){
  try{const raw=JSON.parse(localStorage.getItem('stockAll')||'null');
    if(raw&&raw.at&&(Date.now()-raw.at)<stockCacheTtl()&&Array.isArray(raw.items)&&raw.items.length){stockAll=raw.items;return true;}
  }catch(e){}
  return false;
}
/* [v2.9.7] 신규 상장 감지 — 직전 목록에 없던 코드를 찾아 기록하고 알린다. */
function noteNewListings(prev,cur){
  if(!prev||prev.size<100)return;             // 첫 수집이면 전부 신규가 되므로 건너뛴다
  const add=(cur||[]).filter(x=>x&&x.code&&!prev.has(x.code));
  if(!add.length)return;
  let log=[]; try{log=JSON.parse(localStorage.getItem('newListings')||'[]')||[];}catch(e){}
  const seen=new Set(log.map(x=>x.code));
  const fresh=add.filter(x=>!seen.has(x.code)).map(x=>({code:x.code,name:x.name||'',market:x.market||'',at:Date.now()}));
  if(!fresh.length)return;
  log=fresh.concat(log).slice(0,80);
  try{localStorage.setItem('newListings',JSON.stringify(log));}catch(e){}
  try{toast('buy',`신규 상장 ${fresh.length}종 반영`,fresh.slice(0,3).map(x=>x.name||x.code).join(', ')+(fresh.length>3?` 외 ${fresh.length-3}종`:''));}catch(e){}
}
/* [v2.9.7] 앱을 켠 뒤 캐시 수명의 절반이 지났으면 뒤에서 조용히 새 목록을 받아 둔다.
   받는 동안 stockAll 은 옛 값을 그대로 유지하다가 끝날 때 한 번에 교체되므로
   검색 중이어도 화면이 비지 않는다. 신규 상장이 있으면 그때 알림이 뜬다. */
let _bgRefreshed=false;
function refreshStockListSoon(){
  if(_bgRefreshed)return; _bgRefreshed=true;
  setTimeout(async()=>{
    try{
      const raw=JSON.parse(localStorage.getItem('stockAll')||'null');
      if(!raw||!raw.at)return;
      if(Date.now()-raw.at<stockCacheTtl()/2)return;
      await loadStockAll(null,true);
      if(currentView==='search')safeRun('bgSearch',()=>renderSearch());
    }catch(e){}
  },9000);
}
function recentListings(days){
  let log=[]; try{log=JSON.parse(localStorage.getItem('newListings')||'[]')||[];}catch(e){}
  const cut=Date.now()-(days||14)*86400e3;
  return log.filter(x=>x&&x.at>cut);
}
function saveStockCache(){try{localStorage.setItem('stockAll',JSON.stringify({at:Date.now(),items:stockAll}));}catch(e){}}
/* [v2.9.5] 예전엔 다른 곳에서 로딩이 진행 중이면 곧바로 null 을 돌려줬다.
   그래서 로고 검사가 목록을 못 받고 화면에 떠 있던 109종만 검사했다.
   이제 진행 중이면 같은 약속(Promise)을 돌려줘 호출한 쪽이 끝까지 기다린다. */
let stockAllP=null;
async function loadStockAll(onProgress,force){
  if(stockAll&&!force)return stockAll;
  if(stockAllP)return stockAllP;
  stockAllP=_loadStockAll(onProgress,force);
  try{ return await stockAllP; } finally { stockAllP=null; }
}
async function _loadStockAll(onProgress,force){
  if(stockAll&&!force)return stockAll;
  if(!force&&loadStockCache())return stockAll;
  /* 새로 받기 전에 직전 목록을 기억해 둔다 — 신규 상장 비교 기준 */
  let prevCodes=null;
  try{const raw=JSON.parse(localStorage.getItem('stockAll')||'null');
    if(raw&&Array.isArray(raw.items)&&raw.items.length)prevCodes=new Set(raw.items.map(x=>x.code));}catch(e){}
  stockLoading=true;
  const acc=new Map();
  for(const mk of ['KOSPI','KOSDAQ','KONEX']){
    for(let page=1;page<=60;page++){
      let j=null;
      try{fnBump();const r=await fetch(`/api/stocklist?market=${mk}&page=${page}`,{cache:'default'});j=await r.json();}catch(e){}
      if(!j||!j.ok||!j.n)break;
      (j.items||[]).forEach(x=>{if(!acc.has(x.code))acc.set(x.code,x);});
      if(onProgress)onProgress(acc.size,mk,page);
      /* [v2.9.6] 예전엔 'n<40이면 마지막'으로 봤다. 그런데 쪽 크기는 100(모바일)
         또는 50(HTML 대체)이라 기준 자체가 틀렸고, 중간 쪽이 일시적으로 적게 오면
         남은 종목을 전부 버렸다. 빈 응답이 올 때까지만 진행한다. */
      if(!j.n)break;
      await new Promise(r=>setTimeout(r,60));
    }
  }
  stockAll=[...acc.values()];
  stockLoading=false;
  if(stockAll.length){ saveStockCache(); noteNewListings(prevCodes,stockAll); }
  fillNamesFromAll();                       // 이미 화면에 있는 코드들의 이름·시장 채우기
  return stockAll;
}
function fillNamesFromAll(){
  if(!stockAll||!stockAll.length)return;
  const m=new Map(stockAll.map(x=>[x.code,x]));
  let changed=false;
  Object.values(byCode).forEach(s=>{const a=m.get(s.code);if(!a)return;
    if((!s.name||s.name===s.code)&&a.name){s.name=a.name;changed=true;}
    if(!s.market&&a.market)s.market=a.market;});
  if(changed)scheduleNamePaint();
}

/* ===== 최근 검색 기록 ===== */
let srchHist=[];   // 계정별 값은 reloadPerUser()에서 로드
/* [D3] 최근 본 종목 — 검색 기록과 별개로, 상세를 연 종목을 최신순으로 보관 */
let viewHist=[];   // 계정별 값은 reloadPerUser()에서 로드
function saveViewHist(){pset('viewHist',viewHist.slice(0,12));}
function renderViewHist(){
  const el=$('viewHist'); if(!el)return;
  if(!viewHist.length){el.hidden=true;return;}
  el.hidden=false;
  el.innerHTML=`<div class="sh-head"><span>최근 본 종목</span><button id="vhClear">전체 삭제</button></div>
    <div class="sh-chips">${viewHist.map((h,i)=>{
      const us=h.us||!!usMeta[h.code];
      /* 한 목록에 국내·해외가 섞이므로 어느 시장인지 한눈에 보이게 국기를 붙인다 */
      const logo=us?(typeof usTick==='function'?usTick(h.code):''):stockLogo(h.code,h.name,'xs');
      return `<span class="sh-chip${us?' us':''}" data-i="${i}">${logo}<b>${h.name}</b>${us?'<i class="sh-fl">🇺🇸</i>':''}<i class="sh-x" data-x="${i}">✕</i></span>`;
    }).join('')}</div>`;
  el.querySelectorAll('.sh-chip').forEach(c=>c.onclick=(e)=>{
    if(e.target.classList.contains('sh-x'))return;
    const h=viewHist[+c.dataset.i]; if(!h)return;
    if(h.us||usMeta[h.code]){ openUS(h.code); return; }        // [v4.56] 해외는 해외 화면으로
    ensureStock(h.code,h.name,h.market); openTrade(h.code);
  });
  el.querySelectorAll('.sh-x').forEach(x=>x.onclick=(e)=>{e.stopPropagation();viewHist.splice(+x.dataset.x,1);saveViewHist();renderViewHist();});
  const cl=$('vhClear'); if(cl)cl.onclick=()=>{viewHist=[];saveViewHist();renderViewHist();};
}
function saveHist(){pset('srchHist',srchHist.slice(0,20));}
function addHist(code,name,market){
  if(!code)return;
  srchHist=srchHist.filter(x=>x.code!==code);
  srchHist.unshift({code,name:name||code,market:market||'',t:Date.now()});
  srchHist=srchHist.slice(0,20);saveHist();renderHist();
}
/* [추가] 쿠팡식 '검색어' 기록 — Enter 로 검색한 키워드도 칩으로 남긴다(종목 칩과 최신순 통합) */
function addHistQ(q){
  q=String(q||'').trim(); if(q.length<2)return;
  srchHist=srchHist.filter(x=>x.q!==q);
  srchHist.unshift({q,t:Date.now()});
  srchHist=srchHist.slice(0,20);saveHist();
}
function removeHist(code){srchHist=srchHist.filter(x=>x.code!==code);saveHist();renderHist();}
function clearHist(){srchHist=[];saveHist();renderHist();}
function renderHist(){
  const el=$('srchHist');if(!el)return;
  const typing=(($('searchInput')||{}).value||'').trim();
  if(typing||!srchHist.length){el.hidden=true;return;}
  el.hidden=false;
  el.innerHTML=`<div class="sh-head"><span>최근 검색</span><button id="shClear">전체 삭제</button></div>
    <div class="sh-chips">${srchHist.map((h,i)=>h.q
      ?`<span class="sh-chip q" data-i="${i}"><i class="sh-ic">🔍</i><b>${h.q}</b><i class="sh-x" data-x="${i}">✕</i></span>`
      :`<span class="sh-chip" data-i="${i}">${stockLogo(h.code,h.name,'xs')}<b>${h.name}</b><i class="sh-x" data-x="${i}">✕</i></span>`).join('')}</div>`;
  el.querySelectorAll('.sh-chip').forEach(c=>c.onclick=(e)=>{
    if(e.target.classList.contains('sh-x'))return;
    const h=srchHist[+c.dataset.i]; if(!h)return;
    if(h.q){const inp=$('searchInput');if(inp)inp.value=h.q;renderSearch();renderHist();}
    else{ensureStock(h.code,h.name,h.market);openTrade(h.code);}
  });
  el.querySelectorAll('.sh-x').forEach(x=>x.onclick=(e)=>{e.stopPropagation();
    srchHist.splice(+x.dataset.x,1);saveHist();renderHist();});
  const cb=$('shClear');if(cb)cb.onclick=()=>{srchHist=[];saveHist();renderHist();};
}
let srchPage=1;
const SRCH_PER=30;
/* [수정] rankSection()이 호출만 되고 정의되어 있지 않아 ReferenceError가 발생 →
   종목검색 화면의 결과 영역이 통째로 비어 있었다. 순위 목록 렌더러를 구현한다. */
let _rankBusy={};
/* [수정] 이 스크립트는 <script type="module"> 이라 최상위 함수가 window 에 붙지 않는다.
   그래서 inline onclick="rankRetry(...)" 는 항상 ReferenceError 였다(2·3번 사진의 그 오류).
   → 인라인 핸들러를 없애고 addEventListener 로 연결한다. */
function rankRetry(tab){rankCache[tab]=null;rankError[tab]=false;_rankBusy[tab]=false;
  $('searchResults').innerHTML=rankSection();bindStockClicks($('searchResults'));bindRankRetry();}
function bindRankRetry(){
  const b=$('rankRetryBtn');
  if(b)b.addEventListener('click',(e)=>{e.stopPropagation();rankRetry(b.dataset.tab||searchRankTab);});
  const u=$('usRankRetry'); /* [v4.48] 해외 순위 다시 시도 */
  if(u)u.addEventListener('click',(e)=>{e.stopPropagation();_usQFail=0;
    usPop=null; usPopAt=0; _usPopTry=0;          // [v4.58] 인기 목록도 새로 받는다
    $('searchResults').innerHTML=rankSection(); bindStockClicks($('searchResults')); bindRankRetry();});
  const pd=$('usPopDiag');                       // [v4.59] 어느 사이트에서 왔는지 직접 확인
  if(pd)pd.addEventListener('click',(e)=>{e.stopPropagation();openUsPopDiag();});
}
/* ══ [v4.38] 해외 순위 — 국내와 같은 세 가지 기준으로 정렬한다 ═══════════════
   조회수는 미국 종목에 공개 지표가 없어, 거래대금(가격×거래량)으로 대신한다.
   실제 증권사도 해외는 '거래대금 상위'를 인기 지표로 쓴다. */
/* ══ [v4.58] 해외 순위 — '조회수'는 진짜 조회수로 ═══════════════════════════
   예전에는 조회수 탭이 거래대금 순서였다. 상단에 그렇게 밝히긴 했지만, 탭 이름과
   내용이 다른 건 결국 사용자를 속이는 일이다. 이제 서버가 세는 실제 조회수를 쓴다.
   목록도 유니버스 113종 안에서만 뽑지 않고, 서버가 준 인기 종목 중 모르는 티커는
   즉석에서 등록해(usRegister) 시세까지 받아 온다 → 진짜 TOP 100 이 된다. */
var usPop=null, usPopAt=0, usPopBusy=false, usPopBasis=null;
/* [v4.59] 조회수 원천 진단 — 어느 사이트가 응답하는지 화면에서 바로 본다 */
async function openUsPopDiag(){
  openLiteGate('조회수 원천 확인','<div class="usdg"><div class="usdg-wait">각 사이트를 직접 두드리는 중… 최대 30초</div></div>');
  let j=null,err='';
  try{ const r=await fetch('/api/uspopdiag',{cache:'no-store'}); j=await r.json(); }
  catch(e){ err=String(e).slice(0,80); }
  const body=$('liteBody'); if(!body)return;
  if(!j){ body.innerHTML=`<div class="usdg"><div class="usdg-bad">진단 서버에 연결하지 못했습니다<br><small>${htmlEsc(err)}</small></div></div>`; return; }
  const rows=(j.tried||[]).map(t=>{
    const ok=(t.parsed||0)>0;
    return `<div class="usdg-r ${ok?'ok':'no'}">
      <span class="usdg-b">${ok?'정상':'실패'}</span>
      <span class="usdg-n">${htmlEsc(t.label||'')}</span>
      <span class="usdg-s">${htmlEsc(String(t.err?'ERR':(t.status!=null?t.status:'—')))}</span>
      <span class="usdg-l">${ok?t.parsed+'건':''}</span></div>`;}).join('');
  const u=j.usable||[];
  body.innerHTML=`<div class="usdg">
    <div class="usdg-sum ${u.length?'ok':'no'}">${u.length
      ?`조회수를 가져올 수 있는 곳 <b>${u.length}곳</b><br><small>${htmlEsc(u.join(' · '))}</small>`
      :'조회수 원천에 <b>하나도</b> 연결하지 못했습니다.'}</div>
    <div class="usdg-list">${rows||'<div class="usdg-bad">응답이 비었습니다</div>'}</div>
    <div class="usdg-note">검사 시각 ${htmlEsc(String(j.at||'').slice(0,19))}</div>
    <button class="modal-btn" id="usdgCopy">결과 복사</button></div>`;
  const cp=$('usdgCopy');
  if(cp)cp.onclick=()=>{try{navigator.clipboard.writeText(JSON.stringify(j,null,1).slice(0,4000));cp.textContent='복사됨';}catch(e){}};
}
/* [v4.60] 100위를 첫 방문에 채운다 — 서버는 한 번에 38개 문서까지만 조회수를
   받아올 수 있어(요청당 외부 호출 한도) 처음엔 40여 종만 나왔다. 목록이 100에
   못 미치면 화면을 그린 채로 조용히 한 번 더 받아 이어 붙인다(최대 4회). */
var _usPopTry=0;
function usPopLoad(cb){
  if(usPopBusy)return;
  if(usPop&&usPop.length>=100&&Date.now()-usPopAt<180e3){cb&&cb();return;}
  if(usPop&&Date.now()-usPopAt<180e3&&_usPopTry>=4){cb&&cb();return;}
  usPopBusy=true;
  const again=_usPopTry>0;
  fetch('/api/uspopular'+(again?'?fresh=1':''),{cache:'no-store'}).then(r=>r.json()).then(j=>{
    usPopBusy=false; _usPopTry++;
    if(!j||!j.ok||!Array.isArray(j.items))return;
    usPopBasis=j.basis||null;
    /* 내장 목록에 없는 종목은 즉석 등록 — 거래소를 아는 것만 받는다(로이터코드가 필요) */
    const out=[];
    for(const it of j.items){
      const t=String(it.t||'').toUpperCase(); if(!t)continue;
      if(!usMeta[t]){
        if(!it.sfx)continue;                       // 거래소를 모르면 시세를 못 받는다 → 건너뜀
        usRegister({t,sfx:it.sfx,kr:it.kr||it.en||t,en:it.en||t});
      }
      out.push({t,views:it.views||0,wiki:it.wiki||0,origin:it.origin||[]});
      if(out.length>=100)break;
    }
    usPop=out; usPopAt=Date.now();
    cb&&cb();
    /* 아직 100위에 못 미치면 곧바로 한 번 더 — 서버가 다음 묶음을 받아 온다 */
    if(out.length<100&&_usPopTry<4)setTimeout(()=>usPopLoad(cb),400);
  }).catch(()=>{usPopBusy=false;_usPopTry++;});
}
function usRankSection(){
  const tab=searchRankTab;
  const redraw=()=>{ if(currentView==='search'&&searchMkt==='us'&&!((($('searchInput')||{}).value||'').trim())){
    $('searchResults').innerHTML=rankSection(); bindStockClicks($('searchResults')); bindRankRetry(); } };

  /* ── 조회수 탭 ── 서버가 센 실제 조회수 순서 ── */
  if(tab==='조회수'){
    if(!usPop){ usPopLoad(()=>{ usEnsureQuotes((usPop||[]).map(x=>x.t),true).then(redraw); redraw(); });
      return '<div class="empty">해외 인기 종목을 불러오는 중…</div>'; }
    if(!usPop.length)
      return '<div class="empty">아직 조회 기록이 쌓이지 않았습니다<br>'
        +'<small style="color:var(--sub-2)">해외 종목을 몇 개 열어 보면 순위가 만들어집니다</small><br>'
        +'<button class="rank-retry" id="usRankRetry">다시 시도</button></div>';
    const miss=usPop.map(x=>x.t).filter(t=>!(usQ[t]&&usQ[t].price!=null));
    if(miss.length)usEnsureQuotes(usPop.map(x=>x.t),true).then(redraw);
    const b=usPopBasis||{};
    /* 무엇을 근거로 매겼는지 숨기지 않는다 — 어느 사이트의 어떤 수치인지 밝힌다 */
    const parts=[];
    if(b.wiki>0)parts.push(`위키백과 기업 문서 <b>실제 조회수</b> ${b.wiki}종`);
    if(b.yahoo>0)parts.push(`야후 검색 급상승 ${b.yahoo}종`);
    if(b.ext&&b.ext.length)parts.push(b.ext.map(x=>x==='naver-pop'?'네이버 해외 인기':x==='stocktwits'?'Stocktwits 관심 급증':x).join(' · '));
    if(b.app>0)parts.push(`앱 내 조회 ${KRW(b.appTotal||0)}회`);
    const src=parts.length?parts.join(' + '):'원천에 연결하지 못했습니다';
    const ses=usSession();
    const note=`<div class="rank-note us-rank-note">🇺🇸 미국 ${ses.label}${ses.phase==='closed'?' · 다음 개장 '+ses.next:''}
      · 조회수 상위 <b>${usPop.length}종</b><br><small>${src}</small>
      <button class="rank-retry mini" id="usPopDiag">조회수 원천 확인</button></div>`;
    return note+`<div class="us-ranklist">${usPop.map((x,i)=>{
      const t=x.t, m=usMeta[t]||{}, q=usQ[t]||{};
      const vv=x.wiki>0?`<i class="us-vw">조회 ${KRW(x.wiki)}</i>`
        :(x.views>0?`<i class="us-vw">앱 ${KRW(x.views)}</i>`:'');
      return `<div class="us-row" data-us="${t}"><span class="us-rk num">${i+1}</span>${usTick(t)}
        <div class="us-nm"><b>${m.kr||t}${m.etf?' <span class="us-ex">ETF</span>':''}</b><span>${t} · ${m.en||''}${vv}</span></div>
        <div class="us-px">${q.price!=null?'$'+USD2(q.price):'<i class="uz-wait">시세 대기</i>'}<small>${q.price!=null?USDKR(q.price):''}</small></div>
        <div class="us-rt ${usRateCls(q)}">${usRateTxt(q)}</div></div>`;}).join('')}</div>`;
  }

  /* ── 상승률·하락률 탭 ── 시세가 필요하므로 유니버스 기준 ── */
  const pool=US_UNI.map(u=>u[0]).filter(t=>usQ[t]&&usQ[t].price!=null);
  if(!pool.length){
    if(_usQFail>=2)
      return '<div class="empty">해외 시세 서버가 지금 응답하지 않습니다<br><button class="rank-retry" id="usRankRetry">다시 시도</button></div>';
    usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(redraw);
    return '<div class="empty">해외 시세를 불러오는 중…</div>';
  }
  const rate=t=>{const q=usQ[t];return (q.prev)?(q.price-q.prev)/q.prev*100:0;};
  let list=pool.slice().sort((a,b)=>tab==='상승률'?rate(b)-rate(a):rate(a)-rate(b)).slice(0,100);
  const ses=usSession();
  const note=`<div class="rank-note us-rank-note">🇺🇸 미국 ${ses.label}${ses.phase==='closed'?' · 다음 개장 '+ses.next:''}
    · ${tab} 상위 <b>${list.length}종</b> · 유니버스 ${US_UNI.length}종 기준</div>`;
  return note+`<div class="us-ranklist">${list.map((t,i)=>{
    const m=usMeta[t],q=usQ[t];
    return `<div class="us-row" data-us="${t}"><span class="us-rk num">${i+1}</span>${usTick(t)}
      <div class="us-nm"><b>${m.kr}${m.etf?' <span class="us-ex">ETF</span>':''}</b><span>${t} · ${m.en}</span></div>
      <div class="us-px">$${USD2(q.price)}<small>${USDKR(q.price)}</small></div>
      <div class="us-rt ${usRateCls(q)}">${usRateTxt(q)}</div></div>`;}).join('')}</div>`;
}
function rankSection(){
  if(searchMkt==='us')return usRankSection();      // [v4.38] 해외 순위
  const tab=searchRankTab,items=rankCache[tab]||[];
  if(!items.length){
    /* [v2.8 · 치명] 무한 재호출 차단
       기존엔 loadRank 가 빈 결과를 줘도 .then 안에서 rankSection() 을 다시 불렀다.
       그런데 rankSection() 은 목록이 비어 있으면 또 loadRank 를 걸기 때문에
       (_rankBusy 는 바로 앞줄에서 이미 false 로 풀린 상태) 고리가 닫혀 버린다.
       → /api/popular 가 죽거나 빈 응답이면 종목검색 화면이 무한 요청을 쏟아내며
         탭이 멈추고 서버 호출 한도까지 갉아먹었다.
       해결: 실패가 확인된 탭은 자동 재시도하지 않고 '다시 시도' 버튼으로만 재개한다. */
    if(!_rankBusy[tab]&&!rankError[tab]){
      _rankBusy[tab]=true;
      loadRank(tab).then(list=>{
        _rankBusy[tab]=false;
        if(currentView!=='search')return;
        if((($('searchInput')||{}).value||'').trim())return;
        if(!(list&&list.length)){          // 결과 없음 → 여기서 멈춘다(재귀 호출 금지)
          rankError[tab]=true;
          $('searchResults').innerHTML=`<div class="empty">${tab} 순위를 불러오지 못했습니다.<br><button class="etf-more" id="rankRetryBtn" data-tab="${tab}">다시 시도</button></div>`;
          bindRankRetry(); return;
        }
        $('searchResults').innerHTML=rankSection();bindStockClicks($('searchResults'));bindRankRetry();
      }).catch(()=>{_rankBusy[tab]=false;rankError[tab]=true;});
    }
    return rankError[tab]
      ? `<div class="empty">${tab} 순위를 불러오지 못했습니다.<br><button class="etf-more" id="rankRetryBtn" data-tab="${tab}">다시 시도</button></div>`
      : '<div class="empty">순위 불러오는 중…</div>';
  }
  /* [v3.4 · 갱신 누락의 주범] 순위 목록은 ensureStock 만 하고 실시간 구독(feed)에는
     넣지 않았다. 그래서 조회수·상승률·하락률 목록의 시세는 첫 조회 값에서 멈춰 있었고,
     삼성전자처럼 관심종목·보유·선택 종목에 겹치는 것만 갱신되는 것처럼 보였다. */
  items.forEach(x=>{ensureStock(x.code,x.name);feed&&feed.addCode(x.code);});
  ensureNxtBatch(items.map(x=>x.code));
  primeQuotes(items.map(x=>x.code));
  primeNxtQuotes(items.map(x=>x.code));   // 프리마켓 NXT 체결가
  primeQuotes(items.map(x=>x.code));      // [v1.99.2] 장외 통합가 소스(uniPx/nxtPx 스냅샷) 확보
  const nxtNote=nxtOnlyWindow()
    ?`<div class="rank-note nxt">지금은 <b>NXT ${nowTz('Asia/Seoul').hm<540?'프리마켓':'애프터마켓'}</b>입니다.
       <b class="nxt-in">NXT</b> 표시가 붙은 가격은 <b>NXT 실시간 체결가</b>이고,
       <b class="krx-in">KRX</b> 표시는 NXT에서 거래되지 않는 <b>KRX 전용 종목</b>이라 전일 종가(0.00%)로 남습니다.</div>`:'';
  /* [v4.13] 조회수 100위 — 한 소스로는 불가능해 여러 관심도 신호를 합산한다.
     구성을 숨기지 않고 목록 상단에 그대로 밝힌다. */
  const fillN=items.filter(x=>x&&x.fill).length;
  const fillNote=(tab==='조회수'&&fillN)
    ?` · <b>종합 관심도</b> 기준(조회 순위 + 다른 포털 인기검색 + 거래대금·거래량·등락 상위 합산)`:``;
  return nxtNote+`<div class="rank-note">${tab} 상위 <b>${items.length}</b>종목 · 네이버 금융 기준${fillNote}</div>`
    +items.map((x,i)=>stockRow(x.code,x.name,(byCode[x.code]&&byCode[x.code].market)||'','',i+1)).join('');
}
function renderSearch(){
  const q=($('searchInput').value||'').trim();
  const ql=q.toLowerCase().replace(/\s+/g,'');
  /* [v4.38] 시장 탭은 '순위'를 나누는 장치다. 검색어를 넣으면 국내·해외를 함께 보여 주므로 감춘다. */
  {const mt=$('searchMktTabs'); if(mt)mt.hidden=!!q;}
  if(!q){ $('searchResults').innerHTML=rankSection(); bindStockClicks($('searchResults')); bindRankRetry(); return; }
  /* [v4.28] 해외(미국) 매치 — 티커·한글·영문 어느 쪽으로든 걸리면 국내 결과 위에 얹는다 */
  const usHit=usLocalMatch(q).slice(0,6).map(t=>[t]);
  /* [v4.31] 내장에 없으면 원격에서 찾아 화면을 다시 그린다 */
  usSearchRemote(q,(items)=>{ if(items&&items.length&&currentView==='search'
      &&($('searchInput').value||'').trim()===q)renderSearch(); });
  // (1) 내장 종목
  const local=STOCKS.filter(([n,c])=>n.toLowerCase().replace(/\s+/g,'').includes(ql)||c.toLowerCase().includes(ql)||choMatch(n,q))
    .map(([n,c,t])=>({code:c,name:n,market:(byCode[c]&&byCode[c].market)||'',kind:'',tag:t}));
  // (2-0) 전 종목 목록(코스피·코스닥) — 자동완성 10건 한계를 보완
  const allHit=(stockAll||[]).filter(x=>String(x.name||'').toLowerCase().replace(/\s+/g,'').includes(ql)||String(x.code).toLowerCase().includes(ql)||choMatch(x.name||'',q))
    .map(x=>({code:x.code,name:x.name,market:x.market||'',kind:'',tag:''}));
  // (2) ETF 전체 목록(1,146종) — 네이버 자동완성이 10건만 주는 한계를 보완
  const etfHit=(etfList||[]).filter(x=>String(x.name||'').toLowerCase().replace(/\s+/g,'').includes(ql)||String(x.code).toLowerCase().includes(ql))
    .map(x=>({code:x.code,name:x.name,market:'',kind:'ETF',tag:''}));
  // (3) 원격 자동완성(주식 등)
  if(remoteCache[q]===undefined){remoteCache[q]=null;
    fetch('/api/search?q='+encodeURIComponent(q)).then(r=>r.json()).then(j=>{remoteCache[q]=j.items||[];renderSearch();}).catch(()=>{remoteCache[q]=[];});}
  const rem=(remoteCache[q]||[]).map(x=>({code:x.code,name:x.name,market:x.market||'',kind:x.kind||'',tag:''}));
  // 병합(코드 기준 중복 제거)
  const map=new Map();
  [...local,...allHit,...etfHit,...rem].forEach(x=>{if(!map.has(x.code))map.set(x.code,x);
    else{const p=map.get(x.code);if(!p.market&&x.market)p.market=x.market;if(!p.kind&&x.kind)p.kind=x.kind;}});
  // 관련도 정렬: 정확일치 → 시작일치 → 포함
  const sc=(n)=>{const t=String(n||'').toLowerCase().replace(/\s+/g,'');
    if(t===ql)return 0; if(t.startsWith(ql))return 1; return 2;};
  const all=[...map.values()].sort((a,b)=>sc(a.name)-sc(b.name)||String(a.name).localeCompare(String(b.name)));
  const shown=all.slice(0,srchPage*SRCH_PER);
  /* [v3.6] 검색 결과가 '—' 로 한참 떠 있던 문제 — 새 종목은 시세 응답이 올 때까지 빈칸이었다.
     직전 접속에서 저장해 둔 마지막 시세를 먼저 채워 즉시 보여 주고, 실시간 값이 오면 덮어쓴다. */
  shown.forEach(x=>{ensureStock(x.code,x.name,x.market,x.kind);
    const st=byCode[x.code]; if(st&&st.price==null){const sn=pxSnapLoad()[x.code];
      if(sn){st.price=sn.p; if(st.prevClose==null&&sn.pc!=null)st.prevClose=sn.pc; st._snap=Date.now();}}
    feed&&feed.addCode(x.code);});
  {const _q=q; primeQuotes(shown.slice(0,60).map(x=>x.code)).then(()=>{     // [v3.6] 시세 도착 즉시 1회 재렌더
    if(currentView==='search'&&window.__sfq!==_q&&(($('searchInput')||{}).value||'').trim()===_q){window.__sfq=_q;renderSearch();}});}
  const loading=remoteCache[q]===null;
  /* [v2.9.7] 대상 종목 수 옆에 최근 14일 신규 상장 건수를 함께 보여 준다 */
  const _nl=recentListings(14);
  const univNote=stockAll
    ?`전 종목 ${(stockAll.length+((etfList||[]).length)).toLocaleString()}종 대상`
      +(_nl.length?` · <b class="up">신규 상장 ${_nl.length}종</b> 반영됨(${_nl.slice(0,2).map(x=>htmlEsc(x.name||x.code)).join(', ')}${_nl.length>2?' 외':''})`:'')
    :'전 종목 목록 준비 중';
  let html=`<div class="rank-note">검색 결과 <b>${all.length.toLocaleString()}</b>건${loading?' <i>(추가 조회 중…)</i>':''}
    ${all.length>shown.length?`· 표시 ${shown.length.toLocaleString()}`:''} <i>· ${univNote}</i></div>`;
  /* [C2] 가상 스크롤 — 표시 대상이 많아지면 화면에 보이는 구간만 DOM 으로 만든다.
     무한스크롤로 수백~수천 행이 쌓여도 실제 DOM 노드는 일정하게 유지된다.
     VS_MIN 이하이면 기존 방식 그대로(작은 목록에서 괜히 복잡해지지 않게). */
  if(shown.length>VS_MIN){
    vsState={rows:shown,all:all.length,q,
      render:(x)=>stockRow(x.code,x.name,x.market,/ETF|ETN/i.test(x.kind||'')?'':(x.tag||x.kind||''))};
    html+=`<div class="vs-wrap" id="vsWrap"><div class="vs-pad" id="vsTop"></div><div id="vsRows"></div><div class="vs-pad" id="vsBot"></div></div>`;
  }else{
    vsState=null;
    html+=shown.map(x=>stockRow(x.code,x.name,x.market,/ETF|ETN/i.test(x.kind||'')?'':(x.tag||x.kind||''))).join('');
  }
  if(all.length>shown.length)html+=`<button class="etf-more" id="srchMore">더보기 (${shown.length.toLocaleString()} / ${all.length.toLocaleString()})</button><div class="srch-sentinel" id="srchSentinel"></div>`;
  if(!all.length){html=loading?'<div class="empty">불러오는 중…</div>':'<div class="empty">검색 결과가 없습니다</div>';vsState=null;}
    /* [v4.35] 해외 결과를 국내 목록과 같은 줄에 흘려 넣으면 배치가 깨진다(첨부 2번 사진).
     자체 블록으로 감싸 세로로 쌓이게 한다. */
  const usBlock=usHit.length?`<div class="us-searchblk"><div class="us-sec"><b>🇺🇸 해외 주식</b><span>탭하면 해외 거래 화면이 열립니다</span></div>`
    +usHit.map(u=>usRow(u[0])).join('')+`</div>`:'';
  usHit.length&&usEnsureQuotes(usHit.map(u=>u[0]),true).then(()=>{ if(currentView==='search')usPaintRows($('searchResults')); });
/* [v4.36] 해외만 국기 라벨이 붙어 있어 국내 결과가 무엇인지 모호했다 — 국내도 같은 방식으로 구분한다 */
  const krHead=`<div class="kr-searchblk"><div class="us-sec"><b>🇰🇷 국내 주식</b><span>코스피·코스닥·NXT</span></div></div>`;
  /* ══ [v4.60] 검색 결과를 좌우 2단으로 ═══════════════════════════════════
     예전에는 해외 블록을 국내 위에 얹어 세로로 쌓았다. 넓은 화면에서는 해외 몇 종을
     보려고 한참 스크롤해야 했고, 두 시장을 나란히 견주기도 어려웠다.
     왼쪽 국내 · 오른쪽 해외로 갈라 한눈에 비교되게 한다.
     좁은 화면에서는 한 단으로 되돌아가되, 국내가 먼저 오도록 순서를 지킨다. */
  $('searchResults').innerHTML=
    `<div class="sr-2col">
       <div class="sr-col sr-kr">${krHead}${html}</div>
       <div class="sr-col sr-us">${usBlock||
         `<div class="us-searchblk"><div class="us-sec"><b>🇺🇸 해외 주식</b><span>탭하면 해외 거래 화면이 열립니다</span></div>
          <div class="sr-none">이 검색어와 맞는 해외 종목이 없습니다</div></div>`}</div>
     </div>`;
  safeRun('cmpbar',renderCmpUi);
  if(vsState)vsPaint(true);
  bindStockClicks($('searchResults'));
  const mb=$('srchMore');if(mb)mb.onclick=()=>{srchPage++;renderSearch();};
  autoLoadMore($('srchSentinel'),()=>{srchPage++;renderSearch();});
}

/* ===== [C2] 가상 스크롤 엔진 =====
   행 높이가 균일한 목록에 대해, 위/아래를 빈 여백(padding)으로 채우고
   화면에 보이는 구간 ±여유분만 실제 DOM 으로 그린다.
   · 행 높이는 첫 렌더에서 실측해 보정한다(폰트·테마에 따라 달라지므로 고정값을 쓰지 않는다).
   · 스크롤 이벤트는 rAF 로 묶어 과도한 재렌더를 막는다. */
const VS_MIN=120;          // 이 개수를 넘을 때만 가상 스크롤 사용
const VS_BUFFER=8;         // 화면 위·아래로 더 그려 둘 행 수(스크롤 시 빈칸 방지)
let vsState=null, vsRowH=0, vsTicking=false, vsLast={a:-1,b:-1};

function vsPaint(force){
  const st=vsState; if(!st)return;
  const wrap=$('vsWrap'), rowsEl=$('vsRows'), top=$('vsTop'), bot=$('vsBot');
  if(!wrap||!rowsEl||!top||!bot){vsState=null;return;}

  // 행 높이 실측(최초 1회) — 표본이 없으면 임시로 1행만 그려 잰다
  if(!vsRowH){
    rowsEl.innerHTML=st.render(st.rows[0]);
    const first=rowsEl.firstElementChild;
    vsRowH=first?Math.round(first.getBoundingClientRect().height):58;
    if(!vsRowH)vsRowH=58;
  }
  const total=st.rows.length;
  const wrapTop=wrap.getBoundingClientRect().top+window.scrollY;
  const viewTop=window.scrollY, viewH=window.innerHeight;
  let a=Math.floor((viewTop-wrapTop)/vsRowH)-VS_BUFFER;
  let b=Math.ceil((viewTop+viewH-wrapTop)/vsRowH)+VS_BUFFER;
  a=Math.max(0,Math.min(a,total)); b=Math.max(a,Math.min(b,total));
  if(!force&&a===vsLast.a&&b===vsLast.b)return;      // 구간이 그대로면 다시 그리지 않는다
  vsLast={a,b};

  rowsEl.innerHTML=st.rows.slice(a,b).map(st.render).join('');
  try{primeNxtQuotes(st.rows.slice(a,b).map(x=>x&&(x.code||(x.s&&x.s.code))).filter(Boolean));}catch(e){}   // [수정] 화면에 들어온 구간 NXT 보완
  top.style.height=(a*vsRowH)+'px';
  bot.style.height=Math.max(0,(total-b)*vsRowH)+'px';
  bindStockClicks(rowsEl);
}
function vsOnScroll(){
  if(!vsState||vsTicking)return;
  vsTicking=true;
  requestAnimationFrame(()=>{ vsTicking=false; try{vsPaint(false);}catch(e){} });
}
window.addEventListener('scroll',vsOnScroll,{passive:true});
window.addEventListener('resize',()=>{vsRowH=0;vsLast={a:-1,b:-1};vsOnScroll();},{passive:true});
/* [C2] 목록 끝이 화면에 들어오면 자동으로 다음 페이지를 붙인다(버튼 안 눌러도 됨) */
let _ioMore=null;
function autoLoadMore(sentinel,cb){
  if(!sentinel)return;
  try{
    if(_ioMore)_ioMore.disconnect();
    _ioMore=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){_ioMore.disconnect();cb();}});},{rootMargin:'240px'});
    _ioMore.observe(sentinel);
  }catch(e){ /* 미지원 브라우저는 '더보기' 버튼 그대로 사용 */ }
}
$('searchInput').addEventListener('input',()=>{srchPage=1;if(!etfList)loadEtfList();
  if(!stockAll&&!stockLoading)loadStockAll().then(()=>{if(currentView==='search')renderSearch();});
  renderSearch();renderHist();syncSearchClear();});
function syncSearchClear(){const b=$('searchClear'),i=$('searchInput');if(b&&i)b.hidden=!((i.value||'').length);}
{const b=$('searchClear');if(b)b.onclick=()=>{const i=$('searchInput');i.value='';i.focus();renderSearch();renderHist();syncSearchClear();};}
document.querySelectorAll('#secTabs button').forEach(b=>b.onclick=()=>setSecTab(b.dataset.st));
/* ══ [v4.40] 주도 섹터 국내/해외 전환 ══════════════════════════════════════ */
var sectorMkt='kr';
document.querySelectorAll('#sectorMktTabs button').forEach(b=>b.onclick=()=>{
  sectorMkt=b.dataset.smkt;
  document.querySelectorAll('#sectorMktTabs button').forEach(x=>x.classList.toggle('on',x===b));
  applySectorMkt();
});
function applySectorMkt(){
  /* [v4.40] 국내 영역은 '해외 전용 박스와 시장 탭'을 뺀 나머지 직계 자식 전부.
     개별 id 를 열거하면 하나만 빠져도 복귀가 안 되므로 형제 순회로 처리한다. */
  const us=(sectorMkt==='us');
  const sec=document.getElementById('view-sector'); if(!sec)return;
  [...sec.children].forEach(el=>{
    if(el.id==='sectorMktTabs'||el.id==='secUsBody')return;
    if(el.classList.contains('page-title')||el.classList.contains('page-sub'))return;
    el.hidden=us;
  });
  const box=$('secUsBody'); if(!box)return;
  box.hidden=!us;
  if(us)renderUsSector();
}
/* 해외 주도 섹터 — 테마별 평균 등락률로 강도를 매긴다 */
function renderUsSector(){
  const box=$('secUsBody'); if(!box)return;
  const ready=US_UNI.map(u=>u[0]).filter(t=>usQ[t]&&usQ[t].price!=null&&usQ[t].prev);
  if(ready.length<5){
    if(_usQFail>=2){ /* [v4.48] 무한 대기 → 실패·다시시도 상태 */
      box.innerHTML='<div class="empty">해외 시세 서버가 지금 응답하지 않습니다<br><button class="rank-retry" id="usSecRetry">다시 시도</button></div>';
      const b=$('usSecRetry'); if(b)b.onclick=()=>{_usQFail=0;renderUsSector();};
      return;
    }
    box.innerHTML='<div class="empty">해외 시세를 불러오는 중…</div>';
    usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(()=>{ if(currentView==='sector'&&sectorMkt==='us')renderUsSector(); });
    usPollStart(US_UNI.map(u=>u[0]));
    return;
  }
  const rate=t=>(usQ[t].price-usQ[t].prev)/usQ[t].prev*100;
  const rows=US_THEMES.map(([k,label])=>{
    const list=US_UNI.filter(u=>u[4]===k).map(u=>u[0]).filter(t=>ready.includes(t));
    if(!list.length)return null;
    const avg=list.reduce((a,t)=>a+rate(t),0)/list.length;
    const up=list.filter(t=>rate(t)>0).length;
    const top=list.slice().sort((a,b)=>rate(b)-rate(a)).slice(0,3);
    return {k,label,avg,n:list.length,up,top};
  }).filter(Boolean).sort((a,b)=>b.avg-a.avg);
  const mx=Math.max(...rows.map(r=>Math.abs(r.avg)),0.1);
  const ses=usSession();
  box.innerHTML=`<div class="rank-note us-rank-note">🇺🇸 미국 ${ses.label}${ses.phase==='closed'?' · 다음 개장 '+ses.next:''}
      · 테마 ${rows.length}개 · 유니버스 ${US_UNI.length}종 평균 등락 기준</div>
    <div class="us-sect-list">${rows.map((r,i)=>`
      <div class="us-sect" data-ustheme2="${r.k}">
        <div class="uss-h"><span class="uss-rk num">${i+1}</span><b>${r.label}</b>
          <span class="uss-avg num ${dirOf(r.avg)}">${pctS(r.avg)}</span></div>
        <div class="uss-bar"><i class="${r.avg>=0?'up':'down'}" style="width:${Math.min(100,Math.abs(r.avg)/mx*100)}%"></i></div>
        <div class="uss-m">${r.n}종 중 <b class="up">${r.up}</b> 상승 · 
          ${r.top.map(t=>`<span class="uss-t" data-us="${t}">${usMeta[t].kr} <i class="num ${dirOf(rate(t))}">${pctS(rate(t))}</i></span>`).join('')}</div>
      </div>`).join('')}</div>`;
}
document.querySelectorAll('#proTabs button').forEach(b=>b.onclick=()=>setProTab(b.dataset.pt));
if($('picksRun'))$('picksRun').onclick=()=>loadPicks(!!picksCache);
if($('nhRun'))$('nhRun').onclick=loadNxtHist;
if($('csvExport'))$('csvExport').onclick=exportTradesCsv;
{const a=$('surgeRun');if(a)a.onclick=runSurge;const b=$('scrRun');if(b)b.onclick=runScreener;
 {const r=$('scrReset');if(r)r.onclick=scrReset;
  document.querySelectorAll('.scr-preset button').forEach(x=>x.onclick=()=>scrPreset(x.dataset.preset));}
 const c=$('btRun');if(c)c.onclick=runBacktest;const d=$('rkRun');if(d)d.onclick=runRisk;}
/* [추가] 고급 서비스 실시간 자동 갱신 루프 — 화면이 떠 있는 동안 버튼 없이 최신 유지.
   급등 스캔: 장중 5분마다(절약 모드 제외) · 조건검색: 45초 · 시장 온도계: 30초.
   다른 화면이거나 앱이 백그라운드면 아무것도 하지 않는다. */
setInterval(()=>{try{maybeSnapSession();}catch(e){}},60e3);
/* ══ [v2.1] 세션 경계 워처 ══
   원인: 배지는 렌더 시점에 굳는 HTML인데, 야간·휴장엔 폴링이 '갱신 대기'로 쉬어
   자정(장 종료→휴장) 같은 경계를 아무도 다시 그려 주지 않았다.
   해결: 시세와 독립된 20초 시계가 세션 경계(00:00·08:00·08:30·09:00·15:30·18:00·20:00·휴장)를
   감지하면 화면의 배지 표면들을 즉시 재렌더한다. 탭 복귀(visibilitychange) 시에도 즉시 점검. */
function badgePhaseKey(){
  const k=kstNow(),w=k.getUTCDay(),hm=k.getUTCHours()*60+k.getUTCMinutes();
  const hol=(w===0||w===6||isKrHolidayTodayKST())?'H':'D';
  const band=hm<480?0:hm<510?1:hm<540?2:hm<930?3:hm<1080?4:hm<1200?5:6;
  return hol+band;
}
let _badgePhase=null;
function refreshSessionBadges(){
  try{
    if(currentView==='search')renderSearch();
    else if(currentView==='sector'&&thmOpen)renderThemeDetail(thmOpen);
    else if(currentView==='watch')renderWatch();
    else if(currentView==='trade'&&selected){const b=mktBadgeInfo(selected),el=$('dSrc');
      if(el){el.hidden=false;el.textContent=b[0];el.className='d-src '+b[1];}}
    else if(currentView==='home'){safeRun('mysum',renderMySum);safeRun('mysumtidy',tidyMySum);safeRun('homehead',renderHomeHead);safeRun('heromkt',renderHeroMarket);}
  }catch(e){}
}
function checkBadgePhase(){
  const ph=badgePhaseKey();
  if(_badgePhase!==null&&ph!==_badgePhase){_badgePhase=ph;refreshSessionBadges();}
  else _badgePhase=ph;
}
setInterval(checkBadgePhase,20e3);
{const j=$('homeJump');
 if(j)j.querySelectorAll('button').forEach(b=>b.onclick=()=>{
   const t=$(b.dataset.j);if(!t)return;
   (t.closest('.sec')||t).scrollIntoView({behavior:'smooth',block:'start'});});}
document.addEventListener('keydown',(e)=>{   // [v2.1] '/' 어디서든 종목검색 포커스
  if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey)return;
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  e.preventDefault();showView('search');
  const i=$('searchInput');if(i){i.focus();try{i.select();}catch(_e){}}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkBadgePhase();});
setInterval(()=>{try{ensureMood().then(()=>{if(currentView==='home')safeRun('homenews',renderHomeNews);});}catch(e){}},5*60e3);
setTimeout(()=>{try{ensureMood();}catch(e){}},4e3);
setTimeout(()=>{try{maybeSnapSession();}catch(e){}},8e3);
setInterval(()=>{try{
  if(document.hidden||currentView!=='pro')return;
  if(proTab==='surge'&&!surgeBusy){
    const b=sessionBasis();
    if(window._sgBasisKey&&window._sgBasisKey!==b.key)runSurge();          // 기준 전환(마지막 장→당일 등) 즉시 재스캔
    else if(!userPrefs.dataSaver&&Date.now()-surgeAt>(krxRegularOpen()?5*60e3:15*60e3))runSurge();
    window._sgBasisKey=b.key;
  }
  else if(proTab==='screener'&&Date.now()-scrAt>45e3)runScreener();
  else if(proTab==='thermo')renderThermo();
  else if(proTab==='picks'&&!picksCache&&!picksBusy)loadPicks(false);
}catch(e){}},30e3);
{const ei=$('etfSearch');if(ei)ei.addEventListener('input',()=>{etfQuery=ei.value||'';etfLimit=30;renderEtfLounge();});}
/* [수정] runEtfProbe 가 정의되어 있지 않아 이 줄에서 ReferenceError가 발생했고,
   최상위 코드였기 때문에 **스크립트 실행이 여기서 통째로 중단**됐다.
   그 결과 이 아래에 있는 const TFS·차트 코드·boot() 등이 전혀 로드되지 않아
   ETF 목록·거래 화면·종목 클릭·공모주가 모두 죽어 있었다. 함수를 구현하고 바인딩도 방어적으로 바꾼다. */
async function runEtfProbe(){
  const stat=$('eaStat'),fails=$('eaFails');
  if(stat){stat.hidden=false;stat.innerHTML='데이터 소스를 탐색하는 중… (대표 ETF 1종목으로 실측)';}
  if(fails)fails.innerHTML='';
  const code=(etfList&&etfList[0]&&etfList[0].code)||'069500';
  try{
    fnBump();
    const ac=new AbortController();const tm=setTimeout(()=>ac.abort(),15000);
    let j;
    try{const r=await fetch('/api/etfprobe?code='+encodeURIComponent(code),{cache:'no-store',signal:ac.signal});j=await r.json();}
    finally{clearTimeout(tm);}
    const rows=(j&&j.results)||[];
    if(!rows.length){if(stat)stat.innerHTML='탐색 결과가 비어 있습니다. 잠시 후 다시 시도해 주세요.';return;}
    const ok=rows.filter(x=>x.hasKeyword==='Y'||(x.arrays&&x.arrays!=='')).length;
    if(stat)stat.innerHTML=`대상 <b>${j.code||code}</b> · 소스 ${rows.length}곳 탐색 · 구성종목 확보 가능 <b>${ok}</b>곳`;
    if(fails)fails.innerHTML='<table class="ea-tbl"><thead><tr><th>소스</th><th>상태</th><th>크기</th><th>키워드</th><th>배열/표</th><th>비고</th></tr></thead><tbody>'
      +rows.map(x=>`<tr>
        <td>${x.name||''}</td>
        <td class="num">${x.err?'<span class="dn">실패</span>':(x.status??'')}</td>
        <td class="num">${x.bytes!=null?(x.bytes/1024).toFixed(1)+'KB':'—'}</td>
        <td class="num">${x.hasKeyword==='Y'?'<b class="up">Y</b>':'N'}</td>
        <td class="num">${x.json==='Y'?('JSON '+(x.arrays||'-')):('표 '+(x.tables??0)+'/'+(x.pdfTables??0))}</td>
        <td>${(x.err||x.keys||'').toString().slice(0,60)}</td></tr>`).join('')
      +'</tbody></table>';
  }catch(e){
    if(stat)stat.innerHTML='데이터 소스 탐색에 실패했습니다. ('+String(e&&e.message||e).slice(0,60)+')';
  }
}
bindClick('eaStart',()=>runEtfAudit());
bindClick('eaStop',()=>{eaRun=false;});
bindClick('eaProbe',()=>runEtfProbe());
document.querySelectorAll('#searchTabs button').forEach(b=>b.onclick=()=>{searchRankTab=b.dataset.rt;document.querySelectorAll('#searchTabs button').forEach(x=>x.classList.toggle('on',x===b));renderSearch();});
/* [v4.38] 국내/해외 전환 — 해외를 고르면 시세를 먼저 받아 온 뒤 순위를 그린다 */
document.querySelectorAll('#searchMktTabs button').forEach(b=>b.onclick=()=>{
  searchMkt=b.dataset.mkt;
  document.querySelectorAll('#searchMktTabs button').forEach(x=>x.classList.toggle('on',x===b));
  renderSearch();
  if(searchMkt==='us')usPollStart(US_UNI.map(u=>u[0]));
  if(searchMkt==='us')usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(()=>{
    if(currentView==='search'&&searchMkt==='us'&&!((($('searchInput')||{}).value||'').trim())){
      $('searchResults').innerHTML=rankSection(); bindStockClicks($('searchResults')); bindRankRetry();
    }});
});

/* 관심종목 */
/* ===== 관심종목 + 사용자 폴더 =====
   · 전체/폴더 탭(색상·이모지 지정, 드래그로 순서 변경) · ＋ 새 폴더(최대 12개)
   · ✎ 편집(이름·이모지·색상) · 🗑 삭제(종목은 관심종목에 유지)
   · 행 「폴더」 버튼 → 체크박스 팝오버(화면 아래선 위로 뒤집힘)
   · ☑ 선택 모드: 여러 종목을 한 번에 폴더에 담기/빼기
   · 폴더 요약 바(상승·하락·평균), NXT 배지, 게스트 저장 안내 */
const FOLDER_MAX=12;
const FD_ICONS=['📈','💎','🔋','🤖','🏦','💊','🚗','⭐'];
const FD_COLORS=['#e5484d','#f59e0b','#22a559','#2f74ff','#8b5cf6','#64748b'];
let wlSelMode=false, wlSelSet=new Set();

/* [사소#7] 한 렌더 패스 동안 dispQuote 결과 재사용 — 정렬·셀 계산이 같은 값을 두 번 구하지 않게 */
let _dqMemo=null;
function dq(code){
  if(_dqMemo&&_dqMemo.has(code))return _dqMemo.get(code);
  const v=dispQuote(code);
  if(_dqMemo)_dqMemo.set(code,v);
  return v;
}

function folderOf(id){return watchFolders.find(f=>f.id===id)||null;}

function renderWatch(){
  const w=$('watchWrap'); if(!w)return;
  _dqMemo=new Map();
  if(watchTab!=='all'&&!folderOf(watchTab))watchTab='all';
  const cnt=(f)=>f.codes.filter(c=>watchlist.includes(c)).length;
  const tabHtml=(f)=>{
    const st=f.color?` style="--fdc:${f.color}"`:'';
    return `<button class="wl-tab${watchTab===f.id?' on':''}${f.color?' colored':''}" draggable="true" data-t="${f.id}"${st}>${f.icon?f.icon+' ':''}${f.name} <i>${cnt(f)}</i></button>`;};
  /* [v1.99] '전체' 가상 폴더 제거 — 폴더가 곧 관심종목의 단위 */
  const tabs=`<div class="wl-tabwrap"><div class="wl-tabs" id="wlTabs">`
    +watchFolders.map(tabHtml).join('')
    +`<button class="wl-tab add" id="wlAdd" aria-label="새 폴더 만들기" title="새 폴더">＋</button></div></div>`;
  const guestNote='';   // [v4.1] 게스트 모드 폐지
  /* [v1.99] 폴더가 하나도 없으면 — 관심종목은 폴더에 담아야 하므로 생성 CTA */
  if(!watchFolders.length){
    w.innerHTML=`<div class="wl-first">
      <div class="wf-ic">🗂️</div>
      <b>먼저 관심종목 폴더를 만들어 주세요</b>
      <p>관심종목은 폴더 단위로 관리됩니다.<br>폴더를 만든 뒤 종목 화면의 ☆ 별을 누르면 원하는 폴더를 골라 담을 수 있어요.</p>
      <button class="btn-primary" id="wlFirstAdd">＋ 첫 폴더 만들기</button>
    </div>`;
    const fb=$('wlFirstAdd');
    if(fb)fb.onclick=async()=>{const f=await newFolderFlow();if(f){watchTab=f.id;renderWatch();}};
    _dqMemo=null;return;
  }
  if(!folderOf(watchTab))watchTab=watchFolders[0].id;
  const curF=folderOf(watchTab);
  const tools=`<div class="wl-tools">${curF?`<button class="wl-mini" id="wlRen">✎ 편집</button><button class="wl-mini" id="wlBell">🔔 일괄 알림</button><button class="wl-mini danger" id="wlDel">🗑 삭제</button>`:''}
    <button class="wl-mini${wlSelMode?' on':''}" id="wlSel">☑ 선택${wlSelMode?' 중':''}</button>
    <span class="wl-sp"></span><div class="wl-sort"><button class="${watchSortMode==='chg'?'on':''}" data-m="chg">등락순</button><button class="${watchSortMode==='mine'?'on':''}" data-m="mine">내 순서</button></div></div>`;
  const codes=curF.codes.filter(c=>watchlist.includes(c));
  /* [F4→v1.97] 폴더 요약 — 통계 카드 스트립(기준값 사용, 베스트/워스트 바로 이동) */
  let sumBar='';
  {const ch=codes.map(c=>byCode[c]).filter(Boolean).map(st=>({st,p:qBasis(st).chg})).filter(x=>x.p!=null);
   if(ch.length){
     const up=ch.filter(x=>x.p>0).length,dn=ch.filter(x=>x.p<0).length,avg=ch.reduce((a,x)=>a+x.p,0)/ch.length;
     const srt=ch.slice().sort((a,b)=>b.p-a.p),best=srt[0],worst=srt[srt.length-1];
     const bs=sessionBasis();
     sumBar=`<div class="wl-stats">
       <div class="ws-c"><span>상승 / 하락</span><b><i class="up">${up}</i> / <i class="down">${dn}</i></b></div>
       <div class="ws-c"><span>평균 등락</span><b class="num ${avg>=0?'up':'down'}">${pctS(avg)}</b></div>
       <div class="ws-c click" data-code="${best.st.code}"><span>베스트</span><b>${stockLogo(best.st.code,best.st.name,'xs')}${best.st.name} <i class="num up">${pctS(best.p)}</i></b></div>
       ${ch.length>1?`<div class="ws-c click" data-code="${worst.st.code}"><span>워스트</span><b>${stockLogo(worst.st.code,worst.st.name,'xs')}${worst.st.name} <i class="num down">${pctS(worst.p)}</i></b></div>`:''}
       ${bs.mode!=='live'||/마지막|전일|금요일/.test(bs.label)?`<div class="ws-basis"><i class="lv-dot"></i>${bs.label}</div>`:''}
     </div>`;}}
  const rows=watchSortMode==='chg'?listByChange(codes):codes.map(c=>byCode[c]).filter(Boolean);
  const mine=watchSortMode==='mine';
  const body=!codes.length
    ?'<div class="empty">이 폴더가 비어 있습니다.<br>종목 화면에서 ☆ 별을 누르고 이 폴더를 선택해 담아 보세요.</div>'
    :`<table><thead><tr><th>종목</th><th>현재가</th><th>전일대비</th><th>등락률</th><th class="cdl-th">봉</th><th>거래량</th><th>목표가 알림</th></tr></thead><tbody id="watchBody">`
    +rows.map(s=>{const wv=watchCells(s.code);
      const sel=wlSelMode?`<label class="wl-ck" onclick="event.stopPropagation()"><input type="checkbox" data-sel="${s.code}" ${wlSelSet.has(s.code)?'checked':''}></label>`:'';
      const mv=(mine&&!wlSelMode)?`<span class="wl-mv"><button data-mv="-1" data-code="${s.code}" aria-label="위로">▲</button><button data-mv="1" data-code="${s.code}" aria-label="아래로">▼</button></span>`:'';
      const nxtB=nxtCapability(s.code)===true?'<span class="nxt-badge sm">NXT</span>':'';
      return `<tr data-code="${s.code}"><td><div class="td-l">${sel}${mv}${stockLogo(s.code,s.name)}<div class="td-t"><span class="nm">${s.name}</span>${nxtB}${s.tags&&s.tags[0]?`<span class="tag">${s.tags[0]}</span>`:mktTag(s.code,s.market)}<button class="wl-fd" data-fd="${s.code}" aria-label="폴더에 담기">폴더</button><br><span class="cd num">${s.code}</span></div></div></td>
      <td class="num ${wv.dir}" id="wpx-${s.code}">${wv.px}</td><td class="num ${wv.dir}">${wv.diff}</td>
      <td class="num ${wv.dir}">${wv.rate}</td><td class="cdl-td" id="wcd-${s.code}">${miniCandle(s.code)}</td><td class="num">${wv.vol}</td>
      <td>${targetCell(s.code)}</td></tr>`;}).join('')+`</tbody></table>`;
  const selBar=wlSelMode?`<div class="wl-selbar"><b>${wlSelSet.size}</b>개 선택
      <button class="wl-mini" id="wlSelAdd">폴더에 담기</button>
      ${curF?`<button class="wl-mini danger" id="wlSelRm">이 폴더에서 빼기</button>`:''}
      <span class="wl-sp"></span><button class="wl-mini" id="wlSelX">완료</button></div>`:'';
  w.innerHTML=tabs+guestNote+tools+sumBar+body+selBar;
  w.querySelectorAll('.ws-c.click').forEach(el=>el.onclick=()=>openTrade(el.dataset.code));
  wireWatchUi();
  const tb=$('watchBody');
  if(tb){bindStockClicks(tb);bindTargetInputs(tb);
    tb.querySelectorAll('.wl-fd').forEach(b=>b.onclick=(e)=>{e.stopPropagation();openFolderPop(b.dataset.fd,b);});
    tb.querySelectorAll('.wl-mv button').forEach(b=>b.onclick=(e)=>{e.stopPropagation();moveWatch(b.dataset.code,+b.dataset.mv);});
    tb.querySelectorAll('input[data-sel]').forEach(c=>c.onchange=()=>{
      if(c.checked)wlSelSet.add(c.dataset.sel);else wlSelSet.delete(c.dataset.sel);
      const n=$('watchWrap').querySelector('.wl-selbar b');if(n)n.textContent=wlSelSet.size;});}
  _dqMemo=null;
}

async function newFolderFlow(preCodes){
  if(watchFolders.length>=FOLDER_MAX){toast('warn','폴더는 최대 '+FOLDER_MAX+'개','기존 폴더를 정리해 주세요');return null;}
  const nm=await askText('새 폴더 이름',{placeholder:'예: 반도체, 배당주',maxLen:12});
  if(!nm)return null;
  if(watchFolders.some(f=>f.name===nm)){toast('warn','같은 이름 폴더가 있어요',nm);return null;}
  const icon=await askChoice('폴더 이모지',[{v:'',label:'없음'},...FD_ICONS.map(i=>({v:i,label:i}))]);
  if(icon===null)return null;
  const color=await askChoice('폴더 색상',[{v:'',label:'기본'},...FD_COLORS.map(c=>({v:c,label:`<i class="fd-sw" style="background:${c}"></i>`}))]);
  if(color===null)return null;
  const f={id:'f'+Date.now().toString(36),name:nm,codes:preCodes?preCodes.slice():[],icon:icon||'',color:color||''};
  watchFolders.push(f);
  syncWatchUnion();(f.codes||[]).forEach(c=>{feed&&feed.addCode(c);});   // [v1.99]
  saveState();toast('buy','폴더 생성',(icon?icon+' ':'')+nm);
  return f;
}
function wireWatchUi(){
  document.querySelectorAll('.wl-tab[data-t]').forEach(b=>{
    b.onclick=()=>{watchTab=b.dataset.t;wlSelSet.clear();renderWatch();};
    /* [F3] 탭 드래그로 폴더 순서 변경 */
    {
      b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/fdid',b.dataset.t);b.classList.add('drag');});
      b.addEventListener('dragend',()=>b.classList.remove('drag'));
      b.addEventListener('dragover',e=>e.preventDefault());
      b.addEventListener('drop',e=>{e.preventDefault();
        const from=e.dataTransfer.getData('text/fdid');if(!from||from===b.dataset.t)return;
        const fi=watchFolders.findIndex(f=>f.id===from),ti=watchFolders.findIndex(f=>f.id===b.dataset.t);
        if(fi<0||ti<0)return;const [mv]=watchFolders.splice(fi,1);watchFolders.splice(ti,0,mv);
        saveState();renderWatch();});
    }
  });
  /* [v2.7] 탭이 가로 스크롤 바가 됐으므로, 선택된 폴더가 화면 밖이면 끌어온다.
     scrollIntoView 는 페이지 전체를 움직일 수 있어 컨테이너 scrollLeft 만 직접 계산한다. */
  try{
    const bar=$('wlTabs'), on=bar&&bar.querySelector('.wl-tab.on');
    if(bar&&on){
      const l=on.offsetLeft, r=l+on.offsetWidth;
      if(l<bar.scrollLeft)bar.scrollLeft=Math.max(0,l-14);
      else if(r>bar.scrollLeft+bar.clientWidth)bar.scrollLeft=r-bar.clientWidth+14;
    }
  }catch(e){}
  const add=$('wlAdd'); if(add)add.onclick=async()=>{const f=await newFolderFlow();if(f){watchTab=f.id;renderWatch();}};
  const ren=$('wlRen'); if(ren)ren.onclick=async()=>{const f=folderOf(watchTab);if(!f)return;
    const nm=await askText('폴더 이름',{value:f.name,maxLen:12}); if(nm===null)return;
    if(nm&&nm!==f.name){if(watchFolders.some(x=>x.id!==f.id&&x.name===nm)){toast('warn','같은 이름 폴더가 있어요',nm);return;}f.name=nm;}
    const icon=await askChoice('폴더 이모지',[{v:f.icon||'',label:(f.icon||'없음')+' (현재)'},{v:'',label:'없음'},...FD_ICONS.map(i=>({v:i,label:i}))]);
    if(icon!==null)f.icon=icon;
    const color=await askChoice('폴더 색상',[{v:f.color||'',label:'현재 유지'},{v:'',label:'기본'},...FD_COLORS.map(c=>({v:c,label:`<i class="fd-sw" style="background:${c}"></i>`}))]);
    if(color!==null)f.color=color;
    saveState();renderWatch();};
  const bell=$('wlBell'); if(bell)bell.onclick=async()=>{
    const f=folderOf(watchTab); if(!f)return;
    const codes=f.codes.filter(c=>watchlist.includes(c)&&byCode[c]&&byCode[c].price>0);
    if(!codes.length){toast('warn','시세 있는 종목이 없어요','잠시 뒤 다시 시도해 주세요');return;}
    const dirPick=await askChoice('일괄 목표가 알림',[{v:'up',label:'▲ 현재가보다 오르면'},{v:'down',label:'▼ 현재가보다 내리면'},{v:'both',label:'▲▼ 양방향 모두'}],
      `'${f.icon?f.icon+' ':''}${f.name}' 폴더 ${codes.length}종목에 한 번에 설정합니다`);
    if(dirPick===null)return;
    const pct=await askText('기준 % (현재가 대비)',{placeholder:'예: 5',value:'5',maxLen:4});
    if(pct===null)return;
    const r=Math.max(0.5,Math.min(50,+String(pct).replace(/[^0-9.]/g,'')||5));
    let setN=0;
    codes.forEach(c=>{const px=byCode[c].price;
      priceTargets[c]=priceTargets[c]||{};
      if(dirPick==='up'||dirPick==='both'){priceTargets[c].up={price:Math.round(px*(1+r/100)),fired:false};setN++;}
      if(dirPick==='down'||dirPick==='both'){priceTargets[c].down={price:Math.round(px*(1-r/100)),fired:false};setN++;}});
    saveTargets();askNotify();renderWatch();
    toast('buy','일괄 알림 설정',`${codes.length}종목 · ±${r}% 기준 ${setN}건`);};
  const del=$('wlDel'); if(del)del.onclick=async()=>{const f=folderOf(watchTab);if(!f)return;
    const ok=await askConfirm('폴더 삭제',`'${f.icon?f.icon+' ':''}${f.name}' 폴더를 삭제할까요?\n다른 폴더에도 없는 종목은 관심종목에서 함께 해제됩니다.`,{okLabel:'삭제',danger:true});
    if(!ok)return;
    watchFolders=watchFolders.filter(x=>x.id!==watchTab);
    syncWatchUnion();                                                    // [v1.99] 고아 종목 관심 해제
    watchTab=watchFolders.length?watchFolders[0].id:'all';
    if(typeof updateStar==='function')updateStar();
    saveState();renderWatch();};
  const sel=$('wlSel'); if(sel)sel.onclick=()=>{wlSelMode=!wlSelMode;if(!wlSelMode)wlSelSet.clear();renderWatch();};
  const sx=$('wlSelX'); if(sx)sx.onclick=()=>{wlSelMode=false;wlSelSet.clear();renderWatch();};
  const sa=$('wlSelAdd'); if(sa)sa.onclick=async()=>{
    if(!wlSelSet.size){toast('warn','선택된 종목이 없어요','체크박스로 먼저 골라 주세요');return;}
    const opts=[...watchFolders.map(f=>({v:f.id,label:`${f.icon?f.icon+' ':''}${f.name} <i>${f.codes.length}</i>`})),{v:'__new',label:'＋ 새 폴더 만들어 담기'}];
    const pick=await askChoice(`${wlSelSet.size}개 종목을 담을 폴더`,opts);
    if(pick===null)return;
    let f=pick==='__new'?await newFolderFlow([...wlSelSet]):folderOf(pick);
    if(!f)return;
    if(pick!=='__new')wlSelSet.forEach(c=>{if(!f.codes.includes(c))f.codes.push(c);});
    syncWatchUnion();saveState();wlSelMode=false;wlSelSet.clear();watchTab=f.id;renderWatch();
    toast('buy','폴더에 담음',`${f.name} · ${f.codes.length}종목`);};
  const sr=$('wlSelRm'); if(sr)sr.onclick=()=>{const f=folderOf(watchTab);if(!f||!wlSelSet.size)return;
    f.codes=f.codes.filter(c=>!wlSelSet.has(c));syncWatchUnion();if(typeof updateStar==='function')updateStar();saveState();wlSelSet.clear();renderWatch();};
  document.querySelectorAll('.wl-sort button').forEach(b=>b.onclick=()=>{
    watchSortMode=b.dataset.m;pset('watchSort',watchSortMode);renderWatch();});
}
function moveWatch(code,dir){
  const arr=(folderOf(watchTab)||{codes:null}).codes;   // [v1.99] 폴더 순서만 존재
  if(!arr)return;
  const i=arr.indexOf(code),j2=i+dir;
  if(i<0||j2<0||j2>=arr.length)return;
  [arr[i],arr[j2]]=[arr[j2],arr[i]];
  saveState();renderWatch();
}
let _fdPop=null;
function closeFolderPop(){if(_fdPop){_fdPop.remove();_fdPop=null;document.removeEventListener('click',closeFolderPop);}}
function openFolderPop(code,btn){
  closeFolderPop();
  const s=byCode[code]||{name:code};
  const d=document.createElement('div'); d.className='fd-pop'; _fdPop=d;
  const list=watchFolders.length?watchFolders.map(f=>`<label class="fd-it"><input type="checkbox" data-f="${f.id}" ${f.codes.includes(code)?'checked':''}> ${f.icon?f.icon+' ':''}${f.name} <i>${f.codes.filter(c=>watchlist.includes(c)).length}</i></label>`).join('')
    :'<div class="fd-none">아직 폴더가 없어요. 아래에서 바로 만들 수 있어요.</div>';
  d.innerHTML=`<div class="fd-hd">${s.name} · 폴더 담기</div>${list}<button class="fd-new">＋ 새 폴더 만들어 담기</button>`;
  document.body.appendChild(d);
  /* [사소#5] 화면 아래쪽이면 버튼 위로 뒤집어 뷰포트 밖으로 안 나가게 */
  const r=btn.getBoundingClientRect(), ph=d.offsetHeight;
  const below=r.bottom+6+ph<window.innerHeight-8;
  d.style.top=(below?r.bottom+6:Math.max(8,r.top-ph-6))+window.scrollY+'px';
  d.style.left=Math.max(8,Math.min(window.innerWidth-d.offsetWidth-8,r.left+window.scrollX))+'px';
  d.addEventListener('click',e=>e.stopPropagation());
  d.querySelectorAll('input[data-f]').forEach(ch=>ch.onchange=()=>{
    const f=folderOf(ch.dataset.f); if(!f)return;
    const before=watchlist.includes(code);
    if(ch.checked){if(!f.codes.includes(code))f.codes.push(code);}
    else f.codes=f.codes.filter(c=>c!==code);
    syncWatchUnion();                                   // [v1.99] 관심 = 폴더 합집합
    const after=watchlist.includes(code);
    if(!before&&after){feed&&feed.addCode(code);toast('buy','관심종목 추가',`${(byCode[code]&&byCode[code].name)||code} → ${f.icon?f.icon+' ':''}${f.name}`);}
    if(before&&!after)toast('warn','관심종목 해제','모든 폴더에서 빠졌습니다');
    if(typeof updateStar==='function'&&selected===code)updateStar();
    saveState();
    renderWatch();
    const nb=document.querySelector(`.wl-fd[data-fd="${code}"]`);
    if(nb)openFolderPop(code,nb); else closeFolderPop();
  });
  d.querySelector('.fd-new').onclick=async()=>{
    const f=await newFolderFlow([code]);
    if(f){renderWatch();closeFolderPop();}};
  setTimeout(()=>document.addEventListener('click',closeFolderPop),0);
}
/* 관심종목 한 줄의 표시값을 한 곳에서 계산한다(전체 렌더·증분 갱신이 반드시 같은 값을 쓰도록).
   프리마켓엔 dispQuote 가 NXT 체결가를 얹어 주고, KRX 전용 종목은 KRX 기준 그대로 둔다. */
function watchCells(code){
  const s=byCode[code]||{};
  const q=(typeof dq==='function'&&_dqMemo)?dq(code):dispQuote(code);
  const price=q&&q.price!=null?q.price:s.price;
  const prev=q&&q.prevClose?q.prevClose:s.prevClose;
  const diff=(price!=null&&prev)?price-prev:null;
  const rate=diff!=null?diff/prev*100:null;
  /* 거래량: 프리마켓 KRX 거래량은 원래 0이라 '0'을 그대로 쓰면 오해를 부른다.
     NXT 거래량이 있으면 그걸 쓰고, 없으면 '—'(집계 전)로 표시한다. */
  const npx=nxtPx[code];
  let vol=s.volume;
  if(nxtOnlyWindow()&&npx&&npx.volume!=null&&npx.volume>0)vol=npx.volume;
  const volTxt=(vol==null||(vol===0&&!krxRegularOpen()))?'—':KRW(vol);
  return {price,prev,dir:diff==null?'flat':dirOf(diff),
          px:price!=null?KRW(price):'—',
          diff:diff==null?'—':signed(diff),
          rate:rate==null?'—':pctS(rate),
          vol:volTxt};
}
/* ══ [v2.7] 미니 봉차트 ══════════════════════════════════════════════════
   목록에서 오늘 하루의 시가·고가·저가·현재가를 캔들 하나로 보여 준다.
   한국식 표기: 현재가 ≥ 시가면 양봉(빨강), 아니면 음봉(파랑).
   canvas 가 아니라 인라인 SVG로 그린다 — innerHTML 재렌더에도 상태가 없고,
   행이 수십 개여도 비용이 사실상 0이다(캔버스는 행마다 컨텍스트가 필요하다).
   시가가 아직 없는 프리마켓·개장 전에는 전일 종가를 시가로 삼아 기준선을 잡는다. */
function miniCandle(code,w,h){
  w=w||20; h=h||36;
  const s=byCode[code]||{};
  const q=dispQuote(code)||{};
  const px=(q.price!=null)?q.price:s.price;
  const pv=q.prevClose||s.prevClose;
  if(px==null||!isFinite(px))return '<span class="cdl-na">—</span>';
  let o=s.open,hi=s.high,lo=s.low;
  if(!(o>0))o=pv||px;
  if(!(hi>0))hi=Math.max(o,px,pv||px);
  if(!(lo>0))lo=Math.min(o,px,pv||px);
  hi=Math.max(hi,o,px); lo=Math.min(lo,o,px);
  const pad=3, H=h-pad*2, rng=hi-lo;
  /* 고가=저가(개장 전·거래 없음)면 나눗셈이 성립하지 않는다.
     이때 예전 식은 항상 y=pad 가 나와 막대가 맨 위에 붙었다 → 세로 중앙에 그린다. */
  const y=(v)=>+(rng>0?(pad+(hi-v)/rng*H):(h/2)).toFixed(1);
  const cx=w/2;
  const bt=y(Math.max(o,px)), bb=y(Math.min(o,px));
  const bh=Math.max(1.8,+(bb-bt).toFixed(1));
  const bw=Math.max(6,Math.round(w*0.56));
  const cls=px>=o?'cup':'cdn';
  const t=`시 ${KRW(o)} · 고 ${KRW(hi)} · 저 ${KRW(lo)} · 현 ${KRW(px)}`;
  return `<svg class="cdl ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${t}</title>`
    +`<line x1="${cx}" y1="${y(hi)}" x2="${cx}" y2="${y(lo)}" stroke-width="1.4"/>`
    +`<rect x="${((w-bw)/2).toFixed(1)}" y="${bt}" width="${bw}" height="${bh}" rx="1.2"/></svg>`;
}
function updateWatchRow(code){
  const px=$('wpx-'+code);if(!px){renderWatch();return;}
  const w=watchCells(code),tds=px.closest('tr').children;
  px.textContent=w.px;px.className='num '+w.dir;
  tds[2].textContent=w.diff;tds[2].className='num '+w.dir;
  tds[3].textContent=w.rate;tds[3].className='num '+w.dir;
  /* [v2.7] '봉' 열이 tds[4]로 들어와 거래량이 tds[5]로 밀렸다. 인덱스를 함께 옮긴다. */
  const cd=$('wcd-'+code); if(cd)cd.innerHTML=miniCandle(code);
  if(tds[5])tds[5].textContent=w.vol;
  /* [수정] 예전엔 마지막 칸에 거래대금을 써서 '목표가 알림' 버튼을 지워 버렸다. 이 칸은 건드리지 않는다. */
  if(lastPx[code]!==undefined&&lastPx[code]!==w.price){px.classList.remove('fl-up','fl-down');void px.offsetWidth;px.classList.add(w.price>lastPx[code]?'fl-up':'fl-down');}
  lastPx[code]=w.price;
}
/* [v4.41] 목록 클릭을 한 곳에서 갈라 준다 — 해외 티커면 해외 거래 화면으로.
   이 함수는 검색·관심·순위·보유 등 거의 모든 목록이 함께 쓰므로, 여기만 고치면 전 화면이 통일된다. */
function bindStockClicks(root){root.querySelectorAll('[data-code]').forEach(n=>n.onclick=()=>{
  const c=n.dataset.code;
  if(usMeta&&usMeta[c]){ openUS(c); return; }
  if(n.dataset.name)ensureStock(c,n.dataset.name,n.dataset.market);
  openTrade(c);
});}

/* ⭐ 관심종목 — [v1.99] 별을 누르면 '어느 폴더에 담을지' 선택한다.
   폴더가 하나도 없으면 먼저 폴더 생성 플로우가 열린다(폴더 없이 관심 등록 불가). */
$('starBtn').onclick=async()=>{
  const code=selected;
  if(!watchFolders.length){
    const f=await newFolderFlow([code]);
    if(f){syncWatchUnion();feed&&feed.addCode(code);saveState();
      toast('buy','관심종목 추가',`${(byCode[code]&&byCode[code].name)||code} → ${f.icon?f.icon+' ':''}${f.name}`);
      updateStar();renderWatch();safeRun('mysum',renderMySum);safeRun('mysumtidy',tidyMySum);}
    return;
  }
  openFolderPop(code,$('starBtn'));
};
function updateStar(){const on=watchlist.includes(selected);$('starBtn').textContent=on?'★':'☆';$('starBtn').classList.toggle('on',on);}

/* 종목 상세 */
function renderDetail(){
  const s=byCode[selected];
  const _dq=dispQuote(selected)||{};
  const _px=_dq.price!=null?_dq.price:s.price, _pv=_dq.prevClose||s.prevClose;
  const has=_px!=null&&!!_pv;
  const diff=has?_px-_pv:0,p=has?diff/_pv*100:0,dir=has?dirOf(diff):'flat';
  $('dName').innerHTML=`${stockLogo(s.code,s.name,'lg')}${s.name}${mktTag(s.code,s.market)}`;
  $('dCode').innerHTML=s.code+' · '+(isFundLike(s.code)?'상장지수상품(ETF)':(s.market||mktCache[String(s.code).toUpperCase()]||'KRX'))+(function(){const cap=nxtCapability(s.code);
    if(cap===true)return NXTLIST.halted.has(s.code)
      ? ' <span class="nxt-badge halt" title="NXT 매매체결대상이지만 현재 매매거래정지 상태입니다">NXT 거래정지</span>'
      : ' <span class="nxt-badge" title="넥스트레이드 매매체결대상종목'+(NXTLIST.asOf?' · 기준일 '+NXTLIST.asOf:'')+'">NXT 가능</span>';
    return '';})();   // NXT 가능 종목만 배지. KRX 전용·확인 중은 배지 없음.
  $('dTags').innerHTML=(s.tags||[]).map(t=>`<span class="tag" style="margin:0">${t}</span>`).join('')
    +`<button class="memo-btn${stockMemos[s.code]?' has':''}" id="memoBtn">📝 메모${stockMemos[s.code]?'●':''}</button>`;
  const _mb=$('memoBtn');
  if(_mb)_mb.onclick=async(e)=>{e.stopPropagation();
    const v=await askMemo(s.name+' 메모',{value:stockMemos[s.code]||'',placeholder:'매수 이유, 목표가 근거 등을 남겨 두세요'});
    if(v===null)return;
    if(v.trim())stockMemos[s.code]=v.trim(); else delete stockMemos[s.code];
    saveState(); renderDetail();
  };
  const pe=$('dPrice');pe.textContent=has?KRW(_px):'—';pe.className='d-price num '+dir;
  // 대표 시세가 통합 시세임을 명시
  const uq=unifiedQuote(s.code), ex=exCache[s.code];
  safeRun('bells',updateDetailBells);
  const srcLab=$('dSrc');
  if(srcLab){
    const b=mktBadgeInfo(s.code);                        // [v2.0] 목록과 완전히 같은 세션 규칙
    srcLab.hidden=false;
    srcLab.textContent=b[0];
    srcLab.className='d-src '+b[1];
  }
  $('dChange').innerHTML=has?`<span class="${dir}"><span class="arrow">${arrow(dir)}</span> ${signed(diff)}</span><span class="${dir}">${pctS(p)}</span>`:'';
  const stats=[['거래량',has?KRW(s.volume)+'주':'—'],['거래대금',s.value!=null?KRW(s.value/1e8)+'억':'—'],
    ['시가',KRW(s.open)],['고가',`<span class="up">${KRW(s.high)}</span>`],['저가',`<span class="down">${KRW(s.low)}</span>`],
    ['전일종가',KRW(s.prevClose)],['상한가',s.prevClose?KRW(roundTick(s.prevClose*1.3)):'—'],['하한가',s.prevClose?KRW(roundTick(s.prevClose*0.7)):'—']];
  $('dStats').innerHTML=stats.map(([k,v])=>`<div class="st"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('');
  safeRun('exRow',renderExchangeRow);
  updateStar();
}

/* ===== 거래소별 시세 (통합 / KRX / NXT) =====
   KRX 정규장 밖에서는 KRX 시세가 전일 종가·0.00%로 고정돼 실제 체결(NXT)이 보이지 않는다.
   MTS처럼 세 거래소를 나란히 보여 준다. */
const exCache={}; let exTimer=null, exBusy=false;
try{window.__EXSET=(c,v)=>{exCache[c]=v;selected=c;};window.__NXTCACHE=(c,v)=>{NXTLIST.ready=true;if(v)NXTLIST.set.add(c);else NXTLIST.set.delete(c);if(byCode[c])byCode[c].nxt=!!v;};window.__NXTLIST=NXTLIST;}catch(e){}
const EX_DEFS=[['unified','통합','u'],['krx','KRX','k'],['nxt','NXT','n']];

function exBoxHtml(kind,label,cls,q,prevClose,state){
  /* [v4.10] 시장경보 일시중단 종목의 NXT 칸 — 상태를 이유와 함께 못 박는다 */
  if(kind==='nxt'&&state&&state.sus)
    return `<div class="ex-box ${cls} na sus"><span class="ex-b">${label}</span>
      <div class="ex-px na">⛔</div>
      <div class="ex-ch na"><b>NXT 매매 일시 중단</b></div>
      <div class="ex-v">${state.sus.label} · 해제 시 자동 복귀</div></div>`;
  if(!q||!q.price){
    // NXT 미취급 종목은 '조회 중'이 아니라 이유를 분명히 알려 준다
    if(kind==='nxt'&&state&&state.nxtSupported===false)
      return `<div class="ex-box ${cls} na"><span class="ex-b">${label}</span>
        <div class="ex-px num na">—</div>
        <div class="ex-ch na">KRX 전용 종목</div>
        <div class="ex-v">NXT 미취급 · 통합은 KRX만 반영</div></div>`;
    if(kind==='nxt'&&state&&state.nxtSupported===true)
      return `<div class="ex-box ${cls}"><span class="ex-b">${label}</span>
        <div class="ex-px num">—</div>
        <div class="ex-ch">NXT 거래 가능</div>
        <div class="ex-v">${nxtActive()?'아직 체결 없음':'NXT 거래시간 08:00~08:50 · 09:00:30~15:20 · 15:30~20:00'}</div></div>`;
    if(kind==='nxt'&&state&&state.loaded)
      return `<div class="ex-box ${cls} na"><span class="ex-b">${label}</span>
        <div class="ex-px num na">—</div>
        <div class="ex-ch na">NXT 체결 없음</div>
        <div class="ex-v">${nxtPending(selected)?'거래소 소속 확인 중':'취급 여부 판정 불가'}</div></div>`;
    const msg=(state&&state.loaded)?'확인 중…':'조회 중…';
    return `<div class="ex-box ${cls}"><span class="ex-b">${label}</span>
      <div class="ex-px num">—</div><div class="ex-ch num">${msg}</div></div>`;
  }
  const dir=dirOf(q.rate||0);
  const base=(prevClose||q.prevClose);
  const noTrade=(q.rate===0&&base&&q.price===base);
  // 장전 동시호가에는 KRX 칸에 '예상체결가'를 함께 보여 준다(NXT와 혼동 금지)
  let sub=noTrade?'체결 없음':(q.volume!=null?KRW(q.volume)+'주':'—');
  if(kind==='unified'&&state&&state.uniFromKrx)sub='<span class="ex-sus">KRX 시세 기준 · NXT 일시중단</span>';
  if(kind==='krx'&&noTrade&&state&&state.expected&&state.expected.price){
    const e=state.expected, ed=dirOf(e.rate||0);
    sub=`<span class="ex-exp ${ed}">예상 ${KRW(e.price)} (${pctS(e.rate||0)})</span>`;
  }
  return `<div class="ex-box ${cls} ${dir}">
    <span class="ex-b">${label}</span>
    <div class="ex-px num ${dir}">${KRW(q.price)}</div>
    <div class="ex-ch num ${dir}">${noTrade?'0':`${arrow(dir)} ${KRW(Math.abs(q.change))}`}
      <em>${pctS(q.rate||0)}</em></div>
    <div class="ex-v num">${sub}</div>
  </div>`;
}

/* ===== 종목별 NXT 판정 배치 =====
   전역 명단이 아직 없을 때, 각 종목의 '거래소 소속 신호'로 판정한다(/api/nxtcheck).
   NXT 장이 닫혀 있어도 동작한다. 결과는 캐시되어 재조회하지 않는다. */
const nxCkCache={}; let nxCkQueue=new Set(), nxCkTimer=null, nxCkInflight=false;
function queueNxtCheck(code){
  const c=String(code||'').toUpperCase();
  if(!/^[0-9A-Z]{6}$/.test(c)||c in nxCkCache)return;   // 이미 결과 있으면 재요청 안 함(무한루프 방지)
  nxCkQueue.add(c);
  if(!nxCkTimer&&!nxCkInflight)nxCkTimer=setTimeout(flushNxtCheck,120);
}
async function flushNxtCheck(){
  nxCkTimer=null;
  if(!nxCkQueue.size||NXTLIST.ready)return;
  const codes=[...nxCkQueue].slice(0,40); codes.forEach(c=>nxCkQueue.delete(c));
  nxCkInflight=true;
  try{
    const r=await fetch('/api/nxtcheck?codes='+codes.join(','));
    const j=await r.json(); const res=(j&&j.result)||{};
    codes.forEach(c=>{const v=res[c]; nxCkCache[c]=(v===true?true:v===false?false:null);
      if(byCode[c])byCode[c].nxt=nxCkCache[c];});
  }catch(e){ codes.forEach(c=>{ if(!(c in nxCkCache))nxCkCache[c]=null; }); }
  nxCkInflight=false;
  safeRun('nxtCheckPaint',()=>{ if(currentView==='search')renderSearch();
    else if(currentView==='trade'&&selected)renderDetail(); renderWatch(); });
  if(nxCkQueue.size&&!NXTLIST.ready)nxCkTimer=setTimeout(flushNxtCheck,120);
}

/* NXT 취급 여부의 단일 기준.
   우선순위: ①전역 명단 → ②실제 NXT 체결 관측 / 종목별 신호 → ③판정 불가(null).
   절대 KRX 전용으로 함부로 단정하지 않는다. */
/* NXT 거래가능 여부 — 넥스트레이드 공식 정기변경 명단(610종)이 정답이다.
   ① 공식 명단에 있으면 → 가능.
   ② 공식 명단에 없으면 → 불가. 단, 실제 NXT 체결이 관측되면(분기 중 신규 편입) 가능으로 인정.
   추측성 신호는 공식 명단을 절대 뒤집지 못한다. */
function nxtCapability(code){
  const c=String(code||'').toUpperCase();
  if(!c)return null;
  const st=byCode[c];
  if(NXTLIST.ready){
    if(NXTLIST.set.has(c))return true;                     // 공식 명단 = 확정 가능
    if(st&&st.nxtExec)return true;                         // 실제 NXT 체결 관측 = 분기 중 신규 편입
    return false;                                          // 공식 명단에 없음 = KRX 전용
  }
  // 명단을 아직 못 받은 동안만 보조 신호 사용
  if(st&&st.nxtExec)return true;
  const d=exCache[c];
  if(d&&d.nxtSupported===true)return true;
  if(d&&d.nxtSupported===false)return false;
  if(c in nxCkCache&&nxCkCache[c]!==null)return nxCkCache[c];
  loadNxtList(false); queueNxtCheck(c);
  return null;
}
/* 이 종목의 판정이 '아직 진행 중'인지(=배치 응답 대기) 여부.
   응답이 왔는데도 null 이면 신호를 못 얻은 것(→ 관리자 조치 안내). */
function nxtPending(code){
  const c=String(code||'').toUpperCase();
  if(NXTLIST.ready||NXTLIST.loading)return true;
  return !(c in nxCkCache);                            // 아직 배치 응답 전이면 진행 중
}
/* 명단 상태. 'ready'=명단 있음 / 'loading'=받는 중 / 'missing'=수집 실패, 관리자 조치 필요.
   'missing' 을 'loading' 처럼 보여 주면 영원히 안 끝나는 '확인 중'으로 오해된다. */
function nxtListState(){
  if(NXTLIST.ready)return 'ready';
  return NXTLIST.err?'missing':'loading';
}
/* 명단에서 최근 빠진 종목이면 이유를 알려 준다 */
function nxtRemovedNote(code){
  return NXTLIST.removed.has(String(code||'').toUpperCase())
    ? '넥스트레이드 매매제외 (거래량 요건 미달)' : '';
}

function renderExchangeRow(){
  const el=$('exRow'); if(!el)return;
  const s=byCode[selected];
  const d=exCache[selected];
  const prev=(d&&d.prevClose)||(s&&s.prevClose)||null;
  const cap=nxtCapability(selected);
  const state={loaded:!!d, nxtSupported:cap, expected:d?d.expected:null};
  const noNxt=(cap===false);
  if(cap===null)safeRun('capFetch',()=>ensureNxt(selected));   // 아직 모르면 확인 요청
  const boxes=Object.assign({},d||{});
  if(noNxt&&boxes.krx){boxes.unified={...boxes.krx};boxes.nxt=null;}   // KRX 전용일 때만 통합=KRX
  /* [v4.10] 시장경보로 NXT가 일시 중단된 종목:
     · NXT 칸 → "매매 일시 중단 + 사유" (예전엔 '체결 없음'으로만 떠서 오류처럼 보였다)
     · 통합 칸 → 해제 전까지 KRX 시세를 그대로 반영 (중단 중 통합가는 KRX가 곧 정답) */
  const _sus=nxtSuspendInfo(selected);
  el.innerHTML=EX_DEFS.map(([k,label,cls])=>{
    const q=(k==='unified'&&_sus&&boxes.krx&&boxes.krx.price)?boxes.krx:(boxes[k]||null);
    return exBoxHtml(k,label,cls,q,prev,Object.assign({},state,{sus:_sus,uniFromKrx:(k==='unified'&&!!_sus)}));
  }).join('')
    +`<div class="ex-note">${
      _sus?('⛔ <b>'+_sus.label+'</b> — 넥스트레이드 규정상 NXT 매매가 일시 중단되어, 해제 전까지 <b>통합 시세는 KRX만</b> 반영합니다. 사유 해소 시 자동 복귀합니다.')
      :cap===null?(nxtPending(selected)
        ?'거래소 소속을 확인하는 중입니다…'
        :'<b>거래소 소속 신호를 얻지 못했습니다.</b> 추측 대신 표시를 보류합니다. <code>/api/nxtrefresh?run=1</code> 로 갱신하거나, <code>/api/nxtadmin</code> 에 명단을 등록하세요.')
      :noNxt?('이 종목은 <b>NXT 미취급(KRX 전용)</b>입니다. '+(nxtRemovedNote(selected)||'넥스트레이드 매매체결대상종목이 아니라')+' 통합 시세에 KRX만 반영됩니다.'+(NXTLIST.asOf?' <span class="ex-asof">명단 기준일 '+NXTLIST.asOf+'</span>':''))
      :krxRegularOpen()?'KRX 정규장 · 세 시세가 함께 갱신됩니다.'
      :nxtOnlyWindow()?'KRX 정규장 밖이라 KRX는 전일 종가로 고정됩니다. 실제 체결은 NXT에서 이뤄집니다.'
      :'장 마감 · 최종 종가 기준'}</div>`;
}
// 종목 대표 시세 = 통합 시세 (없으면 KRX)
function unifiedQuote(code){
  const d=exCache[code];
  if(d&&d.unified&&d.unified.price)return d.unified;
  if(d&&d.krx&&d.krx.price)return d.krx;
  return null;
}

async function loadExchange(code){
  if(!code||exBusy)return;
  exBusy=true;
  try{
    fnBump();
    const sess=nxtOnlyWindow()?'nxtonly':krxRegularOpen()?'regular':'closed';
    const r=await fetch('/api/exchange?code='+code+'&session='+sess,{cache:'default'});
    const j=await r.json();
    if(j&&j.ok)exCache[code]={unified:j.unified,krx:j.krx,nxt:j.nxt,expected:j.expected,
      prevClose:j.prevClose, nxtSupported:(j.nxtSupported===true?true:j.nxtSupported===false?false:null),
      nxtEvidence:j.nxtEvidence||null};
    /* [삭제] /api/exchange 의 시세 트리로 취급 여부를 확정하던 코드 제거.
       이제 서버도 명단으로 nxtSupported 를 계산하므로 여기서 덮어쓸 필요가 없다. */
    // [변경] 종목 대표 시세는 항상 '통합 시세' 기준으로 표시한다
    const st=byCode[code], u=unifiedQuote(code);
    if(st&&u&&u.price){
      /* [수정] 예전엔 여기서 st.price 를 통합시세로 덮어썼고, 직후 KRX 폴링이 되돌려
         가격이 깜빡였다. 이제 원본은 건드리지 않고 표시는 dispQuote 가 결정한다. */
      st.unified=true;
      st.nxtLive=!!(j&&j.nxt&&j.nxt.price&&!krxRegularOpen());
      safeRun('exDetail',()=>{
        if(selected===code&&currentView==='trade'){renderDetail();syncPriceField(true);}
        renderWatch(); renderPortfolioNumbers();
      });
    }
  }catch(e){}
  exBusy=false;
  if(selected===code)safeRun('exRow',renderExchangeRow);
}
function scheduleExchange(){
  clearTimeout(exTimer);
  /* [v3.9] 동시호가에도 예상체결가가 계속 바뀌므로 빠른 주기를 쓴다 */
  const _k=krSession();
  const iv=krxRegularOpen()?5000:(_k.krx.phase&&_k.krx.phase!==KRS.AFT_SINGLE?6000:0)||(nxtOnlyWindow()?6000:(_k.krx.tradable?20000:60000));
  exTimer=setTimeout(()=>{
    if(currentView==='trade'&&selected&&!document.hidden)safeRun('exLoad',()=>loadExchange(selected));
    scheduleExchange();
  },iv);
}

/* ===== 투자자별 · 컨센서스 · 재무 ===== */
const fundCache={};let infoTab='summary',curFund=null,finKind='income',invExpanded=false;
/* ===== ETF 전용 정보 ===== */
const etfCache={};let curEtf=null;
function loadEtf(code){
  if(etfCache[code]){curEtf=etfCache[code];return Promise.resolve(curEtf);}
  return fetch('/api/etf?code='+encodeURIComponent(code)).then(r=>r.json()).then(j=>{
    etfCache[code]=j;if(selected===code)curEtf=j;
    // 보유 종목 등락률을 함께 보여주기 위해 구성종목 시세를 미리 받아둔다
    const hc=(j&&j.holdings||[]).map(h=>h.code).filter(c=>/^[0-9A-Z]{6}$/.test(c||''));
    if(hc.length){(j&&j.holdings||[]).forEach(h=>{if(/^[0-9A-Z]{6}$/.test(h.code||''))ensureStock(h.code,h.name||'','');});primeQuotes(hc.slice(0,25));}
    if(selected===code&&currentView==='trade'&&(infoTab==='etf'||infoTab==='summary'))renderInfo();
    if(selected===code&&currentView==='trade'&&infoTab==='ai')renderAiStock($('infoBody'),true);
    return j;
  }).catch(()=>{etfCache[code]={ok:false,metrics:{},info:{},holdings:[],similar:[],diag:{err:'fetch'}};return etfCache[code];});
}
const EN=(v,d=0)=>v==null?'—':Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const EPCT=(v,d=2)=>v==null?'—':(v>0?'+':'')+Number(v).toFixed(d)+'%';
function eokWon(v){ // 억원 → 조/억 표기
  if(v==null)return '—';
  if(v>=10000){const jo=Math.floor(v/10000),eok=Math.round(v%10000);return `${jo}조${eok?EN(eok)+'억':''}원`;}
  return EN(v)+'억원';
}
function etfMetricCards(m,diag){
  const navStale=(diag&&diag.navStale==='y')&&!m.navLive;
  const cells=[['시가총액',eokWon(m.marketSum)],[navStale?'순자산가치(NAV) · 전일':'순자산가치(NAV)',m.nav==null?'—':EN(m.nav,2)+'원'],
    ['배수',m.leverage==null?'+1배':(m.leverage>0?'+':'')+m.leverage+'배'],
    ['괴리율',m.disparity==null?(navStale?'확인 불가':'—'):EPCT(m.disparity)],
    ['3개월 수익률',m.m3==null?'—':EPCT(m.m3)],['보수율',m.fee==null?'—':Number(m.fee).toFixed(2)+'%']];
  return `<div class="etf-cards">${cells.map(([k,v])=>`<div class="etf-card"><div class="etf-card-k">${k}</div><div class="etf-card-v num">${v}</div></div>`).join('')}</div>`;
}
function etfHoldingsEmpty(kind){
  // 선물·채권형 등은 개별 주식을 담지 않으므로 '없음'이 정상 — 사유를 구분해 안내한다.
  const M={
    derivative:['개별 주식을 보유하지 않는 상품입니다','이 ETF는 지수 <b>선물·스왑 등 파생상품</b>으로 수익률을 만듭니다. 그래서 삼성전자처럼 개별 종목을 담고 있지 않아 보유 종목 비중이 존재하지 않습니다.'],
    bond:['채권으로 구성된 상품입니다','이 ETF는 <b>국공채·통안채 등 채권</b>에 투자하므로 주식 구성종목이 없습니다. 듀레이션·신용등급이 핵심 지표입니다.'],
    money:['단기 금리에 투자하는 상품입니다','이 ETF는 <b>CD·KOFR 등 단기 금리</b>를 추종해 개별 주식을 담지 않습니다.'],
    commodity:['실물 자산에 투자하는 상품입니다','이 ETF는 <b>금·은·원유 등 실물(현물·선물)</b>에 투자하므로 주식 구성종목이 없습니다.'],
    tdf:['생애주기 자산배분(TDF) 상품입니다','은퇴 시점에 맞춰 <b>주식·채권 비중을 자동으로 조절</b>하는 상품이라, 특정 시점의 주식 구성종목만 따로 표시하지 않습니다.'],
    mixed:['주식과 채권을 함께 담는 혼합형입니다','지수 편입 주식과 국채를 정해진 비율로 함께 보유하는 <b>혼합형 상품</b>이라, 주식 구성종목만 따로 표시하지 않습니다.'],
  };
  const m=M[kind];
  if(m)return `<div class="etf-sec-t">보유 종목 비중</div><div class="etf-empty">${m[0]}<br><span>${m[1]}</span></div>`;
  return `<div class="etf-sec-t">보유 종목 비중</div>
    <div class="etf-empty">구성종목(PDF) 정보를 제공하지 못했습니다.<br>
    <span>정확하지 않은 값을 표시하지 않기 위해, 구성종목이 확실히 확인될 때만 노출합니다.
    구성종목은 운용사 공시 자료나 증권사 앱에서 확인하실 수 있습니다.</span></div>`;
}
let etfHoldOpen=false;
function etfHoldingsHtml(list,limit,diag,proxy,kind,complete,totalW,cnt){
  if(!list||!list.length)return etfHoldingsEmpty(kind);
  const lim=etfHoldOpen?list.length:limit;
  const top=list.slice(0,lim);
  const top10=list.slice(0,10).reduce((a,b)=>a+(b.weight||0),0);
  // 비중 합이 100%에 못 미치면 '상위 N종목'만 받은 것 — 전체라고 표시하지 않는다.
  const isComplete=complete===true;
  const partial=!isComplete;
  const isDom=proxy&&/^[0-9A-Z]{6}$/.test(String(proxy.symbol||''));
  const pnote=proxy?`<div class="etf-proxy">이 ETF는 <b>${proxy.label}</b>을(를) 추종합니다. ${isDom?'선물·파생으로 운용되거나 구성종목이 공개되지 않아':'운용사 구성종목(PDF)이 공개되지 않아'}, <b>같은 지수를 추종하는 대표 ETF(${proxy.symbol})</b>의 구성으로 표시합니다. 실제 편입 비중과 차이가 있을 수 있습니다.</div>`:'';
  return `<div class="etf-sec-t">보유 종목 비중</div>${pnote}
    <div class="etf-stat2"><div class="etf-stat"><div class="etf-stat-k">보유 종목수</div><div class="etf-stat-v num">${cnt!=null?cnt:(isComplete?list.length:list.length+'+')}</div></div>
      <div class="etf-stat"><div class="etf-stat-k">표시 종목 비중 합계</div><div class="etf-stat-v num">${(totalW!=null?totalW:top10).toFixed(1)}%</div></div></div>
    ${!isComplete?`<div class="etf-partial">데이터 출처(네이버 금융)가 <b>상위 ${Math.min(list.length,limit)}종목까지만 공개</b>하여 그대로 표시합니다. ${cnt!=null?`나머지 <b>${Math.max(0,cnt-list.length)}종목</b>과 `:''}표시되지 않은 ${Math.max(0,100-(totalW!=null?totalW:top10)).toFixed(1)}%에는 소액 편입분·현금성 자산이 포함되며, <b>운용사 공시(PDF)</b>에서 전체 구성종목을 확인하실 수 있습니다.</div>`:''}
    <div class="etf-hold">${top.map((h,i)=>{
      const st=byCode[h.code];const dir=st&&st.price!=null&&st.prevClose?dirOf(st.price-st.prevClose):'flat';
      const chg=st&&st.price!=null&&st.prevClose?pctS((st.price-st.prevClose)/st.prevClose*100):'';
      /* [v4.26] 종목명 왼쪽에 로고 — 목록에서 종목을 눈으로 바로 집을 수 있게 */
      return `<div class="etf-hold-r"><div class="etf-hold-n"><span class="ehr-i num">${i+1}</span>${stockLogo(h.code,h.name,'xs')}<b>${h.name}</b>${chg?`<span class="num ${dir}" style="margin-left:8px;font-size:12px">${chg}</span>`:''}</div>
        <div class="etf-hold-w"><div class="etf-bar"><i style="width:${Math.min(100,(h.weight||0))}%"></i></div><span class="num">${(h.weight||0).toFixed(2)}%</span></div></div>`;}).join('')}</div>
    ${list.length>limit?`<button class="etf-more" id="etfMore">${etfHoldOpen?'접기 ▲':`더보기 (${isComplete?'전체':'상위'} ${list.length}종목) ▼`}</button>`:''}`;
}
function etfSimilarHtml(sim){
  if(!sim||!sim.length)return '';
  return `<div class="etf-sec-t">유사한 ETF 비교</div>
    <div class="etf-sim-h"><span>ETF명</span><span>등락률</span><span>3개월</span><span>순자산</span></div>
    ${sim.map(s=>`<div class="etf-sim-r" data-code="${s.code}"><span class="etf-sim-n">${s.name}</span>
      <span class="num ${dirOf(s.changeRate)}">${s.changeRate==null?'—':EPCT(s.changeRate)}</span>
      <span class="num ${dirOf(s.m3)}">${s.m3==null?'—':EPCT(s.m3)}</span>
      <span class="num">${eokWon(s.marketSum)}</span></div>`).join('')}`;
}
function etfPortfolioHtml(list,sectors){
  if(sectors&&sectors.length){
    const rows=sectors.slice().sort((a,b)=>b.weight-a.weight).slice(0,8);
    const tot=rows.reduce((a,b)=>a+b.weight,0)||1;
    return `<div class="etf-sec-t">포트폴리오 구성 <span class="etf-sub">섹터 비중</span></div>
      <div class="etf-hold">${rows.map(r=>`<div class="etf-hold-r"><div class="etf-hold-n">${r.name}</div>
        <div class="etf-hold-w"><div class="etf-bar"><i style="width:${Math.min(100,r.weight/tot*100)}%"></i></div><span class="num">${r.weight.toFixed(1)}%</span></div></div>`).join('')}</div>`;
  }
  if(!list||!list.length)return '';
  // 보유 종목을 앱이 아는 섹터로 묶어 구성 비중 표시(모르면 기타)
  const secOf={};for(const [name,codes] of Object.entries(SECTORS))codes.forEach(c=>secOf[c]=name);
  const agg={};list.forEach(h=>{const s=(h.code&&secOf[h.code])||'기타';agg[s]=(agg[s]||0)+(h.weight||0);});
  const rows=Object.entries(agg).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const tot=rows.reduce((a,b)=>a+b[1],0)||1;
  return `<div class="etf-sec-t">포트폴리오 구성 <span class="etf-sub">보유 비중 기준</span></div>
    <div class="etf-hold">${rows.map(([k,v])=>`<div class="etf-hold-r"><div class="etf-hold-n">${k}</div>
      <div class="etf-hold-w"><div class="etf-bar"><i style="width:${Math.min(100,v/tot*100)}%"></i></div><span class="num">${v.toFixed(1)}%</span></div></div>`).join('')}</div>`;
}
function renderEtfSummary(el){
  const e=curEtf;
  if(!e){el.innerHTML='<div class="empty">ETF 정보 불러오는 중…</div>';return;}
  const s=byCode[selected]||{};
  const m=Object.assign({},e.metrics||{});
  if(m.price==null&&s.price!=null)m.price=s.price;
  // ETF 전용 블록(주요지표 · 보유종목 비중 · 포트폴리오 구성 · 유사 ETF)
  let etfBlocks=`<div class="etf-sec-t">주요 지표</div>`+etfMetricCards(m,e.diag);
  etfBlocks+=etfHoldingsHtml(e.holdings,10,e.diag,e.holdingsProxy,e.holdingsKind,e.holdingsComplete,e.holdingsTotalWeight,e.holdingsCount);
  etfBlocks+=etfPortfolioHtml(e.holdings,e.sectors);
  etfBlocks+=etfSimilarHtml(e.similar);
  // 일반 종목과 동일한 코너(연간 가격 변화·기간별 수익률·최근 현황·기본정보·투자자별 순매수)도 함께 표시
  if(curFund&&curFund.code===selected){renderSummary(el,etfBlocks);}
  else{
    {const _eq=dispQuote(selected),_ep=(_eq&&_eq.price!=null)?_eq.price:s.price;   // [수정] ETF도 헤더와 동일 통합가
    el.innerHTML=`<div class="sum-price"><div class="sp-now num">${KRW(_ep)}<span class="sp-won">원</span></div></div>`+etfBlocks;}
    if(!curFund)loadFundamentals(selected);
  }
  el.querySelectorAll('.etf-sim-r').forEach(r=>r.onclick=()=>{const c=r.dataset.code;if(!c)return;
    const nm=(((curEtf&&curEtf.similar)||[]).find(x=>x.code===c)||{}).name||r.dataset.name||'';
    ensureStock(c,nm,'','ETF');openTrade(c);});
  bindEtfMore(el);
  if(e.diag)el.insertAdjacentHTML('beforeend',`<div style="margin-top:14px;font-size:10px;color:#b3bcca;word-break:break-all">진단 ETF ${Object.entries(e.diag).map(([k,v])=>k+':'+v).join(' · ')}</div>`);
}
function bindEtfMore(el){const b=el.querySelector('#etfMore');if(b)b.onclick=()=>{etfHoldOpen=!etfHoldOpen;renderInfo();};}
function renderEtfInfo(el){
  const e=curEtf;
  if(!e){el.innerHTML='<div class="empty">ETF 정보 불러오는 중…</div>';return;}
  const m=e.metrics||{},i=e.info||{};
  const rows=[['기초지수',i.indexName||'—'],['운용사',i.company||'—'],['분류',i.category||'—'],
    ['설정일',i.listedDate||'—'],['NAV',m.nav==null?'—':EN(m.nav,2)+'원'],['괴리율',m.disparity==null?'—':EPCT(m.disparity)],
    ['추적오차',m.trackingError==null?'N/A':Number(m.trackingError).toFixed(2)],['레버리지 배율',m.leverage==null?'+1배':(m.leverage>0?'+':'')+m.leverage+'배'],
    ['보수율',m.fee==null?'—':Number(m.fee).toFixed(2)+'%']];
  const tr=[['거래량',m.volume==null?'—':EN(m.volume)+'주'],['거래대금',m.value==null?'—':EN(m.value)+'백만원'],
    ['시가총액',eokWon(m.marketSum)],['3개월 수익률',m.m3==null?'—':EPCT(m.m3)],['당일 등락률',m.changeRate==null?'—':EPCT(m.changeRate)]];
  let html=`<div class="etf-sec-t">기본 정보</div><div class="etf-kv">${rows.map(([k,v])=>`<div class="etf-kv-r"><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>`;
  html+=`<div class="etf-sec-t">거래 정보</div><div class="etf-kv">${tr.map(([k,v])=>`<div class="etf-kv-r"><span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>`;
  html+=etfHoldingsHtml(e.holdings,10,e.diag,e.holdingsProxy,e.holdingsKind,e.holdingsComplete,e.holdingsTotalWeight,e.holdingsCount).replace('보유 종목 비중','포트폴리오 구성종목');
  html+=etfPortfolioHtml(e.holdings,e.sectors);
  html+=etfSimilarHtml(e.similar);
  el.innerHTML=html;
  el.querySelectorAll('.etf-sim-r').forEach(r=>r.onclick=()=>{const c=r.dataset.code;if(!c)return;
    const nm=(((curEtf&&curEtf.similar)||[]).find(x=>x.code===c)||{}).name||r.dataset.name||'';
    ensureStock(c,nm,'','ETF');openTrade(c);});
  bindEtfMore(el);
  if(e.diag)el.insertAdjacentHTML('beforeend',`<div style="margin-top:14px;font-size:10px;color:#b3bcca;word-break:break-all">진단 ETF ${Object.entries(e.diag).map(([k,v])=>k+':'+v).join(' · ')}</div>`);
}
const eok=(v)=>{const n=Number(v);if(isNaN(n))return v??'—';const a=Math.abs(n);if(a>=1e8)return(n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억';if(a>=1e4)return Math.round(n).toLocaleString('ko-KR');return n.toLocaleString('ko-KR');};
const sgn=(v)=>{const n=Number(v);if(isNaN(n))return'flat';return n>0?'up':n<0?'down':'flat';};
document.querySelectorAll('.info-tabs button').forEach(b=>b.onclick=()=>{infoTab=b.dataset.info;document.querySelectorAll('.info-tabs button').forEach(x=>x.classList.toggle('on',x===b));renderInfo();});
async function loadFundamentals(code){
  if(fundCache[code]){curFund=fundCache[code];renderInfo();return;}
  curFund=null;$('infoBody').innerHTML='<div class="empty">불러오는 중…</div>';
  const base={code};
  // 재무·컨센서스와 투자자별을 각각 독립 호출(한쪽이 느려도 다른 쪽은 표시)
  const pf=fetch(`/api/fundamentals?code=${code}`,{cache:'default'}).then(r=>r.json()).catch(e=>({_diag:{err:String(e)}}));
  const pi=fetch(`/api/investors?code=${code}`,{cache:'default'}).then(r=>r.json()).catch(e=>({investors:{error:String(e)}}));
  const [f,i]=await Promise.all([pf,pi]);
  const merged={...base,...f,investors:(i&&i.investors)||{error:'no-response'}};
  fundCache[code]=merged;
  if(selected===code){curFund=merged;renderInfo();}
}
function renderInfo(){
  const el=$('infoBody'),cc=$('chartCard');
  if(infoTab==='chart'){
    if(cc)cc.hidden=false; el.style.display='none';
    requestAnimationFrame(()=>requestAnimationFrame(()=>drawChart()));
    return;
  }
  if(cc)cc.hidden=true; el.style.display='';
  if(infoTab==='sise'){renderSise(el);return;}
  if(infoTab==='news'){renderNews(el);return;}
  if(infoTab==='ai'){renderAiStock(el);return;}
  const etfMode=isFundLike(selected);
  if(etfMode){
    if(!etfCache[selected])loadEtf(selected); else curEtf=etfCache[selected];
    if(infoTab==='etf'){renderEtfInfo(el);return;}
    if(infoTab==='summary'){renderEtfSummary(el);return;}
  }
  // ETF·ETN은 기업 재무제표·실적 컨센서스가 존재하지 않음 → 오류가 아닌 안내로 표시
  if(etfMode&&(infoTab==='finance'||infoTab==='consensus')){
    const s=byCode[selected]||{};
    el.innerHTML=`<div class="etf-note">
      <div class="etf-note-t">${infoTab==='finance'?'ETF·ETN은 재무제표가 없습니다':'ETF·ETN은 실적 컨센서스가 없습니다'}</div>
      <div class="etf-note-d">${s.name||selected}은(는) 개별 기업이 아니라 여러 종목을 담은 <b>상장지수상품</b>이라, 손익계산서·재무상태표나 증권사 목표주가가 제공되지 않습니다.<br>
      대신 <b>ETF정보 · 종목요약 · 차트 · 시세 · 뉴스</b> 탭에서 구성종목·NAV·보수율과 가격 정보를 확인하실 수 있습니다.</div>
    </div>`;
    return;
  }
  if(!curFund){el.innerHTML='<div class="empty">불러오는 중…</div>';return;}
  if(infoTab==='summary')renderSummary(el);
  else if(infoTab==='investor')renderInvestor(el);
  else if(infoTab==='consensus')renderConsensus(el);
  else renderFinance(el);
  const d=curFund._diag,inv=curFund.investors;
  const parts=[];
  if(d){if(infoTab!=='summary'){if(d.nvErr)parts.push('손익:'+d.nvErr);if(d.yhErr)parts.push('재무상태/현금:'+d.yhErr);if(d.igErr)parts.push('지표:'+d.igErr);}if(infoTab==='consensus'&&d.brokers)parts.push('증권사:'+d.brokers);}
  if(infoTab==='summary'&&!NXTLIST.ready)parts.push('NXT명단:'+(NXTLIST.err||'로딩중'));
  if(inv&&inv.error&&infoTab!=='summary')parts.push('투자자:'+inv.error);
  if(parts.length)el.insertAdjacentHTML('beforeend',`<div style="margin-top:14px;font-size:10px;color:#b3bcca;text-align:left;word-break:break-all;white-space:pre-wrap;line-height:1.6">진단 ${parts.join(' · ')}</div>`);
}
const intFmt=(v)=>{const n=Number(v);if(isNaN(n))return v==null?'—':v;return(n>0?'+':'')+n.toLocaleString('ko-KR');};
// ── 종목요약 ──
const _sumDaily={};
async function ensureDailySummary(code){
  if(_sumDaily[code])return _sumDaily[code];
  if(candleCache[code+':D']&&candleCache[code+':D'].length){_sumDaily[code]=candleCache[code+':D'];return _sumDaily[code];}
  try{const r=await fetch(`/api/chart?code=${code}&tf=D`,{cache:'default'});const j=await r.json();_sumDaily[code]=(j&&j.candles)||[];}catch{_sumDaily[code]=[];}
  return _sumDaily[code];
}
function sumStat(labels){const st=(curFund&&curFund.stats)||[];for(const L of labels){const hit=st.find(s=>s.label&&s.label.replace(/\s/g,'').includes(L));if(hit)return hit.value;}return null;}
function sumStatNum(labels){const v=sumStat(labels);return v==null?null:numish2(v);}
function barsSigned(items){ // [{name,val}] 상승 빨강↑ 하락 파랑↓
  const max=Math.max(1,...items.map(i=>Math.abs(i.val||0)));
  return `<div class="sbar-wrap">${items.map(i=>{const v=i.val||0,h=Math.round(Math.abs(v)/max*66),up=v>=0;
    return `<div class="sbar-col"><div class="sbar-top">${up?`<div class="sbar-val up">${intFmt(v)}</div><div class="sbar up" style="height:${h}px"></div>`:''}</div>
    <div class="sbar-base"></div>
    <div class="sbar-bot">${!up?`<div class="sbar down" style="height:${h}px"></div><div class="sbar-val down">${intFmt(v)}</div>`:''}</div>
    <div class="sbar-nm">${i.name}</div></div>`;}).join('')}</div>`;
}
const SECTOR_DESC={'반도체':'메모리·시스템 반도체를 설계·생산하는','2차전지':'전기차·ESS용 2차전지와 소재를 만드는','바이오':'바이오의약품·신약을 개발·생산하는','자동차':'완성차와 자동차 부품을 제조·판매하는','인터넷':'검색·커머스·콘텐츠 플랫폼을 운영하는','금융':'은행·보험·증권 등 금융 서비스를 제공하는','철강':'철강·소재를 생산하는','화학':'석유화학·정밀화학 제품을 생산하는','가전':'생활가전·전자제품을 제조·판매하는','통신':'이동통신·네트워크 서비스를 제공하는','전자부품':'전자부품·모듈을 생산하는','해운':'컨테이너·벌크 해상운송을 하는','비철금속':'아연·연 등 비철금속을 제련하는','게임':'모바일·PC 게임을 개발·서비스하는','엔터':'아티스트 매니지먼트·음악 등 엔터테인먼트 사업을 하는','조선':'선박·해양플랜트를 건조하는','IT':'IT 서비스·시스템 통합(SI)을 제공하는','음식료':'식품·음료를 제조·판매하는','제약':'의약품을 개발·생산하는','반도체장비':'반도체 제조 장비·부품을 공급하는','건설':'토목·건축·플랜트를 시공하는','정유':'원유 정제·석유제품을 생산하는','상사':'글로벌 무역·자원개발 사업을 하는','디스플레이':'OLED·LCD 패널을 생산하는','방산':'방위산업·항공우주 제품을 생산하는','지주':'계열사를 지배·관리하는 지주회사','발전':'발전설비·에너지 사업을 하는','에너지':'전력·에너지 사업을 하는'};
function marketInfo(code){
  const v=sumStat(['거래시장','시장구분','시장']);
  if(v&&/코스닥|KOSDAQ/i.test(v))return {label:'코스닥',bench:'KOSDAQ'};
  if(v&&/코스피|KOSPI|유가/i.test(v))return {label:'코스피',bench:'KOSPI'};
  const KQ=new Set(['247540','086520','196170','293490','041510','068760','058470','035900']);
  const cached=mktCache[String(code).toUpperCase()];
  if(cached==='코스닥')return {label:'코스닥',bench:'KOSDAQ'};
  if(cached==='코스피')return {label:'코스피',bench:'KOSPI'};
  if(cached==='코넥스')return {label:'코넥스',bench:'KOSPI'};
  if(!KQ.has(code))resolveMarket(code);
  return KQ.has(code)?{label:'코스닥',bench:'KOSDAQ'}:{label:'코스피',bench:'KOSPI'};
}
const fmtEokJo=(eokVal)=>{if(eokVal==null)return '';const a=Math.abs(eokVal);if(a>=10000)return (eokVal/10000).toLocaleString('ko-KR',{maximumFractionDigits:1})+'조원';return Math.round(eokVal).toLocaleString('ko-KR')+'억원';};
const BIZ_DESC={
'005930':'글로벌 종합 전자기업으로 스마트폰(갤럭시)·TV·생활가전 등 세트 제품과 DRAM·NAND Flash·모바일 AP 등 반도체, 시스템반도체 파운드리, 스마트폰용 OLED 패널을 생산·판매합니다. 반도체(DS)와 디바이스경험(DX) 부문이 실적의 양대 축입니다.',
'000660':'DRAM과 NAND Flash를 중심으로 한 메모리 반도체를 주력으로 생산하는 글로벌 반도체 기업입니다. 특히 AI 서버용 고대역폭 메모리(HBM) 시장을 선도하고 있으며, 낸드 자회사 솔리다임을 두고 있습니다.',
'373220':'전기차·ESS·IT기기용 리튬이온 2차전지를 개발·생산하는 글로벌 배터리 기업입니다. LG화학에서 분사했으며, 완성차 업체들과의 합작 공장을 통해 생산능력을 확대하고 있습니다.',
'207940':'바이오의약품 위탁개발생산(CDMO) 세계 1위 기업입니다. 대규모 생산설비를 기반으로 글로벌 제약사의 항체의약품을 위탁 생산하며, 자회사 삼성바이오에피스를 통해 바이오시밀러도 개발합니다.',
'005380':'국내 1위 완성차 제조사로 승용·상용차와 고급 브랜드 제네시스를 생산·판매합니다. 전기차·수소차 등 친환경차와 자율주행·로보틱스(보스턴다이내믹스)로 사업을 확장하고 있습니다.',
'000270':'현대차그룹 계열 완성차 기업으로 승용차·SUV·상용차를 생산·판매합니다. 최근 전기차 전용 모델(EV 시리즈)과 목적기반차량(PBV) 사업에 주력하고 있습니다.',
'035420':'국내 1위 검색 포털을 기반으로 광고·커머스·핀테크(네이버페이)·콘텐츠(웹툰)·클라우드 사업을 운영하는 인터넷 기업입니다. AI 검색과 커머스 통합을 추진하고 있습니다.',
'035720':'국민 메신저 카카오톡을 기반으로 광고·커머스·모빌리티·핀테크(카카오페이·뱅크)·콘텐츠(웹툰·게임) 사업을 하는 플랫폼 기업입니다.',
'068270':'항체 바이오시밀러를 개발·생산·판매하는 바이오 기업입니다. 램시마·트룩시마·허쥬마 등 자가면역·항암 바이오시밀러가 주력이며, 셀트리온헬스케어와 합병해 개발·판매를 일원화했습니다.',
'005490':'포스코그룹의 지주회사로 철강(포스코)을 핵심 사업으로 두고, 2차전지 소재(리튬·양극재)와 수소 등 신사업을 그룹 차원에서 추진합니다.',
'105560':'KB국민은행을 중심으로 증권·보험·카드를 아우르는 국내 대표 금융지주회사입니다.',
'055550':'신한은행을 중심으로 증권·카드·생명보험 등 다양한 계열사를 보유한 국내 대형 금융지주회사입니다.',
'012330':'현대차그룹의 자동차 부품 계열사로 모듈·핵심부품과 전동화(전기차 구동)·전장 부품, A/S 부품을 공급합니다.',
'006400':'전기차·ESS용 2차전지와 반도체·디스플레이용 전자재료를 생산하는 기업으로, 각형 배터리에 강점이 있습니다.',
'051910':'석유화학을 기반으로 첨단소재(2차전지 양극재)와 생명과학(제약) 사업을 하는 종합 화학기업입니다. LG에너지솔루션의 모회사입니다.',
'028260':'삼성그룹의 사실상 지주 역할을 하며 건설·상사·패션·리조트·급식 사업과 삼성바이오로직스 지분을 보유하고 있습니다.',
'015760':'국내 전력의 송·배전과 판매를 담당하는 공기업입니다. 발전 자회사를 통해 원자력·화력 등 전력을 생산하며, 전기요금과 연료비 변동에 실적이 크게 좌우됩니다.',
'032830':'국내 1위 생명보험사로 보험·자산운용을 하며, 삼성전자 지분을 보유해 그룹 지배구조의 핵심 역할을 합니다.',
'066570':'TV·생활가전(냉장고·세탁기·에어컨)을 중심으로 전장(자동차 부품)·B2B 솔루션 사업을 하는 글로벌 가전기업입니다.',
'017670':'국내 1위 이동통신사로 무선·유선통신을 기반으로 AI(에이닷)·데이터센터·클라우드 사업을 확장하고 있습니다.',
'030200':'유·무선 통신을 기반으로 미디어(IPTV)·클라우드·AI·부동산 사업을 하는 종합 정보통신기업입니다.',
'009150':'스마트폰·전장용 적층세라믹콘덴서(MLCC)와 카메라 모듈, 반도체 패키지 기판을 생산하는 전자부품 기업입니다.',
'011200':'국내 최대 컨테이너 선사로 글로벌 해상 화물운송 서비스를 제공합니다. 컨테이너 운임지수(SCFI)에 실적이 크게 좌우됩니다.',
'010130':'아연·연·금·은 등 비철금속을 제련하는 세계적 제련기업으로, 2차전지 소재와 신재생에너지로 사업을 확장하고 있습니다.',
'259960':'글로벌 흥행작 배틀그라운드(PUBG)를 서비스하는 게임기업으로, 신작 개발과 IP 확장에 주력합니다.',
'086790':'하나은행을 중심으로 증권·카드 등을 보유한 국내 대형 금융지주회사입니다.',
'012450':'항공기 엔진과 자주포(K9)·장갑차 등 지상 방산, 우주발사체 사업을 하는 방산·항공우주 기업입니다.',
'009540':'HD현대 조선부문의 중간지주로 현대중공업·현대삼호중공업·현대미포조선을 자회사로 둔 세계적 조선그룹입니다.',
'247540':'2차전지 핵심소재인 하이니켈 양극재를 생산하는 기업으로, 에코프로 그룹 양극재 사업의 핵심 계열사입니다.',
'086520':'2차전지 양극재 소재(전구체·리튬 등) 밸류체인을 보유한 지주회사로, 에코프로비엠 등을 자회사로 둡니다.',
'196170':'바이오의약품을 피하주사(SC) 제형으로 바꾸는 플랫폼 기술(ALT-B4)을 보유한 바이오기업으로, 글로벌 제약사에 기술을 라이선스합니다.',
'293490':'모바일·PC 게임을 개발·퍼블리싱하는 카카오 계열 게임기업입니다.',
'352820':'방탄소년단(BTS) 등 아티스트 매니지먼트를 중심으로 음악·팬 플랫폼(위버스) 사업을 하는 엔터테인먼트 기업입니다.',
'041510':'SM엔터테인먼트로, 아이돌 아티스트 매니지먼트와 음반·콘텐츠 제작을 하는 엔터테인먼트 기업입니다.',
'035900':'아이돌 그룹을 육성·매니지먼트하고 음반·콘텐츠를 제작하는 엔터테인먼트 기업입니다.',
'000810':'국내 1위 손해보험사로 자동차·장기·일반보험과 자산운용 사업을 합니다.',
'024110':'중소기업 금융을 중심으로 하는 국책 성격의 은행입니다.',
'138040':'메리츠증권·메리츠화재를 자회사로 둔 금융지주회사입니다.',
'316140':'우리은행을 중심으로 하는 금융지주회사입니다.',
'011070':'스마트폰용 카메라 모듈(광학솔루션)과 반도체 기판, 전장부품을 생산하는 전자부품 기업으로 애플 등에 공급합니다.',
'042660':'상선·해양플랜트와 특수선(잠수함 등)을 건조하는 조선기업으로, 옛 대우조선해양이며 한화그룹에 편입됐습니다.',
'010140':'초대형 컨테이너선·LNG운반선·해양플랜트를 건조하는 조선기업입니다.',
'329180':'상선·해양·엔진과 특수선을 건조하는 세계적 조선기업입니다.',
'018260':'삼성그룹의 IT서비스(SI)와 물류(첼로), 클라우드 사업을 하는 기업입니다.',
'097950':'가공식품(비비고)·소재식품과 바이오(아미노산), 사료 사업을 하는 국내 대표 식품기업입니다.',
'271560':'초코파이·스낵 등 제과를 제조·판매하며 중국·베트남 등 해외 매출 비중이 높은 식품기업입니다.',
'000100':'전문·일반의약품을 제조·판매하는 제약기업으로, 폐암 신약 렉라자(레이저티닙)를 글로벌 제약사에 기술수출했습니다.',
'128940':'신약 개발에 강점을 둔 제약기업으로, 다양한 신약 파이프라인과 기술수출 실적을 보유하고 있습니다.',
'326030':'뇌전증 신약 세노바메이트(엑스코프리)를 미국에서 직접 판매하는 신약 개발 바이오기업입니다.',
'042700':'반도체 후공정 장비를 생산하며, 특히 HBM 제조에 쓰이는 TC본더 장비로 주목받는 반도체 장비기업입니다.',
'058470':'반도체 검사용 프로브핀(리노핀)과 테스트 소켓을 생산하는 반도체 부품·장비 기업입니다.',
'000720':'토목·건축·플랜트와 원자력 발전소를 시공하는 국내 대표 종합건설사입니다.',
'010950':'원유를 정제해 휘발유·경유 등 석유제품과 석유화학 제품을 생산하는 정유기업입니다.',
'096770':'정유(SK에너지)를 기반으로 석유화학·윤활유·배터리(SK온) 사업을 하는 에너지·화학 기업입니다.',
'047050':'무역(상사)과 에너지(가스전), 식량·부품소재 사업을 하는 포스코그룹 종합상사입니다.',
'034220':'TV·모바일·IT용 OLED와 LCD 디스플레이 패널을 생산하는 기업입니다.',
'064350':'철도차량(전동차·고속열차)과 방산(K2 전차), 플랜트 사업을 하는 기업입니다.',
'272210':'방산 전자장비(레이더·감시정찰)와 ICT, 위성·UAM 사업을 하는 기업입니다.',
'003550':'LG그룹의 지주회사로 전자·화학·통신 등 주요 계열사를 지배·관리합니다.',
'034730':'SK그룹의 지주회사로 에너지·반도체·통신·바이오 계열사를 지배하며 투자사업을 병행합니다.',
'003670':'2차전지 양극재·음극재를 생산하는 포스코그룹 소재기업으로, 국내 유일 흑연계 음극재 양산 기업입니다.',
'034020':'원자력·가스터빈 등 발전설비와 담수화 플랜트를 제작하는 기업으로, 소형모듈원전(SMR)에 주력하고 있습니다.',
'036570':'MMORPG 리니지 시리즈로 유명한 게임 개발·서비스 기업입니다.',
'251270':'모바일 게임을 개발·퍼블리싱하는 게임기업으로, 다양한 IP 기반 신작을 출시합니다.',
'068760':'셀트리온 그룹의 국내 의약품 제조·판매 계열사로 바이오시밀러와 케미컬 의약품을 담당합니다.',
'402340':'SK그룹의 반도체·ICT 투자 전문 중간지주회사로 SK하이닉스 등을 자회사로 둡니다.'};
function buildBizSummary(){
  const s=byCode[selected],code=selected,sector=(s.tags&&s.tags[0])||'';
  // ETF는 기업 설명 대신 상품 개요(기초지수·운용사·분류)를 사업요약으로 사용
  if(isFundLike(code)&&curEtf){
    /* [v2.5.4] ETF·ETN도 최소 5문장 서술형 — 기초지수·운용사·순자산·보수·성과·유의사항 */
    const i=curEtf.info||{},m=curEtf.metrics||{};
    const nm=s.name||code,eun=josaEun(nm);
    const kind=/ETN/i.test(nm)?'상장지수증권(ETN)':'상장지수펀드(ETF)';
    const es=[];
    if(i.summary)es.push(...(smoothBizText(i.summary,nm)||[i.summary]));
    else es.push(`${nm}${eun} ${i.indexName?`${i.indexName}${josaEul(i.indexName)} 기초지수로 추종하는 `:''}${kind}입니다.`);
    if(i.company)es.push(`${i.company}${josaGa(i.company)} 운용하며${i.category?`, ${i.category} 유형으로 분류됩니다`:''}.`.replace('며.','며 상장돼 거래되고 있습니다.'));
    if(m.marketSum!=null||m.nav!=null){
      const b=[];
      if(m.marketSum!=null)b.push(`순자산 규모는 ${eokWon(m.marketSum)}`);
      if(m.nav!=null)b.push(`기준가(NAV)는 ${EN(m.nav,2)}원`);
      es.push(b.join(', ')+'입니다.');
    }
    if(m.fee!=null)es.push(`총보수는 연 ${Number(m.fee).toFixed(2)}%로, 장기 보유할수록 비용 차이가 수익률에 누적됩니다.`);
    if(m.m3!=null)es.push(`최근 3개월 수익률은 ${EPCT(m.m3)}를 기록했습니다.`);
    es.push(`${kind}는 여러 종목에 분산 투자하는 효과가 있지만 기초지수가 내리면 함께 하락하며, 분배금과 보수는 상품마다 다르므로 투자 전 상품 설명을 확인하는 것이 좋습니다.`);
    const bits=[];
    if(m.marketSum!=null)bits.push(`순자산 ${eokWon(m.marketSum)}`);
    if(m.nav!=null)bits.push(`NAV ${EN(m.nav,2)}원`);
    if(m.fee!=null)bits.push(`보수 ${Number(m.fee).toFixed(2)}%`);
    if(m.m3!=null)bits.push(`3개월 ${EPCT(m.m3)}`);
    const PE=(t)=>`<p class="biz-p">${t}</p>`;
    const list=es.filter(Boolean).slice(0,9);
    let mainE=list.slice(0,5).map(PE).join('');
    if(list.length>5)mainE+=`<button class="biz-more" id="bizMore">사업요약 전문 보기 (${list.length}문장) ›</button>`;
    return {txt:mainE,full:list.map(PE).join(''),live:bits.join(' · '),tags:[i.category||'ETF'].filter(Boolean)};
  }
  /* [수정] 사업요약 우선순위: ① 네이버 기업개요 원문(FnGuide 문단 — 전 상장사, 종목별로 다르고 상세)
     ② 수기 한줄 설명(BIZ_DESC) ③ 섹터 문구 ④ 정직한 안내.
     예전엔 ①이 아예 없어서 주요주 밖에서는 전부 "…사업을 영위하는" 뻔한 문장이 나왔다. */
  /* ══ [v2.5.4] 사업요약 재구축 ══
     ① 기업개요 원문이 있으면 서술체로 다듬어 앞에 놓고,
     ② 원문이 없거나 짧으면 시장·업종·규모·실적·성장·주가 위치·밸류에이션·수급 데이터로 문장을 합성해
        어떤 종목이든 최소 5문장 이상의 서술형 요약을 만든다(모든 수치는 실제 수집 데이터). */
  /* [v4.27] 개요 원문 정제 — 네이버 페이지를 긁을 때 'MY STOCK 추가'·'그룹을 추가해주세요'
     같은 화면 조작 문구가 문단에 섞여 들어와 그대로 요약에 실렸다(첨부 1번 사진).
     사업 내용과 무관한 UI·안내 문구는 원천에서 걸러낸다. */
  const _uiNoise=/MY\s*STOCK|마이\s*스톡|그룹(?:을|이)?\s*추가|관심\s*(?:종목|그룹)|로그인|즐겨찾기|더보기|화면\s*번호|종목\s*토론|인쇄|클릭|바로가기|안내\s*닫기|팝업|배너|이벤트\s*참여/i;
  const ovp=(curFund&&Array.isArray(curFund.overview))?curFund.overview.filter(x=>x&&x.length>=10&&!/\uFFFD/.test(x)&&!_uiNoise.test(x)):null;
  let sents=[];
  if(ovp&&ovp.length){ try{ sents=smoothBizText(ovp.join(' '),s.name)||[]; }catch(e){ sents=[]; } }
  if(!sents.length&&BIZ_DESC[code])sents=[String(BIZ_DESC[code]).replace(/<[^>]*>/g,'').trim()];
  const facts=bizDataSentences(code,s,sector,!sents.length);
  const seen=new Set(sents.map(x=>x.slice(0,12)));
  facts.forEach(f=>{ if(!seen.has(f.slice(0,12))){ sents.push(f); seen.add(f.slice(0,12)); } });
  if(sents.length<5)sents=sents.concat(bizFillerSentences(code,s,sector).filter(f=>!seen.has(f.slice(0,12))));
  sents=sents.slice(0,9);
  const P_=(t)=>`<p class="biz-p">${t}</p>`;
  const fullTxt=sents.map(P_).join('');
  let main=sents.slice(0,5).map(P_).join('');
  if(sents.length>5)main+=`<button class="biz-more" id="bizMore">사업요약 전문 보기 (${sents.length}문장) ›</button>`;
  const bits=[];
  const inc=curFund.finance&&curFund.finance.income;
  if(inc&&inc.rows&&inc.periods&&inc.periods.length){const last=inc.periods[inc.periods.length-1];const fr=(kw)=>inc.rows.find(r=>r.title&&r.title.replace(/\s/g,'').includes(kw));const nm=(row)=>row&&row.values&&row.values[last.key]!=null?numish2(row.values[last.key]):null;const sv=nm(fr('매출액')||fr('매출')),ov=nm(fr('영업이익'));if(sv)bits.push(`매출 ${fmtEokJo(sv)}`);if(ov)bits.push(`영업이익 ${fmtEokJo(ov)}`);}
  const per=sumStat(['PER']),pbr=sumStat(['PBR']);if(per)bits.push(`PER ${per}`);if(pbr)bits.push(`PBR ${pbr}`);
  const d=calcConsensus();if(d&&d.target&&d.upside!=null)bits.push(`목표주가 ${KRW(d.target)}원(${pctS(d.upside*100)})`);
  else if(d&&d.est&&d.est.target&&d.price)bits.push(`AI 추정 적정가 ${KRW(d.est.target)}원(${pctS((d.est.target-d.price)/d.price*100)}) · 참고용`);
  return {txt:main,full:fullTxt,live:bits.join(' · '),tags:[sector].filter(Boolean)};
}
/* ── [v2.5.4] 원화 문자열(1조 2,345억원) → 억원 숫자 ── */
function eokFromKr(v){
  if(v==null)return null;
  const t=String(v).replace(/[\s,]/g,'');
  const jo=(t.match(/([0-9.]+)조/)||[])[1],eok=(t.match(/([0-9.]+)억/)||[])[1];
  if(jo||eok)return (jo?parseFloat(jo)*10000:0)+(eok?parseFloat(eok):0);
  const n=parseFloat(t.replace(/[^0-9.]/g,''));
  return isFinite(n)?n:null;
}
/* ── 데이터로 만드는 서술 문장들 ── */
function bizDataSentences(code,s,sector,lead){
  const out=[];
  const nm=s.name||code,eun=josaEun(nm);
  const mk=marketInfo(code).label;
  const q=dispQuote(code)||{};
  const px=q.price!=null?q.price:s.price, pv=q.prevClose||s.prevClose;
  /* 특수 유형 먼저 — 스팩·리츠·우선주는 사업 구조 자체가 다르다 */
  if(lead){
    if(/스팩|기업인수목적/.test(nm))
      out.push(`${nm}${eun} 유망한 비상장 기업을 찾아 합병하는 것을 유일한 목적으로 설립된 기업인수목적회사(SPAC)입니다.`,
        `공모로 모은 자금은 합병 전까지 신탁에 예치되기 때문에, 일반 기업과 달리 매출·이익보다 합병 대상 발표와 성사 여부가 주가를 좌우합니다.`);
    else if(/리츠|REIT/i.test(nm))
      out.push(`${nm}${eun} 오피스·물류센터 등 부동산에 투자해 임대수익과 매각차익을 투자자에게 배당하는 부동산투자회사(REITs)입니다.`,
        `보유 자산의 임대율과 금리 흐름이 배당 여력과 주가에 직접적인 영향을 줍니다.`);
    else if(/우$|우[ABC]$|[0-9]우/.test(nm))
      out.push(`${nm}${eun} 의결권이 없는 대신 보통주보다 배당을 먼저 받는 우선주로, 같은 회사의 보통주와 가격이 따로 움직입니다.`);
    else if(SECTOR_DESC[sector])
      out.push(`${nm}${eun} ${SECTOR_DESC[sector]} ${mk} 상장 기업입니다.`);
    else
      out.push(`${nm}${eun} ${mk}에 상장된 ${sector?sector+' 관련 ':''}기업입니다.`);
  }
  /* 규모 */
  const cap=eokFromKr(sumStat(['시가총액']));
  if(cap){
    const size=cap>=100000?'대형주':cap>=20000?'중견 기업':cap>=5000?'중형주':'소형주';
    out.push(`시가총액은 ${fmtEokJo(cap)} 규모로 ${mk} 시장에서 ${size}에 해당합니다.`);
  }
  /* 실적 + 성장 */
  const inc=curFund.finance&&curFund.finance.income;
  if(inc&&inc.rows&&inc.periods&&inc.periods.length){
    const ps=inc.periods,last=ps[ps.length-1],prev=ps[ps.length-2];
    const fr=(kw)=>inc.rows.find(r=>r.title&&r.title.replace(/\s/g,'').includes(kw));
    const val=(row,p)=>(row&&p&&row.values&&row.values[p.key]!=null)?numish2(row.values[p.key]):null;
    const sr=fr('매출액')||fr('매출'),or=fr('영업이익');
    const sv=val(sr,last),ov=val(or,last),sp=val(sr,prev),op=val(or,prev);
    if(sv&&ov!=null){
      const m=sv?ov/sv*100:null;
      out.push(ov>=0
        ?`최근 결산 기준 매출액은 ${fmtEokJo(sv)}, 영업이익은 ${fmtEokJo(ov)}으로 영업이익률은 약 ${m.toFixed(1)}% 수준입니다.`
        :`최근 결산 기준 매출액은 ${fmtEokJo(sv)}을 기록했지만 영업손실 ${fmtEokJo(Math.abs(ov))}이 발생해 아직 이익을 내지 못하고 있습니다.`);
    }else if(sv)out.push(`최근 결산 기준 매출액은 ${fmtEokJo(sv)}입니다.`);
    if(sv&&sp){
      const g=(sv-sp)/Math.abs(sp)*100;
      let tail='';
      if(ov!=null&&op!=null&&op!==0){
        const g2=(ov-op)/Math.abs(op)*100;
        tail=`, 영업이익은 ${g2>=0?'+':''}${g2.toFixed(1)}% ${g2>=0?'늘며':'줄며'} ${g2>=0?'수익성이 개선되는':'수익성 부담이 커지는'} 흐름입니다`;
      }
      out.push(`직전 기간과 비교하면 매출은 ${g>=0?'+':''}${g.toFixed(1)}% ${g>=0?'증가':'감소'}했고${tail||''}.`.replace('했고.','했습니다.'));
    }
  }
  /* 주가 위치 */
  let hi=sumStatNum(['52주최고','연중최고','최고가']),lo=sumStatNum(['52주최저','연중최저','최저가']);
  const daily=_sumDaily[code];
  if((!hi||!lo)&&daily&&daily.length){const H=daily.map(c=>c.h??c.c),L=daily.map(c=>c.l??c.c);hi=hi||Math.max(...H);lo=lo||Math.min(...L);}
  if(px!=null&&hi&&lo&&hi>lo){
    const upFromLo=(px-lo)/lo*100,dnFromHi=(hi-px)/hi*100;
    const pos=(px-lo)/(hi-lo)*100;
    out.push(`현재 주가 ${KRW(px)}원은 52주 최저가 ${KRW(lo)}원보다 ${upFromLo.toFixed(0)}% 높고 최고가 ${KRW(hi)}원보다 ${dnFromHi.toFixed(0)}% 낮아, 1년 변동 폭의 ${pos.toFixed(0)}% 지점에 자리하고 있습니다.`);
  }else if(px!=null&&pv){
    const p=(px-pv)/pv*100;
    out.push(`현재 주가는 ${KRW(px)}원으로 전 거래일보다 ${signed(px-pv)}원(${pctS(p)}) ${p>=0?'올랐습니다':'내렸습니다'}.`);
  }
  /* 밸류에이션 */
  const per=sumStatNum(['PER']),pbr=sumStatNum(['PBR']),dvd=sumStatNum(['배당수익률']);
  if(per||pbr){
    const bits=[];
    if(per)bits.push(`PER ${per.toFixed(2)}배`);
    if(pbr)bits.push(`PBR ${pbr.toFixed(2)}배`);
    const judge=per?(per>=40?'현재 이익 대비 기대가 상당히 반영된 편':per>=15?'시장 평균과 비슷한 수준':'이익 대비 비교적 낮게 평가된 편'):
      (pbr>=3?'순자산 대비 높게 평가된 편':'순자산 대비 부담이 크지 않은 편');
    out.push(`밸류에이션은 ${bits.join(', ')}로 ${judge}입니다.`);
  }
  if(dvd&&dvd>0)out.push(`배당수익률은 약 ${dvd.toFixed(2)}%로, 시세 차익과 함께 배당도 기대할 수 있는 종목입니다.`);
  /* 컨센서스 */
  const cs=calcConsensus();
  if(cs&&cs.target&&cs.upside!=null)
    out.push(`증권가 평균 목표주가는 ${KRW(cs.target)}원으로 현재가 대비 ${pctS(cs.upside*100)}의 ${cs.upside>=0?'상승 여력을':'하락 여지를'} 시사합니다.`);
  else if(cs&&cs.est&&cs.est.target&&cs.price)
    out.push(`애널리스트 정식 커버리지가 없어 실적·업종 지표로 추정한 참고 적정가는 ${KRW(cs.est.target)}원 수준입니다.`);
  /* 거래·수급 */
  if(s.value!=null&&s.volume!=null)
    out.push(`최근 거래일 기준 거래량은 ${KRW(s.volume)}주, 거래대금은 ${fmtEokJo(Math.round(s.value/1e8))}으로 집계됐습니다.`);
  return out;
}
/* ── 5문장을 채우기 위한 보조 문장(항상 사실 기반) ── */
function bizFillerSentences(code,s,sector){
  const out=[],nm=s.name||code,mk=marketInfo(code).label;
  if(nxtCapability(code)===true)
    out.push(`${nm}${josaEun(nm)} 대체거래소 넥스트레이드(NXT)에서도 거래돼 정규장 전후(오전 8시~오후 8시)에도 매매할 수 있는 종목입니다.`);
  if(s.tags&&s.tags.length)
    out.push(`시장에서는 ${s.tags.slice(0,3).join('·')} 테마와 함께 묶여 움직이는 경우가 많습니다.`);
  out.push(mk==='코스닥'
    ?`상장 시장인 코스닥은 기술·성장 기업 중심이라 코스피보다 주가 변동 폭이 큰 편이므로 분할 매매 등 위험 관리가 필요합니다.`
    :`상장 시장인 코스피는 대형 우량주 중심의 시장으로, 지수·환율 등 거시 지표의 영향을 함께 받습니다.`);
  if(!(curFund&&Array.isArray(curFund.overview)&&curFund.overview.length))
    out.push(`상세 기업 개요 원문이 아직 제공되지 않아, 공개된 시세·재무·수급 데이터를 바탕으로 요약했습니다.`);
  out.push(`실적과 수급은 분기·시장 상황에 따라 달라질 수 있으므로, 투자 판단 전 최신 공시와 뉴스를 함께 확인하는 것이 좋습니다.`);
  return out;
}

/* ── [v2.5.3] 개조식 → 서술체 변환 ── */
/* [v2.5.4] 조사 판정 일반화 — 한글은 물론 숫자(코스피200)·영문(SK C&C)으로 끝나는 이름도 처리한다.
   숫자/영문은 한국어 발음 기준으로 받침 유무를 판단한다(0=영, 1=일, L=엘 → 받침 있음). */
const _JOSA_DIGIT={'0':1,'1':1,'2':0,'3':1,'4':0,'5':0,'6':1,'7':1,'8':1,'9':0};
const _JOSA_ALPHA={a:0,b:0,c:0,d:0,e:0,f:1,g:0,h:0,i:0,j:0,k:0,l:1,m:1,n:1,o:0,p:0,q:0,r:1,s:1,t:0,u:0,v:0,w:0,x:1,y:0,z:1};
function hasFinalConsonant(w){
  const t=String(w||'').trim().replace(/[)\]}"'’”·\s]+$/,'');
  const ch=t.slice(-1);if(!ch)return null;
  const c=ch.charCodeAt(0);
  if(c>=0xAC00&&c<=0xD7A3)return ((c-0xAC00)%28)!==0;
  if(/[0-9]/.test(ch))return !!_JOSA_DIGIT[ch];
  if(/[A-Za-z]/.test(ch))return !!_JOSA_ALPHA[ch.toLowerCase()];
  return null;
}
function josaEun(w){const f=hasFinalConsonant(w);return f==null?'은(는)':(f?'은':'는');}
function josaGa(w){const f=hasFinalConsonant(w);return f==null?'이(가)':(f?'이':'가');}
function josaEul(w){const f=hasFinalConsonant(w);return f==null?'을(를)':(f?'을':'를');}
function smoothBizText(raw,name){
  /* ══ [v4.27] 사업요약 문장 엔진 재설계 ══════════════════════════════════
     [문제] ① UI 조작 문구("MY STOCK 추가…")가 섞여 "…해주세요입니다" 같은
     비문이 됐고 ② "2000년 분할 설립" 같은 연혁이 맨 앞에 와서 정작 무엇을
     하는 회사인지가 뒤로 밀렸으며 ③ 어미만 기계적으로 바꿔 흐름이 딱딱했다.
     [설계] 실제 MTS 요약처럼 —
       1) 노이즈·연혁·지배구조 문장을 걸러내고
       2) 남은 문장을 '무엇을 하는 회사인가 → 주요 제품·사업 → 실적·비중'
          순서로 점수를 매겨 재배열한 뒤
       3) 서술체로 다듬고 반복 주어를 접속어로 풀어 자연스럽게 잇는다. */
  let t=String(raw||'').replace(/\s+/g,' ').trim();
  if(!t)return [];
  const eun=josaEun(name);
  t=t.replace(/동사(?:는|은)/g,name+eun).replace(/당사(?:는|은)/g,name+eun)
     .replace(/동사(?:가|이)\b/g,name+(eun==='은'?'이':'가')).replace(/동사의/g,name+'의')
     .replace(/동사를|동사을/g,name+(eun==='은'?'을':'를')).replace(/동사|당사/g,name);
  const parts=(t.match(/[^.]+\.?/g)||[t]).map(x=>x.replace(/\.+$/,'').trim()).filter(x=>x.length>4);

  const NOISE=/MY\s*STOCK|마이\s*스톡|그룹(?:을|이)?\s*추가|추가할\s*그룹|관심\s*(?:종목|그룹)|즐겨찾기|로그인|더보기|종목\s*토론|인쇄|클릭|바로가기|화면|팝업|배너|해주세요|하십시오|바랍니다/i;
  const HIST=/설립되|설립하|분할\s*(?:설립|되)|인적분할|물적분할|상장(?:하였|되었|했)|사명(?:을)?\s*변경|상호(?:를)?\s*변경|출범하|창립|합병(?:되었|하였)|양수합니다|양수하였|승계하/;
  const GOV=/최대주주|지분(?:율)?\s*[0-9]|종속회사|계열회사|연결대상|본사는|본점|소재지|사업장을?\s*두/;

  const scored=[];
  parts.forEach((p,idx)=>{
    if(NOISE.test(p))return;                                   // UI·안내 문구 폐기
    if(p.replace(/[0-9.,\s%년월일]/g,'').length<6)return;      // 숫자·날짜뿐인 조각 폐기
    let sc=0;
    if(HIST.test(p))sc-=40;                                    // 연혁은 뒤로(사실상 탈락)
    if(GOV.test(p))sc-=35;                                     // 지배구조·소재지·종속회사는 요약에서 제외
    if(!GOV.test(p)&&/영위|전문(?:회사|기업)|주력(?:으로)?|기반으로|중심으로/.test(p))sc+=30;   // '무엇 하는 회사' (종속회사 나열문 제외)
    if(/제조|생산|건조|개발|공급|판매|서비스|운영|수주|제공/.test(p))sc+=16;      // 사업 활동
    if(/제품|선박|반도체|배터리|플랫폼|콘텐츠|장비|소재|부품|솔루션|치료제|플랜트|모듈/.test(p))sc+=8;
    if(/매출(?:액)?\s*(?:비중|구성|의)|비중은|차지/.test(p))sc+=14;             // 매출 구성
    if(p.startsWith(name))sc+=6;
    scored.push({p,idx,sc});
  });
  if(!scored.length)return [];
  /* 소개(양수 점수) 문장을 점수순으로 앞에, 그 안에서는 원문 순서를 존중 */
  scored.sort((a,b)=>(b.sc-a.sc)||(a.idx-b.idx));
  const keep=scored.filter(x=>x.sc>-20).slice(0,10);
  keep.sort((a,b)=>{                                            // 같은 성격끼리는 원문 흐름 유지
    const ta=a.sc>=20?0:a.sc>=8?1:a.sc>=0?2:3, tb=b.sc>=20?0:b.sc>=8?1:b.sc>=0?2:3;
    return (ta-tb)||(a.idx-b.idx);
  });

  const out=[];
  keep.forEach((row,k)=>{
    let p=row.p;
    p=p.replace(/하고\s*있음$/,'하고 있습니다').replace(/되고\s*있음$/,'되고 있습니다')
       .replace(/있음$/,'있습니다').replace(/없음$/,'없습니다')
       .replace(/함$/,'합니다').replace(/됨$/,'됩니다').replace(/짐$/,'집니다').replace(/임$/,'입니다')
       .replace(/([가-힣])음$/,'$1습니다');
    p=p.replace(/([0-9]+)개\s*社/g,'$1개사').replace(/等/g,'등');
    if(!/(습니다|입니다|합니다|됩니다|집니다)$/.test(p)){
      if(/다$/.test(p))p=p.replace(/한다$/,'합니다').replace(/된다$/,'됩니다').replace(/있다$/,'있습니다').replace(/이다$/,'입니다');
      if(!/(습니다|입니다|합니다|됩니다|집니다)$/.test(p))p+='입니다';
    }
    if(k>0&&p.startsWith(name)){
      p=['또한','아울러','이와 함께'][(k-1)%3]+' '+p.slice(name.length).replace(/^(은|는|이|가)\s*/,'');
    }
    /* 첫 문장이 회사 소개가 아니면 주어를 붙여 소개형으로 */
    if(k===0&&!p.startsWith(name))p=name+eun+' '+p.replace(/^(은|는|이|가)\s*/,'');
    out.push(p.replace(/\s{2,}/g,' ').trim()+'.');
  });
  return out.slice(0,9);
}
/* ===== 종목 스냅샷(좌측 채움) ===== *//* ===== 종목 스냅샷(좌측 채움) ===== */
/* ===== 시세 (일자별 / 시간별) ===== */
let siseMode='date';
function renderSise(el){
  const code=selected;
  const seg=`<div class="sise-seg"><button data-sm="time" class="${siseMode==='time'?'on':''}">시간별</button><button data-sm="date" class="${siseMode==='date'?'on':''}">일자별</button></div>`;
  const bind=()=>el.querySelectorAll('.sise-seg button').forEach(b=>b.onclick=()=>{siseMode=b.dataset.sm;renderSise(el);});
  const head=`<div class="sise-head"><span>${siseMode==='date'?'일자':'시간'}</span><span>종가</span><span>대비</span><span>거래량</span></div>`;
  const rowHtml=(label,close,diff,vol)=>{const dir=dirOf(diff);
    return `<div class="sise-r"><span class="sl">${label}</span><span class="num sc">${KRW(close)}</span><span class="num sdiff ${dir}">${diff?arrow(dir)+' '+KRW(Math.abs(diff)):'0'}</span><span class="num sv">${KRW(vol)}</span></div>`;};
  if(siseMode==='date'){
    const d=_sumDaily[code];
    if(!d){el.innerHTML=seg+'<div class="empty">시세를 불러오는 중…</div>';bind();ensureDailySummary(code).then(()=>{if(selected===code&&infoTab==='sise')renderSise(el);});return;}
    if(!d.length){el.innerHTML=seg+'<div class="empty">일자별 시세 데이터가 없습니다.</div>';bind();return;}
    const arr=d.slice(-60);
    const rows=arr.map((c,i)=>{const prev=arr[i-1];const diff=prev?c.c-prev.c:0;
      const ds=`${c.d.slice(0,4)}/${c.d.slice(4,6)}/${c.d.slice(6,8)}`;return rowHtml(ds,c.c,diff,c.v);}).reverse().join('');
    el.innerHTML=seg+head+`<div class="sise-rows">${rows}</div>`;bind();
  }else{
    const mins=minuteSeries(code,1);
    if(!mins.length){el.innerHTML=seg+'<div class="empty">시간별(분봉) 데이터가 없습니다.<br>차트 탭을 한 번 열면 분봉을 불러오고, 장중에는 실시간으로 채워집니다.</div>';bind();ensureIntraday(code).then(()=>{if(selected===code&&infoTab==='sise')renderSise(el);});return;}
    const pc=byCode[code].prevClose||mins[0].o;
    const arr=mins.slice(-150);
    const rows=arr.map(c=>rowHtml(c.d,c.c,c.c-pc,c.v)).reverse().join('');
    el.innerHTML=seg+head+`<div class="sise-rows">${rows}</div>`;bind();
  }
}
/* ===== 뉴스 / 공시 ===== */
let newsType='all';const newsCache={};
function renderNews(el){
  const code=selected;
  const seg=`<div class="news-seg"><button data-nt="all" class="${newsType==='all'?'on':''}">전체</button><button data-nt="news" class="${newsType==='news'?'on':''}">뉴스</button><button data-nt="disc" class="${newsType==='disc'?'on':''}">공시</button></div>`;
  const bind=()=>el.querySelectorAll('.news-seg button').forEach(b=>b.onclick=()=>{newsType=b.dataset.nt;renderNews(el);});
  const key=code+':'+newsType,cached=newsCache[key];
  if(!cached){
    el.innerHTML=seg+'<div class="empty">뉴스를 불러오는 중…</div>';bind();
    fetch(`/api/news?code=${code}&type=${newsType}`,{cache:'default'}).then(r=>r.json()).then(j=>{newsCache[key]=j||{items:[]};if(selected===code&&infoTab==='news')renderNews(el);}).catch(e=>{newsCache[key]={items:[],diag:{err:String(e).slice(0,40)}};if(selected===code&&infoTab==='news')renderNews(el);});
    return;
  }
  const items=cached.items||[];
  if(!items.length){el.innerHTML=seg+`<div class="empty">표시할 ${newsType==='disc'?'공시가':'뉴스가'} 없습니다.${cached.diag?'<br><span style="font-size:10px;color:#b3bcca;word-break:break-all">진단 '+JSON.stringify(cached.diag)+'</span>':''}</div>`;bind();return;}
  const list=items.map(it=>{
    const tag=it.type==='disc'?'<span class="news-tag disc">공시</span>':'<span class="news-tag">뉴스</span>';
    const inner=`<div class="news-t">${it.title}</div><div class="news-m">${tag}<span>${it.source||''}</span><span class="nd">${it.date||''}</span></div>`;
    return it.url?`<a class="news-it" href="${it.url}" target="_blank" rel="noopener">${inner}</a>`:`<div class="news-it">${inner}</div>`;
  }).join('');
  el.innerHTML=seg+`<div class="news-list">${list}</div>`;bind();
}
function renderSummary(el,extraTop,extraBottom){
  const code=curFund.code,s=byCode[selected];
  /* [수정] 상단 헤더는 dispQuote(통합·NXT 병합)를 쓰는데 여기만 byCode(KRX 원시값)를 읽어
     애프터마켓에 헤더 70,200 vs 요약 69,800처럼 서로 다른 가격이 표시됐다 — 같은 창구로 통일 */
  const _q=dispQuote(selected)||{};
  const price=(_q.price!=null?_q.price:(s&&s.price)),prev=(_q.prevClose||(s&&s.prevClose)),
    diff=(price!=null&&prev!=null)?price-prev:null,dir=dirOf(diff||0),pp=(diff!=null&&prev)?diff/prev*100:null;
  const daily=_sumDaily[code];
  if(!daily)ensureDailySummary(code).then(()=>{if(selected===code&&infoTab==='summary'&&curFund&&curFund.code===code)renderInfo();});
  let html='';
  // 헤더: 현재가 + 등락
  html+=`<div class="sum-price"><div class="sp-now num ${dir}">${KRW(price)}<span class="sp-won">원</span></div>${diff!=null?`<div class="sp-chg num ${dir}">${arrow(dir)} ${signed(diff)} (${pctS(pp)})</div>`:'<div class="sp-chg">시세 수신 대기</div>'}</div>`;

  // AI 사업요약 (맨 위)
  const biz=buildBizSummary();
  html+=`<div class="sum-card biz-card"><div class="sum-h">사업요약 <span class="ai-badge">AI</span></div>
    <div class="biz-txt">${biz.txt}</div>
    ${biz.live?`<div class="biz-live"><b>실시간</b> ${biz.live}</div>`:''}
    ${biz.tags.length?`<div class="biz-tags">${biz.tags.map(t=>`<span>#${t}</span>`).join('')}</div>`:''}
    <div class="sum-note" style="text-align:left">기업 개요 원문에 실시간 시세·실적을 결합해 자연스러운 문장으로 재구성한 요약입니다.</div></div>`;
  _bizFull=biz.full;
  if(extraTop)html+=extraTop;

  // 연간 가격 변화 (52주)
  let hi=sumStatNum(['52주최고','연중최고','최고가']),lo=sumStatNum(['52주최저','연중최저','최저가']);
  if((!hi||!lo)&&daily&&daily.length){const H=daily.map(c=>c.h??c.c),L=daily.map(c=>c.l??c.c);hi=hi||Math.max(...H);lo=lo||Math.min(...L);}
  if(hi&&lo&&price!=null&&hi>lo){
    const posp=Math.max(0,Math.min(100,(price-lo)/(hi-lo)*100));
    html+=card('연간 가격 변화',`
      <div class="yr-slider"><div class="yr-track"><div class="yr-dot" style="left:${posp}%"></div></div></div>
      <div class="yr-ends"><div><div class="yr-lb">최저가 ${KRW(lo)}</div><div class="up" style="font-size:12px">대비 +${Math.round((price/lo-1)*100)}%</div></div>
      <div style="text-align:right"><div class="yr-lb">최고가 ${KRW(hi)}</div><div class="down" style="font-size:12px">대비 ${Math.round((price/hi-1)*100)}%</div></div></div>`);
  }

  // 기간별 수익률 (지수 대비)
  const mk=marketInfo(code),bench=_sumDaily[mk.bench];
  if(!bench&&!isFundLike(code))ensureDailySummary(mk.bench).then(()=>{if(selected===code&&infoTab==='summary'&&curFund&&curFund.code===code)renderInfo();});
  if(daily&&daily.length>25){
    const retOf=(arr,n)=>{if(!arr||arr.length<=n)return null;const cl=arr.map(c=>c.c);const past=cl[cl.length-1-n];return past?(cl[cl.length-1]-past)/past*100:null;};
    const cell=(v)=>`<td class="num ${v==null?'':(v>0?'up':'down')}">${v==null?'—':pctS(v)}</td>`;
    const row=(nm,arr)=>`<tr><td>${nm}</td>${cell(retOf(arr,21))}${cell(retOf(arr,42))}${cell(retOf(arr,63))}</tr>`;
    html+=card('기간별 수익률',`<table class="fin-table"><thead><tr><th>${isFundLike(code)?'ETF':'종목/벤치마크'}</th><th>1개월</th><th>2개월</th><th>3개월</th></tr></thead>
      <tbody>${row(s.name,daily)}${(bench&&bench.length&&!isFundLike(code))?row(mk.label,bench):''}</tbody></table>`);
  }

  // 최근 현황 (매수/매도 흐름 자동 분석)
  if(daily&&daily.length>6){
    const cl=daily.map(c=>c.c),N=Math.min(7,cl.length-1);let up=0,dn=0;
    for(let i=cl.length-N;i<cl.length;i++){const r=cl[i]-cl[i-1];if(r>0)up+=r;else dn+=-r;}
    const tot=up+dn;let buy=tot?Math.round(up/tot*100):50;buy=Math.max(5,Math.min(95,buy));const sell=100-buy;
    const msg=buy>=55?'최근 <b class="up">매수</b>세가 우세했어요!':buy<=45?'최근 <b class="down">매도</b>세가 우세했어요!':'최근 <b>매수·매도</b>가 팽팽했어요';
    html+=card('최근 현황',`<div class="sent-msg">${msg}</div>
      <div class="sent-bar"><div class="sent-sell" style="width:${sell}%">매도 ${sell}%</div><div class="sent-buy" style="width:${buy}%">매수 ${buy}%</div></div>
      <div class="sum-note">최근 ${N}거래일 가격 흐름 기반 자동 분석 · 실제 주주 매매 데이터가 아닙니다</div>`);
  }

  // 기본정보
  const infoRows=[['거래시장',sumStat(['거래시장','시장구분','시장'])],['시가총액',sumStat(['시가총액'])],['외국인비중',sumStat(['외국인','외인'])],
    ['PER',sumStat(['PER'])],['PBR',sumStat(['PBR'])],['배당수익률',sumStat(['배당수익률','배당률'])],
    ['자본금',sumStat(['자본금'])],['상장주식수',sumStat(['상장주식수','총주식수','주식수'])],['대용가',sumStat(['대용가'])]].filter(r=>r[1]!=null);
  if(infoRows.length)html+=card('기본정보',`<div class="inv-grid">${infoRows.map(r=>`<div class="inv-cell"><div class="n">${r[0]}</div><div class="v">${r[1]}</div></div>`).join('')}</div>`);

  // 연간 실적 (매출액·영업이익)
  const inc=curFund.finance&&curFund.finance.income;
  if(inc&&inc.periods&&inc.rows){
    const findRow=(kw)=>inc.rows.find(r=>r.title&&r.title.replace(/\s/g,'').includes(kw));
    const sales=findRow('매출액')||findRow('매출'),op=findRow('영업이익');
    if(sales||op){
      const per=inc.periods.slice(-5);
      const num=(row,k)=>row&&row.values&&row.values[k]!=null?numish2(row.values[k]):null;
      const sv=per.map(p=>num(sales,p.key)),ov=per.map(p=>num(op,p.key));
      const mx=Math.max(1,...sv.map(v=>Math.abs(v||0)),...ov.map(v=>Math.abs(v||0)));
      const bars=per.map((p,i)=>{const h1=Math.round(Math.abs(sv[i]||0)/mx*90),h2=Math.round(Math.abs(ov[i]||0)/mx*90);
        return `<div class="gcol"><div class="gbars"><div class="gbar" style="height:${h1}px;background:var(--amber)" title="매출"></div><div class="gbar" style="height:${h2}px;background:var(--brand)" title="영업이익"></div></div><div class="gcol-nm">${(p.title||p.key).slice(2)}${p.forecast?'(E)':''}</div></div>`;}).join('');
      html+=card('연간 실적 <span class="unit">(억원)</span>',`<div class="glegend"><span><i style="background:var(--amber)"></i>매출액</span><span><i style="background:var(--brand)"></i>영업이익</span></div><div class="gchart">${bars}</div>`);
    }
  }

  // 투자자별 순매수
  const inv=curFund.investors;
  if(inv&&!inv.error&&inv.total){
    const order=['개인','외국인','기관계'].filter(k=>inv.total[k]!=null);
    if(order.length)html+=card('투자자별 순매수 <span class="unit">(주)</span>',barsSigned(order.map(k=>({name:k,val:inv.total[k]})))+`<div class="sum-note">최근 순매수 합계 · 빨강 매수 / 파랑 매도${inv.indivEst?' · 개인은 추정':''}</div>`);
  }

  // 최근 목표가 (증권사)
  const brokers=((curFund.consensus&&curFund.consensus.brokers)||[]).filter(b=>b.target);
  if(brokers.length&&price!=null){
    const pick=brokers.slice(0,6);const mx=Math.max(price,...pick.map(b=>b.target))*1.08;
    const curH=Math.round(price/mx*150);
    const bars=pick.map(b=>{const h=Math.round(b.target/mx*150);const opUp=/매수|BUY|Buy|Overweight|Outperform|비중확대/.test(b.opinion||'');
      return `<div class="tcol"><div class="tbar-lab ${opUp?'up':''}">${opUp?'BUY':(b.opinion||'·')}</div><div class="tval">${KRW(b.target)}</div><div class="tbar" style="height:${h}px"></div><div class="tcol-nm">${(b.date||'').toString().slice(5,10)}</div></div>`;}).join('');
    html+=card('최근 목표가',`<div class="tchart">${bars}<div class="tcur" style="bottom:${curH+22}px"><span>현재가 ${KRW(price)}</span></div></div>`);
  }

  // 배당
  const divRate=sumStatNum(['배당수익률','배당률']),dps=sumStatNum(['주당배당','DPS','배당금']);
  if(divRate!=null){
    const perM=Math.round(divRate*10000);
    html+=card('배당',`<div class="div-hero">연 배당수익률 <b class="amber">${divRate}%</b></div><div class="div-sub">100만원 보유 시 약 <b>${KRW(perM)}원</b> 배당 예상${dps?` · 주당 ${KRW(dps)}원`:''}</div>`);
  }

  if(extraBottom)html+=extraBottom;
  if(!html)html='<div class="empty">종목요약 데이터를 불러오는 중…</div>';
  el.innerHTML=html;
}
function card(title,body){return `<div class="sum-card"><div class="sum-h">${title}</div>${body}</div>`;}
function renderInvestor(el){
  const inv=curFund.investors;
  if(!inv||inv.error||!inv.columns||!inv.rows||!inv.rows.length){
    el.innerHTML='<div class="empty">투자자별 매매동향을 불러오지 못했습니다.<br><span style="font-size:11px">거래소 데이터 연결이 지연되거나 해당 종목 데이터가 없을 수 있어요.</span></div>';return;}
  const cols=inv.columns,cell=(v)=>`<td class="${sgn(v)}">${v==null?'—':intFmt(v)}</td>`;
  const head=`<tr><th>일자</th>${cols.map(c=>`<th>${c}</th>`).join('')}</tr>`;
  const totalRow=`<tr class="inv-total"><td>합계(수량)</td>${cols.map(c=>cell(inv.total?inv.total[c]:null)).join('')}</tr>`;
  const shown=invExpanded?inv.rows:inv.rows.slice(0,10);
  const body=shown.map(r=>`<tr><td>${r.date||''}</td>${cols.map(c=>cell(r.values[c])).join('')}</tr>`).join('');
  const note=inv.partial?`<div style="font-size:11px;color:var(--sub-2);margin-bottom:8px;background:#fff8ec;border:1px solid #ffe3b0;padding:8px 10px;border-radius:8px">ⓘ 세부 12분류는 거래소(KRX) 전용이라 해외 서버에서 차단됩니다. <b>${inv.source||'네이버'}</b> 기준 <b>외국인·기관</b> 순매매를 표시하며, <b>개인</b>은 −(외국인+기관)으로 추정한 값입니다.</div>`:'';
  const more=inv.rows.length>10?`<button class="inv-more" id="invMoreBtn">${invExpanded?'접기 ▲':`더보기 (${inv.rows.length}일) ▾`}</button>`:'';
  el.innerHTML=`<div class="inv-date">순매수 · 단위: 주 (빨강 +매수 · 파랑 −매도) · 출처 ${inv.source||'KRX'}</div>${note}
    <div style="overflow:auto"><table class="fin-table inv-table"><thead>${head}</thead><tbody>${totalRow}${body}</tbody></table></div>${more}`;
  const mb=$('invMoreBtn');if(mb)mb.onclick=()=>{invExpanded=!invExpanded;renderInfo();};
}
/* ══════════ AI 종목 분석 (실시간) ══════════
   일봉 60~120개 + 실시간 시세 + 컨센서스를 종합해 키워드·매수밴드·단기/장기 목표·
   상승 확률·차트 예측을 산출한다. 30초 자동 갱신 + 시세 틱마다 2.5초 스로틀 갱신. */
let _aiLast=0,_aiT=null;
const tickPx=(v)=>{const t=v<2000?1:v<5000?5:v<20000?10:v<50000?50:v<200000?100:v<500000?500:1000;return Math.round(v/t)*t;};
function linreg(arr){const n=arr.length;let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){sx+=i;sy+=arr[i];sxy+=i*arr[i];sxx+=i*i;}
  const b=(n*sxy-sx*sy)/(n*sxx-sx*sx||1);return {slope:b,intercept:(sy-b*sx)/n};}
/* ══════════ [v2.9] 매물대 분석 (Volume Profile / VPVR) ══════════
   가격대별로 실제 거래량이 얼마나 쌓였는지를 계산한다. 이 분포가 주가의
   지지·저항을 만든다 — 많이 거래된 가격대는 그 가격에 물린 사람이 많아
   반등하면 본전 매도가 쏟아지고(저항), 눌리면 저가 매수가 들어온다(지지).

   산출물
   · POC(최대 매물대)  : 거래량이 가장 두꺼운 가격대. 자석처럼 주가를 끌어당긴다.
   · 밸류에어리어(VA)  : 전체 거래량의 70%가 몰린 구간(VAL~VAH). 박스권의 실체.
   · HVN(매물벽)       : 국소적으로 두꺼운 매물대 → 저항/지지 후보
   · LVN(매물대 빈 구간): 거래가 거의 없던 가격대 → 진입하면 빠르게 통과(급등·급락 구간)
   · 매물 소화율       : 현재가 아래에 쌓인 거래량 비중. 높을수록 위쪽이 가볍다.
   · 머리 위 매물      : 현재가 위 거래량 비중 = 상승을 막는 잠재 매도 물량
   · 본전 매물 압력    : 현재가 바로 위(0~8%)에 물린 물량 — 가장 강한 단기 저항
   · 돌파/이탈 판정    : 최근 POC·VAH를 위로 뚫었는지, VAL을 아래로 잃었는지

   일봉의 고가~저가 구간에 거래량을 분배하되, 실제 체결이 종가 근처에 몰리는
   경향을 반영해 종가 구간에 30% 가중치를 더 준다. */
function volProfile(cd,px,bins){
  if(!cd||cd.length<25||!(px>0))return null;
  const arr=cd.slice(-120);
  let lo=Infinity,hi=-Infinity;
  arr.forEach(k=>{const l=+(k.l||k.c)||0,h=+(k.h||k.c)||0;if(l>0&&l<lo)lo=l;if(h>hi)hi=h;});
  if(!(hi>lo))return null;
  lo=Math.min(lo,px);hi=Math.max(hi,px);              // 현재가가 범위 밖이면 확장
  bins=bins||46;
  const step=(hi-lo)/bins;
  if(!(step>0))return null;
  const vol=new Array(bins).fill(0);
  const idx=(v)=>Math.max(0,Math.min(bins-1,Math.floor((v-lo)/step)));
  arr.forEach(k=>{
    const v=+k.v||0; if(v<=0)return;
    const a=idx(+(k.l||k.c)),b=idx(+(k.h||k.c)),c=idx(+k.c);
    const n=Math.max(1,b-a+1);
    for(let i=a;i<=b;i++)vol[i]+=v*0.7/n;             // 고가~저가 균등 분배
    vol[c]+=v*0.3;                                    // 종가 구간 가중
  });
  const total=vol.reduce((t,x)=>t+x,0);
  if(!(total>0))return null;
  const mid=(i)=>lo+step*(i+0.5);
  const pct=(x)=>x/total*100;

  let poc=0; for(let i=1;i<bins;i++)if(vol[i]>vol[poc])poc=i;
  // 밸류에어리어 70% — POC에서 양옆으로 두꺼운 쪽부터 넓힌다
  let li=poc,hiI=poc,acc=vol[poc],guard=0;
  while(acc<total*0.7&&(li>0||hiI<bins-1)&&guard++<bins*2){
    const dn=li>0?vol[li-1]:-1,up=hiI<bins-1?vol[hiI+1]:-1;
    if(up>=dn){hiI++;acc+=vol[hiI];}else{li--;acc+=vol[li];}
  }
  const vah=mid(hiI),val=mid(li),pocP=mid(poc);
  const ci=idx(px);
  let below=0; for(let i=0;i<ci;i++)below+=vol[i];
  below+=vol[ci]*0.5;
  const digest=Math.max(0,Math.min(100,pct(below)));  // 매물 소화율
  const overhead=100-digest;                          // 머리 위 매물

  const avg=total/bins;
  const hvn=[],lvn=[];
  for(let i=0;i<bins;i++){
    const l=i?vol[i-1]:-1,r=i<bins-1?vol[i+1]:-1;
    if(vol[i]>=avg*1.30&&vol[i]>=l&&vol[i]>=r)hvn.push({p:mid(i),w:pct(vol[i])});
    if(vol[i]<=avg*0.42&&vol[i]<=(l<0?Infinity:l)&&vol[i]<=(r<0?Infinity:r)&&i>0&&i<bins-1)lvn.push({p:mid(i),w:pct(vol[i])});
  }
  const res=hvn.filter(x=>x.p>px*1.004).sort((a,b)=>a.p-b.p)[0]||null;   // 위쪽 첫 매물벽
  const sup=hvn.filter(x=>x.p<px*0.996).sort((a,b)=>b.p-a.p)[0]||null;   // 아래쪽 첫 매물벽
  const gapUp=lvn.filter(x=>x.p>px).sort((a,b)=>a.p-b.p)[0]||null;       // 위쪽 첫 빈 구간
  const gapDn=lvn.filter(x=>x.p<px).sort((a,b)=>b.p-a.p)[0]||null;

  // 본전 매물 압력 — 현재가 바로 위 0~8% 구간에 물린 비중
  let trap=0;
  for(let i=ci+1;i<bins;i++){ if(mid(i)>px*1.08)break; trap+=vol[i]; }
  trap=pct(trap);

  // 돌파/이탈 — 10거래일 전 종가와 비교
  const ago=arr.length>=11?+arr[arr.length-11].c:px;
  const brokePoc=ago<pocP*0.998&&px>pocP*1.004;
  const brokeVah=ago<vah*0.998&&px>vah*1.004;
  const lostVal=ago>val*1.002&&px<val*0.996;
  const inVa=px>=val&&px<=vah;

  let zone;
  if(px>vah*1.004)zone={k:'above',label:'밸류에어리어 상단 돌파',tone:'up'};
  else if(px<val*0.996)zone={k:'below',label:'밸류에어리어 하단 이탈',tone:'down'};
  else if(px>=pocP)zone={k:'upperVa',label:'박스권 상단부(POC 위)',tone:'up'};
  else zone={k:'lowerVa',label:'박스권 하단부(POC 아래)',tone:'flat'};

  return {lo,hi,step,bins,vol,total,poc,pocP,vah,val,ci,digest,overhead,
          hvn,lvn,res,sup,gapUp,gapDn,trap,brokePoc,brokeVah,lostVal,inVa,zone,days:arr.length};
}
function aiCompute(code){
  const s=byCode[code];if(!s||s.price==null||!s.prevClose)return null;
  const cd=_sumDaily[code]||candleCache[code+':D'];
  if(!cd||cd.length<40)return {need:true};
  const _dq=dispQuote(code);
  const d=dailyFeat(cd),q=qBasis(s),px=(_dq&&_dq.price!=null)?_dq.price:s.price;   // [수정] 헤더와 같은 통합가
  const closes=cd.map(x=>x.c);
  // 변동성(20일 일간수익률 표준편차)
  const rets=[];for(let i=Math.max(1,closes.length-20);i<closes.length;i++)rets.push((closes[i]-closes[i-1])/closes[i-1]);
  const volD=Math.sqrt(rets.reduce((a,r)=>a+r*r,0)/(rets.length||1));
  const mom20=d.ma20?((px-closes[closes.length-21>=0?closes.length-21:0])/closes[Math.max(0,closes.length-21)]*100):0;
  const trendUp=px>d.ma5&&d.ma5>d.ma20&&d.ma20>d.ma60;
  const trendDn=px<d.ma5&&d.ma5<d.ma20&&d.ma20<d.ma60;
  const volR=d.v20?Math.round(d.v5/d.v20*10)/10:1;
  const nearHi25=px>=d.hi25*0.97,overVwap=px>d.vwap60;
  const macdUp=d.macd>d.signal;
  // ── 종합 점수(0~100) ──
  let sc=50;
  sc+=trendUp?14:trendDn?-14:(px>d.ma20?5:-5);
  sc+=macdUp?6:-6;
  sc+=d.rsi>=55&&d.rsi<=70?8:d.rsi>70&&d.rsi<=78?3:d.rsi>78?-8:d.rsi>=45?2:d.rsi<32?-4:-2;
  sc+=volR>=2.5?9:volR>=1.5?5:volR<0.6?-4:0;
  sc+=overVwap?5:-4;
  sc+=nearHi25?5:(px<=d.lo20*1.03?-3:0);
  sc+=Math.max(-6,Math.min(6,q.chg*0.8));
  sc+=Math.max(-5,Math.min(5,mom20*0.15));
  const rg=marketRegime();
  const sec=stockSectorRate(code);                   // [v1.99] 해당 종목 업종/테마의 오늘 등락
  if(sec)sc+=Math.max(-8,Math.min(12,sec.rate*1.3)); // 주도 섹터면 대폭 가점, 급락 섹터면 감점
  /* [v2.9] 매물대 반영 — 기술적 지표만으로는 '왜 여기서 막히는가'를 설명하지 못한다.
     머리 위에 쌓인 물량이 두꺼우면 같은 신호라도 상승이 무겁고, 매물을 뚫고
     올라선 직후에는 그 매물대가 지지로 바뀌어 상승이 가벼워진다. */
  const vp=volProfile(cd,px);
  if(vp){
    sc+=vp.digest>=75?7:vp.digest>=60?4:vp.digest<=25?-6:vp.digest<=40?-3:0;   // 매물 소화 정도
    if(vp.brokeVah)sc+=8; else if(vp.brokePoc)sc+=5;                            // 매물대 돌파
    if(vp.lostVal)sc-=8;                                                        // 하단 이탈
    if(vp.trap>=22)sc-=5; else if(vp.trap>=14)sc-=2;                            // 본전 매물 압력
    if(vp.gapUp&&vp.res&&vp.gapUp.p<vp.res.p)sc+=4;                             // 위쪽이 빈 구간이면 가볍다
    if(vp.res&&vp.res.w>=4.5&&vp.res.p<px*1.05)sc-=4;                           // 코앞에 두꺼운 매물벽
    sc=Math.max(3,Math.min(97,Math.round(sc)));
  }
  sc=sc*(0.82+rg.mult*0.18);                         // 시장 분위기(무드) 배수
  sc=Math.max(3,Math.min(97,Math.round(sc)));
  // ── 상승 확률(3거래일 내 +5%) — 점수 로지스틱 + 시장국면 + 과거 스캔 적중률 보정 ──
  let p=100/(1+Math.exp(-(sc-56)/11));
  const acc=surgeAcc(null);if(acc&&acc.n>=15)p=p*0.75+acc.rate*0.25;
  p=Math.max(4,Math.min(88,Math.round(p*rg.mult)));
  // ── 가격 전략 ──
  const sup1=Math.min(d.ma5,px*0.995),sup2=Math.max(Math.min(d.ma20,d.vwap60),px*0.90);
  let buyLo=tickPx(Math.min(sup2,px*0.985)),buyHi=tickPx(Math.max(buyLo*1.004,Math.min(sup1,px*0.998)));
  if(buyHi>=px)buyHi=tickPx(px*0.997);if(buyLo>=buyHi)buyLo=tickPx(buyHi*0.985);
  if(rg.score>=65||(sec&&sec.rate>=3)){              // [v1.99] 강세 국면 — 깊은 눌림만 기다리다 놓치지 않게 밴드를 얕게
    buyLo=tickPx(Math.max(buyLo,(d.ma5+d.ma20)/2));
    buyHi=tickPx(Math.max(buyHi,px*0.994));
    if(buyHi>=px)buyHi=tickPx(px*0.998);
    if(buyLo>=buyHi)buyLo=tickPx(buyHi*0.99);
  }
  /* [v2.9] 매수밴드 하단은 '아래쪽 매물벽(지지)' 위로 붙인다 —
     지지 매물대는 실제로 매수가 들어오는 자리라 이론상 눌림선보다 신뢰도가 높다. */
  if(vp&&vp.sup&&vp.sup.p<px*0.999&&vp.sup.p>px*0.90){
    buyLo=tickPx(Math.max(buyLo,vp.sup.p*0.998));
    if(buyHi<=buyLo)buyHi=tickPx(buyLo*1.006);
    if(buyHi>=px)buyHi=tickPx(px*0.998);
    if(buyLo>=buyHi)buyLo=tickPx(buyHi*0.99);
  }
  const lv=surgeLevels(s,q.chg);
  const rangeP=Math.max(2,Math.min(12,volD*100*1.6));
  let st=tickPx(Math.max(px*(1+rangeP*1.6/100),lv.target));
  if(nearHi25&&d.hi25>px)st=tickPx(Math.max(st,d.hi25*1.015));
  /* 단기 목표는 위쪽 매물벽 앞에서 한 번 끊는다. 다만 그 벽이 얇거나(2.5% 미만)
     이미 돌파한 상태면 벽 위쪽까지 열어 준다. */
  if(vp&&vp.res&&vp.res.p>px*1.01){
    if(vp.res.w>=3.2&&!vp.brokeVah)st=tickPx(Math.min(st,vp.res.p*0.995));
    else st=tickPx(Math.max(st,vp.res.p*1.012));
  }
  if(st<=px*1.005)st=tickPx(px*1.02);
  const cc=(typeof calcConsensus==='function'&&curFund&&curFund.code===code)?calcConsensus():null;
  const consT=cc?(cc.target||(cc.est&&cc.est.target))||null:null;
  const projPct=Math.max(8,Math.min(45,(d.hi60/px-1)*100*0.75+(trendUp?10:trendDn?-2:4)+mom20*0.2));
  let lt=px*(1+projPct/100);
  if(consT)lt=consT*0.6+lt*0.4;
  lt=tickPx(Math.max(lt,st*1.03));
  /* [v1.99] 시장 분위기 반영 — 강세장(무드 배수↑)은 목표 상향, 약세장은 보수적으로 */
  const mF=0.8+rg.mult*0.3;
  st=tickPx(px+(st-px)*mF);
  lt=tickPx(px+(lt-px)*(0.85+rg.mult*0.25));
  if(st<=px)st=tickPx(px*1.02);
  if(lt<=st*1.02)lt=tickPx(st*1.05);
  const stop=tickPx(Math.min(lv.stop,buyLo*0.97));
  // ── 키워드 ──
  const kw=[];
  if(sec&&sec.rate>=3)kw.push([`${sec.name} 섹터 강세 ${pctS(sec.rate)}`,'up']);
  else if(sec&&sec.rate<=-3)kw.push([`${sec.name} 섹터 약세 ${pctS(sec.rate)}`,'down']);
  kw.push(trendUp?['정배열 추세','up']:trendDn?['역배열 · 추세 약함','down']:px>d.ma20?['20일선 위','up']:['20일선 아래','down']);
  if(macdUp)kw.push(['MACD 상방','up']);
  kw.push(d.rsi>=70?['RSI 과열('+Math.round(d.rsi)+')','down']:d.rsi<=32?['RSI 침체('+Math.round(d.rsi)+') · 반등 관찰','flat']:['RSI '+Math.round(d.rsi)+' 안정권','up']);
  if(volR>=2.5)kw.push(['거래량 폭발 '+volR+'배','up']);else if(volR>=1.5)kw.push(['거래량 증가 '+volR+'배','up']);
  if(nearHi25)kw.push(['25일 신고가권','up']);
  if(px>=d.hi60*0.97)kw.push(['60일 신고가권','up']);
  if(overVwap)kw.push(['VWAP 위','up']);
  if(vp){
    if(vp.brokeVah)kw.push(['매물대 상단 돌파','up']);
    else if(vp.brokePoc)kw.push(['최대 매물대 돌파','up']);
    else if(vp.lostVal)kw.push(['매물대 하단 이탈','down']);
    if(vp.digest>=75)kw.push(['매물 소화 '+Math.round(vp.digest)+'% · 위가 가볍다','up']);
    else if(vp.overhead>=60)kw.push(['머리 위 매물 '+Math.round(vp.overhead)+'%','down']);
    if(vp.trap>=18)kw.push(['본전 매물 압력 '+Math.round(vp.trap)+'%','down']);
    if(vp.res&&vp.res.p<px*1.06&&vp.res.w>=3.2)kw.push(['매물벽 '+KRW(tickPx(vp.res.p))+' 저항','down']);
    if(vp.sup&&vp.sup.p>px*0.95&&vp.sup.w>=3.2)kw.push(['매물대 지지 '+KRW(tickPx(vp.sup.p)),'up']);
    if(vp.gapUp&&vp.res&&vp.gapUp.p<vp.res.p)kw.push(['위쪽 매물 공백 구간','up']);
  }
  if(px<=d.lo20*1.04)kw.push(['낙폭 과대 구간','flat']);
  if(volD*100>=4.5)kw.push(['고변동성 '+(volD*100).toFixed(1)+'%','down']);
  if(d.streak>=3)kw.push([d.streak+'일 연속 상승','up']);
  if(nxtCapability(code)===true)kw.push(['NXT 거래 가능','flat']);
  const per=curFund&&curFund.code===code?sumStatNum(['PER']):null;
  const pbr=curFund&&curFund.code===code?sumStatNum(['PBR']):null;
  if(per!=null&&per>0&&per<9)kw.push(['저PER '+per.toFixed(1),'up']);
  if(pbr!=null&&pbr>0&&pbr<1)kw.push(['PBR '+pbr.toFixed(2)+' 저평가','up']);
  const grade=sc>=72?['적극 관심','up']:sc>=58?['매수 우위','up']:sc>=42?['중립 · 관망','flat']:sc>=28?['약세 우위','down']:['위험 · 회피','down'];
  const line=trendUp&&volR>=1.5?'추세와 수급이 함께 좋은 자리입니다. 눌림에서 분할 접근이 유리해요.'
    :trendUp?'추세는 살아 있으나 거래량 확인이 필요합니다.'
    :trendDn?'추세가 꺾여 있어 반등 확인 전 신규 진입은 신중해야 합니다.'
    :d.rsi<=32?'과매도 구간입니다. 급반등이 나올 수 있지만 하락 추세면 짧게 대응하세요.'
    :'뚜렷한 방향이 없는 구간입니다. 박스 상단 돌파/하단 이탈을 기다리는 편이 낫습니다.';
  return {sc,grade,line,p,kw:kw.slice(0,14),buyLo,buyHi,st,lt,stop,d,q,volD,volR,mom20,trendUp,trendDn,consT,rg,sec,px,closes,cd,vp};
}
function drawAiForecast(cv,a){
  if(!cv)return;const dpr=window.devicePixelRatio||1;
  const W=cv.clientWidth||600,H=cv.clientHeight||190;
  cv.width=W*dpr;cv.height=H*dpr;const x=cv.getContext('2d');x.scale(dpr,dpr);
  const hist=a.closes.slice(-60),N=hist.length,F=10;
  const {slope}=linreg(a.closes.slice(-20));
  const last=a.px,volA=a.volD*last;
  const up=[],base=[],dn=[];
  for(let k=1;k<=F;k++){const drift=slope*k*0.85,cone=volA*1.05*Math.sqrt(k);
    base.push(last+drift);up.push(last+drift+cone);dn.push(Math.max(last*0.5,last+drift-cone));}
  const all=[...hist,...up,...dn,last];
  let lo=Math.min(...all),hi=Math.max(...all);const pad=(hi-lo)*0.08||1;lo-=pad;hi+=pad;
  const padL=6,padR=52,padT=10,padB=18,pw=W-padL-padR,ph=H-padT-padB;
  const X=(i)=>padL+i/(N+F-1)*pw,Y=(v)=>padT+(1-(v-lo)/(hi-lo))*ph;
  const dk=document.documentElement.getAttribute('data-theme')==='dark';
  // 예측 원뿔
  x.beginPath();x.moveTo(X(N-1),Y(last));
  up.forEach((v,i)=>x.lineTo(X(N+i),Y(v)));
  for(let i=dn.length-1;i>=0;i--)x.lineTo(X(N+i),Y(dn[i]));
  x.closePath();x.fillStyle=dk?'rgba(96,165,250,.14)':'rgba(59,130,246,.10)';x.fill();
  // 과거선
  x.strokeStyle=dk?'#cbd5e1':'#334155';x.lineWidth=1.6;x.beginPath();
  hist.forEach((v,i)=>{i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v));});x.stroke();
  // 시나리오 3선
  const path=(arr,col,dash)=>{x.strokeStyle=col;x.lineWidth=1.6;x.setLineDash(dash);x.beginPath();
    x.moveTo(X(N-1),Y(last));arr.forEach((v,i)=>x.lineTo(X(N+i),Y(v)));x.stroke();x.setLineDash([]);};
  path(up,'#ef4444',[4,3]);path(base,dk?'#93c5fd':'#2563eb',[]);path(dn,'#3b82f6',[4,3]);
  // 현재가 기준선
  x.strokeStyle=dk?'rgba(148,163,184,.4)':'rgba(100,116,139,.35)';x.setLineDash([3,4]);
  x.beginPath();x.moveTo(padL,Y(last));x.lineTo(W-padR,Y(last));x.stroke();x.setLineDash([]);
  // 끝값 라벨
  x.font='bold 10px Pretendard';x.textBaseline='middle';
  const lab=(v,col)=>{x.fillStyle=col;x.fillText((v>=last?'+':'')+((v-last)/last*100).toFixed(1)+'%',W-padR+5,Y(v));};
  lab(up[F-1],'#ef4444');lab(base[F-1],dk?'#93c5fd':'#2563eb');lab(dn[F-1],'#3b82f6');
}
/* [v2.9] 매물대 가로 막대 차트 — 세로축 가격, 가로축 그 가격대의 거래량 비중.
   POC(최대 매물대)·밸류에어리어·현재가·저항/지지 매물벽을 함께 표시한다. */
/* 매물대 수치를 사람이 읽는 한 문단으로 옮긴다 — 숫자만 던지지 않고 뜻을 설명한다. */
function vpNarrative(vp,px){
  const P=[];
  if(vp.brokeVah)P.push('최근 거래량이 가장 두껍게 쌓인 구간을 <b>위로 뚫고 올라섰습니다</b>. 돌파한 매물대는 대개 지지로 바뀌므로, 되눌림에서 '+KRW(tickPx(vp.vah))+'원을 지켜 주는지가 관건입니다.');
  else if(vp.brokePoc)P.push('최대 매물대('+KRW(tickPx(vp.pocP))+'원)를 <b>위로 통과</b>했습니다. 다만 위쪽 밸류에어리어 상단 '+KRW(tickPx(vp.vah))+'원이 아직 남아 있어 한 번 더 저항을 받을 수 있습니다.');
  else if(vp.lostVal)P.push('거래가 몰렸던 구간을 <b>아래로 이탈</b>했습니다. 이탈한 매물대는 저항으로 바뀌어, 되돌림이 나와도 '+KRW(tickPx(vp.val))+'원 부근에서 막힐 가능성이 큽니다.');
  else if(vp.inVa)P.push('전체 거래량의 70%가 몰린 <b>박스권 안</b>에 있습니다. 이 구간은 매수·매도가 팽팽해 방향이 잘 안 나옵니다. '+KRW(tickPx(vp.vah))+'원 돌파나 '+KRW(tickPx(vp.val))+'원 이탈이 나올 때 대응하는 편이 낫습니다.');
  if(vp.overhead>=60)P.push('현재가 위에 전체의 <b>'+Math.round(vp.overhead)+'%</b>가 물려 있어 오를수록 본전 매도가 계속 나옵니다. 상승이 무거운 구조입니다.');
  else if(vp.digest>=75)P.push('매물의 <b>'+Math.round(vp.digest)+'%</b>를 이미 아래에 두고 있어 위쪽이 가볍습니다. 거래량만 실리면 저항 없이 빠르게 오를 수 있는 자리입니다.');
  if(vp.trap>=18)P.push('바로 위 8% 안에 <b>'+vp.trap.toFixed(1)+'%</b>가 몰려 있습니다. 손실 구간을 갓 벗어난 물량이라 단기 저항이 가장 강한 지점입니다.');
  if(vp.gapUp&&(!vp.res||vp.gapUp.p<vp.res.p))P.push(KRW(tickPx(vp.gapUp.p))+'원 부근은 <b>거래가 거의 없던 빈 구간</b>입니다. 매물이 없어 한 번 진입하면 빠르게 통과하는 경향이 있습니다.');
  if(vp.gapDn&&vp.gapDn.p>px*0.93)P.push('반대로 아래 '+KRW(tickPx(vp.gapDn.p))+'원도 매물 공백이라, 밀리기 시작하면 그 구간까지 낙폭이 빨라질 수 있습니다.');
  if(!P.length)P.push('매물 분포가 비교적 고르게 퍼져 있어 특정 가격대의 지지·저항이 뚜렷하지 않습니다.');
  return P.join(' ');
}
function drawVolProfile(cv,vp,px){
  if(!cv||!vp)return;
  const dpr=window.devicePixelRatio||1;
  const W=cv.clientWidth||480,H=cv.clientHeight||210;
  cv.width=W*dpr;cv.height=H*dpr;
  const x=cv.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,W,H);
  const dk=document.documentElement.getAttribute('data-theme')==='dark';
  const padL=6,padR=74,padT=8,padB=8;
  const pw=W-padL-padR,ph=H-padT-padB;
  const maxV=Math.max.apply(null,vp.vol)||1;
  const Y=(v)=>padT+(1-(v-vp.lo)/(vp.hi-vp.lo))*ph;
  const bh=Math.max(1.5,ph/vp.bins-1);
  const upC=getCss('--up','#e5443b'),dnC=getCss('--down','#2f74ff');
  // 밸류에어리어 배경
  x.fillStyle=dk?'rgba(148,163,184,.13)':'rgba(100,116,139,.10)';
  x.fillRect(padL,Y(vp.vah),pw,Math.max(2,Y(vp.val)-Y(vp.vah)));
  // 막대
  for(let i=0;i<vp.bins;i++){
    const p=vp.lo+vp.step*(i+0.5);
    const w=vp.vol[i]/maxV*pw;
    const isPoc=i===vp.poc;
    x.fillStyle=isPoc?(dk?'#fbbf24':'#d97706')
      :p<=px?(dk?'rgba(96,165,250,.55)':'rgba(47,116,255,.42)')
            :(dk?'rgba(248,113,113,.5)':'rgba(229,68,59,.38)');
    x.fillRect(padL,Y(p)-bh/2,Math.max(1,w),bh);
  }
  const lineAt=(v,col,dash,label,strong)=>{
    if(v==null||v<vp.lo||v>vp.hi)return;
    x.strokeStyle=col;x.lineWidth=strong?1.7:1.1;x.setLineDash(dash);
    x.beginPath();x.moveTo(padL,Y(v));x.lineTo(W-padR+2,Y(v));x.stroke();x.setLineDash([]);
    x.fillStyle=col;x.font=(strong?'bold ':'')+'9.5px Pretendard';x.textBaseline='middle';
    x.fillText(label,W-padR+6,Y(v));
  };
  lineAt(vp.pocP,dk?'#fbbf24':'#b45309',[],'POC '+KRW(Math.round(vp.pocP)),true);
  if(vp.res)lineAt(vp.res.p,upC,[4,3],'저항 '+KRW(Math.round(vp.res.p)));
  if(vp.sup)lineAt(vp.sup.p,dnC,[4,3],'지지 '+KRW(Math.round(vp.sup.p)));
  lineAt(px,dk?'#e2e8f0':'#0f172a',[2,2],'현재 '+KRW(Math.round(px)),true);
}
function renderAiStock(el,force){
  el=el||$('infoBody');if(!el)return;
  const code=selected,now=Date.now();
  if(!force&&el.dataset.ai===code&&el.querySelector('.ai-wrap')&&now-_aiLast<2500)return;
  const a=aiCompute(code);
  const nm=(byCode[code]&&byCode[code].name)||code;
  if(!a){el.innerHTML='<div class="empty">시세 수신 중…</div>';el.dataset.ai=code;return;}
  if(a.need){
    el.innerHTML='<div class="empty">AI가 '+nm+'의 일봉 데이터를 분석하는 중…</div>';el.dataset.ai=code;
    ensureDailySummary(code).then(()=>{if(currentView==='trade'&&infoTab==='ai'&&selected===code)renderAiStock($('infoBody'),true);});
    return;
  }
  _aiLast=now;el.dataset.ai=code;
  if(curFund==null||curFund.code!==code)loadFundamentals(code);   // 장기 목표에 컨센서스 반영(도착 시 자동 재렌더)
  if(!moodCache)ensureMood().then(()=>{if(currentView==='trade'&&infoTab==='ai'&&selected===code)renderAiStock($('infoBody'),true);});
  if(!thmCache.upjong&&!thmLoading.upjong)loadThemes('upjong').then(()=>{if(currentView==='trade'&&infoTab==='ai'&&selected===code)renderAiStock($('infoBody'),true);});
  const B=sessionBasis();
  const pctUp=(v)=>((v-a.px)/a.px*100).toFixed(1);
  const kwHtml=a.kw.map(k=>`<span class="ai-kw ${k[1]}">${k[0]}</span>`).join('');
  el.innerHTML=`<div class="ai-wrap">
    <div class="ai-head">
      <div class="ai-score"><div class="ai-sc-n num">${a.sc}</div><div class="ai-sc-l">종합 점수</div></div>
      <div class="ai-hd-b">
        <div class="ai-grade ${a.grade[1]}">${a.grade[0]}</div>
        <div class="ai-line">${a.line}</div>
        <div class="ai-gauge"><i style="width:${a.sc}%"></i></div>
      </div>
    </div>
    <div class="ai-basis"><i class="lv-dot"></i>LIVE · ${B.label} · ${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')} 분석 · 30초 자동 갱신</div>
    <div class="ai-sec-t">실시간 시장 분위기 <span>지수 · 업종 강세 · 뉴스 심리 종합 (5분 주기)</span></div>
    <div class="ai-mood">
      <div class="ai-mood-hd"><b class="num">${a.rg.score}</b><span class="ai-mood-lb ${a.rg.score>=58?'up':a.rg.score<=41?'down':''}">${(a.rg.mood&&a.rg.mood.label)||a.rg.label}</span>
        ${a.sec?`<span class="ai-kw ${a.sec.rate>=0?'up':'down'}" style="margin-left:auto">이 종목 섹터: ${a.sec.name} ${pctS(a.sec.rate)}</span>`:''}</div>
      <div class="ai-gauge"><i style="width:${a.rg.score}%"></i></div>
      ${(a.rg.mood&&a.rg.mood.drivers&&a.rg.mood.drivers.length)?`<div class="ai-mood-drv">${a.rg.mood.drivers.map(dv=>`<span class="ai-kw ${dv[1]}">${dv[0]}</span>`).join('')}</div>`:''}
      <div class="ai-prob-d">이 분위기 점수가 종합 점수·추천 매수밴드·단기/장기 목표에 실시간 반영됩니다${moodCache&&moodCache.sent?'':' · 뉴스 심리 수집 중'}.</div>
    </div>
    <div class="ai-sec-t">종목 키워드</div>
    <div class="ai-kws">${kwHtml}</div>
    <div class="ai-sec-t">가격 전략 <span>현재가 ${KRW(a.px)}원 기준</span></div>
    <div class="ai-cards">
      <div class="ai-card buy"><div class="k">추천 매수가</div><div class="v num">${KRW(a.buyLo)}~${KRW(a.buyHi)}</div><div class="s num">${pctUp(a.buyHi)}% ~ ${pctUp(a.buyLo)}% 눌림 분할</div></div>
      <div class="ai-card tgt1"><div class="k">단기 매도 목표</div><div class="v num">${KRW(a.st)}</div><div class="s num up">+${pctUp(a.st)}% · 3~10거래일</div></div>
      <div class="ai-card tgt2"><div class="k">장기 매도 목표</div><div class="v num">${KRW(a.lt)}</div><div class="s num up">+${pctUp(a.lt)}% · 1~6개월${a.consT?' · 컨센서스 반영':''}</div></div>
      <div class="ai-card stop"><div class="k">손절 라인</div><div class="v num">${KRW(a.stop)}</div><div class="s num down">${pctUp(a.stop)}% · 이탈 시 리스크 관리</div></div>
    </div>
    <div class="ai-sec-t">상승 확률 <span>3거래일 내 +5% 도달 추정</span></div>
    <div class="ai-prob"><div class="ai-prob-bar"><i style="width:${a.p}%"></i></div><b class="num ${a.p>=55?'up':a.p<=35?'down':''}">${a.p}%</b></div>
    <div class="ai-prob-d">기술 신호 ${a.sc}점을 과거 유사 신호 통계와 시장 국면(${a.rg.label} ×${a.rg.mult})으로 보정한 값입니다.</div>
    ${a.vp?`
    <div class="ai-sec-t">매물대 분석 <span>최근 ${a.vp.days}거래일 · 가격대별 누적 거래량</span></div>
    <div class="vp-zone ${a.vp.zone.tone}">현재 위치 · <b>${a.vp.zone.label}</b>${a.vp.brokeVah?' · 최근 10일 내 상단 돌파':a.vp.brokePoc?' · 최근 10일 내 POC 돌파':a.vp.lostVal?' · 최근 10일 내 하단 이탈':''}</div>
    <div class="vp-wrap"><canvas id="aiVp"></canvas></div>
    <div class="vp-bar"><i class="d" style="width:${a.vp.digest.toFixed(1)}%"></i><i class="o" style="width:${a.vp.overhead.toFixed(1)}%"></i></div>
    <div class="vp-bar-lg"><span><b class="num">${Math.round(a.vp.digest)}%</b> 소화한 매물(현재가 아래)</span><span><b class="num">${Math.round(a.vp.overhead)}%</b> 머리 위 매물</span></div>
    <div class="ai-metrics vp-m">
      <div><span>최대 매물대 (POC)</span><b class="num">${KRW(tickPx(a.vp.pocP))}</b></div>
      <div><span>밸류에어리어 70%</span><b class="num">${KRW(tickPx(a.vp.val))}~${KRW(tickPx(a.vp.vah))}</b></div>
      <div><span>위쪽 매물벽 (저항)</span><b class="num ${a.vp.res?'down':''}">${a.vp.res?KRW(tickPx(a.vp.res.p))+' ('+a.vp.res.w.toFixed(1)+'%)':'없음 · 위가 비어 있음'}</b></div>
      <div><span>아래 매물벽 (지지)</span><b class="num ${a.vp.sup?'up':''}">${a.vp.sup?KRW(tickPx(a.vp.sup.p))+' ('+a.vp.sup.w.toFixed(1)+'%)':'없음 · 하방 지지 얇음'}</b></div>
      <div><span>매물 빈 구간 (위)</span><b class="num">${a.vp.gapUp?KRW(tickPx(a.vp.gapUp.p)):'—'}</b></div>
      <div><span>매물 빈 구간 (아래)</span><b class="num">${a.vp.gapDn?KRW(tickPx(a.vp.gapDn.p)):'—'}</b></div>
      <div><span>본전 매물 압력</span><b class="num ${a.vp.trap>=18?'down':''}">${a.vp.trap.toFixed(1)}%</b></div>
      <div><span>매물벽 개수</span><b class="num">${a.vp.hvn.length}곳 · 공백 ${a.vp.lvn.length}곳</b></div>
    </div>
    <div class="ai-prob-d">${vpNarrative(a.vp,a.px)}</div>`:''}
    <div class="ai-sec-t">차트 예측 <span>향후 10거래일 · 추세+변동성 시나리오</span></div>
    <div class="ai-fc"><canvas id="aiFc"></canvas>
      <div class="ai-fc-lg"><span><i class="a"></i>낙관</span><span><i class="b"></i>기본(추세 연장)</span><span><i class="c"></i>보수</span></div></div>
    <div class="ai-sec-t">세부 지표</div>
    <div class="ai-metrics">
      <div><span>RSI(14)</span><b class="num">${Math.round(a.d.rsi)}</b></div>
      <div><span>MACD</span><b class="${a.d.macd>a.d.signal?'up':'down'}">${a.d.macd>a.d.signal?'상방':'하방'}</b></div>
      <div><span>이평 배열</span><b class="${a.trendUp?'up':a.trendDn?'down':''}">${a.trendUp?'정배열':a.trendDn?'역배열':'혼조'}</b></div>
      <div><span>거래량(5일/20일)</span><b class="num ${a.volR>=1.5?'up':''}">${a.volR}배</b></div>
      <div><span>20일 수익률</span><b class="num ${a.mom20>=0?'up':'down'}">${a.mom20>=0?'+':''}${a.mom20.toFixed(1)}%</b></div>
      <div><span>일변동성(20일)</span><b class="num">${(a.volD*100).toFixed(1)}%</b></div>
      <div><span>시장 국면</span><b class="${a.rg.label==='강세'?'up':a.rg.label==='약세'?'down':''}">${a.rg.label} ${a.rg.score}점</b></div>
      <div><span>세션 기준</span><b>${a.q.live?'당일':'마지막 장'}</b></div>
    </div>
    <div class="ai-note">⚠ 공개 시세·지표 기반 알고리즘 분석으로 <b>투자 자문이 아닌 참고용</b>입니다. 목표가·확률은 보장이 아니며, 투자 판단과 책임은 본인에게 있습니다.</div>
  </div>`;
  requestAnimationFrame(()=>{drawAiForecast($('aiFc'),a);if(a.vp)drawVolProfile($('aiVp'),a.vp,a.px);});
  clearTimeout(_aiT);
  _aiT=setTimeout(()=>{if(currentView==='trade'&&infoTab==='ai'&&selected===code)renderAiStock($('infoBody'),true);},30e3);
}
function calcConsensus(){
  const c=curFund&&curFund.consensus;if(!c)return null;
  const _cq=dispQuote(selected);
  const price=(_cq&&_cq.price!=null)?_cq.price:(byCode[selected]&&byCode[selected].price);   // [수정] 통합가 기준 상승여력
  // 애널리스트 점수(1~5, 5=강력매수). 야후 recMean은 1=강력매수라 뒤집음
  let analyst=null;
  if(c.recMean!=null)analyst=6-Number(c.recMean);
  else if(c.naverScore!=null)analyst=Number(c.naverScore);          // [수정] 네이버 '투자의견 4.00매수'의 숫자 점수(1~5, 높을수록 매수)
  else if(typeof c.naverOpinion==='number')analyst=Number(c.naverOpinion);
  const target=c.targetMean!=null?Number(c.targetMean):(typeof c.naverTarget==='number'?c.naverTarget:null);
  const src=c.targetSource||null;   // 야후·통합 API 에 없어 '네이버 투자정보' 표에서 가져온 경우 표기
  const upside=(target&&price)?((target-price)/price):null;
  // 기술적 점수(1~5)
  let tech=3;
  if(upside!=null){if(upside>0.30)tech+=2;else if(upside>0.12)tech+=1;else if(upside<-0.20)tech-=2;else if(upside<-0.05)tech-=1;}
  if(curCandles&&curCandles.length>=20&&price){
    const cl=curCandles.map(x=>x.c);const avg=(n)=>cl.slice(-n).reduce((s,v)=>s+v,0)/n;
    const ma5=avg(5),ma20=avg(20);
    if(price>ma5&&ma5>ma20)tech+=0.5;else if(price<ma5&&ma5<ma20)tech-=0.5;
  }
  tech=Math.max(1,Math.min(5,tech));
  const ai=analyst!=null?(0.5*analyst+0.5*tech):tech;
  return {analyst,tech,ai:Math.round(ai*10)/10,target,src,targetHigh:c.targetHigh?Number(c.targetHigh):null,targetLow:c.targetLow?Number(c.targetLow):null,upside,num:c.numAnalysts,price,est:c.estimate||null};
}
const scoreLabel=(s)=>s>=4.3?'강력매수':s>=3.4?'매수':s>=2.6?'중립':s>=1.7?'매도':'강력매도';
function renderConsensus(el){
  const d=calcConsensus();
  const stats=curFund.stats||[];
  if(!d||(d.ai==null&&d.target==null&&!(d.est&&d.est.target))){
    let h='<div class="empty">컨센서스 데이터를 불러오지 못했습니다.<br><span style="font-size:11px">애널리스트 커버리지가 있는 종목에서 표시됩니다.</span></div>';
    if(stats.length)h+=`<div style="font-weight:800;margin:18px 0 10px">주요 투자지표</div><div class="inv-grid">${stats.slice(0,15).map(s=>`<div class="inv-cell"><div class="n">${s.label}</div><div class="v">${s.value}</div></div>`).join('')}</div>`;
    el.innerHTML=h;return;
  }
  const pos=Math.max(0,Math.min(100,(d.ai-1)/4*100));
  const lbl=scoreLabel(d.ai);
  const col=d.ai>=3.4?'var(--up)':d.ai<=2.6?'var(--down)':'#8a95a5';
  let html=`<div class="cons-head">AI 실시간 투자의견 <span style="font-size:11px;color:var(--sub-2);font-weight:600">· 애널리스트 컨센서스 + 실시간 기술적 신호 자동 산출</span></div>
  <div class="gauge-wrap">
    <div class="gauge-bar"><div class="gauge-pin" style="left:${pos}%"><div class="gauge-bubble" style="background:${col}">${d.ai.toFixed(1)}</div></div></div>
    <div class="gauge-scale"><span>강력매도</span><span>매도</span><span>중립</span><span>매수</span><span>강력매수</span></div>
    <div class="gauge-verdict" style="color:${col}">${lbl}</div>
  </div>
  <div class="cons-sub">${d.analyst!=null?`애널리스트 컨센서스 <b>${d.analyst.toFixed(1)}</b>`:'애널리스트 데이터 없음'} · 기술적 신호 <b>${d.tech.toFixed(1)}</b>${d.num?` · ${d.num}개 증권사`:''}</div>`;
  // 목표주가 (종합을 상단에)
  const allB=((curFund.consensus&&curFund.consensus.brokers)||[]);
  const withT=allB.filter(b=>b.target);
  /* [수정 · 모든 종목 목표주가 보장]
     ① 증권사 리포트 평균 → ② 야후·네이버 컨센서스 → ③ 서버가 계산한 AI 자동 추정 밴드(참고용).
     ③은 'AI 추정' 배지로 명확히 구분해, 커버리지 없는 중소형주도 빈 화면 대신 참고 밴드를 보여 준다. */
  let finalTgt=withT.length?Math.round(withT.reduce((s,b)=>s+Number(b.target),0)/withT.length):(d.target||null);
  const isEst=!finalTgt&&d.est&&d.est.target;
  if(isEst)finalTgt=d.est.target;
  const price0=byCode[selected]&&byCode[selected].price;
  const upside=(finalTgt&&price0)?((finalTgt-price0)/price0):d.upside;
  const tHigh=isEst?d.est.high:d.targetHigh, tLow=isEst?d.est.low:d.targetLow;
  const cnt=withT.length||d.num||null;
  const srcLbl=withT.length?` (${withT.length}개 평균)`:isEst?' · AI 자동 추정':(finalTgt&&d.src?` · ${d.src}`:'');
  html+=`<div style="font-weight:800;margin:18px 0 10px">목표주가 ${isEst?'<span class="est-badge">AI 추정 · 참고용</span>':'(증권사 컨센서스)'}</div>
  ${(function(){var p=byCode[selected]&&byCode[selected].price,h=curFund&&curFund.h52,l=curFund&&curFund.l52;
    if(!(h&&l&&h>l&&p))return '';
    var pos=Math.max(0,Math.min(100,(p-l)/(h-l)*100));
    return '<div class="w52"><div class="w52-t">52주 범위 <i>현재 '+pos.toFixed(0)+'% 지점</i></div>'
      +'<div class="w52-bar"><i style="left:'+pos+'%" title="현재 '+KRW(p)+'원 · 52주 최저 '+KRW(l)+' / 최고 '+KRW(h)+'"></i></div>'
      +'<div class="w52-lb"><span>'+KRW(l)+'</span><span>'+KRW(h)+'</span></div></div>';})()}
  <div class="final-target"><span>종합 목표주가${srcLbl}</span><b>${finalTgt?KRW(finalTgt)+'원':'<span style="font-size:14px;color:var(--sub-2)">산출 불가</span>'}${isEst?' <span class="est-badge sm">AI</span>':''}</b></div>
  ${isEst?`<div class="sum-note est-note" style="text-align:left;margin-bottom:12px">목표주가를 제시한 증권사 리포트가 아직 없는 종목이라, 공개 지표(${d.est.basis||'EPS·BPS·52주 범위'})로 산출한 <b>AI 자동 추정 밴드</b>를 참고용으로 표시합니다. 증권사 컨센서스가 아니며, 리포트가 나오면 자동으로 대체됩니다.</div>`:''}
  ${!finalTgt?'<div class="sum-note" style="text-align:left;margin-bottom:12px">추정에 필요한 지표가 부족한 종목입니다. 데이터가 수집되면 자동으로 표시됩니다.</div>':''}
  ${cnt&&!isEst?`<div class="sum-note" style="text-align:left;margin-bottom:12px">※ 평균 목표주가는 최근 리포트에서 목표가를 제시한 <b>${cnt}개 증권사</b> 추정치 기준입니다.</div>`:''}
  <div class="cons-cards two">
    <div class="cons-card"><div class="k">현재가 대비</div><div class="v ${upside==null?'':(upside>0?'up':'down')}">${upside==null?'—':pctS(upside*100)}</div></div>
    <div class="cons-card"><div class="k">${isEst?'추정 상단 / 하단':'최고 / 최저'}</div><div class="v" style="font-size:15px">${tHigh?KRW(tHigh):'—'} / ${tLow?KRW(tLow):'—'}</div></div>
  </div>`;
  // 증권사별 목표주가 (표만, 종합 박스는 위로 이동됨)
  if(withT.length){
    html+=`<div style="font-weight:800;margin:20px 0 10px">증권사별 목표주가</div>
    <div style="overflow:auto"><table class="fin-table"><thead><tr><th>증권사</th><th>목표주가</th><th>투자의견</th><th>발표일</th></tr></thead>
    <tbody>${withT.map(b=>`<tr><td>${b.broker||'—'}</td><td style="font-weight:700">${KRW(b.target)}원</td><td>${b.opinion||'—'}</td><td style="color:var(--sub-2)">${(b.date||'').toString().slice(0,10)}</td></tr>`).join('')}</tbody></table></div>`;
  }else if(allB.length){
    html+=`<div style="font-weight:800;margin:20px 0 10px">증권사 리포트</div>
    <div style="overflow:auto"><table class="fin-table"><thead><tr><th>증권사</th><th>제목</th><th>발표일</th></tr></thead>
    <tbody>${allB.slice(0,15).map(b=>`<tr><td style="white-space:nowrap">${b.broker||'—'}</td><td style="text-align:left;max-width:240px;white-space:normal">${b.title||'—'}</td><td style="color:var(--sub-2);white-space:nowrap">${(b.date||'').toString().slice(0,10)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  if(stats.length)html+=`<div style="font-weight:800;margin:20px 0 10px">주요 투자지표</div><div class="inv-grid">${stats.slice(0,12).map(s=>`<div class="inv-cell"><div class="n">${s.label}</div><div class="v">${s.value}</div></div>`).join('')}</div>`;
  html+=`<div style="margin-top:14px;font-size:11px;color:var(--sub-2)">※ AI 투자의견은 공개 데이터로 자동 산출한 참고 지표이며, 투자 권유가 아닙니다.</div>`;
  el.innerHTML=html;
}
const numish2=(v)=>{if(v==null)return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return isNaN(n)?null:n;};
// 재무 행을 4개 탭으로 분류
function classifyFin(title){
  const t=title.replace(/\s/g,'');
  if(/(률|율|ROE|ROA|EPS|BPS|PER|PBR|PCR|PSR|EV|배당|DPS|비율|유보|주당|EBITDA|CAPEX|FCF)/i.test(t))return'metrics';
  if(/(매출|영업이익|매출총이익|판매비|당기순이익|순이익|영업손익|세전)/.test(t))return'income';
  if(/(자산|부채|자본)/.test(t))return'balance';
  if(/(영업활동|투자활동|재무활동|현금)/.test(t))return'cashflow';
  return'metrics';
}
function renderFinance(el){
  const fin=curFund.finance||{};
  const tabs=[['income','손익계산서'],['balance','재무상태표'],['cashflow','현금흐름표'],['metrics','투자지표']];
  const sub=`<div class="fin-sub">${tabs.map(([k,l])=>`<button data-fin="${k}" class="${k===finKind?'on':''}">${l}</button>`).join('')}</div>`;
  const tbl=fin[finKind];
  let body;
  if(tbl&&tbl.periods&&tbl.rows&&tbl.rows.length){
    const cols=tbl.periods.slice(-4);
    const isMetric=finKind==='metrics';
    const src=(finKind==='balance'||finKind==='cashflow')?'야후 파이낸스':'네이버 금융';
    body=`<div style="text-align:right;font-size:11px;color:var(--sub-2);margin-bottom:8px">단위: ${isMetric?'% 또는 원/배':'억원'} · 연간 · ${src}</div>
    <div style="overflow:auto"><table class="fin-table"><thead><tr><th>항목</th>${cols.map(c=>`<th>${c.title}${c.forecast?'(E)':''}</th>`).join('')}</tr></thead>
      <tbody>${tbl.rows.map(r=>`<tr><td>${r.title}</td>${cols.map(c=>{const v=r.values[c.key];const neg=typeof v==='string'&&v.trim().startsWith('-');return `<td class="${neg?'down':''}">${v==null||v===''?'—':v}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
  }else{
    const label=tabs.find(t=>t[0]===finKind)[1];
    body=`<div class="empty">${label} 데이터를 불러오지 못했습니다.<br><span style="font-size:11px">잠시 후 다시 시도하거나 다른 종목에서 확인해 보세요.</span></div>`;
  }
  el.innerHTML=sub+body;
  el.querySelectorAll('[data-fin]').forEach(b=>b.onclick=()=>{finKind=b.dataset.fin;renderFinance(el);});
}

/* 계좌 */
function renderHoldings(){
  const totEval=holdings.reduce((a,h)=>a+hEvalKRW(h),0)||1;
  const hc=$('holdCount');if(hc)hc.textContent=holdings.length?`· ${holdings.length}종목 · 평가 ${KRW(totEval)}원`:'';
  $('holdBody').innerHTML=holdings.length? holdings.map(h=>{const s=byCode[h.code]||{name:h.code,price:null,prevClose:null,market:''},price=s.price??h.avg;
    /* [v4.28] 해외 보유: 단가는 $, 평가·손익은 원화 환산 */
    const evalAmt=hEvalKRW(h),cost=hCostKRW(h),pnl=evalAmt-cost,rate=cost?pnl/cost*100:0,dir=dirOf(pnl);
    const wgt=evalAmt/totEval*100;
    const P=(v)=>h.us?('$'+USD2(v)):KRW(v);
    return `<tr data-code="${h.code}" ${h.us?'data-usopen="1"':''}><td><div class="td-l">${h.us?usTick(h.code):stockLogo(h.code,s.name)}<div class="td-t"><span class="nm">${s.name}</span>${h.us?'<span class="mkt-tag nxt" style="background:#1d3f8f">🇺🇸 미국</span>':mktTag(h.code,s.market)}<br><span class="cd num">${h.code}</span></div></div></td>
      <td class="num">${h.us?fmtQty(h.qty):KRW(h.qty)}</td><td class="num">${P(h.avg)}</td>
      <td class="num ${s.price!=null?dirOf(s.price-s.prevClose):'flat'}">${P(price)}</td>
      <td class="num">${KRW(evalAmt)}</td><td class="num ${dir}">${signed(pnl)}</td><td class="num ${dir}">${pctS(rate)}</td>
      <td class="hw-cell"><div class="hw-bar"><i style="width:${Math.min(100,wgt).toFixed(1)}%"></i></div><span class="num">${wgt.toFixed(1)}%</span></td>
      <td class="cdl-td">${miniCandle(h.code)}</td></tr>`;}).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--sub-2);padding:26px">보유 종목이 없습니다. 거래·주문에서 매수해 보세요.</td></tr>';
  $('holdBody').querySelectorAll('tr[data-usopen]').forEach(tr=>{tr.onclick=(e)=>{e.stopPropagation();openUS(tr.dataset.code);};});
  bindStockClicks($('holdBody'));
  if(currentView==='account')safeRun('acctx',renderAcctExtras);   // [v2.5.2] 시세 갱신에 맞춰 신규 코너도 동반 갱신
}
/* ══ [v4.28] 보유 평가 헬퍼 — 국내(원·정수)와 해외(달러·소수·환율) 공용 ══ */
function hEvalKRW(h){
  try{ const s=byCode[h.code]||{};const px=s.price!=null?s.price:h.avg;
    return h.us?Math.round((+px||0)*(h.qty||0)*(usFx()||0)):Math.round((+px||0)*(h.qty||0));
  }catch(e){ return 0; }}
function hCostKRW(h){
  try{ return h.us?Math.round((+h.avg||0)*(h.qty||0)*(usFx()||0)):Math.round((+h.avg||0)*(h.qty||0));
  }catch(e){ return 0; }}
function renderPortfolioNumbers(){
  /* [v4.5] 어떤 값이 깨져도 총자산이 NaN 으로 새지 않게 정수로 정규화한 뒤 계산한다. */
  let te=0,tc=0;(Array.isArray(holdings)?holdings:[]).forEach(h=>{
    if(!h)return;const q=intOf(h.qty,0);if(q<=0)return;
    if(h.us){ /* [v4.28] 해외: 소수 평단 × 환율 — intOf 로 깎으면 달러 평단이 왜곡된다 */
      te+=hEvalKRW(h); tc+=hCostKRW(h); return; }
    const s=byCode[h.code]||{};const av=intOf(h.avg,0);
    const price=intOf(s.price!=null?s.price:av,av);
    te+=price*q;tc+=av*q;});
  cash=intOf(cash,0);if(cash<0)cash=0;
  const usdKrw=Math.round(((+usdCash)||0)*(usFx()||0));            // [v4.29] 달러 예수금 원화 환산
  const pnl=te-tc,assets=te+cash+usdKrw,rate=tc?pnl/tc*100:0,dir=dirOf(pnl);
  const set=(id,txt,cls)=>{const e=$(id);if(!e)return;e.textContent=txt;if(cls!==undefined)e.className='num '+cls;};
  set('homeAssets',KRW(assets)+'원');set('homePnl',signed(pnl),dir);set('homeRate',pctS(rate),dir);set('homeCash',KRW(cash)+'원');
  /* ══ [v4.61] 총자산 줄 오른쪽에 달러 자산을 함께 ═══════════════════════════
     원화 합계만 크게 띄우니 '해외에 얼마가 들어가 있는지'가 한 줄 아래로 밀렸다.
     달러 예수금 + 해외 보유 평가액을 달러로 환산해 같은 줄 끝에 붙인다. */
  try{
    const usdBox=$('homeUsdTop');
    if(usdBox){
      const fx=usFx()||0;
      let usHold=0; (holdings||[]).forEach(h=>{ if(h&&h.us)usHold+=hEvalKRW(h); });
      const usdTotal=(+usdCash||0)+(fx>0?usHold/fx:0);
      if(usdTotal>0.004){
        usdBox.hidden=false;
        usdBox.innerHTML=`<b class="num">$${USD2(usdTotal)}</b><span>해외 자산</span>`;
      } else usdBox.hidden=true;
    }
  }catch(e){}
  /* ══ [v4.41] 홈 총자산을 국내·해외로 나눠 보여 준다 ═══════════════════════
     해외 종목과 달러 예수금이 생겼는데 화면은 합계 하나만 보여 줘서
     어디에 얼마가 들어가 있는지 알 수 없었다. 달러 예수금을 따로 띄우고,
     보유 평가액을 국내/해외로 갈라 비중 막대로 보여 준다. */
  {const uw=$('homeUsdWrap');
   if(uw){ uw.hidden=!(usdCash>0);
     if(usdCash>0)set('homeUsd','$'+USD2(usdCash)+' · '+KRW(usdKrw)+'원'); }}
  try{
    const sp=$('assetSplit');
    if(sp){
      let krE=0,usE=0;
      (holdings||[]).forEach(hh=>{ if(!hh)return; (hh.us?(usE+=hEvalKRW(hh)):(krE+=hEvalKRW(hh))); });
      const usTot=usE+usdKrw, krTot=krE+cash, all=usTot+krTot;
      if(all>0&&(usTot>0||holdings.some(x=>x&&x.us))){
        sp.hidden=false;
        const kp=krTot/all*100, up=100-kp;
        /* [v4.61] 해외가 0.2% 라도 막대에 보이게 최소 폭을 준다 —
           '해외 19,983원 0%' 처럼 있는데 없는 것처럼 보이던 문제. */
        const kw=Math.max(up>0?2:0,Math.min(100,kp)), uw=100-kw;
        const fmt=(v)=>v>0&&v<1?v.toFixed(2):v.toFixed(0);
        sp.innerHTML=`<div class="as-bar"><i class="kr" style="width:${kw}%"></i><i class="us" style="width:${uw}%"></i></div>
          <div class="as-lb">
            <span><b>🇰🇷 국내</b> ${KRW(krTot)}원 <i>${fmt(kp)}%</i></span>
            <span><b>🇺🇸 해외</b> ${KRW(usTot)}원 <i>${fmt(up)}%</i></span>
          </div>`;
      } else sp.hidden=true;
    }
  }catch(e){}
  set('acctAssets',KRW(assets)+'원');set('acctPnl',signed(pnl),dir);set('acctRate',pctS(rate),dir);set('acctCash',KRW(cash)+'원'+(usdCash>0?' + $'+USD2(usdCash):''));
}
/* 예수금 설정 */
/* [v4.5] 예수금 직접 설정도 정수·비음수·상한으로 묶는다(깨진 값이 총자산을 오염시키던 통로) */
const CASH_MAX=1e15;
function setCash(v){cash=Math.min(CASH_MAX,Math.max(0,intOf(v,0)));saveState();
  if($('cashInput'))$('cashInput').value=KRW(cash);
  renderPortfolioNumbers();renderHoldings();syncMaxQty();}
$('cashSet').onclick=()=>{const v=parseInt(($('cashInput').value||'0').replace(/[^0-9]/g,''))||0;setCash(v);toast('buy','예수금 설정',KRW(cash)+'원');};
$('cashAdd').onclick=()=>{setCash(cash+1000000);};
$('cashInput').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^0-9,]/g,'');});

/* 공모주 플래너 */
// 공모 일정: /api/ipo(38커뮤니케이션) 시도 → 실패 시 샘플로 대체. 일정·내용 중심.
const IPO_SAMPLE=[
  {name:'인제니아테라퓨틱스',subStart:'2026-07-30',subEnd:'2026-07-31',refund:'2026-08-04',listing:'',priceBand:'12,000~14,500',brokers:['삼성증권'],sector:'바이오·신약개발',product:'항체 신약 파이프라인',demand:1820},
  {name:'딜리셔스',subStart:'2026-08-03',subEnd:'2026-08-04',refund:'2026-08-06',listing:'',priceBand:'18,000~21,000',brokers:['한국투자증권','신한투자증권'],sector:'플랫폼(패션 B2B)',product:'신상마켓 도매 플랫폼',demand:2470},
  {name:'빅웨이브로보틱스',subStart:'2026-08-05',subEnd:'2026-08-06',refund:'2026-08-10',listing:'',priceBand:'9,000~11,000',brokers:['유진투자증권','미래에셋증권'],sector:'소프트웨어 개발 및 공급업',product:'로봇 플랫폼(마로솔, 솔링크)',demand:3439},
];
let ipoList=[];
const ipoDate=(s)=>{if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const fmtDot=(s)=>s?s.replace(/-/g,'.'):'미정';
function daysTo(s){const t=ipoDate(s);if(!t)return null;const now=new Date();now.setHours(0,0,0,0);return Math.round((t-now)/86400000);}
function ddayLabel(it){
  const now=new Date();now.setHours(0,0,0,0);
  const st=ipoDate(it.subStart),en=ipoDate(it.subEnd)||st;
  if(st&&en&&now>=st&&now<=en)return{txt:'청약중',cls:'live'};
  const ds=daysTo(it.subStart);
  if(ds===null)return{txt:'예정',cls:''};
  if(ds<0)return{txt:'마감',cls:'done'};
  if(ds===0)return{txt:'D-DAY',cls:'live'};
  return{txt:'D-'+ds,cls:''};
}
async function pollIpo(){
  {const s0=$('ipoStatus');if(s0)s0.textContent='공모 일정을 불러오는 중…';}
  /* [v4.8 · 완성] 서버(/api/ipo)는 38커뮤니케이션 주소 3곳을 각 6초씩 순회하므로
     최악 18초가 걸릴 수 있는데, 클라이언트가 8초 만에 끊어 버려서
     서버가 성공해도 화면은 예시 일정으로 떨어졌다(타임아웃 역전).
     → 대기 20초로 확대 + 실패 시 1회 즉시 재시도(서버 KV 보관본이 이때 잡힌다)
     + 보관본(stale)이면 확보 시각을 밝혀 준다 + 예시로 떨어져도 30초 뒤 1회 자동 재시도. */
  let items=[],stale=false,gotAt=0;
  for(let tryN=0;tryN<2&&!items.length;tryN++){
    try{const ac=new AbortController();const tm=setTimeout(()=>ac.abort(),20000);
      try{const r=await fetch('/api/ipo',{cache:'no-store',signal:ac.signal});const j=await r.json();
        if(j&&j.ok&&Array.isArray(j.items)&&j.items.length){items=j.items;stale=!!j.stale;gotAt=+j.at||0;}
      }finally{clearTimeout(tm);}
    }catch(e){}
    if(!items.length&&tryN===0)await new Promise(r=>setTimeout(r,1200));
  }
  const st=$('ipoStatus');
  if(items.length){
    ipoList=items;
    const when=gotAt?new Date(gotAt+9*3600e3).toISOString().slice(5,16).replace('T',' ').replace('-','.'):'';
    if(st)st.innerHTML=stale
      ?`상류 응답 지연 — <b>마지막 확보 일정</b>${when?` (${when} 기준)`:''}을 표시합니다 · 출처: 38커뮤니케이션`
      :'출처: 38커뮤니케이션 공모청약 일정 · 청약 전 DART에서 최종 확인하세요';
  }else{
    ipoList=IPO_SAMPLE;
    if(st)st.innerHTML='실시간 일정을 못 불러와 <b>예시 일정</b>을 표시합니다 (새로고침으로 재시도).';
    pollIpo._auto=(pollIpo._auto||0)+1;
    if(pollIpo._auto<=2)setTimeout(()=>{try{if(ipoList===IPO_SAMPLE)pollIpo();}catch(e){}},30000);
  }
  safeRun('ipoRender',renderIpo);
}
let ipoTab='upcoming';
document.querySelectorAll('.ipo2-tabs button').forEach(b=>b.onclick=()=>{ipoTab=b.dataset.itab;document.querySelectorAll('.ipo2-tabs button').forEach(x=>x.classList.toggle('on',x===b));renderIpo();});
$('ipoRefresh').onclick=()=>pollIpo();
let ipoExpanded=new Set();
function ipoCardHtml(it,idx){
  const dd=ddayLabel(it),marked=ipoPlans.includes(it.name);
  const brokers=(it.brokers||[]).map(b=>`<span class="ipo-brk">${b}</span>`).join('');
  const content=[it.sector?['업종',it.sector]:null,it.product?['주요제품',it.product]:null].filter(Boolean)
    .map(([k,v])=>`<div class="ipo-kv"><span>${k}</span><b>${v}</b></div>`).join('');
  const refund=it.refund||'';
  const exp=ipoExpanded.has(idx);
  return `<div class="ipo-card">
    <div class="ipo-card-top">
      <span class="dday ${dd.cls}">${dd.txt}</span>
      ${it.demand?`<span class="ipo-int">${KRW(it.demand)}명 관심</span>`:''}
      <span class="bm ${marked?'on':''}" data-bm="${idx}" title="관심 공모주">${marked?'🔖':'🏳️'}</span>
    </div>
    <div class="ipo-nm">${it.name}</div>
    <div class="ipo-band"><span>공모예정가</span><b>${it.priceBand?it.priceBand+'원':'미정'}</b></div>
    <div class="ipo-kv"><span>청약일</span><b>${fmtDot(it.subStart)}${it.subEnd?'~'+fmtDot(it.subEnd).slice(5):''}</b></div>
    <button class="ipo-detail-btn" data-exp="${idx}">세부 내용 조회 <span class="arr">${exp?'▲':'▼'}</span></button>
    <div class="ipo-detail" ${exp?'':'hidden'}>
      ${content}
      <div class="ipo-brokers"><span class="lb">청약 가능 증권사</span>${brokers||'<span class="ipo-brk gray">미정</span>'}</div>
      <div class="ipo-timeline">
        <div class="tl-item done"><i></i><div><div class="tl-t">공모주 청약 준비</div><div class="tl-s">청약 시작일 전 증권 계좌를 준비하세요</div></div></div>
        <div class="tl-item"><i></i><div><div class="tl-t">청약일 <span class="tl-d">${fmtDot(it.subStart)}${it.subEnd?'~'+fmtDot(it.subEnd).slice(5):''}</span></div><div class="tl-s">해당 증권사에서 공모주 청약</div></div></div>
        <div class="tl-item"><i></i><div><div class="tl-t">환불일 <span class="tl-d">${refund?fmtDot(refund):'예정'}</span></div><div class="tl-s">배정 수량만큼 차감 후 청약증거금 환불</div></div></div>
        <div class="tl-item"><i></i><div><div class="tl-t">상장일 <span class="tl-d">${it.listing?fmtDot(it.listing):'미정'}</span></div><div class="tl-s">상장 후 배정 주식 매수·매도 가능</div></div></div>
      </div>
      <div class="ipo-guide">예상 청약증거금(1주 기준): 공모가 상단의 50% · 균등/비례 배정 방식에 따라 달라집니다.</div>
    </div>
  </div>`;
}
function renderIpo(){
  const el=$('ipoCards');
  let list=ipoList.map((it,i)=>({it,i}));
  if(ipoTab==='watch')list=list.filter(x=>ipoPlans.includes(x.it.name));
  if(!list.length){el.innerHTML=`<div class="empty">${ipoTab==='watch'?'관심 공모주가 없습니다. 카드의 깃발을 눌러 담아 보세요.':'표시할 공모 일정이 없습니다.'}</div>`;return;}
  el.innerHTML=list.map(({it,i})=>ipoCardHtml(it,i)).join('');
  el.querySelectorAll('.bm').forEach(b=>b.onclick=()=>{
    const it=ipoList[+b.dataset.bm];const k=it.name;const idx=ipoPlans.indexOf(k);
    if(idx>=0){ipoPlans.splice(idx,1);toast('warn','관심 해제',k);}else{ipoPlans.push(k);toast('buy','관심 공모주 추가',k);}
    saveState();renderIpo();
  });
  el.querySelectorAll('.ipo-detail-btn').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.exp;if(ipoExpanded.has(i))ipoExpanded.delete(i);else ipoExpanded.add(i);renderIpo();
  });
}

/* ===== 캔들 차트 ===== */
const TFS=[['1m','1분'],['3m','3분'],['5m','5분'],['10m','10분'],['30m','30분'],['60m','60분'],['D','일'],['W','주'],['M','월'],['Y','년']];
const TFLABEL=Object.fromEntries(TFS);
const isMinute=(tf)=>tf.endsWith('m');const minutesOf=(tf)=>parseInt(tf);
let chartTf='D',curCandles=[],candleCache={},view={count:80,end:-1,follow:true};
const MAS=[[5,'#f0a020'],[20,'#e0407e'],[60,'#22a06b'],[120,'#7b5cff']];
const maOn={5:true,20:true,60:true,120:true};
function buildMaSeg(){$('maSeg').innerHTML=MAS.map(([p,c])=>`<button data-ma="${p}" class="${maOn[p]?'on':''}" style="color:${maOn[p]?c:''}"><span class="sw" style="background:${c}"></span>MA${p}</button>`).join('');
  $('maSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{const p=+b.dataset.ma;maOn[p]=!maOn[p];buildMaSeg();drawChart();});}
function buildTfSeg(){$('tfSeg').innerHTML=TFS.map(([k,l])=>`<button data-tf="${k}" ${k===chartTf?'class="on"':''}>${l}</button>`).join('');
  $('tfSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{chartTf=b.dataset.tf;$('tfSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));loadCandles();});}
function buildMinuteCandles(ticks,mins){
  if(!ticks||!ticks.length)return[];
  const ms=mins*60000,out=[];let cur=null;
  for(const t of ticks){const bk=Math.floor(t.t/ms)*ms;
    if(!cur||cur.t!==bk){if(cur)out.push(cur);cur={t:bk,o:t.p,h:t.p,l:t.p,c:t.p,v:0,_s:t.v};}
    cur.h=Math.max(cur.h,t.p);cur.l=Math.min(cur.l,t.p);cur.c=t.p;cur.v=Math.max(0,(t.v||0)-cur._s);}
  if(cur)out.push(cur);
  return out;
}
// "YYYYMMDDHHmm" / "YYYYMMDD" → ms
function dtToMs(d){d=String(d);const y=+d.slice(0,4),mo=+d.slice(4,6)-1,da=+d.slice(6,8),h=+(d.slice(8,10)||0),mi=+(d.slice(10,12)||0);return new Date(y,mo,da,h,mi).getTime();}
const intradayBase={}; // code -> [{t,o,h,l,c,v}] 1분봉(실제)
let minuteDiag='';
async function ensureIntraday(code){
  if(intradayBase[code]&&intradayBase[code].length)return; // 이미 받았으면 유지
  try{const mkt=(byCode[code]&&byCode[code].market==='코스닥')?'KOSDAQ':'KOSPI';
    const r=await fetch(`/api/chart?code=${code}&tf=MIN&mkt=${mkt}`,{cache:'default'});const j=await r.json();
    // OHLC 복구: 빠지거나 0인 값은 종가로 보정(캔들이 세로로 꽉 차는 버그 방지)
    let arr=(j.candles||[]).map(c=>{const cl=+c.c;if(!(cl>0))return null;
      let o=+c.o,h=+c.h,l=+c.l;if(!(o>0))o=cl;if(!(h>0))h=Math.max(o,cl);if(!(l>0))l=Math.min(o,cl);
      h=Math.max(h,o,cl);l=Math.min(l,o,cl);const t=dtToMs(c.d);if(isNaN(t))return null;
      return{t,o,h,l,c:cl,v:+c.v||0};}).filter(Boolean);
    // 가격대(중앙값) 밖 이상치 제거 — 축이 0/음수로 튀는 것 방지
    const cl=arr.map(c=>c.c).sort((a,b)=>a-b);const md=cl.length?cl[Math.floor(cl.length/2)]:0;
    if(md>0)arr=arr.filter(c=>c.c>=md*0.5&&c.c<=md*2&&c.h<=md*2&&c.l>=md*0.5);
    intradayBase[code]=arr;
    minuteDiag=(arr.length?'':'분봉 서버응답 ')+`[${j.src||'?'}]`;}
  catch(e){intradayBase[code]=intradayBase[code]||[];minuteDiag='분봉 로드 실패';}
}
// 실제 1분봉(과거) + 실시간 체결(틱)을 분 단위로 합쳐 mins봉 생성
function minuteSeries(code,mins){
  const base=intradayBase[code]||[];
  const live=buildMinuteCandles(byCode[code].ticks,1); // 틱→1분봉
  const map=new Map();
  base.forEach(c=>map.set(c.t,{t:c.t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v}));
  live.forEach(c=>{const ex=map.get(c.t);if(!ex)map.set(c.t,{t:c.t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v});
    else{ex.h=Math.max(ex.h,c.h);ex.l=Math.min(ex.l,c.l);ex.c=c.c;ex.v=Math.max(ex.v,c.v);}});
  const one=[...map.values()].sort((a,b)=>a.t-b.t);
  if(mins===1)return one.map(c=>({d:new Date(c.t).toTimeString().slice(0,5),o:c.o,h:c.h,l:c.l,c:c.c,v:c.v,t:c.t}));
  const ms=mins*60000,out=[];let cur=null;
  for(const c of one){const bk=Math.floor(c.t/ms)*ms;
    if(!cur||cur.t!==bk){if(cur)out.push(cur);cur={t:bk,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v};}
    else{cur.h=Math.max(cur.h,c.h);cur.l=Math.min(cur.l,c.l);cur.c=c.c;cur.v+=c.v;}}
  if(cur)out.push(cur);
  return out.map(c=>({d:new Date(c.t).toTimeString().slice(0,5),o:c.o,h:c.h,l:c.l,c:c.c,v:c.v,t:c.t}));
}
function resetView(){const n=curCandles.length;view.count=Math.min(n||60,isMinute(chartTf)?140:90);view.end=n-1;view.follow=true;}
let chartLoading=false;
async function loadCandles(retry){
  if(currentView==='ustrade')return usLoadIntoChart();     // [v4.57] 해외는 전용 적재기
  if(currentView!=='trade')return;
  const code=selected,tf=chartTf;
  if(isMinute(tf)){
    if(!intradayBase[code]){chartLoading=true;$('chartLegend').textContent='분봉 불러오는 중…';drawChart();await ensureIntraday(code);chartLoading=false;}
    if(selected!==code||chartTf!==tf)return;
    curCandles=minuteSeries(code,minutesOf(tf));resetView();drawChart();return;
  }
  const key=code+':'+tf;
  if(candleCache[key]&&candleCache[key].length){curCandles=candleCache[key];resetView();drawChart();return;}
  chartLoading=true;$('chartTip').hidden=true;$('chartLegend').textContent='차트 불러오는 중…';drawChart();
  try{const r=await fetch(`/api/chart?code=${code}&tf=${tf}`,{cache:'default'});const j=await r.json();curCandles=j.candles||[];if(curCandles.length)candleCache[key]=curCandles;}catch{curCandles=[];}
  chartLoading=false;
  if(selected!==code||chartTf!==tf)return; // 그 사이 종목/시간대 바뀌면 무시
  if(!curCandles.length&&!retry){setTimeout(()=>{if(selected===code&&chartTf===tf&&!(candleCache[key]&&candleCache[key].length))loadCandles(true);},1500);}
  resetView();drawChart();
}
const canvas=$('chart'),ctx=canvas.getContext('2d');
let hoverGX=null,hoverGY=null,chartGeo=null;

/* ══════════ [v3.6] 차트 설정 ══════════════════════════════════════════════
   증권사 MTS의 차트설정 패널을 본떠, 유형·오버레이·하단 지표를 사용자가 고른다.
   선택은 localStorage(chartCfg2)에 저장되어 다음 접속에도 유지된다. */
const CC_DEF={type:'candle',ma:{5:1,20:1,60:1,120:1},ov:{bb:0,env:0,ich:0,psar:0,pch:0,piv:0,vp:1},lower:'vol'};
let chartCfg=(()=>{try{const j=JSON.parse(localStorage.getItem('chartCfg2')||'null');
  if(j&&j.type)return {...CC_DEF,...j,ma:{...CC_DEF.ma,...(j.ma||{})},ov:{...CC_DEF.ov,...(j.ov||{})}};}catch(e){}
  return JSON.parse(JSON.stringify(CC_DEF));})();
function ccSave(){try{localStorage.setItem('chartCfg2',JSON.stringify(chartCfg));}catch(e){}}
let _pxSnap=null,_pxDirty=0;
let _ssPT=0;
function schedSearchPaint(){ if(_ssPT)return;
  _ssPT=setTimeout(()=>{_ssPT=0; if(currentView==='search')safeRun('srchLive',renderSearch);},200); }
function pxSnapLoad(){if(_pxSnap)return _pxSnap;try{_pxSnap=JSON.parse(localStorage.getItem('pxSnap')||'{}')||{};}catch(e){_pxSnap={};}return _pxSnap;}
function pxSnapPut(q){if(!q||!q.code||q.price==null)return;const m=pxSnapLoad();
  m[q.code]={p:q.price,pc:(q.prevClose!=null?q.prevClose:null),t:Date.now()};
  if(++_pxDirty>=25){_pxDirty=0;const ks=Object.keys(m);
    if(ks.length>1600)ks.sort((a,b)=>(m[a].t||0)-(m[b].t||0)).slice(0,ks.length-1600).forEach(k=>delete m[k]);
    try{localStorage.setItem('pxSnap',JSON.stringify(m));}catch(e){}}}
/* ── 지표 수학 ── */
function iSMA(a,p){const o=Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=p)s-=a[i-p];if(i>=p-1)o[i]=s/p;}return o;}
function iEMA(a,p){const o=Array(a.length).fill(null);const k=2/(p+1);let e=null;for(let i=0;i<a.length;i++){e=e==null?a[i]:a[i]*k+e*(1-k);if(i>=p-1)o[i]=e;}return o;}
function iSTD(a,p){const o=Array(a.length).fill(null);for(let i=p-1;i<a.length;i++){let m=0;for(let j=i-p+1;j<=i;j++)m+=a[j];m/=p;let v=0;for(let j=i-p+1;j<=i;j++)v+=(a[j]-m)**2;o[i]=Math.sqrt(v/p);}return o;}
function iRSI(cs,p){const o=Array(cs.length).fill(null);let g=0,l=0;for(let i=1;i<cs.length;i++){const d=cs[i].c-cs[i-1].c,up=Math.max(d,0),dn=Math.max(-d,0);
  if(i<=p){g+=up;l+=dn;if(i===p){g/=p;l/=p;o[i]=l===0?100:100-100/(1+g/l);}}
  else{g=(g*(p-1)+up)/p;l=(l*(p-1)+dn)/p;o[i]=l===0?100:100-100/(1+g/l);}}return o;}
function iATR(cs,p){const tr=cs.map((c,i)=>i?Math.max(c.h-c.l,Math.abs(c.h-cs[i-1].c),Math.abs(c.l-cs[i-1].c)):c.h-c.l);
  const o=Array(cs.length).fill(null);let a=0;for(let i=0;i<cs.length;i++){if(i<p){a+=tr[i];if(i===p-1)o[i]=a/p;}else{a=o[i-1]!=null?(o[i-1]*(p-1)+tr[i])/p:a;o[i]=a;}}return o;}
function iDMI(cs,p){const n=cs.length,pdi=Array(n).fill(null),mdi=Array(n).fill(null),adx=Array(n).fill(null);
  let trS=0,pS=0,mS=0,ax=null;
  for(let i=1;i<n;i++){const up=cs[i].h-cs[i-1].h,dn=cs[i-1].l-cs[i].l;
    const pdm=(up>dn&&up>0)?up:0,mdm=(dn>up&&dn>0)?dn:0;
    const tr=Math.max(cs[i].h-cs[i].l,Math.abs(cs[i].h-cs[i-1].c),Math.abs(cs[i].l-cs[i-1].c));
    if(i<=p){trS+=tr;pS+=pdm;mS+=mdm;}else{trS=trS-trS/p+tr;pS=pS-pS/p+pdm;mS=mS-mS/p+mdm;}
    if(i>=p){const P=trS?100*pS/trS:0,M=trS?100*mS/trS:0;pdi[i]=P;mdi[i]=M;
      const dx=(P+M)?100*Math.abs(P-M)/(P+M):0;ax=ax==null?dx:(ax*(p-1)+dx)/p;if(i>=p*2)adx[i]=ax;}}
  return {pdi,mdi,adx};}
function iStoch(cs,k,d1,d2){const n=cs.length,K=Array(n).fill(null);
  for(let i=k-1;i<n;i++){let hh=-1/0,ll=1/0;for(let j=i-k+1;j<=i;j++){hh=Math.max(hh,cs[j].h);ll=Math.min(ll,cs[j].l);}
    K[i]=hh>ll?100*(cs[i].c-ll)/(hh-ll):50;}
  const sm=(a,p)=>{const o=Array(a.length).fill(null);for(let i=0;i<a.length;i++){if(a[i]==null)continue;let s=0,c=0;for(let j=Math.max(0,i-p+1);j<=i;j++){if(a[j]!=null){s+=a[j];c++;}}if(c===p)o[i]=s/p;}return o;};
  const KS=sm(K,d1);return {k:KS,d:sm(KS,d2)};}
function ccBind(){const g=$('ccGear');if(g&&!g._b){g._b=1;g.onclick=openChartCfg;}}
const CC_LOWERS=[['vol','거래량 (매수·매도)'],['volma','거래량 + 이동평균 20'],['obv','OBV'],['mfi','MFI 14'],['cmf','CMF 20'],
 ['rsi','RSI 14'],['macd','MACD 12·26·9'],['stoch','Stochastic Slow 12·5·5'],['cci','CCI 20'],['dmi','DMI · ADX 14'],
 ['mom','모멘텀 10'],['willr','Williams %R 14'],['atr','ATR 14'],['psy','심리도 12'],['disp','이격도 20']];
const CC_LBL=Object.fromEntries(CC_LOWERS);
/* ── 하단 지표 그리기 ── */
function drawLowerPane(ctx,cs,start,end,X,padL,plotW,volTop,volH,PAL,UP,DOWN){
  const key=chartCfg.lower, cl=cs.map(c=>c.c);
  const seg=(vals,col,w)=>{ctx.strokeStyle=col;ctx.lineWidth=w||1.4;ctx.lineJoin='round';ctx.beginPath();let st2=false;
    for(let gi=start;gi<=end;gi++){const v=vals[gi];if(v==null||!isFinite(v)){st2=false;continue;}
      const x=X(gi-start),y=SC(v);if(st2)ctx.lineTo(x,y);else{ctx.moveTo(x,y);st2=true;}}ctx.stroke();};
  let series=[],bars=null,refs=[],fmt=v=>String(Math.round(v));
  if(key==='volma'){const vv=cs.map(c=>c.v),ma=iSMA(vv,20);series=[[ma,'#f59e0b',1.6]];
    let vmax=0;for(let i=start;i<=end;i++)vmax=Math.max(vmax,vv[i],ma[i]||0);
    const SCv=v=>volTop+(1-(vmax?v/vmax:0))*volH;
    for(let i=start;i<=end;i++){const c=cs[i],up=c.c>=c.o;ctx.fillStyle=up?'rgba(245,56,78,.4)':'rgba(47,116,255,.4)';
      const x=X(i-start),y=SCv(c.v);ctx.fillRect(x-2,y,4,Math.max(1,volTop+volH-y));}
    var SC=SCv; series.forEach(([v,c,w])=>seg(v,c,w)); return;}
  else if(key==='obv'){let o=0;const a=cs.map((c,i)=>{if(i)o+=c.c>cs[i-1].c?c.v:c.c<cs[i-1].c?-c.v:0;return o;});series=[[a,'#3b82f6']];fmt=v=>KRW(Math.round(v));}
  else if(key==='mfi'){const n=cs.length,a=Array(n).fill(null);let pm=0,nm=0;const tp=cs.map(c=>(c.h+c.l+c.c)/3);
    for(let i=1;i<n;i++){const mf=tp[i]*cs[i].v;if(tp[i]>tp[i-1])pm+=mf;else nm+=mf;
      if(i>=14){if(i>14){const ot=tp[i-14]*cs[i-14].v;if(tp[i-14]>tp[i-15])pm-=ot;else nm-=ot;}a[i]=nm===0?100:100-100/(1+pm/nm);}}
    series=[[a,'#8b5cf6']];refs=[20,80];}
  else if(key==='cmf'){const n=cs.length,a=Array(n).fill(null);let mv=0,vv2=0;
    for(let i=0;i<n;i++){const c=cs[i],m=(c.h===c.l)?0:((c.c-c.l)-(c.h-c.c))/(c.h-c.l)*c.v;mv+=m;vv2+=c.v;
      if(i>=20){const c0=cs[i-20],m0=(c0.h===c0.l)?0:((c0.c-c0.l)-(c0.h-c0.c))/(c0.h-c0.l)*c0.v;mv-=m0;vv2-=c0.v;}
      if(i>=19)a[i]=vv2?mv/vv2:0;}
    series=[[a,'#0ea5e9']];refs=[0];fmt=v=>v.toFixed(2);}
  else if(key==='rsi'){series=[[iRSI(cs,14),'#8b5cf6']];refs=[30,70];}
  else if(key==='macd'){const f=iEMA(cl,12),sl=iEMA(cl,26);const m=cl.map((_,i)=>f[i]!=null&&sl[i]!=null?f[i]-sl[i]:null);
    const sig=(a=>{const o=Array(a.length).fill(null);const k=2/10;let e=null;for(let i=0;i<a.length;i++){if(a[i]==null)continue;e=e==null?a[i]:a[i]*k+e*(1-k);o[i]=e;}return o;})(m);
    bars=m.map((v,i)=>v!=null&&sig[i]!=null?v-sig[i]:null);series=[[m,'#3b82f6',1.6],[sig,'#f59e0b',1.3]];refs=[0];fmt=v=>v.toFixed(0);}
  else if(key==='stoch'){const st2=iStoch(cs,12,5,5);series=[[st2.k,'#3b82f6',1.6],[st2.d,'#f59e0b',1.3]];refs=[20,80];}
  else if(key==='cci'){const tp=cs.map(c=>(c.h+c.l+c.c)/3),ma=iSMA(tp,20),a=tp.map((v,i)=>{if(ma[i]==null)return null;
      let md=0;for(let j=i-19;j<=i;j++)md+=Math.abs(tp[j]-ma[i]);md/=20;return md?(v-ma[i])/(0.015*md):0;});
    series=[[a,'#3b82f6']];refs=[-100,100];}
  else if(key==='dmi'){const d=iDMI(cs,14);series=[[d.pdi,'#f5384e',1.3],[d.mdi,'#2f74ff',1.3],[d.adx,'#111827',1.7]];refs=[25];}
  else if(key==='mom'){const a=cl.map((v,i)=>i>=10?v-cl[i-10]:null);series=[[a,'#3b82f6']];refs=[0];fmt=v=>KRW(Math.round(v));}
  else if(key==='willr'){const n=cs.length,a=Array(n).fill(null);
    for(let i=13;i<n;i++){let hh=-1/0,ll=1/0;for(let j=i-13;j<=i;j++){hh=Math.max(hh,cs[j].h);ll=Math.min(ll,cs[j].l);}a[i]=hh>ll?-100*(hh-cs[i].c)/(hh-ll):-50;}
    series=[[a,'#8b5cf6']];refs=[-80,-20];}
  else if(key==='atr'){series=[[iATR(cs,14),'#f59e0b']];fmt=v=>KRW(Math.round(v));}
  else if(key==='psy'){const n=cs.length,a=Array(n).fill(null);let u=0;
    for(let i=1;i<n;i++){if(cs[i].c>cs[i-1].c)u++;if(i>12&&cs[i-12].c>cs[i-13].c)u--;if(i>=12)a[i]=u/12*100;}
    series=[[a,'#0ea5e9']];refs=[25,75];}
  else if(key==='disp'){const ma=iSMA(cl,20);const a=cl.map((v,i)=>ma[i]?v/ma[i]*100:null);series=[[a,'#3b82f6']];refs=[100];fmt=v=>v.toFixed(1);}
  let lo2=1/0,hi2=-1/0;
  series.forEach(([v])=>{for(let i=start;i<=end;i++){const x=v[i];if(x!=null&&isFinite(x)){lo2=Math.min(lo2,x);hi2=Math.max(hi2,x);}}});
  if(bars)for(let i=start;i<=end;i++){const x=bars[i];if(x!=null){lo2=Math.min(lo2,x);hi2=Math.max(hi2,x);}}
  refs.forEach(r=>{lo2=Math.min(lo2,r);hi2=Math.max(hi2,r);});
  if(!isFinite(lo2)||!isFinite(hi2)){return;}
  if(hi2-lo2<1e-9){hi2+=1;lo2-=1;}
  const padv=(hi2-lo2)*0.08;lo2-=padv;hi2+=padv;
  function SC(v){return volTop+(1-(v-lo2)/(hi2-lo2))*volH;}
  ctx.save();ctx.beginPath();ctx.rect(padL,volTop-2,plotW,volH+4);ctx.clip();
  refs.forEach(r=>{ctx.strokeStyle=PAL.grid;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(padL,SC(r));ctx.lineTo(padL+plotW,SC(r));ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=PAL.label;ctx.font='9px Pretendard';ctx.textAlign='left';ctx.fillText(String(r),padL+2,SC(r)-5);});
  if(bars){for(let i=start;i<=end;i++){const v=bars[i];if(v==null)continue;const x=X(i-start),y0=SC(0),y=SC(v);
    ctx.fillStyle=v>=0?'rgba(245,56,78,.45)':'rgba(47,116,255,.45)';ctx.fillRect(x-2,Math.min(y,y0),4,Math.max(1,Math.abs(y-y0)));}}
  series.forEach(([v,c,w])=>seg(v,c,w));
  const lastV=series[0][0][end];
  if(lastV!=null)ctx.fillStyle=PAL.label,ctx.textAlign='right',ctx.font='bold 9px Pretendard',ctx.fillText(fmt(lastV),padL+plotW-2,volTop+8);
  ctx.restore();
}
/* ── 오버레이 그리기 ── */
function drawChartOverlays(ctx,cs,start,end,X,Yp,padL,plotW,padT,priceH,PAL){
  const OV=chartCfg.ov, cl=cs.map(c=>c.c);
  const line=(vals,col,w,dash)=>{ctx.strokeStyle=col;ctx.lineWidth=w||1.3;if(dash)ctx.setLineDash(dash);
    ctx.beginPath();let st2=false;
    for(let gi=start;gi<=end;gi++){const v=vals[gi];if(v==null||!isFinite(v)){st2=false;continue;}
      const x=X(gi-start),y=Yp(v);if(st2)ctx.lineTo(x,y);else{ctx.moveTo(x,y);st2=true;}}
    ctx.stroke();ctx.setLineDash([]);};
  if(OV.bb){const m=iSMA(cl,20),sd=iSTD(cl,20);
    const up2=m.map((v,i)=>v!=null?v+2*sd[i]:null),dn2=m.map((v,i)=>v!=null?v-2*sd[i]:null);
    ctx.fillStyle='rgba(59,130,246,.06)';ctx.beginPath();let st2=false;
    for(let gi=start;gi<=end;gi++){const v=up2[gi];if(v==null)continue;const x=X(gi-start);if(st2)ctx.lineTo(x,Yp(v));else{ctx.moveTo(x,Yp(v));st2=true;}}
    for(let gi=end;gi>=start;gi--){const v=dn2[gi];if(v==null)continue;ctx.lineTo(X(gi-start),Yp(v));}
    ctx.closePath();ctx.fill();
    line(up2,'#60a5fa',1);line(m,'#3b82f6',1);line(dn2,'#60a5fa',1);}
  if(OV.env){const m=iSMA(cl,20);line(m.map(v=>v!=null?v*1.06:null),'#f59e0b',1,[4,3]);line(m.map(v=>v!=null?v*0.94:null),'#f59e0b',1,[4,3]);}
  if(OV.pch){const n=cs.length,hh=Array(n).fill(null),ll=Array(n).fill(null);
    for(let i=19;i<n;i++){let a=-1/0,b=1/0;for(let j=i-19;j<=i;j++){a=Math.max(a,cs[j].h);b=Math.min(b,cs[j].l);}hh[i]=a;ll[i]=b;}
    line(hh,'#10b981',1,[5,3]);line(ll,'#10b981',1,[5,3]);}
  if(OV.ich){const n=cs.length,conv=Array(n).fill(null),base=Array(n).fill(null),spA=Array(n).fill(null),spB=Array(n).fill(null);
    const hl=(i,p)=>{let a=-1/0,b=1/0;for(let j=i-p+1;j<=i;j++){a=Math.max(a,cs[j].h);b=Math.min(b,cs[j].l);}return (a+b)/2;};
    for(let i=0;i<n;i++){if(i>=8)conv[i]=hl(i,9);if(i>=25)base[i]=hl(i,26);
      if(i>=25&&conv[i-26+26]!=null){}
      if(i>=26+25){spA[i]=(conv[i-26]+base[i-26])/2;}
      if(i>=26+51){spB[i]=hl(i-26,52);}}
    ctx.fillStyle='rgba(16,185,129,.07)';
    for(let gi=Math.max(start,1);gi<=end;gi++){const a=spA[gi],b=spB[gi],a0=spA[gi-1],b0=spB[gi-1];
      if(a==null||b==null||a0==null||b0==null)continue;
      ctx.beginPath();ctx.moveTo(X(gi-1-start),Yp(a0));ctx.lineTo(X(gi-start),Yp(a));
      ctx.lineTo(X(gi-start),Yp(b));ctx.lineTo(X(gi-1-start),Yp(b0));ctx.closePath();ctx.fill();}
    line(conv,'#ef4444',1);line(base,'#2563eb',1);line(spA,'#10b981',1);line(spB,'#f59e0b',1);}
  if(OV.psar){const n=cs.length,out=Array(n).fill(null);
    let up2=cs[1]?cs[1].c>=cs[0].c:true,af=0.02,ep=up2?cs[0].h:cs[0].l,sar=up2?cs[0].l:cs[0].h;
    for(let i=1;i<n;i++){sar=sar+af*(ep-sar);
      if(up2){if(cs[i].l<sar){up2=false;sar=ep;ep=cs[i].l;af=0.02;}else if(cs[i].h>ep){ep=cs[i].h;af=Math.min(0.2,af+0.02);}}
      else{if(cs[i].h>sar){up2=true;sar=ep;ep=cs[i].h;af=0.02;}else if(cs[i].l<ep){ep=cs[i].l;af=Math.min(0.2,af+0.02);}}
      out[i]={v:sar,up:up2};}
    for(let gi=start;gi<=end;gi++){const o=out[gi];if(!o)continue;
      ctx.fillStyle=o.up?'#ef4444':'#2563eb';ctx.beginPath();ctx.arc(X(gi-start),Yp(o.v),1.7,0,Math.PI*2);ctx.fill();}}
  if(OV.piv&&end>=1){const pv=cs[end-1],P=(pv.h+pv.l+pv.c)/3,R1=2*P-pv.l,S1=2*P-pv.h,R2=P+(pv.h-pv.l),S2=P-(pv.h-pv.l);
    [['P',P,'#64748b'],['R1',R1,'#ef4444'],['S1',S1,'#2563eb'],['R2',R2,'#ef4444'],['S2',S2,'#2563eb']].forEach(([nm,v,c])=>{
      const y=Yp(v);if(y<padT||y>padT+priceH)return;
      ctx.strokeStyle=c;ctx.globalAlpha=.5;ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+plotW,y);ctx.stroke();
      ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=c;ctx.font='9px Pretendard';ctx.textAlign='left';ctx.fillText(nm,padL+2,y-5);});}
}
/* ── 설정 패널 ── */
function openChartCfg(){
  let ov=$('ccOv');
  if(!ov){ov=document.createElement('div');ov.className='overlay';ov.id='ccOv';document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.hidden=true;});}
  const T=[['candle','캔들'],['bar','바'],['line','라인'],['area','영역'],['ha','Heikin-Ashi']];
  const OVS=[['bb','Bollinger Band (20, 2σ)'],['env','Envelope (20, ±6%)'],['ich','일목균형표'],['psar','Parabolic SAR'],['pch','Price Channel (20)'],['piv','Pivot (전일 기준)']];
  ov.innerHTML=`<div class="cc-box"><div class="cc-h"><b>차트 설정</b>
      <button class="cc-reset" id="ccReset">↺ 초기화</button><button class="cc-x" id="ccX">✕</button></div>
    <div class="cc-body">
      <div class="cc-sec">차트 유형</div>
      ${T.map(([k,l])=>`<label class="cc-r"><input type="radio" name="ccT" value="${k}" ${chartCfg.type===k?'checked':''}><i></i>${l}</label>`).join('')}
      <div class="cc-sec">오버레이 · 이동평균</div>
      <div class="cc-mas">${[5,20,60,120].map(p=>`<label class="cc-c"><input type="checkbox" data-ma="${p}" ${chartCfg.ma[p]?'checked':''}><i></i>MA${p}</label>`).join('')}</div>
      <label class="cc-r"><input type="checkbox" data-ov="vp" ${chartCfg.ov.vp?'checked':''}><i></i>매물대 (Volume Profile)</label>
      ${OVS.map(([k,l])=>`<label class="cc-r"><input type="checkbox" data-ov="${k}" ${chartCfg.ov[k]?'checked':''}><i></i>${l}</label>`).join('')}
      <div class="cc-sec">하단 지표 <span class="cc-sub">한 가지를 선택해 거래량 자리에 표시</span></div>
      ${CC_LOWERS.map(([k,l])=>`<label class="cc-r"><input type="radio" name="ccL" value="${k}" ${chartCfg.lower===k?'checked':''}><i></i>${l}</label>`).join('')}
    </div></div>`;
  ov.hidden=false;
  const rd=()=>{ccSave();safeRun('ccDraw',drawChart);};
  ov.querySelectorAll('input[name=ccT]').forEach(x=>x.onchange=()=>{chartCfg.type=x.value;rd();});
  ov.querySelectorAll('input[name=ccL]').forEach(x=>x.onchange=()=>{chartCfg.lower=x.value;rd();});
  ov.querySelectorAll('input[data-ma]').forEach(x=>x.onchange=()=>{chartCfg.ma[x.dataset.ma]=x.checked?1:0;try{maOn[x.dataset.ma]=!!x.checked;}catch(e){}rd();});
  ov.querySelectorAll('input[data-ov]').forEach(x=>x.onchange=()=>{chartCfg.ov[x.dataset.ov]=x.checked?1:0;rd();});
  $('ccX').onclick=()=>{ov.hidden=true;};
  $('ccReset').onclick=()=>{chartCfg=JSON.parse(JSON.stringify(CC_DEF));try{[5,20,60,120].forEach(p=>maOn[p]=true);}catch(e){}ccSave();openChartCfg();safeRun('ccDraw',drawChart);};
}

function drawChart(){
  /* [v4.57] 해외 거래 화면에서도 같은 엔진으로 그린다 — 아래 usChartMount() 가
     이 차트 카드를 해외 정보 패널로 옮겨 놓으므로, 화면 제약만 풀어 주면 된다. */
  if(currentView!=='trade'&&currentView!=='ustrade')return;
  const _cc=$('chartCard');if(_cc&&_cc.hidden)return;
  const dpr=window.devicePixelRatio||1,box=canvas.parentElement.getBoundingClientRect();
  if(box.width===0)return;
  canvas.width=box.width*dpr;canvas.height=box.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=box.width,H=box.height;ctx.clearRect(0,0,W,H);
  const cs=curCandles;
  if(!cs.length){$('chartLegend').textContent=chartLoading?'차트 불러오는 중…':(isMinute(chartTf)?('분봉 데이터 없음 · 장중 실시간 누적 '+(minuteDiag||'')):'데이터를 불러오지 못했어요 · ⟳ 버튼으로 다시 시도');return;}
  const padR=58,padL=6,padT=10,plotW=W-padL-padR;
  const priceH=(H-24)*0.66,volTop=priceH+padT+16,volH=(H-24)*0.22;
  const n=cs.length;
  let count=Math.max(8,Math.min(view.count,n));
  let end=view.follow?n-1:Math.min(view.end,n-1);if(end<0)end=n-1;
  let start=Math.max(0,end-count+1);
  const vis=cs.slice(start,end+1),m=vis.length;
  ccBind();
  const CCv=chartCfg;
  let _dispC=null;                       // [v3.6] Heikin-Ashi 변환 봉
  if(CCv.type==='ha'){_dispC=[];let po=0,pc2=0;
    vis.forEach((c,i)=>{const hc=(c.o+c.h+c.l+c.c)/4,ho=i?(po+pc2)/2:(c.o+c.c)/2;
      _dispC.push({o:ho,h:Math.max(c.h,ho,hc),l:Math.min(c.l,ho,hc),c:hc,v:c.v,d:c.d});po=ho;pc2=hc;});}
  // 안전장치: 잘못된 OHLC(0/누락) 보정 후 범위 계산
  vis.forEach(c=>{if(!(c.c>0))return;if(!(c.o>0))c.o=c.c;if(!(c.h>0))c.h=Math.max(c.o,c.c);if(!(c.l>0))c.l=Math.min(c.o,c.c);c.h=Math.max(c.h,c.o,c.c);c.l=Math.min(c.l,c.o,c.c);});
  let lo=Infinity,hi=-Infinity,vmax=0;vis.forEach(c=>{if(!(c.c>0))return;lo=Math.min(lo,c.l);hi=Math.max(hi,c.h);vmax=Math.max(vmax,c.v);});
  if(!isFinite(lo)||!isFinite(hi)||hi<=lo){$('chartLegend').textContent='차트 데이터를 준비 중…';return;}
  const pad=(hi-lo)*0.08||hi*0.01;lo-=pad;hi+=pad;
  const slot=plotW/m,X=i=>padL+i*slot+slot/2,bw=Math.max(1.5,slot*0.64);
  const Yp=v=>padT+(1-(v-lo)/(hi-lo))*priceH,Yv=v=>volTop+(1-(vmax?v/vmax:0))*volH;
  ctx.font='10px Pretendard';ctx.textBaseline='middle';ctx.textAlign='left';
  /* [수정] 테마 판정을 맨 앞으로 — 라이트/다크 공용 팔레트로 격자·라벨·매물대 색을 한 곳에서 관리 */
  const thmDark=document.documentElement.getAttribute('data-theme')==='dark';
  const PAL=thmDark
    ?{grid:'rgba(148,163,184,.14)',gridV:'rgba(148,163,184,.09)',label:'#94a3b8',
      vpBase:'rgba(100,116,139,.16)',vpPoc:'rgba(245,158,11,.35)',vpCur:'rgba(59,130,246,.30)',
      vpPocT:'#fbbf24',vpCurT:'#93c5fd',vpT:'#8b95a5',pcLine:'rgba(148,163,184,.55)',pcText:'#94a3b8'}
    :{grid:'#eef1f6',gridV:'#f3f5f9',label:'#8b97a7',
      vpBase:'rgba(100,116,139,.10)',vpPoc:'rgba(245,158,11,.30)',vpCur:'rgba(59,130,246,.26)',
      vpPocT:'#b45309',vpCurT:'#2563eb',vpT:'#94a0af',pcLine:'rgba(100,116,139,.5)',pcText:'#64748b'};
  /* 둥근 사각형 채우기 (구형 브라우저 폴백 포함) */
  const rr=(x,y,w,h,r)=>{r=Math.min(r,Math.abs(w)/2,Math.abs(h)/2);
    if(!(w>0)||!(h>0)){return;}
    if(r<=0){ctx.fillRect(x,y,w,h);return;}
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
    else{ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
    ctx.fill();};
  /* [수정] 주가축 눈금 세분화 — 범위 4등분(어중간한 값) 대신 1·2·5×10ⁿ 단위로 6~8칸의
     '깔끔한 값'(예: 150,000 / 200,000 / 250,000…)을 만든다. */
  /* 1·2·2.5·5×10ⁿ 후보를 큰 것부터 훑어 '눈금 5~13칸'을 보장한다.
     (범위를 6등분해 올림하던 방식은 범위에 따라 4칸까지 줄어 성겼다) */
  const yStep=(()=>{const range=hi-lo;
    for(let p=Math.pow(10,Math.ceil(Math.log10(range)));p>=0.01;p/=10){
      for(const m of [5,2.5,2,1]){const st=m*p;const cnt=range/st;
        if(cnt>=5&&cnt<=13)return st;}
    }
    return Math.max(1,range/8);})();
  for(let v=Math.ceil(lo/yStep)*yStep; v<=hi+yStep*1e-6; v+=yStep){
    const y=Yp(v);
    ctx.strokeStyle=PAL.grid;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+plotW,y);ctx.stroke();
    ctx.fillStyle=PAL.label;ctx.fillText(KRW(v),padL+plotW+6,y);
  }
  /* [추가] 시간축 눈금 위치 계산 + 세로 그리드(연한 선). 라벨은 거래량 아래에 그린다. */
  const fmtAxis=(dstr,prev)=>{const d=String(dstr||'').replace(/[^0-9]/g,'');
    if(isMinute(chartTf)){return d.length>=12?d.slice(8,10)+':'+d.slice(10,12):String(dstr).slice(-5);}
    if(chartTf==='M')return d.slice(0,4)+'.'+d.slice(4,6);
    if(chartTf==='Y')return d.slice(0,4);
    const md=(+d.slice(4,6))+'.'+(+d.slice(6,8));                     // 일·주: M.D
    if(!prev||String(prev).replace(/[^0-9]/g,'').slice(0,4)!==d.slice(0,4))return d.slice(2,4)+"'"+md;  // 해가 바뀌면 'YY 표기
    return md;};
  const xEvery=Math.max(1,Math.ceil(m/6));
  const xTicks=[];for(let i=0;i<m;i+=xEvery){xTicks.push(i);}
  if(m>1&&(m-1)-xTicks[xTicks.length-1]>=xEvery*0.55)xTicks.push(m-1);   // 오른쪽 끝(최신 봉)도 여유 있으면 표기
  ctx.setLineDash([3,4]);
  xTicks.forEach(i=>{const x=X(i);ctx.strokeStyle=PAL.gridV;ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,padT+priceH);ctx.stroke();});
  ctx.setLineDash([]);
  /* [수정] 매물대 재설계 — ①봉과 덜 겹치도록 오른쪽(가격축 쪽) 정렬 ②차분한 슬레이트 기본색,
       최대 매물대=앰버, 현재가 구간=파랑만 강조 ③막대 높이를 칸의 62%로 줄이고 모서리 라운드
       ④% 라벨은 의미 있는 곳(최대·현재가·8%↑)만 — 색 설명은 캔버스 글자 대신 HTML 범례 칩으로 */
  /* ══ [v4.27] 매물대 재설계 — 봉과 겹쳐 읽기 어렵던 문제(첨부 4번 사진) ══
     ① 최대 폭 26% → 14%: 오른쪽 가장자리에만 얇게 깔린다
     ② % 라벨을 막대 '바깥 왼쪽'(봉 위) → '안쪽 오른쪽'으로 옮겨 봉을 가리지 않는다
     ③ 라벨은 최대 매물대·현재가 구간 두 곳만 ④ 설정에서 끌 수 있다 */
  if(chartCfg.ov.vp!==0){
  const bins=10,binVol=new Array(bins).fill(0);
  vis.forEach(c=>{let b=Math.floor((c.c-lo)/(hi-lo)*bins);b=clamp(b,0,bins-1);binVol[b]+=c.v;});
  const totV=binVol.reduce((sm,v)=>sm+v,0)||1,bmax=Math.max(...binVol,1),binH=priceH/bins;
  const maxB=binVol.indexOf(bmax);
  let curB=Math.floor(((cs[end].c)-lo)/(hi-lo)*bins);curB=clamp(curB,0,bins-1);
  const vpMaxW=plotW*0.14,vpR=padL+plotW;
  for(let b=0;b<bins;b++){
    if(!binVol[b])continue;
    const w=Math.max(2,binVol[b]/bmax*vpMaxW);
    const bh=binH*0.58,y=padT+priceH-(b+1)*binH+(binH-bh)/2;
    ctx.fillStyle=(b===curB)?PAL.vpCur:(b===maxB)?PAL.vpPoc:PAL.vpBase;
    rr(vpR-w,y,w,bh,2);
    if(b===curB||b===maxB){
      const pct=binVol[b]/totV*100;
      ctx.fillStyle=(b===curB)?PAL.vpCurT:PAL.vpPocT;
      ctx.font='bold 8.5px Pretendard';ctx.textAlign='right';
      const tw=ctx.measureText(pct.toFixed(1)+'%').width;
      /* 막대가 라벨보다 넓으면 안쪽에, 좁으면 막대 왼쪽 바로 옆에 — 어느 쪽이든 봉 위는 피한다 */
      ctx.fillText(pct.toFixed(1)+'%', w>tw+8 ? vpR-4 : vpR-w-3, y+bh/2);
    }}
  ctx.textAlign='left';
  }
  /* [추가] 전일 종가 기준선 — 점선 + 라벨. 봉 뒤에 깔리도록 여기서 그린다. */
  const _pcS=byCode[selected],pcV=_pcS&&_pcS.prevClose;
  if(pcV&&pcV>lo&&pcV<hi){const y=Yp(pcV);
    ctx.strokeStyle=PAL.pcLine;ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+plotW,y);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=PAL.pcText;ctx.font='8.5px Pretendard';
    ctx.fillText('전일 '+KRW(pcV),padL+3,y-6);}
  // 캔들 + 거래량
  /* [D4] 거래량 급증(직전 20봉 평균의 2.5배↑)을 진한 색 + 주황 ▲ 마커로 표시 — 추천주 근거를 눈으로 확인 */
  const volBase=(gi)=>{let sv=0,nv=0;for(let k=Math.max(0,gi-20);k<gi;k++){sv+=cs[k].v;nv++;}return nv?sv/nv:0;};
  vis.forEach((c,i)=>{const x=X(i),up=c.c>=c.o,col=up?UP:DOWN;
    ctx.strokeStyle=col;ctx.lineWidth=1;ctx.globalAlpha=.85;                    // 꼬리는 살짝 연하게 — 몸통이 또렷해 보인다
    const dC=_dispC?_dispC[i]:c, dUp=dC.c>=dC.o, dcol=dUp?UP:DOWN;   // [v3.6] 차트 유형 분기
    if(CCv.type==='candle'||CCv.type==='ha'){
      ctx.strokeStyle=dcol;
      ctx.beginPath();ctx.moveTo(x,Yp(dC.h));ctx.lineTo(x,Yp(dC.l));ctx.stroke();
      ctx.globalAlpha=1;ctx.fillStyle=dcol;
      const yo=Yp(dC.o),yc=Yp(dC.c);rr(x-bw/2,Math.min(yo,yc),bw,Math.max(2,Math.abs(yc-yo)),Math.min(2,bw/3));
    }else if(CCv.type==='bar'){
      ctx.globalAlpha=1;ctx.strokeStyle=dcol;ctx.lineWidth=Math.max(1,bw*0.2);
      ctx.beginPath();ctx.moveTo(x,Yp(dC.h));ctx.lineTo(x,Yp(dC.l));
      ctx.moveTo(x-bw/2,Yp(dC.o));ctx.lineTo(x,Yp(dC.o));ctx.moveTo(x,Yp(dC.c));ctx.lineTo(x+bw/2,Yp(dC.c));
      ctx.stroke();ctx.lineWidth=1;
    }
    ctx.globalAlpha=1;ctx.fillStyle=col;
    if(CCv.lower!=='vol'&&CCv.lower!=='volma')return;   // [v3.6] 하단 지표 선택 시 거래량 대신 그린다
    if(CCv.lower==='volma')return;                       // volma 는 drawLowerPane 이 막대까지 그린다
    const vb=volBase(start+i), surge=vb>0&&c.v>=vb*2.5;
    ctx.fillStyle=surge?(up?'rgba(245,56,78,.85)':'rgba(47,116,255,.85)'):(up?'rgba(245,56,78,.5)':'rgba(47,116,255,.5)');
    const vy=Yv(c.v),vh=Math.max(1,volTop+volH-vy);
    rr(x-bw/2,vy,bw,vh,Math.min(2,bw/3));
    if(vh>3)ctx.fillRect(x-bw/2,vy+vh-2,bw,2);                                  // 아래쪽 모서리는 각지게 — 기준선에 붙도록
    if(surge){ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.moveTo(x,vy-6);ctx.lineTo(x-3,vy-1);ctx.lineTo(x+3,vy-1);ctx.closePath();ctx.fill();}});
  /* [추가] 보이는 구간의 최고가 ▲ / 최저가 ▼ 마커 — 캔들 위에 표시 */
  {let hiI=0,loI=0;vis.forEach((c,i)=>{if(c.h>vis[hiI].h)hiI=i;if(c.l<vis[loI].l)loI=i;});
   ctx.font='bold 9px Pretendard';ctx.textAlign='center';
   ctx.fillStyle=UP;ctx.fillText('▲ '+KRW(vis[hiI].h),clamp(X(hiI),padL+34,padL+plotW-34),Math.max(padT+7,Yp(vis[hiI].h)-8));
   ctx.fillStyle=DOWN;ctx.fillText('▼ '+KRW(vis[loI].l),clamp(X(loI),padL+34,padL+plotW-34),Math.min(padT+priceH-6,Yp(vis[loI].l)+10));
   ctx.textAlign='left';}
  ctx.fillStyle='#9aa5b4';ctx.textAlign='left';ctx.font='10px Pretendard';
  ctx.fillText(CCv.lower==='vol'?'거래량 (매수세=빨강 / 매도세=파랑)':(CC_LBL[CCv.lower]||''),padL,volTop-4);
  if(CCv.type==='line'||CCv.type==='area'){                 // [v3.6] 라인·영역형
    ctx.save();ctx.beginPath();ctx.rect(padL,padT,plotW,priceH);ctx.clip();
    if(CCv.type==='area'){ctx.fillStyle='rgba(59,130,246,.10)';ctx.beginPath();
      vis.forEach((c,i)=>{const x=X(i),y=Yp(c.c);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.lineTo(X(m-1),padT+priceH);ctx.lineTo(X(0),padT+priceH);ctx.closePath();ctx.fill();}
    ctx.strokeStyle='#3b82f6';ctx.lineWidth=1.8;ctx.lineJoin='round';ctx.beginPath();
    vis.forEach((c,i)=>{const x=X(i),y=Yp(c.c);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.stroke();ctx.restore();}
  if(CCv.lower!=='vol')safeRun('ccLower',()=>drawLowerPane(ctx,cs,start,end,X,padL,plotW,volTop,volH,PAL,UP,DOWN));
  /* [추가] 시간축 라벨 — 분봉 HH:MM · 일/주 M.D(해 바뀌면 'YY 표기) · 월 YYYY.MM · 년 YYYY */
  {let prevD=null;
   /* [수정] 시간축을 또렷하게 — 라이트 테마 진한 검정, 다크 테마 밝은 회백(가독성) */
   const axDark=thmDark;
   ctx.fillStyle=axDark?'#e5e7eb':'#111111';ctx.font='bold 10px Pretendard';ctx.textAlign='center';ctx.textBaseline='top';
   const axisY=volTop+volH+5;
   xTicks.forEach(i=>{const c=vis[i];if(!c)return;const x=X(i);
     ctx.strokeStyle=axDark?'#94a3b8':'#444444';ctx.beginPath();ctx.moveTo(x,volTop+volH);ctx.lineTo(x,volTop+volH+4);ctx.stroke();
     ctx.fillText(fmtAxis(c.d,prevD),Math.min(Math.max(x,padL+14),padL+plotW-14),axisY);prevD=c.d;});
   ctx.textBaseline='middle';}
  // 이동평균선 (5/20/60/120)
  const prefix=[0];for(let i=0;i<cs.length;i++)prefix[i+1]=prefix[i]+cs[i].c;
  const maAt=(p,i)=>(i+1<p)?null:(prefix[i+1]-prefix[i+1-p])/p;
  MAS.forEach(([p,col])=>{if(!maOn[p])return;
    ctx.strokeStyle=col;ctx.lineWidth=1.4;ctx.lineJoin='round';ctx.beginPath();let started=false;
    for(let gi=start;gi<=end;gi++){const v=maAt(p,gi);if(v==null){started=false;continue;}
      const x=X(gi-start),y=Yp(v);if(started)ctx.lineTo(x,y);else{ctx.moveTo(x,y);started=true;}}
    ctx.stroke();});
  safeRun('ccOv2',()=>drawChartOverlays(ctx,cs,start,end,X,Yp,padL,plotW,padT,priceH,PAL));   // [v3.6] 오버레이
  // MA 현재값 범례
  $('chartMa').innerHTML=MAS.filter(([p])=>maOn[p]).map(([p,col])=>{const v=maAt(p,end);return v==null?'':`<span style="color:${col}">MA${p} ${KRW(v)}</span>`;}).join('');
  // 현재봉 라벨
  const last=cs[end],col=last.c>=(cs[end-1]?cs[end-1].c:last.o)?UP:DOWN,ly=Yp(last.c);
  ctx.strokeStyle=col;ctx.globalAlpha=.4;ctx.lineWidth=1;ctx.setLineDash([3,3]);      // [추가] 현재가 가이드 점선
  ctx.beginPath();ctx.moveTo(padL,ly);ctx.lineTo(padL+plotW,ly);ctx.stroke();
  ctx.setLineDash([]);ctx.globalAlpha=1;
  ctx.fillStyle=col;rr(padL+plotW+1,ly-9,padR-3,18,5);                                // [수정] 현재가 라벨을 알약 모양으로
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 10px Pretendard';ctx.fillText(KRW(last.c),padL+plotW+(padR-1)/2,ly);
  const s=byCode[selected],dc=s.price!=null?s.price-s.prevClose:0,dir=dirOf(dc);
  const _lq=dispQuote(s.code),_lp=(_lq&&_lq.price!=null)?_lq.price:s.price;       // [수정] 범례도 통합가
  $('chartLegend').innerHTML=`<b>${TFLABEL[chartTf]}봉</b> · <span class="${dir}">${KRW(_lp)}</span> · ${m}/${n}`+((isMinute(chartTf)&&n<=2&&minuteDiag)?` · <span style="color:#c9902a">${minuteDiag}</span>`:'');
  // 크로스헤어
  chartGeo={start,end,m,padL,plotW,padT,priceH,slot,Xoff:(i)=>padL+i*slot+slot/2,lo,hi};
  if(hoverGX!=null){
    const rel=hoverGX-padL, idx=clamp(Math.floor(rel/slot),0,m-1), gi=start+idx, c=cs[gi];
    if(c){const x=padL+idx*slot+slot/2;
      ctx.strokeStyle='rgba(120,130,145,.6)';ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,padT+priceH);ctx.stroke();
      if(hoverGY!=null&&hoverGY<padT+priceH){ctx.beginPath();ctx.moveTo(padL,hoverGY);ctx.lineTo(padL+plotW,hoverGY);ctx.stroke();}
      ctx.setLineDash([]);
      const up=c.c>=c.o,cc=up?'up':'down',chg=c.c-c.o,cp=c.o?chg/c.o*100:0;
      const tip=$('chartTip');
      tip.innerHTML=`<div class="d">${c.d}</div>
        <div class="r"><span>시</span><span>${KRW(c.o)}</span></div>
        <div class="r"><span>고</span><span class="up">${KRW(c.h)}</span></div>
        <div class="r"><span>저</span><span class="down">${KRW(c.l)}</span></div>
        <div class="r"><span>종</span><span class="${cc}">${KRW(c.c)}</span></div>
        <div class="r"><span>대비</span><span class="${cc}">${signed(chg)} (${pctS(cp)})</span></div>
        <div class="r"><span>거래량</span><span>${KRW(c.v)}</span></div>`;
      tip.hidden=false;
      const bw2=box.width;let tx=x+12;if(tx>bw2-150)tx=x-142;
      tip.style.left=Math.max(4,tx)+'px';tip.style.top=(padT+6)+'px';
    }
  } else { $('chartTip').hidden=true; }
}
/* 확대/축소·이동 */
function effEnd(){return view.follow?curCandles.length-1:Math.min(view.end,curCandles.length-1);}
let drag=null,pinch=null;
canvas.addEventListener('pointerdown',e=>{if(pinch)return;drag={x:e.clientX,end:effEnd()};try{canvas.setPointerCapture(e.pointerId);}catch{}});
canvas.addEventListener('pointermove',e=>{if(!drag||pinch)return;const box=canvas.parentElement.getBoundingClientRect();const plotW=box.width-64;const count=Math.max(8,Math.min(view.count,curCandles.length));const barW=plotW/count;const dBars=Math.round((e.clientX-drag.x)/barW);let ne=clamp(drag.end-dBars,Math.min(count-1,curCandles.length-1),curCandles.length-1);view.end=ne;view.follow=(ne>=curCandles.length-1);drawChart();});
canvas.addEventListener('pointermove',e=>{if(drag||pinch||e.pointerType==='touch')return;const box=canvas.parentElement.getBoundingClientRect();hoverGX=e.clientX-box.left;hoverGY=e.clientY-box.top;drawChart();});
canvas.addEventListener('pointerleave',()=>{hoverGX=null;hoverGY=null;$('chartTip').hidden=true;drawChart();});
canvas.addEventListener('pointerup',()=>{drag=null;});
canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();view.follow=false;view.end=effEnd();const f=e.deltaY>0?1.2:0.82;view.count=Math.round(clamp(view.count*f,8,curCandles.length||8));drawChart();},{passive:false});
const tdist=(e)=>{const a=e.touches[0],b=e.touches[1];return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);};
canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){drag=null;pinch={d:tdist(e),count:view.count};}},{passive:false});
canvas.addEventListener('touchmove',e=>{if(pinch&&e.touches.length===2){e.preventDefault();const d=tdist(e);const ratio=pinch.d/Math.max(1,d);view.count=Math.round(clamp(pinch.count*ratio,8,curCandles.length||8));drawChart();}},{passive:false});
canvas.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;});
$('zoomIn').onclick=()=>{view.count=Math.round(clamp(view.count*0.8,8,curCandles.length||8));drawChart();};
$('zoomOut').onclick=()=>{view.count=Math.round(clamp(view.count*1.25,8,curCandles.length||8));drawChart();};
$('zoomReset').onclick=()=>{if(!curCandles.length&&!isMinute(chartTf)){delete candleCache[selected+':'+chartTf];loadCandles();}else{resetView();drawChart();}};

/* ══ [v4.5] 주문 정산 모델 — 단일 진실원(single source of truth) ═══════════
   [무엇이 잘못됐나]
   ① 주문 버튼은 amount>cash (수수료 제외) 로 통과시키고,
      실제 체결 함수는 amount+fee>cash 로 거절했다. 두 판정이 어긋나
      "가능하다고 해놓고 눌렀더니 예수금 부족"이 났고, 반대로 경계값에서는
      수수료만큼 예수금이 음수로 내려갈 여지가 남아 총자산이 어긋났다.
   ② '최대' 버튼과 '가능 N주'도 수수료를 빼먹어, 최대치를 고르면 반드시 실패했다.
   ③ 저장된 계좌가 문자열·소수·NaN·음수여도 아무도 검사하지 않아
      한 번 깨지면 총자산이 계속 이상한 값으로 표시됐다.
   [해결] 비용 계산을 이 한 곳으로 모으고, 모든 화면·검증이 같은 함수를 쓴다.
   ═════════════════════════════════════════════════════════════════════════ */
const FEE_RATE_BASE=0.00015, TAX_RATE=0.0018;
/* [v4.32] 계좌 종류에 따라 수수료가 달라진다 */
function FEE_RATE_OF(){return FEE_RATE_BASE*acctFeeKr();}
const FEE_RATE=FEE_RATE_BASE;
const intOf=(v,d)=>{const n=Math.trunc(Number(v));return Number.isFinite(n)?n:(d||0);};
/* 한 주문의 금액·수수료·세금·예수금 증감 */
function orderCost(side,price,qty){
  const p=intOf(price),q=intOf(qty);
  const amount=p*q;
  const fee=Math.round(amount*FEE_RATE_OF());
  const tax=side==='sell'?Math.round(amount*TAX_RATE):0;
  return {amount,fee,tax,
    cost:side==='buy'?amount+fee:0,             // 매수 시 실제로 빠져나가는 예수금
    proceeds:side==='sell'?amount-fee-tax:0};   // 매도 시 실제로 들어오는 예수금
}
/* 지금 예수금으로 살 수 있는 최대 수량 — 수수료까지 감당 가능한 수량만 돌려준다 */
function maxBuyQty(price){
  const p=intOf(price); if(p<=0)return 0;
  let q=Math.floor(cash/(p*(1+FEE_RATE_OF())));
  if(q<0)q=0;
  while(q>0&&orderCost('buy',p,q).cost>cash)q--;        // 반올림 오차 보정(최대 1~2회)
  while(orderCost('buy',p,q+1).cost<=cash)q++;
  return q;
}
/* ── 계좌 무결성 복구 ──
   불러온 계좌가 깨져 있으면(문자열·소수점·NaN·음수·잘못된 보유) 조용히 바로잡는다.
   여기서 걸러 두면 총자산이 NaN 이나 음수로 표시되는 일이 원천적으로 사라진다. */
function sanitizeAccount(silent){
  const fixes=[];
  const c0=cash;
  cash=intOf(cash,0);
  if(!Number.isFinite(cash)||cash<0){cash=0;}
  if(cash!==c0&&!(c0===cash))fixes.push('예수금');
  if(!Array.isArray(holdings))(holdings=[],fixes.push('보유종목'));
  const clean=[],merged={};
  holdings.forEach(h=>{
    if(!h||!h.code)return;
    const code=String(h.code);
    /* [v4.29 · 치명 수정] 해외 보유는 소수 수량(0.01주)과 소수 평단($210.12)이 정상이다.
       정수화(intOf)에 넣으면 로그인·복구 때마다 평단이 깎이고 소수점 매매분이 0이 되어
       삭제된다. 해외는 소수 그대로 검증하고, 국내만 기존대로 정수화한다. */
    if(h.us){
      const qty=Math.round((+h.qty||0)*10000)/10000, avg=Math.round((+h.avg||0)*10000)/10000;
      if(!(qty>0)||!(avg>0)){fixes.push('보유종목');return;}
      const fxAvg=(+h.fxAvg>0)?Math.round(+h.fxAvg*100)/100:null;
      if(merged[code]){ const m=merged[code];
        m.avg=+(((m.avg*m.qty)+(avg*qty))/(m.qty+qty)).toFixed(4); m.qty=+(m.qty+qty).toFixed(4); fixes.push('보유종목');
      }else{ const rec={...h,code,qty,avg}; if(fxAvg)rec.fxAvg=fxAvg; merged[code]=rec; clean.push(rec); }
      return;
    }
    const qty=intOf(h.qty,0), avg=intOf(h.avg,0);
    if(qty<=0||avg<=0){fixes.push('보유종목');return;}
    if(merged[code]){                                   // 같은 종목이 두 줄로 갈라졌으면 합친다
      const m=merged[code];
      m.avg=Math.round((m.avg*m.qty+avg*qty)/(m.qty+qty)); m.qty+=qty; fixes.push('보유종목');
    }else{ const rec={...h,code,qty,avg}; merged[code]=rec; clean.push(rec); }
  });
  if(clean.length!==holdings.length)fixes.push('보유종목');
  holdings=clean;
  usdCash=Math.max(0,Math.round(((+usdCash)||0)*100)/100);          // [v4.29] 달러 잔고 방어
  if(!Array.isArray(usdSettling))usdSettling=[];
  usdSettling=usdSettling.filter(x=>x&&(+x.amt>0)&&x.settle).map(x=>({amt:Math.round(+x.amt*100)/100,settle:String(x.settle)}));
  if(!Array.isArray(tradeLog))tradeLog=[];
  if(!Array.isArray(bookOrders))bookOrders=[];
  if(fixes.length&&!silent){
    try{toast('warn','계좌 데이터를 자동 복구했습니다',[...new Set(fixes)].join(' · ')+' 항목에서 잘못된 값을 바로잡았습니다.');}catch(e){}
    try{saveState();}catch(e){}
  }
  return fixes.length>0;
}

/* ===== 주문 폼 ===== */
function currentPrice(){return byCode[selected].price??0;}
function getOrderPrice(){if(ordType==='market')return currentPrice();const v=userPrice!==null?userPrice:currentPrice();return Math.max(tickSize(v||1),roundTick(v));}
function getQty(){return Math.max(0,parseInt(($('qtyInput').value||'0').replace(/,/g,''))||0);}
function updateOrderTotal(){$('ordTotal').textContent=KRW(getOrderPrice()*getQty())+'원';}
function syncPriceField(force){const inp=$('pxInput');if(force||userPrice===null){userPrice=null;inp.value=KRW(currentPrice());}
  $('priceHint').textContent='현재가 '+KRW(currentPrice());syncMaxQty();updateOrderTotal();}
function syncMaxQty(){const h=holdings.find(x=>x.code===selected);
  /* [v4.5] 수수료까지 감당 가능한 수량만 '가능'으로 표시한다. 예전엔 수수료를 빼먹어
     표시된 최대치를 그대로 주문하면 반드시 '예수금 부족'으로 거절됐다. */
  if($('maxQty'))$('maxQty').textContent=ordSide==='buy'?'가능 '+KRW(maxBuyQty(getOrderPrice()))+'주':'보유 '+KRW(h?intOf(h.qty,0):0)+'주';}
document.querySelectorAll('.ord-tabs button').forEach(b=>b.onclick=()=>{
  ordSide=b.dataset.side;document.querySelectorAll('.ord-tabs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  const sub=$('submitBtn');sub.className='submit '+ordSide;sub.textContent=ordSide==='buy'?'매수 주문':'매도 주문';syncPriceField(false);});
// 거래소구분 / 주문유형 선택 (SOR·KRX·NXT)
const ORDER_TYPES={
  SOR:['보통지정가','시장가','최유리지정가','최우선지정가','보통지정가 IOC','시장가 IOC','최유리 IOC','최우선 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK'],
  KRX:['보통지정가','시장가','조건부지정가','최유리','최우선','중간가','스톱지정가','시간외종가','시간외단일가','보통지정가 IOC','시장가 IOC','최유리 IOC','중간가 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK','중간가 FOK'],
  NXT:['보통지정가','시장가','중간가','스톱지정가','최유리','최우선','KRX종가매매','보통지정가 IOC','시장가 IOC','최유리 IOC','중간가 IOC','보통지정가 FOK','시장가 FOK','최유리 FOK','중간가 FOK'],
};
let ordExchange='KRX',ordTypeName='보통지정가',otTabEx='KRX';
const isMarketType=(t)=>/시장가|중간가|최유리|최우선|종가매매|시간외/.test(t)&&!/지정가/.test(t)||/^시장가/.test(t);
/* ══ [v4.8] KRX 시장경보 → NXT 일시제외 오버레이 ═══════════════════════════
   넥스트레이드 규정: ① 투자경고·투자위험 지정 ② KRX 거래정지 ③ 관리종목 지정
   종목은 지정 즉시 NXT 매매체결대상에서 정지/제외되고, 사유 해소 시 복귀한다.
   기존에는 분기 정기변경 명단만 봐서 삼현처럼 장중 경고 지정된 종목이
   계속 NXT 가능으로 보였다. /api/krxalerts(10분 캐시)로 코드→사유 지도를 받아
   주문 창구·세션 배너·재개시각 계산 전부에 같은 판정을 적용한다. */
let krxAlerts={map:{},at:0,fail:0};
const NXT_SUS_LABEL={warn:'투자경고 지정',risk:'투자위험 지정',halt:'매매거래 정지',mgmt:'관리종목 지정'};
function nxtSuspendInfo(code){
  const t=krxAlerts.map&&krxAlerts.map[String(code||'')];
  return t?{t,label:NXT_SUS_LABEL[t]||t}:null;
}
async function loadKrxAlerts(){
  try{
    fnBump();
    const r=await fetch('/api/krxalerts',{cache:'no-store'});
    const j=await r.json();
    if(j&&j.ok&&j.map){
      const changed=JSON.stringify(Object.keys(j.map).sort())!==JSON.stringify(Object.keys(krxAlerts.map||{}).sort());
      krxAlerts={map:j.map,at:j.at||Date.now(),fail:0};
      if(changed){                       // 지정/해제가 실제로 바뀐 경우에만 화면 갱신
        try{renderTradeGate();}catch(e){}
        try{renderAdvFlags();}catch(e){}
        try{if(currentView==='trade')configOrderExchanges();}catch(e){}
      }
    }else{krxAlerts.fail=(krxAlerts.fail||0)+1;}
  }catch(e){krxAlerts.fail=(krxAlerts.fail||0)+1;}
}

/* ══ [v4.9] 종목 심화 정보 — 증거금·신용·시장경보 상세·시장 이벤트 ═════════
   · 시장경보(경고/위험/정지/관리/주의)는 /api/krxalerts 명단(10분 갱신)에서,
   · 지정예고·단기과열·정리매매 같은 페이지 전용 배지와 증거금률은
     /api/stockflags(종목별 6시간 캐시)에서 받아 합쳐 보여 준다.
   · 신용 가능/불가는 위탁증거금 100% 여부로 판정한다(증100% = 신용·미수 불가,
     실제 한도는 증권사별 상이 — 칩에 명시).
   · 사이드카·서킷브레이커는 코스피200 선물·코스피/코스닥 등락률로
     '조건 감지'를 표시한다(공식 발동·해제는 거래소 공시 기준). */
let stockFlags={};                       // code -> {at, margin, badges[]}
async function loadStockFlags(code){
  const c=String(code||''); if(!/^\d{6}$/.test(c))return;
  const hit=stockFlags[c];
  if(hit&&Date.now()-hit.at<10*60*1000){renderAdvFlags();return;}
  try{
    fnBump();
    const r=await fetch('/api/stockflags?code='+c,{cache:'no-store'});
    const j=await r.json();
    stockFlags[c]={at:Date.now(),margin:(j&&j.margin!=null)?+j.margin:null,badges:(j&&j.badges)||[]};
  }catch(e){stockFlags[c]=stockFlags[c]||{at:Date.now()-9*60*1000,margin:null,badges:[]};}
  if(selected===c)renderAdvFlags();
}
function marketEventChips(){
  const out=[];
  try{
    /* [v4.11 · 버그] 장전·장후에도 어제 등락률로 "매도 사이드카 조건 감지"가
       떴다(첨부: 00:09 장전 화면). 사이드카·CB는 KRX 정규장 중의 실시간
       변동에만 의미가 있으므로 정규장 밖에서는 평가 자체를 하지 않는다. */
    if(!krxRegularOpen())return out;
    const by={}; (market.indices||[]).forEach(x=>{if(x&&x.key)by[x.key]=x;});
    const f=by.K200F, kp=by.KOSPI, kd=by.KOSDAQ;
    if(f&&f.rate!=null&&Math.abs(f.rate)>=5)
      out.push({cls:'mktbad',t:(f.rate<0?'매도':'매수')+' 사이드카 조건 감지',i:'⚡',
        tip:`코스피200 선물 ${f.rate>0?'+':''}${(+f.rate).toFixed(2)}% — 5% 이상 1분 지속 시 프로그램호가 5분 정지`});
    const cb=(nm,r)=>{if(r==null)return;const a=Math.abs(r);
      if(r<=-20)out.push({cls:'mktbad',t:`${nm} 서킷브레이커 3단계 조건 · 당일 매매 종료`,i:'⛔',tip:`${nm} ${r.toFixed(2)}%`});
      else if(r<=-15)out.push({cls:'mktbad',t:`${nm} 서킷브레이커 2단계 조건 감지`,i:'⛔',tip:`${nm} ${r.toFixed(2)}% — 20분 중단 조건`});
      else if(r<=-8)out.push({cls:'mktbad',t:`${nm} 서킷브레이커 1단계 조건 감지`,i:'⛔',tip:`${nm} ${r.toFixed(2)}% — 20분 중단 조건`});};
    cb('코스피',kp&&kp.rate); cb('코스닥',kd&&kd.rate);
  }catch(e){}
  return out;
}
/* ══ [v4.20] 시장경보 배지 정규화 ═══════════════════════════════════════════
   [무엇이 잘못됐나] 배지를 세 곳에서 모아 합집합으로 그렸다 —
     ① 공시 상태기계(sf.badges) ② KRX 투자경고·위험 명단(alert) ③ 투자주의 명단.
   이들이 서로 다른 시점을 보기 때문에, 이미 '투자경고 지정'된 종목에
   철 지난 '투자주의 지정예고'가 나란히 붙었다(첨부 사진의 삼현).
   [규칙] 시장경보는 주의 → 경고 → 위험 3단계의 사다리다.
     · 같은 등급에 '지정'이 있으면 그 등급의 '지정예고'는 의미가 없다 → 제거
     · 더 높은 등급이 지정돼 있으면 아래 등급은 지정이든 예고든 이미 흡수됐다 → 제거
     · 상위 등급의 '예고'는 아래 등급이 지정된 상태에서도 유효하다(승격 예고) → 유지
   거래정지·관리종목·단기과열·정리매매는 별개 축이라 사다리에서 제외한다.
   ('투자주의환기종목'은 이름만 비슷할 뿐 관리종목 계열이므로 주의 등급과 섞지 않는다) */
const AF_TIER={'투자주의':1,'투자경고':2,'투자위험':3};
function normalizeAlertBadges(set){
  const arr=[...set].filter(Boolean);
  const isPre=(t)=>/지정예고$/.test(t);
  const baseOf=(t)=>t.replace(/지정예고$/,'');
  // 사다리에서 '지정'된 최고 등급
  let top=0;
  arr.forEach(t=>{ if(t==='투자주의환기종목')return;
    if(!isPre(t)&&AF_TIER[t])top=Math.max(top,AF_TIER[t]); });
  const out=arr.filter(t=>{
    if(t==='투자주의환기종목')return true;              // 별개 축
    const b=baseOf(t), tier=AF_TIER[b];
    if(!tier)return true;                              // 정지·관리·과열 등은 그대로
    if(isPre(t)){
      if(tier<=top)return false;                       // 이미 그 등급 이상이 지정됨 → 철 지난 예고
      return true;                                     // 상위 등급 승격 예고는 유지
    }
    return tier>=top;                                  // 지정: 최고 등급만 남긴다
  });
  return new Set(out);
}
/* ══ [v4.21] 시장경보 배지 표기 규격 ═══════════════════════════════════════
   증권사 MTS 관행대로 짧고 단정하게 — 지정예고는 '경고예', 지정 확정은 '경고'. */
const AF_BADGE_DEF={
  '투자위험'        :{t:'위험',        i:'⛔️',cls:'risk',   tip:'시장경보 3단계 · 투자위험종목 지정 — 매매거래가 정지될 수 있습니다'},
  '투자위험지정예고':{t:'위험예',      i:'⚠️',cls:'pre',    tip:'투자위험종목 지정예고 — 요건 충족 시 지정됩니다'},
  '투자경고'        :{t:'경고',        i:'⛔️',cls:'warn',   tip:'시장경보 2단계 · 투자경고종목 지정 — 신용·미수 불가, 위탁증거금 100%'},
  '투자경고지정예고':{t:'경고예',      i:'⚠️',cls:'pre',    tip:'투자경고종목 지정예고 — 요건 충족 시 투자경고로 지정됩니다'},
  '투자주의'        :{t:'주의',        i:'🔔',cls:'caution',tip:'시장경보 1단계 · 투자주의종목 지정 — NXT 거래는 유지됩니다'},
  '투자주의지정예고':{t:'주의예',      i:'⚠️',cls:'pre',    tip:'투자주의종목 지정예고'},
  '단기과열'        :{t:'단기과열',    i:'🔥',cls:'warn',   tip:'단기과열종목 지정 — 30분 단일가매매가 적용됩니다'},
  '단기과열지정예고':{t:'과열예',      i:'⚠️',cls:'pre',    tip:'단기과열종목 지정예고'},
  '거래정지'        :{t:'거래정지',    i:'🛑',cls:'halt',   tip:'매매거래 정지 중 — 주문을 낼 수 없습니다'},
  '정리매매'        :{t:'정리매매',    i:'🛑',cls:'halt',   tip:'상장폐지 확정 후 정리매매 기간'},
  '관리종목'        :{t:'관리종목',    i:'📛',cls:'mgmt',   tip:'관리종목 지정 — 상장폐지 요건에 해당합니다'},
  '투자주의환기종목':{t:'투자주의환기',i:'📛',cls:'mgmt',   tip:'투자주의환기종목 — 내부회계·경영 안정성 관련 지정'},
  '불성실공시법인'  :{t:'불성실공시',  i:'📛',cls:'mgmt',   tip:'불성실공시법인 지정'},
};
const AF_BADGE_STYLE=Object.fromEntries(Object.entries(AF_BADGE_DEF).map(([k,v])=>[k,v.cls]));
const AF_RANK={'거래정지':0,'정리매매':1,'투자위험':2,'투자위험지정예고':3,'투자경고':4,'투자경고지정예고':5,
  '단기과열':6,'단기과열지정예고':7,'투자주의':8,'투자주의지정예고':9,'관리종목':10,'투자주의환기종목':11,'불성실공시법인':12};
function renderAdvFlags(){
  const box=$('advFlags'); if(!box)return;
  const code=selected, st=byCode[code];
  if(!code||!st){box.hidden=true;return;}
  const chips=[];
  const sf=stockFlags[code]||{};
  /* ══ [v4.21 · 치명] 배지를 정규화 없이 그리고 있었다 ═════════════════════
     v4.20 에서 계층 정규화를 만들었지만, 정작 화면 칩은 명단·공시를 각자 따로
     push 하고 정규화 결과는 '증거금 계산'에만 썼다. 그래서 삼현처럼
     '투자경고 지정'과 '투자주의 지정예고'가 여전히 나란히 떴다.
     → 세 출처를 한 집합으로 모아 정규화한 뒤, 그 결과만으로 칩을 만든다.
     화면·증거금·신용 판정이 같은 한 벌을 보게 되어 어긋날 수 없다. */
  const alert=krxAlerts.map&&krxAlerts.map[code];
  const _ALERT2B={warn:'투자경고',risk:'투자위험',halt:'거래정지',mgmt:'관리종목'};
  let _bset=new Set(sf.badges||[]);
  if(alert&&_ALERT2B[alert])_bset.add(_ALERT2B[alert]);
  try{if((krxAlerts.caution||[]).includes(code))_bset.add('투자주의');}catch(e){}
  _bset=normalizeAlertBadges(_bset);
  [..._bset].sort((x,y)=>(AF_RANK[x]!=null?AF_RANK[x]:99)-(AF_RANK[y]!=null?AF_RANK[y]:99)).forEach(bn=>{
    const d=AF_BADGE_DEF[bn];
    const fromList=!!(alert&&_ALERT2B[alert]===bn);
    chips.push(d?{cls:d.cls,t:d.t,i:d.i,
        tip:d.tip+(fromList?' · KRX 시장경보 명단 기준(10분마다 갱신)':' · 거래소 시장경보 공시 기준')}
      :{cls:'warn',t:bn,i:'🚨',tip:'거래소 시장경보 기준'});
  });
  const sus=nxtSuspendInfo(code);
  if(sus&&st.nxt)chips.push({cls:'sus',t:'NXT 매매 일시 제외',i:'⛔',tip:sus.label+' — 해소 시 자동 복귀'});
  /* 2) 증거금·신용 — [v4.11] '정보 없음' 폐지.
     네이버 종목 페이지에는 증거금률이 아예 없어 스크레이프가 사실상 항상 비었고,
     경고예고 종목(로보티즈·티엑스알)이 미래에셋에선 '신용불가'인데 우리는
     '정보 없음'으로 떴다. 증권사 실무 관행대로 시장경보와 연동한 자체 기준으로
     항상 판정하고, 드물게 스크레이프 값이 있으면 그 값을 우선한다. */
  /* 위에서 확정한 _bset 을 그대로 사용 — 화면과 증거금 판정이 어긋날 수 없다 */
  /* [v4.12] '…지정예고'로 끝나는 어떤 배지든 증거금 100%·신용불가로 본다
     (미래에셋이 '경고예'를 신용불가로 표시하는 것과 동일한 실무 기준). */
  const _hard=[..._bset].some(t=>/지정예고|예고$/.test(t))
    ||['거래정지','투자위험','투자경고','관리종목','정리매매','단기과열','투자주의환기종목','불성실공시법인'].some(t=>_bset.has(t));
  const effM=sf.margin!=null?+sf.margin:(_hard?100:_bset.has('투자주의')?60:40);
  const mSrc=sf.margin!=null?'네이버 표기 기준':'LIVE증권 자체 기준 · KRX 시장경보 연동';
  chips.push({cls:'neu',t:'증거금 '+effM+'%',i:'💰',tip:'위탁증거금률 — '+mSrc+' · 실제 요율은 증권사·계좌별로 다릅니다'});
  chips.push(effM>=100
    ?{cls:'no',t:'신용·미수 불가',i:'🚫',tip:_hard?'시장경보·거래정지 지정 종목은 신용거래·미수가 제한됩니다':'증거금 100% 종목은 신용·미수가 제한됩니다'}
    :{cls:'ok',t:'신용 가능',i:'✔',tip:'증거금 '+effM+'% — 신용·미수 가능(한도는 증권사별 상이)'});
  /* 3) 시장 이벤트 */
  const ev=marketEventChips();
  if(ev.length)ev.forEach(c=>chips.push(c));
  else chips.push(krxRegularOpen()
    ?{cls:'mkt',t:'시장 정상 가동',i:'🟢',tip:'사이드카·서킷브레이커 발동 조건 미감지 (지수 등락률 기반 실시간 감지)'}
    :{cls:'mkt',t:'시장 이벤트 감지 대기',i:'🕒',tip:'사이드카·서킷브레이커 감지는 KRX 정규장(09:00~15:20) 중에만 평가합니다'});
  box.innerHTML=chips.map(c=>`<span class="af ${c.cls}" title="${(c.tip||'').replace(/"/g,'&quot;')}"><i>${c.i||''}</i>${c.t}</span>`).join('');
  box.hidden=false;
}
function availableExchanges(){
  const st=byCode[selected];
  if(!(st&&st.nxt===true))return ['KRX'];
  /* 시장경보·거래정지·관리종목 → NXT 창구 즉시 잠금 (SOR 도 NXT 라우팅이 막히므로 함께 제외) */
  if(nxtSuspendInfo(selected))return ['KRX'];
  return ['SOR','KRX','NXT'];
}
/* [v3.8] 예전엔 정규장(15:30) 이후 KRX 를 통째로 잠갔다. 그런데 15:40~18:00 은
   시간외 종가·시간외 단일가로 KRX 주문이 실제로 가능한 시간이다.
   → '어떤 KRX 세션도 없는 시간'에만 잠근다. */
function krxLocked(){const av=availableExchanges();return av.includes('NXT')&&!krxTradable();}
/* 지금 이 순간 실제로 낼 수 있는 KRX 주문유형만 남긴다 */
function krxTypesNow(){
  const k=krSession(), ph=k.krx.phase; let all=ORDER_TYPES.KRX;
  /* [v4.0.1] KRX 세션이 아예 없는 시간에는 빈 목록을 돌려 모델을 자기모순 없이 유지한다.
     (탭이 잠겨 화면엔 안 뜨지만, 다른 코드가 이 함수를 참조할 때 오해가 없도록) */
  if(!k.krx.tradable)return [];
  /* [v4.0] NXT 거래 종목은 KRX 시간외 단일가를 쓸 수 없다(넥스트레이드 애프터마켓과 배타).
     예전엔 16:00~18:00 에 NXT 종목도 시간외단일가를 고를 수 있어 실제로는 불가능한 주문이었다. */
  const isNxt=!!(byCode[selected]&&byCode[selected].nxt===true);
  if(isNxt)all=all.filter(t=>!/시간외단일가/.test(t));
  if(isNxt&&ph===KRS.AFT_SINGLE)return [];
  if(ph===KRS.PRE_CLOSE)return all.filter(t=>/시간외종가/.test(t)||(k.krx.alsoAuction&&/^보통지정가$|^시장가$/.test(t)));
  if(ph===KRS.AFT_CLOSE)return all.filter(t=>/시간외종가/.test(t));
  if(ph===KRS.AFT_SINGLE)return all.filter(t=>/시간외단일가/.test(t));
  if(ph===KRS.PRE_AUC||ph===KRS.CLOSE_AUC)return all.filter(t=>/^보통지정가$|^시장가$/.test(t));
  if(ph===KRS.REG)return all.filter(t=>!/시간외/.test(t));
  return all;
}
function configOrderExchanges(){
  const av=availableExchanges();
  ordExchange=av.includes('SOR')?'SOR':'KRX';
  /* [v3.7] NXT 가능 종목이 KRX 시간 외에 KRX로 잡혀 있으면 체결 불가능한 주문이 된다 → 자동 전환 */
  if(ordExchange==='KRX'&&krxLocked())ordExchange=av.includes('SOR')?'SOR':'NXT';
  if(!ORDER_TYPES[ordExchange].includes(ordTypeName))ordTypeName='보통지정가';
  applyOrderType();
}
/* ══ [v4.5] 거래·주문 화면 상시 세션 배너 ═══════════════════════════════════
   [무엇이 잘못됐나]
   '실제 시장 시간으로 매수/매도'가 켜져 있으면 장 시간 밖 주문은 거절되는데,
   그 사실을 알 방법이 주문 버튼을 눌러 본 뒤 뜨는 토스트뿐이었다.
   수량까지 다 채우고 눌러야 "안 됩니다"를 듣는 구조였다.
   [해결] 주문 폼 맨 위에 지금 상태를 항상 띄운다.
     · 거래 가능  → 초록 한 줄(어느 세션인지)
     · 거래 불가  → 빨강 카드(이유 · 재개 시각 · 설정 끄기 버튼) + 주문 버튼 잠금
   ═════════════════════════════════════════════════════════════════════════ */
function renderTradeGate(){
  const box=$('tradeGate'); if(!box)return;
  const btn=$('submitBtn');
  const code=selected, st=byCode[code];
  if(!code||!st){box.innerHTML='';if(btn)btn.classList.remove('locked');return;}
  const ses=marketSession(), ok=canTradeNow(code);
  if(!settings.realHours){
    box.innerHTML=`<div class="tg tg-free"><i>🕒</i><span><b>${ses.label}</b> · 실제 장 시간 제한이 꺼져 있어 언제든 모의 주문이 가능합니다</span></div>`;
    if(btn)btn.classList.remove('locked');
    return;
  }
  if(ok){
    const lab=tradeSessionLabel(code)||ses.label;
    const _s2=nxtSuspendInfo(code);
    box.innerHTML=`<div class="tg tg-open"><i>●</i><span>주문 가능 · <b>${lab}</b></span></div>`
      +(_s2&&st.nxt?`<div class="tg tg-sus"><i>⛔</i><span><b>NXT 일시제외 · ${_s2.label}</b> — 해제 전까지 KRX로만 체결됩니다</span></div>`:'');
    if(btn)btn.classList.remove('locked');
    return;
  }
  const nx=nextTradeOpenText(code);
  const _sus=nxtSuspendInfo(code);
  const why=_sus
    ? `이 종목은 <b>${_sus.label}</b>으로 NXT 매매가 일시 제외되어(넥스트레이드 규정 · 해제 시 자동 복귀) KRX 주문 시간에만 거래할 수 있습니다.`
    : st.nxt
      ? 'KRX·NXT 모두 주문을 받지 않는 시간입니다. (NXT 휴지 08:50~09:00:30 · 15:20~15:30)'
      : '이 종목은 NXT 미지원이라 KRX 주문 시간(08:30~18:00)에만 거래할 수 있습니다.';
  box.innerHTML=`<div class="tg tg-shut">
    <div class="tg-ic">🔒</div>
    <div class="tg-tx">
      <div class="tg-t">지금은 거래시간이 아닙니다 · ${ses.label}</div>
      <div class="tg-d">${why}</div>
      ${nx?`<div class="tg-next">다음 주문 가능 시각 <b>${nx}</b></div>`:''}
      <div class="tg-act"><button type="button" id="tgOff">언제든 주문하려면 설정 끄기</button>
        <button type="button" id="tgHours">거래시간표 보기</button></div>
    </div></div>`;
  if(btn)btn.classList.add('locked');
  const off=$('tgOff'); if(off)off.onclick=()=>{settings.realHours=false;saveSettings();
    try{renderSettingsUI();}catch(e){}
    renderTradeGate();toast('buy','실제 장 시간 제한 해제','이제 시간과 무관하게 모의 매수/매도를 할 수 있습니다. 설정에서 다시 켤 수 있어요.');};
  const hrs=$('tgHours'); if(hrs)hrs.onclick=()=>{const h=$('hrOv');if(h)h.hidden=false;else toast('on',ses.label,ses.sub||'');};
}
setInterval(()=>{try{if(currentView==='trade'){renderTradeGate();renderAdvFlags();}}catch(e){}},20000);

function applyOrderType(){
  ordType=isMarketType(ordTypeName)?'market':'limit';
  const av=availableExchanges();
  $('otSelText').textContent=(av.length>1?ordExchange+' · ':'KRX · ')+ordTypeName;
  try{renderTradeGate();}catch(e){}
  const inp=$('pxInput');inp.disabled=ordType==='market';inp.style.opacity=ordType==='market'?.55:1;syncPriceField(ordType==='market');
}
function renderOtList(){
  const av=availableExchanges();if(!av.includes(otTabEx))otTabEx=av[0];
  /* [v3.7] KRX 정규장 시간 외에는 NXT 가능 종목의 KRX 탭을 잠근다 —
     지금 선택해 봐야 체결될 수 없는 창구이기 때문. 정규장이 열리면 자동으로 풀린다. */
  const lock=krxLocked();
  if(lock&&otTabEx==='KRX')otTabEx=av.includes('SOR')?'SOR':'NXT';
  $('otTabs').innerHTML=av.map(ex=>{const off=lock&&ex==='KRX';
    return `<button data-ex="${ex}"${ex===otTabEx?' class="on"':off?' class="off"':''}${off?' aria-disabled="true"':''}>${ex}</button>`;}).join('');
  $('otTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    if(lock&&b.dataset.ex==='KRX'){
      const nx=nextTradeOpenText(selected);
      toast('warn','🔒 KRX 주문 불가 · '+marketSession().label,
        'KRX는 평일 08:30~18:00(장전 시간외~시간외 단일가)에만 주문을 받습니다.'+(nx?` KRX 재개 ${nx}.`:'')+' 지금은 NXT 또는 SOR로 주문해 주세요.');return;}
    otTabEx=b.dataset.ex;renderOtList();});
  const cur=otTabEx===ordExchange;
  /* [v4.0] NXT 프리·애프터마켓은 지정가 주문만 받는다 */
  const _k=krSession();
  const types=otTabEx==='KRX'?krxTypesNow()
    :otTabEx==='NXT'&&_k.nxt.limitOnly?ORDER_TYPES.NXT.filter(t=>/지정가/.test(t)&&!/IOC|FOK/.test(t))
    :ORDER_TYPES[otTabEx];
  $('otList').innerHTML=types.map(t=>`<button class="ot-item${cur&&t===ordTypeName?' on':''}" data-t="${t}">${t}${cur&&t===ordTypeName?'<span class="ot-ck">✓</span>':''}</button>`).join('');
  $('otList').querySelectorAll('.ot-item').forEach(b=>b.onclick=()=>{ordExchange=otTabEx;ordTypeName=b.dataset.t;applyOrderType();$('otGate').hidden=true;});
  /* ══ [v4.5] 거래 불가 안내를 '눈에 들어오는 경고 카드'로 승격 ═════════════
     예전엔 11.5px 회색 글씨를 회색 배경에 얹은 한 줄이라, 정작 가장 중요한
     'KRX로는 주문이 안 된다'는 사실이 목록에 묻혀 보이지 않았다.
     아이콘 · 제목 · 설명 · 다음 행동을 갖춘 카드로 바꾸고 색으로 등급을 구분한다.
     ═══════════════════════════════════════════════════════════════════════ */
  const alertCard=(tone,icon,title,desc,act)=>
    `<div class="ot-alert ${tone}"><div class="ot-alert-ic">${icon}</div>
      <div class="ot-alert-tx"><div class="ot-alert-t">${title}</div>
      <div class="ot-alert-d">${desc}</div>${act?`<div class="ot-alert-a">${act}</div>`:''}</div></div>`;
  const reopen=nextTradeOpenText(selected);
  let note='';
  const _susM=nxtSuspendInfo(selected);
  if(av.length===1){
    note=_susM
      ? alertCard('block','⛔','NXT 매매 일시 제외 · '+_susM.label,
          '넥스트레이드 규정상 <b>투자경고·투자위험 지정</b>, <b>KRX 거래정지</b>, <b>관리종목 지정</b> 종목은 지정 즉시 NXT 체결 대상에서 제외됩니다. 사유가 해소되면 자동으로 복귀합니다.',
          '해제 전까지 <b>KRX</b>로만 주문할 수 있어요.'+(reopen?` · KRX 재개 ${reopen}`:''))
      : alertCard('info','ℹ️','이 종목은 KRX 전용입니다',
          '넥스트레이드(NXT) 미지원 종목이라 거래소 선택 없이 <b>KRX</b>로만 주문할 수 있어요.');
  }else if(lock){
    note=alertCard('block','🔒','지금은 KRX로 주문할 수 없습니다',
      `현재 <b>${marketSession().label}</b> — KRX는 <b>08:30 장전 시간외</b>부터 <b>18:00 시간외 단일가</b>까지만 주문을 받습니다.`,
      `아래 <b>NXT</b> 또는 <b>SOR</b> 탭에서 주문해 주세요.${reopen?` · KRX 재개 ${reopen}`:''}`);
  }else if(otTabEx==='KRX'&&types.length===0){
    note=alertCard('block','🔒','이 종목은 KRX 시간외 단일가를 쓸 수 없습니다',
      'NXT에서 거래되는 종목은 KRX 시간외 단일가(16:00~18:00)가 제한됩니다.',
      '같은 시간대에 열려 있는 <b>NXT 애프터마켓</b>으로 주문해 주세요.');
  }else if(otTabEx==='NXT'&&_k.nxt.limitOnly){
    note=alertCard('warn','⚠️',`NXT ${_k.nxt.phase} — 지정가 주문만 가능`,
      '프리마켓·애프터마켓에서는 시장가 계열 주문을 받지 않습니다. 가격제한폭은 전일 종가 ±30%로 정규장과 같습니다.');
  }else if(otTabEx==='KRX'&&_k.krx.phase&&_k.krx.phase!==KRS.REG){
    note=alertCard('warn','⚠️',`현재 KRX ${_k.krx.phase}`,
      '이 세션에서 실제로 접수 가능한 주문유형만 아래에 표시됩니다.');
  }
  if(note)$('otList').insertAdjacentHTML('afterbegin',note);
}
$('otSelect').onclick=()=>{otTabEx=ordExchange;$('otGate').hidden=false;renderOtList();};
$('otClose').onclick=()=>{$('otGate').hidden=true;};
$('otGate').onclick=(e)=>{if(e.target.id==='otGate')$('otGate').hidden=true;};
function stepPrice(d){const base=getOrderPrice(),t=tickSize(base||1);userPrice=Math.max(t,base+d*t);$('pxInput').value=KRW(userPrice);updateOrderTotal();}
$('pxUp').onclick=()=>stepPrice(1);$('pxDown').onclick=()=>stepPrice(-1);
$('pxInput').addEventListener('input',e=>{userPrice=parseInt(e.target.value.replace(/[^0-9]/g,''))||0;updateOrderTotal();});
$('pxInput').addEventListener('blur',e=>{if(userPrice!==null){userPrice=Math.max(tickSize(userPrice||1),roundTick(userPrice));e.target.value=KRW(userPrice);updateOrderTotal();}});
function setQty(q){$('qtyInput').value=KRW(Math.max(0,q));updateOrderTotal();}
$('qtyUp').onclick=()=>setQty(getQty()+1);$('qtyDown').onclick=()=>setQty(Math.max(0,getQty()-1));
$('qtyInput').addEventListener('input',e=>{e.target.value=e.target.value.replace(/[^0-9,]/g,'');updateOrderTotal();});
$('qtyQuick').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const r=+b.dataset.q/100;
  if(ordSide==='buy')setQty(Math.floor(maxBuyQty(getOrderPrice())*r));else{const h=holdings.find(x=>x.code===selected);setQty(Math.floor(intOf(h&&h.qty,0)*r));}});

/* 주문 → 계좌 비밀번호 → 체결 */
let pendingOrder=null,pwBuf='';
function canTradeNow(code){                       // 실제 시장 시간 판단(설정 ON일 때 사용)
  const st=byCode[code];
  /* [v3.9 · 모순 해소] 주문유형 모달은 15:40~18:00 시간외 KRX 주문을 허용하는데
     이 게이트는 정규장만 통과시켰다. 시간외단일가를 고르고 주문을 넣으면
     '장 마감 · 주문 불가'로 거절되는 앞뒤가 안 맞는 상태였다.
     → KRX 주문이 가능한 모든 세션(장전 시간외~시간외 단일가)을 인정한다. */
  if(krxTradable())return true;                  // 08:30~09:00 동시호가 · 09:00~15:30 · 15:40~18:00 시간외
  if(st&&st.nxt&&!nxtSuspendInfo(code)&&nxtActive())return true; // 그 밖 시간: NXT 종목만([v4.8] 시장경보 일시제외는 KRX 시간만 인정)
  return false;
}
/* ══ [v4.5] 다음에 주문이 열리는 시각 ═══════════════════════════════════════
   '지금 안 된다'만 알려 주고 끝내면 사용자는 언제 다시 오라는 건지 알 수 없다.
   종목이 NXT 취급인지에 따라 창구가 달라지므로 창(window)을 종목별로 고른다.
   ═════════════════════════════════════════════════════════════════════════ */
const KRX_WINDOWS=[[510,930],[940,1080]];      // 08:30~15:30 · 15:40~18:00 (KST 분)
const NXT_WINDOWS=[[480,530],[540,920],[930,1200]]; // 08:00~08:50 · 09:00~15:20 · 15:30~20:00
function krTradingDayAt(kstDate){
  const wd=kstDate.getUTCDay(); if(wd===0||wd===6)return false;
  try{ return !KR_HOLIDAYS[kstDate.toISOString().slice(0,10)]; }catch(e){ return true; }
}
function nextTradeOpenText(code){
  try{
    const st=byCode[code]||{};
    const wins=(st.nxt===true&&!nxtSuspendInfo(code))
      ? KRX_WINDOWS.concat(NXT_WINDOWS).sort((a,b)=>a[0]-b[0])
      : KRX_WINDOWS;                       // [v4.8] NXT 일시제외 종목은 KRX 창구만으로 재개 시각 계산
    const k=kstNow();
    const nowMin=k.getUTCHours()*60+k.getUTCMinutes();
    for(let d=0;d<8;d++){
      const day=new Date(k.getTime()+d*86400e3);
      if(!krTradingDayAt(day))continue;
      for(const [s] of wins){
        if(d===0&&s<=nowMin)continue;
        const hh=String(Math.floor(s/60)).padStart(2,'0'), mm=String(s%60).padStart(2,'0');
        const when=d===0?'오늘':d===1?'내일':`${day.getUTCMonth()+1}월 ${day.getUTCDate()}일`;
        return `${when} ${hh}:${mm}`;
      }
    }
  }catch(e){}
  return '';
}
/* 지금 이 주문이 어느 세션에서 체결되는지 — 안내문에 쓴다 */
function tradeSessionLabel(code){
  const k=krSession(),st=byCode[code];
  if(k.krx.phase)return 'KRX '+k.krx.phase;
  if(st&&st.nxt&&!nxtSuspendInfo(code)&&k.nxt.tradable)return 'NXT '+k.nxt.phase;
  return '';
}
$('submitBtn').onclick=()=>{
  const s=byCode[selected];if(s.price==null){toast('warn','시세 수신 대기','가격을 받은 뒤 주문하세요');return;}
  if(settings.realHours&&!canTradeNow(s.code)){
    const _st=byCode[s.code];
    const _nx=nextTradeOpenText(s.code);
    const _why=(_st&&_st.nxt)?'KRX·NXT 모두 거래시간이 아니에요 (NXT 휴지 08:50~09:00:30 · 15:20~15:30)'
      :'지금은 KRX 거래시간이 아니에요 (08:30~18:00). 이 종목은 NXT 미지원이라 KRX 시간에만 주문할 수 있어요';
    toast('warn','🔒 주문 불가 · '+marketSession().label,
      _why+(_nx?` · 다음 주문 가능 ${_nx}`:'')+' · 주문 폼 위 배너에서 제한을 바로 끌 수 있습니다.');
    try{renderTradeGate();}catch(e){}
    return;}
  const price=getOrderPrice(),qty=getQty();if(qty<=0){toast('warn','수량을 확인하세요','1주 이상');return;}
  if(!(price>0)){toast('warn','주문가격을 확인하세요','1원 이상');return;}
  /* [v4.5] 체결 함수와 똑같은 orderCost 로 검증한다 — 화면 표시와 실제 판정이 어긋나지 않게. */
  const _c=orderCost(ordSide,price,qty);
  if(ordSide==='buy'&&_c.cost>cash){
    toast('warn','주문 불가 · 예수금 부족',
      `필요 ${KRW(_c.cost)}원(주문 ${KRW(_c.amount)} + 수수료 ${KRW(_c.fee)}) · 예수금 ${KRW(cash)}원 · ${KRW(_c.cost-cash)}원 모자랍니다 · 최대 ${KRW(maxBuyQty(price))}주까지 가능`);
    return;}
  const h=holdings.find(x=>x.code===s.code);
  if(ordSide==='sell'&&(!h||h.qty<qty)){toast('warn','보유수량 부족',`보유 ${KRW(h?h.qty:0)}주`);return;}
  /* [v2.5] 예약 주문 — 체크 시 조건 미충족 가격이면 대기열에 등록하고 도달 시 자동 체결 */
  const bookOn=$('ordBook')&&$('ordBook').checked;
  if(bookOn){
    const q=dispQuote(s.code)||{},cur=q.price!=null?q.price:s.price;
    const immediate=ordSide==='buy'?(cur!=null&&cur<=price):(cur!=null&&cur>=price);
    if(!immediate){
      bookOrders.push({id:'b'+Date.now().toString(36),code:s.code,name:s.name,side:ordSide,qty,price,createdAt:Date.now()});
      subscribeAutoCodes();saveState();
      toast('on','예약 주문 등록',`${s.name} ${ordSide==='buy'?'매수':'매도'} ${KRW(qty)}주 · ${KRW(price)}원 도달 시 자동 체결`);
      if(currentView==='account')safeRun('autocard',renderAutoCard);
      return;
    }
  }
  pendingOrder={side:ordSide,price,qty};
  if(settings.orderPass){openPw();}                 // 비밀번호 확인 ON
  else{const o=pendingOrder;pendingOrder=null;executeOrder(o);}  // OFF: 즉시 주문
};
function openPw(){pwBuf='';$('pwMsg').textContent='';$('pwTitle').textContent=(pendingOrder.side==='buy'?'매수':'매도')+' · 계좌 비밀번호';renderPwDots();$('pwGate').hidden=false;}
function closePw(){$('pwGate').hidden=true;pendingOrder=null;pwBuf='';}
function renderPwDots(){$('pwDots').querySelectorAll('span').forEach((d,i)=>d.classList.toggle('f',i<pwBuf.length));}
$('keypad').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
  if(k==='C')pwBuf='';else if(k==='X')pwBuf=pwBuf.slice(0,-1);else if(pwBuf.length<4)pwBuf+=b.textContent;
  renderPwDots();
  if(pwBuf.length===4){pwHash(pwBuf).then(h=>{const AP=acctPwOf();if(h===AP||legacyHash(pwBuf)===AP){const o=pendingOrder;closePw();executeOrder(o);}else{$('pwMsg').textContent='비밀번호가 올바르지 않습니다';pwBuf='';setTimeout(renderPwDots,400);}});}});
$('pwCancel').onclick=closePw;
function executeOrder(o){return executeOrderCore(byCode[selected],o,'');}
/* [v2.5] 코어 분리 — 예약·손절·익절 자동 체결이 '보고 있지 않은 종목'에도 안전하게 작동 */
let _settling=false;                 // [v4.5] 재진입 방지 — 연타·자동체결 겹침으로 잔고가 두 번 빠지는 것을 막는다
function executeOrderCore(s,o,tag){
  /* [B3] 호출부 검증과 별개로 여기서 한 번 더 확인한다.
     비밀번호 입력 중 시세·보유가 바뀌었거나 호출 경로가 늘어나도 잔고가 깨지지 않게 한다.
     [v4.5] 성공 여부를 boolean 으로 돌려준다 — 예약주문이 실패를 알아채야 하기 때문. */
  if(_settling)return false;
  if(!acctRequire('주문'))return false;                 // [v4.40] 미개설 차단
  const price=intOf(o&&o.price,0), qty=intOf(o&&o.qty,0);
  if(!s||!s.code||!o||qty<=0||price<=0){toast('warn','주문 실패','주문 정보를 확인하세요');return false;}
  const c=orderCost(o.side,price,qty);
  if(o.side==='buy'){
    /* 예수금 검증은 '주문금액 + 수수료' 기준. 주문 버튼·최대수량 계산도 같은 orderCost 를 쓰므로
       화면에서 가능하다고 표시된 주문은 여기서 절대 거절되지 않는다(반대도 마찬가지). */
    if(c.cost>cash){
      toast('warn','주문 불가 · 예수금 부족',
        `필요 ${KRW(c.cost)}원(주문 ${KRW(c.amount)} + 수수료 ${KRW(c.fee)}) · 보유 예수금 ${KRW(cash)}원 · ${KRW(c.cost-cash)}원 모자랍니다`);
      return false;
    }
  }else{
    const hh=holdings.find(x=>x.code===s.code);
    if(!hh||intOf(hh.qty,0)<qty){toast('warn','주문 불가 · 보유수량 부족',`보유 ${KRW(hh?intOf(hh.qty,0):0)}주 · 주문 ${KRW(qty)}주`);return false;}
  }
  _settling=true;
  try{
  const {amount,fee,tax}=c;
  const rec={ts:Date.now(),date:kstDay(),code:s.code,name:s.name,side:o.side,qty,price,amount,fee,tax,avg:price,pnl:0,roi:0};
  if(o.side==='buy'){
    cash=intOf(cash-c.cost,0);
    const h=holdings.find(x=>x.code===s.code);
    if(h){h.avg=Math.round((intOf(h.avg,price)*intOf(h.qty,0)+amount)/(intOf(h.qty,0)+qty));h.qty=intOf(h.qty,0)+qty;}
    else holdings.push({code:s.code,qty,avg:price});
    toast('buy',s.name+' 매수 체결(모의)'+(tag?` · ${tag}`:''),`${KRW(qty)}주 · ${KRW(price)}원 · 결제 ${KRW(c.cost)}원 · 잔고 ${KRW(cash)}원`);
  }else{
    const h=holdings.find(x=>x.code===s.code);const avg=intOf(h&&h.avg,price);
    rec.avg=avg;rec.pnl=Math.round((price-avg)*qty-fee-tax);rec.roi=avg*qty?rec.pnl/(avg*qty)*100:0;
    h.qty=intOf(h.qty,0)-qty;
    cash=intOf(cash+c.proceeds,0);
    if(h.qty<=0)holdings.splice(holdings.indexOf(h),1);
    toast('sell',s.name+' 매도 체결(모의)'+(tag?` · ${tag}`:''),`${KRW(qty)}주 · ${KRW(price)}원 · 정산 ${KRW(c.proceeds)}원 · 잔고 ${KRW(cash)}원`);}
  if(cash<0)cash=0;                     // 어떤 경로로도 예수금이 음수가 되지 않게 하는 최종 방어선
  tradeLog.push(rec);
  /* [B4] 거래내역 무한 증가 방지 — 최근 1,000건만 보관하고 그 이전은 연도별 요약으로 접는다.
     (localStorage 5MB 한계에 도달해 저장이 통째로 실패하는 것을 막는다) */
  if(tradeLog.length>1000){
    const drop=tradeLog.splice(0,tradeLog.length-1000);
    tradeArchive=tradeArchive||{};
    drop.forEach(t=>{const y=(t.date||'').slice(0,4)||'기타';
      const a=tradeArchive[y]=tradeArchive[y]||{count:0,buy:0,sell:0,pnl:0,fee:0,tax:0};
      a.count++; a[t.side==='sell'?'sell':'buy']+=t.amount||0; a.pnl+=t.pnl||0; a.fee+=t.fee||0; a.tax+=t.tax||0;});
  }
  setQty(0);saveState();syncFeedCodes();renderPortfolioNumbers();renderHoldings();syncMaxQty();
  if($('cashInput'))$('cashInput').value=KRW(cash);
  if(currentView==='account')renderJournal();
  return true;
  }finally{ _settling=false; }
}
function toast(type,title,sub){
  const w=$('toastWrap'),t=document.createElement('div');
  t.className='toast '+type;t.innerHTML=`<span class="ic">${type==='buy'?'▲':type==='sell'?'▼':'!'}</span><span>${title}<small>${sub}</small></span>`;
  w.appendChild(t);setTimeout(()=>{t.style.transition='opacity .3s,transform .3s';t.style.opacity='0';t.style.transform='translateY(10px)';setTimeout(()=>t.remove(),300);},5200);   // [v2.1] 알림 유지 시간 연장
}
window.addEventListener('resize',()=>{drawChart();if(currentView==='home')renderMarket();});

/* ===== 진입: 세션 있으면 자동 로그인 ===== */
/* 테마 검색 입력 */
(function bindThemeSearch(){
  const i=$('thmSearch'); if(!i)return;
  let t=null;
  i.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{
    thmQuery=i.value||''; thmLimit=40; thmOpen=null; safeRun('themes',renderThemes);},180);});
  const x=$('thmClear'); if(x)x.onclick=()=>{i.value='';thmQuery='';thmLimit=40;thmOpen=null;renderThemes();i.focus();};
})();

/* ══ [v4.33 · 치명] 부팅이 해외 모듈보다 먼저 실행되고 있었다 ═══════════════
   boot() 는 파일 중간(약 10,138행)에서 즉시 실행되는데, 해외 주식 모듈은 그보다
   한참 뒤(10,491행~)에 선언된다. 그래서 boot → initApp → 보유 평가(hEvalKRW)
   → usFx() 로 이어지는 순간 아직 초기화되지 않은 변수를 건드려
   'Cannot access _usFx before initialization' 이 터졌고, 이 예외가 최상위 실행을
   끊어 그 뒤의 해외 모듈 전체가 통째로 로드되지 않았다.
   → 해외 화면이 전부 비어 있던 진짜 이유다.
   [해결] 부팅을 함수로 감싸 두고, 파일의 모든 선언이 끝난 뒤에 호출한다.
   (변수들은 var 로 바꿔 두 번째 안전장치도 걸어 두었다) */
function __bootMain(){
  try{window.__boot&&__boot.step(4);}catch(e){}   // [v4.9] 입장화면: 계정·설정 동기화
  const sess=store.get('session');
  /* [v4.1] 세션이 없거나 계정이 사라졌으면 앱을 시작하지 않고 로그인만 띄운다 */
  if(sess&&accounts()[sess]){applyUser(sess);unlockApp();initApp();}
  else{requireAuth();}
  /* [v4.9] 화면 구성 단계 → 두 프레임 뒤(첫 페인트 확정 후) 입장화면을 걷는다.
     로그인 화면으로 빠지는 경우에도 즉시 걷어야 입력이 가려지지 않는다. */
  try{window.__boot&&__boot.step(6);}catch(e){}
  requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.__boot&&__boot.done();}catch(e){}}));
  setTimeout(()=>{try{pingManifest();autoIconSync();}catch(e){}},4000);   // [v4.23] 아이콘 자동 동기화
}


/* ══ [v4.9] 매집 포착기 ═══════════════════════════════════════════════════
   [설계 근거 — 공개 문헌 조사 요약]
   ① "주가는 횡보하는데 OBV 가 우상향하면 매집의 결정적 증거" — 국내 거래량 분석 정설.
      노력(거래량) 대 결과(가격)의 다이버전스라는 와이코프 제3법칙과 같은 얘기다.
   ② 매집이 무르익을수록 하락 구간 거래량이 말라간다(드라이업) — 매물이 소진됐다는 뜻.
   ③ 대량 거래일에 종가가 캔들 상단(윗쪽 60% 이상)에서 마감하고 이후 며칠 가격이
      무너지지 않으면 '흡수'다. 바닥권 대량거래 = 매집, 고점 대량거래 = 분산(설거지).
   ④ 와이코프 스프링: 박스 하단을 평균의 30~50% 저거래로 잠깐 이탈했다가 즉시 복귀
      = 남은 매물을 털어내는 마지막 테스트. 이후 대량 돌파(SOS)가 확인 신호.
   ⑤ 기관·외국인 순매수 누적은 한국 시장에서 매집 주체를 직접 보는 창.
   여섯 성분을 0~100 점으로 재고 가중 합산한다. 전 성분이 순수 함수라 검증 가능하다.
   ═════════════════════════════════════════════════════════════════════════ */
/*AC-CORE-BEGIN*/
function acN(b,k,alt){const v=b[k];return (v==null&&alt!=null)?b[alt]:v;}
function acBars(cs){ // 서버 candles → 정규화 {o,h,l,c,v} 배열(과거→최근)
  return (cs||[]).map(b=>{const c=+acN(b,'c','close')||0;
    return {o:+acN(b,'o','open')||c,h:+acN(b,'h','high')||c,l:+acN(b,'l','low')||c,c,v:+acN(b,'v','vol')||0};
  }).filter(b=>b.c>0);
}
function acSlope(vals){ // 정규화 선형회귀 기울기(전 구간 대비 비율/일)
  const n=vals.length; if(n<2)return 0;
  const base=Math.abs(vals[0])>1e-9?Math.abs(vals[0]):(Math.abs(vals[n-1])||1);
  let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){sx+=i;sy+=vals[i];sxy+=i*vals[i];sxx+=i*i;}
  const sl=(n*sxy-sx*sy)/(n*sxx-sx*sx||1);
  return sl/base;
}
function acOBV(bars){const o=[0];for(let i=1;i<bars.length;i++){const d=bars[i].c-bars[i-1].c;
  o.push(o[i-1]+(d>0?bars[i].v:d<0?-bars[i].v:0));}return o;}
function acAvg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
const acClamp=(v)=>Math.max(0,Math.min(100,Math.round(v)));
function acScore(rawBars,invRows){
  const bars=acBars(rawBars);
  if(bars.length<45)return {ok:false,why:'일봉 데이터가 부족합니다 (45일 이상 필요)'};
  const n=bars.length, look=Math.min(60,n), seg=bars.slice(n-look);
  const close=seg.map(b=>b.c), vol=seg.map(b=>b.v);
  /* ① OBV 다이버전스 — 가격 기울기 대비 OBV 기울기 */
  const obvAll=acOBV(bars), obv=obvAll.slice(n-look);
  const obvSpan=Math.max(...obv)-Math.min(...obv)||1;
  const pSl=acSlope(close), oSl=acSlope(obv.map(v=>(v-obv[0])/obvSpan*close[0]+close[0]));
  const obvScore=acClamp(50+(oSl-pSl)*9000);
  /* ② 드라이업 — 최근20 vs 이전 거래량 수축 + 하락일/상승일 거래량 비 */
  const v20=acAvg(vol.slice(-20)), vPrev=acAvg(vol.slice(0,Math.max(1,look-20)))||1;
  const shrink=v20/vPrev;
  let dnV=0,upV=0;seg.slice(-30).forEach((b,i,arr)=>{if(i===0)return;
    const d=b.c-arr[i-1].c; if(d<0)dnV+=b.v; else if(d>0)upV+=b.v;});
  const duRatio=upV>0?dnV/upV:1.5;
  const dryScore=acClamp(60-(shrink-0.75)*90-(duRatio-0.85)*45);
  /* ③ 박스 응집 — 40일 박스폭 + 저점 상승 */
  const b40=seg.slice(-40), hi=Math.max(...b40.map(b=>b.h)), lo=Math.min(...b40.map(b=>b.l));
  const mid=(hi+lo)/2||1, width=(hi-lo)/mid;
  const lowSl=acSlope(b40.map(b=>b.l));
  const baseScore=acClamp(70-(width-0.14)*260+lowSl*5200);
  /* ④ 흡수 캔들 — 대량 + 상단 마감 + 이후 3일 -4% 미만 */
  const vAvg=acAvg(vol)||1, stars=[];
  for(let i=Math.max(1,look-60);i<look;i++){
    const b=seg[i], rng=b.h-b.l;
    if(b.v>2.2*vAvg && rng>0 && (b.c-b.l)/rng>=0.6){
      let okAfter=true;
      for(let k=1;k<=3&&i+k<look;k++){if(seg[i+k].c<b.c*0.96){okAfter=false;break;}}
      if(okAfter)stars.push(n-look+i);
    }
  }
  const absScore=acClamp(stars.length*24);
  /* ⑤ 수급 — 외인+기관 20일 누적 순매매량 / 20일 거래량 */
  let supScore=null,supNet=0;
  if(Array.isArray(invRows)&&invRows.length){
    const r20=invRows.slice(0,20); // 최신이 앞
    /* [v4.9 · 버그] 워커의 종목별 수급 행은 {date, values:{'외국인','기관계','개인'}} 형태다.
       r.foreign / r.inst 로 읽으면 항상 0이 되어 수급 성분이 무력화됐다 — 두 형태 모두 지원. */
    const netOf=(r)=>{ if(!r)return 0;
      if(r.values)return (Number(r.values['외국인'])||0)+(Number(r.values['기관계'])||Number(r.values['기관'])||0);
      return (+(r.foreign!=null?r.foreign:r.frgn)||0)+(+(r.inst!=null?r.inst:r.org)||0); };
    r20.forEach(r=>{supNet+=netOf(r);});
    const volSum=vol.slice(-20).reduce((a,b)=>a+b,0)||1;
    supScore=acClamp(50+supNet/volSum*900);
  }
  /* ⑥ 돌파 준비 — 60일 고점 대비 + 스프링 감지 */
  const last=seg[look-1], hi60=Math.max(...close);
  const gap=(hi60-last.c)/hi60;
  let brkScore=acClamp(gap<=0?92:78-gap*420);
  let spring=null;
  for(let i=look-15;i<look-1;i++){
    if(i<2)continue; const b=seg[i];
    if(b.l<lo*1.002 && b.v<vAvg*0.6){
      for(let k=1;k<=3&&i+k<look;k++){ if(seg[i+k].c>lo*1.01){spring={idx:n-look+i};brkScore=acClamp(brkScore+14);break;} }
      if(spring)break;
    }
  }
  /* 가중 합산 — 수급이 없으면(ETF 등) 나머지에 재분배 */
  const w={obv:.22,dry:.16,base:.14,abs:.20,sup:.16,brk:.12};
  let total,comps={obv:obvScore,dry:dryScore,base:baseScore,abs:absScore,sup:supScore,brk:brkScore};
  if(supScore==null){const f=1/(1-w.sup);
    total=(obvScore*w.obv+dryScore*w.dry+baseScore*w.base+absScore*w.abs+brkScore*w.brk)*f;}
  else total=obvScore*w.obv+dryScore*w.dry+baseScore*w.base+absScore*w.abs+supScore*w.sup+brkScore*w.brk;
  total=acClamp(total);
  /* 단계 판정 */
  let stage,cls;
  const brokeOut=last.c>hi*1.005&&last.v>vAvg*1.6;
  if(brokeOut&&total>=55){stage='마크업 진입 — 박스 상단을 거래량과 함께 돌파';cls='s4';}
  else if(total>=72){stage=spring?'돌파 임박 — 스프링 확인 후 상단 근접':'매집 진행 — 수급·흡수 동반';cls='s4';}
  else if(total>=58){stage='매집 후보 — 횡보 속 흡수 흔적';cls='s3';}
  else if(total>=42){stage='관찰 — 일부 신호만 존재';cls='s2';}
  else if(obvScore<35&&pSl>0){stage='분산 우세 — 상승에도 OBV 이탈(고점 대량거래 주의)';cls='s0';}
  else {stage='매집 근거 약함';cls='s1';}
  return {ok:true,total,comps,stars,spring,stage,cls,box:{hi,lo,from:n-40},
    meta:{shrink:+shrink.toFixed(2),duRatio:+duRatio.toFixed(2),width:+(width*100).toFixed(1),
      gap:+(gap*100).toFixed(1),supNet,pSl:+(pSl*1e4).toFixed(2),oSl:+(oSl*1e4).toFixed(2)}};
}
/*AC-CORE-END*/
/* ── UI ── */
let acCode=null, acCustom=(()=>{try{return JSON.parse(localStorage.getItem('acList')||'[]');}catch(e){return[];}})();
let acScanBusy=false, acChartCache={};
async function acFetchDaily(code){
  if(acChartCache[code]&&Date.now()-acChartCache[code].at<8*60*1000)return acChartCache[code].bars;
  fnBump();
  const r=await fetch(`/api/chart?code=${code}&tf=D`,{cache:'default'});const j=await r.json();
  const bars=(j&&j.candles)||[];
  acChartCache[code]={at:Date.now(),bars};
  return bars;
}
async function acFetchInvestors(code){
  try{fnBump();const r=await fetch(`/api/investors?code=${code}`,{cache:'default'});const j=await r.json();
    const inv=(j&&j.investors)||j||{};
    return inv.rows||inv.days||inv.list||null;}catch(e){return null;}
}
/* ══ [v4.10] 매집 포착기 검색을 전 종목으로 ═══════════════════════════════
   [무엇이 잘못됐나] 예전엔 ALLCODES(코어 유니버스)에서 시세 캐시(byCode)가 이미
   붙은 종목만 훑어서, '테스'처럼 화면에 한 번도 안 띄운 중소형주는 아예 안 나왔다.
   [해결] 종목검색·전종목검사와 같은 원천(전 거래소 명단 stockAll + ETF 전체 +
   코어 + 시세 캐시)을 합쳐 검색한다. 이름은 acNames에 담아 시세 캐시에 없는
   종목도 분석 화면·스캔 표에 제 이름으로 나오게 한다. */
const acNames={};
function acDispName(c){return (byCode[c]&&byCode[c].name)||acNames[c]||c;}
function acEnsureUniverse(){
  try{if(!stockAll&&!stockLoading)loadStockAll();}catch(e){}
  try{if(!etfList)loadEtfList();}catch(e){}
}
function acUniverse(){
  const out=[],seen=new Set();
  const add=(c,n,mk)=>{c=String(c||'');if(!/^\d{6}$/.test(c)||seen.has(c))return;seen.add(c);
    if(n&&!acNames[c])acNames[c]=n; out.push({c,n:n||acNames[c]||'',mk:mk||''});};
  (Array.isArray(stockAll)?stockAll:[]).forEach(x=>x&&add(x.code,x.name,x.market));
  (Array.isArray(etfList)?etfList:[]).forEach(x=>x&&add(x.code,x.name,'ETF'));
  ALLCODES.forEach(c=>add(c,(byCode[c]||{}).name,(byCode[c]||{}).market));
  Object.keys(byCode).forEach(c=>add(c,byCode[c].name,byCode[c].market));
  return out;
}
function acSuggest(q){
  q=(q||'').trim(); const box=$('acSug'); if(!box)return;
  if(!q){box.hidden=true;box.innerHTML='';return;}
  acEnsureUniverse();
  const ql=q.toLowerCase();
  const uni=acUniverse(), pri=[],sec=[];
  for(const x of uni){
    const nm=String(x.n||'').toLowerCase();
    if(x.c.startsWith(q)||nm.startsWith(ql))pri.push(x);
    else if(nm.includes(ql))sec.push(x);
    if(pri.length>=10)break;
  }
  const out=[...pri,...sec].slice(0,10);
  if(!out.length){
    box.innerHTML=(!stockAll&&stockLoading)
      ?'<div class="ac-sug-note">전 종목 명단을 불러오는 중… 잠시 후 다시 입력해 주세요.</div>'
      :'<div class="ac-sug-note">일치하는 종목이 없습니다.</div>';
    box.hidden=false;return;
  }
  box.innerHTML=out.map(x=>`<button data-c="${x.c}" data-n="${(x.n||'').replace(/"/g,'&quot;')}">${stockLogo(x.c,x.n,24)}<span>${x.n||x.c}</span><span class="code num">${x.c}${x.mk?' · '+x.mk:''}</span></button>`).join('')
    +((!stockAll&&stockLoading)?'<div class="ac-sug-note">전 종목 명단 불러오는 중 — 결과가 더 늘어날 수 있어요.</div>':'');
  box.hidden=false;
  box.querySelectorAll('button[data-c]').forEach(b=>b.onclick=()=>{
    acCode=b.dataset.c; if(b.dataset.n)acNames[acCode]=b.dataset.n;
    $('acSearch').value=acDispName(acCode);
    box.hidden=true; $('acRun').disabled=false; acAnalyze(acCode);});
}
function acStageChipHtml(r){return `<span class="ac-verdict ${r.cls}">${r.total>=58?'🟠':'⚪'} ${r.stage}</span>`;}
async function acAnalyze(code){
  const body=$('acBody'); if(!body)return;
  const st=byCode[code]||{};
  body.innerHTML=`<div class="empty">${acDispName(code)} — 일봉·수급 데이터를 불러와 분석하는 중…</div>`;
  let bars,inv;
  try{[bars,inv]=await Promise.all([acFetchDaily(code),acFetchInvestors(code)]);}catch(e){bars=[];}
  const r=acScore(bars,inv);
  if(!r.ok){body.innerHTML=`<div class="empty">${st.name||code}: ${r.why}</div>`;return;}
  const compDef=[
    ['obv','OBV 다이버전스','가격 대비 누적 거래량 흐름'],
    ['dry','거래량 드라이업','매물 소진 · 하락일 거래 위축'],
    ['base','박스 응집','횡보 폭 축소 · 저점 상승'],
    ['abs','흡수 캔들','대량 + 상단 마감 + 유지'],
    ['sup','기관·외국인 수급','20일 누적 순매수'],
    ['brk','돌파 준비','고점 근접 · 스프링'],
  ];
  const compsHtml=compDef.map(([k,t,d])=>{const v=r.comps[k];
    if(v==null)return `<div class="ac-comp"><div class="k">${t}<small>${d}</small></div><div class="bar"><div style="width:0"></div></div><div class="v" style="color:var(--sub-2)">—</div></div>`;
    return `<div class="ac-comp ${v>=65?'hot':''}"><div class="k">${t}<small>${d}</small></div><div class="bar"><div style="width:${v}%"></div></div><div class="v num">${v}</div></div>`;}).join('');
  const badges=[];
  if(r.spring)badges.push('<span class="ac-bdg spring">🌀 와이코프 스프링 감지</span>');
  if(r.stars.length)badges.push(`<span class="ac-bdg">★ 흡수 캔들 ${r.stars.length}회</span>`);
  if(r.meta.shrink<0.7)badges.push(`<span class="ac-bdg">거래량 ${Math.round((1-r.meta.shrink)*100)}% 수축</span>`);
  const interp=[];
  interp.push(r.comps.obv>=62?`가격 흐름 대비 <b>OBV가 뚜렷이 위</b>에 있습니다 — 조용히 사 모으는 쪽이 우세하다는 뜻입니다.`
    :r.comps.obv<=38?`가격에 비해 <b>OBV가 처집니다</b> — 오르는 날보다 내리는 날 거래가 무겁습니다(분산 의심).`
    :`OBV와 가격이 비슷하게 움직여 수급 우위가 뚜렷하지 않습니다.`);
  interp.push(r.comps.dry>=62?`최근 20일 거래량이 이전 대비 <b>${Math.round((1-r.meta.shrink)*100)}% 줄어</b> 매물이 말라가는 전형적 드라이업 구간입니다.`
    :`거래량 수축은 뚜렷하지 않습니다(최근/이전 비 ${r.meta.shrink}).`);
  if(r.stars.length)interp.push(`대량 거래일에 종가를 <b>캔들 상단에서 지켜낸 흡수 흔적이 ${r.stars.length}회</b> 있었고, 이후 가격이 무너지지 않았습니다.`);
  if(r.spring)interp.push(`박스 하단을 <b>저거래로 잠깐 이탈했다 복귀한 스프링</b>이 보입니다 — 남은 매물을 터는 마지막 테스트일 수 있으며, 이후 대량 돌파가 나오면 와이코프 SOS 확인입니다.`);
  if(r.comps.sup!=null)interp.push(r.comps.sup>=60?`기관·외국인이 20일간 <b>순매수 누적</b> 중입니다.`
    :r.comps.sup<=40?`기관·외국인은 20일간 <b>순매도 우위</b>입니다 — 개인 매집만으로는 신뢰도가 낮습니다.`
    :`기관·외국인 수급은 중립입니다.`);
  interp.push(`현재가는 60일 고점 대비 <b>-${r.meta.gap}%</b>, 40일 박스폭은 <b>${r.meta.width}%</b>입니다.`);
  body.innerHTML=`<div class="ac-report">
    <div class="ac-hd">${stockLogo(code,st.name,44)}<div><div class="nm">${st.name||code}</div><div class="cd num">${code}${st.nxt?' · NXT':''}</div></div>
      <div style="margin-left:auto;text-align:right"><div class="ac-gauge-num num">${r.total}<small>/100</small></div>${acStageChipHtml(r)}</div></div>
    ${badges.length?`<div class="ac-badges">${badges.join('')}</div>`:''}
    <div class="ac-canvas-wrap"><canvas id="acCanvas"></canvas>
      <div class="ac-cv-cap"><i>─ 종가</i><i style="color:#e9900a">─ OBV</i><i>▨ 40일 박스</i><i style="color:#12b76a">★ 흡수 캔들</i>${r.spring?'<i style="color:#12b76a">🌀 스프링</i>':''}</div></div>
    <div class="ac-comps">${compsHtml}</div>
    <div class="ac-interp">${interp.map(t=>'· '+t).join('<br>')}</div>
  </div>`;
  requestAnimationFrame(()=>acDrawChart(acBars(bars),r));
}
function acDrawChart(bars,r){
  const cv=$('acCanvas'); if(!cv||!bars.length)return;
  const dpr=window.devicePixelRatio||1, W=cv.clientWidth||600, H=210;
  cv.width=W*dpr; cv.height=H*dpr;
  const x2=cv.getContext('2d'); x2.scale(dpr,dpr);
  const n=bars.length, view=bars.slice(-120), vn=view.length, off=n-vn;
  const px=(i)=>14+(i)/(vn-1)*(W-28);
  const cs=view.map(b=>b.c), lo=Math.min(...view.map(b=>b.l)), hi=Math.max(...view.map(b=>b.h));
  const py=(v)=>14+(1-(v-lo)/((hi-lo)||1))*(H-42);
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  /* 박스 음영 */
  const bFrom=Math.max(0,r.box.from-off);
  x2.fillStyle=dark?'rgba(138,180,248,.10)':'rgba(29,78,216,.07)';
  x2.fillRect(px(bFrom),py(r.box.hi),px(vn-1)-px(bFrom),py(r.box.lo)-py(r.box.hi));
  x2.strokeStyle=dark?'rgba(138,180,248,.35)':'rgba(29,78,216,.28)';x2.setLineDash([4,4]);
  x2.strokeRect(px(bFrom),py(r.box.hi),px(vn-1)-px(bFrom),py(r.box.lo)-py(r.box.hi));x2.setLineDash([]);
  /* OBV (정규화) */
  const obv=acOBV(bars).slice(-vn), oLo=Math.min(...obv), oHi=Math.max(...obv);
  x2.strokeStyle='#e9900a';x2.lineWidth=1.6;x2.beginPath();
  obv.forEach((v,i)=>{const y=18+(1-(v-oLo)/((oHi-oLo)||1))*(H-50);i?x2.lineTo(px(i),y):x2.moveTo(px(i),y);});
  x2.stroke();
  /* 종가 */
  x2.strokeStyle=dark?'#dbe4f0':'#1c2534';x2.lineWidth=2;x2.beginPath();
  cs.forEach((v,i)=>{i?x2.lineTo(px(i),py(v)):x2.moveTo(px(i),py(v));});x2.stroke();
  /* ★ 흡수 · 🌀 스프링 */
  x2.font='900 12px Pretendard,sans-serif';x2.fillStyle='#12b76a';x2.textAlign='center';
  r.stars.forEach(gi=>{const i=gi-off;if(i<0||i>=vn)return;x2.fillText('★',px(i),py(view[i].l)+16);});
  if(r.spring){const i=r.spring.idx-off;if(i>=0&&i<vn)x2.fillText('🌀',px(i),py(view[i].l)+18);}
}
/* ── 스캔 ── */
function acRenderList(){
  const box=$('acList'); if(!box)return;
  if($('acScanSel').value!=='custom'||!acCustom.length){box.hidden=true;return;}
  box.hidden=false;
  box.innerHTML=acCustom.map(c=>{const st=byCode[c]||{};
    return `<span class="tagx"><b>${acDispName(c)}</b><button data-x="${c}">✕</button></span>`;}).join('');
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    acCustom=acCustom.filter(x=>x!==b.dataset.x);
    try{localStorage.setItem('acList',JSON.stringify(acCustom));}catch(e){}
    acRenderList();});
}
async function acScan(){
  if(acScanBusy)return; 
  const sel=$('acScanSel').value;
  let codes=sel==='watch'?watchlist.slice():sel==='hold'?holdings.map(h=>h.code):acCustom.slice();
  codes=[...new Set(codes)].filter(c=>/^\d{6}$/.test(c));   // [v4.10] 시세 캐시 없어도 스캔 가능
  const body=$('acBody');
  if(!codes.length){body.innerHTML=`<div class="empty">${sel==='watch'?'관심종목이 비어 있습니다. ⭐로 담아 주세요.':sel==='hold'?'보유종목이 없습니다.':'목록이 비어 있습니다 — 검색으로 종목을 고른 뒤 ＋ 목록에 담기를 눌러 주세요.'}</div>`;return;}
  if(codes.length>40){toast('warn','스캔 대상 40종목 제한','호출량 보호를 위해 앞 40종목만 스캔합니다.');codes=codes.slice(0,40);}
  acScanBusy=true; const btn=$('acScanRun'); btn.disabled=true; btn.textContent='스캔 중…';
  body.innerHTML=`<div class="ac-prog"><div id="acProgF" style="width:2%"></div></div><div class="empty" id="acProgT">0 / ${codes.length}</div>`;
  const out=[]; let done=0;
  const CHUNK=3;
  for(let i=0;i<codes.length;i+=CHUNK){
    await Promise.all(codes.slice(i,i+CHUNK).map(async c=>{
      try{const bars=await acFetchDaily(c);const r=acScore(bars,null);
        if(r.ok)out.push({c,r});}catch(e){}
      done++;
      const f=$('acProgF'),t=$('acProgT');
      if(f)f.style.width=Math.round(done/codes.length*100)+'%';
      if(t)t.textContent=`${done} / ${codes.length} — 일봉 수집·점수 계산 중`;
    }));
  }
  out.sort((a,b)=>b.r.total-a.r.total);
  body.innerHTML=out.length?`<table class="ac-tbl"><thead><tr><th>종목</th><th>매집 점수</th><th>단계</th><th>신호</th></tr></thead><tbody>
    ${out.map(({c,r})=>{const st=byCode[c]||{};
      const sig=[r.spring?'🌀':'',r.stars.length?`★${r.stars.length}`:'',r.meta.shrink<0.7?'📉거래량↓':''].filter(Boolean).join(' ');
      return `<tr data-c="${c}"><td>${acDispName(c)} <span class="num" style="color:var(--sub-2);font-size:11px">${c}</span></td>
        <td><span class="sc num">${r.total}</span><span class="ac-minibar"><i style="width:${r.total}%"></i></span></td>
        <td class="st-cell">${r.stage}</td><td>${sig||'—'}</td></tr>`;}).join('')}
    </tbody></table><div class="empty" style="margin-top:8px">행을 누르면 수급까지 포함한 정밀 분석으로 이어집니다 (스캔은 속도를 위해 수급 제외 점수).</div>`
    :`<div class="empty">점수를 계산할 수 있는 종목이 없었습니다 (상장 45일 미만 등).</div>`;
  body.querySelectorAll('tr[data-c]').forEach(tr=>tr.onclick=()=>{
    acCode=tr.dataset.c;$('acSearch').value=acDispName(acCode);$('acRun').disabled=false;
    acAnalyze(acCode);});
  acScanBusy=false; btn.disabled=false; btn.textContent='스캔 시작';
}
let _acInit=false;
function acInit(){
  if(_acInit)return; _acInit=true;
  const inp=$('acSearch'); let t=null;
  if(inp){inp.addEventListener('input',()=>{clearTimeout(t);acCode=null;$('acRun').disabled=true;
    t=setTimeout(()=>acSuggest(inp.value),160);});
    inp.addEventListener('focus',()=>{if(inp.value)acSuggest(inp.value);});}
  document.addEventListener('click',(e)=>{const b=$('acSug');if(b&&!b.hidden&&!e.target.closest('.ac-search-wrap'))b.hidden=true;});
  const run=$('acRun'); if(run)run.onclick=()=>{if(acCode)acAnalyze(acCode);};
  const add=$('acAdd'); if(add)add.onclick=()=>{
    if(!acCode){toast('warn','먼저 종목을 검색해 선택하세요','목록에 담을 종목이 없습니다');return;}
    if(!acCustom.includes(acCode)){acCustom.push(acCode);
      try{localStorage.setItem('acList',JSON.stringify(acCustom));}catch(e){}}
    $('acScanSel').value='custom';acRenderList();
    toast('buy','목록에 담았습니다',(byCode[acCode]&&byCode[acCode].name)||acCode);};
  const ss=$('acScanSel'); if(ss)ss.onchange=acRenderList;
  const sr=$('acScanRun'); if(sr)sr.onclick=()=>acScan();
  acRenderList();
}

/* [v4.8] 시장경보 오버레이 — 부팅 직후 1회 + 화면이 보일 때 10분마다 갱신 */
try{
  loadKrxAlerts();
  setInterval(()=>{try{if(document.visibilityState==='visible')loadKrxAlerts();}catch(e){}},10*60*1000);
  document.addEventListener('visibilitychange',()=>{try{
    if(document.visibilityState==='visible'&&Date.now()-(krxAlerts.at||0)>10*60*1000)loadKrxAlerts();
  }catch(e){}});
}catch(e){}

/* ══════════════════════════════════════════════════════════════════════════
   [v4.28] 해외 주식(미국) 모듈 — 국내 흐름과 완전 분리된 전용 화면
   ──────────────────────────────────────────────────────────────────────────
   설계 원칙
   · 국내(6자리 코드)와 해외(티커)는 화면·주문·시세 경로를 분리해 서로 오염되지 않게 한다.
   · 예수금은 원화 하나 — 주문 시 실시간 환율로 자동 환전(실제 증권사 '원화주문' 방식).
   · 미국에는 없는 것(상·하한가, 증거금·신용, 시장경보, NXT)은 빼고,
     미국에 있는 것(52주 고저, 달러 표시, 서머타임 장시간, 프리·애프터마켓)을 넣는다.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 1. 유니버스: [티커, 거래소접미(O=나스닥 N=NYSE A=AMEX), 한글명, 영문명, 테마, ETF여부] ── */
var US_UNI=[
/* 빅테크 · M7 */
['AAPL','O','애플','Apple','big',0],['MSFT','O','마이크로소프트','Microsoft','big',0],
['GOOGL','O','알파벳 A','Alphabet A','big',0],['AMZN','O','아마존','Amazon','big',0],
['NVDA','O','엔비디아','NVIDIA','ai',0],['META','O','메타 플랫폼스','Meta Platforms','big',0],
['TSLA','O','테슬라','Tesla','ev',0],
/* AI · 반도체 */
['AVGO','O','브로드컴','Broadcom','ai',0],['AMD','O','AMD','Advanced Micro Devices','ai',0],
['TSM','N','TSMC(ADR)','Taiwan Semi','ai',0],['ASML','O','ASML(ADR)','ASML Holding','ai',0],
['MU','O','마이크론','Micron','ai',0],['INTC','O','인텔','Intel','ai',0],
['QCOM','O','퀄컴','Qualcomm','ai',0],['ARM','O','Arm(ADR)','Arm Holdings','ai',0],
['SMCI','O','슈퍼마이크로','Super Micro','ai',0],['DELL','N','델 테크놀로지스','Dell','ai',0],
['ORCL','N','오라클','Oracle','ai',0],['PLTR','O','팔란티어','Palantir','ai',0],
['CRWD','O','크라우드스트라이크','CrowdStrike','ai',0],['SNOW','N','스노우플레이크','Snowflake','ai',0],
['NOW','N','서비스나우','ServiceNow','ai',0],['ADBE','O','어도비','Adobe','ai',0],
['CRM','N','세일즈포스','Salesforce','ai',0],['IONQ','N','아이온큐','IonQ','ai',0],
['RGTI','O','리게티 컴퓨팅','Rigetti','ai',0],['MRVL','O','마벨 테크놀로지','Marvell','ai',0],
['TXN','O','텍사스 인스트루먼트','Texas Instruments','ai',0],['LRCX','O','램리서치','Lam Research','ai',0],
['AMAT','O','어플라이드 머티어리얼즈','Applied Materials','ai',0],['KLAC','O','KLA','KLA Corp','ai',0],
/* 전기차 · 모빌리티 */
['RIVN','O','리비안','Rivian','ev',0],['LCID','O','루시드','Lucid','ev',0],
['UBER','N','우버','Uber','ev',0],['GM','N','제너럴 모터스','General Motors','ev',0],
['F','N','포드','Ford','ev',0],['ALB','N','앨버말(리튬)','Albemarle','ev',0],
/* 소비 · 리테일 · 미디어 */
['NFLX','O','넷플릭스','Netflix','cons',0],['DIS','N','디즈니','Disney','cons',0],
['COST','O','코스트코','Costco','cons',0],['WMT','O','월마트','Walmart','cons',0],
['MCD','N','맥도날드','McDonalds','cons',0],['SBUX','O','스타벅스','Starbucks','cons',0],
['NKE','N','나이키','Nike','cons',0],['KO','N','코카콜라','Coca-Cola','cons',0],
['PEP','O','펩시코','PepsiCo','cons',0],['PG','N','P&G','Procter & Gamble','cons',0],
['ABNB','O','에어비앤비','Airbnb','cons',0],['BKNG','O','부킹홀딩스','Booking','cons',0],
/* 금융 · 핀테크 · 코인 */
['JPM','N','JP모건','JPMorgan','fin',0],['BAC','N','뱅크오브아메리카','Bank of America','fin',0],
['V','N','비자','Visa','fin',0],['MA','N','마스터카드','Mastercard','fin',0],
['BRK.B','N','버크셔 해서웨이 B','Berkshire B','fin',0],['GS','N','골드만삭스','Goldman Sachs','fin',0],
['COIN','O','코인베이스','Coinbase','coin',0],['MSTR','O','스트래티지','Strategy Inc','coin',0],
['HOOD','O','로빈후드','Robinhood','coin',0],['SOFI','O','소파이','SoFi','coin',0],
['PYPL','O','페이팔','PayPal','coin',0],
/* 헬스케어 · 바이오 */
['LLY','N','일라이 릴리','Eli Lilly','bio',0],['NVO','N','노보 노디스크(ADR)','Novo Nordisk','bio',0],
['UNH','N','유나이티드헬스','UnitedHealth','bio',0],['JNJ','N','존슨앤드존슨','J&J','bio',0],
['PFE','N','화이자','Pfizer','bio',0],['MRK','N','머크','Merck','bio',0],
['ABBV','N','애브비','AbbVie','bio',0],['MRNA','O','모더나','Moderna','bio',0],
/* 에너지 · 산업 · 우주방산 */
['XOM','N','엑슨모빌','Exxon Mobil','ener',0],['CVX','N','셰브런','Chevron','ener',0],
['GE','N','GE 에어로스페이스','GE Aerospace','indu',0],['CAT','N','캐터필러','Caterpillar','indu',0],
['BA','N','보잉','Boeing','indu',0],['LMT','N','록히드마틴','Lockheed Martin','space',0],
['RTX','N','RTX','RTX Corp','space',0],['NOC','N','노스럽그러먼','Northrop Grumman','space',0],
['RKLB','O','로켓랩','Rocket Lab','space',0],['LUNR','O','인튜이티브 머신스','Intuitive Machines','space',0],
['VST','N','비스트라(전력)','Vistra','ener',0],['CEG','O','컨스텔레이션 에너지','Constellation','ener',0],
['OKLO','N','오클로(SMR)','Oklo','ener',0],['SMR','N','뉴스케일파워','NuScale','ener',0],
/* 대표 ETF */
['SPY','A','SPDR S&P500','SPDR S&P 500','etfidx',1],['VOO','A','뱅가드 S&P500','Vanguard S&P 500','etfidx',1],
['QQQ','O','인베스코 나스닥100','Invesco QQQ','etfidx',1],['DIA','A','다우존스 ETF','SPDR Dow','etfidx',1],
['IWM','A','러셀2000 ETF','iShares Russell 2000','etfidx',1],['VTI','A','미국 전체시장','Vanguard Total','etfidx',1],
['SCHD','A','슈왑 배당 ETF','Schwab Dividend','etfdiv',1],['JEPI','A','JP모건 커버드콜','JPM Equity Premium','etfdiv',1],
['JEPQ','O','JP모건 나스닥 커버드콜','JPM Nasdaq Premium','etfdiv',1],['O','N','리얼티인컴(월배당)','Realty Income','etfdiv',0],
['VYM','A','뱅가드 고배당','Vanguard High Div','etfdiv',1],['DGRO','A','배당성장 ETF','iShares Div Growth','etfdiv',1],
['SOXX','O','반도체 ETF','iShares Semiconductor','etfsec',1],['SMH','O','반에크 반도체','VanEck Semi','etfsec',1],
['XLK','A','기술 섹터','Tech Select','etfsec',1],['XLE','A','에너지 섹터','Energy Select','etfsec',1],
['XLF','A','금융 섹터','Financial Select','etfsec',1],['XLV','A','헬스케어 섹터','Health Select','etfsec',1],
['ARKK','A','아크 이노베이션','ARK Innovation','etfsec',1],['IBIT','O','아이셰어즈 비트코인','iShares Bitcoin','coin',1],
['TQQQ','O','나스닥100 3배','ProShares TQQQ','etflev',1],['SQQQ','O','나스닥100 -3배','ProShares SQQQ','etflev',1],
['SOXL','A','반도체 3배','Direxion SOXL','etflev',1],['SOXS','A','반도체 -3배','Direxion SOXS','etflev',1],
['UPRO','A','S&P500 3배','ProShares UPRO','etflev',1],['TSLL','O','테슬라 2배','Direxion TSLL','etflev',1],
['NVDL','O','엔비디아 2배','GraniteShares NVDL','etflev',1],
['TLT','O','미국 장기채 20Y','iShares 20Y Treasury','etfbond',1],['TMF','A','장기채 3배','Direxion TMF','etfbond',1],
['SGOV','N','초단기 국채','iShares 0-3M','etfbond',1],['GLD','A','금 ETF','SPDR Gold','etfbond',1],
];
var usMeta={}; US_UNI.forEach(([t,sfx,kr,en,theme,etf])=>{usMeta[t]={t,sfx,kr,en,theme,etf,reu:t.replace('.','/')+'.'+sfx};});
function isUS(code){return !!usMeta[code];}
/* ══ [v4.31] 내장 목록 밖의 미국 종목도 다루기 ═══════════════════════════════
   US_UNI 는 큐레이션 113종이라 그 밖의 종목은 검색은커녕 열 수조차 없었다.
   검색 결과로 들어온 종목을 실행 중에 등록하면 시세·차트·주문이 모두 그대로 돌아간다.
   등록분은 localStorage 에 남겨 다음 접속에도 즉시 검색된다. */
var usDyn={};
try{ const s=JSON.parse(localStorage.getItem('usDyn1')||'null');
  if(s&&typeof s==='object')usDyn=s; }catch(e){}
function usRegister(it){
  if(!it||!it.t)return null;
  const t=String(it.t).toUpperCase();
  if(usMeta[t])return t;
  const sfx=/^[ONA]$/.test(it.sfx)?it.sfx:'O';
  const rec={t,sfx,kr:it.kr||t,en:it.en||t,theme:'etc',etf:it.etf?1:0,reu:t.replace('.','/')+'.'+sfx,dyn:1};
  usMeta[t]=rec; usDyn[t]={sfx,kr:rec.kr,en:rec.en,etf:rec.etf};
  try{ const keys=Object.keys(usDyn); if(keys.length>400)delete usDyn[keys[0]];
    localStorage.setItem('usDyn1',JSON.stringify(usDyn)); }catch(e){}
  return t;
}
Object.keys(usDyn).forEach(t=>{ const d=usDyn[t];
  if(!usMeta[t])usMeta[t]={t,sfx:d.sfx||'O',kr:d.kr||t,en:d.en||t,theme:'etc',etf:d.etf||0,
    reu:t.replace('.','/')+'.'+(d.sfx||'O'),dyn:1}; });

/* 통칭·줄임말 — 정식 명칭과 다르게 부르는 경우를 잡아 준다 */
var US_ALIAS={'구글':'GOOGL','알파벳':'GOOGL','마소':'MSFT','MS':'MSFT','마이크로':'MSFT',
 '페이스북':'META','페북':'META','인스타':'META','엔비':'NVDA','엔디비아':'NVDA','앤비디아':'NVDA',
 '테슬라주':'TSLA','테슬':'TSLA','애플주':'AAPL','아마존닷컴':'AMZN','넷플':'NFLX','넷플릭스':'NFLX',
 '버크셔':'BRK.B','버핏':'BRK.B','코스트코':'COST','스벅':'SBUX','스타벅':'SBUX',
 '팔란':'PLTR','팔란티르':'PLTR','타이완반도체':'TSM','대만반도체':'TSM','티에스엠씨':'TSM',
 '브로드':'AVGO','퀄컴':'QCOM','인텔':'INTC','마이크론':'MU','암':'ARM',
 '비트코인ETF':'IBIT','비트코인':'IBIT','금':'GLD','금ETF':'GLD','채권':'TLT','미국채':'TLT',
 '나스닥':'QQQ','나스닥100':'QQQ','에스앤피':'SPY','SP500':'SPY','S&P500':'SPY','스파이':'SPY',
 '배당':'SCHD','슈드':'SCHD','제피':'JEPI','티큐':'TQQQ','삼배':'TQQQ',
 '리얼티':'O','월배당':'O','일라이':'LLY','릴리':'LLY','노보':'NVO','유나이티드헬스':'UNH',
 '코인베이스':'COIN','코베':'COIN','마이크로스트래티지':'MSTR','마스트':'MSTR','스트래티지':'MSTR','마이크로':'MSTR','로빈후드':'HOOD',
 '보잉':'BA','록히드':'LMT','로켓랩':'RKLB','오클로':'OKLO','뉴스케일':'SMR'};

/* 원격 검색 — 내장 목록에 없는 종목까지 찾는다 */
var _usRemote={}, _usRemoteT=null;
function usSearchRemote(q,cb){
  const key=q.trim().toLowerCase();
  if(!key||key.length<1)return;
  if(_usRemote[key]!==undefined){cb&&cb(_usRemote[key]);return;}
  _usRemote[key]=null;
  fetch('/api/ussearch?q='+encodeURIComponent(q),{cache:'no-store'})
    .then(r=>r.json())
    .then(j=>{ const items=(j&&j.items)||[];
      items.forEach(usRegister);
      _usRemote[key]=items; cb&&cb(items); })
    .catch(()=>{ _usRemote[key]=[]; cb&&cb([]); });
}
/* 내장 + 별칭 + 등록분 통합 매칭 */
function usLocalMatch(q){
  const qs=String(q||'').trim(); if(!qs)return [];
  const qU=qs.toUpperCase(), qn=qs.replace(/\s+/g,'');
  const hit=[], seen=new Set();
  const push=(t)=>{ if(t&&usMeta[t]&&!seen.has(t)){seen.add(t);hit.push(t);} };
  const al=US_ALIAS[qn]||US_ALIAS[qU]; if(al)push(al);
  Object.keys(US_ALIAS).forEach(k=>{ if(k.length>=2&&k.indexOf(qn)===0)push(US_ALIAS[k]); });
  Object.keys(usMeta).forEach(t=>{ const m=usMeta[t];
    if(t.indexOf(qU)>=0||String(m.kr).replace(/\s+/g,'').indexOf(qn)>=0
      ||String(m.en).toUpperCase().indexOf(qU)>=0)push(t); });
  return hit;
}
var US_THEMES=[['ai','🤖 AI·반도체'],['big','🏙 빅테크'],['ev','🚗 전기차·모빌리티'],['coin','🪙 코인·핀테크'],
 ['bio','🧬 바이오·헬스케어'],['fin','🏦 금융'],['cons','🛒 소비·미디어'],['ener','⚡ 에너지·원전'],
 ['space','🚀 우주·방산'],['indu','🏭 산업재']];
var US_ETF_GROUPS=[['etfidx','📊 대표지수'],['etfdiv','💰 배당·인컴'],['etfsec','🧩 섹터·테마'],
 ['etflev','⚡ 레버리지·인버스'],['etfbond','🏛 채권·금']];
var US_STARS=['NVDA','TSLA','AAPL','MSFT','PLTR','AMD','GOOGL','AMZN','META','AVGO','MSTR','IONQ'];

/* ── 2. 환율 (USD/KRW) — 라이브 우선, 마지막 값 보존 ── */
var _usFx=null;
/* [v4.33] 어떤 시점에 불려도 절대 예외를 던지지 않는다.
   부팅 중 보유 평가가 이 함수를 부르는데, 여기서 한 번 터지면 app.js 최상위 실행이
   중단되고 그 뒤에 있는 해외 모듈이 통째로 초기화되지 않는다(화면이 전부 빈 이유). */
function usFx(){
  try{
    if(typeof _usFx!=='undefined'&&_usFx&&_usFx.v)return _usFx.v;
    const j=JSON.parse(localStorage.getItem('usFxLast')||'null');
    if(j&&j.v&&Date.now()-(j.at||0)<3*86400e3){_usFx=j;return j.v;}
  }catch(e){}
  return null; }
function usFxSet(v){ if(!(v>800&&v<3000))return;
  /* ══ [v4.34] 환율이 '처음' 도착하면 화면을 다시 그린다 ═══════════════════
     환전 카드와 주문 패널은 렌더 시점에 환율이 없으면 버튼을 비활성으로 만든다.
     그런데 환율은 시세와 함께 조금 늦게 도착하는데, 도착해도 카드를 다시 그리지
     않아 '환율 수신 대기' 상태로 영영 굳어 환전·주문을 아예 할 수 없었다. */
  const had=!!(_usFx&&_usFx.v);
  _usFx={v,at:Date.now()};
  try{localStorage.setItem('usFxLast',JSON.stringify(_usFx));}catch(e){}
  if(!had){ setTimeout(()=>{ try{
    if(currentView==='us'){ renderUsFxCard(); renderUsMine(); }
    else if(currentView==='ustrade'){ renderUsOrder(); renderUsHead(); }
  }catch(e){} },0); }
}
var USD2=(v)=>v==null?'—':(+v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
/* ══ [v4.29] 직접 환전 · T+1 정산 ══════════════════════════════════════════
   실제 증권사 구조를 그대로 옮긴다.
   · 환전 스프레드: 기준 10원/$ 에 우대 95% 적용 → 실부담 0.5원/$ (매수환율 +0.5 / 매도환율 -0.5)
   · T+1: 매도 대금(달러)은 즉시 재매수에 쓸 수 있지만, 원화로 되파는 환전은
     다음 영업일부터 가능하다(미국 T+1 결제). 주말은 건너뛴다(미국 휴장일은 근사). */
var US_FX_SPREAD=10, US_FX_PREF_BASE=0.95;
/* [v4.32] 계좌 종류별 환전 우대 */
function US_FX_PREF_OF(){const a=acctInfo();return a.fxPref!=null?a.fxPref:US_FX_PREF_BASE;}
var US_FX_PREF=US_FX_PREF_BASE;
var usFxMargin=()=>US_FX_SPREAD*(1-US_FX_PREF_OF());                 // 0.5원
function usFxBuy(){const f=usFx();return f?+(f+usFxMargin()).toFixed(2):null;}   // 원→달러 살 때
function usFxSell(){const f=usFx();return f?+(f-usFxMargin()).toFixed(2):null;}  // 달러→원 팔 때
function usNextBiz(day){                                           // 'YYYY-MM-DD' 다음 영업일
  /* [v4.29] KST(+09:00)로 파싱한 뒤 toISOString(UTC)으로 자르면 날짜가 하루 밀려
     '오늘'이 그대로 나온다(T+1 잠금 무력화). UTC 정오 기준으로 계산해 시간대 영향을 없앤다. */
  const d=new Date(day+'T12:00:00Z');
  do{ d.setUTCDate(d.getUTCDate()+1); }while(d.getUTCDay()===0||d.getUTCDay()===6);
  return d.toISOString().slice(0,10);
}
function usSettle(){                                               // 정산일 도래분 해제
  const today=kstDay(); let moved=0;
  usdSettling=usdSettling.filter(x=>{ if(x.settle<=today){moved+=x.amt;return false;} return true; });
  return moved;
}
function usUsdAvailable(){                                         // 환전(달러→원) 가능액
  usSettle();
  const hold=usdSettling.reduce((a,x)=>a+x.amt,0);
  return Math.max(0,Math.round((usdCash-hold)*100)/100);
}
function usExchange(dir,amount){                                   // dir:'toUsd'|'toKrw'
  if(!acctOpened())return {ok:false,msg:'계좌를 먼저 개설해 주세요 — 내 계좌 화면에서 개설할 수 있습니다'};
  const f=usFx();
  if(!f)return {ok:false,msg:'환율을 아직 받지 못했습니다'};
  if(dir==='toUsd'){
    const krw=Math.floor(+amount||0);
    if(krw<1000)return {ok:false,msg:'1,000원 이상부터 환전할 수 있습니다'};
    if(krw>cash)return {ok:false,msg:'원화 예수금이 부족합니다 (보유 '+KRW(cash)+'원)'};
    const rate=usFxBuy(), usd=Math.floor(krw/rate*100)/100;
    if(!(usd>0))return {ok:false,msg:'금액이 너무 작습니다'};
    cash=intOf(cash-Math.ceil(usd*rate),0); usdCash=+(usdCash+usd).toFixed(2);
    saveState();
    return {ok:true,msg:`$${USD2(usd)} 환전 완료 · 적용환율 ${KRW(rate)}원 (우대 ${US_FX_PREF_OF()*100}%)`,usd,rate};
  }else{
    const usd=Math.floor((+amount||0)*100)/100;
    const avail=usUsdAvailable();
    if(!(usd>0))return {ok:false,msg:'금액을 확인하세요'};
    if(usd>avail){
      const hold=usdSettling.reduce((a,x)=>a+x.amt,0);
      return {ok:false,msg:`환전 가능액 초과 · 가능 $${USD2(avail)}`+(hold>0?` (미결제 $${USD2(hold)} — T+1 정산 후 가능)`:'')};
    }
    const rate=usFxSell(), krw=Math.floor(usd*rate);
    usdCash=+(usdCash-usd).toFixed(2); cash=intOf(cash+krw,0);
    saveState();
    return {ok:true,msg:`${KRW(krw)}원 환전 완료 · 적용환율 ${KRW(rate)}원 (우대 ${US_FX_PREF_OF()*100}%)`,krw,rate};
  }
}
/* 올해 해외 실현손익 → 양도소득세 추정 (연 250만 비과세 · 초과분 22%) */
function usTaxEstimate(){
  const y=kstDay().slice(0,4);
  const sells=tradeLog.filter(t=>t&&t.us&&t.side==='sell'&&String(t.date||'').startsWith(y));
  const pnl=sells.reduce((a,t)=>a+(+t.pnl||0),0);
  const taxable=Math.max(0,pnl-2500000);
  return {year:y,n:sells.length,pnl,taxable,tax:Math.round(taxable*0.22)};
}
var USDKR=(v)=>{const fx=usFx();return (v==null||!fx)?'':'≈ '+KRW(Math.round(v*fx))+'원';};

/* ── 3. 미국 장 세션 — 서머타임(3월 둘째 일요일 ~ 11월 첫 일요일) 자동 반영 ── */
function usSession(now){
  const t=(now||new Date()).getTime();
  const y=new Date(t).getUTCFullYear();
  const nthSun=(m,n)=>{const d=new Date(Date.UTC(y,m,1));const first=1+((7-d.getUTCDay())%7);return first+7*(n-1);};
  const dstStart=Date.UTC(y,2,nthSun(2,2),7);    // 3월 둘째 일 02:00 EST = 07:00 UTC
  const dstEnd  =Date.UTC(y,10,nthSun(10,1),6);  // 11월 첫 일 02:00 EDT = 06:00 UTC
  const dst=t>=dstStart&&t<dstEnd;
  const off=dst?4:5;                              // ET = UTC - off
  const et=new Date(t-off*3600e3);
  const wd=et.getUTCDay(), mins=et.getUTCHours()*60+et.getUTCMinutes();
  let phase='closed';
  if(wd>=1&&wd<=5){
    if(mins>=240&&mins<570)phase='pre';           // 04:00~09:30 ET
    else if(mins>=570&&mins<960)phase='regular';  // 09:30~16:00 ET
    else if(mins>=960&&mins<1080)phase='after';   // 16:00~18:00 ET (국내 증권사 제공 기준)
  }
  const kst={pre:dst?'17:00':'18:00',open:dst?'22:30':'23:30',close:dst?'05:00':'06:00',aft:dst?'07:00':'08:00'};
  const label={pre:'프리마켓',regular:'정규장',after:'애프터마켓',closed:'휴장'}[phase];
  /* 다음 정규장 개장(KST 표기) */
  let dAdd=0, base=new Date(et);
  if(!(wd>=1&&wd<=5)||mins>=960){ dAdd=1; let w=(wd+1)%7; while(w===0||w===6){dAdd++;w=(w+1)%7;} }
  const nx=(dAdd===0?'오늘':dAdd===1?'내일':['일','월','화','수','목','금','토'][(wd+dAdd)%7]+'요일')+' '+kst.open;
  return {phase,label,dst,kst,next:nx,mins,wd};   // [v4.49] 마켓 클록 트랙용 ET 분·요일
}

/* ── 4. 시세 수집 ── */
var usQ={}, _usLoadBusy=false, _usPollT=null, _usPollSet=[];
/* [v4.48] ① 부분 성공 병합: 어떤 원천은 52주·시가총액을 안 준다. 새 응답의 null 이
   이미 알던 값을 지우지 않도록 필드 단위로 합친다.
   ② 실패 카운터: 0건 응답이 이어지면 화면이 '불러오는 중…' 을 다시 그리고, 그 갱신이
   또 시세 요청을 부르는 되먹임(무한 재시도 폭주)이 있었다 — 두 번 연속 0건이면
   렌더러들이 실패·다시시도 상태로 바꾼다. */
var _usQFail=0;
function usApplyQuote(reu,q){
  if(!q||q.price==null)return false;
  const t=Object.keys(usMeta).find(k=>usMeta[k].reu===reu); if(!t)return false;
  const keep=usQ[t]||{};
  const nn={}; Object.keys(q).forEach(k=>{ if(q[k]!=null)nn[k]=q[k]; });
  usQ[t]={...keep,...nn,t,at:Date.now()};
  const b=byCode[t]||{};
  byCode[t]={...b,code:t,name:usMeta[t].kr,us:1,price:usQ[t].price,prevClose:usQ[t].prev,
    open:usQ[t].open,high:usQ[t].high,low:usQ[t].low,vol:usQ[t].vol,cap:usQ[t].cap,
    w52h:usQ[t].w52h,w52l:usQ[t].w52l,ex:usMeta[t].sfx};
  return true;
}
async function usEnsureQuotes(tickers,withFx){
  const need=[...new Set(tickers.filter(t=>usMeta[t]))];
  if(!need.length)return 0;
  let gained=0;
  /* ══ [v4.49] 목록 절반이 계속 '—' 로 남던 진짜 이유 ═══════════════════════
     18종목씩 잘라 보내는 것까지는 맞았는데, 그 배치들을 await 로 '한 줄로 세워'
     보내고 있었다. 유니버스 113종 → 7번을 차례로 기다리므로 마지막 배치는
     20~35초 뒤에나 도착한다. 그 사이 화면은 계속 '—' 였고, 폴링(20초)이
     먼저 돌아 같은 줄서기를 또 시작해 영영 못 따라잡았다.
     → 배치를 동시에 띄운다. 워커는 요청마다 별개 실행이라 서브리퀘스트 한도(★11)도
       배치별로 따로 계산돼 오히려 안전하다. 콜드 로딩이 2~4초로 줄어든다. */
  const missed=[];
  const batches=[];
  for(let i=0;i<need.length;i+=18)batches.push(need.slice(i,i+18));
  await Promise.all(batches.map(async(batch,bi)=>{
    try{
      const r=await fetch('/api/usquote?codes='+encodeURIComponent(batch.map(t=>usMeta[t].reu).join(','))+((withFx&&bi===0)?'&fx=1':''),
        {cache:'no-store'});
      const j=await r.json();
      if(j&&j.fx)usFxSet(j.fx);
      const got=new Set(Object.keys((j&&j.codes)||{}));
      batch.forEach(t=>{ if(!got.has(usMeta[t].reu))missed.push(t); });
      if(j&&j.codes)Object.keys(j.codes).forEach(reu=>{ if(usApplyQuote(reu,j.codes[reu]))gained++; });
    }catch(e){ batch.forEach(t=>missed.push(t)); }
  }));
  /* 빠진 종목 재시도 — 첫 판에 실패해도 두 번째에는 캐시가 채워져 대부분 성공한다 */
  if(missed.length&&!_usRetry){
    _usRetry=true;
    const rb=[];
    for(let i=0;i<missed.length;i+=18)rb.push(missed.slice(i,i+18));
    await Promise.all(rb.map(async(batch)=>{
      try{
        const r=await fetch('/api/usquote?codes='+encodeURIComponent(batch.map(t=>usMeta[t].reu).join(',')),{cache:'no-store'});
        const j=await r.json();
        if(j&&j.codes)Object.keys(j.codes).forEach(reu=>{ if(usApplyQuote(reu,j.codes[reu]))gained++; });
      }catch(e){}
    }));
    _usRetry=false;
  }
  _usQFail=gained>0?0:_usQFail+1;
  return gained;
}
var _usRetry=false;
function usPollStart(list){
  _usPollSet=[...new Set(list)];
  if(_usPollT)clearInterval(_usPollT);
  const iv=usSession().phase==='regular'?20000:60000;
  _usPollT=setInterval(()=>{ if(currentView!=='us'&&currentView!=='ustrade'&&!(currentView==='search'&&searchMkt==='us')){clearInterval(_usPollT);_usPollT=null;return;}
    usEnsureQuotes(_usPollSet.concat(holdings.filter(h=>h.us).map(h=>h.code)),true).then(()=>{
      if(currentView==='us')renderUsLive();
      if(currentView==='ustrade')renderUsTradeLive();
      if(currentView==='search'&&searchMkt==='us'&&!((($('searchInput')||{}).value||'').trim())){
        $('searchResults').innerHTML=rankSection(); bindStockClicks($('searchResults'));
      }
    }); },iv);
}

/* ── 5. 공용 조각 ── */
var US_PAL=['#2563eb','#7c3aed','#0891b2','#059669','#d97706','#dc2626','#db2777','#4f46e5','#0d9488','#b45309'];
/* ══════════════════════════════════════════════════════════════════════════
   [v4.30] 해외 종목 로고 — 국내와 별개의 전용 파이프라인
   ──────────────────────────────────────────────────────────────────────────
   [왜 필요했나] v4.28~4.29 의 해외 화면은 usTick() 색 배지만 그렸다. 국내용
   logo.js 는 6자리 한국 종목코드를 전제로 토스·네이버·알파스퀘어를 두드리므로
   'AAPL' 같은 티커로는 애초에 맞는 주소가 만들어지지 않는다. 즉 해외는 로고가
   '안 나온' 게 아니라 '한 번도 시도된 적이 없는' 상태였다.
   [설계] 회사 도메인을 기준으로 후보 주소를 만들고 v4.20 과 같은 '동시 경마'로
   가장 먼저 도착한 이미지를 채택한다. 전부 실패하면 기존 색 배지로 남는다
   (로고가 없다고 화면이 비지 않는다).
   ══════════════════════════════════════════════════════════════════════════ */
var US_DOMAIN={
/* 빅테크 · M7 */
AAPL:'apple.com',MSFT:'microsoft.com',GOOGL:'abc.xyz',AMZN:'amazon.com',
NVDA:'nvidia.com',META:'meta.com',TSLA:'tesla.com',
/* AI · 반도체 */
AVGO:'broadcom.com',AMD:'amd.com',TSM:'tsmc.com',ASML:'asml.com',MU:'micron.com',
INTC:'intel.com',QCOM:'qualcomm.com',ARM:'arm.com',SMCI:'supermicro.com',DELL:'dell.com',
ORCL:'oracle.com',PLTR:'palantir.com',CRWD:'crowdstrike.com',SNOW:'snowflake.com',
NOW:'servicenow.com',ADBE:'adobe.com',CRM:'salesforce.com',IONQ:'ionq.com',
RGTI:'rigetti.com',MRVL:'marvell.com',TXN:'ti.com',LRCX:'lamresearch.com',
AMAT:'appliedmaterials.com',KLAC:'kla.com',
/* 전기차 · 모빌리티 */
RIVN:'rivian.com',LCID:'lucidmotors.com',UBER:'uber.com',GM:'gm.com',F:'ford.com',ALB:'albemarle.com',
/* 소비 · 리테일 · 미디어 */
NFLX:'netflix.com',DIS:'disney.com',COST:'costco.com',WMT:'walmart.com',MCD:'mcdonalds.com',
SBUX:'starbucks.com',NKE:'nike.com',KO:'coca-colacompany.com',PEP:'pepsico.com',PG:'pg.com',
ABNB:'airbnb.com',BKNG:'bookingholdings.com',
/* 금융 · 핀테크 · 코인 */
JPM:'jpmorganchase.com',BAC:'bankofamerica.com',V:'visa.com',MA:'mastercard.com',
'BRK.B':'berkshirehathaway.com',GS:'goldmansachs.com',COIN:'coinbase.com',
MSTR:'strategy.com',HOOD:'robinhood.com',SOFI:'sofi.com',PYPL:'paypal.com',
/* 헬스케어 · 바이오 */
LLY:'lilly.com',NVO:'novonordisk.com',UNH:'unitedhealthgroup.com',JNJ:'jnj.com',
PFE:'pfizer.com',MRK:'merck.com',ABBV:'abbvie.com',MRNA:'modernatx.com',
/* 에너지 · 산업 · 우주방산 */
XOM:'exxonmobil.com',CVX:'chevron.com',GE:'geaerospace.com',CAT:'caterpillar.com',
BA:'boeing.com',LMT:'lockheedmartin.com',RTX:'rtx.com',NOC:'northropgrumman.com',
RKLB:'rocketlabusa.com',LUNR:'intuitivemachines.com',VST:'vistracorp.com',
CEG:'constellationenergy.com',OKLO:'oklo.com',SMR:'nuscalepower.com',
/* ETF — 운용사 도메인 */
SPY:'ssga.com',VOO:'vanguard.com',QQQ:'invesco.com',DIA:'ssga.com',IWM:'ishares.com',
VTI:'vanguard.com',SCHD:'schwab.com',JEPI:'jpmorgan.com',JEPQ:'jpmorgan.com',
O:'realtyincome.com',VYM:'vanguard.com',DGRO:'ishares.com',SOXX:'ishares.com',
SMH:'vaneck.com',XLK:'ssga.com',XLE:'ssga.com',XLF:'ssga.com',XLV:'ssga.com',
ARKK:'ark-funds.com',IBIT:'ishares.com',TQQQ:'proshares.com',SQQQ:'proshares.com',
SOXL:'direxion.com',SOXS:'direxion.com',UPRO:'proshares.com',TSLL:'direxion.com',
NVDL:'graniteshares.com',TLT:'ishares.com',TMF:'direxion.com',SGOV:'ishares.com',
GLD:'ssga.com',
};
/* 상태: 1=성공(소스 인덱스), 0=실패 — 세션 간 유지 */
var usLgOk={}, usLgNo={}, _usLgBusy=new Set(), _usLgQ=[], _usLgLive=0;
/* [v4.30] 실패 기록은 짧게 — 통신 상태나 CDN 사정으로 한 번 실패했다고
   반나절 내내 배지로 남으면 안 된다. 그리고 '전부 실패'면 망 문제일 가능성이
   높으므로(사내망·특정 CDN 차단) 더 짧게 잡아 다음 방문에 곧바로 다시 시도한다. */
var US_LG_MAX=6, US_LG_TTL=3*3600e3, US_LG_TTL_ALL=20*60e3;
function usLgTtl(){ return (Object.keys(usLgOk).length===0&&Object.keys(usLgNo).length>=8)?US_LG_TTL_ALL:US_LG_TTL; }
try{
  const s=JSON.parse(localStorage.getItem('usLg3')||'null');
  if(s&&s.v===3){ usLgOk=s.ok||{};
    const now=Date.now(), okN=Object.keys(usLgOk).length;
    const ttl=(okN===0&&Object.keys(s.no||{}).length>=8)?20*60e3:3*3600e3;
    Object.keys(s.no||{}).forEach(k=>{ if(now-s.no[k]<ttl)usLgNo[k]=s.no[k]; }); }
}catch(e){}
let _usLgSaveT=null;
function usLgSave(){ if(_usLgSaveT)return;
  _usLgSaveT=setTimeout(()=>{_usLgSaveT=null;
    try{localStorage.setItem('usLg3',JSON.stringify({v:3,ok:usLgOk,no:usLgNo}));}catch(e){}},600); }
/* 후보 주소 — 서로 다른 제공자를 섞어 한 곳이 막혀도 다른 곳이 뚫리게 한다 */
function usLgUrls(t){
  /* [v4.31] 검색으로 새로 등록된 종목은 도메인 매핑이 없다. 그런 종목도 로고가 나오도록
     '티커 기반' 소스를 항상 뒤에 붙인다(도메인이 있으면 후보가 그만큼 더 많아진다). */
  const d=US_DOMAIN[t]; const out=[];
  if(d){
    out.push('https://logo.clearbit.com/'+d);
    out.push('https://www.google.com/s2/favicons?sz=128&domain='+d);
    out.push('https://icons.duckduckgo.com/ip3/'+d+'.ico');
    out.push('/api/uslogo?d='+encodeURIComponent(d));          // 서버 중계(차단망 대비)
  }
  const tk=t.replace('.','-');
  out.push('https://financialmodelingprep.com/image-stock/'+tk+'.png');
  out.push('https://assets.parqet.com/logos/symbol/'+tk+'?format=png&size=128');
  out.push('https://storage.googleapis.com/iexcloud-hl37opg/api/logos/'+tk+'.png');
  return out;
}
function usLgUrl(t){ const i=usLgOk[t]; return i==null?'':usLgUrls(t)[i]||''; }
function usLgWant(t){
  if(!usMeta[t]||usLgOk[t]!=null||_usLgBusy.has(t))return;
  if(_usLgQ.length>60)return;                                   // 과열 방지 — 스크롤하며 다시 요청된다
  if(usLgNo[t]&&Date.now()-usLgNo[t]<usLgTtl())return;
  if(_usLgQ.indexOf(t)<0)_usLgQ.push(t);
  usLgPump();
}
function usLgPump(){
  while(_usLgLive<US_LG_MAX&&_usLgQ.length){
    const t=_usLgQ.shift(); if(!t||usLgOk[t]!=null)continue;
    _usLgBusy.add(t); _usLgLive++; usLgProbe(t);
  }
}
function usLgProbe(t){
  const urls=usLgUrls(t);
  let done=false,left=urls.length; const shots=[];
  const finish=(idx)=>{
    if(done)return; done=true;
    shots.forEach(im=>{try{im.onload=im.onerror=null;im.src='';}catch(e){}});
    _usLgBusy.delete(t); _usLgLive--;
    if(idx!=null){ usLgOk[t]=idx; delete usLgNo[t]; usLgPaint(t); }
    else if(navigator.onLine!==false){ usLgNo[t]=Date.now(); }
    usLgSave(); usLgPump();
  };
  urls.forEach((u,idx)=>{
    const im=new Image(); shots.push(im);
    im.referrerPolicy='no-referrer'; im.decoding='async';
    let settled=false;
    const end=(ok)=>{ if(settled)return; settled=true;
      if(ok)finish(idx); else if(--left<=0)finish(null); };
    im.onload=()=>{ /* 16px 미만은 빈 파비콘 — 로고로 인정하지 않는다 */
      if((im.naturalWidth||0)<16||(im.naturalHeight||0)<16){end(false);return;} end(true); };
    im.onerror=()=>end(false);
    setTimeout(()=>end(false), u.indexOf('/api/')===0?7000:3200);
    im.src=u;
  });
}
/* 이미 그려진 자리들을 제자리 승격 — 다시 렌더하지 않아 깜빡임이 없다 */
function usLgPaint(t){
  const u=usLgUrl(t); if(!u)return;
  document.querySelectorAll('.us-tick[data-uslg="'+t+'"]').forEach(el=>{
    el.classList.add('on');
    el.style.backgroundColor='#fff';
    el.style.backgroundImage="url('"+u+"')";
    el.style.backgroundSize='contain';
    el.style.backgroundPosition='center';
    el.style.backgroundRepeat='no-repeat';
  });
}
/* 로고 배지 — 로고를 알면 바로 이미지로, 모르면 색 배지 + 뒤에서 탐색 */
function usTick(t,size){
  const PAL=(typeof US_PAL!=='undefined'&&US_PAL)?US_PAL:['#2563eb'];
  const c=PAL[(t.charCodeAt(0)+t.charCodeAt(t.length-1))%PAL.length];
  let u=''; try{ u=usLgUrl(t); }catch(e){}
  if(!u)try{usLgWant(t);}catch(e){}
  /* ══ [v4.35 · 로고가 잘리던 진짜 이유] ═══════════════════════════════════
     인라인에 background 단축속성을 썼다. 단축속성은 background-size 를 auto 로
     되돌리는데, 인라인이 스타일시트를 이기므로 CSS 의 background-size:contain 이
     통째로 무효가 됐다. 그래서 로고가 원본 크기로 그려져 배지 밖으로 잘렸다.
     → 색과 이미지를 각각 개별 속성으로 지정하고 크기도 인라인에 함께 박는다. */
  const cls='us-tick'+(size?' '+size:'')+(u?' on':'');
  const st=u
    ? `background-color:#fff;background-image:url('${u}');background-size:contain;background-position:center;background-repeat:no-repeat`
    : `background-color:${c}`;
  return `<span class="${cls}" data-uslg="${t}" style="${st}">${t.length>5?t.slice(0,5):t}</span>`;
}
/* 진단 — 콘솔에서 상태 확인 */
try{
  window.__usLgStat=()=>({total:US_UNI.length,mapped:Object.keys(US_DOMAIN).length,
    ok:Object.keys(usLgOk).length,fail:Object.keys(usLgNo).length,
    busy:[..._usLgBusy],queued:_usLgQ.length,
    missing:US_UNI.map(u=>u[0]).filter(t=>!US_DOMAIN[t]),
    failed:Object.keys(usLgNo)});
  window.__usLgReset=()=>{usLgOk={};usLgNo={};usLgSave();location.reload();};
}catch(e){}

function usRateCls(q){const d=(q&&q.price!=null&&q.prev)?q.price-q.prev:0;return dirOf(d);}
function usRateTxt(q){if(!q||q.price==null||!q.prev)return '—';
  const r=(q.price-q.prev)/q.prev*100;return pctS(r);}
/* ══ [v4.49] 종목 한 줄 — 순위 자리·상태 문구를 갖춘 새 행 ══════════════════
   시세가 아직 없을 때 '$—' 를 띄우면 값이 0인지 고장인지 알 수 없다.
   도착 전에는 '조회 중', 조회에 실패했으면 '시세 없음' 으로 상태를 말해 준다. */
/* ══ [v4.50] 종목 행 재설계 ═════════════════════════════════════════════════
   [무엇이 문제였나] 순위 화면은 '거래대금 순'·'시가총액 순'으로 줄을 세워 놓고
   정작 그 값을 화면에 보여 주지 않았다. 사용자 입장에서는 왜 이 순서인지 확인할
   길이 없고, 1위와 20위의 차이가 두 배인지 백 배인지도 알 수 없었다.
   → 정렬 기준이 되는 값을 행에 함께 적는다. 순위표의 기본 요건이다.
   [함께 넣은 것] 52주 위치를 가는 막대로 곁들여, 목록만 훑어도 지금 이 종목이
   고점권인지 저점권인지 감이 오게 했다. 등락률은 색 글씨 대신 배지로 바꿔
   작은 화면에서도 상승·하락이 즉시 구분되게 했다. */
function usBigNum(v,unit){
  if(v==null||!isFinite(v))return '';
  const s=unit==='$'?'$':'';
  if(v>=1e12)return s+(v/1e12).toFixed(2)+'T';
  if(v>=1e9)return s+(v/1e9).toFixed(1)+'B';
  if(v>=1e6)return s+(v/1e6).toFixed(1)+'M';
  if(v>=1e3)return s+(v/1e3).toFixed(1)+'K';
  return s+Math.round(v);
}
/* 정렬 기준값 한 줄 — 어떤 탭을 보고 있는지에 따라 다른 값을 적는다 */
function usMetricTxt(t,kind){
  const q=usQ[t]; if(!q)return '';
  if(kind==='cap')return q.cap>0?`시총 ${usBigNum(q.cap,'$')}`:'';
  if(kind==='val'){const v=(q.price||0)*(q.vol||0); return v>0?`거래대금 ${usBigNum(v,'$')}`:'';}
  if(kind==='vol')return q.vol>0?`거래량 ${usBigNum(q.vol)}주`:'';
  return '';
}
/* 52주 위치 — 값이 온전할 때만 그린다(짐작으로 막대를 그리면 거짓 정보가 된다) */
function usBandMini(q){
  if(!q||q.price==null||q.w52h==null||q.w52l==null||!(q.w52h>q.w52l))return '';
  const p=Math.max(0,Math.min(100,(q.price-q.w52l)/(q.w52h-q.w52l)*100));
  const tone=p>=80?'hi':p<=20?'lo':'mid';
  return `<span class="uz-mini ${tone}" title="52주 범위에서 ${p.toFixed(0)}% 지점">
    <i style="width:${p}%"></i><em style="left:${p}%"></em></span>`;
}
function usRow(t,rank,metric){
  const m=usMeta[t]; if(!m)return '';
  const q=usQ[t], has=q&&q.price!=null;
  if(!has&&_usQFail<2)return usRowSkel(t,rank);          // 기다리는 중이면 골격을 보여 준다
  const mt=has?usMetricTxt(t,metric):'';
  const band=has?usBandMini(q):'';
  const rt=usRateTxt(q), cls=usRateCls(q);
  return `<button type="button" class="us-row uz-row" data-us="${t}">
    ${rank?`<span class="uz-rk num">${rank}</span>`:''}${usTick(t)}
    <span class="us-nm uz-nm"><b>${m.kr}${m.etf?'<i class="uz-etf">ETF</i>':''}</b>
      <span class="uz-sub2">${t}<em>·</em>${mt||m.en}</span>${band}</span>
    <span class="us-px uz-px">${has?'$'+USD2(q.price):'<i class="uz-wait">시세 없음</i>'}
      <small>${has?USDKR(q.price):''}</small></span>
    <span class="uz-badge ${cls}">${rt||'—'}</span></button>`;
}
/* 로딩 골격 — '···' 이나 '조회 중' 글자보다, 들어올 자리가 보이는 편이 덜 불안하다 */
function usRowSkel(t,rank){
  const m=usMeta[t]||{};
  return `<div class="uz-row uz-skel">${rank?`<span class="uz-rk num">${rank}</span>`:''}${usTick(t)}
    <span class="uz-nm"><b>${m.kr||''}</b><span class="sk sk-a"></span></span>
    <span class="uz-px"><span class="sk sk-b"></span><span class="sk sk-c"></span></span>
    <span class="sk sk-d"></span></div>`;
}

/* ── 6. 라운지 ── */
var usRankTab='up', usThemeSel='ai', usPane='find';
/* 분야 칩 = 테마 10 + ETF 그룹 5. 예전에는 테마 목록과 ETF 목록이 서로 다른
   섹션에 따로 있어 같은 종목이 두 번 나왔다 — 한 줄로 합친다. */
function usChipList(){ return US_THEMES.concat(US_ETF_GROUPS); }

/* ══ 시그니처: 마켓 클록 ═════════════════════════════════════════════════
   한국에서 미국장을 볼 때 가장 먼저 궁금한 건 '지금 열렸나, 안 열렸으면 언제'다.
   프리(04:00 ET) ~ 애프터 종료(18:00 ET) 840분을 한 줄 트랙으로 펴고,
   현재 시각을 마커로 얹어 한눈에 답한다. 휴장이면 트랙을 재우고 개장 시각만 남긴다. */
function renderUsHero(){
  const box=$('usHero'); if(!box)return;
  const ses=usSession(), fx=usFx();
  const T0=240, TW=840;                                   // 04:00 ET 시작 · 14시간 폭
  const seg=[['pre',240,570,'프리'],['regular',570,960,'정규장'],['after',960,1080,'애프터']];
  const live=ses.phase!=='closed';
  const pos=Math.max(0,Math.min(100,(ses.mins-T0)/TW*100));
  const track=`<div class="uz-track ${live?'':'off'}">
    ${seg.map(([k,a,b,l])=>`<span class="uz-seg ${k} ${ses.phase===k?'now':''}"
        style="left:${(a-T0)/TW*100}%;width:${(b-a)/TW*100}%"><i>${l}</i></span>`).join('')}
    ${live?`<span class="uz-mark" style="left:${pos}%"><i></i></span>`:''}</div>
    <div class="uz-tick">
      <span style="left:0%">${ses.kst.pre}</span>
      <span style="left:${(570-T0)/TW*100}%">${ses.kst.open}</span>
      <span style="left:${(960-T0)/TW*100}%">${ses.kst.close}</span>
      <span style="left:100%;transform:translateX(-100%)">${ses.kst.aft}</span></div>`;
  const sub=ses.phase==='closed'?`다음 개장 ${ses.next}`
    :ses.phase==='pre'?`정규장까지 프리마켓 시세로 표시됩니다`
    :ses.phase==='after'?`애프터마켓 체결가로 표시됩니다`
    :`실시간 체결 중`;
  box.innerHTML=`<div class="uz-hero-top">
      <div class="uz-hero-t"><span class="uz-dot ${ses.phase}"></span>
        <b>미국 증시 ${ses.label}</b><small>${sub}</small></div>
      <div class="uz-hero-fx"><small>USD/KRW</small>
        <b class="num">${fx?KRW(Math.round(fx)):'···'}</b><i>${ses.dst?'서머타임':'표준시'}</i></div>
    </div>${track}
    <div class="uz-hero-foot" id="usHeroFoot"></div>`;
  renderUsBreadthChip();
}
/* 시장 폭 — 우리가 이미 받은 시세만으로 계산한다(추가 호출 없음) */
function usBreadth(){
  let up=0,down=0,flat=0,none=0;
  US_UNI.forEach(u=>{const q=usQ[u[0]];
    if(!q||q.price==null||!q.prev){none++;return;}
    const d=q.price-q.prev; if(d>0)up++; else if(d<0)down++; else flat++;});
  return {up,down,flat,none,got:US_UNI.length-none};
}
function renderUsBreadthChip(){
  const el=$('usHeroFoot'); if(!el)return;
  const b=usBreadth();
  if(!b.got){el.innerHTML=`<span class="uz-hf-wait">시세를 받는 중… ${US_UNI.length}종</span>`;return;}
  const tot=b.up+b.down+b.flat||1;
  el.innerHTML=`<div class="uz-breadth" title="내장 유니버스 ${b.got}종 기준">
      <i class="up" style="width:${b.up/tot*100}%"></i><i class="fl" style="width:${b.flat/tot*100}%"></i><i class="dn" style="width:${b.down/tot*100}%"></i></div>
    <span class="uz-hf-l"><b class="up">▲${b.up}</b> <b class="dn">▼${b.down}</b>
      <em>${b.got}/${US_UNI.length}종 수신${b.none?` · ${b.none}종 대기`:''}</em></span>`;
}

function usPaneShow(p){
  usPane=p;
  document.querySelectorAll('#usNav button').forEach(b=>b.classList.toggle('on',b.dataset.uspane===p));
  ['find','rank','mine','guide'].forEach(k=>{const el=$('uspane-'+k); if(el)el.hidden=(k!==p);});
  if(p==='rank'){renderUsRankTabs();renderUsRankBody();}
  if(p==='mine'){renderUsFxCard();renderUsMine();renderUsTax();}
  if(p==='guide')renderUsRules();
  try{window.scrollTo({top:0,behavior:'smooth'});}catch(e){}
}
function renderUsLounge(){
  const el=$('usCount'); if(el)el.textContent=`내장 ${US_UNI.length}종 · 검색은 미국 전 종목`;
  renderUsHero();
  $('usStars').innerHTML=`<div class="us-stars uz-stars">${US_STARS.map(t=>{const m=usMeta[t],q=usQ[t];
      return `<button type="button" class="us-star uz-star" data-us="${t}"><span class="t">${usTick(t)}<b>${m.kr}</b></span>
        <span class="p num">${q&&q.price!=null?'$'+USD2(q.price):'···'}</span>
        <span class="r num ${usRateCls(q)}">${usRateTxt(q)}</span></button>`;}).join('')}</div>`;
  $('usThemeTabs').innerHTML=usChipList().map(([k,l])=>
    `<button type="button" class="uz-chip ${usThemeSel===k?'on':''}" data-ustheme="${k}">${l}</button>`).join('');
  renderUsThemeBody();
  usPaneShow(usPane);
  usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(()=>renderUsLive());
  usPollStart(US_UNI.map(u=>u[0]));
  wireUsLounge();
}
function renderUsRankTabs(){
  const el=$('usRankTabs'); if(!el)return;
  /* [v4.58] 조회수를 맨 앞에 — 종목검색 화면과 같은 기준으로 통일한다 */
  el.innerHTML=[['view','조회수'],['up','상승률'],['down','하락률'],['val','거래대금'],['cap','시가총액']].map(([k,l])=>
    `<button type="button" class="uz-chip ${usRankTab===k?'on':''}" data-usrank="${k}">${l}</button>`).join('');
  el.querySelectorAll('[data-usrank]').forEach(b=>b.onclick=()=>{
    usRankTab=b.dataset.usrank; renderUsRankTabs(); renderUsRankBody();});
}
/* ══ [v4.53] 화면에서 바로 여는 시세 진단 ═══════════════════════════════════
   [왜 넣었나] 해외 시세가 비었을 때, 지금까지는 어느 원천이 죽었는지 알 방법이
   개발자에게 없었다. 그래서 바깥 서비스를 추측으로 갈아 끼우기를 반복했고
   그때마다 사용자만 헛걸음했다. 이제 화면에서 눌러 실제 응답을 확인한다 —
   어떤 원천이 몇 번을 돌려주고 파싱까지 됐는지 한 화면에 나온다. */
async function openUsDiag(){
  openLiteGate('해외 시세 진단','<div class="usdg"><div class="usdg-wait">서버가 원천을 하나씩 두드리는 중… 최대 30초</div></div>');
  let j=null, err='';
  try{ const r=await fetch('/api/usdiag',{cache:'no-store'}); j=await r.json(); }
  catch(e){ err=String(e).slice(0,80); }
  const body=$('liteBody'); if(!body)return;
  if(!j){ body.innerHTML=`<div class="usdg"><div class="usdg-bad">진단 서버에 연결하지 못했습니다<br><small>${htmlEsc(err)}</small></div></div>`; return; }
  const rows=(j.tried||[]).map(t=>{
    const ok=!!t.parsed, st=t.err?'ERR':(t.status!=null?t.status:'—');
    return `<div class="usdg-r ${ok?'ok':'no'}">
      <span class="usdg-b">${ok?'정상':'실패'}</span>
      <span class="usdg-n">${htmlEsc(t.label||'')}</span>
      <span class="usdg-s">${htmlEsc(String(st))}</span>
      <span class="usdg-l">${t.len!=null?t.len+'B':''}</span></div>`;}).join('');
  const usable=(j.usable&&j.usable.length)?j.usable:(j.tried||[]).filter(t=>t.parsed).map(t=>t.label);
  body.innerHTML=`<div class="usdg">
    <div class="usdg-sum ${usable.length?'ok':'no'}">
      ${usable.length?`쓸 수 있는 원천 <b>${usable.length}곳</b> — ${htmlEsc(usable.join(', '))}`
        :'쓸 수 있는 원천이 <b>하나도 없습니다</b>. 아래 응답 코드를 개발자에게 보여 주세요.'}</div>
    <div class="usdg-list">${rows||'<div class="usdg-bad">응답이 비었습니다</div>'}</div>
    <div class="usdg-note">앱 버전 ${htmlEsc(j.ver||'—')} · 검사 시각 ${htmlEsc(String(j.at||'').slice(0,19))}</div>
    <button class="modal-btn" id="usdgCopy">진단 결과 복사</button></div>`;
  const cp=$('usdgCopy');
  if(cp)cp.onclick=()=>{ try{ navigator.clipboard.writeText(JSON.stringify(j,null,1).slice(0,4000));
    cp.textContent='복사됨'; }catch(e){} };
}
function renderUsRankBody(){
  const box=$('usRankBody'); if(!box)return;
  const bd=$('usBreadth');
  const pool=US_UNI.map(u=>u[0]).filter(t=>usQ[t]&&usQ[t].price!=null);
  if(!pool.length){
    if(bd)bd.innerHTML='';
    box.innerHTML=_usQFail>=2
      ? `<div class="uz-empty"><b>해외 시세 서버가 지금 응답하지 않습니다</b>
           <span>어느 원천이 막혔는지 바로 확인할 수 있어요.</span>
           <div class="uz-btns"><button type="button" class="uz-retry" id="usRankRetry">다시 시도</button>
             <button type="button" class="uz-retry ghost" id="usRankDiag">시세 진단</button></div></div>`
      : `<div class="uz-empty"><b>시세를 받는 중입니다</b><span>내장 ${US_UNI.length}종을 동시에 조회하고 있어요.</span></div>`;
    const r=$('usRankRetry'); if(r)r.onclick=()=>{_usQFail=0;renderUsRankBody();
      usEnsureQuotes(US_UNI.map(u=>u[0]),true).then(()=>renderUsLive());};
    const dg=$('usRankDiag'); if(dg)dg.onclick=()=>openUsDiag();
    return;
  }
  const rate=t=>{const q=usQ[t];return q.prev?(q.price-q.prev)/q.prev*100:0;};
  const val=t=>{const q=usQ[t];return (q.price||0)*(q.vol||0);};
  const rated=pool.filter(t=>usQ[t].prev);
  let list,note;
  if(usRankTab==='up'){list=rated.slice().sort((a,b)=>rate(b)-rate(a));note='오늘 가장 많이 오른 순서';}
  else if(usRankTab==='down'){list=rated.slice().sort((a,b)=>rate(a)-rate(b));note='오늘 가장 많이 내린 순서';}
  else if(usRankTab==='cap'){list=pool.filter(t=>usQ[t].cap).slice().sort((a,b)=>usQ[b].cap-usQ[a].cap);note='시가총액이 큰 순서';}
  else if(usRankTab==='view'){
    /* 서버가 센 실제 조회수 순서. 아직 안 왔으면 받아 오고 다시 그린다. */
    if(!usPop){ usPopLoad(()=>{ usEnsureQuotes((usPop||[]).map(x=>x.t),true)
        .then(()=>{ if(currentView==='us')renderUsRankBody(); });
      if(currentView==='us')renderUsRankBody(); });
      box.innerHTML='<div class="uz-empty"><b>인기 종목을 불러오는 중…</b></div>';
      if(bd)bd.innerHTML='<div class="uz-note">이 앱에서 조회된 횟수를 세는 중입니다</div>';
      return; }
    const known=usPop.filter(x=>usMeta[x.t]);
    const miss=known.map(x=>x.t).filter(t=>!(usQ[t]&&usQ[t].price!=null));
    if(miss.length)usEnsureQuotes(known.map(x=>x.t),true).then(()=>{ if(currentView==='us')renderUsRankBody(); });
    const b2=usPopBasis||{};
    list=known.map(x=>x.t).slice(0,100);
    const extN=(b2.ext||[]).length+(b2.yahoo>0?1:0);
    note=(b2.wiki>0)
      ?`위키백과 기업 문서 실제 조회수가 많은 순서 · ${b2.wiki}종`
      :(extN?`외부 사이트 검색·관심 순위 기준`:`조회수 원천에 연결하지 못했습니다`);
  }
  else {list=pool.filter(t=>usQ[t].vol).slice().sort((a,b)=>val(b)-val(a));
        note='거래대금(가격×거래량)이 큰 순서';}
  if(bd){const b=usBreadth();
    bd.innerHTML=`<div class="uz-note">${note} · <b>${list.length}종</b>${b.none?` · ${b.none}종은 아직 시세 대기`:''}</div>`;}
  /* [v4.50] 정렬 기준이 된 값을 행에도 적어 준다 — 왜 이 순서인지 보이게 */
  const mk=usRankTab==='cap'?'cap':usRankTab==='val'?'val':'';
  box.innerHTML=list.length?`<div class="uz-list">${list.map((t,i)=>usRow(t,i+1,mk)).join('')}</div>`
    :`<div class="uz-empty"><b>정렬할 값이 아직 없습니다</b><span>이 기준에 필요한 항목이 시세에 담겨 오면 곧 채워집니다.</span></div>`;
}
function renderUsThemeBody(){
  const box=$('usThemeBody'); if(!box)return;
  const q=(($('usSearch')||{}).value||'').trim();
  if(q){box.innerHTML='';return;}                      // 검색 중에는 목록을 감춘다
  const list=US_UNI.filter(u=>u[4]===usThemeSel).map(u=>u[0]);
  const lbl=(usChipList().find(x=>x[0]===usThemeSel)||[,''])[1];
  box.innerHTML=list.length?`<div class="uz-note">${lbl} <b>${list.length}종</b></div>
    <div class="uz-list">${list.map(t=>usRow(t)).join('')}</div>`
    :`<div class="uz-empty"><b>이 분야에 담긴 종목이 없습니다</b><span>다른 칩을 골라 보세요.</span></div>`;
}
var usFxDir='toUsd';
function renderUsFxCard(){
  const box=$('usFxCard'); if(!box)return;
  usSettle();
  const fx=usFx(), hold=usdSettling.reduce((a,x)=>a+x.amt,0), avail=usUsdAvailable();
  const toU=usFxDir==='toUsd';
  box.innerHTML=`<div class="us-fxwrap">
    <div class="uz-fxhead"><span>기준 스프레드 ${US_FX_SPREAD}원 · 우대 ${US_FX_PREF_OF()*100}%</span>
      <b>실부담 ${usFxMargin().toFixed(1)}원 / $1</b></div>
    <div class="uz-fxbal">
      <div><small>원화 예수금</small><b class="num">${KRW(cash)}원</b></div>
      <div><small>달러 예수금</small><b class="num">$${USD2(usdCash)}</b>
        <i>${hold>0?`환전 가능 $${USD2(avail)} · 미결제 $${USD2(hold)} (T+1)`:'전액 환전 가능'}</i></div></div>
    <div class="uz-chips" style="margin:12px 0 10px">
      <button type="button" class="uz-chip ${toU?'on':''}" data-usfxdir="toUsd">원화 → 달러 ${fx?`<em>${KRW(usFxBuy())}</em>`:''}</button>
      <button type="button" class="uz-chip ${!toU?'on':''}" data-usfxdir="toKrw">달러 → 원화 ${fx?`<em>${KRW(usFxSell())}</em>`:''}</button></div>
    <div class="us-fld"><label><span>${toU?'환전할 원화 금액':'환전할 달러 금액'}</span>
        <span class="num">${toU?'보유 '+KRW(cash)+'원':'가능 $'+USD2(avail)}</span></label>
      <div class="us-inrow"><input id="usFxAmt" inputmode="decimal" placeholder="${toU?'예: 1000000':'예: 500'}">
        <button type="button" id="usFxMax" style="width:64px;font-size:12px">전액</button></div></div>
    <div id="usFxPreview" class="us-ord-note" style="margin:6px 0 10px"></div>
    <button type="button" class="us-submit buy" id="usFxGo">${fx?'환전 실행':'환율 확인 중 · 눌러서 다시 시도'}</button>
    <div class="us-ord-note">※ 매도 대금(달러)은 즉시 재매수에 쓸 수 있지만, 원화 환전은 미국 T+1 결제가 끝나는 <b>다음 영업일부터</b> 가능합니다.</div></div>`;
  const amt=$('usFxAmt'), pv=$('usFxPreview');
  const prev=()=>{const v=parseFloat(amt.value)||0;
    if(!fx||!(v>0)){pv.textContent='';return;}
    if(toU)pv.innerHTML=`받게 될 달러: <b class="num">$${USD2(Math.floor(v/usFxBuy()*100)/100)}</b>`;
    else pv.innerHTML=`받게 될 원화: <b class="num">${KRW(Math.floor(Math.min(v,avail)*usFxSell()))}원</b>`;};
  amt.oninput=prev;
  $('usFxMax').onclick=()=>{amt.value=toU?cash:avail;prev();};
  box.querySelectorAll('[data-usfxdir]').forEach(b=>b.onclick=()=>{usFxDir=b.dataset.usfxdir;renderUsFxCard();});
  $('usFxGo').onclick=()=>{
    if(!usFx()){ toast('warn','환율을 받는 중입니다','잠시 후 자동으로 반영됩니다');
      usEnsureQuotes(['AAPL'],true).then(()=>renderUsFxCard()); return; }
    const r=usExchange(toU?'toUsd':'toKrw',parseFloat(amt.value)||0);
    toast(r.ok?'buy':'warn',r.ok?'환전 완료':'환전 실패',r.msg);
    if(r.ok){renderUsFxCard();try{renderPortfolioNumbers();}catch(e){}}
  };
}
function renderUsTax(){
  const box=$('usTax'); if(!box)return;
  const sec=$('usTaxSec');
  const t=usTaxEstimate();
  if(!t.n){box.innerHTML=''; if(sec)sec.hidden=true; return;}
  if(sec)sec.hidden=false;
  box.innerHTML=`<div class="panel us-card"><div class="us-stat-g">
      <div class="us-stat"><small>올해 매도 건수</small><b class="num">${t.n}건</b></div>
      <div class="us-stat"><small>실현손익 합산</small><b class="num ${dirOf(t.pnl)}">${signed(t.pnl)}원</b></div>
      <div class="us-stat"><small>과세표준 (250만 공제)</small><b class="num">${KRW(t.taxable)}원</b></div>
      <div class="us-stat"><small>예상 양도소득세 (22%)</small><b class="num">${KRW(t.tax)}원</b></div></div>
    <div class="us-ord-note" style="margin-top:9px">연 250만원까지 비과세 · 초과분에 22%(양도세 20%+지방세 2%) · 이익과 손실은 1년 단위로 합산(손익 통산)되며 다음 해 5월에 자진 신고합니다. 배당은 미국에서 15% 원천징수됩니다(모의에서는 배당 미지급).</div></div>`;
}
function renderUsMine(){
  const box=$('usMine'); if(!box)return;
  const mine=holdings.filter(h=>h.us), sec=$('usMineSec');
  if(!mine.length&&usdCash<=0){
    box.innerHTML=`<div class="uz-empty"><b>아직 보유한 해외 종목이 없습니다</b>
      <span>탐색 탭에서 종목을 고르면 여기에 평가금액과 손익이 모입니다.</span>
      <button type="button" class="uz-retry" id="usGoFind">종목 탐색하기</button></div>`;
    if(sec)sec.hidden=false;
    const g=$('usGoFind'); if(g)g.onclick=()=>usPaneShow('find');
    return;
  }
  if(sec)sec.hidden=false;
  const fx=usFx()||0;
  let ev=0,cost=0;
  mine.forEach(h=>{const q=usQ[h.code]||byCode[h.code]||{};const px=q.price!=null?q.price:h.avg;
    ev+=px*h.qty*fx; cost+=h.avg*h.qty*fx;});
  const pnl=ev-cost, rt=cost?pnl/cost*100:0;
  box.innerHTML=`<div class="panel us-card">
    <div class="uz-minehead"><div><small>평가금액</small><b class="num">${KRW(Math.round(ev))}원</b></div>
      <div><small>평가손익</small><b class="num ${dirOf(pnl)}">${signed(Math.round(pnl))}원 <em>${pctS(rt)}</em></b></div>
      <div><small>달러 예수금</small><b class="num">$${USD2(usdCash)}</b></div></div>
    <div class="uz-list">${mine.map(h=>usRow(h.code)).join('')}</div></div>`;
}
function renderUsRules(){
  const box=$('usRules'); if(!box)return;
  const ses=usSession();
  box.innerHTML=`<div class="uz-guide">
    ${[['💱','두 가지 결제 방식',`<b>직접 환전</b>: 미리 달러로 바꿔 두면 추가 환전 비용 없이 결제됩니다.<br><b>원화 자동환전</b>: 원화로 바로 주문 — 매수환율(스프레드 포함)이 적용됩니다.`],
       ['🧾','수수료 0.25% + SEC Fee',`매수·매도 각 0.25%, 매도 시 미국 증권거래위원회 수수료 ${(US_SEC_FEE*100).toFixed(4)}%가 추가 차감됩니다. 거래세는 없습니다.`],
       ['📅','T+1 결제','매도 대금(달러)은 <b>즉시 재매수</b>에 쓸 수 있지만, 원화 환전은 <b>다음 영업일</b>부터 가능합니다 (2024년부터 미국 T+1 시행).'],
       ['🔢','소수점 매매','0.01주 단위로 살 수 있어 고가 주식도 소액으로 연습할 수 있습니다. 호가는 $0.01, 상·하한가 제도는 없습니다.'],
       ['🕒','장 시간 (한국 시각)',`프리 ${ses.kst.pre} · 정규 ${ses.kst.open}~${ses.kst.close} · 애프터 ${ses.kst.aft}까지. 서머타임은 자동 반영되며, 미국 휴장일은 반영되지 않을 수 있습니다.`],
       ['📊','환차익 · 환차손','주가가 올라도 환율이 내리면 원화 수익이 줄 수 있습니다. 주문 화면에서 주가손익과 환손익을 나눠 보여 드립니다.'],
       ['🧾','세금 (참고)','연 실현손익 250만원까지 비과세, 초과분 22% 양도소득세 — 내 자산 탭의 세금 도우미가 자동 계산합니다.']
      ].map(([ic,t,d])=>`<div class="uz-g"><span class="uz-gi">${ic}</span>
        <div><b>${t}</b><p>${d}</p></div></div>`).join('')}
    <div class="us-ord-note">실제 제도를 그대로 옮겼지만 체결은 모두 모의입니다. 실제 주문은 이뤄지지 않습니다.</div></div>`;
}
/* ══ [v4.42] 시세가 도착해도 목록이 안 바뀌던 이유 — 라운지에서만 돌게 막혀 있었다.
   어느 화면이든 눈에 보이는 행을 갱신한다. */
function usPaintRows(root){
  (root||document).querySelectorAll('.us-row[data-us], .us-star[data-us]').forEach(el=>{
    const t=el.dataset.us,q=usQ[t]; if(!q||q.price==null)return;
    const px=el.querySelector('.us-px'), rt=el.querySelector('.us-rt');
    if(px)px.innerHTML='$'+USD2(q.price)+`<small>${USDKR(q.price)}</small>`;
    if(rt){rt.textContent=usRateTxt(q);
      rt.classList.remove('up','down','flat'); rt.classList.add('num',usRateCls(q));}
    const p=el.querySelector('.p'), r=el.querySelector('.r');
    if(p)p.textContent='$'+USD2(q.price);
    if(r){r.textContent=usRateTxt(q);
      r.classList.remove('up','down','flat'); r.classList.add('num',usRateCls(q));}
  });
}
function renderUsLive(){
  usPaintRows();                                   // 화면 종류와 무관하게 먼저 칠한다
  if(currentView!=='us')return;
  renderUsBreadthChip();
  if(usPane==='rank')renderUsRankBody();
  if(usPane==='find')renderUsThemeBody();
  if(usPane==='mine')renderUsMine();
  const fx=usFx();
  if(fx){const el=document.querySelector('#usHero .uz-hero-fx b'); if(el)el.textContent=KRW(Math.round(fx));}
}
function wireUsLounge(){
  document.querySelectorAll('#usNav button').forEach(b=>b.onclick=()=>usPaneShow(b.dataset.uspane));
  document.querySelectorAll('[data-ustheme]').forEach(b=>b.onclick=()=>{usThemeSel=b.dataset.ustheme;
    document.querySelectorAll('[data-ustheme]').forEach(x=>x.classList.toggle('on',x===b));renderUsThemeBody();});
  /* 마켓 클록은 1분마다 스스로 움직인다 — 화면을 떠나면 멈춘다 */
  if(!window._usClockT)window._usClockT=setInterval(()=>{
    if(currentView==='us')renderUsHero(); },60e3);
  const inp=$('usSearch'), clr=$('usSearchClear');
  if(inp&&!inp._wired){inp._wired=true;
    const paint=(q)=>{
      const box=$('usSearchOut'), main=$('usFindMain');
      if(clr)clr.hidden=!q;
      if(main)main.hidden=!!q;
      if(!q){box.innerHTML='';return;}
      const local=usLocalMatch(q);
      const draw=(list,note)=>{ box.innerHTML=(list.length
          ? `<div class="uz-note">'${q}' 검색 <b>${list.length}종</b>${note?' · '+note:''}</div>
             <div class="uz-list">${list.slice(0,20).map(t=>usRow(t)).join('')}</div>`
          : `<div class="uz-empty"><b>'${q}' 검색 결과가 없습니다</b><span>${note||'티커(AAPL) 또는 한글·영문 종목명으로 찾아 보세요.'}</span></div>`);
        if(list.length)usEnsureQuotes(list.slice(0,20),true).then(()=>usPaintRows($('usSearchOut'))); };
      draw(local, local.length?'':'전 종목에서 찾는 중…');
      usSearchRemote(q,(items)=>{
        if(inp.value.trim()!==q)return;                       // 입력이 바뀌었으면 버린다
        const merged=[...new Set(local.concat(items.map(x=>x.t)))];
        draw(merged, merged.length>local.length?`내장 ${local.length}종 + 전 종목 ${merged.length-local.length}종`
          :(merged.length?'':'미국 상장 종목에서도 찾지 못했습니다'));
      });
    };
    let _t=null;
    inp.oninput=()=>{const q=inp.value.trim(); clearTimeout(_t); _t=setTimeout(()=>paint(q),220);};
    if(clr)clr.onclick=()=>{inp.value='';paint('');inp.focus();};
  }
}
document.addEventListener('click',(e)=>{const n=e.target.closest('[data-us]');
  if(n&&n.dataset.us){openUS(n.dataset.us);}});

/* ── 7. 해외 거래 화면 ── */
var usSel=null, usSide='buy', usRange=132, usCandles=null, usOrdPx=null, usOrdQty=1;
var usTF='D';    // [v4.42] 봉 종류 — D 일봉 / W 주봉 / M 월봉
/* 일봉을 주·월봉으로 묶는다 — 시가는 첫 봉, 종가는 마지막 봉, 고저는 구간 최대·최소 */
function usAgg(cs,tf){
  if(tf==='D'||!cs||!cs.length)return cs||[];
  const key=(t)=>{
    const s=String(t), y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8);
    if(tf==='M')return y*100+m;
    const dt=new Date(Date.UTC(y,m-1,d));
    const th=new Date(dt); th.setUTCDate(dt.getUTCDate()-((dt.getUTCDay()+6)%7));   // 그 주 월요일
    return +(th.getUTCFullYear()+String(th.getUTCMonth()+1).padStart(2,'0')+String(th.getUTCDate()).padStart(2,'0'));
  };
  const out=[]; let cur=null,k0=null;
  cs.forEach(c=>{
    const k=key(c.t);
    if(k!==k0){ if(cur)out.push(cur); k0=k; cur={t:c.t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v}; }
    else { cur.h=Math.max(cur.h,c.h); cur.l=Math.min(cur.l,c.l); cur.c=c.c; cur.v+=c.v; cur.t=c.t; }
  });
  if(cur)out.push(cur);
  return out;
}
/* ══ [v4.57] 해외 차트를 국내 차트와 같은 것으로 만든다 ═══════════════════
   [무엇이 달랐나] 국내 차트에는 봉 종류(일·주·월·분), 이동평균 4개, 확대·축소,
   드래그 이동, 툴팁, 매물대, 차트 설정(캔들/선/하이킨아시)이 있는데
   해외 차트는 캔버스 하나에 기간 버튼만 있었다. 같은 앱에서 두 화면이 딴판이었다.
   [어떻게 했나] 해외용 차트를 새로 만들지 않는다 — 국내 차트 카드(#chartCard)를
   해외 정보 패널로 '옮겨' 같은 엔진이 그리게 한다. 화면에는 어차피 하나만 보이므로
   충돌하지 않고, 기능·모양·조작이 자동으로 100% 같아진다.
   앞으로 국내 차트를 고치면 해외도 함께 좋아진다. */
function usChartMount(on){
  const card=$('chartCard'); if(!card)return;
  const host=on?$('usChartHost'):$('chartHome');
  if(host&&card.parentElement!==host)host.appendChild(card);
  card.hidden=!on&&currentView!=='trade';
}
/* 해외 일봉을 국내 엔진이 읽는 모양(d: 'YYYYMMDD')으로 바꾼다 */
function usToEngine(cs){
  return (cs||[]).map(c=>({d:String(c.t),o:+c.o,h:+c.h,l:+c.l,c:+c.c,v:+c.v||0}));
}
var usTfMap={D:'D',W:'W',M:'M'};
/* ══ [v4.60] 일봉은 화면에 들어오는 즉시 받아 둔다 ══════════════════════════
   [무엇이 잘못됐나] v4.57 에서 차트를 국내 엔진으로 옮기면서, 캔들을 '차트 탭에서만'
   불러오게 바뀌었다. 그런데 시세 탭도 같은 캔들을 쓴다 → 차트를 한 번도 안 누르면
   '일별 시세를 불러오는 중입니다'에서 영영 멈춘다. 내가 만든 회귀다.
   → 종목 화면에 들어오면 탭과 무관하게 바로 받고, 받으면 열려 있는 탭을 다시 그린다. */
var _usCdBusy=null;
function usEnsureCandles(){
  if(!usSel)return Promise.resolve();
  if(usCandles&&usCandles.length)return Promise.resolve();
  if(_usCdBusy)return _usCdBusy;
  const want=usSel;
  _usCdBusy=fetch('/api/uscandle?code='+encodeURIComponent(usMeta[want].reu)+'&n=560',{cache:'no-store'})
    .then(r=>r.json()).then(j=>{
      if(usSel!==want)return;
      usCandles=(j&&j.ok&&Array.isArray(j.candles))?j.candles:[];
      if(usCandles.length)usApplyCandleExtras(j);
    }).catch(()=>{ if(usSel===want)usCandles=[]; })
    .then(()=>{ _usCdBusy=null;
      if(currentView==='ustrade'){ if(usInfoTab==='chart')usLoadIntoChart(); else renderUsInfo(); } });
  return _usCdBusy;
}
/* 분봉 — 야후 1분봉을 받아 두고 3·5·10·30·60 분은 여기서 묶는다 */
var usMinRaw=null, _usMinFor=null, _usMinBusy=null;
function usEnsureMinutes(){
  if(!usSel)return Promise.resolve();
  if(_usMinFor===usSel&&usMinRaw)return Promise.resolve();
  if(_usMinBusy)return _usMinBusy;
  const want=usSel;
  _usMinBusy=fetch('/api/uscandle?tf=MIN&code='+encodeURIComponent(usMeta[want].reu),{cache:'no-store'})
    .then(r=>r.json()).then(j=>{
      if(usSel!==want)return;
      usMinRaw=(j&&j.ok&&Array.isArray(j.candles))?j.candles:[];
      _usMinFor=want;
    }).catch(()=>{ if(usSel===want){usMinRaw=[];_usMinFor=want;} })
    .then(()=>{ _usMinBusy=null; if(currentView==='ustrade'&&usInfoTab==='chart')usLoadIntoChart(); });
  return _usMinBusy;
}
function usMinAgg(mins){
  const src=usMinRaw||[]; if(!src.length)return [];
  const ms=mins*60000, out=[]; let cur=null,k0=null;
  for(const c of src){
    const k=Math.floor(c.t/ms);
    if(k!==k0){ if(cur)out.push(cur); k0=k; cur={t:c.t,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v}; }
    else { cur.h=Math.max(cur.h,c.h); cur.l=Math.min(cur.l,c.l); cur.c=c.c; cur.v+=c.v; }
  }
  if(cur)out.push(cur);
  /* 국내 엔진은 d(라벨)로 축을 그린다 — 분봉은 시:분으로 준다 */
  return out.map(c=>{ const d=new Date(c.t);
    const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
    return {d:hh+':'+mm,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v}; });
}
async function usLoadIntoChart(){
  if(currentView!=='ustrade'||!usSel)return;
  const lg=$('chartLegend');
  if(isMinute(chartTf)){
    if(_usMinFor!==usSel||!usMinRaw){
      chartLoading=true; if(lg)lg.textContent='분봉 불러오는 중…'; drawChart();
      await usEnsureMinutes(); chartLoading=false;
    }
    curCandles=usMinAgg(minutesOf(chartTf));
    resetView(); drawChart();
    if(!curCandles.length&&lg)lg.textContent='분봉 데이터를 받지 못했어요 · ⟳ 로 다시 시도';
    return;
  }
  if(!usCandles||!usCandles.length){
    chartLoading=true; if(lg)lg.textContent='차트 불러오는 중…'; drawChart();
    await usEnsureCandles(); chartLoading=false;
  }
  curCandles=usToEngine(usAgg(usCandles||[],usTfMap[chartTf]||'D'));
  resetView(); drawChart();
  if(!curCandles.length&&lg)lg.textContent='차트 데이터를 받지 못했어요 · ⟳ 로 다시 시도';
}
/* 52주 고저 보강 + 원천 표시 — 예전 loadUsCandles 가 하던 일을 여기서 이어받는다 */
function usApplyCandleExtras(j){
  try{
    const y=(usCandles||[]).slice(-252);
    if(y.length){
      const cur=usQ[usSel]||{};
      usQ[usSel]=Object.assign(cur,{w52h:cur.w52h!=null?cur.w52h:Math.max(...y.map(c=>c.h)),
        w52l:cur.w52l!=null?cur.w52l:Math.min(...y.map(c=>c.l)),w52n:y.length});
      if(usInfoTab==='summary')renderUsInfo();
    }
  }catch(e){}
}
function openUS(t){ if(!usMeta[t])return;
  usSel=t; usSide='buy'; usOrdPx=null; usOrdQty=1; usCandles=null;
  usMinRaw=null; _usMinFor=null;                       // [v4.60] 분봉 캐시도 종목별
  /* [v4.56] 해외도 '최근 본 종목'에 국내와 같은 목록으로 남긴다 —
     예전에는 해외만 '최근 검색'으로 따로 놀아서, 방금 본 미국 종목을
     종목검색 화면에서 다시 찾을 수가 없었다. */
  /* [v4.58] 조회수 집계 — 이 앱의 '조회수 TOP 100'을 만드는 유일한 실제 근거다 */
  safeRun('openUS:count',()=>{ fetch('/api/usview?t='+encodeURIComponent(t),{cache:'no-store'}).catch(()=>{}); });
  safeRun('openUS:view',()=>{ const m=usMeta[t]||{};
    viewHist=viewHist.filter(x=>x.code!==t);
    viewHist.unshift({code:t,name:m.kr||t,market:'US',us:1,t:Date.now()});
    viewHist=viewHist.slice(0,12); saveViewHist();
    if(currentView==='search')safeRun('vh',()=>renderViewHist());
  });
  showView('ustrade');
}
var usInfoTab='summary';
function renderUsTrade(){
  if(!usSel){showView('us');return;}
  renderUsHead(); renderUsOrder();
  /* [v4.57] 봉 종류·이동평균·확대축소는 국내 차트 카드가 그대로 들고 온다 —
     해외 전용 세그먼트를 따로 그리지 않는다(그게 두 화면이 달라진 원인이었다). */
  document.querySelectorAll('#usInfoTabs button').forEach(b2=>b2.onclick=()=>{
    usInfoTab=b2.dataset.uinfo;
    document.querySelectorAll('#usInfoTabs button').forEach(x=>x.classList.toggle('on',x===b2));
    renderUsInfo();});
  document.querySelectorAll('#usInfoTabs button').forEach(x=>x.classList.toggle('on',x.dataset.uinfo===usInfoTab));
  renderUsInfo();
  usEnsureQuotes([usSel],true).then(()=>{renderUsHead();renderUsOrder();renderUsInfo();renderUsCta();});
  usEnsureCandles();          // [v4.60] 탭과 무관하게 바로 — 시세 탭도 이 데이터를 쓴다
  usPollStart([usSel]);
  /* [v4.50] 하단 고정 주문바 — 모듈이라 inline onclick 을 쓸 수 없어 여기서 묶는다 */
  {const b=$('usCtaBuy'), sl=$('usCtaSell');
   if(b&&!b._w){b._w=1;b.addEventListener('click',()=>usCtaGo('buy'));}
   if(sl&&!sl._w){sl._w=1;sl.addEventListener('click',()=>usCtaGo('sell'));}}
  renderUsCta();
}
/* ══ [v4.37] 해외 종목정보 — 국내와 같은 8개 코너 ═══════════════════════════ */
function renderUsInfo(){
  const el=$('usInfoBody'), cc=$('usChartCard');
  if(usInfoTab==='chart'){ if(cc)cc.hidden=false; el.style.display='none';
    usChartMount(true);                                    // [v4.57] 국내 차트 카드를 이리로
    try{ buildTfSeg(); buildMaSeg(); }catch(e){}
    /* [v4.60] 분봉도 지원하므로 더 이상 감추지 않는다 */
    try{ document.querySelectorAll('#tfSeg [data-tf]').forEach(b=>{b.style.display='';}); }catch(e){}
    usLoadIntoChart();
    requestAnimationFrame(()=>requestAnimationFrame(()=>drawChart()));
    return; }
  if(cc)cc.hidden=true; el.style.display='';
  usChartMount(false);                                     // 다른 탭으로 가면 제자리로
  const f={summary:renderUsSummary,ai:renderUsAi,sise:renderUsSiseTab,news:renderUsNews,
           holders:renderUsHolders,consensus:renderUsConsensus,finance:renderUsFinance}[usInfoTab];
  (f||renderUsSummary)(el);
}
function usNoData(t,d){return `<div class="us-nodata"><b>${t}</b><span>${d}</span></div>`;}
/* ① 종목요약 — 시세·통계·회사 소개 */
function renderUsSummary(el){
  const m=usMeta[usSel]||{}, q=usQ[usSel]||{};
  const d=(q.price!=null&&q.prev)?q.price-q.prev:null;
  const fmt=(v)=>v==null?'—':'$'+USD2(v);
  const vol=(v)=>v==null?'—':(v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':KRW(v));
  /* [v4.49] 시가총액은 T/B/M 어느 구간이든 원화 환산을 함께 보여 준다.
     예전에는 1조 달러 이상일 때만 원화를 붙여, B 단위 종목은 감이 안 왔다. */
  const capS=(v)=>{if(v==null)return '—';const fx=usFx();
    const usd=v>=1e12?'$'+(v/1e12).toFixed(2)+'T':v>=1e9?'$'+(v/1e9).toFixed(1)+'B':'$'+(v/1e6).toFixed(0)+'M';
    if(!fx)return usd;
    const krw=v*fx;
    const won=krw>=1e12?(krw/1e12).toFixed(krw>=1e13?0:1)+'조원':(krw/1e8).toFixed(0)+'억원';
    return usd+` <small>≈${won}</small>`;};
  /* 52주 위치 막대 — 국내 '연간 가격 변화'와 같은 형태.
     [v4.49] 캔들에서 계산했고 1년치가 안 되면 몇 거래일 기준인지 밝힌다.
     '52주'라고 적어 놓고 실제로는 3개월치인 상황을 그대로 두면 값이 거짓말이 된다. */
  let band='';
  if(q.w52h!=null&&q.w52l!=null&&q.price!=null&&q.w52h>q.w52l){
    const pos=Math.max(0,Math.min(100,(q.price-q.w52l)/(q.w52h-q.w52l)*100));
    const partial=(q.w52n&&q.w52n<240)?`<small>실제 데이터 ${q.w52n}거래일 기준</small>`:'';
    band=`<div class="us-sec2">52주 가격 위치 ${partial}</div>
      <div class="us-band"><i style="left:${pos}%"></i></div>
      <div class="us-band-lb"><span>최저 ${fmt(q.w52l)}<b class="up">+${((q.price-q.w52l)/q.w52l*100).toFixed(0)}%</b></span>
        <span>최고 ${fmt(q.w52h)}<b class="down">${((q.price-q.w52h)/q.w52h*100).toFixed(0)}%</b></span></div>`;
  }
  /* 시세 자체가 안 왔을 때 빈 표를 보여 주는 대신 무슨 일인지 말해 준다 */
  if(q.price==null){
    el.innerHTML=`<div class="uz-empty"><b>${_usQFail>=2?'시세를 받지 못했습니다':'시세를 받는 중입니다'}</b>
      <span>${_usQFail>=2?'해외 시세 서버가 응답하지 않고 있어요. 잠시 뒤 다시 시도해 주세요.':'잠시만 기다려 주세요.'}</span>
      <button type="button" class="uz-retry" id="usSumRetry">다시 시도</button></div>`;
    const b=$('usSumRetry');
    if(b)b.onclick=()=>{_usQFail=0;el.innerHTML='';usEnsureQuotes([usSel],true).then(()=>renderUsInfo());};
    return;
  }
  const th=(US_THEMES.find(x=>x[0]===m.theme)||[,''])[1];
  el.innerHTML=`<div class="us-px-big"><b class="num ${dirOf(d||0)}">$${USD2(q.price)}</b>
      <span class="num ${dirOf(d||0)}">${d==null?'':(d>=0?'+':'')+USD2(d)+' ('+usRateTxt(q)+')'}</span>
      <i class="num">${USDKR(q.price)}</i></div>
    <div class="us-sum-card"><div class="us-sum-h">기업 개요 <span class="ai-badge">AI</span></div>
      <p>${usCompanyBrief(usSel)}</p>
      <div class="us-tagrow">${th?`<span class="us-tag">${th}</span>`:''}${m.etf?'<span class="us-tag">ETF</span>':''}
        <span class="us-tag">${{O:'NASDAQ',N:'NYSE',A:'AMEX'}[m.sfx]||''}</span></div>
      <div class="us-sum-note">실시간 시세와 거래소 공개 정보를 결합한 요약입니다.</div></div>
    <div class="us-sec2">종목 정보 <small>미국 주식은 상·하한가 제도가 없습니다</small></div>
    <div class="us-stat-g">
      <div class="us-stat"><small>시가</small><b class="num">${fmt(q.open)}</b></div>
      <div class="us-stat"><small>고가</small><b class="num" style="color:var(--up)">${fmt(q.high)}</b></div>
      <div class="us-stat"><small>저가</small><b class="num" style="color:var(--down)">${fmt(q.low)}</b></div>
      <div class="us-stat"><small>거래량</small><b class="num">${vol(q.vol)}</b></div>
      <div class="us-stat"><small>52주 최고</small><b class="num">${fmt(q.w52h)}</b></div>
      <div class="us-stat"><small>52주 최저</small><b class="num">${fmt(q.w52l)}</b></div>
      <div class="us-stat"><small>시가총액</small><b class="num">${capS(q.cap)}</b></div>
      <div class="us-stat"><small>전일 종가</small><b class="num">${fmt(q.prev)}</b></div>
    </div>${band}`;
}
/* 회사 한 줄 소개 — 유니버스 정보로 구성 */
function usCompanyBrief(t){
  const m=usMeta[t]||{};
  const TH={ai:'AI·반도체',big:'빅테크 플랫폼',ev:'전기차·모빌리티',coin:'디지털자산·핀테크',
    bio:'바이오·헬스케어',fin:'금융',cons:'소비·미디어',ener:'에너지·전력',space:'우주·방산',indu:'산업재'};
  const kind=m.etf?'상장지수펀드(ETF)':'상장 기업';
  const ex={O:'나스닥',N:'뉴욕증권거래소',A:'아멕스'}[m.sfx]||'미국 증시';
  const th=TH[m.theme];
  return `${m.kr}(${t})은 ${ex}에 상장된 ${kind}입니다.`
    +(th?` ${th} 분야에 속하며, 영문명은 ${m.en}입니다.`:` 영문명은 ${m.en}입니다.`)
    +(m.etf?' 개별 종목이 아닌 지수·자산군을 추종하는 상품이라 분산 효과가 있습니다.':'');
}
/* ② AI 종목 분석 */
function renderUsAi(el){
  const q=usQ[usSel]||{}, m=usMeta[usSel]||{};
  if(q.price==null){el.innerHTML=usNoData('시세를 기다리는 중입니다','시세가 도착하면 분석을 시작합니다.');return;}
  const d=(q.prev)?(q.price-q.prev)/q.prev*100:0;
  let pos=null;
  if(q.w52h!=null&&q.w52l!=null&&q.w52h>q.w52l)pos=(q.price-q.w52l)/(q.w52h-q.w52l)*100;
  const trend=d>=2?'강한 상승':d>=0.5?'상승':d<=-2?'강한 하락':d<=-0.5?'하락':'보합';
  const zone=pos==null?null:pos>=80?'52주 고점 부근':pos>=55?'상단':pos>=45?'중간':pos>=20?'하단':'52주 저점 부근';
  const sess=usSession();
  const cs=usCandles||[];
  let ma20=null,vola=null;
  if(cs.length>=20){ let s=0; for(let i=cs.length-20;i<cs.length;i++)s+=cs[i].c; ma20=s/20;
    const rs=[]; for(let i=cs.length-20;i<cs.length-1;i++)rs.push((cs[i+1].c-cs[i].c)/cs[i].c*100);
    vola=Math.sqrt(rs.reduce((a,x)=>a+x*x,0)/rs.length); }
  el.innerHTML=`<div class="us-ai-h"><b>AI 종목 분석</b><span class="lv">LIVE</span></div>
    <div class="us-ai-grid">
      <div class="us-ai-c"><small>오늘 흐름</small><b class="${dirOf(d)}">${trend} ${pctS(d)}</b></div>
      <div class="us-ai-c"><small>52주 위치</small><b>${zone||'—'}${pos!=null?` (${pos.toFixed(0)}%)`:''}</b></div>
      <div class="us-ai-c"><small>20일 평균</small><b class="num">${ma20?'$'+USD2(ma20):'—'}</b></div>
      <div class="us-ai-c"><small>20일 변동성</small><b class="num">${vola?vola.toFixed(2)+'%':'—'}</b></div>
    </div>
    <div class="us-ai-txt">
      <p><b>${m.kr}</b>는 현재 <b class="${dirOf(d)}">${trend}</b> 흐름입니다${ma20?`, 주가는 20일 평균선 ${q.price>=ma20?'위':'아래'}에 있습니다`:''}.</p>
      ${zone?`<p>52주 범위에서 <b>${zone}</b>에 자리합니다. 고점 부근에서는 추격 매수 부담을, 저점 부근에서는 하락 지속 여부를 함께 살펴야 합니다.</p>`:''}
      ${vola?`<p>최근 20일 하루 변동성은 <b>${vola.toFixed(2)}%</b>입니다. ${vola>=3?'변동이 큰 편이라 분할 매수가 안전합니다.':vola>=1.5?'평이한 수준입니다.':'비교적 안정적입니다.'}</p>`:''}
      <p>미국 주식은 <b>상·하한가가 없어</b> 하루에도 큰 폭으로 움직일 수 있고, 원화 기준 손익은 <b>환율</b>에 함께 좌우됩니다. 현재 ${sess.label}입니다.</p>
    </div>
    <div class="us-sum-note">공개 시세를 규칙에 따라 요약한 참고 정보이며 투자 권유가 아닙니다.</div>`;
}
/* ③ 시세 — 일별 표 */
function renderUsSiseTab(el){
  const cs=usCandles;
  if(!cs||!cs.length){
    usEnsureCandles();      // [v4.60] 아직 없으면 지금 받는다(도착하면 자동으로 다시 그려진다)
    el.innerHTML=usNoData('일별 시세를 불러오는 중입니다','잠시만 기다려 주세요.');return;}
  /* [v4.57] 시세 표도 차트와 같은 봉 종류를 따른다 — 차트에서 주봉을 골랐는데
     시세 표만 일별이면 두 화면이 다른 이야기를 하게 된다. */
  usTF=(chartTf==='W'||chartTf==='M')?chartTf:'D';
  const agg=usAgg(cs,usTF);
  const rows=agg.slice(-30).reverse();
  const unit=usTF==='D'?'거래일':usTF==='W'?'주':'개월';
  el.innerHTML=`<div class="us-sec2">${usTF==='D'?'일별':usTF==='W'?'주별':'월별'} 시세 <small>최근 ${rows.length}${unit}</small></div>
    <div class="us-sise-h"><span>날짜</span><span>종가</span><span>등락</span><span>거래량</span></div>
    ${rows.map((c,i)=>{const pv=rows[i+1]?rows[i+1].c:null;const dd=pv!=null?c.c-pv:0;
      return `<div class="us-sise-r"><span class="num">${String(c.t).slice(4,6)}.${String(c.t).slice(6,8)}</span>
        <span class="num">$${USD2(c.c)}</span>
        <span class="num ${dirOf(dd)}">${pv!=null?pctS(dd/pv*100):'—'}</span>
        <span class="num">${c.v>=1e6?(c.v/1e6).toFixed(1)+'M':(c.v/1e3).toFixed(0)+'K'}</span></div>`;}).join('')}`;
}
/* ④ 뉴스 */
function renderUsNews(el){
  const m=usMeta[usSel]||{};
  el.innerHTML=`<div class="us-sec2">관련 뉴스</div>
    <div class="us-news-list">
      ${[['Yahoo Finance','https://finance.yahoo.com/quote/'+usSel],
         ['Google Finance','https://www.google.com/finance/quote/'+usSel+':'+({O:'NASDAQ',N:'NYSE',A:'NYSEAMERICAN'}[m.sfx]||'NASDAQ')],
         ['네이버 해외증시','https://m.stock.naver.com/worldstock/stock/'+(m.reu||usSel)],
         ['SEC 공시(EDGAR)','https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker='+usSel]
        ].map(([n,u])=>`<a class="us-news-a" href="${u}" target="_blank" rel="noopener">
          <b>${n}</b><span>${m.kr} (${usSel}) 소식 보기</span><i>↗</i></a>`).join('')}
    </div>
    <div class="us-sum-note">해외 종목 뉴스는 원문 매체에서 직접 확인하는 편이 정확합니다. 새 탭으로 열립니다.</div>`;
}
/* ⑤ 투자자별 — 미국은 기관 보유 공시 개념 */
function renderUsHolders(el){
  const m=usMeta[usSel]||{};
  el.innerHTML=`<div class="us-sec2">투자자 구성</div>
    <div class="us-note-box"><b>미국 시장은 국내와 공시 방식이 다릅니다</b>
      <p>한국거래소처럼 <b>일별 기관·외국인 순매수</b>를 공개하지 않습니다. 대신 기관투자자가 분기마다
      보유 현황을 <b>13F</b> 보고서로 제출하고, 임원·대주주 매매는 <b>Form 4</b>로 공시합니다.</p>
      <p>따라서 이 앱에서는 일별 수급 대신 아래 원문 공시로 연결합니다.</p></div>
    <div class="us-news-list">
      <a class="us-news-a" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${usSel}&type=13F" target="_blank" rel="noopener"><b>13F · 기관 보유</b><span>분기별 기관투자자 보유 현황</span><i>↗</i></a>
      <a class="us-news-a" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${usSel}&type=4" target="_blank" rel="noopener"><b>Form 4 · 내부자 거래</b><span>임원·대주주 매매 신고</span><i>↗</i></a>
      <a class="us-news-a" href="https://finance.yahoo.com/quote/${usSel}/holders" target="_blank" rel="noopener"><b>보유자 요약</b><span>기관·내부자 지분 비율</span><i>↗</i></a>
    </div>`;
}
/* ⑥ 컨센서스 */
function renderUsConsensus(el){
  const m=usMeta[usSel]||{}, q=usQ[usSel]||{};
  el.innerHTML=`<div class="us-sec2">애널리스트 컨센서스</div>
    <div class="us-note-box"><b>목표주가·투자의견은 유료 데이터입니다</b>
      <p>국내 종목은 증권사 리포트가 공개 집계되지만, 미국 종목의 컨센서스는 대부분 유료로 제공되어
      이 앱에서는 직접 표시하지 않습니다. 아래에서 무료 공개 범위로 확인할 수 있습니다.</p></div>
    <div class="us-stat-g">
      <div class="us-stat"><small>현재가</small><b class="num">$${USD2(q.price)}</b></div>
      <div class="us-stat"><small>52주 최고 대비</small><b class="num">${q.w52h&&q.price?((q.price-q.w52h)/q.w52h*100).toFixed(1)+'%':'—'}</b></div>
      <div class="us-stat"><small>52주 최저 대비</small><b class="num">${q.w52l&&q.price?'+'+((q.price-q.w52l)/q.w52l*100).toFixed(1)+'%':'—'}</b></div>
    </div>
    <div class="us-news-list">
      <a class="us-news-a" href="https://finance.yahoo.com/quote/${usSel}/analysis" target="_blank" rel="noopener"><b>애널리스트 전망</b><span>실적 추정·목표주가 요약</span><i>↗</i></a>
    </div>`;
}
/* ⑦ 재무 정보 */
function renderUsFinance(el){
  const m=usMeta[usSel]||{}, q=usQ[usSel]||{};
  const capS=q.cap==null?'—':(q.cap>=1e12?'$'+(q.cap/1e12).toFixed(2)+'T':q.cap>=1e9?'$'+(q.cap/1e9).toFixed(1)+'B':'$'+(q.cap/1e6).toFixed(0)+'M');
  const fx=usFx();
  el.innerHTML=`<div class="us-sec2">기업 규모</div>
    <div class="us-stat-g">
      <div class="us-stat"><small>시가총액</small><b class="num">${capS}</b></div>
      <div class="us-stat"><small>원화 환산</small><b class="num">${(q.cap&&fx)?KRW(Math.round(q.cap*fx/1e8))+'억원':'—'}</b></div>
      <div class="us-stat"><small>거래소</small><b>${{O:'NASDAQ',N:'NYSE',A:'AMEX'}[m.sfx]||'—'}</b></div>
      <div class="us-stat"><small>구분</small><b>${m.etf?'ETF':'개별 종목'}</b></div>
    </div>
    <div class="us-note-box"><b>상세 재무제표는 원문 공시가 정확합니다</b>
      <p>미국 상장사는 분기마다 <b>10-Q</b>, 연간 <b>10-K</b> 보고서를 SEC에 제출합니다.
      매출·영업이익·현금흐름을 원문에서 바로 확인할 수 있습니다.</p></div>
    <div class="us-news-list">
      <a class="us-news-a" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${usSel}&type=10-K" target="_blank" rel="noopener"><b>10-K · 연간 보고서</b><span>연간 실적·사업 현황</span><i>↗</i></a>
      <a class="us-news-a" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${usSel}&type=10-Q" target="_blank" rel="noopener"><b>10-Q · 분기 보고서</b><span>분기 실적</span><i>↗</i></a>
      <a class="us-news-a" href="https://finance.yahoo.com/quote/${usSel}/financials" target="_blank" rel="noopener"><b>재무 요약</b><span>손익·재무상태 표</span><i>↗</i></a>
    </div>`;
}
function renderUsTradeLive(){ if(currentView!=='ustrade')return;
  renderUsHead(); renderUsCta(); if(usInfoTab==='summary'||usInfoTab==='ai')renderUsInfo();
  const pxIn=$('usPxIn'); if(pxIn&&document.activeElement!==pxIn&&usOrdPx==null)renderUsOrder();
  else updateUsSum();
}
function renderUsHead(){
  const m=usMeta[usSel],q=usQ[usSel]||byCode[usSel]||{};
  const ses=usSession();
  const d=(q.price!=null&&q.prev)?q.price-q.prev:null;
  $('usHead').innerHTML=`<div class="us-head-top">
    <div class="us-head-l">${usTick(usSel)}
      <div class="us-head-nm"><b>${m.kr}<span class="us-ex">${{O:'NASDAQ',N:'NYSE',A:'AMEX'}[m.sfx]}</span>${m.etf?'<span class="us-ex">ETF</span>':''}</b>
        <span>${usSel} · ${m.en}</span></div></div>
    <div class="us-head-px"><div class="p num ${dirOf(d||0)}">$${USD2(q.price)}</div>
      <div class="k num">${USDKR(q.price)}</div>
      <div class="d num ${dirOf(d||0)}">${d==null?'—':(d>=0?'+':'')+USD2(d)+' ('+usRateTxt(q)+')'}</div></div></div>
  <div class="us-sess-line ${ses.phase==='regular'?'on':ses.phase==='closed'?'':'ext'}"><i class="us-sess-dot"></i>
    ${ses.label}${ses.phase==='closed'?' · 다음 개장 '+ses.next+' (한국시간)':' · 정규장 '+ses.kst.open+'~'+ses.kst.close+' KST'+(ses.dst?' · 서머타임':'')}
    ${q.at?` · <span class="num">${new Date(q.at).toTimeString().slice(0,5)} 수신</span>`:''}</div>`;
}
/* [v4.37] renderUsStats / renderUsSise 는 종목요약·시세 탭으로 대체되어 제거했습니다 */
/* [v4.57] 해외 전용 차트(loadUsCandles·drawUsChart)는 걷어냈다 —
   국내 차트 카드를 그대로 옮겨 쓰므로 별도 구현이 필요 없고,
   두 벌을 유지하면 한쪽만 고쳐져 다시 어긋난다. */
var US_FEE_BASE=0.0025, US_SEC_FEE=0.0000278;
function US_FEE_OF(){return US_FEE_BASE*acctFeeUs();}
var US_FEE=US_FEE_BASE;   // SEC Fee: 매도금액의 0.00278% (미국 증권거래위원회)
var fmtQty=(q)=>{const n=+q||0;return Number.isInteger(n)?KRW(n):n.toFixed(2);};
/* [v4.29] 주문 원가 — 수수료·SEC 는 달러로 계산하고, 결제수단에 따라 지갑을 고른다.
   pay='usd' : 달러 예수금에서 그대로 차감(직접환전 방식 — 추가 환전 비용 없음)
   pay='krw' : 원화 자동환전(통합증거금) — 환전 스프레드가 포함된 매수환율 적용 */
function usOrderCost(side,px,qty,pay){
  const amountUsd=+(px*qty).toFixed(2);
  const feeUsd=+(amountUsd*US_FEE_OF()).toFixed(2);
  const secUsd=side==='sell'?+(amountUsd*US_SEC_FEE).toFixed(2):0;
  const netUsd=side==='buy'?+(amountUsd+feeUsd).toFixed(2):+(amountUsd-feeUsd-secUsd).toFixed(2);
  const fx=usFx()||0, fxBuy=usFxBuy()||0;
  const krwCost=pay==='krw'?Math.ceil(netUsd*fxBuy):null;         // 원화주문 결제액
  return {amountUsd,feeUsd,secUsd,netUsd,fx,fxBuy,krwCost,
          amount:Math.round(amountUsd*fx),fee:Math.round((feeUsd+secUsd)*fx)};   // 원화 표시·일지용
}
function usAutoPay(px,qty){                                        // 자동: 달러가 충분하면 달러
  const need=+(px*qty*(1+US_FEE_OF())).toFixed(2);
  return usdCash>=need?'usd':'krw';
}
function usMaxQty(px,pay){
  if(!(px>0))return 0;
  if(pay==='usd')return Math.max(0,Math.floor(usdCash/(px*(1+US_FEE_OF()))*100)/100);
  const f=usFxBuy(); if(!f)return 0;
  return Math.max(0,Math.floor(cash/(px*f*(1+US_FEE_OF()))*100)/100);
}
var usPay='auto';
/* 하단 탭바는 화면 폭·글꼴·기기 안전영역에 따라 높이가 달라진다. 숫자로 박아 두면
   어떤 기기에서는 주문바가 탭바에 먹히고 어떤 기기에서는 뜬다 — 실제 높이를 재서 넘긴다. */
function usSyncTabbarH(){
  try{
    const tb=document.querySelector('.tabbar');
    const on=tb&&getComputedStyle(tb).display!=='none';
    const h=on?Math.round(tb.getBoundingClientRect().height):0;
    document.documentElement.style.setProperty('--tabbar-h',h+'px');
    /* 탭바가 이미 안전영역을 흡수했으면 주문바는 더 띄우지 않는다(이중 여백 방지) */
    document.documentElement.style.setProperty('--cta-safe',on?'0px':'env(safe-area-inset-bottom)');
  }catch(e){}
}
try{ window.addEventListener('resize',()=>{ if(currentView==='ustrade')usSyncTabbarH(); },{passive:true});
     window.addEventListener('orientationchange',()=>setTimeout(usSyncTabbarH,220)); }catch(e){}
/* ══ [v4.50] 하단 고정 주문바 ══════════════════════════════════════════════
   좁은 화면에서 주문 카드는 '종목요약·AI·차트·시세·뉴스·투자자별·컨센서스·재무'
   여덟 탭 아래에 놓인다. 사고 싶을 때마다 화면 끝까지 내려야 했고, 현재가도
   같이 사라져 얼마에 사는지 모르는 채 스크롤하게 됐다.
   → 현재가를 붙인 고정 바를 깔고, 누르면 주문 카드로 데려가며 매수/매도까지 맞춰 둔다. */
function renderUsCta(){
  const bar=$('usCta'); if(!bar)return;
  if(currentView!=='ustrade'||!usSel){bar.hidden=true;return;}
  usSyncTabbarH();
  const q=usQ[usSel]||{};
  bar.hidden=false;
  const px=$('usCtaPx'), rt=$('usCtaRt');
  if(px)px.textContent=q.price!=null?'$'+USD2(q.price):'—';
  if(rt){rt.textContent=q.price!=null?usRateTxt(q):'시세 대기';
    rt.className='num '+(q.price!=null?usRateCls(q):'');}
  bar.querySelectorAll('.uz-cta-b').forEach(b=>b.classList.remove('on'));
  const on=bar.querySelector(usSide==='sell'?'.sell':'.buy'); if(on)on.classList.add('on');
}
function usCtaGo(side){
  usSide=side; renderUsOrder(); renderUsCta();
  const card=$('usOrder');
  if(card)try{card.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){card.scrollIntoView();}
}
function renderUsOrder(){
  const q=usQ[usSel]||{},fx=usFx();
  if(usOrdPx==null&&q.price!=null)usOrdPx=+q.price.toFixed(2);
  const px=usOrdPx!=null?usOrdPx:0;
  const held=holdings.find(h=>h.code===usSel&&h.us);
  const pay=usPay==='auto'?usAutoPay(px,usOrdQty||0):usPay;
  const maxQ=usSide==='buy'?usMaxQty(px,pay):(held?held.qty:0);
  /* 보유 정보 + 손익 분해(주가/환율) — 환차손 개념을 눈으로 배운다 */
  let heldBox='';
  if(held&&fx){
    const fxA=held.fxAvg||fx;
    const cur=(q.price!=null?q.price:held.avg);
    const pxPnl=Math.round((cur-held.avg)*held.qty*fxA);          // 주가 손익(매입환율 기준)
    const fxPnl=Math.round(cur*held.qty*(fx-fxA));                 // 환 손익
    const tot=pxPnl+fxPnl;
    heldBox=`<div class="tg tg-free" style="margin-bottom:12px;flex-direction:column;align-items:stretch;gap:5px">
      <span><b>보유 ${fmtQty(held.qty)}주</b> · 평단 $${USD2(held.avg)} · 매입환율 ${KRW(Math.round(fxA))}원</span>
      <span style="font-size:11.5px">주가손익 <b class="num ${dirOf(pxPnl)}">${signed(pxPnl)}</b> · 환손익 <b class="num ${dirOf(fxPnl)}">${signed(fxPnl)}</b> · 합계 <b class="num ${dirOf(tot)}">${signed(tot)}원</b></span></div>`;
  }
  $('usOrder').innerHTML=`
    ${ordAcctHTML('usOrdAcctSel')}
    <div class="us-ord-t"><button class="buy ${usSide==='buy'?'on':''}" data-usside="buy">매수</button>
      <button class="sell ${usSide==='sell'?'on':''}" data-usside="sell">매도</button></div>
    ${heldBox}
    ${usSide==='buy'?`<div class="us-fld"><label><span>결제수단</span></label>
      <div class="us-chips" style="margin:0">
        <button class="us-chip ${pay==='usd'?'on':''}" data-uspay="usd">💵 달러 예수금 $${USD2(usdCash)}</button>
        <button class="us-chip ${pay==='krw'?'on':''}" data-uspay="krw">💱 원화 자동환전</button></div>
      <div class="us-ord-note" style="margin-top:5px">${pay==='usd'
        ?'미리 환전해 둔 달러로 결제합니다 — 추가 환전 비용이 없습니다'
        :'원화 예수금에서 매수환율(우대 95% · +'+usFxMargin().toFixed(1)+'원)로 자동 환전됩니다'}</div></div>`
    :`<div class="us-ord-note" style="margin-bottom:10px">매도 대금은 <b>달러 예수금</b>으로 들어오며, 즉시 재매수할 수 있습니다. 원화 환전은 <b>다음 영업일(T+1)</b>부터 가능해요.</div>`}
    <div class="us-fld"><label><span>주문가격 (USD)</span><span class="num">현재가 $${USD2(q.price)}</span></label>
      <div class="us-inrow"><button id="usPxDn">−</button><input id="usPxIn" inputmode="decimal" value="${px?px.toFixed(2):''}"><button id="usPxUp">＋</button></div></div>
    <div class="us-fld"><label><span>주문수량 <small style="font-weight:600;color:var(--sub-2)">0.01주 단위</small></span><span class="num">가능 ${fmtQty(maxQ)}주</span></label>
      <div class="us-inrow"><button id="usQtyDn">−</button><input id="usQtyIn" inputmode="decimal" value="${usOrdQty}"><button id="usQtyUp">＋</button></div></div>
    <div class="us-qbtns">${[10,25,50,100].map(p=>`<button data-uspct="${p}">${p===100?'최대':p+'%'}</button>`).join('')}</div>
    <div id="usSum"></div>
    <div class="us-pass us-fld" id="usPassWrap" hidden><label><span>계좌 비밀번호</span></label>
      <div class="us-inrow"><input id="usPassIn" type="password" inputmode="numeric" maxlength="4" placeholder="4자리" style="text-align:center"></div></div>
    <button class="us-submit ${usSide}" id="usSubmit">${fx?(usSide==='buy'?'매수 주문':'매도 주문'):'환율 확인 중 · 눌러서 다시 시도'}</button>
    <div class="us-ord-note">※ 수수료 ${(US_FEE*100).toFixed(2)}%${usSide==='sell'?' + SEC Fee '+(US_SEC_FEE*100).toFixed(4)+'%':''} · 거래세 없음 · 소수점(0.01주) 매매 지원<br>
    ※ 모의 체결 — 실제 브로커의 원화주문은 가환율로 결제 후 익일 정산되지만, 여기서는 정식 환율을 즉시 적용합니다.</div>`;
  updateUsSum(); wireUsOrder();
}
function updateUsSum(){
  const el=$('usSum'); if(!el)return;
  const px=parseFloat($('usPxIn')?$('usPxIn').value:usOrdPx)||0;
  const qty=Math.round((parseFloat($('usQtyIn')?$('usQtyIn').value:usOrdQty)||0)*100)/100;
  const pay=usSide==='buy'?(usPay==='auto'?usAutoPay(px,qty):usPay):'usd';
  const c=usOrderCost(usSide,px,qty,pay==='krw'?'krw':null);
  if(usSide==='buy'){
    el.innerHTML=`<div class="us-sum"><small>주문금액</small><b class="num">$${USD2(c.amountUsd)}</b></div>
      <div class="us-sum"><small>수수료</small><b class="num">$${USD2(c.feeUsd)}</b></div>
      ${pay==='usd'
        ?`<div class="us-sum"><small>달러 결제액</small><b class="num">$${USD2(c.netUsd)}</b></div>
          <div class="us-sum"><small>달러 예수금</small><b class="num">$${USD2(usdCash)}</b></div>`
        :`<div class="us-sum"><small>원화 결제액 <i style="font-style:normal">(환율 ${c.fxBuy?KRW(c.fxBuy):'—'})</i></small><b class="num">${c.krwCost!=null?KRW(c.krwCost)+'원':'환율 대기'}</b></div>
          <div class="us-sum"><small>원화 예수금</small><b class="num">${KRW(cash)}원</b></div>`}`;
  }else{
    el.innerHTML=`<div class="us-sum"><small>매도금액</small><b class="num">$${USD2(c.amountUsd)}</b></div>
      <div class="us-sum"><small>수수료 + SEC</small><b class="num">$${USD2(c.feeUsd+c.secUsd)}</b></div>
      <div class="us-sum"><small>수령액 (달러 예수금)</small><b class="num">$${USD2(c.netUsd)}</b></div>
      <div class="us-sum"><small>원화 환산</small><b class="num">${c.fx?'≈ '+KRW(Math.round(c.netUsd*c.fx))+'원':'—'}</b></div>`;
  }
}
function wireUsOrder(){
  document.querySelectorAll('[data-usside]').forEach(b=>b.onclick=()=>{usSide=b.dataset.usside;renderUsOrder();renderUsCta();});
  wireOrdAcct('usOrdAcctSel',()=>{ renderUsOrder(); try{renderUsHead();}catch(e){} });   // [v4.56]
  document.querySelectorAll('[data-uspay]').forEach(b=>b.onclick=()=>{usPay=b.dataset.uspay;renderUsOrder();});
  const pxIn=$('usPxIn'),qIn=$('usQtyIn');
  const step=(d)=>{const v=Math.max(0.01,(parseFloat(pxIn.value)||0)+d*0.01);pxIn.value=v.toFixed(2);usOrdPx=v;updateUsSum();};
  $('usPxUp').onclick=()=>step(1); $('usPxDn').onclick=()=>step(-1);
  pxIn.oninput=()=>{usOrdPx=parseFloat(pxIn.value)||null;updateUsSum();};
  pxIn.onblur=()=>{if(usOrdPx!=null){usOrdPx=+usOrdPx.toFixed(2);pxIn.value=usOrdPx.toFixed(2);updateUsSum();}};
  /* [v4.29] 수량 0.01주 단위 — ± 버튼은 정수 1주씩, 직접 입력으로 소수점 */
  const qstep=(d)=>{const v=Math.max(0.01,Math.round(((parseFloat(qIn.value)||0)+d)*100)/100);qIn.value=v;usOrdQty=v;updateUsSum();};
  $('usQtyUp').onclick=()=>qstep(1); $('usQtyDn').onclick=()=>qstep(-1);
  qIn.oninput=()=>{usOrdQty=Math.max(0,Math.round((parseFloat(qIn.value)||0)*100)/100);updateUsSum();};
  qIn.onblur=()=>{if(usOrdQty>0)qIn.value=usOrdQty;};
  document.querySelectorAll('[data-uspct]').forEach(b=>b.onclick=()=>{
    const p=+b.dataset.uspct,px=parseFloat(pxIn.value)||0;
    const held=holdings.find(h=>h.code===usSel&&h.us);
    const pay=usSide==='buy'?(usPay==='auto'?usAutoPay(px,1):usPay):'usd';
    const base=usSide==='buy'?usMaxQty(px,pay):(held?held.qty:0);
    usOrdQty=Math.max(0,Math.floor(base*p)/100); qIn.value=usOrdQty; updateUsSum();});
  $('usSubmit').onclick=()=>{
    if(!usFx()){ toast('warn','환율을 받는 중입니다','잠시 후 다시 눌러 주세요');
      usEnsureQuotes([usSel],true).then(()=>renderUsOrder()); return; }
    const wrap=$('usPassWrap');
    if(wrap.hidden){wrap.hidden=false;$('usPassIn').focus();return;}
    const pw=$('usPassIn').value;
    const AP=acctPwOf();
    if(hash(pw)!==AP&&legacyHash(pw)!==AP){
      toast('warn','비밀번호 오류','계좌 비밀번호 4자리를 확인하세요');return;}
    usExecuteOrder(usSide,{price:parseFloat(pxIn.value)||0,qty:Math.round((parseFloat(qIn.value)||0)*100)/100});
  };
}
function usExecuteOrder(side,o){
  const m=usMeta[usSel]; if(!m)return false;
  if(!acctRequire('해외 주문'))return false;            // [v4.40]
  const px=Math.round((+o.price||0)*100)/100, qty=Math.round((+o.qty||0)*100)/100;
  if(!(px>0)||!(qty>=0.01)){toast('warn','주문 실패','가격과 수량(0.01주 이상)을 확인하세요');return false;}
  const fx=usFx();
  if(!fx){toast('warn','주문 불가','환율을 아직 받지 못했습니다. 잠시 후 다시 시도하세요');return false;}
  try{ if(userPrefs&&userPrefs.realGate!==false){
    const ses=usSession();
    if(ses.phase==='closed'){toast('warn','미국 증시 휴장','다음 개장 '+ses.next+' (한국시간) · 설정에서 장 시간 제한을 끄면 언제든 모의 주문할 수 있어요');return false;}
  }}catch(e){}
  if(side==='buy'){
    const pay=usPay==='auto'?usAutoPay(px,qty):usPay;
    const c=usOrderCost('buy',px,qty,pay==='krw'?'krw':null);
    let fxPaid;                                                       // 이번 매수의 매입환율
    if(pay==='usd'){
      if(c.netUsd>usdCash){toast('warn','달러 예수금 부족',
        `필요 $${USD2(c.netUsd)} · 보유 $${USD2(usdCash)} — 환전하거나 원화 자동환전으로 바꿔 주세요`);return false;}
      usdCash=+(usdCash-c.netUsd).toFixed(2); fxPaid=fx;              // 이미 환전된 달러 — 현재환율로 근사 기록
    }else{
      if(c.krwCost>cash){toast('warn','예수금 부족',
        `필요 ${KRW(c.krwCost)}원 · 보유 ${KRW(cash)}원 · ${KRW(c.krwCost-cash)}원 모자랍니다`);return false;}
      cash=intOf(cash-c.krwCost,0); fxPaid=c.fxBuy;
    }
    const h=holdings.find(x=>x.code===usSel&&x.us);
    if(h){
      const fa=h.fxAvg||fxPaid;
      h.fxAvg=+(((fa*h.avg*h.qty)+(fxPaid*px*qty))/((h.avg*h.qty)+(px*qty))).toFixed(2);   // 금액 가중 매입환율
      h.avg=+(((h.avg*h.qty)+px*qty)/(h.qty+qty)).toFixed(4);
      h.qty=+(h.qty+qty).toFixed(4);
    }else holdings.push({code:usSel,qty,avg:px,us:1,fxAvg:+fxPaid.toFixed(2)});
    tradeLog.unshift({ts:Date.now(),date:kstDay(),code:usSel,name:m.kr,side:'buy',qty,price:px,
      amount:c.amount,fee:Math.round(c.feeUsd*fx),tax:0,avg:px,pnl:0,roi:0,us:1,pay,fxAt:Math.round(fxPaid)});
    toast('buy',m.kr+' 매수 체결(모의)',
      `${fmtQty(qty)}주 · $${USD2(px)} · ${pay==='usd'?'달러 결제 $'+USD2(c.netUsd)+' · 달러잔고 $'+USD2(usdCash):'원화 결제 '+KRW(c.krwCost)+'원 · 잔고 '+KRW(cash)+'원'}`);
  }else{
    const h=holdings.find(x=>x.code===usSel&&x.us);
    if(!h||h.qty<qty-1e-9){toast('warn','보유수량 부족',`보유 ${h?fmtQty(h.qty):0}주`);return false;}
    const c=usOrderCost('sell',px,qty,null);
    /* 매도 대금은 달러로 입금 + T+1 정산 예약 (재매수는 즉시 가능, 환전은 정산 후) */
    usdCash=+(usdCash+c.netUsd).toFixed(2);
    usdSettling.push({amt:c.netUsd,settle:usNextBiz(kstDay())});
    const fxA=h.fxAvg||fx;
    const pnl=Math.round((px-h.avg)*qty*fxA + px*qty*(fx-fxA) - (c.feeUsd+c.secUsd)*fx);   // 주가+환손익-비용
    const roi=h.avg?((px-h.avg)/h.avg*100):0;
    tradeLog.unshift({ts:Date.now(),date:kstDay(),code:usSel,name:m.kr,side:'sell',qty,price:px,
      amount:c.amount,fee:Math.round((c.feeUsd+c.secUsd)*fx),tax:0,avg:h.avg,pnl,roi,us:1,
      usdIn:c.netUsd,secUsd:c.secUsd,fxAt:Math.round(fx)});
    h.qty=+(h.qty-qty).toFixed(4); if(h.qty<=1e-9)holdings=holdings.filter(x=>x!==h);
    toast(pnl>=0?'buy':'sell',m.kr+' 매도 체결(모의)',
      `${fmtQty(qty)}주 · $${USD2(px)} · 수령 $${USD2(c.netUsd)} (T+1 정산) · 실현손익 ${signed(pnl)}원`);
  }
  try{sanitizeAccount(true);}catch(e){}
  saveState();
  try{renderPortfolioNumbers();}catch(e){}
  $('usPassWrap').hidden=true; $('usPassIn').value='';
  renderUsOrder(); renderUsMineSafe();
  return true;
}
function renderUsMineSafe(){try{if(currentView==='us')renderUsMine();}catch(e){}}

/* ══ [v4.33] 모든 선언이 끝난 뒤에 부팅한다 — 순서 문제를 구조적으로 없앤다 ══ */
try{ __bootMain(); }
catch(e){ try{ reportErr('boot',e); }catch(_){ }
  try{ window.__boot&&__boot.done(); }catch(_){ }   // 오류가 나도 입장화면은 반드시 걷는다
}
