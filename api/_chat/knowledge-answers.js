'use strict';
/*
 * Deterministic answers to company questions, built only from the generated public knowledge pack.
 * Runs before catalogue narrowing so questions like "Do you work in Guinea?" or "Do you have a branch
 * in Bo?" are not mistaken for product names. Zero model calls. English only (the pack is English);
 * other languages keep the existing paths. Delivery, price, payment, refund, hours and handoff stay
 * with the existing FAQ / handoff code.
 */
const knowledge = require('./knowledge');

const QUESTION = /^(do|does|can|could|are|is|where|what|which|who|how|tell|any)\b/i;
const facts = () => knowledge.section('technology').facts;
const byId = id => facts().find(f => f.id === id);

function reply(text, id, extra = {}) {
  return { text, language: 'en', events: ['knowledge-answer'], fields: {}, matchCount: 0, chips: [], lastTopic: 'knowledge:' + id, knowledgeIds: [id], ...extra };
}
function split(fact) {
  const m = /^\*\*(.+?)\*\*: (.*)$/.exec(fact.text);
  return m ? { name: m[1], desc: m[2] } : { name: '', desc: fact.text };
}

// Find-order keeps Guinea-Bissau ahead of Guinea so "Guinea-Bissau" does not hit coverage-gn.
const COUNTRY = [
  { id: 'coverage-gw', re: /\bguinea[- ]?bissau\b|\bbissau\b/i },
  { id: 'coverage-gn', re: /\bguinea\b|\bconakry\b/i },
  { id: 'coverage-lr', re: /\bliberia\b|\bmonrovia\b/i },
  { id: 'coverage-sl', re: /\bsierra leone\b|\bsalone\b|\bfreetown\b/i },
];
const COUNTRY_DISPLAY = ['coverage-sl', 'coverage-gn', 'coverage-lr', 'coverage-gw'];
const BRANCH_CITY = [
  ['Bo', /\bbo\b/i], ['Makeni', /\bmakeni\b/i], ['Waterloo', /\bwaterloo\b/i],
  ['Freetown', /\bfreetown\b|\bbrookfields\b/i], ['Kenema', /\bkenema\b/i], ['Kono', /\bkono\b/i],
];
const OPERATE = /\b(work|operate|serve|cover|based|located|available|active|present)\b/i;
const BRANCH = /\b(branch(es)?|office|offices|shop|store|showroom|location|locations|address)\b/i;
const HANDLED_ELSEWHERE = /\b(deliver(y|ies)?|ship(ping)?|price|cost|how much|pay(ment)?|refund|invoice|quote|install\w*|open|hours?|talk to|speak to|starlink)\b/i;
const UNKNOWN_COMPANY = /\b(who owns|owner of|ceo|founder|founded|how many (employees|staff|people)|revenue|turnover|registration number|licen[cs]e number|tax id)\b/i;
const UNKNOWN_POLICY = /\b(warrant(y|ies)|guarantee[sd]?|return policy|returns? policy|can i return|exchange policy)\b/i;

function knowledgeReply(rawInput, session = {}, lang = 'en') {
  const text = String(rawInput || '').trim();
  if (!text || lang !== 'en' || (session && session.awaiting)) return null;
  if (!QUESTION.test(text) && !/\?$/.test(text)) return null;

  // Missing information: say so plainly and offer the form or contact.
  if (UNKNOWN_COMPANY.test(text) || UNKNOWN_POLICY.test(text)) {
    return reply(knowledge.missingLine('technology'), 'missing', { chips: ['Talk to someone'] });
  }
  if (HANDLED_ELSEWHERE.test(text)) return null;

  if (BRANCH.test(text)) {
    const branches = byId('branches');
    if (!branches) return null;
    if (/\bguinea[- ]?bissau\b|\bbissau\b/i.test(text)) {
      const { desc } = split(byId('coverage-gw'));
      return reply('For **Guinea-Bissau**: ' + desc + ' Which area are you in?', 'coverage-gw');
    }
    if (/\bliberia\b|\bmonrovia\b/i.test(text)) {
      const { desc } = split(byId('coverage-lr'));
      return reply('For **Liberia**: ' + desc + ' Which city are you in?', 'coverage-lr');
    }
    const city = BRANCH_CITY.find(([, re]) => re.test(text));
    if (city) {
      const m = new RegExp('(' + (city[0] === 'Freetown' ? 'Freetown[^(]*' : city[0]) + ')\\s*\\(([^)]+)\\)').exec(branches.text);
      if (m) return reply('Yes, our **' + m[1].trim() + '** branch is at ' + m[2] + '. What can we help you with?', 'branches');
    }
    return reply(branches.text.replace(/^Sierra Leone branches: /, 'Our **Sierra Leone** branches are in ') + ' Which one is closest to you?', 'branches');
  }

  if (OPERATE.test(text)) {
    const country = COUNTRY.find(c => c.re.test(text));
    if (country) {
      const { name, desc } = split(byId(country.id));
      const line = /^Full service/i.test(desc) ? 'Yes, we work in **' + name + '**. ' + desc : 'For **' + name + '**: ' + desc;
      return reply(line + ' Which city are you in?', country.id);
    }
    if (/\bwhere\b/i.test(text)) {
      const names = COUNTRY_DISPLAY.map(id => '**' + split(byId(id)).name + '**');
      return reply('We operate in ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '. Which country are you in?', 'coverage');
    }
  }

  // "How do you handle wholesale requests?" stays with the existing service reply.
  if (/^(do|does|are|can) (you|lavaall)( also)? (sell|do|offer|supply|accept|take)\b.*\b(wholesale|retail)\b/i.test(text) && !/\d/.test(text)) {
    return reply(byId('faq-1').text.replace(/\bBoth\b/, '**Both**') + ' What would you like to order, and how many?', 'faq-1');
  }
  if (/\b(what else|besides|other than|apart from)\b/i.test(text) && /\b(sell|supply|offer|have)\b/i.test(text)) {
    return reply(byId('faq-4').text + ' Which of these do you need?', 'faq-4');
  }
  if (/\b(industr(y|ies)|sectors?)\b|\bwho do you (serve|work with)\b|\bwhat (kind|type)s? of (customers|clients|businesses)\b/i.test(text)) {
    return reply(byId('industries').text + ' What kind of organisation are you with?', 'industries');
  }
  const about = /\b(what (does|is) lavaall|what do you (do|sell|supply)|who are you|tell me about (lavaall|your company|you))\b/i.exec(text);
  // Product-qualified asks ("what do you do for routers") stay with catalogue discovery.
  if (about && !/^\s+(for|with|on)\s+\S/i.test(text.slice(about.index + about[0].length))) {
    return reply(byId('about').text.replace('enterprise IT equipment', '**enterprise IT equipment**') + ' What are you looking for today?', 'about');
  }
  return null;
}

module.exports = { knowledgeReply };
