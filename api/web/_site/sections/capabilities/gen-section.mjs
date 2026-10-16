// Generates section.html from content/en.json (verbatim copy). Run: node gen-section.mjs
import fs from 'fs';
const c = JSON.parse(fs.readFileSync('../../content/en.json', 'utf8')).capabilities;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let h = `<section id="capabilities" class="cp" aria-labelledby="cp-h">
  <div class="sec-head cp-head">
    <h2 id="cp-h">${esc(c.h2)}</h2>
    <p>${esc(c.sub)}</p>
    <p class="cp-note label">${esc(c.videoNote)}</p>
  </div>
  <div class="cp-groups">
`;
for (const g of c.groups) {
  h += `    <div class="cp-group" role="group" aria-labelledby="cp-g-${g.id}">
      <h3 class="cp-gl" id="cp-g-${g.id}">${esc(g.label)}</h3>
      <ul class="cp-list">
`;
  for (const it of c.items.filter(i => i.group === g.id)) {
    h += `        <li class="cp-item${it.video ? ' cp-has-video' : ''}">
          <div class="cp-copy">
            <h4 class="cp-t">${esc(it.title)}</h4>
            <p class="cp-d">${esc(it.text)}</p>
          </div>
`;
    if (it.video) h += `          <figure class="cp-vid" data-cp-id="${it.id}">
            <video muted playsinline loop preload="none" width="1280" height="720" poster="video/${it.id}.jpg" controls aria-label="Illustrative demo loop: ${esc(it.title)}">
              <source src="video/${it.id}.mp4" type="video/mp4">
              <source src="video/${it.id}.webm" type="video/webm">
            </video>
            <button class="cp-play" type="button" aria-label="Play demo: ${esc(it.title)}"><span class="cp-pi" aria-hidden="true"></span><span class="cp-pt">Play</span></button>
          </figure>
`;
    h += `        </li>\n`;
  }
  h += `      </ul>\n    </div>\n`;
}
h += `  </div>\n</section>\n`;
fs.writeFileSync('section.html', h);
