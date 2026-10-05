// POUR / PLAY: scroll through three real film stations (GRIND, POUR, SIP), then FIND YOUR CUP.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduced');

const loaderEl = document.querySelector('[data-loader]'), barEl = document.querySelector('[data-loader-bar]'), pctEl = document.querySelector('[data-loader-pct]');
const film = document.querySelector('[data-film]');
const films = [...film.querySelectorAll('video')];
const labels = [...document.querySelectorAll('.label')];
const hint = document.querySelector('[data-hint]');
const runway = document.querySelector('[data-runway]'), cups = document.getElementById('cups');

// Loader: wait for the first film to be playable (or 4s), showing real buffering progress.
function done() { barEl.style.width = '100%'; pctEl.textContent = '100%'; loaderEl.classList.add('done'); }
const first = films[0];
const prog = () => { try { const b = first.buffered; if (b.length && first.duration) { const p = Math.min(99, Math.round(b.end(b.length - 1) / first.duration * 100)); barEl.style.width = p + '%'; pctEl.textContent = p + '%'; } } catch (e) {} };
first.addEventListener('progress', prog);
first.addEventListener('canplaythrough', done, { once: true });
setTimeout(done, 4000);

let cur = -1;
function set(i) {
  if (i === cur) return; cur = i;
  films.forEach((v, k) => {
    if (k === i) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.currentTime = 0; v.classList.add('on'); if (!reduce) v.play().catch(() => {}); }
    else { v.classList.remove('on'); setTimeout(() => { if (k !== cur) v.pause(); }, 900); }
    if (k === i + 1 && !v.getAttribute('src')) { v.src = v.dataset.src; v.preload = 'auto'; }
  });
}
function tick() {
  const r = runway.getBoundingClientRect();
  const p = Math.min(0.999, Math.max(0, -r.top / (r.height - innerHeight)));
  const i = Math.floor(p * films.length);
  set(i);
  if (!reduce) labels.forEach((l, k) => { const on = k === i; l.style.opacity = on ? 1 : 0; l.style.transform = on ? 'none' : 'translateY(24px)'; });
  if (hint) hint.style.opacity = p > 0.03 ? 0 : 1;
  const c = cups.getBoundingClientRect().top, fade = Math.min(1, Math.max(0, (innerHeight - c) / (innerHeight * 0.7)));
  film.style.opacity = (1 - fade).toFixed(3);
}
labels.forEach(l => { l.style.transition = 'opacity .5s ease, transform .5s ease'; });
addEventListener('scroll', tick, { passive: true }); addEventListener('resize', tick); tick();

// Cart stub.
const cartEl = document.querySelector('[data-cart]'); const cart = [];
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
  cart.push(b.dataset.add);
  const counts = cart.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  cartEl.textContent = 'In your cart: ' + Object.entries(counts).map(([n, c]) => c + ' x ' + n).join(', ') + '. (Checkout is a stub in this sample.)';
  b.textContent = 'Added'; setTimeout(() => { b.textContent = 'Add to cart'; }, 1200);
}));
