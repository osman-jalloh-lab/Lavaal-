// LAVAALL OS on a phone: the More tab, tap-then-open on Brain, and phone-sized controls.
// Pure and static checks; the touch behaviour itself was exercised in a touch-emulated browser.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

function loadOS() {
  const sandbox = {
    window: {},
    document: { querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => 'dark' } },
    location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, Intl,
  };
  vm.createContext(sandbox);
  ['core.js', 'brain-graph.js', 'brain.js'].forEach((f) => vm.runInContext(read('api/os/_client/' + f), sandbox, { filename: f }));
  return sandbox.window.OS;
}
const OS = loadOS();
const css = read('api/os/_client/os.css');
const core = read('api/os/_client/core.js');
const brain = read('api/os/_client/brain.js');
const { osPage } = require(path.join(root, 'api/os/_page.js'));

// ---- the phone tab bar ----------------------------------------------------------
const { TABS, MORE } = OS.mobile;
const ids = OS.nav.map((n) => n.id);
check('four primary tabs, then More', TABS.join() === 'home,desks,decisions,outreach');
check('More holds Notes, Brain, AI Council, Spend and Settings', ['notes', 'brain', 'council', 'spend', 'settings'].every((id) => MORE.includes(id)));
check('Routines moved into More so it stays reachable', MORE.includes('routines') && !TABS.includes('routines'));
check('every view is reachable on a phone, exactly once', ids.every((id) => TABS.concat(MORE).filter((x) => x === id).length === 1) && TABS.concat(MORE).length === ids.length);
check('tab bar renders a More button wired for assistive tech', ['id="tab-more"', 'aria-haspopup="dialog"', 'aria-expanded="false"', 'aria-controls="sheet"'].every((attr) => core.includes(attr)));
check('More is marked active when the current view lives in it', /MORE\.indexOf\(cur\) !== -1 \? ' on' : ''/.test(core));
check('the sheet closes on route change, Escape, scrim tap, second tap on More and widening past phone size', /closeMore\(\);\s*closeDrawer\(\)/.test(core) && /\$\('#sheet'\)\.classList\.contains\('on'\)\) \{ closeMore\(\)/.test(core) && /sheet-back/.test(core) && /if \(\$\('#sheet'\)\.classList\.contains\('on'\)\) closeMore\(\); else openMore\(\)/.test(core) && /innerWidth >= 760\) closeMore\(\)/.test(core));
check('sheet items are real links, so navigation needs no extra code', core.includes('class="sheet-i') && core.includes("href=\"#' + id") && !/sheet-i[^;]*data-go/.test(core));

const html = osPage({ email: 'founder@example.com', data: { kpis: {}, sources: {} } });
check('page has the sheet and tab bar containers', /id="tabbar"/.test(html) && /id="sheet"/.test(html) && /id="sheet-panel"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html));
check('viewport covers the notch', /viewport-fit=cover/.test(html));

