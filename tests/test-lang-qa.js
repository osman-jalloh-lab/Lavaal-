'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../assets/css/main.css'), 'utf8');
assert.ok([...css.matchAll(/^\s*(?:nav)?\.catalog-breadcrumbs\s*\{([^}]*)\}/gm)].some(([, rule]) =>
  /(?:^|;)\s*position\s*:\s*static\s*(?:;|$)/.test(rule) &&
  /(?:^|;)\s*z-index\s*:\s*auto\s*(?:;|$)/.test(rule)
), 'catalog breadcrumbs reset fixed nav positioning and stacking');
const translationsSource = html.match(/const translations\s*=\s*([\s\S]*?);\s*\/\/ SECURITY FIX: Safe language switching/);
assert.ok(translationsSource, 'inline translations object exists');
const translations = vm.runInNewContext('(' + translationsSource[1] + ')');
for (const locale of ['en', 'fr', 'kr']) {
  for (const key of ['cat.back', 'cat.search.ph', 'cov.hint', 'sch.close']) {
    assert.equal(typeof translations[locale][key], 'string', `${locale}: ${key} exists`);
    assert.ok(translations[locale][key].trim(), `${locale}: ${key} is nonempty`);
  }
}

// Every inquiry label/placeholder has a translation, including hidden groups.
const inquiry = html.match(/<form id="iq-form"[\s\S]*?<\/form>/)[0];
for (const match of inquiry.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)) {
  for (const locale of ['en', 'fr', 'kr']) {
    assert.equal(typeof translations[locale][match[1]], 'string', `${locale}: inquiry ${match[1]}`);
  }
}
const country = inquiry.match(/<select[^>]*id="iq-country"[\s\S]*?<\/select>/)[0];
for (const option of country.matchAll(/<option([^>]*)>/g)) {
  assert.match(option[1], /value="[^"]*"/, 'country values stay stable when labels translate');
  assert.match(option[1], /data-i18n="[^"]+"/, 'country labels translate');
}

function tagById(id) {
  const tag = html.match(new RegExp('<[^>]+\\bid=["\\\']' + id + '["\\\'][^>]*>'));
  assert.ok(tag, `${id} exists`);
  return tag[0];
}
const backButton = html.match(/<button\b[^>]*\bid="catalog-back-btn"[^>]*>[\s\S]*?<\/button>/);
assert.ok(backButton, 'catalog back remains a button');
assert.match(backButton[0], /data-i18n="cat\.back"/, 'catalog back text translates');
assert.match(backButton[0], /<span\b[^>]*aria-hidden="true"[^>]*>(?:&larr;|&#8592;|←)<\/span>/, 'back arrow stays outside translated text');
assert.match(tagById('catalog-search'), /data-i18n-ph="cat\.search\.ph"/);
assert.match(html, /<[^>]*class="[^"]*\bbcloud-hint\b[^"]*"[^>]*data-i18n="cov\.hint"/);
assert.match(tagById('sched-close-btn'), /^<button\b/);
assert.match(tagById('sched-close-btn'), /data-i18n-aria="sch\.close"/);
assert.match(tagById('sched-close-btn'), /aria-label="Close scheduling"/);

const languageFunction = html.slice(html.indexOf('function setLang(l, persist){'), html.indexOf('// INITIALIZATION'));
assert.match(languageFunction, /try\s*\{[^}]*localStorage\.setItem\(['"]lavaall\.lang['"],\s*l\)[^}]*\}\s*catch\b/, 'explicit choice persists safely');
assert.ok(languageFunction.indexOf("includes(l)") < languageFunction.indexOf('localStorage.setItem'), 'validation precedes persistence');
assert.match(html, /let currentLang\s*=\s*['"]en['"]/, 'default currentLang stays English');

const initSource = html.match(/document\.addEventListener\('DOMContentLoaded', function\(\) \{[\s\S]*?\n\}\);/);
assert.ok(initSource, 'DOMContentLoaded initialization exists');
assert.match(initSource[0], /setLang\(savedLang,\s*false\)/, 'init restores language without persisting');
assert.doesNotMatch(initSource[0], /setLang\(['"]en['"]\)/, 'init does not unconditionally select English');
assert.match(initSource[0], /try\s*\{[^}]*localStorage\.getItem\(['"]lavaall\.lang['"]\)[^}]*\}\s*catch\b/, 'init reads storage safely');
for (const saved of ['en', 'fr', 'kr', null, '', 'invalid', 'kri', 'throws']) {
  let selected;
  let reads = 0;
  const context = {
    document: { addEventListener(event, callback) { assert.equal(event, 'DOMContentLoaded'); callback(); } },
    buildTicker() {},
    InquiryFormHandler: function () {},
    localStorage: { getItem(key) { assert.equal(key, 'lavaall.lang'); reads++; if (saved === 'throws') throw new Error('Storage blocked'); return saved; } },
    setLang(locale, persist) { assert.equal(persist, false, 'init does not persist'); selected = locale; },
  };
  vm.runInNewContext(initSource[0], context);
  assert.equal(reads, 1);
  assert.equal(selected, ['en', 'fr', 'kr'].includes(saved) ? saved : 'en', `saved locale ${saved}`);
}
console.log('PASS language persistence, translations, and localized attributes');
