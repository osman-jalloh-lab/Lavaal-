document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy-target]');
  if (!button) return;
  const node = document.querySelector(button.getAttribute('data-copy-target'));
  if (!node) return;
  const text = node.value || node.textContent || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    button.setAttribute('data-copied', '1');
    return;
  }
  if (typeof node.select === 'function') {
    node.focus();
    node.select();
    document.execCommand('copy');
  }
});
