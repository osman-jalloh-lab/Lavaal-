'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const HANDWRITTEN = path.join(ROOT, 'assets/js/catalog-data.js');
const GENERATED = path.join(ROOT, 'assets/data/catalog-generated.json');
const LOCAL_IMAGE = /^images\/catalog\/[a-z0-9/_-]+\.webp$/i;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'my', 'me',
  'i', 'im', "i'm", 'we', 'you', 'your', 'our', 'is', 'are', 'do', 'does',
  'have', 'has', 'had', 'get', 'got', 'need', 'needs', 'want', 'looking',
  'look', 'buy', 'buying', 'please', 'can', 'could', 'would', 'like', 'am',
  'some', 'any', 'with', 'from', 'about', 'hi', 'hey', 'hello', 'ok',
  'je', 'j', 'tu', 'vous', 'nous', 'un', 'une', 'des', 'les', 'le', 'la',
  'cherche', 'cherché', 'cherchee', 'besoin', 'veux', 'voudrais', 'acheter',
  'est', 'ce', 'que', 'qui', 'pour', 'mon', 'ma', 'mes', 'disponible',
  'eu', 'voce', 'você', 'voces', 'vocês', 'um', 'uma', 'os', 'as', 'do', 'da',
  'preciso', 'procuro', 'quero', 'comprar', 'tem', 'têm', 'gostaria',
  'una', 'wi', 'di', 'na', 'de', 'wan', 'bin', 'mek', 'pon', 'pan', 'go',
  'model', 'models', 'sell', 'selling', 'sold', 'vendez', 'vendre', 'vende',
  'have', 'having', 'got', 'ask', 'asking', 'tell', 'know', 'there', 'this',
  'that', 'what', 'which', 'when', 'where', 'how', 'much', 'many', 'please',
  'm', 's', 't', 'd', 've', 'll', 're', 'pm', 'am',
]);

const NUMBER_WORDS = new Set([
  'a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'sept', 'huit',
  'neuf', 'dix', 'douze', 'quinze', 'vingt', 'trente', 'quarante', 'cinquante',
  'soixante', 'cent', 'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco',
  'seis', 'sete', 'oito', 'nove', 'dez', 'doze', 'vinte', 'trinta', 'quarenta',
  'cinquenta', 'sessenta', 'cem',
]);

const SYNONYMS = {
  laptop: ['laptop', 'notebook', 'macbook', 'elitebook', 'probook', 'thinkpad', 'latitude', 'ideapad', 'yoga', 'zbook', 'vivobook', 'aspire', 'xps', 'surface'],
  laptops: ['laptop', 'notebook', 'macbook', 'elitebook', 'probook', 'thinkpad', 'latitude', 'ideapad', 'yoga', 'zbook', 'vivobook', 'aspire', 'xps', 'surface'],
  notebook: ['laptop', 'notebook', 'macbook'],
  computer: ['computer', 'laptop', 'desktop', 'workstation', 'macbook', 'imac', 'optiplex', 'thinkcentre'],
  computers: ['computer', 'laptop', 'desktop', 'workstation', 'macbook', 'imac', 'optiplex', 'thinkcentre'],
  phone: ['phone', 'iphone', 'smartphone'],
  phones: ['phone', 'iphone', 'smartphone'],
  iphone: ['iphone'],
  computador: ['computer', 'laptop', 'desktop', 'workstation', 'macbook', 'imac', 'optiplex', 'thinkcentre'],
  computadores: ['computer', 'laptop', 'desktop', 'workstation', 'macbook', 'imac', 'optiplex', 'thinkcentre'],
  ordinateur: ['computer', 'laptop', 'desktop', 'workstation'],
  ordinateurs: ['computer', 'laptop', 'desktop', 'workstation'],
  portable: ['laptop', 'notebook', 'macbook'],
  portables: ['laptop', 'notebook', 'macbook'],
  switch: ['switch', 'switches'],
  switches: ['switch', 'switches'],
  switchs: ['switch', 'switches'],
  commutateur: ['switch', 'switches', 'commutateur'],
  commutateurs: ['switch', 'switches', 'commutateur'],
  starlink: ['starlink'],
  starlnk: ['starlink'],
  fibre: ['fiber'],
  fiber: ['fiber'],
};

