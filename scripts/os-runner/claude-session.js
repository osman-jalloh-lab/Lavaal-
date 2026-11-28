// scripts/os-runner/claude-session.js — drive one Claude Code builder run over its stdio JSON protocol. Box only.
//
// Claude Code is started with --input-format stream-json --output-format stream-json --permission-prompt-tool stdio.
// Then, instead of drawing a terminal prompt it cannot show, it sends a `control_request` (subtype `can_use_tool`) on
// stdout whenever a tool is not already allowed, and waits for our `control_response` on stdin. `decide` answers each
// one: the runner's policy, and for some requests Osman's own answer on the Build page (scripts/os-runner/index.js).
//
// Order on stdin: an `initialize` control request, then the task as one `user` message. stdin closes after the
// `result` event so the CLI exits. The work timer pauses while a request waits for an answer, so a slow answer does
// not eat the builder's time; the wait itself is capped by `decide`.
'use strict';
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const progress = require('./progress');

const MAX_REQUESTS = 200;

function runClaudeSession({ bin, args, prompt, cwd, env, timeout, onLine, decide, spawnImpl }) {
  return new Promise((resolve, reject) => {
    if (!env) return reject(new Error('missing_command_environment'));
    const child = (spawnImpl || spawn)(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const initId = 'init-' + randomUUID();
    let finished = false;
    let started = false;
    let sawResult = false;
    let resultError = false;
    let requests = 0;
    let waiting = 0;
    let budget = timeout || 20 * 60 * 1000;
    let timer = null;
    let since = 0;

    const stop = (err) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      reject(err);
    };
    // The work timer runs only while nothing is waiting for Osman.
    const resume = () => { if (finished || timer) return; since = Date.now(); timer = setTimeout(() => stop(new Error('command_failed')), Math.max(1, budget)); };
    const pause = () => { if (!timer) return; clearTimeout(timer); timer = null; budget -= Date.now() - since; };
    const write = (obj) => { if (!finished) { try { child.stdin.write(JSON.stringify(obj) + '\n'); } catch { /* closed */ } } };
    const respond = (id, response) => write({ type: 'control_response', response: { subtype: 'success', request_id: id, response } });

    async function onRequest(msg) {
      const id = String(msg.request_id || '');
      const req = msg.request && typeof msg.request === 'object' ? msg.request : {};
      if (!id) return;
      if (req.subtype !== 'can_use_tool' || typeof req.tool_name !== 'string') {
        write({ type: 'control_response', response: { subtype: 'error', request_id: id, error: 'This request is not supported by the LAVAALL builder.' } });
        return;
      }
      requests += 1;
      if (requests > MAX_REQUESTS) { stop(new Error('too_many_requests')); return; }
      waiting += 1;
      pause();
      let answer;
      try { answer = await decide({ tool: req.tool_name, input: req.input && typeof req.input === 'object' ? req.input : {} }); } catch { answer = null; }
      waiting -= 1;
      if (!answer || (answer.behavior !== 'allow' && answer.behavior !== 'deny')) answer = { behavior: 'deny', message: 'Not allowed.' };
      respond(id, answer.behavior === 'allow'
        ? { behavior: 'allow', updatedInput: req.input && typeof req.input === 'object' ? req.input : {} }
        : { behavior: 'deny', message: String(answer.message || 'Not allowed.').slice(0, 2000) });
      if (!waiting) resume();
    }

    const lines = progress.lineSplitter((line) => {
      if (typeof onLine === 'function') onLine(line);
      const s = String(line || '').trim();
      if (!s || s[0] !== '{') return;
      let msg;
      try { msg = JSON.parse(s); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'control_response' && msg.response && msg.response.request_id === initId && !started) {
        started = true;
        write({ type: 'user', message: { role: 'user', content: String(prompt || '') }, parent_tool_use_id: null, session_id: '' });
        return;
      }
      if (msg.type === 'control_request') { onRequest(msg); return; }
      if (msg.type === 'result') {
        sawResult = true;
        resultError = msg.is_error === true || (typeof msg.subtype === 'string' && msg.subtype !== 'success');
        try { child.stdin.end(); } catch { /* closed */ }
      }
    });

    child.stdout.on('data', (x) => lines.push(x));
    child.stderr.resume();
    child.stdin.on('error', () => { /* the CLI closed its input; close() reports the outcome */ });
    child.on('error', () => stop(new Error('command_failed')));
    child.on('close', (code) => {
      lines.end();
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (code === 0 && sawResult && !resultError) resolve({ code });
      else reject(new Error('command_failed'));
    });
    resume();
    write({ type: 'control_request', request_id: initId, request: { subtype: 'initialize', hooks: {} } });
  });
}

module.exports = { MAX_REQUESTS, runClaudeSession };
