'use strict';

// Intent guards run before catalogue discovery and handoff name intake.
const fold = value => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function reply(text, language, event, extra = {}) {
  return { text, language, events: [event], lastTopic: event, fields: {}, chips: [], ...extra };
}
function specialIntent(text, lang, session = {}) {
  if (/^(?:handoff|form)-/.test(session.awaiting || '') && session.awaiting !== 'form-offer') return null;
  const { normalizeInput } = require('./catalog');
  const raw = fold(normalizeInput ? normalizeInput(text) : text).replace(/[’']/g, ' ');
  const localized = (en, fr, kr) => lang === 'fr' ? fr : lang === 'kr' ? kr : en;
  const answer = (en, fr, kr, event, extra) => reply(localized(en, fr, kr), lang, event, extra);
  if (/\b(?:(?:are|is) (?:you|this) (?:an? |the )?(?:bot|robot|human|ai|real person)|am i (?:talking|speaking) (?:to|with) (?:an? )?(?:real person|human)|(?:you|yu|una) (?:a|na) (?:bot|robot|human)|(?:are|r) (?:you|yu|u) (?:really )?(?:human|real)|(?:is|are) (?:this|you) (?:a )?real person|(?:es-tu|etes-vous|tu es|vous etes|est ce que tu es|est ce que vous etes|est ce un) (?:un |une )?(?:bot|robot|humain|personne|ia))\b/.test(raw)) {
    return answer("I'm the LAVAALL Assistant, an AI assistant. Would you like me to connect you with a person on our team?", "Je suis LAVAALL Assistant, un assistant IA. Souhaitez-vous que je vous mette en relation avec une personne de notre équipe ?", 'A na LAVAALL Assistant, wan AI assistant. Yu wan tɔk to wan pɔsin na wi tim?', 'product-guide', { chips: ['Talk to someone'] });
  }
  // Whole-question intent matching leaves product-qualified questions to discovery.
  const companyAsk = raw.trim().replace(/^[\s¿]+|[?!.\s]+$/g, '').replace(/^(?:please |bonjour[, ]+|hi[, ]+|hello[, ]+)/, '');
  if (/^(?:what makes (?:you|lavaall) different|why (?:should i )?choose (?:you|lavaall)|what do you do|what does lavaall do|who are you|who is lavaall|tell me (?:more )?about lavaall|(?:can|could) you tell me about lavaall|pourquoi choisir lavaall|qui etes[- ]vous|qui est lavaall|que faites[- ]vous|parlez[- ]moi de lavaall|qu est[- ]ce qui (?:vous|lavaall) (?:differencie|rend different)|wetin una (?:de du|de do|dae do))$/.test(companyAsk)) {
    // Krio uses the English fallback until a complete pitch has reviewed wording.
    const companyLanguage = /^(?:pourquoi|qui |que |parlez|qu est)/.test(companyAsk) ? 'fr' : lang;
    return reply(companyLanguage === 'fr'
      ? 'LAVAALL est une marketplace technologique sur devis pour vos besoins en approvisionnement et livraison en Sierra Leone, en Guinée, au Liberia et en Guinée-Bissau, selon le lieu à confirmer avec notre équipe. LAVAALL Web crée des sites web, des applications, des systèmes de commande en ligne et des bots, avec un aperçu gratuit pour commencer. Souhaitez-vous un formulaire rapide pour votre projet ?'
      : 'LAVAALL is a quote-first technology marketplace for sourcing and delivery in Sierra Leone, Guinea, Liberia and Guinea-Bissau, with our team checking the delivery location. LAVAALL Web builds websites, apps, online ordering and bots, starting with a free preview. Would you like a quick form for your project?',
    companyLanguage === 'fr' ? 'fr' : 'en', 'company-pitch');
  }
  if (/\b(?:paid|payment (?:already|confirmation)|confirm (?:my |the )?payment|paiement.*confirm|confirm.*paiement|deja paye|don pay|dɔn pay)\b/.test(raw)) {
    return answer("I can't confirm payments here; our team verifies payments. Would you like me to connect you with them?", "Je ne peux pas confirmer les paiements ici ; notre équipe les vérifie. Souhaitez-vous que je vous mette en relation avec elle ?", 'A nɔ kin kɔnfam payment ya; wi tim go verify am. Yu wan tɔk to wi tim?', 'faq-pay', { chips: ['Talk to someone'] });
  }
  if (/\b(?:delete|erase|remove|supprimer|supprime|effacer|efface)\b.*\b(?:data|details|information|donnees|coordonnees)\b/.test(raw)) {
    return answer("I can't delete data from the chat, but our team can handle that request. Would you like me to connect you with them?", "Je ne peux pas supprimer les données de cette conversation, mais notre équipe peut traiter cette demande. Souhaitez-vous que je vous mette en relation avec elle ?", 'A nɔ kin delete di data ya, bɔt wi tim kin ɛp wit dat request. Yu wan tɔk to wi tim?', 'service-help', { chips: ['Talk to someone'] });
  }
  if (/\b(?:nor dae answer|not answering|nobody.*answer)\b/.test(raw)) return answer("I'm sorry I haven't answered clearly. What do you need help with?", "Je suis désolé de ne pas avoir répondu clairement. De quoi avez-vous besoin ?", 'A sɔri a nɔ answer yu clear. Wetin yu nid ɛp wit?', 'service-help', { chips: ['Talk to someone'] });
  if (!/\b(?:laptops?|phones?|computers?|routers?|iphones?|tablets?|printers?|ordinateurs?)\b/.test(raw) && (/\b(?:need|want|build|create|make|a) (?:a |an )?shop\b/.test(raw) || /\b(?:a )?page to sell\b/.test(raw)) && !/\b(?:website|online|web|physical|equipment|workshop)\b/.test(raw)) return answer('Do you need equipment for a physical shop or an online store/website?', 'Avez-vous besoin de matériel pour un magasin physique ou d’une boutique en ligne / d’un site web ?', 'Yu nid equipment fɔ wan shop ɔ online store/website?', 'faq-website', { chips: ['Shop equipment', 'Online store / website'] });
  if (/\b(?:website|site|web page|page to sell|online store|app|crm|whatsapp bot|whatsapp.*repl|chatbot|automate|instagram.*post(?:ing|s)?|post(?:ing|s)?.*instagram|automati[sz]ation|site internet|site web|boutique en ligne)\b/.test(raw)) {
    const mixed = /\b(?:laptops?|phones?|computers?|routers?|iphones?|tablets?|printers?|ordinateurs?)\b/.test(raw);
    const equipment = /laptop/.test(raw) ? 'laptops' : /phone/.test(raw) ? 'phones' : /router/.test(raw) ? 'routers' : /tablet/.test(raw) ? 'tablets' : /printer/.test(raw) ? 'printers' : 'computers';
    return answer((mixed ? 'We can help source ' + equipment + ' and discuss your website with LAVAALL Web. ' : 'LAVAALL Web starts with a free preview for websites, online stores, apps and automation. ') + 'What is your business and what should the site or bot do?', 'LAVAALL Web propose un aperçu gratuit pour votre site, votre boutique en ligne ou votre automatisation' + (mixed ? ', ainsi qu’avec une demande de matériel' : '') + '. Quelle est votre activité et que doit faire le site ou le bot ?', 'LAVAALL Web de start wit wan free preview fɔ website, online store ɛn automation' + (mixed ? ', ɛn wi kin source di equipment' : '') + '. Wetin na yu business ɛn wetin di site ɔ bot fɔ du?', 'faq-website', { chips: ['Talk to someone'] });
  }
  if (/\b(?:orange money|mobile money|go pay|payment methods?|how.*pay|comment.*payer|moyens? de paiement|payer avec|paye.*orange)\b/.test(raw)) return answer('Payment is agreed after a quote is accepted. Please never pay before you have a full written quote. Would you like to start a quote now?', 'Le paiement est convenu après acceptation du devis. Ne payez jamais avant d’avoir un devis écrit complet. Souhaitez-vous demander un devis ?', 'Wi go agree payment afta yu accept di quote. Duya, nɔ pay bifɔ yu gɛt di full written quote. Yu wan start wan quote?', 'faq-pay', { chips: ['Request a quote', 'Talk to someone'] });
  const city = raw.match(/\b(conakry|freetown|monrovia|bo|kenema)\b/);
  const place = city && ({ conakry: 'Conakry', freetown: 'Freetown', monrovia: 'Monrovia', bo: 'Bo', kenema: 'Kenema' })[city[1]];
  if (place && /\b(?:are you in|you.*based|una dae|where|whr|location|office|situe|etes.*a|vous.*a|bureau)\b/.test(raw)) return answer('LAVAALL serves Sierra Leone, Guinea, Liberia and Guinea-Bissau. Our team confirms pickup and delivery details; which item do you need?', 'LAVAALL dessert la Sierra Leone, la Guinée, le Liberia et la Guinée-Bissau. Notre équipe confirme les modalités de retrait et de livraison ; quel article vous faut-il ?', 'LAVAALL de serve Sierra Leone, Guinea, Liberia ɛn Guinea-Bissau. Wi tim go kɔnfam pickup ɛn delivery details; wetin yu nid?', 'faq-delivery', { slots: { ...session.slots, deliveryCity: place, deliveryCountry: ({ Conakry: 'Guinea', Freetown: 'Sierra Leone', Monrovia: 'Liberia', Bo: 'Sierra Leone', Kenema: 'Sierra Leone' })[place] } });
  if (place && /\b(?:deliver|delivery|delivr|ship|livraison|livrer|combien|price|cost|pay|how much)\b/.test(raw)) return answer('Yes, we deliver to ' + place + '. Delivery price and timing are confirmed with your quote. Which item do you need?', 'Oui, nous livrons à ' + place + '. Le prix et le délai de livraison sont confirmés avec votre devis. Quel article vous faut-il ?', 'Wi kin deliver na ' + place + '. Wi tim go kɔnfam delivery prayz ɛn tɛm wit yu quote. Wetin yu nid?', 'faq-delivery', { slots: { ...session.slots, deliveryCity: place, deliveryCountry: ({ Conakry: 'Guinea', Freetown: 'Sierra Leone', Monrovia: 'Liberia', Bo: 'Sierra Leone', Kenema: 'Sierra Leone' })[place] } });
  const commercial = require('./catalog').purchaseDetails(raw);
  const detailedPurchase = commercial.quantity && (commercial.condition || commercial.purpose || Number(commercial.quantity) >= 10 || commercial.quantity.includes('–'));
  if (!detailedPurchase && lang === 'fr' && /\b(?:ordinateurs?|portables?|telephones?)\b/.test(raw)) {
    const qty = (raw.match(/\b\d{1,4}\b/) || [])[0];
    const computers = /\bordinateurs?\b/.test(raw);
    return reply(computers ? "D'accord" + (qty ? ', ' + qty + ' ordinateurs' : '') + '. Portables ou de bureau ?' : 'Nous pouvons vous aider à choisir ' + (qty ? qty + ' appareils' : 'un appareil') + '. Quelle marque souhaitez-vous ?', 'fr', 'product-guide', { fields: qty ? { quantity: qty } : {}, slots: { ...session.slots, ...(qty ? { quantity: qty } : {}) }, chips: computers ? ['Portables', 'Ordinateurs de bureau'] : ['Apple', 'Samsung'] });
  }
  if (!detailedPurchase && lang === 'kr' && /\b(?:laptops?|computers?|kompyuta|computa|phones?|fone|phon)\b/.test(raw)) {
    const qty = (raw.match(/\b\d{1,4}\b/) || [])[0];
    return reply('Wi kin ɛp source ' + (qty ? qty + ' ' : '') + (/phone|fone|phon/.test(raw) ? 'phone' : 'computer') + '. Which brand yu want?', 'kr', 'product-guide', { fields: qty ? { quantity: qty } : {}, slots: { ...session.slots, ...(qty ? { quantity: qty } : {}) }, chips: ['Apple', 'Dell', 'Samsung'] });
  }
  return null;
}
module.exports = { specialIntent };