const MODIFIERS = new Set([
  'refurbished', 'refurb', 'used', 'new', 'cheap', 'cheapest', 'budget',
  'reconditionne', 'reconditionnes', 'recondicionado', 'recondicionados',
]);

const UNIT_WORDS = new Set([
  'iphone','iphones','ipad','ipads','phone','phones','laptop','laptops',
  'computer','computers','desktop','desktops','notebook','notebooks',
  'server','servers','router','routers','switch','switches','unit','units',
  'pcs','pieces','tv','tvs','monitor','monitors','printer','printers',
  'tablet','tablets','ordinateur','ordinateurs','portable','portables',
  'telefone','telefones','computador','computadores','pcs',
]);

function loadHandwritten() {
  const src = fs.readFileSync(HANDWRITTEN, 'utf8');
  const sandbox = {};
  vm.runInNewContext(src + '\n;this.__CATALOG = CATALOG;', sandbox);
  const products = [];
  for (const category of sandbox.__CATALOG) {
    for (const brand of category.brands || []) {
      for (const family of brand.families || []) {
        for (const model of family.models || []) {
          products.push(record({
            id: model.id,
            name: model.name,
            brand: brand.name,
            family: family.name,
            categoryId: category.id,
            category: category.name,
            specLine: model.specLine || '',
            desc: sanitizeDesc(model.desc || ''),
            options: compactFields(model.fields),
            source: 'site-catalog',
          }));
        }
      }
    }
  }
  return products;
}

function isApprovedGenerated(product) {
  if (!product || product.integrationApproved !== true) return false;
  if (product.identityStatus !== 'verified' || product.visualQaStatus !== 'PASS'
      || product.mediaUsageStatus !== 'permitted') return false;
  if (product.quarantined === true) return false;
  if (!product.sourceProductId || !product.name || !product.brand) return false;
  if (!(product.mpn || product.modelNumber)) return false;
  const paths = (product.images || [])
    .map(image => image && (image.path || image.src))
    .filter(value => typeof value === 'string' && LOCAL_IMAGE.test(value));
  return paths.length > 0 && paths.includes(product.primaryImage);
}

function loadGenerated() {
  if (!fs.existsSync(GENERATED)) return [];
  const data = JSON.parse(fs.readFileSync(GENERATED, 'utf8'));
  const products = [];
  for (const product of data.products || []) {
    if (!isApprovedGenerated(product)) continue;
    const categoryId = slugify(product.category);
    products.push(record({
      id: 'icecat-' + String(product.sourceProductId),
      name: String(product.name).trim(),
      brand: String(product.brand).trim(),
      family: String(product.family || product.series || 'Models').trim(),
      categoryId,
      category: titleCase(categoryId.replace(/-/g, ' ')),
      specLine: '',
      desc: '',
      modelNumber: product.modelNumber || product.mpn || '',
      options: [{ key: 'quantity', label: 'Quantity', type: 'number', min: 1, value: 1 }],
      source: 'site-extended',
    }));
  }
  return products;
}

function sanitizeDesc(desc) {
  // A1 policy: do not claim a warranty or certification on a specific phone.
  return String(desc).replace(/\s*tested and warrantied\.?/gi, '.').replace(/\s{2,}/g, ' ').trim();
}

function compactFields(fields) {
  return (fields || []).map(field => ({
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options,
    min: field.min,
    value: field.value,
  }));
}

