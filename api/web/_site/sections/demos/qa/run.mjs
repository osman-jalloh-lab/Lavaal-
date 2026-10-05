import { createRequire } from 'module';
const require = createRequire('C:/Users/osman/OneDrive/Desktop/web building bz/tools/package.json');
const { chromium } = require('playwright');
import path from 'path'; import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url'; const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here,'test.html')).href;
const out = [];
const log = (...a)=>{ console.log(...a); };
const browser = await chromium.launch();
for (const motion of ['no-preference','reduce']) {
  for (const w of [1440,1024,390]) {
    const ctx = await browser.newContext({ viewport:{width:w,height:900}, reducedMotion: motion });
    const page = await ctx.newPage();
    const errs=[]; page.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); }); page.on('pageerror',e=>errs.push(String(e)));
    await page.goto(url); await page.waitForTimeout(300);
    const tag = `${motion==='reduce'?'rm':'mo'}-${w}`;
    const sec = page.locator('#demos');
    await sec.scrollIntoViewIfNeeded();
    if (motion==='reduce') {
      await page.screenshot({path:path.join(here,`${tag}-poster-static.png`),fullPage:false});
    } else {
      await page.waitForTimeout(1300+500+1300+500+400); // reach approve
      const st = await page.locator('#dm-p-poster .dm-node').evaluateAll(n=>n.map(x=>x.dataset.state+':'+x.querySelector('.dm-stat').textContent));
      log(tag,'poster at approve',st.join(' | '));
      await page.screenshot({path:path.join(here,`${tag}-poster-approve.png`)});
    }
    // keyboard: focus Replay then approve via keyboard
    if (motion==='no-preference') {
      const btn = page.locator('#dm-p-poster .dm-approve');
      log(tag,'approve enabled', await btn.isEnabled());
      await btn.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(450+500+1300*0+300);
      await page.waitForTimeout(1400);
      log(tag,'poster complete', await page.locator('#dm-p-poster').evaluate(e=>e.hasAttribute('data-complete')));
      await page.screenshot({path:path.join(here,`${tag}-poster-done.png`)});
    }
    // tabs by keyboard
    await page.locator('.dm-tabs button').first().focus();
    for (const [i,name] of ['listings','replies','checkup'].entries()) {
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      const pressed = await page.locator(`.dm-tabs button[data-demo="${name}"]`).getAttribute('aria-pressed');
      const shown = await page.locator(`#dm-p-${name}`).isVisible();
      log(tag,name,'pressed',pressed,'visible',shown);
      if (motion==='no-preference') {
        if (name==='replies') { await page.waitForTimeout(1300+500+1300+500+400); await page.screenshot({path:path.join(here,`${tag}-replies-approve.png`)}); const b=page.locator('#dm-p-replies .dm-approve'); await b.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(450+500+1300+300); }
        else await page.waitForTimeout(1300*4+500*3+500);
        log(tag,name,'complete', await page.locator(`#dm-p-${name}`).evaluate(e=>e.hasAttribute('data-complete')));
      } else {
        // reduced: replay stepped instantly to approval
        if (name==='replies') {
          await page.locator('#dm-p-replies .dm-replay').click();
          const en = await page.locator('#dm-p-replies .dm-approve').isEnabled();
          await page.screenshot({path:path.join(here,`${tag}-replies-approve.png`)});
          await page.locator('#dm-p-replies .dm-approve').focus(); await page.keyboard.press('Enter');
          log(tag,'replies reduced approve enabled',en,'complete', await page.locator('#dm-p-replies').evaluate(e=>e.hasAttribute('data-complete')));
        }
      }
      await page.screenshot({path:path.join(here,`${tag}-${name}.png`)});
    }
    const ov = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log(tag,'overflow px',ov,'console errors',JSON.stringify(errs));
    await ctx.close();
  }
}
await browser.close();
