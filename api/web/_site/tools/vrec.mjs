import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import fs from 'fs'; import path from 'path';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['dm','social','leads','seo','inbox','money','watch','hiring'];
const ROOT = 'C:/Users/osman/OneDrive/Desktop/web building bz/sections/capabilities/';
const TMP = 'C:/Users/osman/AppData/Local/Temp/claude/c--Users-osman-OneDrive-Desktop-web-building-bz/7e41f36f-56fe-4629-a2b0-e59b32b01ab9/scratchpad/rec/';
fs.mkdirSync(TMP,{recursive:true});
const b = await chromium.launch();
const sizes = {};
for (const id of ids) {
  const ctx = await b.newContext({ viewport:{width:1280,height:720}, recordVideo:{dir:TMP+id, size:{width:1280,height:720}}, reducedMotion:'no-preference' });
  const p = await ctx.newPage();
  await p.goto('file:///'+ROOT.replace(/ /g,'%20')+'video-src/'+id+'.html#rec');
  await p.waitForFunction(()=>window.__ready);
  await p.waitForTimeout(600);
  await p.evaluate(()=>window.startLoop());
  await p.waitForTimeout(19500);
  const v = p.video(); await ctx.close(); const src = await v.path();
  fs.writeFileSync(TMP+id+'.src',src);
}
await b.close();
