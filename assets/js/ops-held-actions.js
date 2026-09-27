// Founder Confirm / Decline for held queued actions.
// Queued text is untrusted. This file never writes it with innerHTML.
(function () {
  var root = document.getElementById('held-actions');
  if (!root) return;
  var csrf = root.getAttribute('data-csrf') || '';

  function note(item, text) {
    var el = item.querySelector('[data-role="held-note"]');
    if (!el) {
      el = document.createElement('p');
      el.className = 'held-note';
      el.setAttribute('data-role', 'held-note');
      item.appendChild(el);
    }
    el.textContent = text;
  }

  function setBusy(buttons, busy) {
    Array.prototype.forEach.call(buttons, function (el) {
      el.disabled = busy;
    });
  }

  root.addEventListener('click', function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest('[data-held-action]') : null;
    if (!button || !root.contains(button)) return;
    var action = button.getAttribute('data-held-action');
    var endpoint = button.getAttribute('data-endpoint');
    var messageId = button.getAttribute('data-message-id');
    if (action !== 'confirm' && action !== 'decline') return;
    if (!endpoint || !messageId) return;
    var item = button.closest('.held-ok-item');
    var buttons = item ? item.querySelectorAll('button') : [button];
    setBusy(buttons, true);
    fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ csrf: csrf, messageId: messageId }),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    }).then(function (result) {
      if (!result.ok) {
        setBusy(buttons, false);
        if (item) note(item, 'Could not update that item. Reload and try again.');
        return;
      }
      if (item && item.parentNode) item.parentNode.removeChild(item);
      if (!root.querySelector('.held-ok-item')) root.hidden = true;
    }).catch(function () {
      setBusy(buttons, false);
      if (item) note(item, 'Could not update that item. Reload and try again.');
    });
  });
}());
