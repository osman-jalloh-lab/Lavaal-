// Parse Kit Registry CSV / XLSX exports. No npm. No Sheets API.
// Underscore prefix: not a Vercel function. Never log emails.

const zlib = require('zlib');

const HEADER_ALIASES = Object.freeze({
  kitnumber: 'kit_number',
  kitno: 'kit_number',
  kit: 'kit_number',
  kitid: 'kit_number',
  name: 'person_name',
  personname: 'person_name',
  person: 'person_name',
  email: 'email',
  status: 'status',
  dateadded: 'date_added',
  date: 'date_added',
  added: 'date_added',
  notes: 'notes',
  note: 'notes',
});

function headerKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mapHeader(value) {
  return HEADER_ALIASES[headerKey(value)] || '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseCsvToValues(text) {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (inQuotes || field || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((cell) => String(cell).trim() === '')) {
    rows.pop();
  }
  return rows;
}

function parseSheetValues(values) {
  const rows = Array.isArray(values) ? values : [];
  if (!rows.length) return { rows: [], skipped: [] };
  const headers = (rows[0] || []).map(mapHeader);
  const parsed = [];
  const skipped = [];
  rows.slice(1).forEach((cells, index) => {
    const sheetRow = index + 2;
    const raw = {};
    headers.forEach((key, col) => {
      if (!key) return;
      raw[key] = cells && cells[col] != null ? String(cells[col]) : '';
    });
    const kitNumber = String(raw.kit_number || '').trim().toUpperCase();
    const personName = String(raw.person_name || '').trim();
    if (!kitNumber || !personName) {
      skipped.push({ sheet_row: sheetRow, kit_number: kitNumber });
      return;
    }
    parsed.push({
      kit_number: kitNumber,
      person_name: personName,
      email: raw.email || '',
      status: raw.status || '',
      date_added: raw.date_added || '',
      notes: raw.notes || '',
      sheet_row: sheetRow,
    });
  });
  return { rows: parsed, skipped };
}

function colToIndex(ref) {
  const letters = String(ref || '').replace(/\d+/g, '');
  if (!letters) return -1;
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

function inflateZipEntry(compressed, method) {
  if (method === 0) return compressed;
  if (method === 8) return zlib.inflateRawSync(compressed);
  throw new Error('unsupported_zip');
}

function readZipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('sheet_unavailable');
  const count = buf.readUInt16LE(eocd + 10);
  let cd = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n += 1) {
    if (cd + 46 > buf.length || buf.readUInt32LE(cd) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cd + 10);
    const compSize = buf.readUInt32LE(cd + 20);
    const nameLen = buf.readUInt16LE(cd + 28);
    const extraLen = buf.readUInt16LE(cd + 30);
    const commentLen = buf.readUInt16LE(cd + 32);
    const localOff = buf.readUInt32LE(cd + 42);
    const name = buf.slice(cd + 46, cd + 46 + nameLen).toString('utf8');
    if (localOff + 30 <= buf.length && buf.readUInt32LE(localOff) === 0x04034b50) {
      const localNameLen = buf.readUInt16LE(localOff + 26);
      const localExtra = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + localNameLen + localExtra;
      const compressed = buf.slice(dataStart, dataStart + compSize);
      files[name] = inflateZipEntry(compressed, method);
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function xmlOf(files, name) {
  const buf = files[name];
  return buf ? buf.toString('utf8') : '';
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = re.exec(xml))) {
    const texts = [];
    const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textRe.exec(match[1]))) texts.push(decodeXml(textMatch[1]));
    strings.push(texts.join(''));
  }
  return strings;
}

function parseWorksheetValues(xml, shared) {
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cell;
    while ((cell = cellRe.exec(rowMatch[1]))) {
      const attrs = cell[1] || '';
      const body = cell[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/i) || [])[1] || '';
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
      const col = colToIndex(ref);
      if (col < 0) continue;
      let value = '';
      if (type === 's') {
        const idx = Number((body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1]);
        value = Number.isFinite(idx) ? String(shared[idx] || '') : '';
      } else if (type === 'inlineStr') {
        const texts = [];
        const textRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let textMatch;
        while ((textMatch = textRe.exec(body))) texts.push(decodeXml(textMatch[1]));
        value = texts.join('');
      } else if (type === 'b') {
        value = (body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1] === '1' ? 'TRUE' : 'FALSE';
      } else {
        value = decodeXml((body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1] || '');
      }
      cells[col] = value;
    }
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] == null) cells[i] = '';
    }
    rows.push(cells);
  }
  return rows;
}

function parseWorkbookSheets(xml) {
  const sheets = [];
  const re = /<sheet\b([^>]*?)\s*\/>|<sheet\b([^>]*)><\/sheet>/g;
  let match;
  while ((match = re.exec(xml))) {
    const attrs = match[1] || match[2] || '';
    const name = decodeXml((attrs.match(/\bname="([^"]+)"/) || [])[1] || '');
    const rid = (attrs.match(/\br:id="([^"]+)"/) || [])[1] || '';
    if (name) sheets.push({ name, rid });
  }
  return sheets;
}

function parseWorkbookRels(xml) {
  const map = {};
  const re = /<Relationship\b([^>]*)\/?>/g;
  let match;
  while ((match = re.exec(xml))) {
    const attrs = match[1] || '';
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1] || '';
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1] || '';
    if (!id || !target) continue;
    const clean = target.replace(/^\//, '');
    map[id] = clean.startsWith('xl/') ? clean : `xl/${clean}`;
  }
  return map;
}

function pickSheetPath(files, tabName) {
  const sheets = parseWorkbookSheets(xmlOf(files, 'xl/workbook.xml'));
  const rels = parseWorkbookRels(xmlOf(files, 'xl/_rels/workbook.xml.rels'));
  const wanted = String(tabName || '').trim().toLowerCase();
  const chosen = wanted
    ? sheets.find((sheet) => sheet.name.toLowerCase() === wanted)
    : sheets[0];
  const path = chosen && chosen.rid ? rels[chosen.rid] : '';
  return path || 'xl/worksheets/sheet1.xml';
}

function parseXlsxToValues(buffer, tabName) {
  const files = readZipEntries(buffer);
  const shared = parseSharedStrings(xmlOf(files, 'xl/sharedStrings.xml'));
  const sheetXml = xmlOf(files, pickSheetPath(files, tabName));
  if (!sheetXml) throw new Error('sheet_unavailable');
  return parseWorksheetValues(sheetXml, shared);
}

function looksLikeHtml(text) {
  const head = String(text || '').slice(0, 120).trim().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

module.exports = {
  looksLikeHtml,
  mapHeader,
  parseCsvToValues,
  parseSheetValues,
  parseXlsxToValues,
};
