'use strict';

const { searchCatalog, loadCatalog } = require('./catalog');
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
    .replace(/^(an?|the|some)\s+/i, '')
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
      ? 'Yes, we have the ' + product.name + ' in ' + matched + '. Our team will confirm stock with your quote.'
      : "We don't have the " + product.name + ' in ' + text.trim() + ', but we have it in ' + listWords(field.options) + '.',
      ['product-guide'], { lastModel: product, narrow: session.narrow, lastProducts: session.lastProducts, chips: matched ? ['Request a quote', 'Talk to someone'] : field.options.slice(0,6), awaiting: matched ? null : session.awaiting });
  }
  const parent = continuing ? { ...session.narrow.scope } : {};
  if (modelSwitch) delete parent.modelId;
  const hit = narrow.resolve(query, continuing && !modelSwitch ? { ...session.narrow, scope: parent } : parent);
  if (continuing && ['brand', 'family', 'model', 'category'].includes(session.awaiting) && (hit.level === 'none' || (hit.level === 'not-carried' && !query.toLowerCase().split(/\s+/).some(word => word.length > 2 && (session.narrow.labels || []).some(label => label.toLowerCase().includes(word)))))) {
    const labels = session.narrow.labels || [];
    const scope = session.narrow.scope || {};
    const scopedProducts = narrow.buildTree(loadCatalog().products);
    const subject = narrow.displayLabel(scope.family || scope.brand || scope.term || scope.categoryId || 'catalogue', scopedProducts);
    return result("I don't see " + query + ' among our ' + subject + ' ' + (session.awaiting === 'category' ? 'categories' : session.awaiting === 'family' ? 'families' : session.awaiting + 's') + '. We have ' + listWords(labels.slice(0, 8)) + '. Which one are you looking for?', ['product-guide'], {
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
    const brandMissing = hit.missingLevel === 'brand';
    const subject = narrow.displayLabel(hit.scope.family || hit.scope.brand || hit.scope.term || hit.scope.categoryId || 'our catalogue', products);
    const opening = brandMissing ? "We don't carry " + query + '.' : "I don't see the " + query + ' in our catalogue.';
    const options = brandMissing
      ? ' ' + String(hit.scope.categoryId || 'Product').replace(/^./, c => c.toUpperCase()).replace(/s$/, '') + ' brands we have: ' + shown + '. Which brand would you like?'
      : hit.missingLevel === 'category'
        ? ' From ' + hit.scope.brand + ' we have ' + shown + '. Which type are you looking for?'
        : ' The closest ' + subject + ' options we have are ' + shown + '. Which one would you like?';
    return result(opening + options, ['product-guide', 'not-in-catalog'], { ...extra, awaiting: hit.missingLevel || 'model' });
  }
  if (hit.level === 'category') return result('Yes, we have ' + hit.scope.brand + ' products in: ' + shown + '. Which type are you looking for?', ['product-guide'], { ...extra, awaiting: 'category' });
  if (hit.level === 'variant' || hit.level === 'single') {
    const product = products[0];
    const field = narrow.variantField(product);
    if (field && hit.variantAsked) return result(hit.matchedVariant
      ? 'Yes, we have the ' + product.name + ' in ' + hit.matchedVariant + '. Our team will confirm stock with your quote.'
      : "We don't have the " + product.name + ' in ' + hit.variantAsked + ', but we have it in ' + listWords(field.options) + '.', ['product-guide'], { ...extra, lastModel: product, awaiting: hit.matchedVariant ? null : (field.key === 'color' ? 'color' : 'variant') });
    if (!continuing && hit.level === 'single' && query.toLowerCase() !== product.name.toLowerCase()) return result('Yes, we have **' + narrow.displayLabel(query, products) + (query.endsWith('s') ? '' : 's') + '**. We list ' + product.name + '. Our team will confirm the details with your quote.', ['category-guide','product-guide'], { ...extra, lastModel: product, awaiting: 'variant' });
    const label = field && (field.label || field.key);
    const questionLabel = label && (label === label.toUpperCase() ? label : label.toLowerCase());
    const heading = continuing ? 'Yes, we have that.' : 'Yes, we have the ' + product.name + '.';
    return result(field ? heading + (field.key === 'color' ? ' What color are you looking for?' : ' Which ' + questionLabel + ' are you looking for?') : 'Yes, we have the ' + product.name + '. Our team will confirm the details with your quote.', ['product-guide'], { ...extra, lastModel: product, awaiting: field ? (field.key === 'color' ? 'color' : 'variant') : 'variant' });
  }
  const isCategory = hit.level === 'brand' || (hit.scope.categoryId && !hit.scope.brand && !hit.scope.family && !hit.scope.term);
  const displayQuery = narrow.displayLabel(query, products);
  let wording = 'Yes, we have **' + displayQuery + '** in our catalogue: ' + shown + '. Which ' + hit.level + ' are you looking for?';
  if (isCategory) wording = 'Yes, we have **' + ((hit.level === 'brand' && hit.scope.term) ? narrow.displayLabel(hit.scope.term, products) + (hit.scope.term.endsWith('s') ? '' : 's') : (hit.scope.categoryId ? narrow.displayLabel(hit.scope.categoryId, products) : displayQuery + (query.endsWith('s') ? '' : 's'))) + '**.' + (hit.level === 'brand' ? ' Which brand?' : ' We list ' + shown + '. Which model are you looking for?');
  if (hit.level === 'family' && hit.scope.brand) {
    const type = hit.scope.term ? narrow.displayLabel(hit.scope.term, products) : hit.scope.categoryId ? narrow.displayLabel(hit.scope.categoryId, products).replace(/^[A-Z][a-z]/, match => match.toLowerCase()) : 'products';
    const plural = type.endsWith('s') ? type : type + 's';
    wording = 'Yes, we have **' + hit.scope.brand + '** ' + plural + ': ' + shown + '. Which one are you looking for?';
  }
  // Shared catalogue prefixes preserve familiar family wording without product rules.
  if (!isCategory && hit.level === 'family' && products.every(p => p.brand.toLowerCase() !== query.toLowerCase() && narrow.brandLabel(p.brand, products).toLowerCase() === query.toLowerCase())) wording = 'Yes, we have ' + displayQuery + (query.endsWith('s') ? '' : 's') + ' in our catalogue: ' + shown + '. Which model are you looking for?';
  if (hit.level === 'model') wording = 'Yes, we have the ' + (hit.scope.family || (new Set(products.map(p => p.family)).size === 1 ? products[0].family : displayQuery)) + ' in our catalogue. Our team will confirm stock with your quote. ' + shown + '. Which model are you looking for?';
  return result(wording, isCategory ? ['category-guide','product-guide'] : ['product-guide'], { ...extra, awaiting: hit.level });
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
    if (['category', 'brand', 'family', 'type', 'model', 'color', 'variant'].includes(session.awaiting) && raw.length <= 48 && !/[?]/.test(raw) && !HAVE_ASK.test(raw) && !WANT_ASK.test(raw) && !serviceIntent(raw)) {
      return true;
    }
    return false;
  }
  if (session.awaiting === 'form-offer') return FORM_START.test(raw) || /^fill out a form$/i.test(raw);
  if (String(session.awaiting).startsWith('form-')) return true;
  if (['category', 'brand', 'family', 'type', 'model', 'color', 'variant'].includes(session.awaiting)) {
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
  if (isSlotFill(text, session)) return false;
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

  const skipProduct = /\b(quote|talk to|speak to|price|cost|how much|install|delivery|deliver|refund|invoice)\b/i.test(text);
  if (!/\b(what models|listed in|how many)\b/i.test(text) && !skipProduct && !flags.priceAsk && (isSlotFill(text, session) || HAVE_ASK.test(text) || WANT_ASK.test(text) || (text.split(/\s+/).length <= 6 && !/^(tell|explain|what|how|why|can|could|where|when)\b/i.test(text)))) {
    const guided = narrowingReply(text, session);
    if (guided) return guided;
    if ((HAVE_ASK.test(text) || WANT_ASK.test(text)) && !/starlink/i.test(text)) return sourceReply(productQuery(text));
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