function slugify(value) {
  return String(value).toLowerCase().replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function record(product) {
  const haystack = normalize([
    product.name, product.brand, product.family, product.category,
    product.categoryId, product.modelNumber || '', product.specLine || '',
  ].join(' '));
  return { ...product, haystack, tokens: new Set(haystack.split(' ').filter(Boolean)) };
}

let CACHE = null;

function loadCatalog() {
  if (CACHE) return CACHE;
  const handwritten = loadHandwritten();
  const generated = loadGenerated();
  const seen = new Set(handwritten.map(item => normalize(item.brand + ' ' + item.name)));
  const extras = generated.filter(item => !seen.has(normalize(item.brand + ' ' + item.name)));
  CACHE = {
    products: handwritten.concat(extras),
    handwritten: handwritten.length,
    extended: extras.length,
    source: 'assets/js/catalog-data.js + approved entries from assets/data/catalog-generated.json',
  };
  return CACHE;
}

function stems(token) {
  const values = new Set([token]);
  if (token.endsWith('ies') && token.length > 4) values.add(token.slice(0, -3) + 'y');
  if (token.endsWith('es') && token.length > 5) values.add(token.slice(0, -2));
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) values.add(token.slice(0, -1));
  return values;
}

function expandToken(token) {
  const values = new Set(stems(token));
  for (const variant of [...values]) {
    for (const extra of (SYNONYMS[variant] || [])) values.add(extra);
  }
  return values;
}

function tokensOf(query) {
  return normalize(query).split(' ').filter(token =>
    token
    && token.length >= 2
    && !STOPWORDS.has(token)
    && !NUMBER_WORDS.has(token)
    && !MODIFIERS.has(token)
    && !/^\d+$/.test(token)
  );
}

function modelNumbers(query) {
  const text = normalize(query).replace(/\b24\s+7\b/g, ' ');
  return (text.match(/\b\d{2,5}\b/g) || []).filter(num => {
    if (Number(num) < 10) return false;
    const asQty = new RegExp('\\b' + num + '\\s+(' + [...UNIT_WORDS].join('|') + ')\\b');
    if (asQty.test(text)) return false;
    if (new RegExp('\\b(qty|quantity|quantidade)\\s*[:=]?\\s*' + num + '\\b').test(text)) return false;
    return true;
  });
}

function wordSet(product) {
  return product.tokens;
}

const GENERIC_TOKENS = new Set([
  'laptop', 'laptops', 'notebook', 'computer', 'computers', 'phone', 'phones',
  'switch', 'switches', 'router', 'routers', 'server', 'servers', 'printer',
  'monitor', 'tablet', 'cable', 'cables', 'kit', 'kits', 'series', 'model',
  'managed', 'port', 'ports', 'plus', 'pro', 'max', 'air', 'mini', 'office',
  'work', 'standard', 'wireless', 'bluetooth', 'smart', 'home', 'business',
]);

function isTransposition(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const diffs = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diffs.push(i);
  }
  return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;
  const rows = [];
  for (let i = 0; i <= b.length; i += 1) rows[i] = [i];
  for (let j = 0; j <= a.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      rows[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? rows[i - 1][j - 1]
        : Math.min(rows[i - 1][j - 1] + 1, rows[i][j - 1] + 1, rows[i - 1][j] + 1);
    }
  }
  return rows[b.length][a.length];
}

function tokenScore(product, token) {
  const variants = expandToken(token);
  for (const variant of variants) {
    if (product.tokens.has(variant)) return 8;
  }
  const words = product.haystack.split(' ').filter(Boolean);
  for (const variant of variants) {
    if (variant.length >= 4 && words.includes(variant)) return 8;
  }
  // Prefix only for longer tokens, word-start only (never "speak" inside "speaker" via includes).
  if (token.length >= 6) {
    for (const item of product.tokens) {
      if (item.length >= 6 && (item.startsWith(token) || token.startsWith(item))) return 2;
    }
  }
  // Light typo tolerance for distinctive tokens only (Macbok -> MacBook, starlnk -> Starlink).
  if (token.length >= 4 && !GENERIC_TOKENS.has(token)) {
    for (const item of product.tokens) {
      if (item.length < 4) continue;
      if (isTransposition(token, item) || levenshtein(token, item) === 1) return 6;
      const distance = levenshtein(token, item);
      if (distance === 2 && token.length >= 5 && item.length >= 5) return 6;
    }
  }
  return 0;
}

