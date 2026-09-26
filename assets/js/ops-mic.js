// Shared /ops mic. Browser SpeechRecognition only. Never sends the form.
(function (root) {
  function appendTranscript(current, spoken, maxLength) {
    const base = current ? String(current).replace(/\s+$/, '') : '';
    const next = base ? `${base} ${spoken}` : spoken;
    if (!Number.isFinite(maxLength) || maxLength < 1) return next;
    return next.slice(0, maxLength);
  }

  function bindSpeechMic(opts) {
    const box = opts && opts.box;
    const mic = opts && opts.mic;
    const status = opts && opts.status;
    const maxLength = opts && Number.isFinite(opts.maxLength) ? opts.maxLength : 2000;
    const hideIfMissing = Boolean(opts && opts.hideIfMissing);
    const Speech = root.SpeechRecognition || root.webkitSpeechRecognition;

    function showStatus(text, show) {
      if (!status) return;
      status.hidden = !show;
      status.textContent = text || '';
    }

    if (!mic || !box) return;
    if (!Speech) {
      if (hideIfMissing) {
        mic.hidden = true;
        return;
      }
      mic.disabled = true;
      showStatus('Voice is not available in this browser. Type instead.', true);
      return;
    }

    let rec = null;
    let listening = false;

    function setListening(on) {
      listening = on;
      mic.setAttribute('aria-pressed', on ? 'true' : 'false');
      mic.textContent = on ? 'Listening…' : 'Mic';
    }

    mic.addEventListener('click', () => {
      if (listening && rec) {
        try { rec.stop(); } catch (err) { /* already stopping */ }
        return;
      }
      rec = new Speech();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event) => {
        const result = event.results && event.results[0] && event.results[0][0]
          ? String(event.results[0][0].transcript || '').trim()
          : '';
        if (!result) return;
        box.value = appendTranscript(box.value, result, maxLength);
        showStatus('', false);
      };
      rec.onerror = (event) => {
        const err = event && event.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          showStatus('Microphone permission denied. Allow the mic, or type instead.', true);
        } else if (err === 'no-speech') {
          showStatus('No speech heard. Tap Mic and try again.', true);
        } else {
          showStatus('Voice did not work. Type instead.', true);
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      try {
        rec.start();
        setListening(true);
        showStatus('Listening…', true);
      } catch (err) {
        showStatus('Voice did not start. Type instead.', true);
        setListening(false);
      }
    });
  }

  root.lavaallBindSpeechMic = bindSpeechMic;
}(typeof window !== 'undefined' ? window : globalThis));
