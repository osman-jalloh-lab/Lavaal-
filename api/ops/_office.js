// Additive /ops Office — agent desks / presence. Preview only.
// Desktop ≥1200px: full-bleed camera scene (no 1100px letterbox, no side-by-side
// roster column). Dashboard goal/unfinished/capture scroll below. Phone stays
// one card per row; iPad 2-up / landscape 3-up. No Growth Option I full-bleed
// pattern existed in-repo — tokens stay Option I cream.
// Approved camera PNGs (untouched) live in /assets/ops/office/cameras/*.png.
// Phone/iPad cards crop those same photos with object-fit. Researchy uses a
// pixel crop of the Operations specialist from side.png (03-side.png) — not
// lead.png, not an invented sixth robot. All six desks Talk. Underscore prefix:
// not a Vercel function.

const { escapeHtml } = require('./_lib');
const { dashboardSections, persistenceBanner, shellPage } = require('./_shell');

const TALK_AGENT_IDS = Object.freeze(['lavaall-ceo', 'sales', 'technical', 'growth', 'lifecycle', 'researchy']);

const DESK_FILLS = Object.freeze({
  'lavaall-ceo': '#D1FAE5',
  sales: '#E9D8D0',
  technical: '#E6F7FF',
  growth: '#FFF6E0',
  lifecycle: '#F3EFE8',
  researchy: '#E8E4DC',
});

const OFFICE_CAMERAS = Object.freeze([
  { id: 'wide', label: 'Wide', photo: '/assets/ops/office/cameras/wide.png', source: '04-primary-wide.png' },
  { id: 'front-left', label: 'Front left', photo: '/assets/ops/office/cameras/front-left.png', source: '01-front-left.png' },
  { id: 'front-right', label: 'Front right', photo: '/assets/ops/office/cameras/front-right.png', source: '02-front-right.png' },
  { id: 'side', label: 'Side', photo: '/assets/ops/office/cameras/side.png', source: '03-side.png' },
  { id: 'lead', label: 'Lead view', photo: '/assets/ops/office/cameras/lead.png', source: '05-lead-view.png' },
]);
const DEFAULT_CAMERA_ID = 'lead';

// Percent of the camera frame. Each camera has its own map, including Researchy.
const OFFICE_HOTSPOTS = Object.freeze({
  wide: [
    { id: 'sales', left: 6, top: 38, width: 18, height: 30 },
    { id: 'growth', left: 10, top: 68, width: 16, height: 22 },
    { id: 'lavaall-ceo', left: 40, top: 34, width: 20, height: 34 },
    { id: 'technical', left: 74, top: 36, width: 18, height: 30 },
    { id: 'lifecycle', left: 72, top: 68, width: 18, height: 22 },
    { id: 'researchy', left: 43, top: 72, width: 14, height: 16 },
  ],
  'front-left': [
    { id: 'sales', left: 18, top: 28, width: 28, height: 42 },
    { id: 'growth', left: 8, top: 62, width: 24, height: 28 },
    { id: 'lavaall-ceo', left: 52, top: 30, width: 22, height: 36 },
    { id: 'technical', left: 76, top: 40, width: 16, height: 24 },
    { id: 'lifecycle', left: 70, top: 70, width: 18, height: 20 },
    { id: 'researchy', left: 42, top: 72, width: 16, height: 16 },
  ],
  'front-right': [
    { id: 'technical', left: 52, top: 26, width: 30, height: 42 },
    { id: 'lifecycle', left: 64, top: 64, width: 24, height: 26 },
    { id: 'lavaall-ceo', left: 28, top: 30, width: 22, height: 36 },
    { id: 'sales', left: 6, top: 40, width: 16, height: 24 },
    { id: 'growth', left: 8, top: 70, width: 18, height: 20 },
    { id: 'researchy', left: 40, top: 70, width: 16, height: 16 },
  ],
  side: [
    { id: 'sales', left: 8, top: 30, width: 22, height: 36 },
    { id: 'lavaall-ceo', left: 34, top: 28, width: 24, height: 40 },
    { id: 'technical', left: 62, top: 30, width: 22, height: 36 },
    { id: 'growth', left: 18, top: 68, width: 20, height: 22 },
    { id: 'lifecycle', left: 58, top: 68, width: 20, height: 22 },
    { id: 'researchy', left: 40, top: 72, width: 16, height: 16 },
  ],
  lead: [
    { id: 'lavaall-ceo', left: 32, top: 22, width: 36, height: 48 },
    { id: 'sales', left: 6, top: 40, width: 18, height: 28 },
    { id: 'technical', left: 76, top: 40, width: 18, height: 28 },
    { id: 'growth', left: 14, top: 72, width: 20, height: 18 },
    { id: 'lifecycle', left: 66, top: 72, width: 20, height: 18 },
    { id: 'researchy', left: 40, top: 74, width: 20, height: 14 },
  ],
});

