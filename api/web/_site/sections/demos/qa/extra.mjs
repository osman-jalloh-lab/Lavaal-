import { createRequire } from 'module';
const require = createRequire('C:/Users/osman/OneDrive/Desktop/web building bz/tools/package.json');
const { chromium } = require('playwright');
import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here,'test.html')).href;
const b = await chromium.launch();
for (const w of [1440,390]) {
  const ctx = await b.newContext({viewport:{width:w,height:900}}); const page = await ctx.newPage();
  const errs=[]; page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await page.goto(url); await page.locator('#demos').scrollIntoViewIfNeeded();
  await page.locator('.dm-tabs button[data-demo="checkup"]').focus(); await page.keyboard.press('Space');
  await page.waitForTimeout(1300*2+500*2+400);
  await page.locator('#dm-p-checkup .dm-flow').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(here,`x-${w}-checkup-mid.png`)});
  await page.waitForTimeout(1300*2+500*2);
  console.log(w,'checkup complete',await page.locator('#dm-p-checkup').evaluate(e=>e.hasAttribute('data-complete')),errs);
  await page.locator('#dm-p-checkup .dm-flow').screenshot({path:path.join(here,`x-${w}-checkup-done.png`)});
  // pause offscreen: scroll away then check no progression
  await page.locator('.dm-replay:visible').click(); await page.waitForTimeout(600);
  await page.evaluate(()=>window.scrollTo(0,0)); await page.evaluate(()=>{const s=document.createElement('div');s.style.height='3000px';document.querySelector('main').prepend(s);window.scrollTo(0,3000)});
  await page.waitForTimeout(4000);
  const st = await page.locator('#dm-p-checkup .dm-node').evaluateAll(n=>n.map(x=>x.dataset.state));
  console.log(w,'after offscreen 4s',st.join(','));
  await ctx.close();
}
await b.close();
