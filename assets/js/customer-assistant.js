/* Preview text chat and local TEST ONLY UI. No vendor script or credentials. Optional browser speech
 * is default-off and tap-only; browser vendors may process audio on their servers. */
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
    if (config && config.CHAT_ENABLED === true && config.localTestStub !== true &&
        config.environment === 'preview' && location.pathname === '/' &&
        typeof config.transport === 'function') return true;
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
  function speechLocale(lang) {
    // UI languages are en, fr and pt. Portuguese copy is European, so pt defaults to pt-PT.
    // Explicit BCP-47 aliases keep a later pt-BR override from needing a rewrite.
    return {
      en:'en-US', 'en-US':'en-US',
      fr:'fr-FR', 'fr-FR':'fr-FR',
      pt:'pt-PT', 'pt-PT':'pt-PT', 'pt-BR':'pt-BR'
    }[lang] || null;
  }
  function browserVoiceSupported(browser) {
    browser = browser || {};
    return {
      recognition: typeof browser.SpeechRecognition === 'function' || typeof browser.webkitSpeechRecognition === 'function',
      synthesis: !!(browser.speechSynthesis && typeof browser.speechSynthesis.speak === 'function' &&
        typeof browser.speechSynthesis.cancel === 'function' && typeof browser.SpeechSynthesisUtterance === 'function')
    };
  }
  function browserVoiceEnabled(config, location) {
    return eligible(config, location) && config.localTestStub === true &&
      config.environment === 'test' && config.CHAT_BROWSER_VOICE_ENABLED === true;
  }
  function speechVoice(voices, lang) {
    var locale = speechLocale(lang);
    if (!locale) return null;
    voices = Array.prototype.slice.call(voices || []);
    function matching(tag) {
      return voices.find(function (voice) { return String(voice.lang).toLowerCase() === tag.toLowerCase(); });
    }
    return matching(locale) || (locale === 'pt-PT' && matching('pt-BR')) || (locale === 'pt-BR' && matching('pt-PT')) || null;
  }
  // Small adapter so a later self-hosted TTS can replace speechSynthesis without rewriting the UI.
  // This default only wraps the browser API. It must not fetch remote audio or load a model.
  function createBrowserTtsAdapter(browser) {
    browser = browser || {};
    var synthesis = browser.speechSynthesis;
    var supported = !!(synthesis && typeof synthesis.speak === 'function' &&
      typeof synthesis.cancel === 'function' && typeof browser.SpeechSynthesisUtterance === 'function');
    return {
      supported: supported,
      getVoices: function () {
        return supported && typeof synthesis.getVoices === 'function' ? (synthesis.getVoices() || []) : [];
      },
      speak: function (text, options) {
        options = options || {};
        if (!supported) return null;
        this.cancel();
        var utterance = new browser.SpeechSynthesisUtterance(text);
        if (options.voice) utterance.voice = options.voice;
        utterance.lang = (options.voice && options.voice.lang) || options.lang || '';
        if (options.onend) utterance.onend = options.onend;
        if (options.onerror) utterance.onerror = options.onerror;
        synthesis.speak(utterance);
        return utterance;
      },
      cancel: function () {
        if (!supported) return;
        try { synthesis.cancel(); } catch (_) { /* Text remains usable. */ }
      }
    };
  }
  var voiceCopy = {
    en: {
      mic:'Use microphone', stop:'Stop microphone', speaker:'Read replies aloud',
      hint:'Optional browser speech, not ElevenLabs voice. Tap Mic to dictate, then review the text and tap Ask. Your browser vendor may process speech on its servers; Chrome sends audio to Google. You can keep using text.',
      ready:'Microphone is off. Text input is always available.', listening:'Listening… Tap Stop microphone to cancel.',
      inserted:'Dictation added. Review the text and tap Ask to send.', unavailable:'Speech recognition is unavailable in this browser. Please type your message.',
      denied:'Microphone permission was denied. Please type your message.', failed:'Speech recognition could not start or finish. Please type your message.',
      noSpeaker:'Reading aloud is unavailable. Replies remain available as text.', speechFailed:'Reading aloud failed. Please read the text reply.'
    },
    fr: {
      mic:'Utiliser le microphone', stop:'Arrêter le microphone', speaker:'Lire les réponses à voix haute',
      hint:'Parole du navigateur facultative, sans voix ElevenLabs. Touchez le micro pour dicter, puis vérifiez le texte et appuyez sur Demander. Le fournisseur du navigateur peut traiter la parole sur ses serveurs ; Chrome envoie l’audio à Google. Vous pouvez continuer par écrit.',
      ready:'Le microphone est éteint. La saisie de texte reste disponible.', listening:'Écoute en cours… Touchez Arrêter le microphone pour annuler.',
      inserted:'Dictée ajoutée. Vérifiez le texte et appuyez sur Demander pour envoyer.', unavailable:'La reconnaissance vocale est indisponible dans ce navigateur. Saisissez votre message.',
      denied:'L’accès au microphone a été refusé. Saisissez votre message.', failed:'La reconnaissance vocale n’a pas pu démarrer ou se terminer. Saisissez votre message.',
      noSpeaker:'La lecture vocale est indisponible. Les réponses restent accessibles par écrit.', speechFailed:'La lecture vocale a échoué. Lisez la réponse écrite.'
    },
    pt: {
      mic:'Usar microfone', stop:'Parar microfone', speaker:'Ler respostas em voz alta',
      hint:'Voz opcional do navegador, sem voz ElevenLabs. Toque no microfone para ditar, depois reveja o texto e toque em Perguntar. O fornecedor do navegador pode processar a fala nos seus servidores; o Chrome envia o áudio ao Google. Pode continuar por texto.',
      ready:'O microfone está desligado. Pode sempre escrever.', listening:'A ouvir… Toque em Parar microfone para cancelar.',
      inserted:'Ditado adicionado. Reveja o texto e toque em Perguntar para enviar.', unavailable:'O reconhecimento de voz está indisponível neste navegador. Escreva a sua mensagem.',
      denied:'A permissão do microfone foi recusada. Escreva a sua mensagem.', failed:'O reconhecimento de voz não conseguiu iniciar ou terminar. Escreva a sua mensagem.',
      noSpeaker:'A leitura em voz alta está indisponível. As respostas continuam disponíveis por texto.', speechFailed:'A leitura em voz alta falhou. Leia a resposta escrita.'
    }
  };
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
    var voiceOn = browserVoiceEnabled(config, location), supported, mic, speaker, voiceHint, voiceStatus;
    var recognition = null, speaking = false, voiceState = 'ready', utterance = null;
    function renderVoice() {
      if (!voiceOn) return;
      var v = voiceCopy[lang];
      mic.textContent = recognition ? v.stop : v.mic;
      mic.setAttribute('aria-label', mic.textContent);
      mic.setAttribute('aria-pressed', String(!!recognition));
      mic.disabled = !supported.recognition || busy;
      speaker.textContent = v.speaker;
      speaker.setAttribute('aria-label', v.speaker);
      speaker.setAttribute('aria-pressed', String(speaking));
      speaker.disabled = !supported.synthesis;
      voiceHint.textContent = v.hint;
      voiceStatus.textContent = v[supported.recognition ? voiceState : 'unavailable'] + (supported.synthesis ? '' : ' ' + v.noSpeaker);
    }
    function cancelSpeech() {
      if (!tts || !tts.supported) return;
      utterance = null;
      tts.cancel();
    }
    function stopRecognition() {
      if (!recognition) return;
      var active = recognition;
      recognition = null; // Ignore late results/errors from a cancelled session.
      try { active.abort(); } catch (_) { /* Already stopped. */ }
      voiceState = 'ready';
      renderVoice();
    }
    function speakReply(text) {
      if (!speaking || !tts || !tts.supported) return;
      try {
        var chosen = speechVoice(tts.getVoices(), lang);
        var next = tts.speak(text, {
          lang: chosen ? chosen.lang : speechLocale(lang),
          voice: chosen,
          onerror: function () {
            if (utterance !== next) return;
            utterance = null;
            voiceState = 'speechFailed';
            renderVoice();
          },
          onend: function () { if (utterance === next) utterance = null; }
        });
        utterance = next;
      } catch (_) {
        voiceState = 'speechFailed';
        renderVoice();
      }
    }
    var tts = null;
    if (voiceOn) {
      supported = browserVoiceSupported(root);
      tts = createBrowserTtsAdapter(root);
      mic = createElement('button');
      mic.type = 'button';
      mic.className = 'customer-assistant-mic';
      speaker = createElement('button');
      speaker.type = 'button';
      speaker.className = 'customer-assistant-speaker';
      voiceHint = createElement('p');
      voiceHint.className = 'customer-assistant-voice-hint';
      voiceStatus = createElement('p');
      voiceStatus.className = 'customer-assistant-voice-status';
      voiceStatus.setAttribute('role', 'status');
      composer.appendChild(mic);
      composer.appendChild(speaker);
      composer.appendChild(voiceHint);
      composer.appendChild(voiceStatus);
      mic.addEventListener('click', function () {
        if (busy || !supported.recognition) return;
        if (recognition) { stopRecognition(); return; }
        cancelSpeech();
        try {
          // Only this explicit tap constructs recognition or requests permission.
          var Recognition = typeof root.SpeechRecognition === 'function' ? root.SpeechRecognition : root.webkitSpeechRecognition;
          var active = new Recognition(), consumed = {};
          recognition = active;
          active.lang = speechLocale(lang);
          active.continuous = false;
          active.interimResults = false;
          active.onresult = function (event) {
            if (recognition !== active) return;
            var parts = [];
            for (var i = event.resultIndex || 0; i < event.results.length; i++) {
              var result = event.results[i];
              if (result.isFinal && !consumed[i] && result[0] && typeof result[0].transcript === 'string') {
                consumed[i] = true;
                parts.push(result[0].transcript);
              }
            }
            var transcript = parts.join(' ').trim();
            if (!transcript) return;
            var existing = composerInput.value;
            composerInput.value = (existing + (existing && !/\s$/.test(existing) ? ' ' : '') + transcript).slice(0, 2000);
            invalidateReview();
            voiceState = 'inserted';
            renderVoice();
            // Dictation only edits the composer. Never call transport or submit.
          };
          active.onerror = function (event) {
            if (recognition !== active) return;
            stopRecognition();
            voiceState = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'denied' : 'failed';
            renderVoice();
          };
          active.onend = function () {
            if (recognition !== active) return;
            recognition = null;
            if (voiceState === 'listening') voiceState = 'ready';
            renderVoice();
          };
          voiceState = 'listening';
          renderVoice();
          active.start();
        } catch (_) {
          stopRecognition();
          voiceState = 'failed';
          renderVoice();
        }
      });
      speaker.addEventListener('click', function () {
        if (!supported.synthesis) return;
        speaking = !speaking; // Opt in for subsequent replies; never speak on mount/toggle.
        if (!speaking) cancelSpeech();
        renderVoice();
      });
    }
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
      renderVoice();
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
      first.textContent = config.localTestStub === true ? c.first : {
        en: "I'm LAVAALL Assistant, an AI assistant. I can help with Technology questions or prepare an inquiry for your review.",
        fr: 'Je suis LAVAALL Assistant, un assistant IA. Je peux répondre aux questions sur la technologie ou préparer une demande à vérifier.',
        pt: 'Sou LAVAALL Assistant, um assistente de IA. Posso ajudar com perguntas sobre tecnologia ou preparar um pedido para a sua revisão.'
      }[lang];
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
      stopRecognition();
      invalidateReview();
      status.textContent = '';
      var current = generation;
      busy = true;
      renderVoice();
      ask.disabled = true;
      review.disabled = true;
      log.appendChild(createElement('p', text));
      try {
        var result = await config.transport('turn', {
          text:text, fields:currentFields()
        });
        if (current !== generation) return;
        if ((!result || typeof result.text !== 'string') && config.localTestStub !== true) throw new Error('reply_unavailable');
        var replyText = result && typeof result.text === 'string' ? result.text.slice(0, 4000) : copy[lang].answer;
        log.appendChild(createElement('p', replyText));
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
        speakReply(replyText);
      }
      catch (_) {
        status.textContent = copy[lang].disabled;
      }
      finally {
        busy = false;
        renderVoice();
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
      stopRecognition();
      cancelSpeech();
      voiceState = 'ready';
      lang = copy[languages.value] ? languages.value : 'en';
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
      stopRecognition();
      invalidateReview();
      status.textContent = '';
      var current = generation;
      busy = true;
      renderVoice();
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
        renderVoice();
        review.disabled = false;
      }
    });
    send.addEventListener('click', async function () {
      if (busy || !proof) return;
      stopRecognition();
      var consent = proof;
      proof = null;
      busy = true;
      renderVoice();
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
        renderVoice();
        review.disabled = false;
      }
    });
    if (config.localTestStub !== true) {
      // Preview is text-only; inquiry delivery needs a separate explicit server opt-in.
      form.hidden = true;
      edit.hidden = true;
      send.hidden = true;
      summaryPrivacy.hidden = true;
    }
    renderLanguage();
    doc.body.appendChild(panel);
    return panel;
  }
  function createPreviewTransport(fetcher, browserCrypto) {
    var sessionPromise;
    async function post(action, body) {
      var response = await fetcher('/api/chat-inquiry?action=' + action, {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      var result = await response.json();
      if (!response.ok) throw new Error('chat_unavailable');
      return result;
    }
    return async function (action, payload) {
      if (action !== 'turn') throw new Error('text_only');
      if (!sessionPromise) sessionPromise = post('session', {});
      var session = await sessionPromise;
      if (!session || typeof session.sessionId !== 'string' || typeof session.csrf !== 'string') throw new Error('session_unavailable');
      if (!browserCrypto || typeof browserCrypto.getRandomValues !== 'function') throw new Error('random_unavailable');
      var bytes = browserCrypto.getRandomValues(new Uint8Array(32));
      var eventId = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return post('turn', {sessionId:session.sessionId, csrf:session.csrf, eventId:eventId, text:payload.text});
    };
  }
  async function boot(browser) {
    if (browser.LAVAALL_ASSISTANT_LOCAL_TEST) return mount(browser.document, browser.location, browser.LAVAALL_ASSISTANT_LOCAL_TEST);
    if (browser.location.pathname !== '/' || typeof browser.fetch !== 'function') return null;
    try {
      var response = await browser.fetch('/api/chat-inquiry?action=config', {method:'GET', credentials:'include', cache:'no-store'});
      if (!response.ok) return null;
      var config = await response.json();
      if (!config || config.CHAT_ENABLED !== true || config.environment !== 'preview') return null;
      config.localTestStub = false;
      config.CHAT_BROWSER_VOICE_ENABLED = false;
      config.transport = createPreviewTransport(browser.fetch.bind(browser), browser.crypto);
      return mount(browser.document, browser.location, config);
    } catch (_) { return null; }
  }
  var api = {
    eligible:eligible, summary:summary, copy:copy, fields:fields, scaffold:scaffold, validatePartialDraft:validatePartialDraft, mount:mount,
    speechLocale:speechLocale, speechVoice:speechVoice, browserVoiceSupported:browserVoiceSupported, browserVoiceEnabled:browserVoiceEnabled,
    createBrowserTtsAdapter:createBrowserTtsAdapter, createPreviewTransport:createPreviewTransport, boot:boot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (root.document) boot(root);
})(typeof window !== 'undefined' ? window : globalThis);