const RESEARCHY_SEATS = Object.freeze({
  wide: { left: 43, top: 72, width: 14, height: 16 },
  'front-left': { left: 42, top: 72, width: 16, height: 16 },
  'front-right': { left: 40, top: 70, width: 16, height: 16 },
  side: { left: 40, top: 72, width: 16, height: 16 },
  lead: { left: 40, top: 74, width: 20, height: 14 },
});

// Covers the baked-in “AI AGENTS” wall sign. Not over desk faces.
const OFFICE_WORDMARK = Object.freeze({
  wide: { left: 37, top: 5, width: 26, height: 17 },
  'front-left': { left: 34, top: 3, width: 28, height: 16 },
  'front-right': { left: 36, top: 4, width: 26, height: 16 },
  side: { left: 36, top: 4, width: 26, height: 16 },
  lead: { left: 35, top: 1, width: 30, height: 17 },
});

const CARD_CAMERA = Object.freeze({
  'lavaall-ceo': 'lead',
  sales: 'front-left',
  technical: 'front-right',
  growth: 'front-left',
  lifecycle: 'front-right',
});

// Pixel crop of the Operations specialist in 03-side.png / side.png (1672x941 → 175,255,505,575).
const RESEARCHY_PORTRAIT = Object.freeze({
  photo: '/assets/ops/office/cameras/researchy.png',
  source: '03-side.png',
  camera: 'side',
});

function cameraById(id) {
  return OFFICE_CAMERAS.find((item) => item.id === id) || null;
}

function hotspotFor(cameraId, agentId) {
  return (OFFICE_HOTSPOTS[cameraId] || []).find((spot) => spot.id === agentId) || null;
}

function cropPosition(cameraId, agentId) {
  const spot = hotspotFor(cameraId, agentId);
  if (!spot) return '50% 50%';
  return `${(spot.left + (spot.width / 2)).toFixed(1)}% ${(spot.top + (spot.height / 2)).toFixed(1)}%`;
}

function deskPhoto(agentId) {
  const cameraId = CARD_CAMERA[agentId];
  const camera = cameraById(cameraId);
  if (!camera) return '';
  return camera.photo;
}

const OFFICE_AGENTS = Object.freeze([
  {
    id: 'lavaall-ceo',
    name: 'LAVAALL CEO',
    talk: '/ops/chat/lavaall-ceo',
    photo: deskPhoto('lavaall-ceo'),
    objectPosition: cropPosition(CARD_CAMERA['lavaall-ceo'], 'lavaall-ceo'),
    short: 'CEO',
  },
  {
    id: 'sales',
    name: 'LAVAALL Sales & Customer Success',
    talk: '/ops/chat/sales',
    photo: deskPhoto('sales'),
    objectPosition: cropPosition(CARD_CAMERA.sales, 'sales'),
    short: 'Sales',
  },
  {
    id: 'technical',
    name: 'LAVAALL Technical & QA',
    talk: '/ops/chat/technical',
    photo: deskPhoto('technical'),
    objectPosition: cropPosition(CARD_CAMERA.technical, 'technical'),
    short: 'Technical',
  },
  {
    id: 'growth',
    name: 'LAVAALL Growth, UGC & Ads',
    talk: '/ops/chat/growth',
    photo: deskPhoto('growth'),
    objectPosition: cropPosition(CARD_CAMERA.growth, 'growth'),
    short: 'Growth',
  },
  {
    id: 'lifecycle',
    name: 'LAVAALL Lifecycle & Klaviyo',
    talk: '/ops/chat/lifecycle',
    photo: deskPhoto('lifecycle'),
    objectPosition: cropPosition(CARD_CAMERA.lifecycle, 'lifecycle'),
    short: 'Lifecycle',
  },
  {
    id: 'researchy',
    name: 'Researchy',
    talk: '/ops/chat/researchy',
    photo: RESEARCHY_PORTRAIT.photo,
    objectPosition: '50% 38%',
    short: 'Researchy',
  },
]);

