// Pure-logic smoke test for booking-router.gs, stubbing out the Google
// services it depends on so we can exercise the slot math in plain node.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, 'booking-router.gs'), 'utf8');

const sandbox = {
  console,
  Utilities: {
    formatDate: (date) => date.toISOString(),
  },
};
vm.runInNewContext(src, sandbox, { filename: 'booking-router.gs' });
const { isWithinBusinessHours, parseSlot, overlapsAny, isFutureSlot } = sandbox;

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

// --- isWithinBusinessHours ---
check('Mon 9:00am is business hours', isWithinBusinessHours(new Date('2026-09-07T09:00:00Z'))); // Monday
check('Mon 8:59am is NOT business hours', !isWithinBusinessHours(new Date('2026-09-07T08:59:00Z')));
check('Mon 4:59pm is business hours', isWithinBusinessHours(new Date('2026-09-07T16:59:00Z')));
check('Mon 5:00pm is NOT business hours (close)', !isWithinBusinessHours(new Date('2026-09-07T17:00:00Z')));
check('Sat is NOT business hours', !isWithinBusinessHours(new Date('2026-09-05T10:00:00Z'))); // Saturday
check('Sun is NOT business hours', !isWithinBusinessHours(new Date('2026-09-06T10:00:00Z'))); // Sunday

// --- parseSlot ---
const slot = parseSlot('2026-09-07', '14:30');
check('parseSlot builds correct UTC instant', slot.toISOString() === '2026-09-07T14:30:00.000Z');

// --- overlapsAny ---
const fakeEvent = { getStartTime: () => new Date('2026-09-07T10:00:00Z'), getEndTime: () => new Date('2026-09-07T10:30:00Z') };
check('overlapsAny detects true overlap', overlapsAny(new Date('2026-09-07T10:15:00Z'), new Date('2026-09-07T10:45:00Z'), [fakeEvent]));
check('overlapsAny allows adjacent non-overlapping slot', !overlapsAny(new Date('2026-09-07T10:30:00Z'), new Date('2026-09-07T11:00:00Z'), [fakeEvent]));
check('overlapsAny allows slot before event', !overlapsAny(new Date('2026-09-07T09:00:00Z'), new Date('2026-09-07T09:30:00Z'), [fakeEvent]));

// --- isFutureSlot ---
const now = new Date();
check('isFutureSlot rejects a slot 5 min from now', !isFutureSlot(new Date(now.getTime() + 5 * 60000)));
check('isFutureSlot accepts a slot 2 hours from now', isFutureSlot(new Date(now.getTime() + 2 * 3600000)));
check('isFutureSlot rejects a slot 30 days from now', !isFutureSlot(new Date(now.getTime() + 30 * 86400000)));

let failed = 0;
for (const r of results) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name);
  if (!r.pass) failed++;
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
