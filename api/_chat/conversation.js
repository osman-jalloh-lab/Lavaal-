'use strict';

const { searchCatalog } = require('./catalog');
const EMAIL = 'support@lavaall.com';
const WHATSAPP = '+1 (737) 704-4182';

const CONTACT_ASK = /\b(how (?:can|do) i contact|contact (?:this |a |the )?(?:person|someone|you|the team|support)|how (?:can|do) i reach|reach (?:you|the team|a person|someone)|your (?:email|whatsapp|contact)|whatsapp number|support@lavaall)\b/i;
const HAVE_ASK = /\b(do you (?:have|carry|sell|stock)|have you got|is there (?:an? |any )?|are there |in (?:the|your) catalogu?e)\b/i;
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
  const result = searchCatalog(query, { limit: 8 });
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
  products = productsForQuery(query, products);
  const names = uniqueNames(products);
  const label = query.replace(/^(do you (?:have|carry|sell|stock)|have you got|is there (?:an? |any )?|are there )\s+/i, '')
    .replace(/\?+$/, '')
    .replace(/\s+in (?:the|your) (?:technology )?catalogu?e\??$/i, '')
    .trim() || names[0];
  if (!names.length) {
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

  if (HAVE_ASK.test(text) || /^\s*(?:the )?((?:apple )?iphone(?:\s+1[1-6])?(?:\s+(?:pro max|pro|plus|max|mini))?)\s*\??\s*$/i.test(text)) {
    const query = text.replace(/^(do you (?:have|carry|sell|stock)|have you got|is there (?:an? |any )?|are there )\s+/i, '')
      .replace(/\?+$/, '')
      .replace(/\s+in (?:the|your) (?:technology )?catalogu?e\??$/i, '')
      .trim();
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

  return null;
}

module.exports = {
  guidedReply, productColors, pickModel, CONTACT_ASK, HAVE_ASK, HELP_ASK,
};