function normalizeTalkAgentId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'ceo') return 'lavaall-ceo';
  return TALK_AGENT_IDS.includes(raw) ? raw : '';
}

function officeAgentById(id) {
  const agentId = normalizeTalkAgentId(id);
  return OFFICE_AGENTS.find((agent) => agent.id === agentId) || null;
}

function isTalkAgent(id) {
  return Boolean(normalizeTalkAgentId(id));
}

function talkHref(id) {
  const agentId = normalizeTalkAgentId(id);
  return agentId ? `/ops/chat/${agentId}` : '';
}

function pctBox(spot) {
  return {
    x: (spot.left / 100) * 640,
    y: (spot.top / 100) * 360,
    w: (spot.width / 100) * 640,
    h: (spot.height / 100) * 360,
  };
}

function officeStyles() {
  return `
.office-lead{color:var(--muted);font-size:16px;line-height:1.5;max-width:40rem;margin:0 0 16px;}
.office-hero{display:none;}
.office-cameras{display:flex;flex-wrap:wrap;gap:8px;}
.office-cameras button{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
.office-cameras button.is-on{background:#E6F7FF;color:var(--sky-deep);border-color:transparent;}
.office-stage{position:relative;overflow:hidden;background:var(--surface-2);}
.office-stage svg,.office-stage img.office-camera-photo{display:block;width:100%;height:auto;}
.office-stage img.office-camera-photo[hidden]{display:none;}
.office-camera-photo{position:relative;z-index:0;}
.office-hotspots{position:absolute;inset:0;z-index:1;}
.office-hotspot{position:absolute;border:2px solid transparent;border-radius:14px;cursor:pointer;background:transparent;padding:0;}
.office-hotspot-label{position:absolute;left:6px;bottom:6px;font-size:11px;font-weight:700;color:#1C1917;background:rgba(243,238,231,.92);padding:2px 8px;border-radius:999px;pointer-events:none;}
.office-roster{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:14px 16px;box-shadow:0 10px 28px rgba(28,20,16,.08);}
.office-roster-brand{margin:0 0 12px;}
.office-roster-logo{display:block;height:36px;width:auto;max-width:100%;object-fit:contain;}
.office-roster h2{font-size:18px;margin-bottom:10px;}
.office-roster-row{margin-top:8px;}
.office-roster button,.office-roster a.btn{display:block;width:100%;text-align:left;}
.office-roster button{border:1px solid var(--line);background:var(--surface-2);color:var(--text);border-radius:14px;padding:10px 12px;font:inherit;font-weight:600;cursor:pointer;}
.office-roster button.is-on{border-color:rgba(46,196,255,.4);background:rgba(46,196,255,.12);color:var(--sky-deep);}
.office-roster a.btn{width:auto;margin-top:6px;padding:8px 14px;}
.office-cards{display:grid;grid-template-columns:1fr;gap:12px;}
.office-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(28,20,16,.04);}
.office-card-visual{position:relative;min-height:180px;background:var(--surface-2);overflow:hidden;}
.office-card-visual img{width:100%;height:200px;object-fit:cover;display:block;}
.office-photo-fallback{position:absolute;inset:0;display:flex;align-items:flex-end;padding:14px;color:var(--ink);font-weight:700;}
.office-photo-fallback[hidden]{display:none;}
.office-card-body{padding:14px 16px 16px;}
.office-card-body h2{font-size:18px;margin-bottom:8px;}
.office-card .btn{width:auto;margin-top:8px;padding:10px 16px;}
.office-placeholder-label{font-size:13px;font-weight:700;color:var(--muted);text-align:left;}
.office-selected{margin:0;font-size:14px;color:var(--ink);font-weight:600;}
.office-dash{display:none;}
@media (min-width:768px){.office-cards{grid-template-columns:1fr 1fr;}}
@media (min-width:768px) and (orientation:landscape){.office-cards{grid-template-columns:1fr 1fr 1fr;}}
@media (min-width:1200px){
  .ops-app.is-office .ops-main{padding:0 0 48px;}
  .ops-app.is-office .ops-wrap{width:100%;max-width:none;margin:0;}
  .office-hero{display:block;position:relative;width:100%;}
  .office-stage-wrap{display:block;width:100%;}
  .office-stage{width:100%;border:0;border-radius:0;min-height:0;}
  .office-cameras{position:absolute;top:16px;left:16px;z-index:2;}
  .office-roster{display:block;position:absolute;top:16px;right:16px;z-index:2;width:240px;max-height:calc(100% - 32px);overflow:auto;background:rgba(243,238,231,.94);}
  .office-selected{position:absolute;left:16px;bottom:16px;z-index:2;padding:8px 12px;border-radius:999px;background:rgba(243,238,231,.94);border:1px solid var(--line);}
  .office-cards{display:none;}
  .office-rest{width:min(1100px,calc(100% - 48px));margin:0 auto;padding:22px 24px 0;}
  .office-dash{display:block;margin-top:8px;}
}
`;
}

