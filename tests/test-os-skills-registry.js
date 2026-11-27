// LAVAALL OS skills registry (Phase 2): api/os/_data/skills.json is the one git registry. It parses, ids are unique,
// nothing is executable, every imported skill pins its source and hash, the text in git matches that hash, nothing
// from the never-load list is in it, and no sidecar files (scripts, tool folders) came with the SKILL.md copies.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

let reg = null;
try { reg = JSON.parse(fs.readFileSync(path.join(root, 'api/os/_data/skills.json'), 'utf8')); } catch { reg = null; }
check('skills.json parses as an array', Array.isArray(reg));
reg = Array.isArray(reg) ? reg : [];
check('70 skills: the 54 existing rows plus 16 imported', reg.length === 70);
check('ids are unique', new Set(reg.map((r) => r.id)).size === reg.length);
check('every row has id, name, a whenToUse string and a desks array', reg.every((r) => /^[a-z0-9-]+$/.test(r.id) && typeof r.name === 'string' && r.name && typeof r.whenToUse === 'string' && Array.isArray(r.desks)));
check('no entry has execution_allowed true', reg.every((r) => r.execution_allowed !== true));
check('no entry is marked reviewed', reg.every((r) => r.reviewed !== true));

const imported = reg.filter((r) => r.instructions_only === true);
check('40 imported skills (24 starter rows updated, 16 new)', imported.length === 40);
check('every imported skill: instructions_only true, execution_allowed false, reviewed false', imported.every((r) => r.instructions_only === true && r.execution_allowed === false && r.reviewed === false));
check('every imported skill pins a box source_path and a sha256', imported.every((r) => /^\/home\/box\/agent-data\/workflows\/[a-z0-9-]+\/SKILL\.md$/.test(r.source_path) && /^[0-9a-f]{64}$/.test(r.sha256)));
check('source_path folder matches the id', imported.every((r) => r.source_path.split('/').slice(-2, -1)[0] === r.id));
check('every imported skill text is in git and matches its pinned sha256', imported.every((r) => {
  const p = path.join(root, r.repo_path || '');
  if (r.repo_path !== `docs/os/skills/${r.id}/SKILL.md` || !fs.existsSync(p)) return false;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') === r.sha256;
}));
const starter = ['business-handoff', 'permission-gate', 'plain-rephrase', 'research-primary', 'brand-check', 'feature-spec', 'magnum-sync', 'skill-author', 'tdd', 'to-tickets', 'ceo-router', 'daily-brief', 'decision-log', 'domain-glossary', 'grill-founder', 'regulatory-research', 'crm-sheet-hygiene', 'inquiry-triage', 'quote-pack', 'supplier-evaluation', 'supplier-outreach', 'code-review', 'diagnose-bug', 'website-qa'];
check('all 24 starter skills are imported', starter.every((id) => imported.some((r) => r.id === id)));
const fresh = imported.filter((r) => !starter.includes(r.id));
check('the 16 new rows have no invented desk and a whenToUse from their frontmatter', fresh.length === 16 && fresh.every((r) => r.desks.length === 0 && r.whenToUse.length > 20));

const never = ['brandkit', 'image-to-code', 'imagegen-frontend-web', 'imagegen-frontend-mobile', 'design', 'brand', 'banner-design', 'slides', 'design-system', 'extract-design-system', 'react-bits'];
check('no never-load id is in the registry', reg.every((r) => !never.includes(r.id)));
check('the never-load list is kept with the skills', /# NEVER-LOAD list/.test(fs.readFileSync(path.join(root, 'docs/os/skills/NEVER-LOAD.md'), 'utf8')));

const skillDir = path.join(root, 'docs/os/skills');
const all = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else all.push(path.relative(skillDir, p).split(path.sep).join('/')); }); })(skillDir);
check('instructional text only: SKILL.md copies plus NEVER-LOAD.md, no sidecar files', all.every((f) => f === 'NEVER-LOAD.md' || /^[a-z0-9-]+\/SKILL\.md$/.test(f)) && all.length === 41);
check('every skill folder is in the registry', all.filter((f) => f !== 'NEVER-LOAD.md').every((f) => imported.some((r) => r.repo_path === `docs/os/skills/${f}`)));
const outreach = fs.readFileSync(path.join(skillDir, 'supplier-outreach/SKILL.md'), 'utf8').split('\n')[25] || '';
check('supplier-outreach line 26 keeps its [REDACTED] contact', /\[REDACTED\]/.test(outreach) && /support@lavaall\.com/.test(outreach));
const texts = all.map((f) => fs.readFileSync(path.join(skillDir, f), 'utf8')).join('\n');
check('no secret values in the skill texts', !/-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[abp]-|AIza[0-9A-Za-z_-]{30,}|\bsk-[A-Za-z0-9]{20,}/.test(texts));
const emails = (texts.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).filter((e) => e !== 'support@lavaall.com');
check('the only email address is support@lavaall.com', emails.length === 0);

const { skillsFrom } = require(path.join(root, 'api/ops/_os_data.js'));
const view = skillsFrom({ skills: reg });
check('the OS view never marks a skill executable', view.length === 70 && view.every((s) => s.executionAllowed === false) && view.filter((s) => s.instructionsOnly).length === 40);

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.name}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
