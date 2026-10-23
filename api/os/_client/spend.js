/* LAVAALL OS Spend: month-to-date from real spend records only. Nothing is estimated, projected or
   converted: with no records every figure is a dash and the chart is empty. Reads data.spendMonth,
   which is null until spend records exist. Amounts are US dollars. */
(function () {
  'use strict';
  var OS = window.OS;
  var esc = OS.esc;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var W = 760, H = 220, PL = 44, PR = 12, PB = 26, PT = 12;

  function usd(cents) { return OS.money(cents / 100); }

  function monthLabel(m) {
    if (m) return MONTHS[m.month - 1] + ' ' + m.year;
    return '';
  }

  // Round the top of the axis up to 1, 2 or 5 times a power of ten.
  function niceMax(cents) {
    if (cents <= 0) return 100;
    var pow = Math.pow(10, Math.floor(Math.log(cents) / Math.LN10));
    var f = cents / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }

  function chart(m) {
    var top = m ? niceMax(m.series.length ? m.series[m.series.length - 1].cumulativeCents : 0) : 100;
    var days = m ? m.daysInMonth : 30;
    var innerW = W - PL - PR, innerH = H - PT - PB;
    var x = function (day) { return PL + (days > 1 ? (day - 1) / (days - 1) : 0) * innerW; };
    var y = function (cents) { return PT + innerH - cents / top * innerH; };

    // Axis labels only when there is data to label; an empty chart prints no numbers.
    var grid = [0, 1, 2, 3].map(function (g) {
      var c = top * g / 3;
      return '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(c).toFixed(1) + '" y2="' + y(c).toFixed(1) + '" stroke="var(--line)"/>' +
        (m && m.series.length ? '<text x="' + (PL - 6) + '" y="' + (y(c) + 4).toFixed(1) + '" text-anchor="end">' + esc(usd(c)) + '</text>' : '');
    }).join('');

    if (!m || !m.series.length) {
      return '<svg class="spendsvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="No spend records yet">' + grid +
        '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" class="empty-t">No spend records yet</text></svg>';
    }

    var pts = m.series.map(function (p) { return [x(p.day), y(p.cumulativeCents)]; });
    var line = pts.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
    var end = pts[pts.length - 1], base = y(0);
    var area = line + ' L' + end[0].toFixed(1) + ' ' + base.toFixed(1) + ' L' + pts[0][0].toFixed(1) + ' ' + base.toFixed(1) + 'Z';
    var ticks = [1, 8, 15, 22, 29].filter(function (d) { return d <= days; });
    if (ticks.indexOf(m.today) === -1 && m.today - ticks[ticks.length - 1] > 3) ticks.push(m.today);
    var xl = ticks.map(function (d) { return '<text x="' + x(d).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + MONTHS[m.month - 1].slice(0, 3) + ' ' + d + '</text>'; }).join('');
    var label = 'Cumulative spend in ' + monthLabel(m) + ': ' + usd(m.totalCents) + ' by day ' + m.today;

    return '<svg class="spendsvg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(label) + '">' +
      '<defs><linearGradient id="spend-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ok)" stop-opacity=".28"/><stop offset="1" stop-color="var(--ok)" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<path d="' + area + '" fill="url(#spend-grad)"/><path d="' + line + '" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="7" fill="var(--ok)" opacity=".2"/><circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="3.5" fill="var(--ok)"/>' + xl + '</svg>';
  }

  function tile(tint, label, value, sub) {
    return '<div class="card kpi t-' + tint + '"><span>' + esc(label) + '</span><b class="num">' + (value == null ? '—' : esc(value)) + '</b><i>' + esc(sub) + '</i></div>';
  }

  function entries(m) {
    if (!m || !m.entries.length) return '';
    return '<section class="card tablewrap mt"><div class="ch"><h3>Entries this month</h3><div class="r"><span class="num">' + m.count + '</span></div></div><table><thead><tr><th>Date</th><th>Provider</th><th>Note</th><th class="n">Amount</th></tr></thead><tbody>' +
      m.entries.map(function (e) {
        return '<tr><td class="dim num">' + esc(OS.fmtDate(e.date)) + '</td><td>' + esc(e.provider || '—') + '</td><td class="wrap dim">' + esc(e.note || '—') + '</td><td class="n num">' + esc(usd(e.cents)) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function providers(m) {
    if (!m || !m.providers.length) return '';
    return '<section class="card mt"><div class="ch"><h3>By provider</h3></div>' + m.providers.map(function (p) {
      return '<div class="ckv"><span>' + esc(p.name) + '</span><b class="num">' + esc(usd(p.cents)) + '</b></div>';
    }).join('') + '</section>';
  }

  OS.registerView('spend', {
    render: function (ctx) {
      var m = ctx.data.spendMonth;
      var none = 'no spend records yet';
      var head = '<div class="ph"><div><h1>Spend</h1><p>AI spend from stored spend records, in US dollars. Nothing here is estimated or projected.</p></div></div>';
      var tiles = '<div class="grid g4">' +
        tile('g', 'Month to date', m ? usd(m.totalCents) : null, m ? monthLabel(m) : none) +
        tile('o', 'Entries this month', m ? String(m.count) : null, m ? 'records' : none) +
        tile('v', 'Largest entry', m && m.largest ? usd(m.largest.cents) : null, m && m.largest ? (m.largest.provider || OS.fmtDate(m.largest.date)) : none) +
        tile('b', 'Last entry', m && m.last ? OS.fmtDate(m.last.date) : null, m && m.last ? usd(m.last.cents) : none) + '</div>';
      var title = m ? 'Month to date, ' + monthLabel(m) : 'Month to date';
      var src = m ? '' : OS.empty('No spend records yet.', 'spend');
      return head + tiles + '<section class="card mt"><div class="ch"><h3>' + esc(title) + '</h3><div class="r">Cumulative</div></div><div class="chartpad">' + chart(m) + '</div>' + src + '</section>' +
        providers(m) + entries(m);
    }
  });
})();
