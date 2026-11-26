/* LAVAALL OS Jarvis: a voice call with the OS, from any page.
   The orb starts a WebRTC call with OpenAI Realtime using a short-lived secret from /ops/voice/session
   (the real key stays on the server). OpenAI only listens and speaks: anything real goes through the
   ask_os tool, answered here by /ops/harness/chat with the model OS.routeAsk picks, and navigate opens
   OS pages. Nothing starts until the founder taps the orb. No audio or transcript is stored. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;
  var VIEWS = ['home', 'build', 'progress', 'recap', 'inbox', 'calendar', 'saved', 'talk', 'harness', 'decisions', 'outreach', 'spend', 'notes', 'brain', 'desks', 'routines', 'council', 'settings'];

  var pc = null, dc = null, mic = null, audio = null, live = false, busy = false;
  var you = '', jarvis = '';

  function el(id) { return document.getElementById(id); }

  function setState(state, line) {
    var orb = el('jv-orb'), cap = el('jv-cap');
    if (orb) orb.setAttribute('data-state', state);
    if (orb) orb.setAttribute('aria-pressed', live ? 'true' : 'false');
    if (orb) orb.setAttribute('aria-label', live ? 'End call with Jarvis' : 'Call Jarvis');
    if (cap && line !== undefined) cap.textContent = line;
    var panel = el('jv-panel');
    if (panel) panel.hidden = !live && state !== 'error';
  }

  function post(url, body) {
    return window.fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, body: data || {} }; });
    });
  }

  function send(evt) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(evt)); }

  function toolResult(callId, output) {
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: String(output).slice(0, 6000) } });
    send({ type: 'response.create' });
  }

  function runTool(name, callId, argsText) {
    var args = {};
    try { args = JSON.parse(argsText || '{}'); } catch (e) { args = {}; }
    if (name === 'navigate') {
      var page = VIEWS.indexOf(args.page) !== -1 ? args.page : 'home';
      OS.go(page);
      toolResult(callId, 'Opened ' + page + '.');
      return;
    }
    if (name === 'ask_os') {
      var q = String(args.request || '').slice(0, 8000);
      var model = OS.routeAsk ? OS.routeAsk(q) : 'claude';
      setState('thinking', 'Asking ' + model + '…');
      post('/ops/harness/chat', { project: 'lavaall', harness: model, message: q }).then(function (r) {
        var text = r.ok ? (r.body.reply || 'It came back empty.') : (r.body.message || r.body.error || 'The OS could not answer (HTTP ' + r.status + ').');
        toolResult(callId, text);
      }).catch(function () { toolResult(callId, 'The OS could not be reached.'); });
      return;
    }
    if (name === 'save_memory') {
      var t = String(args.text || '').slice(0, 2000);
      if (!t.trim()) { toolResult(callId, 'Nothing to save.'); return; }
      post('/ops/os/saved', { op: 'memory.add', text: t, tags: args.recap === true ? ['jarvis', 'recap'].concat(OS.business && OS.business() !== 'all' ? [OS.business()] : []) : ['jarvis'] }).then(function (r) {
        toolResult(callId, r.ok ? 'Saved to Memory.' : (r.body.message || 'Could not save it.'));
      }).catch(function () { toolResult(callId, 'Could not save it.'); });
      return;
    }
    toolResult(callId, 'Unknown tool.');
  }

  function onEvent(e) {
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    switch (m.type) {
      case 'input_audio_buffer.speech_started': you = ''; setState('listening', ''); break;
      case 'conversation.item.input_audio_transcription.delta': you += m.delta || ''; setState('listening', you); break;
      case 'conversation.item.input_audio_transcription.completed': you = m.transcript || you; setState('thinking', you); break;
      case 'response.created': jarvis = ''; break;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': jarvis += m.delta || ''; setState('speaking', jarvis); break;
      case 'response.function_call_arguments.done': runTool(m.name, m.call_id, m.arguments); break;
      case 'response.done': if (live) setState('listening', jarvis || 'Listening…'); break;
      case 'error': setState('error', (m.error && (m.error.message || m.error.code)) || 'Voice error.'); break;
    }
  }

  function stop(message) {
    live = false;
    try { if (dc) dc.close(); } catch (e) { /* closed */ }
    try { if (pc) pc.close(); } catch (e) { /* closed */ }
    try { if (mic) mic.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* stopped */ }
    pc = dc = mic = null;
    setState(message ? 'error' : 'idle', message || '');
  }

  function start() {
    if (busy) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error', 'This browser cannot make voice calls.');
      return;
    }
    busy = true;
    live = true;
    setState('thinking', 'Connecting…');
    var voice = 'marin';
    try { voice = localStorage.getItem('os-jarvis-voice') || 'marin'; } catch (e) { /* default */ }
    post('/ops/voice/session', { voice: voice }).then(function (s) {
      if (!s.ok || !s.body.value) throw new Error(s.body.message || s.body.error || 'Voice is not available.');
      pc = new RTCPeerConnection();
      pc.ontrack = function (ev) { audio.srcObject = ev.streams[0]; audio.play().catch(function () {}); };
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mic = stream;
        pc.addTrack(stream.getAudioTracks()[0], stream);
        dc = pc.createDataChannel('oai-events');
        dc.onmessage = onEvent;
        dc.onopen = function () { setState('listening', 'Listening… say hi to Jarvis.'); };
        return pc.createOffer();
      }).then(function (offer) {
        return pc.setLocalDescription(offer).then(function () {
          return window.fetch('https://api.openai.com/v1/realtime/calls?model=' + encodeURIComponent(s.body.model || 'gpt-realtime'), {
            method: 'POST', body: offer.sdp,
            headers: { Authorization: 'Bearer ' + s.body.value, 'Content-Type': 'application/sdp' }
          });
        });
      }).then(function (ans) {
        if (!ans.ok) throw new Error('The voice service refused the call (HTTP ' + ans.status + ').');
        return ans.text();
      }).then(function (sdp) { return pc.setRemoteDescription({ type: 'answer', sdp: sdp }); });
    }).catch(function (err) {
      var msg = err && err.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it for this site and try again.' : (err && err.message) || 'Voice call failed.';
      stop(msg);
    }).then(function () { busy = false; });
  }

  OS.jarvisHtml = function () {
    return '<div class="jv" id="jv">' +
      '<div class="jv-panel" id="jv-panel" hidden><div class="jv-h"><b>Jarvis</b><span class="jv-sub">voice · LAVAALL OS</span></div>' +
      '<p class="jv-cap" id="jv-cap" aria-live="polite"></p></div>' +
      '<button type="button" class="jv-orb" id="jv-orb" data-state="idle" aria-pressed="false" aria-label="Call Jarvis" title="Call Jarvis"><span></span></button>' +
      '<audio id="jv-audio" autoplay></audio></div>';
  };

  OS.mountJarvis = function (host) {
    if (!host || el('jv')) return;
    host.insertAdjacentHTML('beforeend', OS.jarvisHtml());
    audio = el('jv-audio');
    el('jv-orb').addEventListener('click', function () { if (live) stop(); else start(); });
  };
  OS.jarvis = { start: start, stop: stop, runTool: runTool, onEvent: onEvent, VIEWS: VIEWS };
  void esc;
})();
