// scripts/os-runner/progress.js — live progress for a builder run. Runs on Drake's box, never on Vercel.
//
// The builders print one JSON event per line (Claude Code: --output-format stream-json; Codex: exec --json). This turns
// each event into one short line for the Build page ("Editing api/os/_client/build.js", "Tests passed"), and keeps the
// last few in KV under the job. A line shows a tool, a relative path or a short note: never file contents, command
// output or anything that looks like a key. Progress is best effort: a failed write never fails the build.
'use strict';

const MAX_TEXT = 160;
const MAX_ITEMS = 40;
const MAX_EVENT = 256 * 1024;
const KEEP_SECONDS = 7 * 24 * 3600;
const FLUSH_MS = 3000;

// Strip terminal codes and anything shaped like a credential before a line leaves the box.
function redact(text) {
  return String(text == null ? '' : text)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\b(?:ghp|gho|ghu|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '$1 [redacted]')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text, max) {
  const t = redact(text);
  const n = max || MAX_TEXT;
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// Paths inside the worktree are shown relative to it; anything outside shows its last two parts only.
function relPath(p, cwd) {
  const s = String(p || '').replace(/\\/g, '/');
  if (!s) return '';
  const base = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (base && s.startsWith(base + '/')) return s.slice(base.length + 1);
  return s.split('/').filter(Boolean).slice(-2).join('/');
}

const CLAUDE_TOOLS = { Read: 'Reading', Edit: 'Editing', MultiEdit: 'Editing', Write: 'Writing', NotebookEdit: 'Editing' };

function claudeTool(block, cwd) {
  const name = String(block.name || '');
  const input = block.input && typeof block.input === 'object' ? block.input : {};
  if (CLAUDE_TOOLS[name]) {
    const file = relPath(input.file_path || input.notebook_path || input.path, cwd);
    return { kind: name === 'Read' ? 'read' : 'edit', text: CLAUDE_TOOLS[name] + (file ? ' ' + file : ' a file') };
  }
  if (name === 'Glob' || name === 'Grep') return { kind: 'search', text: 'Searching ' + (name === 'Grep' ? 'code' : 'files') };
  if (name === 'TodoWrite') return { kind: 'plan', text: 'Updated its plan' };
  return { kind: 'tool', text: 'Using ' + clip(name, 40) };
}

// One Claude Code stream-json event -> zero or more progress items.
function fromClaude(ev, cwd) {
  if (ev.type === 'system' && ev.subtype === 'init') return [{ kind: 'stage', text: 'Claude started' + (ev.model ? ' (' + clip(ev.model, 40) + ')' : '') }];
  if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
    const out = [];
    for (const block of ev.message.content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'tool_use') out.push(claudeTool(block, cwd));
      else if (block.type === 'text' && String(block.text || '').trim()) out.push({ kind: 'note', text: clip(String(block.text).split('\n').find((l) => l.trim()) || '') });
    }
    return out;
  }
  if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
    return ev.message.content.filter((b) => b && b.type === 'tool_result' && b.is_error === true).map(() => ({ kind: 'warn', text: 'A tool step did not work; Claude is trying another way' }));
  }
  if (ev.type === 'result') {
    const turns = Number.isFinite(ev.num_turns) ? ev.num_turns + ' steps' : '';
    const mins = Number.isFinite(ev.duration_ms) ? Math.max(1, Math.round(ev.duration_ms / 60000)) + ' min' : '';
    const meta = [turns, mins].filter(Boolean).join(', ');
    return [ev.is_error || (ev.subtype && ev.subtype !== 'success')
      ? { kind: 'error', text: 'Claude stopped before finishing' + (meta ? ' (' + meta + ')' : '') }
      : { kind: 'stage', text: 'Claude finished' + (meta ? ' (' + meta + ')' : '') }];
  }
  return [];
}

