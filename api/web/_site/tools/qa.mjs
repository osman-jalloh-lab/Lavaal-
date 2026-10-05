import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='C:/Users/osman/OneDrive/Desktop/web building bz';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!path.extname(f))f=path.join(f,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5179);
const b=await chromium.launch();
fs.mkdirSync('../qa',{recursive:true});
for (const [w,h] of [[1440,900],[1024,768],[390,844]]) {
  const c=await b.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'});
  const p=await c.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('http://localhost:5179/',{waitUntil:'networkidle'});
  await p.waitForTimeout(800);
  const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,h:document.documentElement.scrollHeight}));
  await p.screenshot({path:`../qa/full-${w}.png`,fullPage:true});
  console.log(w,JSON.stringify(ov),'overflow:',ov.sw>ov.cw,'errors:',errs.length?errs:'none');
  await c.close();
}
await b.close();srv.close();
