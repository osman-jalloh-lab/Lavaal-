import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='C:/Users/osman/OneDrive/Desktop/profolio/dist';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.mp4':'video/mp4'};
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!path.extname(f))f=path.join(root,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5178);
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
p.on('pageerror',e=>console.log('err',e.message));
await p.goto('http://localhost:5178/',{waitUntil:'load'});await p.waitForTimeout(4000);
await p.screenshot({path:'../assets/work/portfolio.jpg',type:'jpeg',quality:80});await b.close();srv.close();
