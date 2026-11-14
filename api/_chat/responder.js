'use strict';

const { loadCatalog, searchCatalog, normalize } = require('./catalog');
const { guidedReply, guidedHandoff, CONTACT_ASK, shouldResetContext, topicOf } = require('./conversation');

const REACHABILITY = "We're reachable 24/7 on WhatsApp and email";
const EMAIL = 'support@lavaall.com';
const WHATSAPP = '+1 (737) 704-4182';
const FIRST = {
  en: "I'm LAVAALL Assistant, an AI assistant. I can help with Technology questions or prepare an inquiry for your review.",
  fr: "Je suis LAVAALL Assistant, un assistant IA. Je peux répondre aux questions sur la technologie ou préparer une demande à vérifier.",
  pt: 'Sou LAVAALL Assistant, um assistente de IA. Posso ajudar com perguntas sobre tecnologia ou preparar um pedido para a sua revisão.',
};

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, cent: 100,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20,
  trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, cem: 100,
};

const INJECTION = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts|rules)/i,
  /system prompt/i,
  /jailbreak/i,
  /developer mode/i,
  /reveal (your )?(hidden |secret )?(instructions|prompt|policy|notes)/i,
  /(api keys?|passwords?|tokens?|private notes|internal tools)/i,
  /you are now a/i,
  /override (your )?policy/i,
  /pretend you (have|can) (no|zero) restrictions/i,
  /print your (system|hidden|private)/i,
];

const SENSITIVE = [
  { type: 'payment-card', re: /\b(?:\d[ -]*?){13,19}\b/ },
  { type: 'passport', re: /\bpassports?\b|\bpassport number\b|\bnational ids?\b|\bnational identification\b|\bssn\b/i },
  { type: 'password', re: /\b(password|pin code|cvv|cvc|otp)\b/i },
];

