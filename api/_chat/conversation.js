'use strict';

const { searchCatalog, loadCatalog, normalizeInput, purchaseDetails } = require('./catalog');
const narrow = require('./narrow');
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
  if (items.length > 8) return listWords(items.slice(0,8)) + ', and ' + (items.length-8) + ' more';
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}

function familySearch(query) {
  const result = searchCatalog(query, { limit: 24 });
  return (result.all && result.all.length ? result.all : result.matches) || [];
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
  const hit = narrow.resolve(text, {});
  return products.find(p => hit.ids.includes(p.id)) || null;
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
    .replace(/^(?:(?:can|could|do)\s+)?(?:(?:you|una)\s+)?(?:have|get|sell|stock)\s+/i, '')
    .replace(/^(?:can you |could you )?(?:show|list)(?: me)?\s+/i, '')
    .replace(/^(an?|the|some)\s+/i, '')
    .replace(/\s+(?:models?\s+)?please$/i, '')
    .replace(/\?+$/, '')
    .replace(/\s+in (?:the|your) (?:technology )?catalogu?e\??$/i, '')
    .trim();
}

function familyName(query) {
  const hit = narrow.resolve(query);
  return hit.level !== 'none' && hit.level !== 'not-carried' && String(query).split(/\s+/).length <= 4 ? query : null;
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
      name + ', ' + matched + '. We list it; our team confirms stock with your quote.',
      ['product-guide'],
      { chips: ['Request a quote', 'Talk to someone'], lastModel: product, awaiting: null }
    );
  }
  return result(
    sourceLine(),
    ['product-guide'],
    { chips: colors.slice(0, 4).concat(['Request a quote']).slice(0, 5), lastModel: product, awaiting: 'color' }
  );
}


const SERVICE_SLA = 'Someone from our team will get back to you within 24 hours.';
function sourceLine() { return SERVICE_SLA + ' Would you like to fill out a quick form?'; }
const FORM_LINK = '[request form](#signup)';
const FORM_START = /^(yes|yeah|yep|ok|okay|sure|please)[.!]?\s*$|^fill out a (quick )?form$|^i (can |will |want to )?fill( out)?( this| the| a)? form\b|^help me fill\b|^start (the |a )?form\b/i;
const FORM_CONTACT = /^(?:(?:my\s+)?(?:phone|whatsapp|email|e-mail)(?:\s+(?:is|number))?\s*[:\-]?\s*)?(.+)$/i;

const SERVICE_INTENTS = [
  { topic: 'service-order', re: /\b(existing order|help with (an? )?(existing )?order|order (help|support|status|issue|problem|number)|track (my |an )?order)\b/i, lead: 'I can help with an **existing order**.' },
  { topic: 'service-wholesale', re: /\b(wholesale(?:s)? request|wholesale requests|handle wholesale|wholesale inquir|(?:^|\bhow do (?:you|we) handle\b).*wholesale|bulk request)\b|\bwholesale\b/i, lead: 'We handle **wholesale** and bulk requests through our team.' },
  { topic: 'service-availability', re: /\b((?:can|could|will) the team confirm (?:product )?availability|confirm (?:product )?availability|how do (?:you|i|we) (?:confirm|check) (?:product )?availability)\b/i, lead: 'Yes, our team can **confirm product availability** with your request. I cannot confirm stock here.' },
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
  return result(
    sourceLine(),
    ['service-help', 'not-in-catalog', 'source-offer'],
    { chips: ['Fill out a form', 'Talk to someone'], awaiting: 'form-offer', lastTopic: 'service-source' }
  );
}

function looksLikeProductLookup(text) {
  const query = productQuery(text);
  if (!query) return false;
  if ((HAVE_ASK.test(text) || WANT_ASK.test(text) || query.split(/\s+/).length <= 3) && familyName(query)) return true;
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
  const hit = narrow.resolve(categoryToken(text));
  return hit.scope.categoryId && hit.level !== 'none' ? { label: hit.scope.categoryId } : null;
}

// Slot corrections are parsed before catalogue discovery so numbers cannot switch models.
function correctionValue(text) {
  const raw = String(text || '').trim().replace(/[.!?]+$/, '');
  let match = raw.match(/^(?:naw|nah|no)[, ]+\s*(?:i mean\s+)?(.+)$/i)
    || raw.match(/^(?:actually|i mean)\s+(.+)$/i)
    || raw.match(/^not\s+.+?\s+but\s+(.+)$/i)
    || raw.match(/^not\s+[^,]+,\s*(.+)$/i)
    || raw.match(/^(.+?)\s+(?:i mean)\s+(.+)$/i);
  if (match) return match[2] || match[1];
  match = raw.match(/^(.+?)\s+not\s+.+$/i);
  return match ? match[1] : null;
}

function hasSlotContext(text, session) {
  if (String(session.awaiting || '').startsWith('handoff-')) return false;
  return Boolean(correctionValue(text) || commercialFollowup(text, session) || session.pendingSamsung ||
    (/^(?:quantity\s+|(?:i\s+)?need\s+)?\d+\s*(?:gb|tb|units?|pieces?)?[.!?]?$/i.test(String(text).trim()) &&
      (session.lastModel || session.lastProducts?.length || session.slots && Object.keys(session.slots).length)));
}

