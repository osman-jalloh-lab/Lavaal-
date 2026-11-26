// api/ops/_voice.js — Jarvis, the voice of LAVAALL OS. Founder-only.
// Underscore-prefixed, so Vercel does not treat it as a function.
//
// POST /ops/voice/session mints a short-lived OpenAI Realtime client secret for the browser's WebRTC call.
// The real OPENAI_API_KEY never leaves the server; the browser gets a secret that expires in about a minute.
// OpenAI is ears and mouth only: for anything real, Jarvis calls the ask_os tool, which the page answers
// through the existing /ops/harness/chat (Claude, Codex, DeepSeek or Grok). Never logs keys or audio.

const { json, readBody, looksLikeAgentRequest, queryOf } = require('./_lib');
const { readLiveSession } = require('./_signin_hardening');

const REALTIME_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const VOICES = Object.freeze(['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'sage', 'shimmer', 'verse']);
const VIEWS = Object.freeze(['home', 'build', 'progress', 'saved', 'talk', 'harness', 'decisions', 'outreach', 'spend', 'notes', 'brain', 'desks', 'routines', 'council', 'settings']);

const INSTRUCTIONS = [
  "You are Jarvis, the voice of LAVAALL OS, on a live call with Osman, the founder. LAVAALL is an electronics and IT sourcing marketplace for Sierra Leone; SaloneHire (SaloneWorks) is its recruitment platform. Speak English, warm and concise, like a sharp assistant. You can be interrupted; if so, stop and listen.",
  "You have no knowledge, memory or data of your own. For anything real (facts, status, numbers, names, dates, decisions, projects, research, writing or code), call ask_os with the request in clear words, then say only what it returns, in a short natural wrapper. Never guess, never invent prices, stock, suppliers or people.",
  "To move Osman around the OS, call navigate with the page: home, build (what is being built), progress (goals), saved (saved memories), talk (chat with the desks), harness (AI models chat), decisions, outreach, spend (money), notes, brain (memory graph), desks, routines, council, settings. Then say a short confirming line.",
  "When Osman says remember, note or save something, call save_memory with exactly what to remember, then confirm in one short line.",
  "You can never send, post, deploy, merge, pay or spend. If asked, say Osman has to approve that in the OS.",
].join(' ');

const TOOLS = [
  {
    type: 'function',
    name: 'ask_os',
    description: "Hand a request to LAVAALL OS's AI team (Claude, Codex, DeepSeek or Grok, picked by the OS). Use for anything that needs real information, thinking, writing or code. Returns the answer to speak.",
    parameters: {
      type: 'object',
      properties: { request: { type: 'string', description: "Osman's request, phrased clearly and completely." } },
      required: ['request'],
    },
  },
  {
    type: 'function',
    name: 'save_memory',
    description: "Save something Osman asked the OS to remember. It appears under Memory, Saved.",
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What to remember, in one or two clear sentences.' } },
      required: ['text'],
    },
  },
  {
    type: 'function',
    name: 'navigate',
    description: 'Open a page of LAVAALL OS. Use whenever Osman asks to go to, open or show a section.',
    parameters: {
      type: 'object',
      properties: { page: { type: 'string', enum: VIEWS.slice(), description: 'The page to open.' } },
      required: ['page'],
    },
  },
];

function isVoiceRequest(req) {
  const q = queryOf(req);
  const area = String((Array.isArray(q.area) ? q.area[0] : q.area) || '');
  const pathOnly = String(req.url || '').split('?')[0];
  return /(^|\/)voice\/session\/?$/.test(area) || /\/voice\/session\/?$/.test(pathOnly);
}

function sessionConfig(voice) {
  return {
    session: {
      type: 'realtime',
      model: 'gpt-realtime',
      instructions: INSTRUCTIONS,
      tools: TOOLS,
      tool_choice: 'auto',
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 650 },
        },
        output: { voice },
      },
    },
  };
}

async function handleVoice(req, res, opts) {
  if (!isVoiceRequest(req)) return false;
  const env = (opts && opts.env) || process.env;
  const fetchImpl = (opts && opts.fetchImpl) || globalThis.fetch;
  if (looksLikeAgentRequest(req)) { json(res, 403, { error: 'agent_denied' }); return true; }
  const session = opts && opts.session !== undefined ? opts.session : await readLiveSession(req);
  if (!session || !session.email) { json(res, 401, { error: 'sign_in_required' }); return true; }
  if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  const key = String(env.OPENAI_API_KEY || '').trim();
  if (!key) {
    json(res, 409, { error: 'key_missing', message: 'OPENAI_API_KEY is not set on this deployment. Add it in Vercel project settings.' });
    return true;
  }
  const body = readBody(req) || {};
  const voice = VOICES.includes(String(body.voice || '')) ? String(body.voice) : 'marin';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetchImpl(REALTIME_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionConfig(voice)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json().catch(() => null);
    const value = data && (data.value || (data.client_secret && data.client_secret.value));
    if (!response.ok || !value) {
      json(res, 502, { error: 'voice_unavailable', message: 'OpenAI did not start a voice session. Check that the key has Realtime access.' });
      return true;
    }
    json(res, 200, { value: String(value), model: 'gpt-realtime', voice, expiresAt: data.expires_at || null });
  } catch {
    json(res, 504, { error: 'voice_timeout', message: 'OpenAI did not answer in time. Try again.' });
  }
  return true;
}

module.exports = { INSTRUCTIONS, TOOLS, VIEWS, VOICES, handleVoice, isVoiceRequest, sessionConfig };
