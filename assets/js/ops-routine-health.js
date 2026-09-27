// Founder dashboard strip. Reads GET /ops/api/ceo-bridge/routine-health.
// Snapshot text is untrusted. Render with textContent only.
(function () {
  var root = document.getElementById('routine-health');
  if (!root) return;
  var endpoint = root.getAttribute('data-endpoint') || '/ops/api/ceo-bridge/routine-health';

  function toneClass(tone) {
    if (tone === 'ok') return 'rh-dot rh-ok';
    if (tone === 'bad') return 'rh-dot rh-bad';
    if (tone === 'run') return 'rh-dot rh-run';
    return 'rh-dot rh-warn';
  }

  function field(role) {
    return root.querySelector('[data-role="' + role + '"]');
  }

  function render(view) {
    var state = field('state');
    var list = field('list');
    var stale = field('stale');
    var emptyNote = field('empty');
    if (!state || !list) return;
    list.textContent = '';
    if (!view || view.empty) {
      state.textContent = 'No data yet';
      if (stale) stale.hidden = true;
      if (emptyNote) emptyNote.hidden = true;
      return;
    }
    state.textContent = view.checkedLabel ? ('Checked ' + view.checkedLabel) : 'Checked';
    if (stale) stale.hidden = !view.stale;
    var routines = Array.isArray(view.routines) ? view.routines : [];
    if (emptyNote) emptyNote.hidden = routines.length > 0;
    routines.forEach(function (row) {
      var item = document.createElement('details');
      item.className = 'routine-health-item';
      var summary = document.createElement('summary');
      var dot = document.createElement('span');
      dot.className = toneClass(row && row.tone);
      dot.setAttribute('aria-hidden', 'true');
      var slug = document.createElement('span');
      slug.className = 'rh-slug';
      slug.textContent = row && row.slug ? String(row.slug) : '';
      var status = document.createElement('span');
      status.className = 'rh-status';
      status.textContent = row && row.status ? String(row.status) : '';
      var time = document.createElement('time');
      time.className = 'rh-time';
      if (row && row.lastRunAt) time.setAttribute('datetime', String(row.lastRunAt));
      time.textContent = row && row.lastRunLabel ? String(row.lastRunLabel) : 'no run';
      var reason = document.createElement('p');
      reason.className = 'rh-reason';
      reason.textContent = row && row.reason ? String(row.reason) : 'No reason recorded';
      summary.appendChild(dot);
      summary.appendChild(slug);
      summary.appendChild(status);
      summary.appendChild(time);
      item.appendChild(summary);
      item.appendChild(reason);
      list.appendChild(item);
    });
  }

  fetch(endpoint, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  }).then(function (res) {
    if (!res.ok) return null;
    return res.json();
  }).then(function (view) {
    if (view && view.ok) render(view);
  }).catch(function () {});
}());
