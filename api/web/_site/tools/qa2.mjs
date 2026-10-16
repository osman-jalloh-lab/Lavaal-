import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='C:/Users/osman/OneDrive/Desktop/web building bz';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'};
const srv=http.createServer((q,s)=>{let f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!path.extname(f))f=path.join(f,'index.html');fs.readFile(f,(e,b)=>{if(e){s.statusCode=404;return s.end();}s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(b);});}).listen(5180);
const b=await chromium.launch();
async function open(w,h){const c=await b.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'});const p=await c.newPage();await p.goto('http://localhost:5180/',{waitUntil:'networkidle'});await p.waitForTimeout(500);return p;}
let p=await open(1440,900);
await p.screenshot({path:'../qa/hero-1440.png'});
await p.locator('.morph').scrollIntoViewIfNeeded();await p.locator('.seg button[data-state="phone"]').click();await p.waitForTimeout(900);
await p.locator('.morph').screenshot({path:'../qa/morph-phone-1440.png'});
await p.locator('.seg button[data-state="tablet"]').click();await p.waitForTimeout(900);
await p.locator('.morph').screenshot({path:'../qa/morph-tablet-1440.png'});
await p.locator('#contact').screenshot({path:'../qa/contact-1440.png'});
// form behaviour
await p.fill('input[name=name]','');await p.click('#web-inquiry button[type=submit]');console.log('empty submit ->',await p.textContent('#form-status'));
await p.fill('input[name=name]','Test');await p.fill('input[name=contact]','t@example.com');await p.click('#web-inquiry button[type=submit]');console.log('filled submit ->',await p.textContent('#form-status'));
console.log('wa hidden:',await p.locator('#wa').isHidden());
p=await open(390,844);
await p.screenshot({path:'../qa/hero-390.png'});
await p.locator('#contact').screenshot({path:'../qa/contact-390.png'});
await b.close();srv.close();