function slotReply(text, session) {
  const raw = normalizeInput(String(text || '').trim());
  if (String(session.awaiting || '').startsWith('handoff-') || String(session.awaiting || '').startsWith('form-') && session.awaiting !== 'form-offer') return null;
  const products = narrow.buildTree(loadCatalog().products);
  const slots = { ...(session.slots || {}) };
  const corrected = correctionValue(raw);
  const value = corrected || raw;
  const field = session.lastModel && narrow.variantField(session.lastModel);
  if (!corrected && session.awaiting === 'variant' && field && field.options.some(option => normalizeInput(option) === raw)) {
    const reply = narrowingReply(raw, session);
    if (reply && /ram/i.test(field.key + ' ' + field.label)) reply.slots = { ...slots, ram: raw.toUpperCase(), lastSlot: 'ram' };
    return reply;
  }
  const shared = { slots, lastModel: session.lastModel, selectedVariant: session.selectedVariant,
    narrow: session.narrow, lastProducts: session.lastProducts, lastTopic: session.lastTopic, awaiting: session.awaiting };
  const done = (line, extra) => result(line, ['product-guide', 'slot-update'], { ...shared, chips: ['Request a quote', 'Talk to someone'], ...extra });
  const samsung = raw.match(/\b(?:samsung\s+)?a\s*(\d{2})\b/i);
  if (session.pendingSamsung && /^(?:yes|yes please|correct|confirm|galaxy\s+a\s*\d{2})[.!]?$/i.test(raw)) {
    const reply = narrowingReply(session.pendingSamsung, { ...session, pendingSamsung: null, awaiting: null, narrow: null });
    return reply && { ...reply, pendingSamsung: null };
  }
  if (samsung && !/\bgalaxy\b/i.test(raw)) {
    const label = 'Galaxy A' + samsung[1];
    const listed = products.some(p => new RegExp('\\bGalaxy A' + samsung[1] + '\\b', 'i').test(p.name));
    if (listed) return done('Do you mean the ' + label + '?', { pendingSamsung: label, chips: [label], lastModel: null, selectedVariant: null, narrow: null, lastProducts: [], awaiting: 'samsung-confirm' });
    const nearest = products.filter(p => /\bGalaxy A\d+/i.test(p.name)).sort((a,b) => Math.abs(Number(a.name.match(/A(\d+)/)[1]) - Number(samsung[1])) - Math.abs(Number(b.name.match(/A(\d+)/)[1]) - Number(samsung[1]))).slice(0,3).map(p => p.name);
    return done(sourceLine(), { chips: nearest.concat(['Talk to someone']), lastModel: null, selectedVariant: null, narrow: null, lastProducts: [], awaiting: null });
  }
  const place = value.match(/^(?:to\s+|in\s+)?(sierra leone|guinea[- ]bissau|guinea|liberia|conakry|freetown|monrovia|bo|kenema)$/i);
  if (place && (corrected || /deliver|ship|country|city/i.test(session.lastTopic || ''))) {
    const label = place[1].replace(/\b\w/g, c => c.toUpperCase());
    const key = /sierra leone|guinea|liberia/i.test(label) ? 'deliveryCountry' : 'deliveryCity';
    const before = slots[key]; slots[key] = label; slots.lastSlot = key;
    return done('Got it, ' + label + (before && before !== label ? ' instead of ' + before : '') + '.', { awaiting: null });
  }
  const ram = (corrected && slots.lastSlot === 'ram') || /\bram\b/i.test(raw) || /\d+\s*gb\s+i mean\s+\d+/i.test(raw);
  const number = value.replace(/^ram\s*/i, '').match(/^(?:(?:quantity|qty|for|(?:i\s+)?need)\s+)?(\d+)\s*(gb|tb|units?|pieces?)?$/i);
  if (number) {
    const n = number[1], unit = (number[2] || '').toLowerCase();
    if (ram) {
      const before = slots.ram; slots.ram = n + 'GB'; slots.lastSlot = 'ram';
      return done('Got it, RAM ' + slots.ram + (before ? ' instead of ' + before : '') + '.' + (!session.lastModel ? ' Which device is this for?' : ''), { awaiting: null });
    }
    if ((/^(gb|tb)$/.test(unit) || corrected && slots.lastSlot === 'storage') && session.lastModel) {
      slots.storage = n + (unit || (slots.storage || '').replace(/\d+/g, '') || 'GB').toUpperCase(); slots.lastSlot = 'storage';
      return done([session.lastModel.name, session.selectedVariant, slots.storage].filter(Boolean).join(', ') + '. We list it; our team confirms stock with your quote.', { awaiting: null });
    }
    if (!corrected && !unit && /^\d+$/.test(raw) && ['model', 'family'].includes(session.awaiting) && session.narrow) {
      const picked = narrowingReply(raw, session);
      if (picked && !(picked.events || []).includes('not-in-catalog')) return picked;
    }
    if (/^(gb|tb)$/.test(unit)) return done('Which item is this storage capacity for?', { awaiting: null, lastModel: null });
    if (session.lastModel || session.lastProducts?.length || corrected || /^(?:quantity|qty|for|(?:i\s+)?need)\b/i.test(raw)) {
      const before = slots.quantity || session.lastQty; slots.quantity = n; slots.lastSlot = 'quantity';
      return done('Got it, ' + n + (before && before !== n ? ' instead of ' + before : '') + '.' + (!session.lastModel && !session.lastProducts?.length ? ' Which item do you need?' : ' Which city should it go to?'), { fields: { quantity: n }, awaiting: null });
    }
    if (/^\d+$/.test(raw)) {
      const iphone = products.some(p => new RegExp('^iPhone ' + n + '(?: |$)', 'i').test(p.name));
      return done(iphone ? 'Do you mean the iPhone ' + n + ', or a quantity of ' + n + '?' : 'Is ' + n + ' a quantity? Which item do you need?', { chips: iphone ? ['iPhone ' + n, 'Quantity ' + n] : ['Quantity ' + n], awaiting: 'number-choice', lastModel: null });
    }
  }
  if (corrected) {
    delete slots.storage; delete slots.ram;
    if (['storage', 'ram'].includes(slots.lastSlot)) delete slots.lastSlot;
    delete slots.brand;
    const reply = narrowingReply(value, { ...session, awaiting: null, narrow: null, lastProducts: [], lastModel: null });
    if (reply) return { ...reply, lastModel: reply.lastModel || null, selectedVariant: null, text: 'Got it, ' + (reply.lastModel?.name || narrow.displayLabel(reply.narrow?.scope.family || reply.narrow?.scope.brand || reply.narrow?.scope.categoryId || reply.narrow?.scope.term, products) || 'your item') + '. ' + reply.text.replace(/^Yes, we have[^.]*\.\s*/, ''), slots };
    return done('Got it. Which item do you need?', { awaiting: null });
  }
  return null;
}

