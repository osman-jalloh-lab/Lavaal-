import fs from 'node:fs';
import { createGunzip } from 'node:zlib';

function decode(value = '') { return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'"); }
export function attributes(source = '') { const out = {}; const pattern = /([^\s=]+)\s*=\s*("[^"]*"|'[^']*')/g; let match; while ((match = pattern.exec(source))) out[match[1]] = decode(match[2].slice(1, -1)); return out; }
function bool(value) { return ['1', 'y', 'yes', 'true'].includes(String(value ?? '').toLowerCase()); }
function textValues(body, tag, attributeName = 'Value') { const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attributeName}=(?:"([^"]*)"|'([^']*)')[^>]*\\/?>(?:[\\s\\S]*?<\\/${tag}>)?`, 'g'); const values = []; let match; while ((match = pattern.exec(body))) values.push(decode(match[1] ?? match[2] ?? '')); return values; }
function elementTextValues(body, tag) { const pattern = new RegExp(`<${tag}\\b[^>]*>([^<]*)<\\/${tag}>`, 'g'); const values = []; let match; while ((match = pattern.exec(body))) values.push(decode(match[1].trim())); return values; }

export function parseIndexFile(attributesText, body = '') {
  const attrs = attributes(attributesText);
  return {
    icecatId: attrs.Product_ID ?? null,
    supplierId: attrs.Supplier_id ?? null,
    mpn: attrs.Prod_ID ?? null,
    mappedMpn: elementTextValues(body, 'M_Prod_ID')[0] ?? null,
    sourceCategoryId: attrs.Catid ?? null,
    modelName: attrs.Model_Name ?? null,
    quality: attrs.Quality ?? null,
    onMarket: bool(attrs.On_Market),
    limited: bool(attrs.Limited),
    updated: attrs.Updated ?? null,
    previewImageUrl: attrs.HighPic ?? null,
    gtins: textValues(body, 'EAN_UPC'),
    countryMarkets: textValues(body, 'Country_Market')
  };
}

export async function streamIndex(indexFile, onRecord) {
  const input = fs.createReadStream(indexFile); const stream = indexFile.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  let buffer = ''; const pattern = /<file\b([^>]*?)(?:\/>|>([\s\S]*?)<\/file>)/gi;
  for await (const chunk of stream) {
    buffer += chunk.toString('utf8'); let match; let end = 0;
    while ((match = pattern.exec(buffer))) { onRecord(parseIndexFile(match[1], match[2] ?? '')); end = pattern.lastIndex; }
    buffer = end ? buffer.slice(end) : buffer.slice(-131072); pattern.lastIndex = 0;
  }
  let match; while ((match = pattern.exec(buffer))) onRecord(parseIndexFile(match[1], match[2] ?? ''));
}

export async function streamReferenceList(referenceFile, elementName, onEntry) {
  const input = fs.createReadStream(referenceFile); const stream = referenceFile.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  let buffer = ''; const pattern = new RegExp(`<${elementName}\\b([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/${elementName}>)`, 'gi');
  for await (const chunk of stream) {
    buffer += chunk.toString('utf8'); let match; let end = 0;
    while ((match = pattern.exec(buffer))) {
      const attrs = attributes(match[1]); const body = match[0];
      const names = [...body.matchAll(/<Name\b([^>]*?)\/?>(?:[\s\S]*?<\/Name>)?/gi)].map(item => attributes(item[1]));
      const name = attrs.Name ?? names.find(item => item.langid === '1')?.Value ?? names[0]?.Value;
      if (attrs.ID && name) onEntry({ id: attrs.ID, name }); end = pattern.lastIndex;
    }
    buffer = end ? buffer.slice(end) : buffer.slice(-65536); pattern.lastIndex = 0;
  }
}
