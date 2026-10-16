import { srv } from './serve.mjs';
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:8080/showcase/terra/', { waitUntil: 'load' });
await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.getElementById('menu').offsetTop + 60); });
await p.waitForTimeout(1500);
await p.screenshot({ path: '../qa/terra-menu-1280.png', timeout: 180000 });
await b.close(); srv.close(); console.log('ok');
