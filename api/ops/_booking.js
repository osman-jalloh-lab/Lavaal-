// Public Schedule-a-Call → /ops calendar + inbox mirror.
// L2 only: no customer email SEND. Underscore prefix: not a Vercel function.

const { addEvent, addInboxItem, takePendingBooking } = require('./_store');

const REASON_LABELS = Object.freeze({
  'sales-quotation': 'Sales or quotation',
  availability: 'Product availability',
  procurement: 'Equipment procurement',
  networking: 'Networking',
  servers: 'Servers and infrastructure',
  computers: 'Computers and workstations',
  'fiber-cabling': 'Fiber optic or cabling',
  installation: 'Installation',
  support: 'Customer support',
  technical: 'Technical support',
  order: 'Existing order',
  partnership: 'Partnership',
  general: 'General inquiry',
  other: 'Other',
});

function reasonLabel(reason) {
  const key = String(reason || '');
  return REASON_LABELS[key] || key || 'Scheduled call';
}

function addMinutes(hhmm, mins) {
  const parts = String(hhmm || '').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function pick(pending, fallback, key) {
  return (pending && pending[key]) || fallback || '';
}

async function recordPublicBooking({
  leadId,
  date,
  time,
  meetLink,
  firstName,
  lastName,
  email,
  phone,
  company,
  reason,
  method,
  note,
}) {
  let pending = null;
  if (leadId) {
    try {
      const taken = await takePendingBooking(leadId);
      pending = taken && taken.booking ? taken.booking : null;
    } catch {
      pending = null;
    }
  }

  const whoName = [pick(pending, firstName, 'firstName'), pick(pending, lastName, 'lastName')]
    .filter(Boolean)
    .join(' ') || 'Guest';
  const companyName = pick(pending, company, 'company');
  const who = companyName ? `${whoName} (${companyName})` : whoName;
  const what = reasonLabel(pick(pending, reason, 'reason'));
  const how = pick(pending, method, 'method');
  const when = `${date} ${time} Africa/Freetown`;
  const context = [
    `Who: ${who}`,
    `When: ${when}`,
    `What: ${what}`,
    how ? `How: ${how}` : '',
    pick(pending, email, 'email') ? `Email: ${pick(pending, email, 'email')}` : '',
    pick(pending, phone, 'phone') ? `Phone: ${pick(pending, phone, 'phone')}` : '',
    pick(pending, note, 'note') ? `Note: ${pick(pending, note, 'note')}` : '',
    meetLink ? `Meet: ${meetLink}` : '',
    leadId ? `Lead: ${leadId}` : '',
  ].filter(Boolean).join('\n');

  const confirmation = {
    who,
    when,
    what,
    method: how,
    meetLink: meetLink || '',
    leadId: leadId || '',
  };

  let event = null;
  let inboxItem = null;
  const end = addMinutes(time, 30);
  try {
    const saved = await addEvent({
      title: `Call: ${whoName} — ${what}`,
      date,
      start: time,
      end: end && end > time ? end : '',
      allDay: !(end && end > time),
      timezone: 'Africa/Freetown',
      attendees: [],
      notes: context,
      createdBy: 'public-schedule',
    });
    if (saved && saved.event) event = saved.event;
  } catch {
    event = null;
  }

  try {
    const saved = await addInboxItem({
      source: 'paste',
      from: pick(pending, email, 'email') || 'schedule@lavaall.com',
      subject: `Scheduled call — ${whoName} — ${date} ${time}`,
      body: context,
      snippet: `${whoName} · ${when} · ${what}`,
      label: 'task',
      createdBy: 'public-schedule',
    });
    if (saved && saved.item) inboxItem = saved.item;
  } catch {
    inboxItem = null;
  }

  return { confirmation, event, inboxItem };
}

module.exports = {
  REASON_LABELS,
  reasonLabel,
  recordPublicBooking,
};
