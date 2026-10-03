// Starlink section on/off switch.
//
// Production (VERCEL_ENV=production, or VERCEL set without VERCEL_ENV) is OFF
// unless STARLINK_ENABLED is explicitly 1/true/on. Preview and local dev are
// ON by default so the branch can be tested; STARLINK_ENABLED=0/false/off
// turns it off everywhere. When off, every /starlink URL answers a plain 404.
const ON = new Set(['1', 'true', 'on', 'yes']);
const OFF = new Set(['0', 'false', 'off', 'no']);

function envFlag(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  if (ON.has(v)) return true;
  if (OFF.has(v)) return false;
  return null;
}

function deployEnv() {
  if (process.env.VERCEL_ENV) return String(process.env.VERCEL_ENV);
  return process.env.VERCEL ? 'production' : 'development';
}

function isProduction() {
  return deployEnv() === 'production';
}

function isEnabled() {
  const explicit = envFlag('STARLINK_ENABLED');
  if (explicit !== null) return explicit;
  return !isProduction();
}

module.exports = { envFlag, deployEnv, isProduction, isEnabled };
