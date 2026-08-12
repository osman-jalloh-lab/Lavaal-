/*
 * catalog-data.js — LAVAALL product catalogue data
 * ============================================================================
 * Pure data, no DOM/rendering logic (that's catalog.js). Structure:
 *
 *   CATALOG            = [ Category, Category, ... ]
 *   Category           = { id, name, icon, brands: [Brand, ...] }
 *   Brand              = { name, families: [Family, ...] }
 *   Family             = { name, models: [Model, ...] }
 *   Model              = {
 *     id, name, specLine, desc,
 *     primaryImage: 'images/catalog/...' | null, // canonical imported primary
 *     images: [{ src, alt, isMain, source, sourceProductId }],
 *     image: 'images/products/xxx.jpg' | null,   // legacy handwritten fallback
 *     fields: [ FieldDef, ... ]                    // drives the quote panel
 *   }
 *   FieldDef (select)  = { key, label, type:'select', options:[...] }
 *   FieldDef (number)  = { key, label, type:'number', min, value }
 *
 * To add a product: find (or add) its Category > Brand > Family, then push a
 * new Model object. Nothing else needs to change — catalog.js renders
 * whatever is here.
 * ============================================================================
 */

/* ---------------------------------------------------------------------------
 * Reusable field-set builders — keeps model definitions short and consistent.
 * ------------------------------------------------------------------------- */
const CONDITION_NEW_REFURB = ['New', 'Refurbished — Excellent', 'Refurbished — Good'];
const CONDITION_NEW_ONLY = ['New'];

function qtyField(value) {
  return { key: 'quantity', label: 'Quantity', type: 'number', min: 1, value: value || 1 };
}
function phoneFields(storages, colors, conditions) {
  return [
    { key: 'storage', label: 'Storage', type: 'select', options: storages },
    { key: 'color', label: 'Color', type: 'select', options: colors },
    { key: 'condition', label: 'Condition', type: 'select', options: conditions || CONDITION_NEW_REFURB },
    qtyField(1),
  ];
}
function computerFields(ram, storage, cpu, conditions) {
  const f = [
    { key: 'ram', label: 'RAM', type: 'select', options: ram },
    { key: 'storage', label: 'Storage', type: 'select', options: storage },
  ];
  if (cpu) f.push({ key: 'cpu', label: 'Processor', type: 'select', options: cpu });
  f.push({ key: 'condition', label: 'Condition', type: 'select', options: conditions || CONDITION_NEW_REFURB });
  f.push(qtyField(1));
  return f;
}
function tvFields(sizes, conditions) {
  return [
    { key: 'size', label: 'Screen Size', type: 'select', options: sizes },
    { key: 'condition', label: 'Condition', type: 'select', options: conditions || CONDITION_NEW_ONLY },
    qtyField(1),
  ];
}
function networkFields(configs, ports) {
  const f = [{ key: 'configuration', label: 'Configuration', type: 'select', options: configs }];
  if (ports) f.push({ key: 'ports', label: 'Port Count', type: 'select', options: ports });
  f.push(qtyField(1));
  return f;
}
function serverFields(ram, storage, configs) {
  return [
    { key: 'ram', label: 'RAM', type: 'select', options: ram },
    { key: 'storage', label: 'Storage', type: 'select', options: storage },
    { key: 'configuration', label: 'Configuration', type: 'select', options: configs },
    qtyField(1),
  ];
}
function simpleFields(conditions) {
  const f = [];
  if (conditions) f.push({ key: 'condition', label: 'Condition', type: 'select', options: conditions });
  f.push(qtyField(1));
  return f;
}

const P = 'images/products/'; // shorthand for the existing real-photo folder

/* =============================================================================
 * PHONES
 * ============================================================================= */
const APPLE_STORAGE_OLD = ['64GB', '128GB', '256GB'];
const APPLE_STORAGE_MID = ['128GB', '256GB', '512GB'];
const APPLE_STORAGE_NEW = ['128GB', '256GB', '512GB', '1TB'];

function iphoneFamily(name, models) {
  return { name: name, models: models.map(m => ({
    id: m.id, name: m.name, image: null,
    specLine: m.storage.join(' · ') + ' · ' + m.colors.length + ' colors',
    desc: 'Sourced to order — new or professionally refurbished, tested and warrantied.',
    fields: phoneFields(m.storage, m.colors),
  })) };
}