// One Codex exec --json event -> zero or more progress items. Unknown event shapes are skipped, never guessed at.
function fromCodex(ev, cwd) {
  const item = ev.item && typeof ev.item === 'object' ? ev.item : null;
  if (ev.type === 'thread.started') return [{ kind: 'stage', text: 'Codex started' }];
  if (ev.type === 'turn.failed' || ev.type === 'error') return [{ kind: 'error', text: 'Codex reported an error' }];
  if (ev.type === 'turn.completed') return [{ kind: 'stage', text: 'Codex finished a turn' }];
  if (!item) return [];
  if (ev.type === 'item.started' && item.type === 'command_execution') return [{ kind: 'tool', text: 'Running a command' }];
  if (ev.type !== 'item.completed') return [];
  if (item.type === 'file_change' && Array.isArray(item.changes)) {
    return item.changes.slice(0, 5).map((c) => ({ kind: 'edit', text: (c && c.kind === 'add' ? 'Writing ' : c && c.kind === 'delete' ? 'Deleting ' : 'Editing ') + (relPath(c && c.path, cwd) || 'a file') }));
  }
  if (item.type === 'agent_message' && String(item.text || '').trim()) return [{ kind: 'note', text: clip(String(item.text).split('\n').find((l) => l.trim()) || '') }];
  if (item.type === 'command_execution' && Number.isFinite(item.exit_code) && item.exit_code !== 0) return [{ kind: 'warn', text: 'A command did not work; Codex is trying another way' }];
  if (item.type === 'web_search') return [{ kind: 'search', text: 'Searching the web' }];
  return [];
}

// One raw output line -> progress items. Non-JSON, oversized or unknown lines give nothing.
function progressFromLine(executor, line, cwd) {
  const s = String(line || '').trim();
  if (!s || s.length > MAX_EVENT || s[0] !== '{') return [];
  let ev;
  try { ev = JSON.parse(s); } catch { return []; }
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return [];
  const items = executor === 'claude' ? fromClaude(ev, cwd) : fromCodex(ev, cwd);
  return items.filter((i) => i && i.text).map((i) => ({ kind: i.kind, text: clip(i.text) }));
}

// Buffers items and writes them to KV in small batches: RPUSH, keep the last MAX_ITEMS, expire after a week.
// Repeats of the same line in a row (Claude reading file after file) are folded into one with a count.
function progressLog({ call, key, now = () => Date.now(), flushMs = FLUSH_MS }) {
  let pending = [];
  let last = null;
  let timer = null;
  let writing = Promise.resolve();
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending.length) return writing;
    const batch = pending.map((i) => JSON.stringify(i));
    pending = [];
    writing = writing.then(async () => {
      try {
        await call(['RPUSH', key, ...batch]);
        await call(['LTRIM', key, -MAX_ITEMS, -1]);
        await call(['EXPIRE', key, KEEP_SECONDS]);
      } catch { /* progress is best effort */ }
    });
    return writing;
  };
  const add = (kind, text) => {
    const t = clip(text);
    if (!t) return;
    if (last && last.kind === kind && last.base === t && pending.length && pending[pending.length - 1] === last.item) {
      last.count += 1;
      last.item.text = t + ' (x' + last.count + ')';
      return;
    }
    const item = { at: new Date(now()).toISOString(), kind: String(kind || 'note').slice(0, 12), text: t };
    pending.push(item);
    last = { kind: item.kind, base: t, count: 1, item };
    if (!timer && flushMs > 0) timer = setTimeout(flush, flushMs);
  };
  return { add, flush };
}

// Splits a byte stream into whole lines. Lines longer than MAX_EVENT are dropped; the stream keeps going.
function lineSplitter(onLine) {
  let buf = '';
  let skipping = false;
  return {
    push(chunk) {
      buf += String(chunk);
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (skipping) { skipping = false; continue; }
        try { onLine(line); } catch { /* a bad line never stops the run */ }
      }
      if (buf.length > MAX_EVENT) { buf = ''; skipping = true; }
    },
    end() { if (buf && !skipping) { try { onLine(buf); } catch { /* ignore */ } } buf = ''; },
  };
}

module.exports = { KEEP_SECONDS, MAX_ITEMS, MAX_TEXT, clip, lineSplitter, progressFromLine, progressLog, redact, relPath };