function containsPhrase(haystack, needle) {
  if (!needle || needle.length < 3) return false;
  return (' ' + haystack + ' ').includes(' ' + needle + ' ');
}

function brandTokensOf(catalog) {
  const tokens = new Set();
  for (const product of catalog.products) {
    for (const part of normalize(product.brand || '').split(' ').filter(Boolean)) {
      if (part.length >= 3 && part !== 'various' && part !== 'and' && !GENERIC_TOKENS.has(part)) {
        tokens.add(part);
      }
    }
  }
  return tokens;
}

function queryBrandTokens(tokens, catalog) {
  const brands = brandTokensOf(catalog);
  const found = new Set();
  for (const token of tokens) {
    for (const variant of expandToken(token)) {
      if (brands.has(variant)) found.add(variant);
    }
    if (token.length >= 4 && !GENERIC_TOKENS.has(token)) {
      for (const brand of brands) {
        const distance = levenshtein(token, brand);
        if (isTransposition(token, brand) || distance === 1 || (distance === 2 && token.length >= 5)) found.add(brand);
      }
    }
  }
  return [...found];
}

function productHasBrand(product, brands) {
  const hay = normalize((product.brand || '') + ' ' + (product.name || ''));
  const parts = new Set(hay.split(' ').filter(Boolean));
  return brands.some(brand => parts.has(brand));
}

