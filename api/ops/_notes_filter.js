// api/ops/_notes_filter.js — what keeps a vault note off /os. Underscore-prefixed, so Vercel does not treat it as a function.
//
// One detector, used twice: scripts/build-notes-pack.js drops notes with it on the founder's PC, and the notes feed
// (api/ops/_os_feeds.js) refuses a push that still holds any of it. It is precise on purpose. A note is dropped only for:
//   email        a real email address (a bare "@handle" or a lone "@" is fine)
//   phone        a phone number: 7 or more digits, with optional +, spaces, dashes or parentheses. Dates, times, version
//                numbers, PR numbers and long ids inside URLs are ignored
//   blocked-word one of four words that must never appear (built from pieces: the repo is public)
//   lead-data    a title or path that names a lead list, an outreach batch, a quote request or an RFQ, or a body with a
//                markdown table that has a Name, Business, Contact, School or Hotel column
// Everything else is kept, including notes that just use the words "lead", "customer" or "@". Reasons are category names,
// never a piece of the note.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Built from pieces on purpose: this file is committed to a public repo.
const BLOCKED_WORD = new RegExp(['star' + 'link', 'gui' + 'nea', 'na' + 'tca', 'space' + 'x'].join('|'), 'i');
const LEAD_TITLE = /lead list|leads?\b.*(list|batch)|outreach.*(sent|batch|emails?)|hotel.*batch|school.*batch|quote request|rfq/i;
const TABLE_COLUMN = /\b(name|business|contact|school|hotel)s?\b/i;

const URL_RE = /https?:\/\/\S+/g;

// Text with the things that look like a phone number but are not removed: dates, times, versions, URLs, money.
// Guards use lookarounds, not \b, so "2026-10-23T14:00" and "2026-10-23_notes" still count as dates.
function withoutLookalikes(text) {
  return String(text)
    .replace(URL_RE, ' ')
    .replace(/(?<![\d.])(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])(?!\d)/g, ' ') // 2026-10-23
    .replace(/(?<![\d.])(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)?\d{2}(?!\d)/g, ' ') // 23/10/2026
    .replace(/(?<!\d)(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?!\d)/g, ' ') // 20261023
    .replace(/(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]m)?(?!\d)/gi, ' ') // 6:02 PM, 14:32:10
    .replace(/(?<![\w.])v?\d{1,2}(?:\.\d{1,3}){1,3}(?![\w.]*\d)/gi, ' ') // 1.2.3, v10.14.6
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, ' ') // $25.00
    .replace(/#\d+/g, ' ') // PR and issue numbers: #67
    .replace(/\d+\s?[×x]\s?\d+/gi, ' ') // sizes: 1920x1080
    .replace(/(?<!\d)(?:19|20)\d{2}\s?[-–]\s?(?:19|20)\d{2}(?!\d)/g, ' '); // year ranges: 2025-2026
}

// The runs that count as phone numbers: 7 to 15 digits, joined only by optional +, spaces, dashes and parentheses
// (and dots in the 3.3.4 form). Returned so the builder's tests can look at what matched.
function phoneMatches(text) {
  const s = withoutLookalikes(text);
  const out = [];
  (s.match(/(?<![\d.])\d{3}\.\d{3}\.\d{4}(?!\d)/g) || []).forEach((m) => out.push(m));
  // Not part of an identifier: no letter or digit glued on either side (abc12345678, ABC-1234-56789).
  (s.match(/(?<!\w-?)\+?\(?\d[\d \t()-]{5,}\d(?!\w)/g) || []).forEach((run) => {
    const digits = run.replace(/\D/g, '').length;
    if (digits >= 7 && digits <= 15) out.push(run);
  });
  return out;
}

function hasPhone(text) {
  return phoneMatches(text).length > 0;
}

// A markdown table whose header row has a Name / Business / Contact / School / Hotel column.
function hasLeadTable(body) {
  const lines = String(body).replace(/\r\n/g, '\n').split('\n');
  const isSeparator = (l) => /\|/.test(l) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  for (let i = 1; i < lines.length; i += 1) {
    if (!isSeparator(lines[i]) || !/\|/.test(lines[i - 1])) continue;
    const cells = lines[i - 1].split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.some((c) => c.length <= 40 && TABLE_COLUMN.test(c))) return true;
  }
  return false;
}

// Every reason a note must not ship, as category names (empty array = clean).
// fields: { title, path?, body, tags?, source?, url?, status? }
function dropReasons(fields) {
  const f = fields || {};
  const tags = Array.isArray(f.tags) ? f.tags.join(' ') : String(f.tags || '');
  const all = [f.title, f.path, f.body, tags, f.source, f.url, f.status].filter((x) => x != null).join('\n');
  const reasons = [];
  if (BLOCKED_WORD.test(all)) reasons.push('blocked-word');
  if (EMAIL.test(all)) reasons.push('email');
  if (hasPhone(all)) reasons.push('phone');
  if (LEAD_TITLE.test(`${f.title || ''}\n${f.path || ''}`) || hasLeadTable(f.body || '')) reasons.push('lead-data');
  return reasons;
}

module.exports = { BLOCKED_WORD, EMAIL, LEAD_TITLE, dropReasons, hasLeadTable, hasPhone, phoneMatches };
