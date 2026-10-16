// TERRA: candlelit scroll journey through four courses, plus lazy video and reservations.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = window.matchMedia('(max-width: 640px)').matches;
const flat = reduce; // phones get the real films too; only reduced motion gets the still cards
if (flat) document.documentElement.classList.add('flat');

// ---- Lazy videos: load near view, play while visible. Reduced motion: posters only.
// Mobile: background loops stay posters; dish cinemagraphs (the mobile fallback) still play.
const vids = [...document.querySelectorAll('video[data-loop]')];
if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (small && v.classList.contains('bg')) return;
    if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause();
  }), { rootMargin: '200px 0px' });
  vids.forEach(v => io.observe(v));
}

// ---- Gallery of dish cinemagraphs.
const DISHES = [['burrata', 'Burrata'], ['tagliatelle', 'Tagliatelle al ragù'], ['pizza', 'Margherita'], ['ribeye', 'Suya ribeye'], ['skewers', 'Suya skewers'], ['tiramisu', 'Tiramisù'], ['wine', 'The cellar']];
const gal = document.querySelector('[data-gal]');
gal.innerHTML = DISHES.map(([k, n]) => `<figure><video data-loop muted playsinline loop preload="none" poster="assets/posters/dish-${k}.jpg" data-src="assets/video/dish-${k}.mp4" aria-hidden="true"></video><figcaption>${n}</figcaption></figure>`).join('');
if (!reduce && 'IntersectionObserver' in window) {
  const gio = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); }), { rootMargin: '150px 0px' });
  gal.querySelectorAll('video').forEach(v => gio.observe(v));
}

// ---- Reservation stub.
const form = document.querySelector('[data-res]'), status = document.querySelector('[data-status]');
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.date.value || !form.name.value.trim()) { status.textContent = 'Please add a date and your name.'; return; }
  status.textContent = `Thank you, ${form.name.value.trim()}. Your request for ${form.guests.value} on ${form.date.value} is noted. (Sample site: nothing is sent.)`;
});

if (!flat) buildFilm();

function buildFilm() {
  // Four real course films (Higgsfield, from photoreal stills). Scroll picks the course; the active film plays.
  const journey = document.querySelector('[data-journey]');
  const films = [...document.querySelectorAll('[data-film] video')];
  const labels = [...document.querySelectorAll('.course')];
  let cur = -1, inView = false;
  const set = i => {
    if (i === cur) return; cur = i;
    films.forEach((v, k) => {
      if (k === i) { if (!v.getAttribute('src')) v.src = v.dataset.src; v.currentTime = 0; v.classList.add('on'); v.play().catch(() => {}); }
      else { v.classList.remove('on'); setTimeout(() => { if (k !== cur) v.pause(); }, 900); }
      if (k === i + 1 && !v.getAttribute('src')) { v.src = v.dataset.src; v.preload = 'auto'; }
    });
  };
  const tick = () => {
    const r = journey.getBoundingClientRect();
    inView = r.top <= 1 && r.bottom >= innerHeight - 1;
    const p = Math.min(0.999, Math.max(0, -r.top / (r.height - innerHeight)));
    const i = Math.floor(p * films.length);
    set(i);
    labels.forEach((l, k) => l.classList.toggle('on', inView && k === i));
  };
  addEventListener('scroll', tick, { passive: true }); addEventListener('resize', tick); tick();
}