function searchCatalog(query, options = {}) {
  const catalog = loadCatalog();
  const tokens = tokensOf(query);
  const numbers = modelNumbers(query);
  if (!tokens.length && !numbers.length) return { matches: [], tokens, total: catalog.products.length };
  const limit = options.limit || 8;
  const phrase = normalize(query);
  const brandsInQueryEarly = queryBrandTokens(tokens, catalog);
  let scored = [];
  for (const product of catalog.products) {
    let score = 0;
    let strong = 0;
    for (const token of tokens) {
      const added = tokenScore(product, token);
      score += added;
      if (added >= 6) strong += 1;
    }
    for (const num of numbers) {
      if (product.tokens.has(num) || product.haystack.split(' ').includes(num)) {
        score += 10;
        strong += 1;
      }
    }
    const productName = normalize(product.name);
    const familyName = normalize(product.family || '');
    if (productName.length > 3 && containsPhrase(phrase, productName)) score += 16;
    const genericFamily = !familyName || GENERIC_TOKENS.has(familyName) || /^(models?|series|switch|switches|kits?|cables?|standard|accessories|sockets?)$/.test(familyName);
    if (familyName.length > 3 && !genericFamily && containsPhrase(phrase, familyName)) score += 10;
    if (brandsInQueryEarly.length && productHasBrand(product, brandsInQueryEarly)) score += 16;
    if (score > 0 && strong > 0) scored.push({ score, product });
  }
  const brandsInQuery = queryBrandTokens(tokens, catalog);
  if (brandsInQuery.length) {
    const branded = scored.filter(item => productHasBrand(item.product, brandsInQuery));
    if (branded.length) scored = branded;
  }
  scored.sort((a, b) => b.score - a.score
    || a.product.source.localeCompare(b.product.source)
    || (a.product.family || '').localeCompare(b.product.family || '')
    || a.product.name.localeCompare(b.product.name));
  if (!scored.length) return { matches: [], all: [], tokens, total: catalog.products.length };

  const best = scored[0].score;
  // If a specific model/family clearly won, keep close variants only.
  const specific = scored.filter(item => item.score >= best - 6 && item.score >= 18);
  const pool = specific.length ? specific : scored.filter(item => item.score >= Math.max(8, best * 0.7));

  // Prefer core site catalogue cards when they already cover the request.
  const core = pool.filter(item => item.product.source === 'site-catalog');
  const chosen = (core.length >= 3 || (core.length && !specific.length)) ? core : pool;
  let matches = chosen.map(item => item.product);

  // Laptop/computer requests should not surface accessory cards first.
  const laptopLike = tokens.some(token => expandToken(token).has('laptop') || expandToken(token).has('computer'));
  if (laptopLike) {
    const filtered = matches.filter(item =>
      item.categoryId !== 'accessories'
      && item.categoryId !== 'audio'
      && !/cases|protector|accessor/i.test(String(item.categoryId || '') + ' ' + String(item.category || '') + ' ' + String(item.name || ''))
    );
    if (filtered.length) matches = filtered;
  }

  // Brand awareness: if the query names a catalogue brand, keep that brand.
  const brands = queryBrandTokens(tokens, catalog);
  if (brands.length) {
    const branded = matches.filter(item => productHasBrand(item, brands));
    if (branded.length) matches = branded;
  }

  // Category awareness for "switch": Cisco/networking must not rank Nintendo Switch,
  // and "Nintendo Switch" must still resolve to the console.
  const switchLike = tokens.some((token) => {
    const variants = expandToken(token);
    return variants.has('switch') || variants.has('switches') || variants.has('commutateur') || token === 'switchs';
  });
  const networkCue = /\b(cisco|catalyst|mikrotik|router|routers|commutateur|commutateurs|poe|managed|network|networking|ethernet)\b/i.test(phrase)
    || tokens.some(token => {
      const variants = expandToken(token);
      return variants.has('router') || variants.has('cisco') || variants.has('commutateur');
    });
  const gameCue = /\b(nintendo|console|gaming|game|oled|xbox|playstation)\b/i.test(phrase);
  const socketCue = /\b(socket|sockets|havells|changeover)\b/i.test(phrase);
  if (switchLike && networkCue && !gameCue) {
    const networked = matches.filter(item =>
      item.categoryId === 'networking'
      || /cisco|mikrotik|catalyst/i.test((item.brand || '') + ' ' + (item.name || ''))
    );
    if (networked.length) matches = networked;
    matches = matches.filter(item => item.categoryId !== 'gaming' && !/nintendo/i.test(item.brand || ''));
    if (!socketCue) {
      const notElectrical = matches.filter(item => item.categoryId !== 'switches-sockets' && item.category !== 'Switches & Sockets');
      if (notElectrical.length) matches = notElectrical;
    }
  } else if (switchLike && gameCue && !networkCue) {
    const gaming = matches.filter(item => item.categoryId === 'gaming' || /nintendo/i.test(item.brand || ''));
    if (gaming.length) matches = gaming;
  }

  function generation(product) {
    const found = (product.family || product.name || '').match(/(\d{1,2})/);
    return found ? Number(found[1]) : 0;
  }
  function sortMatches(items) {
    const list = items.slice();
    const allIphones = list.length && list.every(item => /iphone/i.test(item.name) || /iphone/i.test(item.family || ''));
    if (allIphones) {
      list.sort((a, b) => generation(b) - generation(a) || a.name.localeCompare(b.name));
    } else {
      const rank = new Map(list.map((item, index) => [item.id, index]));
      list.sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99)
        || (a.family || '').localeCompare(b.family || '')
        || a.name.localeCompare(b.name));
    }
    return list;
  }
  matches = sortMatches(matches);

  const primary = matches.slice();

  // Include close variants in the same family (iPhone 15 -> Plus / Pro / Pro Max).
  const families = new Set(matches.map(item => item.family).filter(Boolean));
  if (families.size && families.size <= 3) {
    const extras = catalog.products.filter(item =>
      families.has(item.family) && !matches.some(existing => existing.id === item.id)
    );
    if (extras.length) matches = matches.concat(extras);
  }

  matches = sortMatches(matches);

  return { matches: matches.slice(0, limit), all: matches, primary: primary.slice(0, limit), tokens, total: catalog.products.length };
}

function findByName(name) {
  const needle = normalize(name);
  return loadCatalog().products.filter(product =>
    normalize(product.name) === needle || normalize(product.brand + ' ' + product.name) === needle);
}

function categoryCounts() {
  const counts = {};
  for (const product of loadCatalog().products) {
    counts[product.categoryId] = (counts[product.categoryId] || 0) + 1;
  }
  return counts;
}

module.exports = {
  loadCatalog, searchCatalog, findByName, normalize, categoryCounts, ROOT,
};