const iphone11 = iphoneFamily('iPhone 11', [
  { id: 'iphone-11', name: 'iPhone 11', storage: APPLE_STORAGE_OLD, colors: ['Black', 'White', 'Green', 'Purple', 'Yellow', 'Red'] },
  { id: 'iphone-11-pro', name: 'iPhone 11 Pro', storage: APPLE_STORAGE_OLD, colors: ['Midnight Green', 'Space Grey', 'Silver', 'Gold'] },
  { id: 'iphone-11-pro-max', name: 'iPhone 11 Pro Max', storage: APPLE_STORAGE_OLD, colors: ['Midnight Green', 'Space Grey', 'Silver', 'Gold'] },
]);
const iphone12 = iphoneFamily('iPhone 12', [
  { id: 'iphone-12-mini', name: 'iPhone 12 mini', storage: APPLE_STORAGE_OLD, colors: ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'] },
  { id: 'iphone-12', name: 'iPhone 12', storage: APPLE_STORAGE_OLD, colors: ['Black', 'White', 'Red', 'Green', 'Blue', 'Purple'] },
  { id: 'iphone-12-pro', name: 'iPhone 12 Pro', storage: APPLE_STORAGE_MID, colors: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'] },
  { id: 'iphone-12-pro-max', name: 'iPhone 12 Pro Max', storage: APPLE_STORAGE_MID, colors: ['Graphite', 'Silver', 'Gold', 'Pacific Blue'] },
]);
const iphone13 = iphoneFamily('iPhone 13', [
  { id: 'iphone-13-mini', name: 'iPhone 13 mini', storage: APPLE_STORAGE_OLD, colors: ['Midnight', 'Starlight', 'Red', 'Pink', 'Blue'] },
  { id: 'iphone-13', name: 'iPhone 13', storage: APPLE_STORAGE_OLD, colors: ['Midnight', 'Starlight', 'Red', 'Pink', 'Blue'] },
  { id: 'iphone-13-pro', name: 'iPhone 13 Pro', storage: APPLE_STORAGE_MID, colors: ['Graphite', 'Silver', 'Gold', 'Sierra Blue'] },
  { id: 'iphone-13-pro-max', name: 'iPhone 13 Pro Max', storage: APPLE_STORAGE_MID, colors: ['Graphite', 'Silver', 'Gold', 'Sierra Blue'] },
]);
const iphone14 = iphoneFamily('iPhone 14', [
  { id: 'iphone-14', name: 'iPhone 14', storage: APPLE_STORAGE_OLD, colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red'] },
  { id: 'iphone-14-plus', name: 'iPhone 14 Plus', storage: APPLE_STORAGE_OLD, colors: ['Midnight', 'Starlight', 'Blue', 'Purple', 'Red'] },
  { id: 'iphone-14-pro', name: 'iPhone 14 Pro', storage: APPLE_STORAGE_NEW, colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] },
  { id: 'iphone-14-pro-max', name: 'iPhone 14 Pro Max', storage: APPLE_STORAGE_NEW, colors: ['Space Black', 'Silver', 'Gold', 'Deep Purple'] },
]);
const iphone15 = iphoneFamily('iPhone 15', [
  { id: 'iphone-15', name: 'iPhone 15', storage: APPLE_STORAGE_MID, colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] },
  { id: 'iphone-15-plus', name: 'iPhone 15 Plus', storage: APPLE_STORAGE_MID, colors: ['Black', 'Blue', 'Green', 'Yellow', 'Pink'] },
  { id: 'iphone-15-pro', name: 'iPhone 15 Pro', storage: APPLE_STORAGE_NEW, colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'] },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', storage: APPLE_STORAGE_NEW, colors: ['Natural Titanium', 'Blue Titanium', 'White Titanium', 'Black Titanium'] },
]);
const iphone16 = iphoneFamily('iPhone 16', [
  { id: 'iphone-16', name: 'iPhone 16', storage: APPLE_STORAGE_MID, colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] },
  { id: 'iphone-16-plus', name: 'iPhone 16 Plus', storage: APPLE_STORAGE_MID, colors: ['Black', 'White', 'Pink', 'Teal', 'Ultramarine'] },
  { id: 'iphone-16-pro', name: 'iPhone 16 Pro', storage: APPLE_STORAGE_NEW, colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'] },
  { id: 'iphone-16-pro-max', name: 'iPhone 16 Pro Max', storage: APPLE_STORAGE_NEW, colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'] },
]);

const SAMSUNG_STORAGE = ['128GB', '256GB', '512GB'];
function samsungModel(id, name, colors) {
  return { id, name, image: null, specLine: SAMSUNG_STORAGE.join(' · '),
    desc: 'Sourced to order — new or professionally refurbished, tested and warrantied.',
    fields: phoneFields(SAMSUNG_STORAGE, colors) };
}
const galaxyS = { name: 'Galaxy S', models: [
  samsungModel('galaxy-s23', 'Galaxy S23', ['Phantom Black', 'Cream', 'Green', 'Lavender']),
  samsungModel('galaxy-s24', 'Galaxy S24', ['Onyx Black', 'Marble Grey', 'Cobalt Violet', 'Amber Yellow']),
  samsungModel('galaxy-s24-ultra', 'Galaxy S24 Ultra', ['Titanium Black', 'Titanium Grey', 'Titanium Violet']),
]};
const galaxyA = { name: 'Galaxy A', models: [
  samsungModel('galaxy-a54', 'Galaxy A54', ['Awesome Black', 'Awesome White', 'Awesome Lime']),
  samsungModel('galaxy-a34', 'Galaxy A34', ['Awesome Silver', 'Awesome Violet', 'Awesome Lime']),
]};
const galaxyZ = { name: 'Galaxy Z', models: [
  samsungModel('galaxy-z-flip5', 'Galaxy Z Flip5', ['Mint', 'Graphite', 'Cream', 'Lavender']),
  samsungModel('galaxy-z-fold5', 'Galaxy Z Fold5', ['Icy Blue', 'Phantom Black', 'Cream']),
]};

// Brands prepared for future expansion — one starter family/model each so the
// browsing tree isn't empty; extend freely without touching catalog.js.
function stubPhoneBrand(brandName, modelName, id) {
  return { name: brandName, families: [{ name: modelName, models: [
    { id, name: modelName, image: null, specLine: '64GB · 128GB · 256GB',
      desc: 'Contact us to confirm current stock for this model.',
      fields: phoneFields(['64GB', '128GB', '256GB'], ['Black', 'Blue', 'White']) },
  ]}]};
}

const CATALOG_PHONES = {
  id: 'phones', name: 'Phones', icon: 'phone',
  brands: [
    { name: 'Apple', families: [iphone11, iphone12, iphone13, iphone14, iphone15, iphone16] },
    { name: 'Samsung', families: [galaxyS, galaxyA, galaxyZ] },
    stubPhoneBrand('Google', 'Pixel 8', 'pixel-8'),
    stubPhoneBrand('Tecno', 'Camon 20', 'tecno-camon-20'),
    stubPhoneBrand('Infinix', 'Note 30', 'infinix-note-30'),
    stubPhoneBrand('Motorola', 'Moto G84', 'moto-g84'),
    stubPhoneBrand('Xiaomi', 'Redmi Note 13', 'redmi-note-13'),
    stubPhoneBrand('OnePlus', 'OnePlus 12', 'oneplus-12'),
  ],
};

/* =============================================================================
 * TABLETS
 * ============================================================================= */
const CATALOG_TABLETS = {
  id: 'tablets', name: 'Tablets', icon: 'tablet',
  brands: [
    { name: 'Apple', families: [{ name: 'iPad', models: [
      { id: 'ipad-10th-gen', name: 'iPad (10th Gen)', image: null, specLine: '64GB · 256GB · Wi-Fi / Cellular',
        desc: 'Sourced to order — new or refurbished.', fields: phoneFields(['64GB', '256GB'], ['Silver', 'Blue', 'Pink', 'Yellow']) },
      { id: 'ipad-air', name: 'iPad Air', image: null, specLine: '64GB · 256GB · Wi-Fi / Cellular',
        desc: 'Sourced to order — new or refurbished.', fields: phoneFields(['64GB', '256GB'], ['Space Grey', 'Starlight', 'Blue', 'Purple']) },
      { id: 'ipad-pro', name: 'iPad Pro', image: null, specLine: '128GB · 256GB · 512GB · 1TB',
        desc: 'Sourced to order — new or refurbished.', fields: phoneFields(APPLE_STORAGE_NEW, ['Space Grey', 'Silver']) },
    ]}]},
    { name: 'Samsung', families: [{ name: 'Galaxy Tab', models: [
      samsungModel('galaxy-tab-s9', 'Galaxy Tab S9', ['Graphite', 'Beige', 'Silver']),
    ]}]},
  ],
};

/* =============================================================================
 * COMPUTERS  (folds in the original Dell OptiPlex / HP ProBook listings)
 * ============================================================================= */
const CATALOG_COMPUTERS = {
  id: 'computers', name: 'Computers', icon: 'laptop',
  brands: [
    { name: 'Dell', families: [
      { name: 'Latitude', models: [
        { id: 'dell-latitude-5440', name: 'Dell Latitude 5440', image: null, specLine: '14" · Business laptop',
          desc: 'Business-grade laptop for corporate teams.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
      { name: 'OptiPlex', models: [
        { id: 'dell-optiplex-workstation', name: 'Dell OptiPlex Workstation', image: null, specLine: 'Slim form factor · Intel Core',
          desc: 'Enterprise desktop computers for corporate teams. Slim form factor with powerful Intel Core processors. Bulk orders with pre-configuration available.',
          fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
      { name: 'Precision', models: [
        { id: 'dell-precision', name: 'Dell Precision Workstation', image: null, specLine: 'Mobile / tower workstation',
          desc: 'High-performance workstation for engineering and design workloads.', fields: computerFields(['16GB', '32GB', '64GB'], ['512GB SSD', '1TB SSD', '2TB SSD'], ['Intel Core i7', 'Intel Core i9']) },
      ]},
      { name: 'XPS', models: [
        { id: 'dell-xps-13', name: 'Dell XPS 13', image: null, specLine: '13" · Ultra-portable',
          desc: 'Premium ultra-portable laptop.', fields: computerFields(['16GB', '32GB'], ['512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
    ]},
    { name: 'HP', families: [
      { name: 'EliteBook', models: [
        { id: 'hp-elitebook', name: 'HP EliteBook', image: null, specLine: 'Business ultrabook',
          desc: 'Premium business laptop with enterprise security.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
      { name: 'ProBook', models: [
        { id: 'hp-probook-laptop', name: 'HP ProBook Business Laptop', image: null, specLine: 'MIL-STD durability · All-day battery',
          desc: 'Professional-grade laptops built for corporate use. MIL-STD durability, all-day battery, and enterprise security features for your team.',
          fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
      { name: 'ZBook', models: [
        { id: 'hp-zbook', name: 'HP ZBook Mobile Workstation', image: null, specLine: 'Mobile workstation',
          desc: 'Mobile workstation for demanding creative and technical work.', fields: computerFields(['16GB', '32GB', '64GB'], ['512GB SSD', '1TB SSD'], ['Intel Core i7', 'Intel Core i9']) },
      ]},
      { name: 'ProDesk', models: [
        { id: 'hp-prodesk', name: 'HP ProDesk Desktop', image: null, specLine: 'Small form factor desktop',
          desc: 'Compact business desktop.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD'], ['Intel Core i5', 'Intel Core i7']) },
      ]},
    ]},
    { name: 'Lenovo', families: [
      { name: 'ThinkPad', models: [ { id: 'lenovo-thinkpad', name: 'Lenovo ThinkPad', image: null, specLine: 'Business laptop', desc: 'Legendary ThinkPad reliability for business.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) } ]},
      { name: 'ThinkCentre', models: [ { id: 'lenovo-thinkcentre', name: 'Lenovo ThinkCentre', image: null, specLine: 'Compact desktop', desc: 'Compact, manageable business desktop.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD'], null) } ]},
      { name: 'IdeaPad', models: [ { id: 'lenovo-ideapad', name: 'Lenovo IdeaPad', image: null, specLine: 'Everyday laptop', desc: 'Everyday laptop for work and study.', fields: computerFields(['8GB', '16GB'], ['256GB SSD', '512GB SSD'], null) } ]},
      { name: 'Yoga', models: [ { id: 'lenovo-yoga', name: 'Lenovo Yoga', image: null, specLine: '2-in-1 convertible', desc: 'Convertible 2-in-1 laptop.', fields: computerFields(['8GB', '16GB', '32GB'], ['512GB SSD', '1TB SSD'], ['Intel Core i5', 'Intel Core i7']) } ]},
    ]},
    { name: 'Apple', families: [
      { name: 'MacBook Air', models: [ { id: 'macbook-air', name: 'MacBook Air', image: null, specLine: '13" / 15" · M2 / M3', desc: 'Sourced to order — new or refurbished.', fields: computerFields(['8GB', '16GB', '24GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Apple M2', 'Apple M3']) } ]},
      { name: 'MacBook Pro', models: [ { id: 'macbook-pro', name: 'MacBook Pro', image: null, specLine: '14" / 16" · M3 Pro / Max', desc: 'Sourced to order — new or refurbished.', fields: computerFields(['16GB', '32GB', '64GB'], ['512GB SSD', '1TB SSD', '2TB SSD'], ['Apple M3 Pro', 'Apple M3 Max']) } ]},
      { name: 'iMac', models: [ { id: 'imac', name: 'iMac 24"', image: null, specLine: '24" 4.5K · M3', desc: 'All-in-one desktop.', fields: computerFields(['8GB', '16GB'], ['256GB SSD', '512GB SSD'], null) } ]},
      { name: 'Mac mini', models: [ { id: 'mac-mini', name: 'Mac mini', image: null, specLine: 'M2 / M2 Pro', desc: 'Compact desktop Mac.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD', '1TB SSD'], ['Apple M2', 'Apple M2 Pro']) } ]},
    ]},
    { name: 'Acer', families: [{ name: 'Aspire', models: [ { id: 'acer-aspire', name: 'Acer Aspire', image: null, specLine: 'Everyday laptop', desc: 'Reliable everyday laptop.', fields: computerFields(['8GB', '16GB'], ['256GB SSD', '512GB SSD'], null) } ]}]},
    { name: 'ASUS', families: [{ name: 'VivoBook', models: [ { id: 'asus-vivobook', name: 'ASUS VivoBook', image: null, specLine: 'Everyday laptop', desc: 'Reliable everyday laptop.', fields: computerFields(['8GB', '16GB'], ['256GB SSD', '512GB SSD'], null) } ]}]},
    { name: 'Microsoft', families: [{ name: 'Surface', models: [ { id: 'surface-laptop', name: 'Surface Laptop', image: null, specLine: '13.5" / 15"', desc: 'Premium Windows laptop.', fields: computerFields(['8GB', '16GB', '32GB'], ['256GB SSD', '512GB SSD'], ['Intel Core i5', 'Intel Core i7']) } ]}]},
  ],
};

/* =============================================================================
 * TVS
 * ============================================================================= */
const TV_SIZES = ['43"', '50"', '55"', '65"', '75"', '85"'];
function tvModel(id, name, spec) {
  return { id, name, image: null, specLine: spec, desc: 'Supplied and delivered — installation available on request.', fields: tvFields(TV_SIZES) };
}
const CATALOG_TVS = {
  id: 'tvs', name: 'TVs', icon: 'tv',
  brands: [
    { name: 'LG', families: [
      { name: 'OLED', models: [tvModel('lg-oled', 'LG OLED TV', 'Self-lit pixels · 4K/8K')] },
      { name: 'QNED', models: [tvModel('lg-qned', 'LG QNED TV', 'Quantum dot NanoCell · 4K')] },
      { name: 'UHD', models: [tvModel('lg-uhd', 'LG UHD TV', '4K UHD · webOS')] },
    ]},
    { name: 'Samsung', families: [
      { name: 'QLED', models: [tvModel('samsung-qled', 'Samsung QLED TV', 'Quantum dot · 4K')] },
      { name: 'Neo QLED', models: [tvModel('samsung-neo-qled', 'Samsung Neo QLED TV', 'Mini-LED · 4K/8K')] },
      { name: 'UHD', models: [tvModel('samsung-uhd', 'Samsung UHD TV', '4K UHD · Tizen')] },
    ]},
    { name: 'Sony', families: [{ name: 'Bravia', models: [tvModel('sony-bravia', 'Sony Bravia TV', '4K HDR · Google TV')] }]},
    { name: 'TCL', families: [{ name: 'UHD', models: [tvModel('tcl-uhd', 'TCL UHD TV', '4K UHD · Android TV')] }]},
    { name: 'Hisense', families: [{ name: 'ULED', models: [tvModel('hisense-uled', 'Hisense ULED TV', '4K ULED')] }]},
    { name: 'Vizio', families: [{ name: 'Quantum', models: [tvModel('vizio-quantum', 'Vizio Quantum TV', '4K Quantum Dot')] }]},
  ],
};

/* =============================================================================
 * MONITORS / NETWORKING / SERVERS / PRINTERS / GAMING / AUDIO /
 * SMART WATCHES / CAMERAS / ACCESSORIES / FIBER & CABLING
 * ============================================================================= */
const CATALOG_MONITORS = {
  id: 'monitors', name: 'Monitors', icon: 'monitor',
  brands: [
    { name: 'Dell', families: [{ name: 'UltraSharp', models: [
      { id: 'dell-ultrasharp-27', name: 'Dell UltraSharp 27"', image: null, specLine: '27" · 4K · IPS',
        desc: 'Professional colour-accurate monitor.', fields: [{ key: 'size', label: 'Screen Size', type: 'select', options: ['24"', '27"', '32"'] }, { key: 'resolution', label: 'Resolution', type: 'select', options: ['1080p', '1440p', '4K'] }, qtyField(1)] },
    ]}]},
    { name: 'LG', families: [{ name: 'UltraGear', models: [
      { id: 'lg-ultragear', name: 'LG UltraGear Gaming Monitor', image: null, specLine: '27" · 144Hz+ · Gaming',
        desc: 'High refresh-rate gaming monitor.', fields: [{ key: 'size', label: 'Screen Size', type: 'select', options: ['24"', '27"', '34"'] }, { key: 'resolution', label: 'Resolution', type: 'select', options: ['1080p', '1440p', '4K'] }, qtyField(1)] },
    ]}]},
    { name: 'Samsung', families: [{ name: 'Odyssey', models: [
      { id: 'samsung-odyssey', name: 'Samsung Odyssey Curved Monitor', image: null, specLine: 'Curved · 165Hz+',
        desc: 'Curved high-performance display.', fields: [{ key: 'size', label: 'Screen Size', type: 'select', options: ['27"', '32"', '49"'] }, qtyField(1)] },
    ]}]},
  ],
};

const CATALOG_NETWORKING = {
  id: 'networking', name: 'Networking', icon: 'router',
  brands: [
    { name: 'Cisco', families: [
      { name: 'Routers', models: [
        { id: 'cisco-isr-4000', name: 'Cisco ISR 4000 Series Router', image: P + 'network-cisco-isr-4000.webp', specLine: 'WAN aggregation · SD-WAN',
          desc: 'Enterprise-grade router for WAN aggregation, SD-WAN, and branch office deployments. Supports advanced security and QoS.',
          fields: networkFields(['Standard', 'SD-WAN', 'High-Availability Pair']) },
      ]},
      { name: 'Switches', models: [
        { id: 'cisco-catalyst-switch', name: 'Cisco Catalyst Managed Switch', image: P + 'network-cisco-catalyst-switch.webp', specLine: '24-port / 48-port · PoE+',
          desc: 'Managed gigabit switches for enterprise LAN infrastructure. Available in 24-port and 48-port with PoE+ configurations.',
          fields: networkFields(['Unmanaged', 'Managed', 'Managed + PoE+'], ['24-port', '48-port']) },
      ]},
    ]},
    { name: 'MikroTik', families: [{ name: 'Routers', models: [
      { id: 'mikrotik-routerboard', name: 'MikroTik RouterBoard', image: P + 'network-mikrotik-routerboard.webp', specLine: 'Routing & switching',
        desc: 'High-performance enterprise routing and switching at an excellent price point. Ideal for ISPs, SMEs, and multi-site networks.',
        fields: networkFields(['Standard', 'ISP Grade', 'Multi-Site']) },
    ]}]},
    { name: 'Ubiquiti', families: [{ name: 'Access Points', models: [
      { id: 'ubiquiti-ap', name: 'Ubiquiti UniFi Access Point', image: null, specLine: 'Wi-Fi 6 · PoE',
        desc: 'Enterprise wireless access point.', fields: networkFields(['Indoor', 'Outdoor', 'Long-Range']) },
    ]}]},
    { name: 'Fortinet', families: [{ name: 'Firewalls', models: [
      { id: 'fortinet-firewall', name: 'FortiGate Firewall / UTM', image: null, specLine: 'Security appliance',
        desc: 'Firewall and unified threat management appliance.', fields: networkFields(['Branch', 'Data Centre', 'SD-WAN']) },
    ]}]},
  ],
};

const CATALOG_SERVERS = {
  id: 'servers', name: 'Servers', icon: 'server',
  brands: [
    { name: 'Dell', families: [{ name: 'PowerEdge', models: [
      { id: 'dell-poweredge', name: 'Dell PowerEdge Server', image: null, specLine: '1U / 2U / Tower',
        desc: 'High-performance rack and tower servers for enterprise workloads. Available in 1U, 2U, and tower. Custom configurations on request.',
        fields: serverFields(['16GB', '32GB', '64GB', '128GB+'], ['1TB HDD', '2TB HDD', '4x 1TB SSD RAID'], ['1U Rack', '2U Rack', 'Tower']) },
    ]}]},
    { name: 'HP', families: [{ name: 'ProLiant', models: [
      { id: 'hp-proliant', name: 'HP ProLiant Server', image: null, specLine: 'Rack / Tower · iLO',
        desc: 'Reliable ProLiant rack and tower servers for virtualization, databases, and business applications. HPE iLO remote management included.',
        fields: serverFields(['16GB', '32GB', '64GB', '128GB+'], ['1TB HDD', '2TB HDD', '4x 1TB SSD RAID'], ['1U Rack', '2U Rack', 'Tower']) },
    ]}]},
    { name: 'Lenovo', families: [{ name: 'ThinkSystem', models: [
      { id: 'lenovo-thinksystem', name: 'Lenovo ThinkSystem Server', image: null, specLine: 'Rack server',
        desc: 'Enterprise rack server.', fields: serverFields(['16GB', '32GB', '64GB'], ['1TB HDD', '2TB HDD'], ['1U Rack', '2U Rack']) },
    ]}]},
  ],
};

const CATALOG_PRINTERS = {
  id: 'printers', name: 'Printers', icon: 'printer',
  brands: [
    { name: 'HP', families: [{ name: 'LaserJet', models: [
      { id: 'hp-laserjet', name: 'HP LaserJet Printer', image: null, specLine: 'Mono / Color · Network-ready',
        desc: 'Business laser printer.', fields: [{ key: 'type', label: 'Type', type: 'select', options: ['Mono', 'Color', 'All-in-One'] }, simpleFields(CONDITION_NEW_ONLY)[0], qtyField(1)] },
    ]}]},
    { name: 'Canon', families: [{ name: 'imageCLASS', models: [
      { id: 'canon-imageclass', name: 'Canon imageCLASS Printer', image: null, specLine: 'Mono / Color',
        desc: 'Office printer.', fields: [{ key: 'type', label: 'Type', type: 'select', options: ['Mono', 'Color', 'All-in-One'] }, qtyField(1)] },
    ]}]},
    { name: 'Epson', families: [{ name: 'EcoTank', models: [
      { id: 'epson-ecotank', name: 'Epson EcoTank Printer', image: null, specLine: 'Refillable ink tank',
        desc: 'Low-cost-per-page ink tank printer.', fields: [qtyField(1)] },
    ]}]},
  ],
};

const CATALOG_GAMING = {
  id: 'gaming', name: 'Gaming', icon: 'gaming',
  brands: [
    { name: 'Sony', families: [{ name: 'PlayStation', models: [
      { id: 'ps5', name: 'PlayStation 5', image: null, specLine: 'Standard / Digital Edition',
        desc: 'Sourced to order — new or refurbished.', fields: simpleFields(CONDITION_NEW_REFURB) },
      { id: 'ps4', name: 'PlayStation 4', image: null, specLine: 'Standard / Pro',
        desc: 'Sourced to order — new or refurbished.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'Microsoft', families: [{ name: 'Xbox', models: [
      { id: 'xbox-series-x', name: 'Xbox Series X', image: null, specLine: '1TB',
        desc: 'Sourced to order — new or refurbished.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'Nintendo', families: [{ name: 'Switch', models: [
      { id: 'nintendo-switch', name: 'Nintendo Switch', image: null, specLine: 'Standard / OLED',
        desc: 'Sourced to order — new or refurbished.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
  ],
};

const CATALOG_AUDIO = {
  id: 'audio', name: 'Audio', icon: 'audio',
  brands: [
    { name: 'Apple', families: [{ name: 'AirPods', models: [
      { id: 'airpods-pro', name: 'AirPods Pro', image: null, specLine: 'Active noise cancellation', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'JBL', families: [{ name: 'Speakers', models: [
      { id: 'jbl-speaker', name: 'JBL Bluetooth Speaker', image: null, specLine: 'Portable · Bluetooth', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_ONLY) },
    ]}]},
    { name: 'Sony', families: [{ name: 'Headphones', models: [
      { id: 'sony-headphones', name: 'Sony Noise-Cancelling Headphones', image: null, specLine: 'Over-ear · Wireless', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
  ],
};

const CATALOG_WATCHES = {
  id: 'watches', name: 'Smart Watches', icon: 'watch',
  brands: [
    { name: 'Apple', families: [{ name: 'Apple Watch', models: [
      { id: 'apple-watch-series-9', name: 'Apple Watch Series 9', image: null, specLine: '41mm / 45mm', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
      { id: 'apple-watch-ultra', name: 'Apple Watch Ultra 2', image: null, specLine: '49mm', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'Samsung', families: [{ name: 'Galaxy Watch', models: [
      { id: 'galaxy-watch-6', name: 'Galaxy Watch 6', image: null, specLine: '40mm / 44mm', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
  ],
};

const CATALOG_CAMERAS = {
  id: 'cameras', name: 'Cameras', icon: 'camera',
  brands: [
    { name: 'Canon', families: [{ name: 'EOS', models: [
      { id: 'canon-eos', name: 'Canon EOS Camera', image: null, specLine: 'Mirrorless / DSLR', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'Sony', families: [{ name: 'Alpha', models: [
      { id: 'sony-alpha', name: 'Sony Alpha Camera', image: null, specLine: 'Mirrorless', desc: 'Sourced to order.', fields: simpleFields(CONDITION_NEW_REFURB) },
    ]}]},
    { name: 'Hikvision', families: [{ name: 'CCTV', models: [
      { id: 'hikvision-cctv', name: 'Hikvision CCTV Camera', image: null, specLine: 'Indoor / Outdoor · IP', desc: 'Supply and installation.', fields: [{ key: 'configuration', label: 'Configuration', type: 'select', options: ['Single Camera', '4-Camera Kit', '8-Camera Kit', 'Custom'] }, qtyField(1)] },
    ]}]},
  ],
};

const CATALOG_ACCESSORIES = {
  id: 'accessories', name: 'Accessories', icon: 'accessory',
  brands: [
    { name: 'Various', families: [
      { name: 'Chargers & Cables', models: [ { id: 'charger-cable', name: 'Chargers & Charging Cables', image: null, specLine: 'USB-C · Lightning · Wireless', desc: 'Genuine and compatible charging accessories.', fields: simpleFields(CONDITION_NEW_ONLY) } ]},
      { name: 'Cases & Screen Protectors', models: [ { id: 'cases-protectors', name: 'Cases & Screen Protectors', image: null, specLine: 'Phone · Tablet · Laptop', desc: 'Protective accessories for your devices.', fields: simpleFields(CONDITION_NEW_ONLY) } ]},
      { name: 'Power Banks', models: [ { id: 'power-bank', name: 'Power Banks', image: null, specLine: '10,000mAh · 20,000mAh', desc: 'Portable charging.', fields: simpleFields(CONDITION_NEW_ONLY) } ]},
    ]},
  ],
};

/* =============================================================================
 * FIBER & CABLING  (existing real products, now with real photos already on file)
 * ============================================================================= */
const CATALOG_FIBER = {
  id: 'fiber', name: 'Fiber & Cabling', icon: 'fiber',
  brands: [
    { name: 'LAVAALL Supply', families: [
      { name: 'Fiber Optic', models: [
        { id: 'fiber-optic-cable', name: 'Fiber Optic Cable', image: P + 'category-fiber-optic-cable.webp', specLine: 'Single-mode & multi-mode',
          desc: 'Single-mode and multi-mode fiber optic cables for indoor and outdoor runs. Available in custom lengths, armoured options, and bulk drums.',
          fields: [{ key: 'configuration', label: 'Configuration', type: 'select', options: ['Single-Mode', 'Multi-Mode', 'Armoured'] }, qtyField(1)] },
      ]},
      { name: 'Structured Cabling', models: [
        { id: 'structured-cabling', name: 'Structured Cabling (Cat6/Cat6A)', image: P + 'category-structured-cabling.webp', specLine: 'Cat6 / Cat6A · Patch panels',
          desc: 'Complete structured cabling kits — Cat6, Cat6A, patch panels, keystones, face plates, and cable trays. Supply only or full installation available.',
          fields: [{ key: 'configuration', label: 'Configuration', type: 'select', options: ['Cat6', 'Cat6A'] }, qtyField(1)] },
      ]},
    ]},
  ],
};

/* =============================================================================
 * ELECTRICAL / HVAC / REFRIGERATION — migrated from the earlier catalogue
 * expansion, real vetted photos already on file (images/products/).
 * ============================================================================= */
const CATALOG_CABLES = {
  id: 'cables', name: 'Cables & Accessories', icon: 'cable',
  brands: [{ name: 'Various', families: [
    { name: 'Armoured & Flex Cables', models: [
      { id: 'cable-armoured-15mm', name: '1.5mm 4-Core Armoured Cable', image: P + 'cables-armoured-reel.jpg', specLine: '4-core · Armoured', desc: 'Supplied by the reel or in custom lengths.', fields: simpleFields() },
      { id: 'cable-35mm-single', name: '35mm Single-Core Cable', image: P + 'cables-35mm-single-core.jpg', specLine: 'Single-core', desc: 'Supplied by the reel or in custom lengths.', fields: simpleFields() },
      { id: 'cable-05mm-flex', name: '0.5mm 2-Core Flex Cable', image: P + 'cables-05mm-flex.jpg', specLine: '2-core flex', desc: 'Supplied by the roll.', fields: simpleFields() },
      { id: 'cable-10mm-flex', name: '10mm 4-Core Flex Cable', image: P + 'cables-flex-closeup.jpg', specLine: '4-core flex', desc: 'Supplied by the roll.', fields: simpleFields() },
      { id: 'cable-16mm-flex', name: '16mm 4-Core Flex Cable', image: P + 'cables-16mm-flex.jpg', specLine: '4-core flex', desc: 'Supplied by the roll.', fields: simpleFields() },
    ]},
    { name: 'Cable Joint Kits', models: [
      { id: 'joint-kit-m11', name: 'Cable Joint Kit M11', image: P + 'cables-joint-install.jpg', specLine: 'Joint kit', desc: 'Professional cable jointing kit.', fields: simpleFields() },
      { id: 'joint-kit-m12', name: 'Cable Joint Kit M12', image: P + 'cables-joint-m12.jpg', specLine: 'Joint kit', desc: 'Professional cable jointing kit.', fields: simpleFields() },
      { id: 'joint-kit-m15', name: 'Cable Joint Kit M15', image: P + 'cables-joint-m15.jpg', specLine: 'Joint kit', desc: 'Professional cable jointing kit.', fields: simpleFields() },
      { id: 'joint-kit-m16', name: 'Cable Joint Kit M16', image: P + 'cables-joint-m16.jpg', specLine: 'Joint kit', desc: 'Professional cable jointing kit.', fields: simpleFields() },
    ]},
    { name: 'Starlink Cable Kits', models: [
      { id: 'starlink-kit-45m', name: 'Starlink 45m Cable Kit (Gen 3)', image: P + 'cables-starlink-kit.jpg', specLine: '45m · Gen 3', desc: 'Starlink extension cable kit.', fields: simpleFields() },
    ]},
  ]}],
};

const CATALOG_SWITCHES = {
  id: 'switches', name: 'Switches & Sockets', icon: 'switch',
  brands: [{ name: 'Havells / Larsen & Toubro', families: [
    { name: 'DOL Starter Switches', models: [
      { id: 'dol-10hp-lt', name: '10HP DOL Starter (Larsen & Toubro)', image: P + 'switch-lt-dol-10hp.jpg', specLine: '10HP', desc: 'DOL starter switch.', fields: simpleFields() },
      { id: 'dol-20hp-havells', name: '20HP DOL Starter (Havells)', image: P + 'switch-havells-dol-20hp.jpg', specLine: '20HP', desc: 'DOL starter switch.', fields: simpleFields() },
    ]},
    { name: 'Changeover Switches', models: [
      { id: 'changeover-100a', name: '100A 4-Pole Rotary Changeover (Havells)', image: P + 'switch-havells-100a.jpg', specLine: '100A · 4-pole', desc: 'Rotary changeover switch.', fields: simpleFields() },
      { id: 'changeover-200a', name: '200A TP&N Changeover Switch', image: P + 'switch-changeover-200a.jpg', specLine: '200A · TP&N', desc: 'Changeover switch for electrical panels.', fields: simpleFields() },
    ]},
    { name: 'Sockets & Couplers', models: [
      { id: 'socket-13a-single', name: '13A Single Socket (Gold)', image: P + 'switch-legrand-socket.jpg', specLine: '13A single', desc: 'Gold-finish single socket.', fields: simpleFields() },
      { id: 'socket-13a-twin', name: '13A Twin Socket (Gold)', image: P + 'switch-socket-13a-twin.jpg', specLine: '13A twin', desc: 'Gold-finish twin socket with USB.', fields: simpleFields() },
      { id: 'socket-16a-industrial', name: '16A 3-Pin Industrial Socket', image: P + 'switch-industrial-socket.jpg', specLine: '16A · 3-pin', desc: 'Industrial socket.', fields: simpleFields() },
      { id: 'coupler-16a', name: '16A 3-Pin Coupler', image: P + 'switch-coupler-16a.jpg', specLine: '16A · 3-pin', desc: 'Industrial coupler.', fields: simpleFields() },
    ]},
  ]}],
};

const CATALOG_POWER = {
  id: 'power', name: 'Power Regulation', icon: 'power',
  brands: [{ name: 'Andeli', families: [
    { name: 'Single-Phase Stabilizers', models: [
      { id: 'stabilizer-1000w', name: 'Andeli 1000W Voltage Stabilizer', image: P + 'power-andeli-1000w.jpg', specLine: '1000W', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-2000w', name: 'Andeli 2000W Voltage Stabilizer', image: P + 'power-andeli-2000w.jpg', specLine: '2000W', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-3000w', name: 'Andeli 3000W Voltage Stabilizer', image: P + 'power-andeli-3000w.jpg', specLine: '3000W', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-5000w', name: 'Andeli 5000W Voltage Stabilizer', image: P + 'power-andeli-5000w.jpg', specLine: '5000W', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-10kva', name: 'Andeli 10KVA Voltage Stabilizer', image: P + 'power-andeli-10kva.jpg', specLine: '10KVA', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-15kva', name: 'Andeli 15KVA Voltage Stabilizer', image: P + 'power-andeli-15kva.jpg', specLine: '15KVA · Single-phase', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-20kva-1p', name: 'Andeli 20KVA Voltage Stabilizer (Single-Phase)', image: null, specLine: '20KVA · Single-phase', desc: 'Contact us to confirm current stock/photo for this size.', fields: simpleFields() },
    ]},
    { name: '3-Phase Stabilizers', models: [
      { id: 'stabilizer-20kva-3p', name: 'Andeli 20KVA Voltage Stabilizer (3-Phase)', image: null, specLine: '20KVA · 3-phase', desc: 'Contact us to confirm current stock/photo for this size.', fields: simpleFields() },
      { id: 'stabilizer-30kva', name: 'Andeli 30KVA Voltage Stabilizer (3-Phase)', image: P + 'power-andeli-30kva.jpg', specLine: '30KVA · 3-phase', desc: 'AC automatic voltage stabilizer.', fields: simpleFields() },
      { id: 'stabilizer-50kva', name: 'Andeli 50KVA Voltage Stabilizer (3-Phase)', image: null, specLine: '50KVA · 3-phase', desc: 'Contact us to confirm current stock/photo for this size.', fields: simpleFields() },
    ]},
    { name: 'Transformers', models: [
      { id: 'transformer-2000w', name: '2000W Step Up/Down Transformer', image: P + 'power-transformer.jpg', specLine: '2000W', desc: 'Step up/down voltage transformer.', fields: simpleFields() },
    ]},
  ]}],
};

const CATALOG_HVAC = {
  id: 'hvac', name: 'HVAC & Cooling', icon: 'hvac',
  brands: [{ name: 'Various', families: [
    { name: 'Compressors', models: [
      { id: 'ac-compressor-12000btu', name: '12,000 BTU Rotary AC Compressor', image: P + 'hvac-compressor.jpg', specLine: '12,000 BTU', desc: 'Rotary air conditioner compressor.', fields: simpleFields() },
    ]},
    { name: 'Mounting Brackets', models: [
      { id: 'ac-bracket-1ton', name: '1-Ton Mini-Split Wall Bracket', image: P + 'hvac-mount-bracket.jpg', specLine: '1 Ton', desc: 'Wall mounting bracket for mini-split AC units.', fields: simpleFields() },
    ]},
  ]}],
};

const CATALOG_REFRIGERATION = {
  id: 'refrigeration', name: 'Refrigeration', icon: 'fridge',
  brands: [{ name: 'Various', families: [{ name: 'Refrigerators & Freezers', models: [
    { id: 'refrigerator-compact', name: 'Compact Refrigerator', image: P + 'appliance-compact-refrigerator.webp', specLine: 'Small kitchen / office use', desc: 'Compact refrigerators for homes, shops, and offices. Doorstep delivery available depending on location.', fields: simpleFields(CONDITION_NEW_ONLY) },
    { id: 'refrigerator-full', name: 'Full-Size Refrigerator', image: null, specLine: 'Full-size · Family use', desc: 'Full-size refrigerators. Doorstep delivery available depending on location.', fields: simpleFields(CONDITION_NEW_ONLY) },
    { id: 'freezer-chest', name: 'Chest Freezer', image: null, specLine: 'Chest style', desc: 'Chest freezers for commercial and home use.', fields: simpleFields(CONDITION_NEW_ONLY) },
    { id: 'freezer-upright', name: 'Upright Freezer', image: null, specLine: 'Upright style', desc: 'Upright freezers for commercial and home use.', fields: simpleFields(CONDITION_NEW_ONLY) },
  ]}]}],
};

/* =============================================================================
 * OVERVIEW SPOTLIGHT — drives the Layer-1 "original card" grid on the
 * Products section. Each entry either points at one specific real model
 * (path: [categoryId, brandName, familyName, modelId] -> direct "Request
 * Quote" + "Browse Category" into that family) or, for lines that don't yet
 * have a single flagship product photo, just a category teaser (categoryOnly
 * -> "Browse Category" only, no fake product to quote directly).
 * Kept short deliberately — this is the entry overview, not the full catalog.
 * ============================================================================= */
const CATALOG_OVERVIEW = [
  // networking — the three products this system was proven against first
  { path: ['networking', 'Cisco', 'Routers', 'cisco-isr-4000'] },
  { path: ['networking', 'Cisco', 'Switches', 'cisco-catalyst-switch'] },
  { path: ['networking', 'MikroTik', 'Routers', 'mikrotik-routerboard'] },
  // servers
  { path: ['servers', 'Dell', 'PowerEdge', 'dell-poweredge'] },
  { path: ['servers', 'HP', 'ProLiant', 'hp-proliant'] },
  // computers
  { path: ['computers', 'Dell', 'OptiPlex', 'dell-optiplex-workstation'] },
  { path: ['computers', 'HP', 'ProBook', 'hp-probook-laptop'] },
  // fiber & structured cabling
  { path: ['fiber', 'LAVAALL Supply', 'Fiber Optic', 'fiber-optic-cable'] },
  { path: ['fiber', 'LAVAALL Supply', 'Structured Cabling', 'structured-cabling'] },
  // electrical supplies
  { path: ['cables', 'Various', 'Armoured & Flex Cables', 'cable-armoured-15mm'] },
  { path: ['switches', 'Havells / Larsen & Toubro', 'Changeover Switches', 'changeover-100a'] },
  { path: ['power', 'Andeli', 'Single-Phase Stabilizers', 'stabilizer-1000w'] },
  // hvac & refrigeration
  { path: ['hvac', 'Various', 'Compressors', 'ac-compressor-12000btu'] },
  { path: ['refrigeration', 'Various', 'Refrigerators & Freezers', 'refrigerator-compact'] },
  // consumer electronics — category teasers. image (when present) is an
  // official manufacturer marketing shot representing the category in
  // general, NOT a claim that this is one exact SKU we stock.
  { categoryOnly: 'phones', image: P + 'category-phones.webp' },
  { categoryOnly: 'tvs', image: P + 'category-tvs.webp' },
  { categoryOnly: 'monitors', image: P + 'category-monitors.webp' },
  { categoryOnly: 'gaming', image: P + 'category-gaming.webp' },
  { categoryOnly: 'audio', image: P + 'category-audio.webp' },
  { categoryOnly: 'watches', image: P + 'category-watches.webp' },
  { categoryOnly: 'cameras', image: P + 'category-cameras.webp' },
  { categoryOnly: 'printers', image: P + 'category-printers.webp' },
  { categoryOnly: 'accessories', image: P + 'category-accessories.webp' },
  { categoryOnly: 'tablets', image: P + 'category-tablets.webp' },
];

/* =============================================================================
 * CATEGORY QUOTE FIELDS — drives the "Request Quote" panel for the generic
 * category-teaser overview cards (Phones, TVs, Monitors, ...). This is a
 * sourcing enquiry, not a specific-model order, so fields are all optional
 * preferences ("No preference" is always offered) rather than exact specs.
 * ============================================================================= */
const NO_PREF = 'No preference';
const CATEGORY_QUOTE_FIELDS = {
  phones: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Apple', 'Samsung', 'Google', 'Tecno', 'Infinix', 'Motorola', 'Xiaomi', 'OnePlus', NO_PREF] },
    { key: 'preference', label: 'Model / Preference', type: 'text', placeholder: 'e.g. iPhone 15, or "budget Android"' },
    { key: 'storage', label: 'Storage', type: 'select', options: ['64GB', '128GB', '256GB', '512GB', NO_PREF] },
    qtyField(1),
  ],
  tablets: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Apple', 'Samsung', 'Lenovo', NO_PREF] },
    { key: 'size', label: 'Screen Size', type: 'select', options: ['8"', '10"', '11"', '13"', NO_PREF] },
    { key: 'storage', label: 'Storage', type: 'select', options: ['64GB', '128GB', '256GB', NO_PREF] },
    qtyField(1),
  ],
  tvs: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['LG', 'Samsung', 'Sony', 'TCL', 'Hisense', 'Vizio', NO_PREF] },
    { key: 'size', label: 'Screen Size', type: 'select', options: TV_SIZES.concat(NO_PREF) },
    { key: 'technology', label: 'Technology', type: 'select', options: ['OLED', 'QLED', 'Neo QLED', 'UHD', NO_PREF] },
    qtyField(1),
  ],
  monitors: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Dell', 'LG', 'Samsung', NO_PREF] },
    { key: 'size', label: 'Screen Size', type: 'select', options: ['24"', '27"', '32"', '34"', '49"', NO_PREF] },
    { key: 'resolution', label: 'Resolution', type: 'select', options: ['1080p', '1440p', '4K', NO_PREF] },
    qtyField(1),
  ],
  gaming: [
    { key: 'platform', label: 'Preferred Platform', type: 'select', options: ['PlayStation 5', 'Xbox Series X', 'Nintendo Switch', NO_PREF] },
    qtyField(1),
  ],
  audio: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Apple', 'JBL', 'Sony', NO_PREF] },
    { key: 'type', label: 'Type', type: 'select', options: ['Earbuds', 'Headphones', 'Speaker', NO_PREF] },
    qtyField(1),
  ],
  watches: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Apple', 'Samsung', NO_PREF] },
    qtyField(1),
  ],
  cameras: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['Canon', 'Sony', 'Hikvision (CCTV)', NO_PREF] },
    { key: 'type', label: 'Type', type: 'select', options: ['Mirrorless', 'DSLR', 'CCTV', NO_PREF] },
    qtyField(1),
  ],
  printers: [
    { key: 'brand', label: 'Preferred Brand', type: 'select', options: ['HP', 'Canon', 'Epson', NO_PREF] },
    { key: 'type', label: 'Type', type: 'select', options: ['Mono', 'Color', 'All-in-One', NO_PREF] },
    qtyField(1),
  ],
  accessories: [
    { key: 'type', label: 'Type', type: 'select', options: ['Chargers & Cables', 'Cases & Screen Protectors', 'Power Banks', NO_PREF] },
    qtyField(1),
  ],
};

/* =============================================================================
 * FULL CATALOG
 * ============================================================================= */
const CATALOG = [
  CATALOG_PHONES,
  CATALOG_TABLETS,
  CATALOG_COMPUTERS,
  CATALOG_TVS,
  CATALOG_MONITORS,
  CATALOG_NETWORKING,
  CATALOG_SERVERS,
  CATALOG_PRINTERS,
  CATALOG_GAMING,
  CATALOG_AUDIO,
  CATALOG_WATCHES,
  CATALOG_CAMERAS,
  CATALOG_ACCESSORIES,
  CATALOG_FIBER,
  CATALOG_CABLES,
  CATALOG_SWITCHES,
  CATALOG_POWER,
  CATALOG_HVAC,
  CATALOG_REFRIGERATION,
];

// Browser QA consumes only this small public traversal manifest. Keeping it
// alongside the runtime catalog lets release checks discover every customer
// category without maintaining a second, fragile category list.
if (typeof window !== 'undefined') {
  window.LAVAALL_CATALOG_CATEGORY_IDS = CATALOG.map((category) => category.id);
}
