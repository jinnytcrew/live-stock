import http from 'node:http';
const srv=http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end('<html><body>t</body></html>');});
await new Promise(r=>srv.listen(8500,'127.0.0.1',r));
const {chromium}=await import('playwright');
for(const mode of ['headless','new']){
  let br;
  try{
    br=await chromium.launch(mode==='new'?{channel:'chromium'}:{});
    const ctx=await br.newContext();
    await ctx.grantPermissions(['notifications'],{origin:'http://127.0.0.1:8500'});
    const pg=await ctx.newPage();
    await pg.goto('http://127.0.0.1:8500/');
    const p=await pg.evaluate(()=>({perm:Notification.permission, has:('Notification' in window)}));
    console.log(mode,JSON.stringify(p));
    await br.close();
  }catch(e){ console.log(mode,'ERR',e.message.slice(0,120)); try{await br.close();}catch(_){} }
}
srv.close();