function narrowingReply(text, session) {
  const query = categoryToken(text);
  // Bare Starlink keeps the existing policy path; product-type words use the catalogue.
  if (/^starlink$/i.test(query)) return null;
  const continuing = session.narrow && isSlotFill(text, session);
  const modelSwitch = continuing && session.lastModel && session.awaiting === 'color' && /\d/.test(text);
  if (continuing && !modelSwitch && ['color', 'variant'].includes(session.awaiting) && session.lastModel && query.toLowerCase() !== session.lastModel.name.toLowerCase()) {
    const product = session.lastModel;
    const field = narrow.variantField(product);
    if (!field) return result('A team member will confirm the available colors for the ' + product.name + '.', ['product-guide'], { lastModel: product, awaiting: 'variant', narrow: session.narrow });
    const matched = colorMatch(text, field.options);
    return result(matched
      ? product.name + ' in ' + matched + '. We list it; our team confirms stock with your quote.'
      : sourceLine(),
      ['product-guide'], { selectedVariant: matched || null, lastModel: product, narrow: session.narrow, lastProducts: session.lastProducts, chips: matched ? ['Request a quote', 'Talk to someone'] : field.options.slice(0,6), awaiting: matched ? null : session.awaiting });
  }
  const parent = continuing ? { ...session.narrow.scope } : {};
  if (modelSwitch) delete parent.modelId;
  const hit = narrow.resolve(query, continuing && !modelSwitch ? { ...session.narrow, scope: parent } : parent);
  if (continuing && ['brand', 'family', 'model', 'category'].includes(session.awaiting) && (hit.level === 'none' || (hit.level === 'not-carried' && !query.toLowerCase().split(/\s+/).some(word => word.length > 2 && (session.narrow.labels || []).some(label => label.toLowerCase().includes(word)))))) {
    const labels = session.narrow.labels || [];
    const scope = session.narrow.scope || {};
    const scopedProducts = narrow.buildTree(loadCatalog().products);
    const subject = narrow.displayLabel(scope.family || scope.brand || scope.term || scope.categoryId || 'catalogue', scopedProducts);
    return result("I couldn't find that option among our " + subject + ' ' + (session.awaiting === 'category' ? 'categories' : session.awaiting === 'family' ? 'families' : session.awaiting + 's') + '. We have ' + listWords(labels.slice(0, 8)) + '. Which one are you looking for?', ['product-guide'], {
      narrow: session.narrow, lastProducts: session.lastProducts, awaiting: session.awaiting,
      lastTopic: session.lastTopic, chips: labels.slice(0, 6),
    });
  }
  if (hit.level === 'none') return null;
  const products = narrow.buildTree(loadCatalog().products).filter(p => hit.ids.includes(p.id));
  const state = { level: hit.level, scope: hit.scope, labels: hit.labels, ids: hit.ids };
  const extra = { narrow: state, lastProducts: products, lastFamily: hit.scope.family || query, lastTopic: 'product:' + (hit.scope.categoryId || query), matchCount: products.length, chips: hit.labels.slice(0,6) };
  const shown = listWords(hit.labels.slice(0,8)) + (hit.labels.length > 8 ? ', and ' + (hit.labels.length-8) + ' more' : '');
  if (hit.level === 'not-carried') {
    return result(sourceLine(), ['product-guide', 'not-in-catalog'], { ...extra, awaiting: hit.missingLevel || 'model' });
  }
  if (hit.level === 'category') return result('Yes, we have ' + hit.scope.brand + ' products in: ' + shown + '. Which type are you looking for?', ['product-guide'], { ...extra, awaiting: 'category' });
  if (hit.level === 'variant' || hit.level === 'single') {
    const product = products[0];
    const storage = query.match(/\b(\d+)\s*(gb|tb)\b/i) || query.match(/(?:pro max|pro|plus|mini)\s+(\d{3,4})\b/i);
    if (storage && /iphone/i.test(product.name)) {
      const capacity = storage[1] + (storage[2] || 'GB').toUpperCase();
      const supported = product.options?.find(option => option.key === 'storage')?.options || [];
      if (!supported.some(option => normalizeInput(option).replace(/\s/g, '') === capacity.toLowerCase())) return result(sourceLine(), ['product-guide', 'not-in-catalog'], { ...extra, lastModel: product, awaiting: null });
      return result(product.name + ', ' + capacity + '. We list it; our team confirms stock with your quote.', ['product-guide'], { ...extra, lastModel: product, slots: { ...(session.slots || {}), storage: capacity }, awaiting: null, chips: ['Request a quote', 'Talk to someone'] });
    }
    const field = narrow.variantField(product);
    if (field && hit.variantAsked) return result(hit.matchedVariant
      ? product.name + ' in ' + hit.matchedVariant + '. We list it; our team confirms stock with your quote.'
      : sourceLine(), ['product-guide'], { ...extra, selectedVariant: hit.matchedVariant || null, lastModel: product, awaiting: hit.matchedVariant ? null : (field.key === 'color' ? 'color' : 'variant') });
    if (!continuing && hit.level === 'single' && query.toLowerCase() !== product.name.toLowerCase()) return result(product.name + '. We list it; our team confirms stock with your quote.', ['category-guide','product-guide'], { ...extra, lastModel: product, awaiting: 'variant' });
    const label = field && (field.label || field.key);
    const questionLabel = label && (label === label.toUpperCase() ? label : label.toLowerCase());
    const heading = continuing ? 'Yes, we have that.' : 'Yes, we have the ' + product.name + '.';
    return result(field ? heading + (field.key === 'color' ? ' What color are you looking for?' : ' Which ' + questionLabel + ' are you looking for?') : product.name + '. We list it; our team confirms stock with your quote.', ['product-guide'], { ...extra, lastModel: product, awaiting: field ? (field.key === 'color' ? 'color' : 'variant') : 'variant' });
  }
  const isCategory = hit.level === 'brand' || (hit.scope.categoryId && !hit.scope.brand && !hit.scope.family && !hit.scope.term);
  const displayQuery = narrow.displayLabel(query, products);
  const affirmativeLabel = value => narrow.assertCatalogLabel(narrow.isCatalogLabel(value) ? value : products[0].category);
  let wording = 'Yes, we have **' + affirmativeLabel(displayQuery) + '** in our catalogue: ' + shown + '. Which ' + hit.level + ' are you looking for?';
  if (isCategory) wording = 'Yes, we have **' + affirmativeLabel(hit.scope.categoryId ? narrow.displayLabel(hit.scope.categoryId, products) : displayQuery) + '**.' + (hit.level === 'brand' ? ' Which brand?' : ' We list ' + shown + '. Which model are you looking for?');
  if (hit.level === 'family' && hit.scope.brand) {
    const type = hit.scope.term ? hit.scope.term : hit.scope.categoryId ? narrow.displayLabel(hit.scope.categoryId, products).replace(/^[A-Z][a-z]/, match => match.toLowerCase()) : 'products';
    const plural = type.endsWith('s') ? type : type + 's';
    wording = 'Yes, we have **' + narrow.assertCatalogLabel(hit.scope.brand) + '** ' + plural + ': ' + shown + '. Which one are you looking for?';
  }
  // Shared catalogue prefixes preserve familiar family wording without product rules.
  if (!isCategory && hit.level === 'family' && products.every(p => p.brand.toLowerCase() !== query.toLowerCase() && narrow.brandLabel(p.brand, products).toLowerCase() === query.toLowerCase())) wording = 'Yes, we have ' + affirmativeLabel(displayQuery) + ' in our catalogue: ' + shown + '. Which model are you looking for?';
  if (hit.level === 'model') wording = 'Yes, we have ' + narrow.displayLabel(hit.scope.family || (new Set(products.map(p => p.family)).size === 1 ? products[0].family : displayQuery), products) + ' models: ' + shown + '. Which one are you looking for?';
  return result(wording, isCategory ? ['category-guide','product-guide'] : ['product-guide'], { ...extra, awaiting: hit.level });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isPhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  return /^\+?[0-9 () .\-]+$/.test(raw) && digits.length >= 7 && digits.length <= 15;
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
  return guidedHandoff('', session, 'form');
}