const PRICE_ASK = /\b(price|prices|pricing|cost|costs|how much|Combien|c'est combien| coute|co[uû]te|pre[cç]o|preco|quanto custa|cheapest|discount|offre|descuento|prayz|special offer|prix)\b/i;
const AGENT_ASK = /\b((?:speak|talk) to (?:someone|somebody|(?:a |an )?(?:person|human|agent|representative)|customer service|your team|the team)|person on (?:the|your) team|human|(?:i (?:need|want) (?:an? )?|^)(?:agent)\b|someone from (?:the|your) team|real person|call me(?: back)?|can someone call me(?: back)?|falar com uma pessoa|falar com algu[eé]m|parler (?:[àa] )?un(e)? (agent|personne|humain)|t[oɔ]k to wan p[oɔ]sin)\b/i;
const HOURS_ASK = /\b(hours|opening hours|when are you open|are you open|horaires|heure[s]? d'ouverture|horario|horário|24\/7|reachable)\b/i;
const BULK_ASK = /\b(bulk|wholesale|gros|en gros|volume|school|ecole|école|escola|office|bureau|empresa|company|deployment|50 |100 |twenty |cinquante |cento )\b/i;
const OFFTOPIC_HINTS = /\b(weather|poem|po[eè]me|poema|election|politics|recipe|football|soccer|joke|horoscope|movie)\b/i;
const TECH_HINTS = /\b(iphone|ipad|macbook|laptop|computer|server|router|switch|cisco|dell|hp|lenovo|samsung|galaxy|phone|tablet|tv|monitor|printer|fiber|fibre|cabling|quote|install|lavaall|order|invoice|delivery|starlink|nintendo|catalyst)\b/i;

const BOT_ASK = /(are you a bot|are you an? ai|are you (an? )?(real )?(person|human)|you a bot|is this a bot|es[- ]tu un (bot|robot)|[eêéEÊÉ]tes[- ]vous un (bot|robot|ia)|voc[eê] [eé] um (bot|rob[oô]|assistente)|[eé] um rob[oô]|yu na bot)\b/i;
function foldedText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const ANGRY = /\b(ridiculous|this is unacceptable|nobody has (replied|answered)|i'?ve been waiting|i have been waiting|worst service|this is a joke|furious|frustrated|c'est ridicule|personne ne r[eé]pond|ainda ningu[eé]m|isto [eé] inaceit[aá]vel)\b/i;

function productParts(text) {
  const parts = String(text)
    .split(/\s+(?:and also|as well as|, and|and|et aussi|et|e também|e)\s+/i)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [String(text)];
  const productish = part => /\b(iphone|ipads?|macbook|laptop|dell|hp|cisco|switch|router|monitor|printer|galaxy|starlink|cable|elitebook|latitude|thinkpad|server|ordinateur|computador)\b/i.test(part);
  const kept = parts.filter(productish);
  return kept.length >= 2 ? kept : [String(text)];
}

function isFollowUp(text) {
  const raw = String(text || '').trim();
  const namesProduct = /\b(iphone|ipad|macbook|dell|hp|cisco|starlink|laptop|latitude|elitebook|switch|router)\b/i;
  if (namesProduct.test(raw) && !/^(and the |et le |and )?(pro|plus|max|air)\b/i.test(raw)) return false;
  if (/^(and the |et le |et la |e o |e a |also the |what about (the )?)/i.test(raw) && raw.length <= 48) return true;
  if (/^(and |et |e |also )?(the |le |la |o |a )?(pro max|pro-max|pro|plus|max|air|mini)\??$/i.test(raw)) return true;
  if (raw.length <= 56 && /\b(the |le |la )?(pro max|pro|plus|max|air|mini)\b/i.test(raw)) return true;
  return false;
}

function resolveQuery(text, session = {}) {
  const raw = String(text || '').trim();
  if (!isFollowUp(raw)) return raw;
  const lastMatches = session.lastProducts || session.lastMatches || [];
  const first = Array.isArray(lastMatches) && lastMatches[0] && typeof lastMatches[0] === 'object' && lastMatches[0].name
    ? lastMatches[0]
    : null;
  const modifier = raw.match(/\b(pro max|pro-max|pro|plus|max|air|mini)\b/i);
  if (modifier && first) {
    const family = first.family || first.name || '';
    const base = String(family).replace(/\b(pro max|pro-max|pro|plus|max|air|mini)\b/ig, '').trim();
    return [first.brand, base, modifier[1]].filter(Boolean).join(' ');
  }
  if (session.lastUser) return (session.lastUser + ' ' + raw).replace(/\s+/g, ' ').trim();
  return raw;
}

function extractIdentity(text) {
  const nameHit = String(text).match(/\b(?:[Mm]y name is|[Ii] am|[Ii]'m|[Jj]e m'appelle|[Mm]on nom est|[Mm]eu nome [eé]|[Oo] meu nome [eé])\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/);
  const phoneHit = String(text).match(/\b(?:use|using)\s+(\+?\d[\d\s().-]{7,16}\d)\s+as my phone\b/i)
    || String(text).match(/\b(?:reach me at|you can reach me at|call me (?:at|on))\s+(\+?\d[\d\s().-]{7,16}\d)\b/i)
    || String(text).match(/\b(?:(?:my|the)\s+)?(?:phone(?:\s+number)?|fon|t[ée]l[eé]phone|telefone)(?:\s+is|\s*:)?\s*(\+?\d[\d\s().-]{7,16}\d)\b/i)
    || String(text).match(/\b(\+\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/)
    || String(text).match(/\b(\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/);
  const rawName = nameHit ? nameHit[1].trim() : '';
  const name = rawName.replace(/\s+\b(and|et|e|my|phone|telefone|is)\b.*$/i, '').trim();
  return {
    name,
    phone: phoneHit ? phoneHit[1].replace(/\s+/g, ' ').trim() : '',
  };
}

function detectLanguage(text) {
  const lower = String(text || '').toLowerCase();
  const folded = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const krio = /\b(una|bin wan|a de |i wan |una get|di katalog|nɔ|nor ebul|mek una|please una|titi|padi|wetin|usai|boh)\b/i;
  if (krio.test(lower) || /ɛ|ɔ/.test(text)) return 'kr';
  const frHits = (folded.match(/\b(je|j'|cherche|besoin|vous|avez|est-ce|combien|pouvez|s'il|svp|ordinateur|telephone|etes|es-tu)\b/g) || []).length;
  const ptHits = (folded.match(/\b(preciso|procuro|quero|voce|voces|tem|quanto|custa|computador|obrigado|por favor)\b/g) || []).length;
  if (ptHits > frHits && ptHits > 0) return 'pt';
  if (frHits > 0) return 'fr';
  return 'en';
}

function extractQuantity(text) {
  // Strip model-like numbers ("iPhone 15", "Latitude 5440", "Model 3") and phone numbers before qty.
  const stripped = String(text)
    .replace(/\+\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, ' ')
    .replace(/\+\d{1,3}\b/g, ' ')
    .replace(/\b24\s*\/\s*7\b/g, ' ')
    .replace(
      /\b(iphone|ipad|galaxy|pixel|latitude|thinkpad|elitebook|probook|macbook|model|series|gen|tab|watch)\s*[-#]?\s*\d{1,4}[a-z]?\b/ig,
      '$1'
    );
  const tagged = stripped.match(/\b(?:qty|quantity|qt[eé]|quantidade)\s*[:=]?\s*(\d{1,4})\b/i);
  if (tagged) return Number(tagged[1]);
  const counted = stripped.match(/\b(\d{1,4})\s+(iphones?|ipads?|macbooks?|phones?|laptops?|computers?|desktops?|notebooks?|servers?|routers?|switches?|units?|pcs|pieces|tvs?|monitors?|printers?|tablets?|ordinateurs?|portables?|telefones?|computadores?|elitebooks?|latitudes?|catalyst)\b/i);
  if (counted) return Number(counted[1]);
  const leading = stripped.match(/\b(\d{1,4})\b/);
  if (leading) {
    const value = Number(leading[1]);
    if (value >= 1 && value <= 999 && String(value).length <= 3) {
      // Only treat a bare number as qty when a number-word or unit-like context exists, or it's clearly a count.
      if (/\b(need|looking|cherche|procuro|preciso|want|wan|buy|qty|quantity|bulk|wholesale|order|for|de look|encomendar|commande|pedido|commander|quote)\b/i.test(stripped)) return value;
      if (/^\s*\d{1,4}\s+[A-Za-z]/.test(stripped)) return value;
      if (/\b(iphone|ipad|macbook|laptop|elitebook|latitude|dell|hp|cisco|computer|ordinateur|computador|starlink)\b/i.test(stripped)) return value;
    }
  }
  const words = normalize(stripped).split(' ');
  for (const word of words) {
    if (NUMBER_WORDS[word] && NUMBER_WORDS[word] !== 1) return NUMBER_WORDS[word];
  }
  // "a laptop" should not become qty 1 unless explicitly "1 laptop"
  return null;
}

function detectSensitive(text) {
  for (const item of SENSITIVE) {
    if (item.re.test(text)) return item.type;
  }
  return null;
}

function isInjection(text) {
  return INJECTION.some(pattern => pattern.test(text));
}

function contacts() {
  return `${REACHABILITY}: ${EMAIL} or WhatsApp ${WHATSAPP}.`;
}

function offer(lang, wantsAgent) {
  const shortly = wantsAgent
    ? {
      en: 'Thanks, someone from our team will reach out to you shortly.',
      fr: "Merci, quelqu'un de l'équipe vous recontactera sous peu.",
      pt: 'Obrigado, alguém da equipa entrará em contacto consigo em breve.',
      kr: 'Tɛnki. Sɔmbɔdi frɔm wi tim go rich yu sɔn.',
    }[lang]
    : '';
  const body = {
    en: 'Would you like to speak to a person, or send an email request? Your name and a valid phone number are enough; other fields are optional. Nothing is sent until you review the summary and click Send.',
    fr: "Souhaitez-vous parler à une personne, ou envoyer une demande par e-mail ? Le nom et un numéro de téléphone valide suffisent ; les autres champs sont facultatifs. Rien n'est envoyé avant que vous ne vérifiiez le récapitulatif et cliquiez sur Envoyer.",
    pt: 'Quer falar com uma pessoa, ou enviar um pedido por e-mail? O nome e um telefone válido chegam; os restantes campos são opcionais. Nada é enviado até rever o resumo e clicar em Enviar.',
    kr: 'Yu wan tɔk to wan pɔsin, ɔ sɛn ɛmail rɛkwɛst? A kin ɛp yu fill di fɔm. Ném ɛn wan valid fon nɔmba nɔmɔ; ɔl ɔda fil dɛn ɔpshɔnal. Wi nɔ sɛn am te yu rivyu di sɔmari ɛn klik Send.',
  }[lang];
  return [shortly, body, contacts()].filter(Boolean).join(' ');
}

function displayName(product) {
  const name = product.name || '';
  const brand = product.brand || '';
  if (!brand) return name;
  if (name.toLowerCase().startsWith(brand.toLowerCase() + ' ')) return name;
  if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return brand + ' ' + name;
}

function listModels(products, limit = 8) {
  const unique = [];
  const seen = new Set();
  for (const product of products) {
    const key = displayName(product).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(product);
    if (unique.length >= limit) break;
  }
  return unique;
}

function familyKey(product) {
  return String(product.family || product.name || '')
    .replace(/\b(pro max|pro-max|pro|plus|max|air|mini|oled)\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim() || (product.family || product.name || '');
}

function shortCatalogNames(products, limit = 5) {
  const source = listModels(products, 16).filter(product =>
    !/cases|protector|accessor/i.test(String(product.categoryId || '') + ' ' + String(product.category || '') + ' ' + String(product.name || ''))
  );
  const list = source.length ? source : listModels(products, 16);
  const byKey = [];
  const seen = new Set();
  const rest = [];
  for (const product of list) {
    const key = familyKey(product).toLowerCase() || (product.brand || '').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      byKey.push(product);
    } else {
      rest.push(product);
    }
  }
  // Keep brand diversity, and always include an Apple model when one was found.
  const byBrand = [];
  const seenBrand = new Set();
  for (const product of byKey.concat(rest)) {
    const brand = (product.brand || '').toLowerCase();
    if (!seenBrand.has(brand)) {
      seenBrand.add(brand);
      byBrand.push(product);
    }
  }
  const appleLaptop = list.find(product => /macbook/i.test(product.name || '') || /macbook/i.test(product.family || ''));
  const apple = appleLaptop || list.find(product => /apple/i.test(product.brand || '') || /macbook|iphone|ipad/i.test(product.name || ''));
  if (apple) {
    const appleIdx = byBrand.findIndex(product => /apple/i.test(product.brand || ''));
    if (appleIdx === -1) {
      if (byBrand.length >= limit) byBrand[limit - 1] = apple;
      else byBrand.push(apple);
    } else if (appleLaptop && byBrand[appleIdx].id !== appleLaptop.id) {
      byBrand[appleIdx] = appleLaptop;
    }
  }
  const namedLaptop = list.find(product => /\blaptop\b/i.test((product.name || '') + ' ' + (product.family || '')));
  if (namedLaptop) {
    const windowHasLaptop = byBrand.slice(0, limit).some(product => /\blaptop\b/i.test((product.name || '') + ' ' + (product.family || '')));
    if (!windowHasLaptop) {
      const idx = byBrand.slice(0, limit).findIndex(product => !/apple|macbook|elitebook|latitude/i.test((product.brand || '') + ' ' + (product.name || '')));
      const at = idx === -1 ? Math.min(limit, byBrand.length) - 1 : idx;
      if (at < 0) byBrand.unshift(namedLaptop);
      else byBrand[at] = namedLaptop;
    }
  }
  // Prefer family keys when they already give diversity (iPhone 16 then iPhone 15);
  // prefer brand diversity for mixed laptop lists.
  const uniqueBrands = new Set(list.map(product => (product.brand || '').toLowerCase()).filter(Boolean));
  const seed = uniqueBrands.size >= 3 ? byBrand : byKey;
  const picked = seed.slice();
  for (const product of rest.concat(byKey)) {
    if (picked.length >= limit) break;
    if (!picked.some(item => item.id === product.id)) picked.push(product);
  }
  return picked.slice(0, limit);
}

function formatList(products, lang, total) {
  const items = shortCatalogNames(products, 5).map(product => displayName(product));
  return items.join('; ') + '.';
}

function quantityClause(qty, lang) {
  if (!qty && qty !== 0) return '';
  const label = Array.isArray(qty) ? qty.join(' and ') : String(qty);
  if (lang === 'fr') return `Pour une quantité de ${label}, `;
  if (lang === 'pt') return `Para uma quantidade de ${label}, `;
  if (lang === 'kr') return `Fɔ ${label}, `;
  return `For a quantity of ${label}, `;
}

function noConfirm(lang) {
  return {
    en: 'A catalogue listing is not a stock or price confirmation.',
    fr: "Une fiche catalogue n'est pas une confirmation de stock ou de prix.",
    pt: 'Uma ficha no catálogo não confirma stock nem preço.',
    kr: 'Katalog list nɔ min wi gɛt am na stock ɔ di prayz. Di tim go kɔnfam di mɔdɛl, kɔndishɔn, ɛn if dɛn kin sɔs am.',
  }[lang];
}

function draftFields(text, qty, products, inquiryType, identity) {
  const first = products[0];
  const names = shortCatalogNames(products, 5).map(item => displayName(item)).join(', ');
  const quantities = Array.isArray(qty) ? qty : (qty ? [qty] : []);
  const bulkQty = quantities.some(value => Number(value) >= 10);
  return {
    inquiryType: inquiryType || (bulkQty ? 'sales-quotation' : 'product-availability'),
    productOrService: first ? first.category : '',
    model: names,
    quantity: quantities.length ? quantities.join(', ') : '',
    quantities,
    fullName: identity && identity.name || '',
    phone: identity && identity.phone || '',
    message: String(text).trim().slice(0, 2000),
  };
}

function replyForProducts(lang, text, qty, result, priceAsk, bulk) {
  const products = result.all.length ? result.all : result.matches;
  const total = products.length;
  const shown = formatList(products, lang, total);
  const qtyText = quantityClause(qty, lang);
  const intro = {
    en: `${qtyText}here is what is listed in the LAVAALL Technology catalogue: ${shown}`,
    fr: `${qtyText}voici ce qui figure dans le catalogue Technology de LAVAALL : ${shown}`,
    pt: `${qtyText}isto é o que consta do catálogo Technology da LAVAALL: ${shown}`,
    kr: `${qtyText}dis na wetin de na di LAVAALL Technology katalog: ${shown}`,
  }[lang];
  const price = priceAsk
    ? {
      en: 'I cannot give prices, estimates, or discounts in this chat.',
      fr: 'Je ne peux pas indiquer de prix, d’estimation ou de remise dans cette conversation.',
      pt: 'Não posso indicar preços, estimativas ou descontos neste chat.',
      kr: 'A nɔ ebul gi prayz, ɛstimet, ɔ diskaunt na dis chat.',
    }[lang]
    : '';
  const refurbished = /\b(refurbished|reconditionn|recondicionad)\b/i.test(text)
    ? {
      en: 'The homepage describes refurbished computers and laptops. The team confirms individual models and condition; I will not claim a warranty on a specific device here.',
      fr: 'La page d’accueil décrit des ordinateurs et portables reconditionnés. L’équipe confirme les modèles et l’état ; je ne revendique aucune garantie sur un appareil précis ici.',
      pt: 'A página inicial descreve computadores e portáteis recondicionados. A equipa confirma modelos e estado; não afirmo garantia para um aparelho específico aqui.',
      kr: 'Di hompej diskrayb rifɔbish kɔmpyuta ɛn laptop. Di tim go kɔnfam mɔdɛl ɛn kɔndishɔn; a nɔ go kleim waranti pan wan spɛsifik divays ya.',
    }[lang]
    : '';
  const bulkLine = bulk
    ? {
      en: 'Retail and wholesale inquiries are welcome, including bulk orders. The team confirms volume requests; I cannot promise stock.',
      fr: 'Les demandes au détail et en gros sont les bienvenues, y compris les commandes en volume. L’équipe confirme ; je ne peux pas garantir le stock.',
      pt: 'Pedidos a retalho e por grosso são bem-vindos, incluindo volumes. A equipa confirma; não posso garantir stock.',
      kr: 'Ritel ɛn holsel rɛkwɛst dɛn wɛlkɔm, inkludin bulk. Di tim go kɔnfam; a nɔ ebul prɔmis stock.',
    }[lang]
    : '';
  return [intro, noConfirm(lang), refurbished, price, bulkLine, offer(lang, false)]
    .filter(Boolean).join(' ');
}

function replyNotListed(lang, text, qty) {
  const qtyText = quantityClause(qty, lang);
  return {
    en: `${qtyText}I do not see that exact item in the public Technology catalogue, so I will not invent a listing, stock, or a price. LAVAALL also procures IT equipment that may not appear on the site, but only the team can say whether they can source it. ${offer(lang, false)}`,
    fr: `${qtyText}Je ne vois pas cet article exact dans le catalogue public Technology, je n'inventerai donc ni fiche, ni stock, ni prix. LAVAALL peut aussi procurer du matériel informatique absent du site, mais seule l'équipe peut le confirmer. ${offer(lang, false)}`,
    pt: `${qtyText}Não vejo esse artigo exato no catálogo público Technology, por isso não invento ficha, stock ou preço. A LAVAALL também pode obter equipamento informático que não apareça no site, mas só a equipa o pode confirmar. ${offer(lang, false)}`,
    kr: `${qtyText}A nɔ si dat ɛgzakt item na di pɔblik Technology katalog, so a nɔ go mek-op list, stock, ɔ prayz. LAVAALL kin sɔs IT ɛkwipmɛnt we nɔ de na di sayt, bɔt nɔmɔ di tim kin se if dɛn kin gɛt am. ${offer(lang, false)}`,
  }[lang];
}

function searchMaybeMulti(text, options) {
  const parts = productParts(text);
  if (parts.length < 2) return searchCatalog(text, options);
  const merged = [];
  const primary = [];
  const partResults = [];
  for (const part of parts) {
    const result = searchCatalog(part, options);
    partResults.push({ part, qty: extractQuantity(part), result });
    const direct = result.primary && result.primary.length ? result.primary : result.matches;
    for (const item of direct) {
      if (!primary.some(existing => existing.id === item.id)) primary.push(item);
    }
    const items = result.all && result.all.length ? result.all : result.matches;
    for (const item of items) {
      if (!merged.some(existing => existing.id === item.id)) merged.push(item);
    }
  }
  return {
    matches: merged.slice(0, options.limit || 8),
    all: merged,
    primary,
    tokens: [],
    total: merged.length,
    parts: partResults,
  };
}

function attachTopic(reply, rawInput, session, reset) {
  if (!reply || typeof reply !== 'object') return reply;
  if (reset) reply.reset = true;
  if (!reply.lastTopic) reply.lastTopic = topicOf(rawInput, session || {});
  return reply;
}

function respond(text, session = {}) {
  const rawInput = String(text || '').trim();
  // Do not copy a previously blocked message into a handoff summary.
  const handoffSession = session.lastUser && (detectSensitive(session.lastUser) || isInjection(session.lastUser))
    ? { ...session, lastUser: '', history: [] } : session;
  const reset = shouldResetContext(rawInput, session);
  const context = reset ? {} : session;
  const input = resolveQuery(rawInput, context);
  const detectedLanguage = detectLanguage(rawInput);
  const lang = detectedLanguage === 'en' && (isFollowUp(rawInput) || String(session.awaiting || '').startsWith('handoff-')) && context.lastLanguage
    ? context.lastLanguage : detectedLanguage;
  const partQtys = productParts(input).length >= 2
    ? productParts(input).map(part => extractQuantity(part)).filter(value => value != null)
    : [];
  let qty = partQtys.length > 1 ? partQtys : extractQuantity(input);
  if ((qty == null || (Array.isArray(qty) && !qty.length)) && isFollowUp(rawInput) && context.lastQty) qty = context.lastQty;
  const identity = extractIdentity(rawInput);
  const sensitive = detectSensitive(rawInput);
  const priceAsk = PRICE_ASK.test(input) || PRICE_ASK.test(rawInput);
  const wantsAgent = AGENT_ASK.test(rawInput);
  const hours = HOURS_ASK.test(rawInput);
  const angry = ANGRY.test(rawInput);
  const botAsk = BOT_ASK.test(rawInput) || BOT_ASK.test(foldedText(rawInput)) || /\b(voce e um (bot|robo|assistente)|etes-vous un (bot|robot)|are you a (bot|robot))\b/i.test(foldedText(rawInput));
  const qtyList = Array.isArray(qty) ? qty : (qty != null ? [qty] : []);
  const bulk = BULK_ASK.test(input) || BULK_ASK.test(rawInput) || qtyList.some(value => Number(value) >= 10);
  const events = [];

  if (!rawInput) {
    return attachTopic({ text: FIRST[lang] || FIRST.en, language: lang, events, fields: {} }, rawInput, context, reset);
  }

  const blockedHandoff = (warning, event) => {
    const questions = {
      'handoff-name': 'Please share your first and last name.',
      'handoff-contact': "What's the best phone/WhatsApp number or email to reach you?",
      'handoff-topic': 'What would you like to talk to the team about?',
    };
    const question = questions[session.awaiting];
    return question ? { text: warning + ' ' + question, language: lang,
      events: ['handoff-intake', event], fields: {}, awaiting: session.awaiting,
      handoffDraft: session.handoffDraft, lastTopic: 'handoff-intake' } : null;
  };

  if (isInjection(rawInput)) {
    const refusal = {
      en: "I can't change my instructions, share private policies, secrets, or internal tools, or give prices. I'm LAVAALL Assistant, and I can only help with Technology questions or prepare an inquiry for your review.",
      fr: "Je ne peux pas modifier mes instructions, partager des politiques privées, des secrets ou des outils internes, ni indiquer de prix. Je suis LAVAALL Assistant et je peux seulement aider pour la technologie ou préparer une demande.",
      pt: 'Não posso alterar as minhas instruções, partilhar políticas privadas, segredos ou ferramentas internas, nem indicar preços. Sou LAVAALL Assistant e só posso ajudar com Tecnologia ou preparar um pedido.',
      kr: "A nɔ ebul chenj mi ruls, shɛ prayvet pɔlisi, sikrɛt, ɔ intanal tul, ɔ gi prayz. A na LAVAALL Assistant; a kin ɛp wit Technology kwɛstyɔn ɔ priper rɛkwɛst.",
    }[lang];
    const blocked = blockedHandoff(refusal, 'refused-injection');
    if (blocked) return blocked;
    return attachTopic({ text: `${refusal} ${offer(lang, false)}`, language: lang, events: ['refused-injection'], fields: {} }, rawInput, context, reset);
  }

  if (sensitive) {
    const line = {
      en: "Please don't share payment cards, passport or national ID numbers, passwords, or other sensitive documents here. I will not store or repeat those details. A name and a valid phone number are enough to send a request; every other field is optional.",
      fr: "Merci de ne pas partager ici de cartes de paiement, numéros de passeport ou d'identité, mots de passe ou autres données sensibles. Je ne les conserverai ni ne les répèterai. Le nom et un numéro de téléphone valide suffisent ; les autres champs sont facultatifs.",
      pt: 'Por favor não partilhe aqui cartões de pagamento, passaporte, identificação nacional, palavras-passe ou outros dados sensíveis. Não os guardo nem os repito. O nome e um telefone válido chegam; os restantes campos são opcionais.',
      kr: "Duya, nɔ shɛ pemɛnt kad, paspɔt, nashɔnal ID, paswɔd, ɔ ɔda sɛnsitiv dɔkyumɛnt ya. A nɔ go stɔ ɔ ripit dɛn. Ném ɛn valid fon nɔmba nɔmɔ fɔ sɛn rɛkwɛst; ɔda fil dɛn ɔpshɔnal.",
    }[lang];
    const blocked = blockedHandoff(line, 'blocked-sensitive:' + sensitive);
    if (blocked) return blocked;
    // Never echo the raw sensitive payload back.
    return attachTopic({ text: `${line} ${contacts()}`, language: lang, events: ['blocked-sensitive:' + sensitive], fields: {} }, rawInput, context, reset);
  }

  const handoff = guidedHandoff(rawInput, handoffSession, AGENT_ASK.test(rawInput) && !CONTACT_ASK.test(rawInput));
  if (handoff) return handoff;

  const guided = guidedReply(rawInput, context, lang, { priceAsk, wantsAgent });
  if (guided) {
    guided.language = lang;
    return attachTopic(guided, rawInput, context, reset);
  }

  if (OFFTOPIC_HINTS.test(input) && !TECH_HINTS.test(input) && !wantsAgent && !hours) {
    const line = {
      en: "I'm here to help with LAVAALL Technology — hardware, installation, or a request for the team — not with that topic.",
      fr: "Je suis là pour LAVAALL Technology — le matériel, l'installation ou une demande pour l'équipe — et non pour ce sujet.",
      pt: 'Estou aqui para a LAVAALL Technology — equipamento, instalação ou um pedido para a equipa — e não para esse tema.',
      kr: 'A de ya fɔ ɛp wit LAVAALL Technology — ɛkwipmɛnt, instaleshɔn, ɔ rɛkwɛst fɔ di tim — nɔt dat tɔpik.',
    }[lang];
    return attachTopic({ text: `${line} ${offer(lang, false)}`, language: lang, events: ['redirected-offtopic'], fields: {} }, rawInput, context, reset);
  }

  if (botAsk && !TECH_HINTS.test(rawInput) && !TECH_HINTS.test(input) && !priceAsk) {
    const line = FIRST[lang] || FIRST.en;
    return attachTopic({ text: `${line} ${offer(lang, wantsAgent)}`, language: lang, events: ['identified-assistant'], fields: {}, handoff: wantsAgent ? { tagOsman: true } : undefined }, rawInput, context, reset);
  }

  if (/\b(install(?:ation|ations|ing)?|installe[rz]?|installer|installations?|deployment|deploy|deploiement|instalacao|instalar)\b/i.test(foldedText(rawInput))) {
    const line = {
      en: 'LAVAALL supplies and installs equipment. Public coverage pages describe Sierra Leone, Guinea, and Guinea-Bissau. Delivery and installation depend on the location and must be confirmed by the team; I cannot promise scheduling.',
      fr: "LAVAALL fournit et installe des équipements. Les pages publiques de couverture décrivent la Sierra Leone, la Guinée et la Guinée-Bissau. La livraison et l’installation dépendent du lieu et doivent être confirmées par l’équipe ; je ne peux pas promettre de date.",
      pt: 'A LAVAALL fornece e instala equipamentos. As páginas públicas de cobertura descrevem Serra Leoa, Guiné e Guiné-Bissau. A entrega e a instalação dependem do local e devem ser confirmadas pela equipa; não posso prometer agendamento.',
      kr: 'LAVAALL de supply ɛn install ɛkwipmɛnt. Di pɔblik coverage pej dɛn diskrayb Sierra Leone, Guinea ɛn Guinea-Bissau. Delivery ɛn installation dipɛnd pan di ples; di tim mɔs kɔnfam. A nɔ ebul prɔmis tɛm.',
    }[lang];
    return attachTopic({ text: `${line} ${offer(lang, wantsAgent)}`, language: lang,
      events: ['installation-service', ...(wantsAgent ? ['tag-osman-handoff'] : [])],
      fields: draftFields(rawInput, qty, [], 'installation-services', identity),
      handoff: wantsAgent ? { tagOsman: true } : undefined }, rawInput, context, reset);
  }

  const catalogPreview = searchMaybeMulti(input, { limit: 8 });
  const productIntent = TECH_HINTS.test(input) || (catalogPreview.matches.length > 0 && (qty || priceAsk || /\b(iphone|laptop|server|router|dell|hp|cisco|macbook)\b/i.test(input)));
  if (wantsAgent && !productIntent && !priceAsk) {
    events.push('tag-osman-handoff');
    const line = {
      en: 'Thanks, someone from our team will reach out to you shortly. What is the best WhatsApp number or email to reach you?',
      fr: "Merci, quelqu'un de l'équipe vous recontactera sous peu. Quel est le meilleur WhatsApp ou e-mail pour vous joindre ?",
      pt: 'Obrigado, alguém da equipa entrará em contacto consigo em breve. Qual é o melhor WhatsApp ou e-mail para o contactarmos?',
      kr: 'Tɛnki. Sɔmbɔdi frɔm wi tim go rich yu sɔn. Wetin na di bɛst WhatsApp ɔ ɛmail fɔ rich yu?',
    }[lang];
    return attachTopic({ text: line, language: lang, events, fields: {}, chips: [], handoff: { tagOsman: true } }, rawInput, context, reset);
  }

  if (hours && !priceAsk && !TECH_HINTS.test(input) && !TECH_HINTS.test(rawInput) && !searchMaybeMulti(String(input).replace(/24\s*\/\s*7/ig, " ").replace(/\b24\s+7\b/g, " ")).matches.length) {
    const line = {
      en: 'Messages are accepted anytime, but the team is not staffed continuously. Someone from the team will reach out after a request is successfully sent; I cannot promise a time.',
      fr: "Les messages sont acceptés à tout moment, mais l'équipe n'est pas présente en continu. Quelqu'un recontactera après l'envoi réussi d'une demande ; je ne peux pas promettre un délai.",
      pt: 'As mensagens são aceites a qualquer hora, mas a equipa não está presente de forma contínua. Alguém entrará em contacto após um pedido enviado com sucesso; não posso prometer um prazo.',
      kr: 'Wi accɛpt mɛsej ɛni tɛm, bɔt di tim nɔ de ɔl tɛm. Sɔmbɔdi go rich yu afta rɛkwɛst sɛn; a nɔ ebul prɔmis tɛm.',
    }[lang];
    return attachTopic({ text: `${line} ${offer(lang, wantsAgent)}`, language: lang, events: wantsAgent ? ['tag-osman-handoff'] : ['hours'], fields: {}, handoff: wantsAgent ? { tagOsman: true } : undefined }, rawInput, context, reset);
  }


  // French/Portuguese "moto(s)" means motorcycle, not Motorola, unless a phone is named.
  const motorcycle = /\bmotos?\b/i.test(rawInput) && !/\b(motorola|phone|smartphone|g84|stylus)\b/i.test(rawInput);
  if (motorcycle) {
    return attachTopic({
      text: replyNotListed(lang, input, qty),
      language: lang,
      events: ['not-in-catalog'],
      fields: draftFields(input, qty, [], 'general-inquiry'),
    }, rawInput, context, reset);
  }

  loadCatalog();
  const result = searchMaybeMulti(input, { limit: 8 });
  const hasMatch = result.matches.length > 0;

  if (hasMatch) {
    if (wantsAgent) events.push('tag-osman-handoff');
    if (angry) events.push('acknowledged-frustration');
    if (botAsk) events.push('identified-assistant');
    if (identity.name && identity.phone) events.push('captured-contact');
    let textOut = replyForProducts(lang, input, qty, result, priceAsk, bulk);
    if (botAsk) textOut = (FIRST[lang] || FIRST.en) + ' ' + textOut;
    if (identity.name && identity.phone) {
      const formLine = {
        en: `I can put ${identity.name} and ${identity.phone} on a request for your review.`,
        fr: `Je peux inscrire ${identity.name} et ${identity.phone} sur une demande à vérifier.`,
        pt: `Posso colocar ${identity.name} e ${identity.phone} num pedido para a sua revisão.`,
        kr: `A kin put ${identity.name} ɛn ${identity.phone} na rɛkwɛst fɔ yu rivyu.`,
      }[lang];
      textOut = formLine + ' ' + textOut;
    }
    if (angry) {
      const calm = {
        en: 'I am sorry this has been frustrating. I cannot promise a time.',
        fr: 'Je suis désolé que ce soit frustrant. Je ne peux pas promettre un délai.',
        pt: 'Lamento que isto seja frustrante. Não posso prometer um prazo.',
        kr: 'A sɔri dis bin frɔstratin. A nɔ ebul prɔmis tɛm.',
      }[lang];
      textOut = calm + ' ' + textOut;
    }
    const listed = listModels(result.all, 8);
    const naming = shortCatalogNames((result.all && result.all.length) ? result.all : result.matches, 5);
    return attachTopic({
      text: textOut,
      language: lang,
      events,
      fields: draftFields(rawInput, qty, naming, priceAsk ? 'sales-quotation' : (bulk ? 'sales-quotation' : 'product-availability'), identity),
      matches: listed.map(item => item.id),
      matchProducts: listed,
      matchCount: result.all.length,
      resolvedQuery: input,
      handoff: wantsAgent ? { tagOsman: true } : undefined,
    }, rawInput, context, reset);
  }

  const lookingForThing = (Array.isArray(qty) ? qty.length : qty) || /\b(iphone|ipad|tesla|drone|moto|motos|motorcycle|laptop|server|router|starlink|ps5|tractor|trator|ticket|v[eé]lo|gopro|john deere)\b/i.test(input + " " + rawInput)
    || /\b(cherche|procuro|looking for|need|want to buy|vendez-vous)\b/i.test(input);
  if (lookingForThing || priceAsk) {
    return attachTopic({
      text: (priceAsk
        ? ({
          en: 'I cannot give prices, estimates, or discounts in this chat. ',
          fr: 'Je ne peux pas indiquer de prix, d’estimation ou de remise dans cette conversation. ',
          pt: 'Não posso indicar preços, estimativas ou descontos neste chat. ',
          kr: 'A nɔ ebul gi prayz, ɛstimet, ɔ diskaunt na dis chat. ',
        }[lang])
        : '') + replyNotListed(lang, input, qty),
      language: lang,
      events: ['not-in-catalog'],
      fields: draftFields(input, qty, [], priceAsk ? 'sales-quotation' : 'general-inquiry'),
    }, rawInput, context, reset);
  }

  const fallback = {
    en: `I can help with LAVAALL Technology questions, look up what is listed in the catalogue, or prepare a request. ${offer(lang, false)}`,
    fr: `Je peux répondre aux questions Technology, indiquer ce qui figure au catalogue, ou préparer une demande. ${offer(lang, false)}`,
    pt: `Posso ajudar com perguntas de Tecnologia, indicar o que está no catálogo, ou preparar um pedido. ${offer(lang, false)}`,
    kr: `A kin ɛp wit Technology kwɛstyɔn, sho wetin de na katalog, ɔ priper rɛkwɛst. ${offer(lang, false)}`,
  }[lang];
  return attachTopic({ text: fallback, language: lang, events, fields: {} }, rawInput, context, reset);
}

module.exports = { AGENT_ASK, respond, REACHABILITY, EMAIL, WHATSAPP, FIRST, detectLanguage, extractQuantity, resolveQuery, isFollowUp, extractIdentity, productParts };
