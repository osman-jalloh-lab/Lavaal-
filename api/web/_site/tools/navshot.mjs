import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 500 } });
await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(600);
await p.screenshot({ path: '../qa/a11y-nav-390.png' });
await b.close();
