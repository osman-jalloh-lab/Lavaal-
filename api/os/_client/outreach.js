/* LAVAALL OS Outreach: a kanban by stage (Drafted / Approved / Sent / Replied / Bounced).
   View only. Nothing is sent from here and nothing is saved: dragging a card moves it on screen
   and it snaps back on the next load. Reads data.outreach, which is null until a read path from the
   daily Sierra Leone leads routine exists. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var STAGES = ['Drafted', 'Approved', 'Sent', 'Replied', 'Bounced'];
  var DOT = { Drafted: 'wait', Approved: 'wait', Sent: 'ok', Replied: 'ok', Bounced: 'bad' };

  function stageOf(lead) {
    var s = String(lead && lead.stage || '').toLowerCase();
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].toLowerCase() === s) return STAGES[i];
    return '';
  }

  function cardHtml(lead) {
    var meta = [lead.kind, lead.place].filter(Boolean).join(' · ');
    return '<div class="kc" draggable="true" data-id="' + esc(lead.id) + '"><b>' + esc(lead.name) + '</b>' +
      (meta ? '<small>' + esc(meta) + '</small>' : '') +
      (lead.note ? '<div class="m"><span class="pill' + (stageOf(lead) === 'Bounced' ? ' bad' : '') + '">' + esc(lead.note) + '</span></div>' : '') + '</div>';
  }

  function board(leads) {
    var byStage = {};
    STAGES.forEach(function (s) { byStage[s] = []; });
    (leads || []).forEach(function (l) { var s = stageOf(l); if (s) byStage[s].push(l); });
    return '<div class="kb">' + STAGES.map(function (s) {
      var n = leads ? byStage[s].length : null;
      return '<div class="col" data-stage="' + s + '"><h4><span class="dot ' + DOT[s] + '"></span>' + s +
        '<span class="num" data-count>' + (n === null ? '—' : n) + '</span></h4>' +
        (leads ? byStage[s].map(cardHtml).join('') : '') + '</div>';
    }).join('') + '</div>';
  }

  OS.registerView('outreach', {
    render: function (ctx) {
      var leads = ctx.data.outreach;
      var head = '<div class="ph"><div><h1>Outreach</h1><p>Leads by stage. View only; nothing is sent from here.</p></div></div>';
      var note = leads === null
        ? '<div class="card mb">' + OS.empty('No outreach leads are loaded.', 'outreach') + '</div>'
        : '';
      return head + note + board(leads);
    },
    mount: function (root, ctx) {
      var dragged = null;
      function recount() {
        Array.prototype.forEach.call(root.querySelectorAll('.col'), function (col) {
          var c = col.querySelector('[data-count]');
          if (c && ctx.data.outreach) c.textContent = col.querySelectorAll('.kc').length;
        });
      }
      root.addEventListener('dragstart', function (e) {
        var c = e.target.closest ? e.target.closest('.kc') : null;
        if (!c) return;
        dragged = c; c.classList.add('drag');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.getAttribute('data-id') || ''); }
      });
      root.addEventListener('dragend', function () { if (dragged) dragged.classList.remove('drag'); dragged = null; });
      root.addEventListener('dragover', function (e) {
        var col = e.target.closest ? e.target.closest('.col') : null;
        if (col && dragged) { e.preventDefault(); col.classList.add('over'); }
      });
      root.addEventListener('dragleave', function (e) {
        var col = e.target.closest ? e.target.closest('.col') : null;
        if (col) col.classList.remove('over');
      });
      root.addEventListener('drop', function (e) {
        var col = e.target.closest ? e.target.closest('.col') : null;
        if (!col || !dragged) return;
        e.preventDefault();
        col.classList.remove('over');
        col.appendChild(dragged);
        recount();
        OS.toast('Moved on screen only. Nothing was saved or sent.');
      });
    }
  });
})();
