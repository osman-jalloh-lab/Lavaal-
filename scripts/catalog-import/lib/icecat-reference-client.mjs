import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class IcecatReferenceConfigurationError extends Error {}
export class IcecatReferenceHttpError extends Error {
  constructor(status) {
    const description = new Map([[401, 'unauthorized'], [403, 'forbidden'], [404, 'not found'], [429, 'rate limited']]).get(status) ?? 'request failed';
    super(`Icecat reference request ${description} (${status}).`);
    this.status = status;
  }
}

export function referenceTokenFromEnv(env = process.env) {
  const token = env.ICECAT_API_TOKEN?.trim();
  if (!token) throw new IcecatReferenceConfigurationError('ICECAT_API_TOKEN is required for Icecat reference downloads.');
  return token;
}

function headers(token) {
  // Icecat requires this literal header; the token must never be placed in a URL.
  return { 'api-token': token, Accept: 'application/gzip,application/xml,*/*', 'User-Agent': 'LAVAALL-Icecat-Importer/1.0' };
}

async function checkedResponse(url, options = {}) {
  const token = options.token ?? referenceTokenFromEnv(options.env);
  const response = await fetch(url, { method: options.method ?? 'GET', headers: headers(token), signal: options.signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new IcecatReferenceHttpError(response.status);
  }
  return response;
}

export async function downloadReferenceFile(url, destination, options = {}) {
  const partial = `${destination}.partial`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rm(partial, { force: true });
  try {
    const response = await checkedResponse(url, options);
    if (response.status !== 200 || !response.body) throw new IcecatReferenceHttpError(response.status);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    const stat = await fs.stat(partial);
    if (!stat.size) throw new Error('Icecat reference download was empty.');
    await fs.rm(destination, { force: true });
    await fs.rename(partial, destination);
    return { status: response.status, size: stat.size, destination };
  } catch (error) {
    await fs.rm(partial, { force: true });
    throw error;
  }
}

export async function probeReferenceAccess(url, options = {}) {
  const response = await checkedResponse(url, { ...options, method: 'HEAD' });
  await response.body?.cancel();
  return { status: response.status };
}
