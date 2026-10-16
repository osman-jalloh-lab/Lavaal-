import { chromium } from 'playwright';
const [,, id, ...ts] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1280,height:720}});
const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///C:/Users/osman/OneDrive/Desktop/web%20building%20bz/sections/capabilities/video-src/'+id+'.html#rec');
await p.waitForFunction(()=>window.__ready);
await p.evaluate(()=>document.getElementById('sync').remove());
const scratch='C:/Users/osman/AppData/Local/Temp/claude/c--Users-osman-OneDrive-Desktop-web-building-bz/7e41f36f-56fe-4629-a2b0-e59b32b01ab9/scratchpad/';
for (const t of ts){ await p.evaluate(t=>window.seek(+t),t); await p.screenshot({path:scratch+id+'-'+t+'.png'}); }
console.log('errors',errs); await b.close();
