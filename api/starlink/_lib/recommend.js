// Server copy of the v4 page's deterministic recommendation, so the stored
// lead says what the customer was shown. Keep in sync with _site/app.js.
// No prices: LAVAALL prices are never shown or stored here.
const LABELS = {
  kit: 'Starlink kit',
  mount: 'Roof / pole mount',
  mesh: 'Mesh Wi-Fi',
  meshPlus: 'Multi-node mesh',
  power: 'Power protection + UPS',
  router: 'Router setup',
  install: 'Professional installation',
  support: 'Ongoing support',
};

function recommend(a) {
  const big = a.size === 'Large' || a.size === 'Multiple buildings';
  const mid = a.size === 'Medium';
  const biz = ['Business', 'Office', 'School', 'Hotel', 'Organization'].includes(a.place);
  const lean = a.priority === 'Lowest starting cost';
  let list;
  let title = 'Complete Starlink setup';
  let note = '';

  switch (a.need) {
    case 'I already have Starlink': title = 'Install + optimise your Starlink'; list = ['mount', 'install']; break;
    case 'Installation only': title = 'Professional installation'; list = ['mount', 'install']; break;
    case 'Better Wi-Fi coverage': title = 'Wi-Fi coverage upgrade'; list = [big ? 'meshPlus' : 'mesh', 'router', 'install']; break;
    case 'Power backup': title = 'Power protection + backup'; list = ['power', 'install']; break;
    default: list = ['kit', 'mount', 'install'];
  }

  const wantsMesh = big || (mid && !lean) || a.priority === 'Best Wi-Fi coverage' || (biz && !lean);
  if (wantsMesh && !list.includes('mesh') && !list.includes('meshPlus') && a.need !== 'Power backup' && a.need !== 'Installation only') {
    list.splice(list.indexOf('install'), 0, big ? 'meshPlus' : 'mesh');
  }
  const wantsPower = a.priority === 'Backup power' || a.priority === 'Business reliability' || (biz && !lean);
  if (wantsPower && !list.includes('power') && a.need !== 'Better Wi-Fi coverage') {
    list.splice(list.indexOf('install'), 0, 'power');
  }
  list.push('support');

  if (lean) note = 'Core connection first. Add coverage or backup later.';
  if (a.priority === 'Fast installation') note = "We'll schedule as early as availability allows.";
  return { title, items: list, labels: list.map((k) => LABELS[k]), note };
}

function summary(a) {
  const where = (a.city ? a.city + ', ' : '') + (a.country || '');
  return [a.place, where, a.size ? a.size + ' space' : ''].filter(Boolean).join(' · ');
}

module.exports = { recommend, summary, LABELS };
