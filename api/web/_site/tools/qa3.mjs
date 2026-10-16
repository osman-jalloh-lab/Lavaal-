import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='C:/Users/osman/OneDrive/Desktop/web building bz';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm'};
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!path.extname(f))f=path.join(f,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5181);
const b=await chromium.launch();
for (const rm of ['no-preference','reduce']) for (const [w,h] of [[1440,900],[1024,768],[390,844]]) {
  const c=await b.newContext({viewport:{width:w,height:h},reducedMotion:rm});
  const p=await c.newPage(); const errs=[]; let bytes=0; const bad=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  p.on('response',async r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());try{const l=r.headers()['content-length'];if(l)bytes+=+l}catch{}});
  await p.goto('http://localhost:5181/',{waitUntil:'networkidle'});
  const first=bytes;
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,60));}window.scrollTo(0,0)});
  await p.waitForTimeout(600);
  const ov=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,h:document.documentElement.scrollHeight}));
  console.log(rm,w,'overflow:',ov.sw>ov.cw,'height',ov.h,'initialKB',Math.round(first/1024),'errors:',errs.length?errs:'none','bad:',bad.length?bad:'none');
  if(rm==='reduce'){for(const id of ['demos','capabilities','os']){await p.locator('#'+id).screenshot({path:`../qa/merged-${id}-${w}.png`});}}
  await c.close();
}
await b.close();srv.close();
