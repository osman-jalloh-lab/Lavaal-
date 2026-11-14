/**
 * v1.3 Design-kit alignment tests
 *
 * Verifies the prototype against LAVAALL-MASCOT-LAB/reference/MASCOT_DESIGN_KIT:
 *   B-*  brand: every color is sourced; removed concept-art colors stay removed
 *   C-*  character: robot vs cat-inspired on one shared rig
 *   G-*  generated assets: inline module + static posters + PNG icons in sync
 *   K-*  controller: contract states/events, labels, svgSource, page-hidden
 *   R-*  roamer: lane, stop-on-interaction, time cap, pause reasons
 *   X-*  copy: no unverified claims in canned replies or labels
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, assert, assertEqual, assertContains, assertNotContains, registerAsync } from './run-all.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TECH_SVG = read('src/mascot/mascot-base.svg');
const WEB_SVG  = read('src/mascot/mascot-web.svg');

// Sourced palette (docs/mascot/BRAND_AUDIT_RESULTS.md).
const APPROVED = {
  technology: ['#00C2FF', '#00F5A0', '#0A0A14', '#F4F9FF', '#5A6A80', '#FFFFFF'],
  web:        ['#F5ECE5', '#0B252A', '#10323A', '#E7D3BF', '#0A0A14', '#FFFFFF'],
};
const REMOVED = ['#FF6B00', '#FFA500', '#2A1A00', '#1B3A6B', '#1A1A2E', '#E8EDF5', '#00FF88', '#FF4444'];

const hexes = (s) => (s.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(h => h.toUpperCase());
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// ── DOM shim (richer than earlier suites: listeners, rects, style API) ──
class Listeners {
  constructor() { this._l = {}; }
  addEventListener(t, fn)    { (this._l[t] = this._l[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this._l[t]) this._l[t] = this._l[t].filter(f => f !== fn); }
  dispatchEvent(e)           { (this._l[e.type] || []).slice().forEach(f => f(e)); return true; }
  count(t)                   { return (this._l[t] || []).length; }
}

class El extends Listeners {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.className = ''; this.textContent = ''; this.innerHTML = '';
    this._attrs = {}; this._children = []; this.parent = null;
    this.style = { removeProperty(p) { delete this[p]; } };
    this.offsetWidth = 80; this.offsetHeight = 110;
    this._rect = { left: 1176, top: 766, right: 1256, bottom: 876, width: 80, height: 110 };
    const set = new Set();
    this.classList = { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)),
                       contains: (c) => set.has(c), toggle: (c, f) => (f ? set.add(c) : set.delete(c)) };
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k)    { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  hasAttribute(k)    { return k in this._attrs; }
  appendChild(c)     { this._children.push(c); c.parent = this; return c; }
  remove()           { if (this.parent) this.parent._children = this.parent._children.filter(x => x !== this); }
  contains(el)       { for (let n = el; n; n = n.parent) if (n === this) return true; return false; }
  getBoundingClientRect() { return { ...this._rect }; }
  querySelectorAll() { return []; }
  querySelector()    { return null; }
  focus() {}
}

class Doc extends Listeners {
  constructor() { super(); this.hidden = false; this.body = new El('body'); this._sel = {}; }
  createElement(t) { return new El(t); }
  contains() { return true; }
  getElementById() { return null; }
  querySelectorAll(sel) { return this._sel[sel] || []; }
  querySelector(sel)    { return (this._sel[sel] || [])[0] || null; }
}

class Win extends Listeners {
  constructor() { super(); this.innerWidth = 1280; this.innerHeight = 900; this.reduce = false; }
  matchMedia() { return { matches: this.reduce, addListener() {}, removeEventListener() {} }; }
}

class CE { constructor(type, o = {}) { this.type = type; this.detail = o.detail || {}; } }

const doc = new Doc();
const win = new Win();
global.document = doc;
global.window = win;
global.CustomEvent = CE;
global.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
global.fetch = undefined;

const { MascotController, ARIA_LABELS, CONTRACT_STATE_MAP, CONTRACT_EVENT_MAP } = await import('../src/mascot/mascot-controller.js');
const { MascotRoamer } = await import('../src/mascot/mascot-roamer.js');
const { MASCOT_SVGS }  = await import('../src/mascot/mascot-svgs.js');
const { buildOutputs } = await import('../scripts/build-assets.js');

function resetEnv() {
  doc._l = {}; win._l = {}; doc.hidden = false; doc._sel = {};
  win.innerWidth = 1280; win.innerHeight = 900; win.reduce = false;
  global.document = doc; global.window = win; global.CustomEvent = CE; global.fetch = undefined;
}

function mascot(opts = {}) {
  resetEnv();
  return new MascotController({ container: new El('div'), enabled: true, svgSource: MASCOT_SVGS, ...opts });
}

// ═══ B: brand ════════════════════════════════════════════════════════
test('B-1: every color in the Technology SVG is a sourced brand color', () => {
  const bad = hexes(stripComments(TECH_SVG)).filter(h => !APPROVED.technology.includes(h));
  assertEqual(bad.length, 0, `unsourced colors in mascot-base.svg: ${[...new Set(bad)].join(', ')}`);
});

test('B-2: every color in the Web SVG is a sourced brand color', () => {
  const bad = hexes(stripComments(WEB_SVG)).filter(h => !APPROVED.web.includes(h));
  assertEqual(bad.length, 0, `unsourced colors in mascot-web.svg: ${[...new Set(bad)].join(', ')}`);
});

test('B-3: removed concept-art colors appear nowhere in src/ code or the demo', () => {
  const files = ['src/mascot/mascot-controller.js', 'src/mascot/mascot-roamer.js', 'src/mascot/mascot-animations.css',
    'src/mascot/mascot-svgs.js', 'src/chat/chat-panel.js', 'src/chat/chat-panel.css', 'src/chat/mock-chat-adapter.js',
    'src/tokens.css', 'demo/index.html'];
  for (const f of files) {
    const found = hexes(stripComments(read(f))).filter(h => REMOVED.includes(h));
    assertEqual(found.length, 0, `${f} still uses ${[...new Set(found)].join(', ')}`);
  }
});

test('B-7: UI CSS and demo use only brand colors (no generic Tailwind grays)', () => {
  const brand = [...new Set([...APPROVED.technology, ...APPROVED.web,
    '#FFE03D', '#FF5C5C', '#C7D3D1', '#F7E04A', '#8B7CFF', '#8A4B2A'])];
  const brandRgb = brand.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(','));
  for (const f of ['src/mascot/mascot-animations.css', 'src/chat/chat-panel.css', 'src/tokens.css', 'demo/index.html']) {
    const body = stripComments(read(f));
    const badHex = hexes(body).filter(h => !brand.includes(h));
    const badRgba = (body.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/gi) || [])
      .map(m => m.replace(/rgba?\(/i, '').replace(/\s/g, ''))
      .filter(rgb => !brandRgb.includes(rgb));
    assertEqual(badHex.length + badRgba.length, 0,
      `${f}: off-brand colors ${[...new Set([...badHex, ...badRgba])].join(', ')}`);
  }
});

test('B-4: neither mascot uses yellow (Tech --sun or Web CTA-only sun)', () => {
  for (const svg of [TECH_SVG, WEB_SVG]) {
    const body = stripComments(svg).toUpperCase();
    assert(!body.includes('#FFE03D') && !body.includes('#F7E04A'), 'yellow found in mascot artwork');
  }
});

test('B-5: tokens.css carries the sourced values and cites their files', () => {
  const t = read('src/tokens.css');
  for (const [name, val] of [['--lavaall-sky', '#00C2FF'], ['--lavaall-lime', '#00F5A0'], ['--lavaall-ink', '#0A0A14'],
    ['--lavaall-offwhite', '#F4F9FF'], ['--lavaall-web-bg', '#0B252A'], ['--lavaall-web-accent', '#E7D3BF'],
    ['--lavaall-web-cream', '#F5ECE5']]) {
    assert(new RegExp(`${name}:\\s*${val}`, 'i').test(t), `${name} should be ${val}`);
  }
  assertContains(t, 'assets/css/main.css:6');
  assertContains(t, 'api/web/_site/styles.css');
  assertNotContains(stripComments(t), 'PROVISIONAL');
});

test('B-6: brand audit evidence document exists with source paths', () => {
  const d = read('docs/mascot/BRAND_AUDIT_RESULTS.md');
  assertContains(d, 'assets/css/main.css');
  assertContains(d, 'api/web/_site/styles.css');
  assertContains(d, 'MAGNUM.md');
});

// ═══ C: characters ═══════════════════════════════════════════════════
const RIG = ['root', 'shadow', 'leg-left', 'leg-right', 'body', 'badge', 'arm-left', 'arm-right', 'head',
             'ear-left', 'ear-right', 'face', 'eye-left', 'eye-right', 'mouth', 'think-dots', 'speak-bars'];

test('C-1: both skins share the same rig ids and viewBox', () => {
  for (const part of RIG) {
    assertContains(TECH_SVG, `id="tech-${part}"`, `tech missing ${part}`);
    assertContains(WEB_SVG,  `id="web-${part}"`,  `web missing ${part}`);
  }
  assertContains(TECH_SVG, 'viewBox="0 0 120 160"');
  assertContains(WEB_SVG,  'viewBox="0 0 120 160"');
});

test('C-2: shared face panel geometry and eye shapes are identical', () => {
  const face = (s, p) => s.match(new RegExp(`id="${p}-face" x="(\\d+)" y="(\\d+)" width="(\\d+)" height="(\\d+)"`)).slice(1).join(',');
  assertEqual(face(TECH_SVG, 'tech'), face(WEB_SVG, 'web'));
  assertContains(TECH_SVG, 'M 38 52 Q 45 43 52 52');
  assertContains(WEB_SVG,  'M 38 52 Q 45 43 52 52');
});

test('C-3: Web skin is cat-inspired: ears, tail, whiskers, no antenna', () => {
  assert(/id="web-ear-left"[\s\S]*?<path d="M 25 36 L 29 7/.test(WEB_SVG), 'triangular cat ear expected');
  assertContains(WEB_SVG, 'id="web-tail"');
  assertContains(WEB_SVG, 'id="web-whiskers"');
  assertNotContains(WEB_SVG, 'id="web-antenna"');
});

test('C-4: Technology skin is the robot: antenna, no tail', () => {
  assertContains(TECH_SVG, 'id="tech-antenna"');
  assertNotContains(TECH_SVG, '-tail"');
});

test('C-5: masters have no <text>, filters, scripts or external references', () => {
  for (const svg of [TECH_SVG, WEB_SVG]) {
    const body = stripComments(svg);
    for (const bad of ['<text', '<filter', '<script', 'href', 'http://www.w3.org/1999', 'https://', 'onload', '<image']) {
      assertNotContains(body, bad, `found ${bad}`);
    }
  }
});

test('C-6: both skins carry the V chest emblem from the official logo', () => {
  assert(/id="tech-badge"[\s\S]*?L 60 107 L 63.5 98.5/.test(TECH_SVG), 'tech V emblem');
  assert(/id="web-badge"[\s\S]*?L 60 109 L 63.5 100.5/.test(WEB_SVG), 'web V emblem');
});

test('C-7: each master stays under 8 KB', () => {
  assert(Buffer.byteLength(TECH_SVG) < 8192, `tech ${Buffer.byteLength(TECH_SVG)} B`);
  assert(Buffer.byteLength(WEB_SVG) < 8192, `web ${Buffer.byteLength(WEB_SVG)} B`);
});

// ═══ G: generated assets ═════════════════════════════════════════════
test('G-1: generated files match the masters (run npm run build:assets if this fails)', () => {
  for (const [rel, content] of Object.entries(buildOutputs())) {
    assertEqual(read(rel), content, `${rel} is stale`);
  }
});

test('G-2: inline module exposes both skins as <svg> markup', () => {
  assert(MASCOT_SVGS.technology.startsWith('<svg id="mascot-tech-svg"'), 'tech');
  assert(MASCOT_SVGS.web.startsWith('<svg id="mascot-web-svg"'), 'web');
});

test('G-3: speaking posters show bars and hide eyes and mouth', () => {
  for (const p of ['tech', 'web']) {
    const s = read(`assets/static/${p}-speaking.svg`);
    assertContains(s, `id="${p}-speak-bars" opacity="1"`);
    assertContains(s, `id="${p}-eye-left" opacity="0"`);
    assertContains(s, `id="${p}-mouth" opacity="0"`);
  }
});

test('G-4: 12 PNG icons exist at 48/96/192 px with correct dimensions', () => {
  let n = 0;
  for (const pose of ['tech-idle', 'tech-speaking', 'web-idle', 'web-speaking']) {
    for (const size of [48, 96, 192]) {
      const buf = fs.readFileSync(path.join(ROOT, `assets/static/icons/${pose}-${size}.png`));
      assertEqual(buf.toString('hex', 0, 8), '89504e470d0a1a0a', 'PNG signature');
      assertEqual(buf.readUInt32BE(16), size, `${pose} width`);
      assertEqual(buf.readUInt32BE(20), size, `${pose} height`);
      n++;
    }
  }
  assertEqual(n, 12);
});

test('G-5: demo uses the generated module, a lane, and a noscript fallback', () => {
  const d = read('demo/index.html');
  assertContains(d, "import { MASCOT_SVGS }");
  assertContains(d, 'svgSource: MASCOT_SVGS');
  assertNotContains(d, 'INLINED_SVG');
  assertNotContains(d, '_applySVG');
  assertContains(d, 'data-mascot-lane');
  assertContains(d, '<noscript>');
  assertContains(d, 'no mic');
});

// ═══ K: controller ═══════════════════════════════════════════════════
test('K-1: accessible labels match CHARACTER_BIBLE wording', () => {
  assertEqual(ARIA_LABELS.technology, 'Open LAVAALL Assistant');
  assertEqual(ARIA_LABELS.web, 'Open LAVAALL Web assistant');
  const m = mascot({ variant: 'web' });
  assertEqual(m._trigger.getAttribute('aria-label'), 'Open LAVAALL Web assistant');
  m.setVariant('technology');
  assertEqual(m._trigger.getAttribute('aria-label'), 'Open LAVAALL Assistant');
  m.destroy();
});

test('K-2: svgSource applies markup synchronously and never fetches', () => {
  resetEnv();
  let fetched = 0;
  global.fetch = () => { fetched++; return Promise.reject(new Error('no network')); };
  const m = new MascotController({ container: new El('div'), enabled: true, svgSource: MASCOT_SVGS });
  assertContains(m._svgWrapper.innerHTML, 'mascot-tech-svg');
  m.setVariant('web');
  assertContains(m._svgWrapper.innerHTML, 'mascot-web-svg');
  assertEqual(fetched, 0, 'fetch must not be called when svgSource is given');
  m.destroy();
  global.fetch = undefined;
});

test('K-3: svgSource invalidates any in-flight fetch (file:// race fix)', () => {
  const m = mascot();
  const before = m._svgSeq;
  m.setVariant('web');
  assert(m._svgSeq > before, 'sequence token must advance so stale fetch results are discarded');
  m.destroy();
});

test('K-4: fallback icon uses sourced colors only', () => {
  const m = mascot();
  const web = m._fallbackSVG('web').toUpperCase(), tech = m._fallbackSVG('technology').toUpperCase();
  assertContains(web, '#E7D3BF'); assertContains(tech, '#00C2FF');
  for (const h of REMOVED) { assertNotContains(web, h); assertNotContains(tech, h); }
  m.destroy();
});

test('K-5: contract state names map onto presentation states', () => {
  const m = mascot();
  assertEqual(m._root.getAttribute('data-contract-state'), 'closed', 'initial contract state');
  const cases = { greeting: 'wave', walking: 'walk', listening: 'listen', thinking: 'think',
                  speaking: 'speak', handoff: 'wave', error: 'error', closed: 'idle', idle: 'idle' };
  for (const [contract, internal] of Object.entries(cases)) {
    assertEqual(m.setState(contract), true, contract);
    assertEqual(m._root.getAttribute('data-state'), internal, `${contract} → ${internal}`);
    assertEqual(m.contractState, contract);
    assertEqual(m._root.getAttribute('data-contract-state'), contract);
  }
  assertEqual(Object.keys(CONTRACT_STATE_MAP).length, 10, 'all 10 contract states covered');
  m.destroy();
});

test('K-6: internal states report a contract name', () => {
  const m = mascot();
  m.setState('think'); assertEqual(m.contractState, 'thinking');
  m.setState('wave');  assertEqual(m.contractState, 'greeting');
  m.destroy();
});

test('K-7: setState("hidden") hides; show() restores the prior contract state', () => {
  const m = mascot();
  m.setState('thinking');
  m.setState('hidden');
  assert(m._root.hasAttribute('hidden'), 'hidden attribute');
  assertEqual(m.contractState, 'hidden');
  m.show();
  assert(!m._root.hasAttribute('hidden'));
  assertEqual(m.contractState, 'thinking');
  m.resetPreferences();
  m.destroy();
});

test('K-8: send() maps every contract event and rejects unknown ones', () => {
  const m = mascot();
  const expected = { OPEN: 'greeting', USER_MESSAGE: 'thinking', ASSISTANT_START: 'speaking', ASSISTANT_END: 'idle',
                     LISTEN_START: 'listening', LISTEN_END: 'idle', HANDOFF: 'handoff', ERROR: 'error',
                     START_WALK: 'walking', STOP_WALK: 'idle', CLOSE: 'closed' };
  for (const [evt, state] of Object.entries(expected)) assertEqual(m.send(evt), state, evt);
  const before = m.contractState;
  assertEqual(m.send('HOVER'), before, 'HOVER changes nothing');
  const warn = console.warn; console.warn = () => {};
  assertEqual(m.send('SUBMIT_ORDER'), null, 'unknown event ignored');
  console.warn = warn;
  assertEqual(m.send('HIDE'), 'hidden');
  assert(m._root.hasAttribute('hidden'));
  assertEqual(Object.keys(CONTRACT_EVENT_MAP).length, 14, 'all 14 contract events covered');
  m.resetPreferences();
  m.destroy();
});

test('K-9: REDUCED_MOTION event sets the attribute, ends walking, blocks START_WALK', () => {
  const m = mascot();
  m.send('START_WALK');
  m.send('REDUCED_MOTION');
  assertEqual(m._root.getAttribute('data-reduced-motion'), 'true');
  assertEqual(m.state, 'idle');
  m.send('START_WALK');
  assertEqual(m.state, 'idle', 'walking stays off under reduced motion');
  m.destroy();
});

test('K-10: hidden tab and pagehide pause animation; pageshow resumes; destroy unhooks', () => {
  const m = mascot();
  doc.hidden = true; doc.dispatchEvent({ type: 'visibilitychange' });
  assertEqual(m._root.getAttribute('data-page-hidden'), 'true');
  doc.hidden = false; doc.dispatchEvent({ type: 'visibilitychange' });
  assertEqual(m._root.getAttribute('data-page-hidden'), null);
  win.dispatchEvent({ type: 'pagehide' });
  assertEqual(m._root.getAttribute('data-page-hidden'), 'true');
  win.dispatchEvent({ type: 'pageshow' });
  assertEqual(m._root.getAttribute('data-page-hidden'), null);
  m.destroy();
  assertEqual(doc.count('visibilitychange'), 0);
  assertEqual(win.count('pagehide'), 0);
});

// ═══ R: roamer ═══════════════════════════════════════════════════════
const LANE = { left: 200, top: 100, right: 1100, bottom: 300, width: 900, height: 200 };
function roamSetup(opts = {}) {
  const m = mascot();
  const lane = new El('div'); lane._rect = { ...LANE };
  doc._sel['[data-mascot-lane]'] = [lane];
  const r = new MascotRoamer({ mascot: m, lane: '[data-mascot-lane]', stepIntervalMs: 60_000, ...opts });
  return { m, r };
}
const px = (v) => parseInt(v, 10);

test('R-1: start() walks and the first waypoint lies inside the lane', () => {
  const { m, r } = roamSetup();
  assertEqual(r.start(), true);
  assertEqual(m.state, 'walk');
  const x = px(m._root.style.left), y = px(m._root.style.top);
  assert(x >= LANE.left && x + 80 <= LANE.right, `x=${x} outside lane`);
  assert(y >= LANE.top && y + 110 <= LANE.bottom, `y=${y} outside lane`);
  r.destroy(); m.destroy();
});

for (const [label, fire] of [
  ['pointerdown', () => win.dispatchEvent({ type: 'pointerdown' })],
  ['keydown',     () => win.dispatchEvent({ type: 'keydown' })],
  ['scroll',      () => win.dispatchEvent({ type: 'scroll' })],
  ['wheel',       () => win.dispatchEvent({ type: 'wheel' })],
  ['focusin',     () => doc.dispatchEvent({ type: 'focusin' })],
]) {
  test(`R-2: first ${label} stops walking for good and restores the dock`, () => {
    const { m, r } = roamSetup();
    r.start();
    fire();
    assertEqual(r.isStarted, false);
    assertEqual(r.lastStopReason, `interaction:${label}`);
    assertEqual(m.state, 'idle');
    assertEqual(m._root.style.left, undefined, 'inline position removed');
    assertEqual(win.count('pointerdown') + win.count('scroll') + doc.count('focusin'), 0, 'listeners removed');
    r.destroy(); m.destroy();
  });
}

test('R-3: pagehide stops walking', () => {
  const { m, r } = roamSetup();
  r.start();
  win.dispatchEvent({ type: 'pagehide' });
  assertEqual(r.lastStopReason, 'pagehide');
  r.destroy(); m.destroy();
});

registerAsync(test('R-4: walking stops by itself after maxDurationMs', async () => {
  const { m, r } = roamSetup({ maxDurationMs: 40 });
  r.start();
  await new Promise(res => setTimeout(res, 120));
  assertEqual(r.isStarted, false);
  assertEqual(r.lastStopReason, 'timeout');
  r.destroy(); m.destroy();
}));

test('R-5: leaving hover does not resume while the tab is hidden (v1.2 bug)', () => {
  const { m, r } = roamSetup();
  r.start();
  doc.hidden = true; doc.dispatchEvent({ type: 'visibilitychange' });
  m._root.dispatchEvent({ type: 'mouseenter' });
  m._root.dispatchEvent({ type: 'mouseleave' });
  assertEqual(r.isPaused, true, 'still paused for visibility');
  doc.hidden = false; doc.dispatchEvent({ type: 'visibilitychange' });
  assertEqual(r.isPaused, false);
  r.destroy(); m.destroy();
});

test('R-6: stop() never overwrites a chat state set during the walk', () => {
  const { m, r } = roamSetup();
  r.start();
  m.setState('think');
  r.stop('test');
  assertEqual(m.state, 'think');
  r.destroy(); m.destroy();
});

test('R-7: the mascot\'s own buttons are not obstacles', () => {
  const { m, r } = roamSetup();
  const own = new El('button'); m._root.appendChild(own); own._rect = { ...LANE };
  const other = new El('button'); other._rect = { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
  doc._sel['button'] = [own, other];
  const rects = r._getAvoidRects();
  assertEqual(rects.length, 1, 'only the page button is avoided');
  r.destroy(); m.destroy();
});

test('R-8: with no clear waypoint the mascot stays put', () => {
  const { m, r } = roamSetup();
  const blocker = new El('form'); blocker._rect = { left: 0, top: 0, right: 1280, bottom: 900, width: 1280, height: 900 };
  doc._sel['form'] = [blocker];
  r.start();
  assertEqual(px(m._root.style.left), 1176, 'x unchanged from dock');
  assertEqual(px(m._root.style.top), 766, 'y unchanged from dock');
  r.destroy(); m.destroy();
});

test('R-9: no walking on mobile widths or with reduced motion', () => {
  let { m, r } = roamSetup();
  win.innerWidth = 800;
  assertEqual(r.start(), false); r.destroy(); m.destroy();
  ({ m, r } = roamSetup());
  win.reduce = true;
  assertEqual(r.start(), false); r.destroy(); m.destroy();
  ({ m, r } = roamSetup());
  m.send('REDUCED_MOTION');
  assertEqual(r.start(), false, 'controller-level reduced motion also blocks'); r.destroy(); m.destroy();
});

registerAsync(test('R-10: startWhenIdle walks only if the visitor has not interacted', async () => {
  let { m, r } = roamSetup();
  r.startWhenIdle(40);
  win.dispatchEvent({ type: 'keydown' });
  await new Promise(res => setTimeout(res, 90));
  assertEqual(r.isStarted, false, 'interaction cancels the idle start');
  assertEqual(r.hasInteracted, true);
  r.destroy(); m.destroy();

  ({ m, r } = roamSetup());
  r.startWhenIdle(40);
  await new Promise(res => setTimeout(res, 90));
  assertEqual(r.isStarted, true, 'no interaction → walks');
  r.destroy(); m.destroy();
}));

test('R-12: refuses to start when the lane is scrolled off-screen', () => {
  const { m, r } = roamSetup();
  doc._sel['[data-mascot-lane]'][0]._rect = { left: 200, top: -400, right: 1100, bottom: -200, width: 900, height: 200 };
  assertEqual(r.start(), false);
  assertEqual(r.lastStopReason, 'lane-not-visible');
  assertEqual(m.state, 'idle');
  r.destroy(); m.destroy();
});

test('R-11: stopping emits mascot:roam-stop with the reason', () => {
  const { m, r } = roamSetup();
  let reason = null;
  win.addEventListener('mascot:roam-stop', (e) => { reason = e.detail.reason; });
  r.start(); r.stop('button');
  assertEqual(reason, 'button');
  r.destroy(); m.destroy();
});

// ═══ CSS ═════════════════════════════════════════════════════════════
test('CSS-1: page-hidden and controller reduced-motion rules exist', () => {
  const css = read('src/mascot/mascot-animations.css');
  assertContains(css, '.mascot-root[data-page-hidden="true"] *');
  assertContains(css, '.mascot-root[data-reduced-motion="true"] *');
});

test('CSS-2: cat tail animates; dots/bars replace eyes so they never overlap', () => {
  const css = read('src/mascot/mascot-animations.css');
  assertContains(css, '@keyframes mascot-tail-sway');
  assertContains(css, '#web-tail');
  for (const st of ['listen', 'think', 'speak']) {
    assertContains(css, `.mascot-root[data-state="${st}"] #web-eye-left`);
    assertContains(css, `.mascot-root[data-state="${st}"] #tech-mouth`);
  }
});

// ═══ X: copy ═════════════════════════════════════════════════════════
test('X-1: canned replies make no hours, region, stock or contact-detail claims', () => {
  const src = read('src/chat/mock-chat-adapter.js');
  for (const bad of ['24/7', 'West Africa', '@lavaall.com', '+1 (', 'in stock']) {
    assertNotContains(src, bad, `canned copy contains "${bad}"`);
  }
  // "delivered" may only appear as an explicit negation.
  const affirmative = (src.match(/.{0,20}\bdelivered\b/g) || []).filter(m => !/No request was delivered|being delivered/.test(m));
  assertEqual(affirmative.length, 0, `affirmative delivery claim: ${affirmative.join(' | ')}`);
  assertNotContains(src, 'LAVAALL Web (Lava)', 'Lava is the Web demo assistant, not the division');
});

test('X-2: chat panel does not imply microphone listening; labels follow the bible', () => {
  const src = read('src/chat/chat-panel.js');
  assertNotContains(src, "_setStatus('Listening…')");
  assertContains(src, 'Chat with LAVAALL Web assistant');
  assertContains(src, 'Chat with LAVAALL Assistant');
});
