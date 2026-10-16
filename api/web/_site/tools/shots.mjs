import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const D='C:/Users/osman/OneDrive/Desktop/';
const roots={lav:D+'new lavaall/Lavaal--main',star:D+'startlink/v4',port:D+'profolio/dist'};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.mp4':'video/mp4','.woff2':'font/woff2'};
const srv=http.createServer((q,s)=>{const [k,...r]=decodeURIComponent(q.url.split('?')[0]).split('/').filter(Boolean);const root=roots[k];if(!root){s.statusCode=404;return s.end();}let f=path.join(root,...r);if(!path.extname(f))f=path.join(f,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5177);
const b=await chromium.launch();
async function shot(url,out,w,h,wait=2500){const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});const p=await c.newPage();try{await p.goto(url,{waitUntil:'load',timeout:30000});}catch(e){console.log('goto',url,e.message)}await p.waitForTimeout(wait);await p.screenshot({path:'../assets/work/'+out,type:'jpeg',quality:80});console.log('ok',out,p.url());await c.close();}
await shot('http://localhost:5177/lav/','lavaall-desktop.jpg',1440,900);
await shot('http://localhost:5177/lav/','lavaall-tablet.jpg',820,1100);
await shot('http://localhost:5177/lav/','lavaall-phone.jpg',390,844);
await shot('http://localhost:5177/star/','starlink.jpg',1440,900,4000);
await shot('http://localhost:5177/port/','portfolio.jpg',1440,900,3000);
await shot('https://parawi.com','hermes.jpg',1440,900,4000);
await b.close();srv.close();
