const XML_S3_URL = 'https://data.icecat.biz/xml_s3/xml_server3.cgi';

export class IcecatConfigurationError extends Error {}

export function credentialsFromEnv(env = process.env) {
  const username = env.ICECAT_USERNAME?.trim();
  const password = env.ICECAT_PASSWORD;
  const apiToken = env.ICECAT_API_TOKEN?.trim();
  if (!apiToken && !(username && password)) {
    throw new IcecatConfigurationError('ICECAT credentials not configured.');
  }
  if ((username && !password) || (!username && password)) {
    throw new IcecatConfigurationError('ICECAT credentials not configured. Provide both ICECAT_USERNAME and ICECAT_PASSWORD, or ICECAT_API_TOKEN.');
  }
  return { username, password, apiToken, language: env.ICECAT_LANGUAGE?.trim() || 'EN' };
}

export function buildProductUrl(identifier, brand, language = 'EN') {
  const params = new URLSearchParams({ lang: language, output: 'productxml' });
  const value = String(identifier?.value ?? '').trim();
  if (!value) throw new TypeError('invalid-identifier');
  if (identifier.type === 'icecat-id') params.set('icecat_id', value);
  else if (identifier.type === 'gtin') params.set('ean_upc', value);
  else if (identifier.type === 'mpn-and-brand') {
    if (!brand?.trim()) throw new TypeError('invalid-identifier');
    params.set('prod_id', value);
    params.set('vendor', brand.trim());
  } else throw new TypeError('invalid-identifier');
  return `${XML_S3_URL}?${params}`;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function transient(status) { return status === 408 || status === 429 || status >= 500; }

export async function fetchProductXml(identifier, brand, options = {}) {
  const credentials = options.credentials ?? credentialsFromEnv();
  const retries = Number.isInteger(options.retries) ? options.retries : 3;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const url = buildProductUrl(identifier, brand, credentials.language);
  const headers = { 'User-Agent': 'LAVAALL-Icecat-Importer/1.0', Accept: 'application/xml,text/xml' };
  if (credentials.username && credentials.password) headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
  if (credentials.apiToken) headers['api-token'] = credentials.apiToken;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (response.ok) return { url, xml: await response.text() };
      if (!transient(response.status) || attempt === retries) {
        const error = new Error(`Icecat request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
    } catch (error) {
      if (error.status && (!transient(error.status) || attempt === retries)) throw error;
      if (attempt === retries) throw error;
    } finally { clearTimeout(timer); }
    await sleep(250 * (2 ** attempt));
  }
  throw new Error('Icecat request failed.');
}
