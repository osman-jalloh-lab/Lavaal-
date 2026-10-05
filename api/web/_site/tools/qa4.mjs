import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='C:/Users/osman/OneDrive/Desktop/web building bz';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4','.webm':'video/webm'};
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!path.extname(f))f=path.join(f,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5182);
const b=await chromium.launch();
for (const [w,h] of [[1440,900],[1024,768],[390,844]]) {
 const c=await b.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'});const p=await c.newPage();
 await p.goto('http://localhost:5182/',{waitUntil:'networkidle'});
 await p.evaluate(()=>document.querySelector('.nav').style.display='none');
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
 await p.locator('.cp-group').first().screenshot({path:`../qa/cap-group-${w}.png`});
 console.log(w,'overflow',ov);await c.close();}
await b.close();srv.close();