// ---- CSS for phones ------------------------------------------------------------
const mediaStart = css.indexOf('@media(max-width:759px){');
const media = css.slice(mediaStart, css.indexOf('@media(prefers-reduced-motion'));
check('phone breakpoint is under 760px', mediaStart > 0);
check('the sheet is hidden everywhere except phones', /\.os-root \.sheet\{display:none/.test(css) && !css.slice(0, mediaStart).includes('.sheet.on{display:block}') && media.includes('.sheet.on{display:block}'));
check('tab bar and page respect the home-indicator safe area', media.includes('env(safe-area-inset-bottom)') && /padding-bottom:env\(safe-area-inset-bottom\)/.test(media));
check('phone tap targets are at least 34px', /\.btn\{height:36px\}/.test(media) && /\.chip\{height:36px\}/.test(media) && /\.tchip\{height:34px\}/.test(media) && /\.ib\{width:36px;height:36px\}/.test(media) && /min-height:48px/.test(media));
check('inputs are 16px on phones, so iOS does not zoom on focus', /input\.q,\.os-root \.btool input,\.os-root \.pbox input\{font-size:16px\}/.test(media));
check('grid columns can shrink below their content (no sideways scroll)', /\.g32\{grid-template-columns:minmax\(0,2fr\) minmax\(0,1fr\)\}/.test(css) && /\.g32,\.os-root \.g2\{grid-template-columns:minmax\(0,1fr\)\}/.test(media) && /\.g2\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(css) && /\.g4\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/.test(css));
check('Routines and Decisions: the wide columns hide on phones (schedule, last run, desk), and the schedule moves under the name', /\.rt-sched,\.os-root \.rt-last,\.os-root \.dc-desk\{display:none\}/.test(media) && /\.m-only\{display:block\}/.test(media) && /\.os-root \.m-only\{display:none\}/.test(css.slice(0, mediaStart)));
check('Brain: desks use their short names on a narrow canvas, so labels do not collide', /else if \(n\.t === 'desk' && st\.W < 520 && n\.info && n\.info\.short\) lb = n\.info\.short/.test(brain));
check('Brain toolbar is one scrollable row on phones', /\.btool\{flex-wrap:nowrap;overflow-x:auto/.test(media));
check('the Brain canvas takes touch itself (no page scroll or browser zoom under the finger)', /\.bstage canvas\{[^}]*touch-action:none/.test(css));
check('Brain stacks above its side panel on phones', /\.brain\{grid-template-columns:1fr;height:auto\}/.test(media));
check('the tap hint is styled and hidden until used', /\.bhint\{display:none/.test(css) && /\.bhint\.on\{display:block\}/.test(css));

// ---- Brain: first tap highlights, second tap opens ----------------------------
const tap = OS.brainTap;
const A = { id: 'a' }, B2 = { id: 'b' };
check('tap on empty canvas clears the selection', tap(A, null, 'touch') === 'clear' && tap(null, null, 'touch') === 'clear' && tap(A, null, 'mouse') === 'clear');
check('first tap on a node selects it, on touch and mouse', tap(null, A, 'touch') === 'select' && tap(null, A, 'mouse') === 'select' && tap(null, A, 'pen') === 'select');
check('tapping a different node moves the selection, never opens', tap(A, B2, 'touch') === 'select' && tap(A, B2, 'mouse') === 'select');
check('a second tap on the selected node opens it (touch and pen)', tap(A, A, 'touch') === 'open' && tap(A, A, 'pen') === 'open');
check('a second mouse click only keeps the selection (the Open button opens)', tap(A, A, 'mouse') === 'select');
check('unknown pointer types never open by accident', tap(A, A, undefined) === 'select' && tap(A, A, '') === 'select');

// ---- Brain: touch handling in the engine --------------------------------------
check('a few pixels of finger wobble still counts as a tap', /TAP_SLOP = 6/.test(brain) && /<= TAP_SLOP\) return/.test(brain));
check('touch gets a bigger hit area than a mouse', /TOUCH_REACH = 14/.test(brain) && /pointerType === 'touch' \|\| e\.pointerType === 'pen' \? TOUCH_REACH : 4/.test(brain));
check('two fingers pinch-zoom and never count as a tap', /Object\.keys\(pointers\)\.length === 2/.test(brain) && /pinch\.k \* now\.d \/ pinch\.start\.d/.test(brain) && /st\.moved = true;\s*\n\s*pinch =/.test(brain));
check('pinch and wheel share one clamped zoom (0.25 to 4)', (brain.match(/function zoomAt/g) || []).length === 1 && /Math\.min\(4, Math\.max\(0\.25, k2\)\)/.test(brain) && (brain.match(/zoomAt\(/g) || []).length >= 3);
check('a cancelled touch cannot leave a stuck drag or pinch', /pointercancel/.test(brain) && /pinch = null; st\.drag = null; st\.pan = null/.test(brain));
check('no hover highlighting is driven by touch', /if \(e\.pointerType === 'touch'\) return; \/\/ no hover on touch/.test(brain));
check('the hint appears only for touch and names the node', /Tap again to open ' \+ n\.label/.test(brain) && /!n \|\| !touch/.test(brain));
check('a node with nowhere to open says so instead of failing silently', /Nothing to open for this node/.test(brain));
check('opening goes through the same router as the Open button', /OS\.go\(tg\[0\], tg\[1\]\)/.test(brain) && /onOpen: open/.test(brain));

// ---- hygiene -----------------------------------------------------------------
const shipped = [core, brain, css].join('\n');
check('no network calls, eval or banned copy added', !/fetch\(|XMLHttpRequest|sendBeacon|\beval\s*\(|new Function\(/.test(shipped.replace(/\/\*[\s\S]*?\*\//g, '')) && !/free[\s-]*trial|starlink|guinea|lorem ipsum/i.test(shipped));

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
