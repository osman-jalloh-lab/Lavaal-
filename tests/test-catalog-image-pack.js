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
vm.runInContext(code + '\nthis.CATALOG=CATALOG; this.CATALOG_OVERVIEW=CATALOG_OVERVIEW;', ctx);

// TSV catalogue_targets → unique handwritten catalog ids. Prefix/id matches
// (Camon 20, iMac 24", FortiGate / UTM, PlayStation 5, etc.) are identity
// matches, not guesses. Do not add a target here unless the catalog entry is unique.
const TARGET_TO_ID = {
  'iPhone 13 mini': 'iphone-13-mini',
  'iPhone 13': 'iphone-13',
  'iPhone 13 Pro': 'iphone-13-pro',
  'iPhone 13 Pro Max': 'iphone-13-pro-max',
  'iPhone 14': 'iphone-14',
  'iPhone 14 Plus': 'iphone-14-plus',
  'iPhone 14 Pro': 'iphone-14-pro',
  'iPhone 14 Pro Max': 'iphone-14-pro-max',
  'iPhone 16': 'iphone-16',
  'iPhone 16 Plus': 'iphone-16-plus',
  'iPhone 16 Pro': 'iphone-16-pro',
  'iPhone 16 Pro Max': 'iphone-16-pro-max',
  'Pixel 8': 'pixel-8',
  'Tecno Camon 20': 'tecno-camon-20',
  'Infinix Note 30': 'infinix-note-30',
  'Moto G84': 'moto-g84',
  'Redmi Note 13': 'redmi-note-13',
  'OnePlus 12': 'oneplus-12',
  'iPad Air': 'ipad-air',
  'iPad Pro': 'ipad-pro',
  'MacBook Air': 'macbook-air',
  'iMac 24': 'imac',
  'Mac mini': 'mac-mini',
  'Acer Aspire': 'acer-aspire',
  'ASUS VivoBook': 'asus-vivobook',
  'Surface Laptop': 'surface-laptop',
  'Samsung UHD TV': 'samsung-uhd',
  'Sony Bravia TV': 'sony-bravia',
  'TCL UHD TV': 'tcl-uhd',
  'Vizio Quantum TV': 'vizio-quantum',
  'LG UltraGear': 'lg-ultragear',
  'Samsung Odyssey': 'samsung-odyssey',
  'Ubiquiti UniFi AP': 'ubiquiti-ap',
  'FortiGate Firewall': 'fortinet-firewall',
  'Lenovo ThinkSystem Server': 'lenovo-thinksystem',
  'PS5': 'ps5',
  'PS4': 'ps4',
  'Xbox Series X': 'xbox-series-x',
  'Nintendo Switch': 'nintendo-switch',
  'AirPods Pro': 'airpods-pro',
  'JBL Bluetooth Speaker': 'jbl-speaker',
  'Sony Noise-Cancelling Headphones': 'sony-headphones',
  'Apple Watch Series 9': 'apple-watch-series-9',
  'Apple Watch Ultra 2': 'apple-watch-ultra',
  'Galaxy Watch 6': 'galaxy-watch-6',
  'Canon EOS': 'canon-eos',
  'Sony Alpha': 'sony-alpha',
  'Hikvision CCTV': 'hikvision-cctv',
  'Chargers & Charging Cables': 'charger-cable',
  'Cases & Screen Protectors': 'cases-protectors',
  'Power Banks': 'power-bank',
  'Andeli 20KVA single phase': 'stabilizer-20kva-1p',
  'Andeli 20KVA 3 phase': 'stabilizer-20kva-3p',
  'Andeli 50KVA 3 phase': 'stabilizer-50kva',
};

const models = [];
ctx.CATALOG.forEach(function (cat) {
  cat.brands.forEach(function (brand) {
    brand.families.forEach(function (fam) {
      fam.models.forEach(function (model) {
        models.push({ cat: cat.id, brand: brand.name, model: model });
      });
    });
  });
});
function byId(id) {
  return models.find(function (row) { return row.model.id === id; });
}

const tsv = fs.readFileSync(path.join(root, 'scripts/product-images/IMAGE_MANIFEST.tsv'), 'utf8').trim().split(/\r?\n/);
check('authentic TSV header', tsv[0] === 'type\tasset_file\tcatalogue_targets');

const productRows = [];
const categoryRows = [];
tsv.slice(1).forEach(function (line) {
  const parts = line.split('\t');
  if (parts.length < 3) return;
  const row = { type: parts[0], asset_file: parts[1], catalogue_targets: parts[2] };
  if (row.type === 'product') productRows.push(row);
  if (row.type === 'category') categoryRows.push(row);
});
check('45 product TSV rows', productRows.length === 45);
check('10 category TSV rows', categoryRows.length === 10);

const packDir = path.join(root, 'images/products/pack-2026-09-02');
const productWebps = fs.readdirSync(packDir).filter(function (name) { return name.endsWith('.webp'); });
check('45 product webp files on disk', productWebps.length === 45);

const artDir = path.join(root, 'images/products/category-artwork');
const categoryWebps = fs.readdirSync(artDir).filter(function (name) { return name.endsWith('.webp'); });
check('10 archived category webp files', categoryWebps.length === 10);

function isWebp(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.length > 1000 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
}

