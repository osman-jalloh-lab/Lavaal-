/* A1: local TEST ONLY UI. No vendor script, credentials, network or voice path. */
(function (root) {
  'use strict';
  var fields = ['inquiryType','name','phone','email','country','company','subject','message','preferredResponse','productOrService','model','quantity','budget','deliveryLocation','timeline','orderNumber','issueDescription','installationType','projectDescription'];
  var copy = {
    en: {
      first: 'I am LAVAALL Assistant, an AI assistant. This is a local TEST ONLY demonstration.',
      review: 'Review inquiry',
      send: 'Send to LAVAALL',
      skipped: 'Skipped',
      edit: 'Edit inquiry',
      unknown: 'Delivery is uncertain. Do not send again; contact the team.',
      accepted: 'Your request was accepted. Someone from the team will reach out.',
      disabled: 'Submission unavailable. Contact the team.',
      answer: 'Local test response: the team can confirm your Technology request. I cannot access internal systems or confirm stock, dates or pricing.',
      language: 'Language',
      notice: 'Language switching is unverified until tested in vendor Preview. Krio text is best-effort.',
      questions: ['What does LAVAALL supply?','Do you install equipment?','Where do you operate?','Can the team confirm delivery to my location?','Do you handle wholesale and retail requests?','Can I ask about refurbished computers?','How do I request a quote?','Can the team confirm product availability?','How do I get help with an existing order?','How can I contact a person?']
    },
    fr: {
      first: 'Je suis LAVAALL Assistant, un assistant IA. Ceci est une démonstration locale TEST ONLY.',
      review: 'Vérifier la demande',
      send: 'Envoyer à LAVAALL',
      skipped: 'Non renseigné',
      edit: 'Modifier la demande',
      unknown: 'La livraison est incertaine. Ne renvoyez pas la demande ; contactez l’équipe.',
      accepted: 'Votre demande a été acceptée. Un membre de l’équipe vous contactera.',
      disabled: 'Envoi indisponible. Contactez l’équipe.',
      answer: 'Réponse de test locale : l’équipe peut vérifier votre demande Technology. Aucun accès aux systèmes internes ; aucun engagement sur les stocks, dates ou tarifs.',
      language: 'Langue',
      notice: 'Le changement de langue reste à vérifier en Preview du fournisseur. Le krio écrit est proposé au mieux.',
      questions: ['Que fournit LAVAALL ?','Installez-vous les équipements ?','Où intervenez-vous ?','L’équipe peut-elle confirmer la livraison à mon adresse ?','Acceptez-vous les demandes en gros et au détail ?','Puis-je demander des ordinateurs reconditionnés ?','Comment demander un devis ?','L’équipe peut-elle confirmer la disponibilité ?','Comment obtenir de l’aide pour une commande ?','Comment contacter une personne ?']
    },
    pt: {
      first: 'Sou LAVAALL Assistant, um assistente de IA. Esta é uma demonstração local TEST ONLY.',
      review: 'Rever pedido',
      send: 'Enviar à LAVAALL',
      skipped: 'Não preenchido',
      edit: 'Editar pedido',
      unknown: 'A entrega é incerta. Não envie novamente; contacte a equipa.',
      accepted: 'O seu pedido foi aceite. Alguém da equipa entrará em contacto.',
      disabled: 'Envio indisponível. Contacte a equipa.',
      answer: 'Resposta de teste local: a equipa pode verificar o seu pedido Technology. Sem acesso a sistemas internos nem confirmação de stock, datas ou preços.',
      language: 'Idioma',
      notice: 'A mudança de idioma aguarda testes no Preview do fornecedor. Texto em krio é uma tentativa sem garantia.',
      questions: ['O que fornece a LAVAALL?','Instalam equipamentos?','Onde operam?','A equipa pode confirmar entrega na minha localização?','Aceitam pedidos por grosso e a retalho?','Posso perguntar por computadores recondicionados?','Como pedir um orçamento?','A equipa pode confirmar disponibilidade?','Como obter ajuda com uma encomenda?','Como contactar uma pessoa?']
    }
  };
  var labels = {
    en: ['Inquiry type','Name','Phone','Email','Country','Company','Subject','Message','Preferred response','Product or service','Model','Quantity','Your budget','Delivery location','Your timeline','Order number','Issue description','Installation type','Project description'],     fr: ['Type de demande','Nom','Téléphone','E-mail','Pays','Entreprise','Objet','Message','Réponse souhaitée','Produit ou service','Modèle','Quantité','Votre budget','Lieu de livraison','Votre calendrier','Numéro de commande','Description du problème','Type d’installation','Description du projet'],     pt: ['Tipo de pedido','Nome','Telefone','E-mail','País','Empresa','Assunto','Mensagem','Resposta preferida','Produto ou serviço','Modelo','Quantidade','O seu orçamento','Local de entrega','O seu prazo','Número da encomenda','Descrição do problema','Tipo de instalação','Descrição do projeto']
  };
  var scaffold = Object.freeze({
    provider:'ElevenLabs', agentId:'NOT_CONFIGURED', textOnly:true, enabled:false, enforcementVerified:false
  });
  function eligible(config, location) {
    var loopback = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) !== -1;
    return !!(
      config && config.CHAT_ENABLED === true && config.localTestStub === true &&
      config.environment === 'test' && location.pathname === '/' && loopback &&
      typeof config.transport === 'function'
    );
  }
  function summary(draft, lang) {
    var c = copy[lang] || copy.en;
    return fields.map(function (key) {
      return {
        field:key, value:draft[key] === undefined || draft[key] === '' ? c.skipped : String(draft[key])
      };
    });
  }
  function validatePartialDraft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid_draft');
    var enums = {
      inquiryType: ['sales-quotation','product-availability','equipment-procurement','routers-networking','servers-infrastructure','computers-workstations','fiber-optic','structured-cabling','installation-services','customer-support','technical-support','existing-order','partnership','general-inquiry','other'],
      country: ['Sierra Leone','Guinea','Guinea-Bissau','Liberia','Other West Africa','Other'],
      preferredResponse: ['email','phone']
    };
    Object.keys(value).forEach(function (key) {
      if (fields.indexOf(key) === -1 || typeof value[key] !== 'string' || value[key].length > (key === 'message' ? 2000 : key === 'name' ? 100 : 300)) throw new Error('invalid_draft');
      if (value[key] && enums[key] && enums[key].indexOf(value[key]) === -1) throw new Error('invalid_draft');
    });
    return value;
  }
  function mount(doc, location, config) {
    if (!eligible(config, location)) return null;
    var lang = copy[config.language] ? config.language : 'en', proof = null, busy = false, generation = 0;
    var stylesheet = doc.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/assets/css/customer-assistant.css';
    (doc.head || doc.body).appendChild(stylesheet);
    var panel = doc.createElement('section');
    panel.setAttribute('aria-label','LAVAALL Assistant');
    panel.className = 'customer-assistant';
    function createElement(tag, text) {
      var n = doc.createElement(tag);
      if (text !== undefined) n.textContent = text;
      return n;
    }
    panel.appendChild(createElement('h2','LAVAALL Assistant'));
    var first = createElement('p'), notice = createElement('p'), status = createElement('p');
    status.setAttribute('role','status');
    var log = createElement('div');
    log.className = 'customer-assistant-log';
    log.setAttribute('role','log');
    log.setAttribute('aria-live','polite');
    log.setAttribute('aria-label','Conversation');
    log.appendChild(first);
    panel.appendChild(log);
    panel.appendChild(notice);
    var languageLabel = createElement('label');
    var languages = createElement('select');
    languages.setAttribute('aria-label','Language / Langue / Idioma');
    ['en','fr','pt'].forEach(function (l) {
      var o = createElement('option', l.toUpperCase());
      o.value = l;
      languages.appendChild(o);
    });
    languages.value = lang;
    languageLabel.appendChild(languages);
    panel.appendChild(languageLabel);
    var questions = createElement('ul');
    panel.appendChild(questions);
    var composer = createElement('form');
    composer.className = 'customer-assistant-composer';
    var composerLabel = createElement('label'), composerText = createElement('span'), composerInput = createElement('textarea'), ask = createElement('button');
    composerLabel.appendChild(composerText);
    composerLabel.appendChild(composerInput);
    composerInput.maxLength = 2000;
    composerInput.required = true;
    ask.type = 'submit';
    composer.appendChild(composerLabel);
    composer.appendChild(ask);
    panel.appendChild(composer);
    var form = createElement('form'), inputs = {}, fieldLabels = {};
    var corrections = createElement('details'), correctionsTitle = createElement('summary');
    corrections.className = 'customer-assistant-fields';
    corrections.appendChild(correctionsTitle);
    form.appendChild(corrections);
    fields.forEach(function (key) {
      var label = createElement('label'), labelText = createElement('span');
      label.appendChild(labelText);
      fieldLabels[key] = labelText;
      var input = createElement(key === 'message' ? 'textarea' : 'input');
      input.name = key;
      input.required = key === 'name' || key === 'phone';
      if (key === 'phone') input.type = 'tel';
      if (key === 'email') input.type = 'email';
      label.appendChild(input);
      corrections.appendChild(label);
      inputs[key] = input;
    });
    var review = createElement('button'), send = createElement('button'), edit = createElement('button');
    review.type = 'submit';
    send.type = 'button';
    edit.type = 'button';
    send.disabled = true;
    form.appendChild(review);
    panel.appendChild(form);
    var details = createElement('dl');
    details.hidden = true;
    panel.appendChild(details);
    var summaryPrivacy = createElement('a','Privacy notice'); summaryPrivacy.href = '/privacy.html'; panel.appendChild(summaryPrivacy);
    panel.appendChild(edit);
    panel.appendChild(send);
    panel.appendChild(status);
    panel.appendChild(createElement('p',"We're reachable 24/7 on WhatsApp and email"));
    panel.appendChild(createElement('p','Messages are accepted anytime; the team is not staffed continuously.'));
    var email = createElement('a','support@lavaall.com');
    email.href = 'mailto:support@lavaall.com';
    panel.appendChild(email);
    var whatsapp = createElement('a',' WhatsApp +1 (737) 704-4182');
    whatsapp.href = 'https://wa.me/17377044182';
    whatsapp.rel = 'noopener noreferrer';
    panel.appendChild(whatsapp);
    var privacy = createElement('a','Privacy notice');
    privacy.href = '/privacy.html';
    panel.appendChild(privacy);
    function renderLanguage() {
      var c = copy[lang];
      var chrome = {
        en:['Your message','Ask assistant','Review or correct inquiry details','Privacy notice'], fr:['Votre message','Demander à l’assistant','Vérifier ou modifier les coordonnées','Confidentialité'], pt:['A sua mensagem','Perguntar ao assistente','Rever ou corrigir os dados do pedido','Privacidade']
      }[lang];
      composerText.textContent = chrome[0];
      composerInput.setAttribute('aria-label', chrome[0]);
      ask.textContent = chrome[1];
      correctionsTitle.textContent = chrome[2];
      privacy.textContent = chrome[3];
      summaryPrivacy.textContent = chrome[3];
      fields.forEach(function (key, index) {
        fieldLabels[key].textContent = labels[lang][index] + (key === 'name' || key === 'phone' ? ' *' : '');
      });
      first.textContent = c.first;
      notice.textContent = c.notice;
      review.textContent = c.review;
      send.textContent = c.send;
      edit.textContent = c.edit;
      questions.textContent = '';
      c.questions.forEach(function (q) {
        var item = createElement('li'), suggestion = createElement('button', q);
        suggestion.type = 'button';
        suggestion.addEventListener('click', function () {
          return sendTextTurn(q);
        });
        item.appendChild(suggestion);
        questions.appendChild(item);
      });
    }
    function invalidateReview() {
      generation++;
      proof = null;
      send.disabled = true;
      details.hidden = true;
      details.textContent = '';
    }
    function currentFields() {
      var draft = {};
      fields.forEach(function (key) {
        draft[key] = inputs[key].value;
      });
      return draft;
    }
    async function sendTextTurn(text) {
      text = String(text || '').trim();
      if (!text || busy || text.length>2000) return;
      invalidateReview();
      status.textContent = '';
      var current = generation;
      busy = true;
      ask.disabled = true;
      review.disabled = true;
      log.appendChild(createElement('p', text));
      try {
        var result = await config.transport('turn', {
          text:text, fields:currentFields()
        });
        if (current !== generation) return;
        log.appendChild(createElement('p', result && typeof result.text === 'string' ? result.text.slice(0, 4000) : copy[lang].answer));
        if (result && result.fields !== undefined) {
          var updates = validatePartialDraft(result.fields);
          Object.keys(updates).forEach(function (key) { inputs[key].value = updates[key]; });
        }
        summary(currentFields(), lang).forEach(function (row) {
          details.appendChild(createElement('dt', labels[lang][fields.indexOf(row.field)]));
          details.appendChild(createElement('dd', row.value));
        });
        details.hidden = false;
        composerInput.value = '';
        composerInput.focus();
      }
      catch (_) {
        status.textContent = copy[lang].disabled;
      }
      finally {
        busy = false;
        ask.disabled = false;
        review.disabled = false;
      }
    }
    composerInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {event.preventDefault(); return sendTextTurn(composerInput.value);}
    });
    composer.addEventListener('submit', function (event) {
      event.preventDefault();
      return sendTextTurn(composerInput.value);
    });
    form.addEventListener('input', invalidateReview);
    form.addEventListener('invalid', function (event) {
      corrections.open = true;
      if (event.target && typeof event.target.focus === 'function') event.target.focus();
    }, true);
    languages.addEventListener('change', function () {
      lang = languages.value;
      invalidateReview();
      renderLanguage();
    });
    edit.addEventListener('click', function () {
      invalidateReview();
      corrections.open = true;
      inputs.name.focus();
    });
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (busy) return;
      invalidateReview();
      status.textContent = '';
      var current = generation;
      busy = true;
      review.disabled = true;
      try {
        var draft = {};
        fields.forEach(function (key) {
          draft[key] = inputs[key].value;
        });
        // Injected local adapter owns synthetic session/draft setup. No browser proof is passed to an agent.
        var result = await config.transport('review', {
          fields:draft
        });
        if (current !== generation) return;
        if (!result || !result.token || !result.draftId || !result.csrf ||
            !result.sessionId || !result.idempotencyKey || !result.summary) {
          throw new Error('review_unavailable');
        }
        validatePartialDraft(result.summary);
        var proofFields = ['token', 'draftId', 'csrf', 'sessionId', 'idempotencyKey'];
        if (proofFields.some(function (key) {
          return typeof result[key] !== 'string' || !/^[a-f0-9]{64}$/.test(result[key]);
        })) {
          throw new Error('review_unavailable');
        }
        proof = {
          token:result.token, draftId:result.draftId, csrf:result.csrf, sessionId:result.sessionId, idempotencyKey:result.idempotencyKey
        };
        summary(result.summary, lang).forEach(function (row) {
          details.appendChild(createElement('dt', labels[lang][fields.indexOf(row.field)]));
          details.appendChild(createElement('dd', row.value));
        });
        details.hidden = false;
        send.disabled = false;
        status.textContent = '';
      }
      catch (_) {
        status.textContent = copy[lang].disabled;
      }
      finally {
        busy = false;
        review.disabled = false;
      }
    });
    send.addEventListener('click', async function () {
      if (busy || !proof) return;
      var consent = proof;
      proof = null;
      busy = true;
      send.disabled = true;
      review.disabled = true;
      try {
        var result = await config.transport('confirm', consent);
        status.textContent = result && (result.status === 'accepted' || result.status === 'submitted') ? copy[lang].accepted : copy[lang].unknown;
      }
      catch (_) {
        status.textContent = copy[lang].unknown;
      }
      finally{
        busy = false;
        review.disabled = false;
      }
    });
    renderLanguage();
    doc.body.appendChild(panel);
    return panel;
  }
  var api = {
    eligible:eligible, summary:summary, copy:copy, fields:fields, scaffold:scaffold, validatePartialDraft:validatePartialDraft, mount:mount
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) mount(root.document, root.location, root.LAVAALL_ASSISTANT_LOCAL_TEST);
})(typeof window !== 'undefined' ? window : globalThis);