function cameraArt(cameraId) {
  const label = (OFFICE_CAMERAS.find((item) => item.id === cameraId) || OFFICE_CAMERAS[0]).label;
  const spots = OFFICE_HOTSPOTS[cameraId] || [];
  const desks = spots.map((spot) => {
    const agent = officeAgentById(spot.id);
    const box = pctBox(spot);
    const fill = DESK_FILLS[spot.id] || '#EBE4DC';
    return `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" rx="12" fill="${fill}" stroke="#CFC7BC"/>
      <text x="${(box.x + 10).toFixed(1)}" y="${(box.y + 22).toFixed(1)}" fill="#141414" font-size="13" font-family="Bricolage Grotesque,sans-serif" font-weight="700">${escapeHtml(agent ? agent.short : spot.id)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 640 360" role="img" aria-label="Office ${escapeHtml(label)}" data-camera="${escapeHtml(cameraId)}">
    <rect width="640" height="360" fill="#F3EEE7"/>
    <rect x="16" y="16" width="608" height="328" rx="18" fill="#EBE4DC" stroke="#CFC7BC"/>
    <text x="32" y="44" fill="#0891B2" font-size="14" font-family="Bricolage Grotesque,sans-serif" font-weight="700">${escapeHtml(label)}</text>
    ${desks}
  </svg>`;
}

function fallbackPanel(agent) {
  const fill = DESK_FILLS[agent.id] || 'var(--surface-2)';
  return `<div class="office-photo-fallback" hidden style="background:${fill}">${escapeHtml(agent.name)}</div>`;
}

function agentCards() {
  return OFFICE_AGENTS.map((agent) => {
    const talk = agent.talk
      ? `<a class="btn" href="${escapeHtml(agent.talk)}">Talk</a>`
      : '';
    return `<article class="office-card" data-agent="${escapeHtml(agent.id)}">
      <div class="office-card-visual">
        ${fallbackPanel(agent)}
        <img data-office-photo src="${escapeHtml(agent.photo)}" alt="${escapeHtml(agent.name)}" width="640" height="320" style="object-position:${escapeHtml(agent.objectPosition || '50% 40%')}"/>
      </div>
      <div class="office-card-body">
        <h2>${escapeHtml(agent.name)}</h2>
        ${talk}
      </div>
    </article>`;
  }).join('');
}

function rosterButtons() {
  return OFFICE_AGENTS.map((agent) => {
    if (!agent.talk) {
      return `<p class="office-placeholder-label" data-agent="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</p>`;
    }
    return `<div class="office-roster-row">
      <button type="button" data-agent="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</button>
      <a class="btn btn-sm office-talk" data-talk="${escapeHtml(agent.id)}" href="${escapeHtml(agent.talk)}">Talk</a>
    </div>`;
  }).join('');
}

function officePage({ email, snapshot, notice, error }) {
  const graph = {
    agents: OFFICE_AGENTS.map((agent) => ({
      id: agent.id,
      name: agent.name,
      talk: agent.talk,
      photo: agent.photo,
      objectPosition: agent.objectPosition,
      placeholder: Boolean(agent.placeholder),
    })),
    cameras: OFFICE_CAMERAS.map((camera) => ({
      id: camera.id,
      label: camera.label,
      photo: camera.photo,
      source: camera.source,
    })),
    hotspots: OFFICE_HOTSPOTS,
    wordmark: OFFICE_WORDMARK,
  };
  const cameraLayers = OFFICE_CAMERAS.map((camera) => (
    `<img class="office-camera-photo" data-camera-photo="${escapeHtml(camera.id)}" src="${escapeHtml(camera.photo)}" alt="Office ${escapeHtml(camera.label)}" width="1280" height="720"${camera.id === DEFAULT_CAMERA_ID ? '' : ' hidden'}/>
     <div class="office-camera-art" data-camera-art="${escapeHtml(camera.id)}" hidden>${cameraArt(camera.id)}</div>`
  )).join('');
  return shellPage({
    title: 'LAVAALL OS — Office',
    email,
    area: 'office',
    notice,
    error,
    scripts: `<style>${officeStyles()}</style>
<script type="application/json" id="office-data">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
<script src="/assets/js/ops-office.js?v=wordmark" defer></script>`,
    body: `
      <div class="office-hero" id="office-hero">
        <div class="office-cameras" id="office-cameras" role="group" aria-label="Cameras">
          ${OFFICE_CAMERAS.map((camera) => (
            `<button type="button" data-camera="${escapeHtml(camera.id)}"${camera.id === DEFAULT_CAMERA_ID ? ' class="is-on"' : ''}>${escapeHtml(camera.label)}</button>`
          )).join('')}
        </div>
        <div class="office-stage-wrap">
          <div class="office-stage" id="office-stage">
            ${cameraLayers}
            <div class="office-hotspots" id="office-hotspots"></div>
          </div>
        </div>
        <p class="office-selected" id="office-selected">Tap a desk or a name.</p>
        <aside class="office-roster" id="office-roster">
          <div class="office-roster-brand">
            <picture>
              <source srcset="/images/logo.webp" type="image/webp"/>
              <img class="office-roster-logo" src="/images/logo.png" alt="LAVAALL" width="180" height="48"/>
            </picture>
          </div>
          ${rosterButtons()}
        </aside>
      </div>
      <div class="office-rest">
        ${persistenceBanner(snapshot.durable)}
        <h1>Office</h1>
        <p class="office-lead">Who sits where. Talk opens that desk’s chat — all six desks, including Researchy.</p>
        <div class="office-cards" id="office-cards">${agentCards()}</div>
        <section class="office-dash" id="office-dash">
          <div class="kicker">Below the room</div>
          <h2>Dashboard</h2>
          <p class="office-lead">Goal, unfinished work, and a place to capture the next thing.</p>
          ${dashboardSections({ snapshot, returnTo: '/ops/office' })}
        </section>
      </div>
    `,
  });
}

module.exports = {
  CARD_CAMERA,
  DEFAULT_CAMERA_ID,
  OFFICE_AGENTS,
  OFFICE_CAMERAS,
  OFFICE_HOTSPOTS,
  OFFICE_WORDMARK,
  RESEARCHY_PORTRAIT,
  TALK_AGENT_IDS,
  cropPosition,
  isTalkAgent,
  normalizeTalkAgentId,
  officeAgentById,
  officePage,
  talkHref,
};
