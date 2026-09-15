// Preview-only catalog image-pack guards. Plain node, no extra deps.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }

const code = fs.readFileSync(path.join(root, 'assets/js/catalog-data.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.CATALOG=CATALOG;', ctx);

const applied = {
  'ipad-pro': 'images/products/pack-2026-09-02/ipad-pro.webp',
  'ubiquiti-ap': 'images/products/pack-2026-09-02/ubiquiti-unifi-ap.webp',
  'ps4': 'images/products/pack-2026-09-02/playstation-4.webp',
  'samsung-uhd': 'images/products/pack-2026-09-02/samsung-uhd-tv.webp',
};

const models = [];
ctx.CATALOG.forEach(function (cat) {
  cat.brands.forEach(function (brand) {
    brand.families.forEach(function (fam) {
      fam.models.forEach(function (model) {
        models.push({ cat: cat.id, model: model });
      });
    });
  });
});

Object.keys(applied).forEach(function (id) {
  const hit = models.find(function (row) { return row.model.id === id; });
  check(id + ' exists', !!hit);
  check(id + ' is representative, not verified', hit && hit.model.imageRole === 'representative' && hit.model.listingType !== 'verified');
  check(id + ' image path', hit && hit.model.image === applied[id]);
  check(id + ' file exists', fs.existsSync(path.join(root, applied[id])) && fs.statSync(path.join(root, applied[id])).size > 1000);
  check(id + ' honest alt', hit && /Representative sourcing artwork/.test(hit.model.imageAlt || ''));
});

const latitude = models.find(function (row) { return row.model.id === 'dell-latitude-5440'; });
check('Dell Latitude Icecat primary unchanged', latitude && latitude.model.primaryImage === 'images/catalog/computers/dell/131192058/01.webp');

const tabS9 = models.find(function (row) { return row.model.id === 'galaxy-tab-s9'; });
check('Galaxy Tab S9 distributor gallery unchanged', tabS9 && tabS9.model.primaryImage === 'images/catalog/tablets/samsung/134687128/01.webp');

const held = models.find(function (row) { return row.model.id === 'asus-vivobook'; });
check('ASUS VivoBook held (truncated pack file)', held && !held.model.image && !held.model.primaryImage);

const css = fs.readFileSync(path.join(root, 'assets/css/main.css'), 'utf8');
check('product-image uses object-fit contain', /\.product-image img\{[^}]*object-fit:contain/.test(css));
check('pgal-thumb uses object-fit contain', /\.pgal-thumb img\{[^}]*object-fit:contain/.test(css));
check('prod-img uses object-fit contain', /\.prod-img\{[^}]*object-fit:contain/.test(css));

const catalogJs = fs.readFileSync(path.join(root, 'assets/js/catalog.js'), 'utf8');
check('representative helper exists', catalogJs.indexOf('function isRepresentativeArtwork') !== -1);
check('verified Icecat merge gate unchanged', catalogJs.indexOf('function isApprovedGeneratedProduct') !== -1);

const failed = results.filter(function (row) { return !row.pass; });
results.forEach(function (row) {
  console.log((row.pass ? 'PASS' : 'FAIL') + '  ' + row.name);
});
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('OK  ' + results.length + ' checks');
}
