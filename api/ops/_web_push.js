// RFC 8291 aes128gcm Web Push, plus a VAPID (RFC 8292) Authorization header.
// Node crypto only. No npm. Never log keys, endpoints, or plaintext.

const crypto = require('crypto');

const RECORD_SIZE = 4096;
const PAD_TARGET = 128;

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(value) {
  const text = String(value || '').trim();
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const buf = Buffer.from(text, 'base64url');
  return buf.length ? buf : null;
}

function hkdf(ikm, salt, info, length) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

function uncompressedPoint(raw) {
  if (!raw || raw.length !== 65 || raw[0] !== 4) return null;
  return raw;
}

function privateScalar(raw) {
  if (!raw || raw.length > 32 || raw.length < 1) return null;
  if (raw.length === 32) return raw;
  // Node's ECDH.getPrivateKey() drops leading zero bytes. P-256 scalars are 32.
  const padded = Buffer.alloc(32);
  raw.copy(padded, 32 - raw.length);
  return padded;
}

function ecdhSecret(privateKey, peerPublic) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  return ecdh.computeSecret(peerPublic);
}

function padPlaintext(payload, padTo) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const target = Number.isFinite(padTo) ? padTo : (body.length + 1 <= PAD_TARGET ? PAD_TARGET : body.length + 1);
  if (target < body.length + 1) {
    const err = new Error('payload_too_large');
    err.code = 'payload_too_large';
    throw err;
  }
  const out = Buffer.alloc(target);
  body.copy(out);
  out[body.length] = 2;
  return out;
}

function encryptAes128gcm({
  payload,
  userPublicKey,
  authSecret,
  salt,
  asPublicKey,
  asPrivateKey,
  padTo,
}) {
  const uaPublic = uncompressedPoint(userPublicKey);
  const asPublic = uncompressedPoint(asPublicKey);
  const asPrivate = privateScalar(asPrivateKey);
  const saltBuf = salt && salt.length === 16 ? salt : null;
  const auth = authSecret && (authSecret.length === 16) ? authSecret : null;
  if (!uaPublic || !asPublic || !asPrivate || !saltBuf || !auth) {
    const err = new Error('invalid_web_push_key');
    err.code = 'invalid_web_push_key';
    throw err;
  }
  const shared = ecdhSecret(asPrivate, uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(shared, auth, keyInfo, 32);
  const cek = hkdf(ikm, saltBuf, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, saltBuf, Buffer.from('Content-Encoding: nonce\0'), 12);
  const padded = padPlaintext(payload, padTo);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21 + asPublic.length);
  saltBuf.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header[20] = asPublic.length;
  asPublic.copy(header, 21);
  return Buffer.concat([header, ciphertext]);
}

function decryptAes128gcm({ body, userPrivateKey, authSecret }) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const uaPrivate = privateScalar(userPrivateKey);
  const auth = authSecret && authSecret.length === 16 ? authSecret : null;
  if (!uaPrivate || !auth || bytes.length < 22) return null;
  const salt = bytes.subarray(0, 16);
  const idLen = bytes[20];
  if (idLen !== 65 || bytes.length < 21 + idLen + 16) return null;
  const asPublic = uncompressedPoint(bytes.subarray(21, 21 + idLen));
  if (!asPublic) return null;
  const ciphertext = bytes.subarray(21 + idLen);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const shared = ecdhSecret(uaPrivate, asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ecdhPublic(uaPrivate), asPublic]);
  const ikm = hkdf(shared, auth, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(tag);
  const padded = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const mark = padded.indexOf(2);
  if (mark < 0) return null;
  return padded.subarray(0, mark);
}

function ecdhPublic(privateKey) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  return ecdh.getPublicKey();
}

function vapidKeysFromEnv(env) {
  const source = env || process.env;
  const publicKey = uncompressedPoint(b64urlDecode(source.FOUNDERS_DM_VAPID_PUBLIC_KEY));
  const privateKey = privateScalar(b64urlDecode(source.FOUNDERS_DM_VAPID_PRIVATE_KEY));
  const subject = String(source.FOUNDERS_DM_VAPID_SUBJECT || '').trim();
  if (!publicKey || !privateKey) return null;
  if (!/^mailto:[^\s@]+@[^\s@]+$/i.test(subject) && !/^https:\/\//i.test(subject)) return null;
  let derived;
  try {
    derived = ecdhPublic(privateKey);
  } catch {
    return null;
  }
  if (!derived.equals(publicKey)) return null;
  return { publicKey, privateKey, subject };
}

function vapidAuthorization({ endpoint, publicKey, privateKey, subject, exp }) {
  const aud = new URL(endpoint).origin;
  const header = b64urlEncode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claim = b64urlEncode(Buffer.from(JSON.stringify({
    aud,
    exp: Number.isFinite(exp) ? exp : Math.floor(Date.now() / 1000) + (12 * 60 * 60),
    sub: subject,
  })));
  const signing = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: b64urlEncode(privateKey),
      x: b64urlEncode(publicKey.subarray(1, 33)),
      y: b64urlEncode(publicKey.subarray(33, 65)),
    },
    format: 'jwk',
  });
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claim}`), { key: signing, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claim}.${b64urlEncode(sig)}, k=${b64urlEncode(publicKey)}`;
}

function sealPayload(payload, userPublicKey, authSecret) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return encryptAes128gcm({
    payload,
    userPublicKey,
    authSecret,
    salt: crypto.randomBytes(16),
    asPublicKey: ecdh.getPublicKey(),
    asPrivateKey: ecdh.getPrivateKey(),
  });
}

async function sendWebPush({ endpoint, p256dh, auth, payload, vapid, ttl, urgency }) {
  const keys = vapid || vapidKeysFromEnv();
  if (!keys) return { ok: false, status: 0, error: 'vapid_missing' };
  const userPublicKey = uncompressedPoint(b64urlDecode(p256dh));
  const authSecret = b64urlDecode(auth);
  if (!userPublicKey || !authSecret || authSecret.length !== 16) {
    return { ok: false, status: 0, error: 'invalid_subscription' };
  }
  if (!endpoint || !/^https:\/\//i.test(endpoint)) {
    return { ok: false, status: 0, error: 'invalid_subscription' };
  }
  const body = sealPayload(typeof payload === 'string' ? payload : JSON.stringify(payload), userPublicKey, authSecret);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization({ endpoint, ...keys }),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(Number.isFinite(ttl) ? ttl : 86400),
      Urgency: urgency || 'high',
    },
    body,
  });
  return { ok: response.status >= 200 && response.status < 300, status: response.status };
}

module.exports = {
  RECORD_SIZE,
  b64urlDecode,
  b64urlEncode,
  decryptAes128gcm,
  encryptAes128gcm,
  sendWebPush,
  vapidAuthorization,
  vapidKeysFromEnv,
};
