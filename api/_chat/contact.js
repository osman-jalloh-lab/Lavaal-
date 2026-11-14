'use strict';
const { FIELDS } = require('./service');

// Adapter targets the existing Apps Script contract. A1 supplies mock fetch only.
function payload(fields, key, secret, now = Date.now()) {
  const subject = (fields.subject || 'Inquiry').replace(/[\r\n]/g, ' ').slice(0, 120);
  const summary = FIELDS.map(field => field + ': ' + (fields[field] || '(skipped)')).join('\n');
  return {
    secret,
    routeTo: 'support@lavaall.com',
    subject: '[Lavaall Website – Customer Assistant] ' + subject,
    inquiryType: fields.inquiryType || 'general-inquiry',
    name: fields.name,
    email: fields.email,
    phone: fields.phone,
    country: fields.country,
    company: fields.company,
    preferredContact: fields.preferredResponse || 'phone',
    preferredCallback: '',
    message: 'New message from the LAVAALL website contact form.\nChannel: website chat\n' + summary,
    receivedAt: new Date(now).toISOString(),
    idempotencyKey: key,
  };
}

function mockContactTransport({ fetchMock, webhook, secret, runtime }) {
  if (runtime !== 'test' || typeof fetchMock !== 'function') throw new Error('mock_only');
  return (fields, key) => fetchMock(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(fields, key, secret)),
  });
}

module.exports = { payload, mockContactTransport };
