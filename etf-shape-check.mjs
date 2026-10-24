import fs from 'node:fs'; import vm from 'node:vm';
const w=fs.readFileSync(new URL('./_worker.js', import.meta.url),'utf8');
const a=w.indexOf('function normalizeEtfCode(v) {'), b=w.indexOf('\n/* [v17.8.2] 보조 구성종목 공급원.',a);
const ctx={console,Date,Math,Number,String,Object,Array,Set,Promise,JSON};
ctx.NAME_KEYS=['stockName','itemName','name','componentName','itemNm'];
ctx.WEIGHT_KEYS=['weight','ratio','componentRatio'];
ctx.CODE_KEYS=['itemCode','stockCode','code'];
ctx.num3=(v)=>{if(v==null||v==='')return null;let x=v;for(let i=0;i<3&&x&&typeof x==='object';i++){let n=null;for(const k of ['raw','value'])if(x[k]!=null&&typeof x[k]!=='object'){n=x[k];break;}if(n===null)return null;x=n;}const n=Number(String(x).replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;};
ctx.pick=(o,k)=>{for(const x of k)if(o&&o[x]!=null&&o[x]!=='')return o[x];return null;};
ctx.looksLikeName=(v)=>{const t=String(v||'').trim();return !!t&&t.length<=40&&/[가-힣A-Za-z]/.test(t);};
vm.createContext(ctx); vm.runInContext(w.slice(a,b),ctx);
const mk=(extra)=>Array.from({length:20},(_,i)=>({itemCode:'091160',componentIsinCode:'KR70000'+String(i).padStart(5,'0'),componentItemCode:String(100000+i),componentReutersCode:'x'+i,trusteeCompanyName:'KB',...extra(i)}));
const cases={
 A:mk(i=>({itemName:'KODEX 반도체',componentName:'종목'+i,componentWeight:(20-i)*0.9})),
 B:mk(i=>({itemName:'KODEX 반도체',stockNm:'종목'+i,evalRate:(20-i)*0.9,evalAmount:123456+i})),
 C:mk(i=>({etfName:'KODEX 반도체',holdingKorName:'종목'+i,compositionValuePercent:String((20-i)*0.9)+'%'})),
};
for(const [k,v] of Object.entries(cases)){const r=ctx.findNaverComponentArrays({result:{totalCount:22,items:v}});console.log(k,r.length&&r[0].rows.length,JSON.stringify(r[0]&&r[0].rows[0]));}