productWebps.forEach(function (name) {
  check(name + ' is valid webp', isWebp(path.join(packDir, name)));
});
categoryWebps.forEach(function (name) {
  check('category-artwork/' + name + ' is valid webp', isWebp(path.join(artDir, name)));
});

const packUsers = {};
productRows.forEach(function (row) {
  const file = path.basename(row.asset_file);
  const dest = 'images/products/pack-2026-09-02/' + file;
  const targets = row.catalogue_targets.split(' | ').map(function (s) { return s.trim(); });
  const ids = [];
  targets.forEach(function (target) {
    const id = TARGET_TO_ID[target];
    check('target mapped: ' + target, !!id);
    if (!id) return;
    const hit = byId(id);
    check(id + ' exists', !!hit);
    check(id + ' is representative, not verified', hit && hit.model.imageRole === 'representative' && hit.model.listingType !== 'verified');
    check(id + ' image path', hit && hit.model.image === dest);
    check(id + ' file exists', fs.existsSync(path.join(root, dest)) && fs.statSync(path.join(root, dest)).size > 1000);
    check(id + ' honest alt', hit && /Representative sourcing artwork/.test(hit.model.imageAlt || ''));
    ids.push(id);
  });
  packUsers[dest] = ids;
});

Object.keys(packUsers).forEach(function (dest) {
  const allowed = packUsers[dest];
  const extras = models.filter(function (row) {
    return row.model.image === dest && allowed.indexOf(row.model.id) === -1;
  });
  check('family share only listed targets: ' + path.basename(dest), extras.length === 0);
});

const skippedIcecat = {
  'dell-latitude-5440': 'images/catalog/computers/dell/131192058/01.webp',
  'galaxy-tab-s9': 'images/catalog/tablets/samsung/134687128/01.webp',
  'galaxy-s23': 'images/catalog/phones/samsung/132622684/01.webp',
  'lg-oled': 'images/catalog/tvs/lg/139920272/01.webp',
  'hisense-uled': 'images/catalog/tvs/hisense/120583473/01.webp',
  'ipad-10th-gen': 'images/products/apple-ipad-10.png',
  'macbook-pro': 'images/products/apple-macbook-pro.png',
};
Object.keys(skippedIcecat).forEach(function (id) {
  const hit = byId(id);
  check(id + ' Icecat/existing primary unchanged', hit && hit.model.primaryImage === skippedIcecat[id]);
  check(id + ' not overwritten by pack', hit && String(hit.model.image || '').indexOf('pack-2026-09-02') === -1);
});

['iphone-11', 'iphone-12', 'iphone-15'].forEach(function (id) {
  const hit = byId(id);
  check(id + ' keeps existing png, not pack family art', hit && hit.model.primaryImage && String(hit.model.primaryImage).indexOf('apple-iphone-') !== -1 && hit.model.imageRole !== 'representative');
});

const printers = ['hp-laserjet', 'canon-imageclass', 'epson-ecotank'];
printers.forEach(function (id) {
  const hit = byId(id);
  check(id + ' still imagePending category fallback', hit && hit.model.imagePending === true && hit.model.primaryImage === 'images/products/category-printers.webp');
});

const overviewExpected = {
  phones: 'images/products/category-phones.webp',
  tvs: 'images/products/category-tvs.webp',
  monitors: 'images/products/category-monitors.webp',
  gaming: 'images/products/category-gaming.webp',
  audio: 'images/products/category-audio.webp',
  watches: 'images/products/category-watches.webp',
  cameras: 'images/products/category-cameras.webp',
  printers: 'images/products/category-printers.webp',
  accessories: 'images/products/category-accessories.webp',
  tablets: 'images/products/category-tablets.webp',
};
ctx.CATALOG_OVERVIEW.filter(function (row) { return row.categoryOnly; }).forEach(function (row) {
  check('overview ' + row.categoryOnly + ' not overwritten', row.image === overviewExpected[row.categoryOnly]);
});

const css = fs.readFileSync(path.join(root, 'assets/css/main.css'), 'utf8');
check('product-image uses object-fit contain', /\.product-image img\{[^}]*object-fit:contain/.test(css));
check('pgal-thumb uses object-fit contain', /\.pgal-thumb img\{[^}]*object-fit:contain/.test(css));
check('prod-img uses object-fit contain', /\.prod-img\{[^}]*object-fit:contain/.test(css));

const catalogJs = fs.readFileSync(path.join(root, 'assets/js/catalog.js'), 'utf8');
check('representative helper exists', catalogJs.indexOf('function isRepresentativeArtwork') !== -1);
check('verified Icecat merge gate unchanged', catalogJs.indexOf('function isApprovedGeneratedProduct') !== -1);

const cisco = byId('cisco-isr-4000');
check('Cisco ISR photo unchanged', cisco && cisco.model.image === 'images/products/network-cisco-isr-4000.webp');

check('START_HERE present', fs.existsSync(path.join(root, 'scripts/product-images/START_HERE_CLAUDE.md')));
check('PACK README present', fs.existsSync(path.join(root, 'scripts/product-images/PACK_README.md')));

const failed = results.filter(function (row) { return !row.pass; });
results.forEach(function (row) {
  console.log((row.pass ? 'PASS' : 'FAIL') + '  ' + row.name);
});
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('OK  ' + results.length + ' checks');
}
