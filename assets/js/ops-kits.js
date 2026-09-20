document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('kits-search');
  const chips = document.querySelector('.kits-chips');
  const rows = Array.from(document.querySelectorAll('.kits-row'));
  const count = document.getElementById('kits-count');
  const empty = document.getElementById('kits-empty');
  const drawer = document.getElementById('kit-drawer');
  const layout = document.getElementById('kits-layout');
  const loading = document.getElementById('kits-loading');
  const form = document.getElementById('kits-sync-form');
  let status = '';

  function applyFilter() {
    const needle = search && search.value ? search.value.trim().toLowerCase() : '';
    let visible = 0;
    rows.forEach((row) => {
      const hay = row.getAttribute('data-search') || '';
      const rowStatus = row.getAttribute('data-status') || '';
      const show = (!needle || hay.indexOf(needle) !== -1) && (!status || rowStatus === status);
      row.hidden = !show;
      if (show) visible += 1;
    });
    if (count) count.textContent = visible + (visible === 1 ? ' kit' : ' kits');
    if (empty && rows.length) empty.hidden = visible !== 0;
  }

  function openDrawer(row) {
    if (!drawer || !row) return;
    rows.forEach((item) => item.classList.toggle('is-open', item === row));
    drawer.hidden = false;
    if (layout) layout.classList.add('has-drawer');
    const title = document.getElementById('kit-drawer-title');
    const nameNode = document.getElementById('kit-drawer-name');
    const statusNode = document.getElementById('kit-drawer-status');
    const dateNode = document.getElementById('kit-drawer-date');
    const emailNode = document.getElementById('kit-drawer-email');
    const notesNode = document.getElementById('kit-drawer-notes');
    if (title) title.textContent = row.getAttribute('data-kit') || '';
    if (nameNode) nameNode.textContent = row.getAttribute('data-name') || '';
    if (statusNode) statusNode.textContent = row.getAttribute('data-status') || '';
    if (dateNode) dateNode.textContent = row.getAttribute('data-date') || '—';
    if (emailNode) emailNode.textContent = row.getAttribute('data-email') || '—';
    if (notesNode) notesNode.textContent = row.getAttribute('data-notes') || '—';
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    if (layout) layout.classList.remove('has-drawer');
    rows.forEach((row) => row.classList.remove('is-open'));
  }

  if (search) search.addEventListener('input', applyFilter);
  if (chips) {
    chips.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-status]');
      if (!button) return;
      status = button.getAttribute('data-status') || '';
      chips.querySelectorAll('button').forEach((item) => {
        item.classList.toggle('is-on', item === button);
      });
      applyFilter();
    });
  }

  rows.forEach((row) => {
    row.addEventListener('click', () => openDrawer(row));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDrawer(row);
      }
    });
  });

  const closer = document.getElementById('kit-drawer-close');
  if (closer) closer.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDrawer();
  });

  if (form) {
    form.addEventListener('submit', () => {
      if (loading) loading.hidden = false;
    });
  }

  applyFilter();

  const params = new URLSearchParams(window.location.search);
  const wanted = (params.get('kit') || '').toUpperCase();
  if (wanted) {
    const row = rows.find((item) => (item.getAttribute('data-kit') || '').toUpperCase() === wanted);
    if (row) openDrawer(row);
  }
});