function guidedForm(text, session) {
  if ((session.awaiting === 'form-offer' && FORM_START.test(text)) || /^(?:fill out a (?:quick )?form|start (?:the |a )?form)$/i.test(text)) return startForm(session);
  return null;
}

function normalizeContactPhone(value) {
  const raw = String(value || '').trim();
  if (!/^\+?[0-9 () .-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^\+232/.test(raw)) return /^232[23789]\d{7}$/.test(digits) ? raw : null;
  if (raw.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : null;
  if (raw.startsWith('00')) return /^[1-9]\d{7,14}$/.test(digits.slice(2)) ? '+' + digits.slice(2) : null;
  if (/^0[23789]\d{7}$/.test(digits)) return '+232' + digits.slice(1);
  return null;
}

// Handoff slots are deterministic and retain the context captured at entry.
function handoffTopic(session) {
  if (session.lastModel && session.lastModel.name) {
    return session.lastModel.name + (session.selectedVariant ? ' (' + session.selectedVariant + ')' : '');
  }
  const scope = session.narrow && session.narrow.scope;
  if (scope) {
    const products = narrow.buildTree(loadCatalog().products);
    if (scope.family) return narrow.displayLabel(scope.family, products);
    if (scope.categoryId) return [scope.brand, narrow.displayLabel(scope.categoryId, products)].filter(Boolean).join(' ');
  }
  const topic = session.lastTopic || '';
  const topics = { 'service-order': 'an existing order', 'service-wholesale': 'a wholesale request',
    'service-availability': 'product availability', 'service-source': 'a sourcing request',
    'faq-delivery': 'delivery', 'faq-pay': 'payment', 'faq-price': 'pricing',
    'faq-timeline': 'delivery timing', 'faq-school': 'a school or NGO request',
    'faq-trust': 'LAVAALL', 'faq-website': 'a website' };
  return topics[topic] || (topic.startsWith('product:') ? topic.slice(8) : '');
}

// French and Sierra Leone Krio reuse the reviewed handoff vocabulary.
const HANDOFF_COPY = {
  en: {
    channel: 'WhatsApp or email?', phone: 'What is your WhatsApp number, with country code?', email: 'What is your email address?',
    invalidPhone: 'Please enter a valid WhatsApp number with country code.', invalidEmail: 'Please enter a valid email address.',
    name: 'Could I get your first and last name, please?', topic: 'What would you like to talk to the team about?', quote: 'What would you like a quote for?',
    confirm: d => 'Please confirm your details: Name: ' + d.name + '. Contact: ' + d.contact + '. Topic: ' + d.topic + '. Shall I pass this to our team?',
    receipt: 'Thank you, someone from our team will reach out to you shortly.', cancel: 'Request cancelled. What else can I help with?', sla: SERVICE_SLA,
  },
  fr: {
    channel: 'WhatsApp ou e-mail ?', phone: 'Quel est votre numéro WhatsApp avec indicatif pays ?', email: 'Quelle est votre adresse e-mail ?',
    invalidPhone: 'Veuillez saisir un numéro WhatsApp valide avec indicatif pays.', invalidEmail: 'Veuillez saisir une adresse e-mail valide.',
    name: 'Quel est votre prénom et votre nom, s’il vous plaît ?', topic: 'De quoi souhaitez-vous parler avec notre équipe ?', quote: 'Pour quel article souhaitez-vous un devis ?',
    confirm: d => 'Veuillez vérifier vos coordonnées : nom : ' + d.name + ' ; contact : ' + d.contact + ' ; sujet : ' + d.topic + '. Puis-je transmettre cette demande à notre équipe ?',
    receipt: "Merci, quelqu'un de l'équipe vous recontactera sous peu.", cancel: 'Demande annulée. Comment puis-je vous aider ?',
    sla: 'Quelqu’un de notre équipe vous recontactera sous 24 heures.',
  },
  kr: {
    channel: 'Yu WhatsApp ɔ ɛmail?', phone: 'Yu WhatsApp fon nɔmba wit country code?', email: 'Yu ɛmail?',
    invalidPhone: 'Duya, valid WhatsApp fon nɔmba wit country code?', invalidEmail: 'Duya, valid ɛmail?',
    name: 'Duya, yu fɔs ném ɛn las ném?', topic: 'Wetin yu wan tɔk to di tim abawt?', quote: 'Wetin yu nid fɔ quote?',
    confirm: d => 'Rivyu di sɔmari: ném: ' + d.name + '; fon ɔ ɛmail: ' + d.contact + '; rɛkwɛst: ' + d.topic + '. Yu wan sɛn am to di tim?',
    receipt: 'Tɛnki. Sɔmbɔdi frɔm wi tim go rich yu sɔn.', cancel: 'Rɛkwɛst kansul. Wetin yu nid?',
    sla: 'Sɔmbɔdi frɔm wi tim go rich yu insay 24 awa.',
  },
};
function handoffLanguage(session, language) {
  const chosen = language || session.handoffDraft?.language || session.lastLanguage;
  return HANDOFF_COPY[chosen] ? chosen : 'en';
}
function handoffSla(language) { return (HANDOFF_COPY[language] || HANDOFF_COPY.en).sla; }
function handoffPrompt(session, language) {
  const copy = HANDOFF_COPY[handoffLanguage(session, language)];
  const draft = session.handoffDraft || {};
  return ({ 'handoff-channel': copy.channel, 'handoff-contact': draft.channel === 'email' ? copy.email : copy.phone,
    'handoff-name': copy.name, 'handoff-topic': draft.kind === 'quote' ? copy.quote : copy.topic,
    'handoff-confirm': copy.confirm(draft) })[session.awaiting] || null;
}

function guidedHandoff(text, session, start, language) {
  const lang = handoffLanguage(session, language);
  const copy = HANDOFF_COPY[lang];
  const raw = String(text || '').trim();
  const active = String(session.awaiting || '').startsWith('handoff-');
  if (!active && !start) return null;
  const reply = (line, draft, awaiting, extra) => result(line, ['handoff-intake'], {
    language: lang, awaiting, handoffDraft: draft, lastTopic: 'handoff-intake', chips: awaiting ? ['Cancel request'] : [], ...extra,
  });
  if (active && /^(cancel|cancel request|no|no thanks|stop)[.!]?$/i.test(raw)) {
    return reply(copy.cancel, null, null, { chips: ['Request a quote', 'Talk to someone'] });
  }
  if (!active) {
    const earlier = session.history || [];
    const lastUser = earlier.filter(turn => turn.role === 'user').slice(-1)[0];
    return reply((lang === 'en' ? '' : copy.sla + ' ') + copy.channel, {
      language: lang, kind: start === 'quote' ? 'quote' : 'person', name: '', contact: '', topic: handoffTopic(session).slice(0, 300),
      topicKnownFromChat: Boolean(handoffTopic(session)),
      earlier: String(session.lastUser || (lastUser && lastUser.text) || '').slice(0, 200),
    }, 'handoff-channel', { chips: ['WhatsApp', 'Email'], handoff: { tagOsman: true } });
  }
  const draft = { ...(session.handoffDraft || {}) };
  const topicQuestion = draft.kind === 'quote' ? copy.quote : copy.topic;
  const confirmation = () => reply(copy.confirm(draft), draft, 'handoff-confirm', { chips: ['Confirm', 'Cancel'] });
  if (session.awaiting === 'handoff-channel') {
    if (!/^(whatsapp|email|e-mail)$/i.test(raw)) return reply(copy.channel, draft, 'handoff-channel', { chips: ['WhatsApp', 'Email'] });
    draft.channel = /^whatsapp$/i.test(raw) ? 'whatsapp' : 'email';
    return reply(draft.channel === 'whatsapp' ? copy.phone : copy.email, draft, 'handoff-contact');
  }
  if (session.awaiting === 'handoff-contact') {
    const value = draft.channel === 'email' ? (isEmail(raw) ? raw : null) : normalizeContactPhone(raw);
    if (!value || raw.length > 300) return reply(draft.channel === 'email' ? copy.invalidEmail : copy.invalidPhone, draft, 'handoff-contact');
    draft.contact = value;
    return reply(lang === 'en' ? 'Can I get your first and last name?' : copy.name, draft, 'handoff-name');
  }
  if (session.awaiting === 'handoff-name') {
    if (start || !raw || raw.length > 100 || !/\p{L}/u.test(raw) || isEmail(raw) || isPhone(raw)) {
      return reply(copy.name, draft, 'handoff-name');
    }
    if (!/\p{L}.*\s+.*\p{L}/u.test(raw) && !draft.nameAsked) {
      draft.nameAsked = true;
      return reply(copy.name, draft, 'handoff-name');
    }
    draft.name = raw;
    if (!draft.topic) return reply(topicQuestion, draft, 'handoff-topic');
  } else if (session.awaiting === 'handoff-topic') {
    if (!raw || raw.length > 300) return reply(topicQuestion, draft, 'handoff-topic');
    draft.topic = raw;
  }
  if (session.awaiting !== 'handoff-confirm' || !/^(confirm|yes|yes,? confirm|yes please|correct|ok|okay)[.!]?$/i.test(raw)) return confirmation();
  const email = isEmail(draft.contact) ? draft.contact : '';
  const digits = draft.contact.replace(/\D/g, '');
  const phone = email ? '' : draft.contact.startsWith('+') ? '+' + digits
    : draft.contact.startsWith('00') ? '+' + digits.slice(2) : digits;
  const preferredResponse = email ? 'email' : 'phone';
  const summary = ('Website chat handoff. Topic: ' + draft.topic + '.' +
    (draft.earlier ? ' Earlier the visitor asked: "' + draft.earlier + '".' : '') +
    ' Contact preference: ' + preferredResponse + '.').slice(0, 400);
  return reply(copy.receipt, null, null, {
    handoffPayload: { topicKnownFromChat: Boolean(draft.topicKnownFromChat), kind: 'chat-handoff', test: true, route: 'customer-success', owner: 'Alison',
      flag: draft.kind === 'quote' ? 'Someone reached out wanting a quote for ' + draft.topic + '.' : 'Someone reached out wanting to talk to you about ' + draft.topic + '.',
      fields: { inquiryType: draft.kind === 'quote' ? 'quote-request' : 'customer-support', name: draft.name, phone, email, preferredResponse,
        subject: ('Chat handoff: ' + draft.topic).slice(0, 300), productOrService: draft.topic, message: summary },
      summary },
  });
}

function isNewQuestion(text) {
  const raw = String(text || '').trim();
  if (serviceIntent(raw) || CONTACT_ASK.test(raw) || HELP_ASK.test(raw)) return true;
  if (HAVE_ASK.test(raw) || (WANT_ASK.test(raw) && categoryToken(raw).length > 0)) return true;
  if (categoryDef(raw) && /^(do you|can you|how |what |where |when |i want|i need)/i.test(raw)) return true;
  return /^(how |can |could |do you |what |where |when |why )/i.test(raw) && raw.length > 20;
}

// A message that names something outside the current narrowing scope starts a new topic.
const OUT_OF_SCOPE_WORDS = /\b(starlink|routers?|wi-?fi|internet|install(?:ation|ing)?|cctv|cameras?|solar|inverters?|websites?|web ?sites?|deliver(?:y|ies)?|laptops?|computers?|printers?|servers?|tvs?|monitors?|phones?|tablets?)\b/i;
function leavesScope(raw, session) {
  const scope = session && session.narrow;
  if (!scope || !['category', 'brand', 'family', 'type', 'model'].includes(session.awaiting)) return false;
  const query = categoryToken(raw);
  if (!query) return false;
  const labels = (scope.labels || []).map(label => String(label).toLowerCase());
  const inLabels = word => labels.some(label => label.includes(word));
  const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 1);
  if (words.length && words.every(inLabels)) return false;
  const fresh = narrow.resolve(query);
  const current = scope.ids || [];
  if (fresh.level !== 'none' && Array.isArray(fresh.ids) && fresh.ids.length) {
    return !fresh.ids.some(id => current.includes(id));
  }
  const named = query.match(OUT_OF_SCOPE_WORDS);
  return Boolean(named && !inLabels(named[1].toLowerCase().replace(/s$/, '')));
}

function isSlotFill(text, session) {
  if (!session || !session.awaiting) return false;
  const raw = String(text || '').trim();
  if (String(session.awaiting).startsWith('handoff-')) return !/^(cancel|cancel request)$/i.test(raw);
  if (!raw) return false;
  if (String(session.awaiting).startsWith('form-') && session.awaiting !== 'form-offer') return true;
  if (CONTACT_ASK.test(raw) || serviceIntent(raw)) return false;
  if (isNewQuestion(raw) && session.awaiting === 'form-offer') return false;
  if (isNewQuestion(raw) && !String(session.awaiting).startsWith('form-')) {
    // A short brand/model/color answer is not a new question.
    if (['category', 'brand', 'family', 'type', 'model', 'color', 'variant'].includes(session.awaiting) && !leavesScope(raw, session) && raw.length <= 48 && !/[?]/.test(raw) && !HAVE_ASK.test(raw) && !WANT_ASK.test(raw) && !serviceIntent(raw)) {
      return true;
    }
    return false;
  }
  if (session.awaiting === 'form-offer') return FORM_START.test(raw) || /^fill out a form$/i.test(raw);
  if (String(session.awaiting).startsWith('form-')) return true;
  if (['category', 'brand', 'family', 'type', 'model', 'color', 'variant'].includes(session.awaiting)) {
    if (leavesScope(raw, session)) return false;
    if (HAVE_ASK.test(raw) || (WANT_ASK.test(raw) && categoryToken(raw) && !pickModel(raw, session.lastProducts || []) && !narrow.resolve(raw, session.narrow || {}).ids.length)) return false;
    if (session.awaiting !== 'category' && categoryDef(raw) && topicOf(raw, {}) !== (session.lastTopic || '')) return false;
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
  if (HAVE_ASK.test(raw) || WANT_ASK.test(raw) || family) {
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
  if (String(session.awaiting || '').startsWith('handoff-')) return false;
  if (hasSlotContext(text, session) || isSlotFill(text, session)) return false;
  const next = topicOf(text, {});
  const prev = session.lastTopic;
  if (!next || !prev) return Boolean(prev && next && next !== prev);
  return next !== prev;
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


// Purchase requirements remain separate from catalogue model identity.
function commercialFollowup(text, session) {
  if (!session.slots?.quantity && !session.slots?.items) return false;
  const details = purchaseDetails(text);
  const raw = normalizeInput(text).replace(/[.!?]+$/, '');
  const brand = loadCatalog().products.some(p => normalizeInput(p.brand) === raw);
  const city = /^(?:(?:to|in|for)\s+)?(?:freetown|bo|kenema|monrovia|conakry)[.!?]*$/i.test(raw);
  const category = raw.split(/\s+/).length <= 3 && narrow.resolve(raw).ids.length;
  return Boolean(brand || city || category || details.quantity || details.purpose || /^(?:new|used|refurbished|refurb|second[ -]hand)$/.test(raw));
}

function commercialReply(text, session) {
  const details = purchaseDetails(text);
  const platform = text.match(/\b(macs?|windows|linux)\b/i);
  if (platform) details.query = /^macs?$/i.test(platform[1]) ? 'MacBook' : 'computers';
  if (!details.quantity) {
    const count = text.match(/\b(\d+)\s+([a-z]+)\b/);
    if (count && !/^(?:gb|tb|pro|max|plus|mini)$/.test(count[2])) {
      const hit = narrow.resolve(count[2]);
      if (hit.ids.length && !hit.scope.modelId) { details.quantity = count[1]; details.query = text.replace(count[1], '').trim(); }
    }
  }
  const parts = text.split(/\s*(?:,\s*|\s+(?:and|plus)\s+)\s*/).filter(Boolean);
  const items = parts.map(part => {
    const detail = purchaseDetails(part);
    const count = part.match(/\b(\d+)\s+([a-z]+)\b/);
    const hit = narrow.resolve(detail.query.replace(/\b\d+\b/g, ''));
    const category = part.match(/\b(laptops?|notebooks?|computers?|phones?|tablets?|monitors?|printers?|routers?|servers?)\b/);
    const platform = part.match(/\b(macs?|windows|linux)\b/i);
    const label = platform ? (/^macs?$/i.test(platform[1]) ? 'Mac computers' : platform[1].replace(/^./, c => c.toUpperCase()) + ' computers') : category?.[1] || (count && narrow.resolve(count[2]).ids.length ? count[2] : null) || (hit.scope.categoryId && loadCatalog().products.find(p => p.categoryId === hit.scope.categoryId)?.category.toLowerCase());
    const quantity = detail.quantity || (label && count?.[1]);
    return quantity && label ? { quantity, category: label } : null;
  }).filter(Boolean);
  const chips = ['Request a quote', 'Talk to someone'];
  if (items.length === 1 && session.slots?.items && !correctionValue(text)) {
    const combined = session.slots.items.filter(item => item.category !== items[0].category);
    items.unshift(...combined);
  }
  if (items.length === 1 && session.slots?.quantity && session.slots?.category && session.slots.category !== items[0].category && !correctionValue(text)) items.unshift({ quantity: session.slots.quantity, category: session.slots.category });
  if (items.length > 1) return result('Got it, ' + listWords(items.map(item => item.quantity + ' ' + item.category)) + '. Our team confirms stock with your quote. Which city should it go to?', ['product-guide', 'bulk-request'], {
    slots: { ...(session.slots || {}), items }, fields: { quantity: items.map(item => item.quantity).join(', ') }, lastTopic: 'product:bulk', awaiting: null, chips,
  });
  const followup = commercialFollowup(text, session);
  if (!followup && (!details.quantity || (!details.condition && !details.purpose && Number(details.quantity) < 10))) return null;
  const city = text.match(/^(?:(?:to|in|for)\s+)?(freetown|bo|kenema|monrovia|conakry)[.!?]*$/i);
  const brandOnly = loadCatalog().products.some(p => normalizeInput(p.brand) === text.replace(/[.!?]+$/, ''));
  const parent = brandOnly ? { categoryId: session.narrow?.scope?.categoryId } : session.narrow;
  const hit = followup && !details.quantity && parent ? narrow.resolve(details.query, parent) : narrow.resolve(details.query);
  const products = narrow.buildTree(loadCatalog().products).filter(product => hit.ids.includes(product.id));
  if (!products.length && !followup && !platform) return null;
  const state = products.length ? hit : session.narrow;
  if (products.length && !state.scope.categoryId && new Set(products.map(p => p.categoryId)).size === 1) state.scope.categoryId = products[0].categoryId;
  const currentProducts = products.length ? products : session.lastProducts || [];
  const slots = { ...(session.slots || {}), ...(details.quantity ? { quantity: details.quantity } : {}),
    ...(details.condition ? { condition: details.condition } : {}), ...(details.purpose ? { purpose: details.purpose } : {}) };
  if (details.quantity && !state?.scope?.brand) delete slots.brand;
  if (state?.scope?.brand) slots.brand = state.scope.brand;
  if (city) slots.deliveryCity = city[1].replace(/^./, c => c.toUpperCase());
  const label = platform ? (/^macs?$/i.test(platform[1]) ? 'Mac computers' : platform[1].replace(/^./, c => c.toUpperCase()) + ' computers') : state?.scope?.categoryId ? narrow.displayLabel(state.scope.categoryId, currentProducts) : currentProducts[0]?.category || 'units';
  slots.category = items[0]?.category || slots.category || label;
  const description = [slots.quantity, slots.condition, slots.brand, label].filter(Boolean).join(' ') + (slots.purpose ? ' for ' + slots.purpose : '');
  const question = city ? 'Would you like to request a quote?' : String(slots.quantity || '').includes('–') ? 'What exact quantity should the team quote?'
    : !slots.condition ? 'Do you prefer new or refurbished units?' : !slots.brand ? 'Which brand would you prefer?' : 'Which city should it go to?';
  return result('Got it, ' + description + '. Our team confirms stock with your quote. ' + question, ['product-guide', 'bulk-request'], {
    slots, fields: { quantity: slots.quantity || '' }, narrow: state, lastProducts: currentProducts,
    lastTopic: session.lastTopic || 'product:' + (state?.scope?.categoryId || 'bulk'), awaiting: null, chips,
  });
}

function guidedReply(rawInput, session, lang, flags) {
  flags = flags || {};
  const text = normalizeInput(String(rawInput || '').trim());
  if (!text) return null;
  const slot = slotReply(text, session);
  if (slot) return slot;

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

  const form = guidedForm(String(rawInput || '').trim(), session);
  if (form) return form;

  const commercial = commercialReply(text, session);
  if (commercial) return commercial;

  const intent = serviceIntent(text);
  if (intent) return serviceReply(intent);

  const skipProduct = /\b(quote|talk to|speak to|price|cost|how much|install(?:ation|ations|ing)?|deploy(?:ment)?|delivery|deliver|refund|invoice)\b/i.test(text);
  if (!/\b(what models|listed in|how many)\b/i.test(text) && !skipProduct && !flags.priceAsk && (isSlotFill(text, session) || HAVE_ASK.test(text) || WANT_ASK.test(text) || /^(?:(?:can|could|do)\s+)?(?:you|una)\s+(?:have|get|sell|stock)\b/i.test(text) || /^(?:can you |could you )?(?:show|list)\b/i.test(text) || (text.split(/\s+/).length <= 6 && !/^(tell|explain|what|how|why|can|could|where|when)\b/i.test(text)))) {
    const guided = narrowingReply(text, session);
    if (guided) {
      const quantity = text.match(/\b(?:need|want|like|for)\s+(\d+)\b/i);
      if (quantity) { guided.slots = { ...(session.slots || {}), quantity: quantity[1], lastSlot: 'quantity' }; guided.fields.quantity = quantity[1]; }
      return guided;
    }
    if ((HAVE_ASK.test(text) || WANT_ASK.test(text)) && !/starlink/i.test(text)) return sourceReply(productQuery(text));
  }

  // Alison FAQ patterns (Starlink is intentionally not handled here).
  if (flags.priceAsk) {
    const named = familySearch(text);
    const item = named[0] ? ' For the ' + named[0].name + ', our team will confirm stock with your quote.' : ' Our team will confirm stock with your quote.';
    return result(
      'Prices are quoted per order, based on the model, quantity, and delivery country.' + item + ' What item do you need, and how many?',
      ['faq-price', 'refused-price'],
      { chips: ['Request a quote', 'Talk to someone'], lastProducts: named, matchCount: 0 }
    );
  }

  if (PAY_ASK.test(text) || LEGAL_ASK.test(text)) {
    const handoff = /\b(invoice|refund|damage|legal|lawyer)\b/i.test(text);
    const line = handoff
      ? 'WhatsApp or email?'
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
      { chips: ['Request a quote', 'Talk to someone'], slots: (() => {
        const country = text.match(/\b(sierra leone|guinea[- ]bissau|liberia|guinea)\b/i);
        return country ? { ...(session.slots || {}), deliveryCountry: country[1].replace(/\b\w/g, c => c.toUpperCase()), lastSlot: 'deliveryCountry' } : session.slots;
      })() }
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
    if (!useful.length || !narrow.resolve(categoryToken(text)).ids.length) return sourceReply();
  }

  return null;
}

module.exports = {
  slotReply, hasSlotContext, guidedReply, guidedHandoff, isSlotFill, productColors, pickModel, CONTACT_ASK, HAVE_ASK, HELP_ASK,
  shouldResetContext, topicOf, serviceIntent, categoryDef, SERVICE_SLA, FORM_START, normalizeContactPhone, handoffPrompt, handoffSla,
};
