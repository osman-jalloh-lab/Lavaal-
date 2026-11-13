'use strict';

const { searchCatalog, loadCatalog } = require('./catalog');
const EMAIL = 'support@lavaall.com';
const WHATSAPP = '+1 (737) 704-4182';

const CONTACT_ASK = /\b(how (?:can|do) i contact|contact (?:this |a |the )?(?:person|someone|you|the team|support)|how (?:can|do) i reach|reach (?:you|the team|a person|someone)|your (?:email|whatsapp|contact)|whatsapp number|support@lavaall)\b/i;
const HAVE_ASK = /\b(do you (?:have|carry|sell|stock)|have you got|is there (?:an? |any )?|are there |in (?:the|your) catalogu?e)\b/i;
const WANT_ASK = /\b(?:i\s+)?(?:want|need|would like|wanna|looking for|looking to buy|need to (?:get|buy)|want to (?:get|buy|order))|i['’]d like|get me\b/i;
const HELP_ASK = /^(ask assistant|demander à l['’]assistant|perguntar ao assistente|help|hello|hi|hey)\s*[?.!]*$/i;
const PRICE_ASK = /\b(price|prices|pricing|cost|costs|how much|Combien|c'est combien|coute|co[uû]te|pre[cç]o|preco|quanto custa|cheapest|discount|offre|prayz|prix)\b/i;
const DELIVERY_ASK = /\b(deliver(?:y|ies)?|ship(?:ping)?|livr(?:er|aison)|entrega|sierra leone|guinea[- ]bissau|liberia|\bSL\b|\bGN\b|\bLR\b|\bGW\b)\b/i;
const TIMELINE_ASK = /\b(how long|how soon|lead time|timeline|when (?:can|will|do) (?:i|you|we)|délai|prazo)\b/i;
const PAY_ASK = /\b(how (?:do|can) (?:i|we) pay|payment|invoice|refund|deposit|wire transfer|paiement|fatura|reembolso)\b/i;
const SCHOOL_ASK = /\b(school|ngo|non-?profit|classroom|université|escola|ong|government|gov(?:ernment)?)\b/i;
const TRUST_ASK = /\b(real company|are you (?:real|legit|safe)|scam|trust(?:worthy)?|safe to (?:order|buy)|entreprise réelle)\b/i;
const WEBSITE_ASK = /\b(build (?:a |me )?website|create (?:a )?website|make (?:a )?website|site web|construir um site)\b/i;
const LEGAL_ASK = /\b(invoice|refund|damage|damaged|legal|lawyer|lawsuit|contract dispute)\b/i;

function productColors(product) {
  const fields = (product && (product.options || product.fields)) || [];
  const color = fields.find(field => field && (field.key === 'color' || /colou?r/i.test(field.label || '')));
  return Array.isArray(color && color.options) ? color.options.map(String).filter(Boolean) : [];
}

function uniqueNames(products) {
  const names = [];
  const seen = new Set();
  for (const product of products || []) {
    const name = product && product.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function listWords(items) {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

function familySearch(query) {
  const result = searchCatalog(query, { limit: 24 });
  return (result.all && result.all.length ? result.all : result.matches) || [];
}

function closestFamily(query) {
  const loose = String(query || '').replace(/\b\d{2,5}s?\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!loose) return [];
  return familySearch(loose);
}

function colorMatch(asked, colors) {
  const needle = String(asked || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!needle) return null;
  const exact = colors.find(color => color.toLowerCase() === needle);
  if (exact) return exact;
  const partial = colors.filter(color => color.toLowerCase().includes(needle) || needle.includes(color.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

function pickModel(text, products) {
  const raw = String(text || '').trim();
  if (!products.length) return null;
  const lower = raw.toLowerCase();
  const exact = products.find(product => product.name.toLowerCase() === lower);
  if (exact) return exact;
  const contained = products.find(product => product.name.toLowerCase() === 'iphone ' + lower || product.name.toLowerCase().endsWith(' ' + lower));
  if (contained) return contained;
  const numbered = raw.match(/\b(1[1-6])\b/);
  const modifier = raw.match(/\b(pro max|pro-max|plus|pro|max|mini|air)\b/i);
  if (numbered) {
    const gen = numbered[1];
    const candidates = products.filter(product => new RegExp('\\b' + gen + '\\b').test(product.name));
    if (modifier) {
      const wanted = modifier[1].toLowerCase().replace('pro-max', 'pro max');
      const hit = candidates.find(product => product.name.toLowerCase().includes(wanted));
      if (hit) return hit;
    }
    const base = candidates.find(product => /^(.+\s)?(iphone|ipad|galaxy)\s+\d+$/i.test(product.name) || new RegExp('\\b' + gen + '$', 'i').test(product.name));
    if (base) return base;
    if (candidates.length === 1) return candidates[0];
  }
  if (modifier && products.length) {
    const wanted = modifier[1].toLowerCase().replace('pro-max', 'pro max');
    const hit = products.find(product => product.name.toLowerCase().includes(wanted));
    if (hit) return hit;
  }
  return null;
}

function result(text, events, extra) {
  return Object.assign({
    text,
    language: 'en',
    events,
    fields: {},
    matchCount: 0,
    chips: [],
  }, extra);
}


function productQuery(text) {
  return String(text || '')
    .replace(/^(do you (?:have|carry|sell|stock)|have you got|is there (?:an? |any )?|are there |(?:i\s+)?(?:want|need|would like|wanna|looking for|looking to buy|need to (?:get|buy)|want to (?:get|buy|order))|i['’]d like|get me)\s+/i, '')
    .replace(/^(an?|the|some)\s+/i, '')
    .replace(/\?+$/, '')
    .replace(/\s+in (?:the|your) (?:technology )?catalogu?e\??$/i, '')
    .trim();
}

function familyName(query) {
  const match = String(query || '').trim().match(/^(?:apple\s+)?(iphone|ipad|macbook|galaxy)s?$/i);
  return match ? match[1] : null;
}

function shortVariant(name, family) {
  return String(name || '').replace(new RegExp('^(?:apple\\s+)?' + family + '\\s+', 'i'), '').trim() || name;
}

function sortVariants(labels) {
  const rank = { '': 0, mini: 1, plus: 2, air: 3, pro: 4, 'pro max': 5 };
  return labels.slice().sort((left, right) => {
    const a = Number((String(left).match(/(\d+)/) || [])[1] || 0);
    const b = Number((String(right).match(/(\d+)/) || [])[1] || 0);
    if (a !== b) return b - a;
    const va = String(left).replace(/^\d+\s*/i, '').toLowerCase();
    const vb = String(right).replace(/^\d+\s*/i, '').toLowerCase();
    return (Object.hasOwn(rank, va) ? rank[va] : 9) - (Object.hasOwn(rank, vb) ? rank[vb] : 9);
  });
}

function productsForQuery(query, products) {
  const asked = String(query || '').trim();
  const iphone = asked.match(/iphone\s+(1[0-9])/i);
  if (iphone) {
    const gen = iphone[1];
    return (products || []).filter(product => new RegExp('\\biphone\\s+' + gen + '\\b', 'i').test(product.name));
  }
  return products || [];
}

function availabilityReply(query, products) {
  const label = productQuery(query) || uniqueNames(products)[0];
  products = productsForQuery(label, products);
  const names = uniqueNames(products);
  const family = familyName(label);
  if (family && names.length) {
    const variants = sortVariants(names.map(name => shortVariant(name, family)));
    const shown = variants.slice(0, 8);
    const list = shown.join(', ') + (variants.length > shown.length ? '...' : '');
    const plural = family.toLowerCase() === 'iphone' ? 'iPhones' : family + 's';
    return result(
      'Yes, we have ' + plural + ' in our catalogue: ' + list + '. Which model are you looking for?',
      ['product-guide'],
      { chips: names.slice(0, 5), awaiting: 'model', lastFamily: names[0], lastProducts: products, matchCount: products.length }
    );
  }
  if (!names.length) {
    if (!familyName(label) && !/\b(iphone|ipad|macbook|galaxy)\b/i.test(label)) {
      return sourceReply(label);
    }
    const closest = uniqueNames(closestFamily(label)).slice(0, 4);
    const extra = closest.length
      ? ' The closest we have is the ' + listWords(closest) + '. Would you like to look at that?'
      : ' I can help you look for a close equivalent if you tell me the spec you need.';
    return result(
      "I don't see the " + label + ' in our catalogue.' + extra,
      ['product-guide', 'not-in-catalog'],
      { chips: closest.slice(0, 4).concat(['Talk to someone']).slice(0, 5), awaiting: closest.length ? 'model' : null, lastFamily: closest[0], lastProducts: closestFamily(label) }
    );
  }
  return result(
    'Yes, we have the ' + (names[0].replace(/\s+(Plus|Pro Max|Pro|Max|mini|Air)$/i, '') || names[0]) + ' in our catalogue. Our team will confirm stock with your quote. Which model are you looking for?',
    ['product-guide'],
    { chips: names.slice(0, 5), awaiting: 'model', lastFamily: names[0], lastProducts: products, matchCount: products.length }
  );
}

function colorReply(product, asked) {
  const colors = productColors(product);
  const name = product.name;
  if (!colors.length) {
    return result(
      'A team member will confirm the available colors for the ' + name + '.',
      ['product-guide'],
      { chips: ['Request a quote', 'Talk to someone'], lastModel: product, awaiting: null }
    );
  }
  const matched = colorMatch(asked, colors);
  if (matched) {
    return result(
      'Yes, we have the ' + name + ' in ' + matched + '. Our team will confirm stock with your quote.',
      ['product-guide'],
      { chips: ['Request a quote', 'Talk to someone'], lastModel: product, awaiting: null }
    );
  }
  return result(
    "We don't have the " + name + ' in ' + asked.trim() + ', but we have it in ' + listWords(colors) + '.',
    ['product-guide'],
    { chips: colors.slice(0, 4).concat(['Request a quote']).slice(0, 5), lastModel: product, awaiting: 'color' }
  );
}


const SERVICE_SLA = 'Someone from our team will get back to you within 24 hours.';
const FORM_LINK = '[request form](#signup)';
const FORM_START = /^(yes|yeah|yep|ok|okay|sure|please)[.!]?\s*$|^fill out a (quick )?form$|^i (can |will |want to )?fill( out)?( this| the| a)? form\b|^help me fill\b|^start (the |a )?form\b/i;
const FORM_CONTACT = /^(?:(?:my\s+)?(?:phone|whatsapp|email|e-mail)(?:\s+(?:is|number))?\s*[:\-]?\s*)?(.+)$/i;

const SERVICE_INTENTS = [
  { topic: 'service-order', re: /\b(existing order|help with (an? )?(existing )?order|order (help|support|status|issue|problem|number)|track (my |an )?order)\b/i, lead: 'I can help with an **existing order**.' },
  { topic: 'service-wholesale', re: /\b(wholesale(?:s)? request|wholesale requests|handle wholesale|wholesale inquir|(?:^|\bhow do (?:you|we) handle\b).*wholesale|bulk request)\b|\bwholesale\b/i, lead: 'We handle **wholesale** and bulk requests through our team.' },
  { topic: 'service-availability', re: /\b((?:can|could|will) the team confirm (?:product )?availability|confirm (?:product )?availability|how do (?:you|i|we) (?:confirm|check) (?:product )?availability)\b/i, lead: 'Yes, our team can **confirm product availability** with your request. I cannot confirm stock here.' },
];

const CATEGORY_DEFS = [
  { label: 'phones', pattern: /^(phones?|smartphones?)$/i, match: product => product.categoryId === 'phones' },
  { label: 'chargers', pattern: /^(chargers?|charging cables?)$/i, match: product => product.categoryId === 'accessories' && /charg/i.test((product.name || '') + ' ' + (product.family || '')) },
  { label: 'laptops', pattern: /^(laptops?|notebooks?)$/i, match: product => product.categoryId === 'computers' && /laptop|notebook|macbook|elitebook|probook|thinkpad|latitude|ideapad|yoga|zbook|vivobook|aspire|xps|surface/i.test((product.name || '') + ' ' + (product.family || '') + ' ' + (product.category || '')) },
  { label: 'computers', pattern: /^(computers?|desktops?|pcs?|workstations?)$/i, match: product => product.categoryId === 'computers' },
  { label: 'tablets', pattern: /^(tablets?)$/i, match: product => product.categoryId === 'tablets' },
  { label: 'monitors', pattern: /^(monitors?|screens?)$/i, match: product => product.categoryId === 'monitors' },
  { label: 'printers', pattern: /^(printers?)$/i, match: product => product.categoryId === 'printers' },
  { label: 'TVs', pattern: /^(tvs?|televisions?)$/i, match: product => product.categoryId === 'tvs' },
  { label: 'servers', pattern: /^(servers?)$/i, match: product => product.categoryId === 'servers' },
];

function joinBlocks(parts) {
  return parts.filter(Boolean).join('\n\n');
}

function serviceContacts(offerForm) {
  const line = 'Email **' + EMAIL + '** or WhatsApp **' + WHATSAPP + '**' + (offerForm ? ', or I can help you fill out a quick form.' : '.');
  return joinBlocks([line, 'You can also use the ' + FORM_LINK + ' on this page.', SERVICE_SLA]);
}

function serviceReply(intent) {
  return result(joinBlocks([intent.lead, serviceContacts(true)]), ['service-help'], {
    chips: ['Fill out a form', 'Talk to someone'],
    awaiting: 'form-offer',
    lastTopic: intent.topic,
  });
}

function sourceReply(label) {
  const shown = label ? '**' + label + '**' : 'that';
  return result(
    joinBlocks([
      "I don't see " + shown + ' in our catalogue. We can source it, let us check.',
      serviceContacts(true),
    ]),
    ['service-help', 'not-in-catalog', 'source-offer'],
    { chips: ['Fill out a form', 'Talk to someone'], awaiting: 'form-offer', lastTopic: 'service-source' }
  );
}

function looksLikeProductLookup(text) {
  const query = productQuery(text);
  if (!query) return false;
  if (familyName(query)) return true;
  if (/\b(iphone|ipad|macbook|galaxy|pixel|starlink)\s+\w+/i.test(query)) return true;
  if (HAVE_ASK.test(text) && familyName(query)) return true;
  return false;
}

function serviceIntent(text) {
  const raw = String(text || '').trim();
  if (looksLikeProductLookup(raw) && !SERVICE_INTENTS[2].re.test(raw)) return null;
  // A named product plus wholesale (e.g. 50 iPhones wholesale) stays a product ask.
  if (/\bwholesale\b/i.test(raw) && (HAVE_ASK.test(raw) || WANT_ASK.test(raw) || familyName(productQuery(raw)))) return null;
  for (const intent of SERVICE_INTENTS) {
    if (intent.re.test(raw)) return intent;
  }
  return null;
}

function categoryToken(text) {
  let query = productQuery(text);
  query = query.replace(/^(please|just)\s+/i, '').replace(/\s+(please|now|today)\s*[?.!]*$/i, '').replace(/[?.!]+$/, '').trim();
  return query;
}

function categoryDef(text) {
  const token = categoryToken(text);
  if (!token || token.split(/\s+/).length > 3) return null;
  return CATEGORY_DEFS.find(entry => entry.pattern.test(token)) || null;
}

function productsForDef(entry) {
  return (loadCatalog().products || []).filter(entry.match);
}

function brandTypeLabel(brand, items) {
  if (/^apple$/i.test(brand) && items.length && items.every(item => /iphone/i.test(item.name) || /iphone/i.test(item.family || ''))) {
    return 'iPhone';
  }
  return brand;
}

function categoryChips(products) {
  const groups = new Map();
  for (const product of products || []) {
    const brand = product.brand || '';
    if (!brand || /^various$/i.test(brand)) continue;
    const label = brandTypeLabel(brand, [product]);
    if (!groups.has(label)) groups.set(label, { count: 0, first: product });
    groups.get(label).count++;
  }
  const brands = [...groups.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([label]) => label);
  if (brands.length) return brands.slice(0, 6);
  const types = uniqueNames(products);
  return types.slice(0, 6);
}

function matchChip(text, products) {
  const raw = String(text || '').trim();
  if (!raw || !products || !products.length) return [];
  if (/^iphone$/i.test(raw)) return products.filter(item => /iphone/i.test(item.name) || /iphone/i.test(item.family || '') || /^apple$/i.test(item.brand || ''));
  const brand = products.filter(item => (item.brand || '').toLowerCase() === raw.toLowerCase() || brandTypeLabel(item.brand, [item]).toLowerCase() === raw.toLowerCase());
  if (brand.length) return brand;
  const named = products.filter(item => item.name.toLowerCase() === raw.toLowerCase() || (item.family || '').toLowerCase() === raw.toLowerCase());
  if (named.length) return named;
  const partial = products.filter(item => item.name.toLowerCase().includes(raw.toLowerCase()) || (item.family || '').toLowerCase().includes(raw.toLowerCase()));
  return partial.length && partial.length < products.length ? partial : [];
}

function categoryReply(entry, products) {
  if (!products.length) return sourceReply(entry.label);
  const chips = categoryChips(products);
  const types = uniqueNames(products);
  const askBrand = chips.length && chips.every(label => products.some(item => (item.brand && item.brand.toLowerCase() === label.toLowerCase()) || brandTypeLabel(item.brand, [item]) === label));
  if (askBrand && !chips.every(label => types.includes(label))) {
    return result(
      'Yes, we have **' + entry.label + '**. Which brand?',
      ['category-guide', 'product-guide'],
      { chips: chips.slice(0, 6), awaiting: 'brand', lastFamily: entry.label, lastProducts: products, lastTopic: 'product:' + entry.label, matchCount: products.length }
    );
  }
  const listed = types.slice(0, 6).map(name => '**' + name + '**').join(', ');
  return result(
    'Yes, we have **' + entry.label + '**. We list ' + listed + '. What type are you looking for?',
    ['category-guide', 'product-guide'],
    { chips: (chips.length ? chips : types).slice(0, 6), awaiting: 'type', lastFamily: entry.label, lastProducts: products, lastTopic: 'product:' + entry.label, matchCount: products.length }
  );
}

function selectedItemsReply(label, products, session) {
  const names = uniqueNames(products);
  if (!names.length) return sourceReply(label);
  if (names.length === 1) {
    const product = products[0];
    const colors = productColors(product);
    if (colors.length) {
      return result(
        'Yes, we have the **' + names[0] + '**. What color are you looking for?',
        ['category-guide', 'product-guide'],
        { chips: colors.slice(0, 5), awaiting: 'color', lastModel: product, lastProducts: products, lastFamily: session.lastFamily || label, lastTopic: session.lastTopic, matchCount: 1 }
      );
    }
    return result(
      'Yes, we have **' + names[0] + '** in our catalogue. Our team will confirm stock with your quote.',
      ['category-guide', 'product-guide'],
      { chips: ['Request a quote', 'Talk to someone'], awaiting: null, lastModel: product, lastProducts: products, lastFamily: session.lastFamily || label, lastTopic: session.lastTopic, matchCount: 1 }
    );
  }
  return result(
    'Yes, we have **' + label + '** in our catalogue: ' + names.slice(0, 8).join(', ') + '. Which model are you looking for?',
    ['category-guide', 'product-guide'],
    { chips: names.slice(0, 5), awaiting: 'model', lastProducts: products, lastFamily: label, lastTopic: session.lastTopic || ('product:' + label), matchCount: products.length }
  );
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPhone(value) {
  const raw = String(value || '').trim();
  return /^[+()0-9 .\-]{7,40}$/.test(raw) && raw.replace(/\D/g, '').length >= 7;
}

function formDraft(session) {
  return Object.assign({ name: '', contact: '', need: '' }, session.formDraft || {});
}

function formReply(text, draft, awaiting, events) {
  return result(text, events || ['form-intake', 'service-help'], {
    chips: ['Start over', 'Cancel request'],
    awaiting,
    formDraft: draft,
    lastTopic: 'form-intake',
  });
}

function startForm(session) {
  return formReply('Sure, I can help you fill out a quick form. What is your **name**?', { name: '', contact: '', need: '', topic: session.lastTopic || '' }, 'form-name');
}

function guidedForm(text, session) {
  const raw = String(text || '').trim();
  const awaiting = session.awaiting;
  if (String(awaiting || '').startsWith('form-') && /^(cancel|cancel request)$/i.test(raw)) {
    return result('Request cancelled. What else can I help with?', ['form-intake'], {
      chips: ['Request a quote', 'Talk to someone'], awaiting: null, formDraft: null, lastTopic: null,
    });
  }
  if (String(awaiting || '').startsWith('form-') && awaiting !== 'form-offer' && /^start over$/i.test(raw)) {
    return startForm(session);
  }
  if (awaiting === 'form-offer') {
    if (FORM_START.test(raw) || /^fill out a form$/i.test(raw)) return startForm(session);
    return null;
  }
  if (awaiting === 'form-name') {
    if (raw.length < 2 || raw.length > 100) return formReply('Please enter a name under 100 characters.', formDraft(session), 'form-name');
    const draft = Object.assign(formDraft(session), { name: raw });
    return formReply('Thanks, **' + draft.name + '**. What **phone**, WhatsApp, or **email** should the team use?', draft, 'form-contact');
  }
  if (awaiting === 'form-contact') {
    const value = raw.replace(/^(?:my\s+)?(?:phone|whatsapp|email|e-mail)(?:\s+(?:is|number))?\s*[:\-]?\s*/i, '').trim();
    if (!isEmail(value) && !isPhone(value)) {
      return formReply('Please enter a **phone**, WhatsApp number, or **email**.', formDraft(session), 'form-contact');
    }
    const draft = Object.assign(formDraft(session), { contact: value });
    return formReply('What do you need help with?', draft, 'form-need');
  }
  if (awaiting === 'form-need') {
    if (raw.length < 2) return formReply('Please tell me briefly what you need help with.', formDraft(session), 'form-need');
    const draft = Object.assign(formDraft(session), { need: raw.slice(0, 2000) });
    const textOut = joinBlocks([
      'Thanks, **' + draft.name + '**. I have your request for the team.',
      'Please also send it to **' + EMAIL + '** or WhatsApp **' + WHATSAPP + '**, or use the ' + FORM_LINK + ' on this page.',
      SERVICE_SLA,
    ]);
    return result(textOut, ['form-intake', 'service-help', 'form-complete'], {
      chips: ['Talk to someone'],
      awaiting: null,
      formDraft: draft,
      lastTopic: 'form-complete',
    });
  }
  return null;
}

function isNewQuestion(text) {
  const raw = String(text || '').trim();
  if (serviceIntent(raw) || CONTACT_ASK.test(raw) || HELP_ASK.test(raw)) return true;
  if (HAVE_ASK.test(raw) || (WANT_ASK.test(raw) && categoryToken(raw).length > 0)) return true;
  if (categoryDef(raw) && /^(do you|can you|how |what |where |when |i want|i need)/i.test(raw)) return true;
  return /^(how |can |could |do you |what |where |when |why )/i.test(raw) && raw.length > 20;
}

function isSlotFill(text, session) {
  if (!session || !session.awaiting) return false;
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (String(session.awaiting).startsWith('form-') && session.awaiting !== 'form-offer') return true;
  if (CONTACT_ASK.test(raw) || serviceIntent(raw)) return false;
  if (isNewQuestion(raw) && session.awaiting === 'form-offer') return false;
  if (isNewQuestion(raw) && !String(session.awaiting).startsWith('form-')) {
    // A short brand/model/color answer is not a new question.
    if (['brand', 'type', 'model', 'color'].includes(session.awaiting) && raw.length <= 48 && !/[?]/.test(raw) && !HAVE_ASK.test(raw) && !WANT_ASK.test(raw) && !serviceIntent(raw)) {
      return true;
    }
    return false;
  }
  if (session.awaiting === 'form-offer') return FORM_START.test(raw) || /^fill out a form$/i.test(raw);
  if (String(session.awaiting).startsWith('form-')) return true;
  if (['brand', 'type', 'model', 'color'].includes(session.awaiting)) {
    if (HAVE_ASK.test(raw) || (WANT_ASK.test(raw) && categoryToken(raw) && !pickModel(raw, session.lastProducts || []) && !matchChip(raw, session.lastProducts || []).length)) return false;
    if (categoryDef(raw) && topicOf(raw, {}) !== (session.lastTopic || '')) return false;
    return true;
  }
  return false;
}

function topicOf(text, session) {
  const raw = String(text || '').trim();
  if (session && session.awaiting && isSlotFill(raw, session)) return session.lastTopic || 'followup';
  if (CONTACT_ASK.test(raw)) return 'contact';
  if (HELP_ASK.test(raw)) return 'help';
  const intent = serviceIntent(raw);
  if (intent) return intent.topic;
  const entry = categoryDef(raw);
  if (entry) return 'product:' + entry.label;
  const query = productQuery(raw);
  const family = familyName(query);
  if (HAVE_ASK.test(raw) || WANT_ASK.test(raw) || family || /^\s*(?:the )?((?:apple )?iphone(?:\s+1[1-6])?(?:\s+(?:pro max|pro|plus|max|mini))?)\s*\??\s*$/i.test(raw)) {
    return 'product:' + (family ? family.toLowerCase() : (query || raw).toLowerCase().replace(/\s+/g, ' ').slice(0, 48));
  }
  if (PRICE_ASK.test(raw)) return 'faq-price';
  if (PAY_ASK.test(raw) || LEGAL_ASK.test(raw)) return 'faq-pay';
  if (TIMELINE_ASK.test(raw)) return 'faq-timeline';
  if (DELIVERY_ASK.test(raw)) return 'faq-delivery';
  if (SCHOOL_ASK.test(raw)) return 'faq-school';
  if (TRUST_ASK.test(raw)) return 'faq-trust';
  if (WEBSITE_ASK.test(raw)) return 'faq-website';
  return 'general:' + raw.toLowerCase().slice(0, 48);
}

function shouldResetContext(text, session) {
  if (!session || !(session.lastTopic || session.awaiting || (session.lastProducts || []).length || session.lastModel)) return false;
  if (isSlotFill(text, session)) return false;
  const next = topicOf(text, {});
  const prev = session.lastTopic;
  if (!next || !prev) return Boolean(prev && next && next !== prev);
  return next !== prev;
}

function guidedCategory(text, session) {
  const awaiting = session && session.awaiting;
  if ((awaiting === 'brand' || awaiting === 'type') && (session.lastProducts || []).length) {
    const matched = matchChip(text, session.lastProducts);
    if (matched.length) return selectedItemsReply(categoryToken(text) || uniqueNames(matched)[0], matched, session);
    const picked = pickModel(text, session.lastProducts);
    if (picked) return selectedItemsReply(picked.name, [picked], session);
  }
  const entry = categoryDef(text);
  if (!entry) return null;
  return categoryReply(entry, productsForDef(entry));
}

function genericSourceAsk(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length > 48) return false;
  if (serviceIntent(raw) || CONTACT_ASK.test(raw) || HELP_ASK.test(raw) || PRICE_ASK.test(raw)) return false;
  if (/\b(starlink|install(?:ation)?|invoice|refund)\b/i.test(raw)) return false;
  if (categoryDef(raw) || familyName(productQuery(raw))) return false;
  const query = categoryToken(raw);
  if (!query || query.split(/\s+/).length > 3) return false;
  if (HAVE_ASK.test(raw) || WANT_ASK.test(raw) || /^\s*[a-z][a-z0-9 \-]{1,30}\s*[?.!]?\s*$/i.test(raw)) return true;
  return false;
}

function guidedReply(rawInput, session, lang, flags) {
  flags = flags || {};
  const text = String(rawInput || '').trim();
  if (!text) return null;

  if (HELP_ASK.test(text)) {
    return result('Sure, what can I help with?', ['prompt-help'], { chips: ['Phones & laptops', 'Request a quote', 'Talk to someone'] });
  }

  // Contact intent always wins over catalogue matching.
  if (CONTACT_ASK.test(text) && !PRICE_ASK.test(text)) {
    return result(
      'You can reach us at ' + EMAIL + ' or WhatsApp ' + WHATSAPP + '. I can connect you with someone from the team if you like.',
      ['contact-info'],
      { chips: ['Talk to someone', 'Request a quote'] }
    );
  }

  const form = guidedForm(text, session);
  if (form) return form;

  const intent = serviceIntent(text);
  if (intent) return serviceReply(intent);

  const category = guidedCategory(text, session);
  if (category) return category;

  if (session.awaiting === 'color' && session.lastModel && session.lastModel.name && !HAVE_ASK.test(text) && !CONTACT_ASK.test(text)) {
    if (/\b(quote|talk to someone|speak to a person|price)\b/i.test(text)) return null;
    return colorReply(session.lastModel, text);
  }

  if (session.awaiting === 'model' && (session.lastProducts || []).length && !CONTACT_ASK.test(text)) {
    if (/\b(quote|talk to someone|speak to a person|price)\b/i.test(text) && !/^\s*(15|16|pro|plus)\b/i.test(text)) return null;
    const picked = pickModel(text, session.lastProducts);
    if (picked) {
      const colors = productColors(picked);
      return result(
        'Yes, we have that. What color are you looking for?',
        ['product-guide'],
        {
          chips: colors.length ? colors.slice(0, 5) : ['Request a quote', 'Talk to someone'],
          awaiting: colors.length ? 'color' : null,
          lastModel: picked,
          lastProducts: session.lastProducts,
          lastFamily: session.lastFamily,
          matchCount: 1,
        }
      );
    }
    if (/^\s*(\d{2}|pro|plus|max|mini|air|iphone.*)\b/i.test(text)) {
      const switched = familySearch(text);
      if (switched.length) {
        const pickedSwitch = pickModel(text, switched) || switched[0];
        return result(
          'Yes, we have that. What color are you looking for?',
          ['product-guide'],
          {
            chips: productColors(pickedSwitch).slice(0, 5),
            awaiting: productColors(pickedSwitch).length ? 'color' : null,
            lastModel: pickedSwitch,
            lastProducts: switched,
            matchCount: 1,
          }
        );
      }
    }
  }

  const skipWant = /\b(speak to|talk to|request a quote|start a quote)\b/i.test(text);
  const wantQuery = productQuery(text);
  const wantProduct = !skipWant && WANT_ASK.test(text) && wantQuery.length > 0 && wantQuery.length <= 48 && !/\b(what models|listed in|how many)\b/i.test(text);
  if (HAVE_ASK.test(text) || wantProduct || /^\s*(?:the )?((?:apple )?iphone(?:\s+1[1-6])?(?:\s+(?:pro max|pro|plus|max|mini))?)\s*\??\s*$/i.test(text)) {
    const query = wantQuery;
    if (query && !/\bstarlink\b/i.test(query)) {
      return availabilityReply(query, familySearch(query));
    }
  }

  // Alison FAQ patterns (Starlink is intentionally not handled here).
  if (flags.priceAsk) {
    const named = familySearch(text);
    const item = named[0] ? ' For the ' + named[0].name + ',' : '';
    return result(
      'Prices are quoted per order, based on the model, quantity, and delivery country.' + item + ' our team will confirm stock with your quote. What item do you need, and how many?',
      ['faq-price', 'refused-price'],
      { chips: ['Request a quote', 'Talk to someone'], lastProducts: named, matchCount: 0 }
    );
  }

  if (PAY_ASK.test(text) || LEGAL_ASK.test(text)) {
    const handoff = /\b(invoice|refund|damage|legal|lawyer)\b/i.test(text);
    const line = handoff
      ? 'Thanks, someone from our team will reach out to you shortly. What is the best WhatsApp number or email to reach you?'
      : 'Payment is agreed after a quote is accepted. Please never pay before you have a full written quote. Would you like to start a quote now?';
    return result(line, handoff ? ['faq-pay', 'tag-osman-handoff'] : ['faq-pay'], {
      chips: handoff ? [] : ['Request a quote', 'Talk to someone'],
      handoff: handoff ? { tagOsman: true } : undefined,
    });
  }

  if (TIMELINE_ASK.test(text) && !HAVE_ASK.test(text)) {
    return result(
      "The timeline comes with your quote; I won't guess a delivery date. What date do you need it by?",
      ['faq-timeline'],
      { chips: ['Request a quote', 'Talk to someone'] }
    );
  }

  if (DELIVERY_ASK.test(text) && !HAVE_ASK.test(text) && !/\bstarlink\b/i.test(text) && !/\binstall/i.test(text)) {
    return result(
      'Yes, we deliver in our main markets: Sierra Leone, Guinea, Liberia, and Guinea-Bissau. Delivery cost and timing come with your quote. Which city should it go to?',
      ['faq-delivery'],
      { chips: ['Request a quote', 'Talk to someone'] }
    );
  }

  if (SCHOOL_ASK.test(text) && !HAVE_ASK.test(text)) {
    return result(
      "Yes, schools and NGOs are a main area for us, including full packages. Roughly how many users or classrooms are you planning for?",
      ['faq-school'],
      { chips: ['Request a quote', 'Talk to someone'] }
    );
  }

  if (TRUST_ASK.test(text)) {
    return result(
      'You can reach LAVAALL at ' + EMAIL + ' or WhatsApp ' + WHATSAPP + '. Nothing is charged until a written quote is agreed. Would you prefer WhatsApp or email?',
      ['faq-trust'],
      { chips: ['Talk to someone', 'Request a quote'] }
    );
  }

  if (WEBSITE_ASK.test(text)) {
    return result(
      'Yes, we start with a free preview. What is the business name, and do you already have a site?',
      ['faq-website'],
      { chips: ['Talk to someone'] }
    );
  }

  if (!session.awaiting && genericSourceAsk(text)) {
    const looked = familySearch(categoryToken(text));
    const useful = (looked || []).filter(item => !/cases|protector/i.test((item.name || '') + ' ' + (item.family || '') + ' ' + (item.categoryId || '')));
    if (!useful.length) return sourceReply(categoryToken(text));
  }

  return null;
}

module.exports = {
  guidedReply, productColors, pickModel, CONTACT_ASK, HAVE_ASK, HELP_ASK,
  shouldResetContext, topicOf, serviceIntent, categoryDef, SERVICE_SLA, FORM_START,
};
