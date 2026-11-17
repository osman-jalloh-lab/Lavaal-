'use strict';
const assert = require('node:assert/strict');
const { normalizeContactPhone: phone, contactPhone } = require('../api/_chat/phone');
const { normalize, handoffPayload } = require('../api/_chat/service');
const { respond } = require('../api/_chat/responder');
const valid = [
  ['+232', '76658960'], ['+224', '620123456'], ['+231', '12345678'],
  ['+231', '775551234'], ['+1', '2025550100'],
];
for (const [code, national] of valid) {
  for (const input of [code + national, code + ' (' + national.slice(0, 2) + ') ' + national.slice(2, 5) + '-' + national.slice(5), '00' + code.slice(1) + national]) {
    assert.ok(phone(input), input);
    assert.ok(normalize({ name: 'Ada Test', phone: input }));
    assert.ok(handoffPayload({ consent: true, fields: { name: 'Ada Test', phone: input, preferredResponse: 'phone', inquiryType: 'customer-support', productOrService: 'laptop', message: 'help' } }, Date.now()));
  }
  const short = code + national.slice(0, code === '+231' ? 7 : -1);
  const long = code + national + (code === '+231' && national.length === 8 ? '00' : '0');
  for (const input of [short, long]) {
    assert.equal(phone(input), null, input);
    assert.throws(() => normalize({ name: 'Ada Test', phone: input }), { code: 'invalid_contact' });
    assert.throws(() => handoffPayload({ consent: true, fields: { name: 'Ada Test', phone: input, preferredResponse: 'phone', inquiryType: 'customer-support', productOrService: 'laptop', message: 'help' } }, Date.now()), { code: 'invalid_contact' });
  }
}
for (const [input, expected] of [
  ['+224 0620123456', '+224620123456'], ['+232 (0)76-658-960', '+23276658960'],
  ['+231 012345678', '+23112345678'], ['+231 0775551234', '+231775551234'],
  ['077 123 456', '+23277123456'], ['+44 7700 900123', '+447700900123'],
  ['+99123456', '+99123456'], ['+991234567890123', '+991234567890123'],
  [' +232 76 000 000 ', '+232 76 000 000'],
]) assert.equal(phone(input), expected);
for (const input of ['+224123456', '+224 123456', '+224 (12)-3456', '+9912345', '+9912345678901234', '620123456', '775551234', '2025550100', '+1 02025550100']) assert.equal(phone(input), null, input);
assert.equal(contactPhone('+224123456').wrongLength.name, 'Guinea');
for (const input of ['+224123456', '+224 123456', '+224 (12)-3456']) {
  assert.throws(() => normalize({ name: 'Ada Test', phone: input }), { code: 'invalid_contact' });
  assert.throws(() => handoffPayload({ consent: true, fields: { name: 'Ada Test', phone: input, preferredResponse: 'phone', inquiryType: 'customer-support', productOrService: 'laptop', message: 'help' } }, Date.now()), { code: 'invalid_contact' });
}

let state = respond('talk to someone');
state = respond('WhatsApp', state);
state = respond('+224620123456', state);
state.awaiting = 'handoff-confirm';
state.handoffDraft.contact = '+224123456';
const blocked = respond('Confirm', state, { privacyConsent: true });
assert.equal(blocked.awaiting, 'handoff-contact');
assert.equal(blocked.handoffPayload, undefined);
assert.equal(blocked.handoffDraft.contact, undefined);
console.log('PASS shared country phone lengths and confirm guard');
