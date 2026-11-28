// Builds a compact, privacy-filtered repository digest and sends one heartbeat per run.
const { dropReasons } = require('../api/ops/_notes_filter');

const INGEST_URL = 'https://www.lavaall.com/api/os/ingest/repo-status';
const GITHUB_API = 'https://api.github.com';
const HARD_CAP = 20 * 1024;
const TARGET_CAP = 19 * 1024;
const DEFAULT_REPO = 'osman-jalloh-lab/Lavaal-';

function safeUrl(value, fallback) {
  if (!value || value === fallback) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port && !url.username && !url.password && !url.hash) return value;
  } catch (_) { /* Ignore unsafe overrides. */ }
  return fallback;
}
function iso(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
}
function validWatermark(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const fraction = value.match(/\.(\d+)Z$/);
  const millis = fraction ? fraction[1].padEnd(3, '0') : '000';
  return date.toISOString() === `${value.slice(0, 19)}.${millis}Z` ? date.getTime() : null;
}
function clean(value, limit) {
  const text = String(value || '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]').replace(/@/g, '[at]').slice(0, limit).trim();
  return !text || dropReasons({ title: text }).length ? '[title withheld]' : text;
}
function shortSha(value) {
  const sha = String(value || '').slice(0, 7);
  return /^[0-9a-f]{7}$/.test(sha) ? sha : null;
}
function resultOf(run) {
  if (['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(run.status)) return 'pending';
  if (run.status !== 'completed') return null;
  if (run.conclusion === 'success') return 'pass';
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion)) return 'fail';
  if (run.conclusion === 'cancelled') return 'cancelled';
  if (['skipped', 'neutral', 'stale'].includes(run.conclusion)) return 'skipped';
  return null;
}
function buildDigest({ repo = DEFAULT_REPO, trigger = 'schedule', now = Date.now(), since, pulls = [], commits = [], runs = [], headSha }) {
  const generatedAt = iso(now);
  const sinceIso = iso(since);
  const merges = pulls.filter(p => p.merged_at && Date.parse(p.merged_at) >= Date.parse(sinceIso)).map(p => ({
    pr: p.number, sha: shortSha(p.merge_commit_sha), title: clean(p.title, 140), branch: clean(p.head && p.head.ref, 100),
    at: iso(p.merged_at), kind: String(p.title || '').startsWith('Activity:') || String(p.head && p.head.ref || '').startsWith('os-activity/') ? 'activity-log' : 'merge'
  })).filter(p => Number.isSafeInteger(p.pr) && p.pr > 0 && p.sha && p.at).sort((a, b) => b.at.localeCompare(a.at));
  const commitRows = commits.map(c => ({ sha: shortSha(c.sha), title: clean(String(c.commit && c.commit.message || '').split(/\r?\n/, 1)[0], 140), at: iso(c.commit && c.commit.committer && c.commit.committer.date) }))
    .filter(c => c.sha && c.at).sort((a, b) => b.at.localeCompare(a.at));
  const checks = runs.map(r => ({ name: clean(r.name, 100), runId: r.id, sha: shortSha(r.head_sha), result: resultOf(r),
    pr: r.pull_requests && r.pull_requests[0] && r.pull_requests[0].number || null, url: r.html_url }))
    .filter(r => Number.isSafeInteger(r.runId) && r.runId > 0 && r.sha && r.result && (r.pr === null || Number.isSafeInteger(r.pr) && r.pr > 0) && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:actions\/runs|pull)\/\d+$/.test(r.url));
  return { repo, branch: 'main', generatedAt, since: sinceIso, trigger, headSha: shortSha(headSha),
    summary: { merges: merges.length, commits: commitRows.length, checksPass: checks.filter(c => c.result === 'pass').length,
      checksFail: checks.filter(c => c.result === 'fail').length, checksPending: checks.filter(c => c.result === 'pending').length,
      checksOther: checks.filter(c => c.result === 'cancelled' || c.result === 'skipped').length },
    merges: merges.slice(0, 20), commits: commitRows.slice(0, 20), checks: checks.slice(0, 20) };
}
function trim(body) {
  const bytes = () => Buffer.byteLength(JSON.stringify(body));
  for (const key of ['checks', 'commits', 'merges']) {
    while (bytes() > TARGET_CAP && body[key].length) body[key].pop();
  }
  return bytes() <= TARGET_CAP ? body : null;
}
async function request(fetchImpl, url, options) {
  return fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
}
async function collect({ fetchImpl, githubApi, githubToken, repo, since }) {
  const base = `${githubApi}/repos/${repo}`;
  const headers = { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function get(path) {
    const response = await request(fetchImpl, base + path, { method: 'GET', headers });
    if (!response.ok) throw new Error('github request failed');
    return response.json();
  }
  const [pulls, commits, ref, actions] = await Promise.all([
    get('/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50'),
    get(`/commits?sha=main&since=${encodeURIComponent(since)}&per_page=30`),
    get('/git/ref/heads/main'),
    get(`/actions/runs?created=%3E%3D${encodeURIComponent(since)}&per_page=50`)
  ]);
  if (!Array.isArray(pulls) || !Array.isArray(commits) || !Array.isArray(actions.workflow_runs) || !shortSha(ref.object && ref.object.sha)) throw new Error('invalid github response');
  return { pulls, commits, runs: actions.workflow_runs, headSha: ref.object.sha };
}
async function run(options = {}) {
  const env = options.env || process.env;
  const secret = options.secret !== undefined ? options.secret : env.OPS_CEO_BRIDGE_SECRET;
  const log = options.log || console.log;
  if (!secret) { log('os-repo-status: skipped (ingest secret not configured)'); return 0; }
  const token = options.githubToken !== undefined ? options.githubToken : env.GITHUB_TOKEN;
  const trigger = options.trigger || env.GITHUB_EVENT_NAME || 'schedule';
  const repo = options.repo || env.GITHUB_REPOSITORY || DEFAULT_REPO;
  if (!token || !['schedule', 'push', 'workflow_dispatch'].includes(trigger) || !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)) { log('os-repo-status: configuration error'); return 1; }
  const fetchImpl = options.fetchImpl || fetch;
  const ingestUrl = safeUrl(options.ingestUrl || env.OS_INGEST_URL, INGEST_URL);
  const githubApi = safeUrl(options.githubApi || env.GITHUB_API_URL, GITHUB_API).replace(/\/$/, '');
  const now = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  let watermark = now - 70 * 60 * 1000;
  try {
    const response = await request(fetchImpl, ingestUrl, { method: 'GET', headers: { Authorization: `Bearer ${secret}` } });
    if (response.ok) {
      const data = await response.json();
      const parsed = validWatermark(data && data.latest && data.latest.generatedAt);
      if (parsed !== null) watermark = parsed;
    }
  } catch (_) { /* Fall back to a bounded lookback. */ }
  const since = iso(Math.min(now, Math.max(now - 48 * 60 * 60 * 1000, watermark)));
  try {
    const data = await collect({ fetchImpl, githubApi, githubToken: token, repo, since });
    const body = trim(buildDigest({ repo, trigger, now, since, ...data }));
    if (!body || !body.generatedAt || !body.headSha) { log('os-repo-status: payload error'); return 1; }
    const json = JSON.stringify(body);
    const response = await request(fetchImpl, ingestUrl, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: json });
    if (!response.ok) { log(`os-repo-status: failed HTTP ${response.status}`); return 1; }
    log(`os-repo-status: posted HTTP ${response.status} (merges=${body.summary.merges} commits=${body.summary.commits} checks=${body.summary.checksPass + body.summary.checksFail + body.summary.checksPending + body.summary.checksOther} bytes=${Buffer.byteLength(json)})`);
    return 0;
  } catch (_) { log('os-repo-status: network error'); return 1; }
}
async function main() { process.exitCode = await run(); }
if (require.main === module) main();
module.exports = { INGEST_URL, GITHUB_API, HARD_CAP, TARGET_CAP, safeUrl, buildDigest, collect, trim, run, main };
