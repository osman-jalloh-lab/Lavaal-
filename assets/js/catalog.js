/*
 * catalog.js — LAVAALL product catalogue browser
 * ============================================================================
 * Renders CATALOG (from catalog-data.js) into #catalog-root as a drill-down
 * browser: Category -> Brand -> Family -> Model, with breadcrumbs, search,
 * and hash-based routing (#products/<category>/<brand>/<family>).
 *
 * Reuses the existing #pgal-overlay modal (already in index.html) as the
 * per-model "quote" panel, and the existing SecurityUtils object (defined in
 * the main inline script, loaded before this file) for sanitizing text that
 * goes into WhatsApp/email links — same security posture as the rest of the
 * site, no new sanitization logic invented here.
 * ============================================================================
 */

(function () {
  'use strict';

  const root = document.getElementById('catalog-root');
  const crumbEl = document.getElementById('catalog-breadcrumbs');
  const searchInput = document.getElementById('catalog-search');
  const overviewEl = document.getElementById('catalog-overview');
  const overviewGrid = document.getElementById('catalog-overview-grid');
  const browserEl = document.getElementById('catalog-browser');
  const backBtn = document.getElementById('catalog-back-btn');
  if (!root) return; // catalog markup not present on this page

  /* ---------------------------------------------------------------------
   * Icons — simple inline line-art SVGs, used for category cards and as
   * the placeholder shown inside .product-image when a model has no photo.
   * ------------------------------------------------------------------- */
  const ICONS = {
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
    laptop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M2 18h20l-1.5 2h-17z"/>',
    tv: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
    monitor: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 15v5"/>',
    router: '<circle cx="12" cy="12" r="3"/><path d="M4 12a8 8 0 0 1 16 0M2 12a10 10 0 0 1 20 0"/>',
    server: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><circle cx="8" cy="7" r=".6" fill="currentColor"/><circle cx="8" cy="17" r=".6" fill="currentColor"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6 17h12v4H6z"/>',
    gaming: '<rect x="3" y="8" width="18" height="9" rx="4"/><line x1="7" y1="12.5" x2="7" y2="12.5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="16" cy="11" r=".8" fill="currentColor"/><circle cx="18" cy="13" r=".8" fill="currentColor"/>',
    audio: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6V3h6v3M9 18v3h6v-3"/>',
    camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    accessory: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    fiber: '<path d="M4 12c4-6 12-6 16 0"/><path d="M7 15c2.5-3 7.5-3 10 0"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
    cable: '<path d="M4 4l16 16M8 4v4M4 8h4M16 16v4M16 20h4"/>',
    switch: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="16" y1="10" x2="16" y2="14"/>',
    power: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    hvac: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7"/>',
    fridge: '<rect x="6" y="2" width="12" height="20" rx="1.5"/><line x1="6" y1="9" x2="18" y2="9"/><line x1="9" y1="5" x2="9" y2="7"/><line x1="9" y1="12" x2="9" y2="14"/>',
    generic: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  };
  function iconSvg(key) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[key] || ICONS.generic) + '</svg>';
  }

  /* ---------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------- */
  function slugify(s) {
    return String(s).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function displayName(brand, model) {
    // avoid "Dell Dell OptiPlex" when the model name already includes the brand
    return model.name.toLowerCase().indexOf(brand.name.toLowerCase()) === 0
      ? model.name
      : brand.name + ' ' + model.name;
  }
  function findCategory(id) { return CATALOG.find(c => c.id === id); }
  function findBrand(cat, slug) { return cat && cat.brands.find(b => slugify(b.name) === slug); }
  function findFamily(brand, slug) { return brand && brand.families.find(f => slugify(f.name) === slug); }

  /* ---------------------------------------------------------------------
   * Verified generated-catalog boundary
   *
   * The handwritten CATALOG remains the Layer-1 source of truth. This loader
   * only adds records that have crossed every import and visual-approval gate
   * to their existing Layer-2 category. It intentionally ignores incomplete,
   * quarantined, remote, or review-only source records.
   * ------------------------------------------------------------------- */
  function generatedSpec(product, names) {
    const entry = (product.specifications || []).find(function (item) { return names.indexOf(item.name) !== -1 && item.value; });
    if (!entry) return null;
    const value = String(entry.value).trim();
    const unit = String(entry.unit || '').trim();
    return unit && !value.toLowerCase().endsWith(unit.toLowerCase()) ? value + ' ' + unit : value;
  }

  function isLocalCatalogPath(value) {
    return typeof value === 'string' && /^images\/catalog\/[a-z0-9/_-]+\.webp$/i.test(value);
  }

  function isApprovedGeneratedProduct(product) {
    if (!product || product.integrationApproved !== true) return false;
    if (product.identityStatus !== 'verified' || product.visualQaStatus !== 'PASS' || product.mediaUsageStatus !== 'permitted') return false;
    if (product.quarantined === true || product.identityStatus === 'quarantined') return false;
    if (!product.sourceProductId || !product.name || !product.brand || !(product.mpn || product.modelNumber)) return false;
    const paths = (product.images || []).map(function (image) { return image && (image.path || image.src); }).filter(isLocalCatalogPath);
    return paths.length > 0 && paths.indexOf(product.primaryImage) !== -1;
  }

  function generatedProductToModel(product) {
    const paths = [];
    (product.images || []).forEach(function (image) {
      const path = image && (image.path || image.src);
      if (isLocalCatalogPath(path) && paths.indexOf(path) === -1) paths.push(path);
    });
    const primary = product.primaryImage;
    const orderedPaths = [primary].concat(paths.filter(function (path) { return path !== primary; }));
    const specs = [
      generatedSpec(product, ['Display diagonal']),
      generatedSpec(product, ['Processor family', 'Processor model']),
      generatedSpec(product, ['Internal memory']),
      generatedSpec(product, ['Internal storage capacity']),
      generatedSpec(product, ['Display resolution', 'HD type'])
    ].filter(Boolean).slice(0, 4);
    const label = String(product.brand).trim() + ' ' + String(product.name).trim();
    return {
      id: 'icecat-' + String(product.sourceProductId),
      name: String(product.name).trim(),
      sourceProductId: String(product.sourceProductId),
      mpn: String(product.mpn || product.modelNumber),
      gtin: product.gtin ? String(product.gtin) : null,
      primaryImage: primary,
      images: orderedPaths.map(function (src, index) {
        return { src: src, alt: label + ' — image ' + (index + 1), isMain: index === 0 };
      }),
      specLine: specs.join(' · '),
      desc: product.shortDescription ? String(product.shortDescription).trim() : '',
      fields: [{ key: 'quantity', label: 'Quantity', type: 'number', min: 1, value: 1 }]
    };
  }

  function mergeApprovedGeneratedCatalog(catalog) {
    let added = 0;
    (catalog && Array.isArray(catalog.products) ? catalog.products : []).forEach(function (product) {
      if (!isApprovedGeneratedProduct(product)) return;
      const category = findCategory(slugify(product.category));
      if (!category) return; // Never manufacture a new Layer-1 category from source data.
      let brand = category.brands.find(function (item) { return slugify(item.name) === slugify(product.brand); });
      if (!brand) { brand = { name: String(product.brand).trim(), families: [] }; category.brands.push(brand); }
      // "Models" is a neutral browser grouping when the source does not offer
      // a family/series. It avoids inventing taxonomy while retaining depth.
      const familyName = String(product.family || product.series || 'Models').trim();
      let family = brand.families.find(function (item) { return item.name === familyName; });
      if (!family) { family = { name: familyName, models: [] }; brand.families.push(family); }
      const modelId = 'icecat-' + String(product.sourceProductId);
      if (family.models.some(function (model) { return model.id === modelId; })) return;
      family.models.push(generatedProductToModel(product));
      added += 1;
    });
    return added;
  }

  let generatedCatalogLoadStarted = false;
  function loadApprovedGeneratedCatalog() {
    if (generatedCatalogLoadStarted) return;
    generatedCatalogLoadStarted = true;
    // Production receives this deterministic bundle before catalog.js. It keeps
    // the verified Layer-2 catalog available even if a static JSON request is
    // delayed, rewritten, or unavailable on a hosting platform.
    if (window.LAVAALL_GENERATED_CATALOG) {
      if (mergeApprovedGeneratedCatalog(window.LAVAALL_GENERATED_CATALOG)) {
        overviewRendered = false;
        renderOverview();
        route(false);
      }
      return;
    }
    // JSON remains a development/backwards-compatible fallback only.
    const readCatalog = window.fetch
      ? fetch('assets/data/catalog-generated.json', { credentials: 'same-origin' })
          .then(function (response) { return response.ok ? response.json() : null; })
      : new Promise(function (resolve) {
          const request = new XMLHttpRequest();
          request.open('GET', 'assets/data/catalog-generated.json', true);
          request.onload = function () {
            if (request.status < 200 || request.status >= 300) { resolve(null); return; }
            try { resolve(JSON.parse(request.responseText)); } catch (error) { resolve(null); }
          };
          request.onerror = function () { resolve(null); };
          request.send();
        });
    readCatalog
      .then(function (catalog) {
        if (!mergeApprovedGeneratedCatalog(catalog)) return;
        overviewRendered = false;
        renderOverview();
        route(false);
      })
      // The handwritten catalog remains fully usable if generated data is not
      // deployed yet; do not turn an optional data fetch into a page failure.
      .catch(function () {});
  }

  function allModelsFlat() {
    const out = [];
    CATALOG.forEach(cat => cat.brands.forEach(brand => brand.families.forEach(fam => fam.models.forEach(model => {
      out.push({ model, category: cat, brand, family: fam });
    }))));
    return out;
  }

  /* ---------------------------------------------------------------------
   * Product image container — object-fit:contain, white background,
   * consistent across every shape. Falls back to a line-icon placeholder
   * on missing image or load error (no broken-image icons, ever).
   * ------------------------------------------------------------------- */
  function productImageHtml(imageUrl, alt, iconKey) {
    if (imageUrl) {
      return '<div class="product-image">' +
        '<img src="' + esc(imageUrl) + '" alt="' + esc(alt) + '" loading="lazy" ' +
        'onerror="this.closest(\'.product-image\').innerHTML=' + "'" + esc(placeholderInnerHtml(iconKey)).replace(/'/g, "\\'") + "'" + '">' +
        '</div>';
    }
    return '<div class="product-image ph">' + placeholderInnerHtml(iconKey) + '</div>';
  }
  function placeholderInnerHtml(iconKey) {
    return '<span class="product-image-icon">' + iconSvg(iconKey) + '</span>';
  }

  // Canonical frontend image adapter. Imported products provide primaryImage and
  // images[{src, alt, isMain, source, sourceProductId}], while the handwritten
  // catalog still uses image. Keep both shapes working at the UI boundary.
  function productImages(model, fallbackAlt) {
    const images = [];
    const add = function (value, isMain) {
      const src = typeof value === 'string' ? value : value && (value.src || value.path);
      if (!src || images.some(function (image) { return image.src === src; })) return;
      images.push({ src: src, alt: value && value.alt, isMain: Boolean(isMain || (value && value.isMain)) });
    };
    add(model.primaryImage, true);
    (Array.isArray(model.images) ? model.images : []).forEach(function (image) { add(image, image && image.isMain); });
    add(model.image, !images.length);
    return images.map(function (image, index) {
      return { ...image, alt: image.alt || (fallbackAlt + ' — image ' + (index + 1)) };
    });
  }

  function primaryProductImage(model, fallbackAlt) {
    return productImages(model, fallbackAlt)[0] || null;
  }

  /* ---------------------------------------------------------------------
   * Breadcrumbs
   * ------------------------------------------------------------------- */
  function renderBreadcrumbs(parts) {
    // parts: [{label, hash}] — last item is not a link
    crumbEl.innerHTML = '';
    parts.forEach((p, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'crumb-sep';
        sep.textContent = '›';
        crumbEl.appendChild(sep);
      }
      if (i === parts.length - 1) {
        const span = document.createElement('span');
        span.className = 'crumb-current';
        span.textContent = p.label;
        crumbEl.appendChild(span);
      } else {
        const a = document.createElement('a');
        a.href = p.hash;
        a.className = 'crumb-link';
        a.textContent = p.label;
        crumbEl.appendChild(a);
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Card grid renderers
   * ------------------------------------------------------------------- */
  function renderCategoryGrid() {
    renderBreadcrumbs([{ label: 'Products', hash: '#products' }]);
    const cards = CATALOG.map(cat => {
      const count = cat.brands.reduce((n, b) => n + b.families.reduce((m, f) => m + f.models.length, 0), 0);
      return '<a class="cat-card" href="#products/' + cat.id + '">' +
        '<span class="cat-card-icon">' + iconSvg(cat.icon) + '</span>' +
        '<span class="cat-card-name">' + esc(cat.name) + '</span>' +
        '<span class="cat-card-count">' + count + (count === 1 ? ' model' : ' models') + '</span>' +
        '</a>';
    }).join('');
    root.innerHTML = '<div class="cat-grid">' + cards + '</div>';
  }

  function renderBrandGrid(cat) {
    renderBreadcrumbs([
      { label: 'Products', hash: '#products' },
      { label: cat.name, hash: '#products/' + cat.id },
    ]);
    const cards = cat.brands.map(brand => {
      const count = brand.families.reduce((m, f) => m + f.models.length, 0);
      return '<a class="cat-card" href="#products/' + cat.id + '/' + slugify(brand.name) + '">' +
        '<span class="cat-card-icon">' + iconSvg(cat.icon) + '</span>' +
        '<span class="cat-card-name">' + esc(brand.name) + '</span>' +
        '<span class="cat-card-count">' + count + (count === 1 ? ' model' : ' models') + '</span>' +
        '</a>';
    }).join('');
    root.innerHTML = '<div class="cat-grid">' + cards + '</div>';
  }

  function renderFamilyGrid(cat, brand) {
    renderBreadcrumbs([
      { label: 'Products', hash: '#products' },
      { label: cat.name, hash: '#products/' + cat.id },
      { label: brand.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) },
    ]);
    const cards = brand.families.map(fam => {
      return '<a class="cat-card" href="#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name) + '">' +
        '<span class="cat-card-icon">' + iconSvg(cat.icon) + '</span>' +
        '<span class="cat-card-name">' + esc(fam.name) + '</span>' +
        '<span class="cat-card-count">' + fam.models.length + (fam.models.length === 1 ? ' model' : ' models') + '</span>' +
        '</a>';
    }).join('');
    root.innerHTML = '<div class="cat-grid">' + cards + '</div>';
  }

  function modelCardHtml(model, cat, brand, fam) {
    const primary = primaryProductImage(model, displayName(brand, model));
    const img = productImageHtml(primary && primary.src, primary ? primary.alt : displayName(brand, model), cat.icon);
    return '<div class="model-card" data-model-id="' + esc(model.id) + '">' +
      img +
      '<div class="model-card-body">' +
      '<div class="model-card-brand">' + esc(brand.name) + '</div>' +
      '<div class="model-card-name">' + esc(model.name) + '</div>' +
      '<div class="model-card-spec">' + esc(model.specLine || '') + '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button type="button" class="pbtn model-details-btn" style="flex:1">View Details</button>' +
      '<button type="button" class="pbtn model-quote-btn" style="flex:1">Request Quote &#9662;</button>' +
      '</div>' +
      '</div></div>';
  }

  function renderModelGrid(cat, brand, fam) {
    renderBreadcrumbs([
      { label: 'Products', hash: '#products' },
      { label: cat.name, hash: '#products/' + cat.id },
      { label: brand.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) },
      { label: fam.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name) },
    ]);
    const cards = fam.models.map(model => modelCardHtml(model, cat, brand, fam)).join('');
    root.innerHTML = '<div class="model-grid">' + cards + '</div>';
    wireModelCards(root, cat, brand, fam);
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    crumbEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'crumb-current';
    label.textContent = 'Search results for “' + query.trim() + '”';
    crumbEl.appendChild(label);

    const matches = allModelsFlat().filter(({ model, category, brand, family }) => {
      const hay = [model.name, model.specLine, model.mpn, model.modelNumber, model.gtin, brand.name, family.name, category.name].join(' ').toLowerCase();
      return q.split(/\s+/).every(term => hay.indexOf(term) !== -1);
    }).slice(0, 60);

    if (!matches.length) {
      root.innerHTML = '<p class="catalog-empty">No products match “' + esc(query.trim()) + '”. Try a different term, or <a href="#products">browse all categories</a>.</p>';
      return;
    }

    const cards = matches.map(({ model, category, brand, family }) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = modelCardHtml(model, category, brand, family);
      const card = wrap.firstElementChild;
      const pathTag = document.createElement('div');
      pathTag.className = 'model-card-path';
      pathTag.textContent = category.name + ' › ' + brand.name + ' › ' + family.name;
      card.querySelector('.model-card-body').insertBefore(pathTag, card.querySelector('.model-card-name'));
      return card.outerHTML;
    }).join('');
    root.innerHTML = '<div class="model-grid">' + cards + '</div>';

    // wire each result card against its own category/brand/family context
    root.querySelectorAll('.model-card').forEach(cardEl => {
      const id = cardEl.getAttribute('data-model-id');
      const hit = matches.find(m => m.model.id === id);
      if (!hit) return;
      cardEl.addEventListener('click', e => {
        if (e.target.closest('.model-quote-btn') || e.target.closest('.model-details-btn')) {
          openModelQuote(hit.model, hit.category, hit.brand, hit.family);
        }
      });
    });
  }

  function wireModelCards(container, cat, brand, fam) {
    container.querySelectorAll('.model-card').forEach(cardEl => {
      const id = cardEl.getAttribute('data-model-id');
      const model = fam.models.find(m => m.id === id);
      if (!model) return;
      cardEl.addEventListener('click', e => {
        if (e.target.closest('.model-quote-btn') || e.target.closest('.model-details-btn')) {
          openModelQuote(model, cat, brand, fam);
        }
      });
    });
  }

  /* ---------------------------------------------------------------------
   * LAYER 1 — product overview (original prod-card grid). Shown by default;
   * "Browse Category" hands off into Layer 2 (the drill-down browser below).
   * "Request Quote" on a spotlighted product opens the model quote panel
   * directly, same as it always did — browsing is never forced on someone
   * who already knows what they want.
   * ------------------------------------------------------------------- */
  function resolveOverviewEntry(entry) {
    if (entry.categoryOnly) {
      const cat = findCategory(entry.categoryOnly);
      if (!cat) return null;
      return { cat: cat, isCategory: true, image: entry.image || null, browseHash: '#products/' + cat.id };
    }
    const catId = entry.path[0], brandName = entry.path[1], famName = entry.path[2], modelId = entry.path[3];
    const cat = findCategory(catId);
    if (!cat) return null;
    const brand = cat.brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
    if (!brand) return null;
    const fam = brand.families.find(f => f.name.toLowerCase() === famName.toLowerCase());
    if (!fam) return null;
    const model = fam.models.find(m => m.id === modelId);
    if (!model) return null;
    return {
      cat: cat, brand: brand, fam: fam, model: model,
      browseHash: '#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name),
    };
  }

  function overviewCardHtml(resolved) {
    if (resolved.isCategory) {
      const cat = resolved.cat;
      const brandList = cat.brands.map(function (b) { return b.name; }).slice(0, 4).join(', ');
      const imgHtml = productImageHtml(resolved.image, cat.name, cat.icon)
        .replace('class="product-image"', 'class="product-image" style="height:230px;"')
        .replace('class="product-image ph"', 'class="product-image ph" style="height:230px;"');
      return '<div class="prod-card" data-overview-category="' + esc(cat.id) + '">' +
        imgHtml +
        '<div class="prod-info">' +
        '<h3>' + esc(cat.name) + '</h3>' +
        '<p>Browse ' + esc(brandList) + ' and more.</p>' +
        '<div style="display:flex;gap:10px;">' +
        '<button type="button" class="pbtn overview-quote-btn" style="flex:1;">Request Quote</button>' +
        '<a href="' + resolved.browseHash + '" class="pbtn" style="flex:1;text-align:center;">Browse Category</a>' +
        '</div></div></div>';
    }
    const model = resolved.model, brand = resolved.brand;
    const primary = primaryProductImage(model, displayName(brand, model));
    const imgHtml = productImageHtml(primary && primary.src, primary ? primary.alt : displayName(brand, model), resolved.cat.icon)
      .replace('class="product-image"', 'class="product-image" style="height:230px;"')
      .replace('class="product-image ph"', 'class="product-image ph" style="height:230px;"');
    return '<div class="prod-card" data-overview-model="' + esc(model.id) + '">' +
      imgHtml +
      '<div class="prod-info">' +
      '<h3>' + esc(model.name) + '</h3>' +
      '<p>' + esc(model.desc || model.specLine || '') + '</p>' +
      '<div style="display:flex;gap:10px;">' +
      '<button type="button" class="pbtn overview-quote-btn" style="flex:1;">Request Quote</button>' +
      '<a href="' + resolved.browseHash + '" class="pbtn" style="flex:1;text-align:center;">Browse Category</a>' +
      '</div></div></div>';
  }

  let overviewRendered = false;
  function renderOverview() {
    if (!overviewGrid || overviewRendered) return;
    overviewRendered = true;
    const resolved = CATALOG_OVERVIEW.map(resolveOverviewEntry).filter(Boolean);
    overviewGrid.innerHTML = resolved.map(overviewCardHtml).join('');
    overviewGrid.querySelectorAll('[data-overview-model]').forEach(function (cardEl) {
      const id = cardEl.getAttribute('data-overview-model');
      const hit = resolved.find(function (r) { return r.model && r.model.id === id; });
      if (!hit) return;
      const btn = cardEl.querySelector('.overview-quote-btn');
      if (btn) btn.addEventListener('click', function () { openModelQuote(hit.model, hit.cat, hit.brand, hit.fam); });
    });
    overviewGrid.querySelectorAll('[data-overview-category]').forEach(function (cardEl) {
      const id = cardEl.getAttribute('data-overview-category');
      const hit = resolved.find(function (r) { return r.isCategory && r.cat.id === id; });
      if (!hit) return;
      const btn = cardEl.querySelector('.overview-quote-btn');
      if (btn) btn.addEventListener('click', function () { openCategoryQuote(hit.cat, hit.image); });
    });
  }

  function showOverview() {
    if (overviewEl) overviewEl.style.display = '';
    if (browserEl) browserEl.style.display = 'none';
    renderOverview();
  }
  function showBrowser() {
    if (overviewEl) overviewEl.style.display = 'none';
    if (browserEl) browserEl.style.display = '';
  }
  if (backBtn) backBtn.addEventListener('click', function () { location.hash = '#products'; });

  /* ---------------------------------------------------------------------
   * Model quote panel — reuses the existing #pgal-overlay modal.
   * ------------------------------------------------------------------- */
  let currentModelCtx = null; // { model, category, brand, family, fieldValues } | { isCategoryQuote, cat, values }

  function currentQuoteTitle() {
    if (!currentModelCtx) return '';
    return currentModelCtx.isCategoryQuote
      ? currentModelCtx.cat.name
      : displayName(currentModelCtx.brand, currentModelCtx.model);
  }

  function openModelQuote(model, cat, brand, fam) {
    currentModelCtx = { model, cat, brand, fam, values: {} };

    document.getElementById('pgal-title').textContent = displayName(brand, model);
    document.getElementById('pgal-desc').textContent = [model.desc, model.mpn && ('MPN: ' + model.mpn), model.specLine].filter(Boolean).join(' · ');

    renderProductGallery(model, displayName(brand, model), cat.icon);

    // hide the old grouped "options" accordion (not used by catalog models)
    const optWrap = document.getElementById('pgal-options');
    if (optWrap) { optWrap.style.display = 'none'; optWrap.innerHTML = ''; }

    renderModelFields(model.fields || []);

    const btn = document.getElementById('pgal-request-btn');
    btn.onclick = function (e) { handleModelQuoteClick(e, btn); };

    document.getElementById('pgal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function renderProductGallery(model, fallbackAlt, iconKey) {
    const mainImg = document.getElementById('pgal-main-img');
    const thumbs = document.getElementById('pgal-thumbs');
    const images = productImages(model, fallbackAlt);
    let activeIndex = 0;
    const failed = new Set();
    thumbs.innerHTML = '';

    function showPlaceholder() {
      mainImg.removeAttribute('src');
      mainImg.alt = '';
      showFieldsPlaceholder(iconKey);
      thumbs.style.display = 'none';
    }

    function setActive(index) {
      const image = images[index];
      if (!image || failed.has(index)) return;
      activeIndex = index;
      hideFieldsPlaceholder();
      mainImg.style.objectFit = 'contain';
      mainImg.style.background = '#fff';
      mainImg.alt = image.alt || fallbackAlt;
      mainImg.src = image.src;
      Array.prototype.forEach.call(thumbs.children, function (thumb, thumbIndex) {
        thumb.classList.toggle('on', thumbIndex === index);
        thumb.setAttribute('aria-pressed', String(thumbIndex === index));
      });
    }

    mainImg.onerror = function () {
      failed.add(activeIndex);
      const failedThumb = thumbs.children[activeIndex];
      if (failedThumb) failedThumb.style.display = 'none';
      const next = images.findIndex(function (_image, index) { return !failed.has(index); });
      if (next === -1) showPlaceholder(); else setActive(next);
    };

    if (!images.length) { showPlaceholder(); return; }
    images.forEach(function (image, index) {
      const button = document.createElement('button');
      const thumbnail = document.createElement('img');
      button.type = 'button';
      button.className = 'pgal-thumb';
      button.setAttribute('aria-label', 'View image ' + (index + 1) + ' of ' + images.length);
      button.setAttribute('aria-pressed', 'false');
      thumbnail.src = image.src;
      thumbnail.alt = image.alt || fallbackAlt;
      thumbnail.onerror = function () {
        failed.add(index);
        button.style.display = 'none';
        if (index === activeIndex) mainImg.onerror();
      };
      button.appendChild(thumbnail);
      button.addEventListener('click', function () { setActive(index); });
      thumbs.appendChild(button);
    });
    thumbs.style.display = images.length > 1 ? '' : 'none';
    setActive(0);
  }

  /* Category-level "I don't know the exact model" sourcing enquiry — reuses
   * the same #pgal-overlay modal, WhatsApp/Telegram/Messenger/Email flow, and
   * SecurityUtils sanitization as openModelQuote(), just without a specific
   * model/brand/family attached. */
  function openCategoryQuote(cat, image) {
    currentModelCtx = { isCategoryQuote: true, cat, values: {} };

    document.getElementById('pgal-title').textContent = cat.name;
    document.getElementById('pgal-desc').textContent =
      'Tell us the brand, specifications, and quantity you need. LAVAALL will source available options and provide a quote.';

    const mainImg = document.getElementById('pgal-main-img');
    const thumbs = document.getElementById('pgal-thumbs');
    thumbs.innerHTML = '';
    if (image) {
      hideFieldsPlaceholder();
      mainImg.src = image;
      mainImg.style.objectFit = 'contain';
      mainImg.style.background = '#fff';
      mainImg.onerror = function () { this.onerror = null; this.src = ''; showFieldsPlaceholder(cat.icon); };
    } else {
      mainImg.removeAttribute('src');
      showFieldsPlaceholder(cat.icon);
    }

    const optWrap = document.getElementById('pgal-options');
    if (optWrap) { optWrap.style.display = 'none'; optWrap.innerHTML = ''; }

    renderModelFields(CATEGORY_QUOTE_FIELDS[cat.id] || [qtyField(1)]);

    const btn = document.getElementById('pgal-request-btn');
    btn.onclick = function (e) { handleModelQuoteClick(e, btn); };

    document.getElementById('pgal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function showFieldsPlaceholder(iconKey) {
    // Note: never replaces .pgal-main's innerHTML — that would permanently
    // remove #pgal-main-img from the DOM, breaking every quote panel opened
    // afterwards (openModelQuote/openCategoryQuote both look it up by id).
    // Instead hide the <img> and show/reuse a sibling placeholder div.
    const mediaBox = document.querySelector('.pgal-main');
    const mainImg = document.getElementById('pgal-main-img');
    if (!mediaBox) return;
    if (mainImg) mainImg.style.display = 'none';
    let ph = document.getElementById('pgal-main-placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.id = 'pgal-main-placeholder';
      ph.className = 'product-image ph';
      ph.style.width = '100%';
      ph.style.height = '100%';
      mediaBox.appendChild(ph);
    }
    ph.innerHTML = placeholderInnerHtml(iconKey);
    ph.style.display = 'flex';
  }

  function hideFieldsPlaceholder() {
    const mainImg = document.getElementById('pgal-main-img');
    const ph = document.getElementById('pgal-main-placeholder');
    if (mainImg) mainImg.style.display = '';
    if (ph) ph.style.display = 'none';
  }

  function renderModelFields(fields) {
    let wrap = document.getElementById('pgal-fields');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'pgal-fields';
      wrap.className = 'pgal-fields';
      const desc = document.getElementById('pgal-desc');
      desc.parentNode.insertBefore(wrap, desc.nextSibling);
    }
    wrap.innerHTML = '';
    if (!fields.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'grid';

    fields.forEach(f => {
      const row = document.createElement('div');
      row.className = 'fg';
      const label = document.createElement('label');
      label.textContent = f.label;
      row.appendChild(label);

      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          input.appendChild(o);
        });
      } else if (f.type === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        if (f.placeholder) input.placeholder = f.placeholder;
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.min = f.min || 1;
        input.value = f.value || 1;
      }
      input.addEventListener('change', () => { currentModelCtx.values[f.key] = input.value; });
      input.addEventListener('input', () => { currentModelCtx.values[f.key] = input.value; });
      // seed default
      currentModelCtx.values[f.key] = input.value;
      row.appendChild(input);
      wrap.appendChild(row);
    });
  }

  function buildQuoteDetailText() {
    if (!currentModelCtx) return '';
    if (currentModelCtx.isCategoryQuote) {
      const lines = ['Category: ' + currentModelCtx.cat.name, 'Request Type: Product sourcing'];
      (CATEGORY_QUOTE_FIELDS[currentModelCtx.cat.id] || []).forEach(f => {
        const v = currentModelCtx.values[f.key];
        if (v !== undefined && v !== '' && v !== NO_PREF) lines.push(f.label + ': ' + v);
      });
      return lines.join('\n');
    }
    const { model, brand } = currentModelCtx;
    const lines = ['Product: ' + displayName(brand, model)];
    if (model.sourceProductId) lines.push('Source Product ID: ' + model.sourceProductId);
    if (model.mpn || model.modelNumber) lines.push('MPN: ' + (model.mpn || model.modelNumber));
    if (model.gtin) lines.push('GTIN: ' + model.gtin);
    (model.fields || []).forEach(f => {
      const v = currentModelCtx.values[f.key];
      if (v !== undefined && v !== '') lines.push(f.label + ': ' + v);
    });
    return lines.join('\n');
  }

  function handleModelQuoteClick(e, btn) {
    e.preventDefault();
    e.stopPropagation();
    const detail = buildQuoteDetailText();

    // prefill the existing quote form (does not submit anything itself)
    const msg = document.querySelector('[name="message"]');
    if (msg) msg.value = detail;

    // build/refresh the same WhatsApp / Telegram / Messenger / Email dropdown
    // pattern used elsewhere on the site, using the same SecurityUtils
    let dd = document.getElementById('pgal-quote-dd');
    if (dd) dd.remove();
    dd = document.createElement('div');
    dd.className = 'order-dd';
    dd.id = 'pgal-quote-dd';

    const safeText = (window.SecurityUtils ? SecurityUtils.sanitizeText(detail, 500) : detail);
    const waMsg = encodeURIComponent('Hello LAVAALL, I would like a quote for:\n' + safeText);
    const emailSubj = encodeURIComponent('Quote Request: ' + currentQuoteTitle());
    const emailBody = encodeURIComponent(safeText);

    const links = [
      { href: '#signup-continue', bg: 'var(--ink)', label: '✓', text: 'Continue in Quote Form Below', close: true },
      { href: 'https://wa.me/23276000000?text=' + waMsg, bg: '#25D366', label: 'WA', text: 'WhatsApp' },
      { href: 'https://t.me/lavaall', bg: '#0088cc', label: 'TG', text: 'Telegram' },
      { href: 'https://m.me/lavaall', bg: '#006AFF', label: 'FB', text: 'Facebook Messenger' },
      { href: 'mailto:hello@lavaall.com?subject=' + emailSubj + '&body=' + emailBody, bg: '#EA4335', label: '@', text: 'Email Us' },
    ];
    links.forEach(linkData => {
      const a = document.createElement('a');
      a.className = 'dd-link';
      a.href = linkData.href === '#signup-continue' ? '#signup' : linkData.href;
      if (linkData.href.indexOf('http') === 0) a.target = '_blank';
      const span = document.createElement('span');
      span.style.background = linkData.bg;
      span.textContent = linkData.label;
      a.appendChild(span);
      a.appendChild(document.createTextNode(linkData.text));
      if (linkData.close) {
        a.addEventListener('click', () => { closeGalleryModal(); });
      }
      dd.appendChild(a);
    });
    document.body.appendChild(dd);

    const rect = btn.getBoundingClientRect();
    dd.style.position = 'fixed';
    dd.style.left = rect.left + 'px';
    dd.style.top = (rect.bottom + 6) + 'px';
    dd.style.width = Math.max(rect.width, 240) + 'px';
    dd.classList.add('show');

    document.addEventListener('click', function outside(ev) {
      if (!dd.contains(ev.target) && ev.target !== btn) {
        dd.remove();
        document.removeEventListener('click', outside);
      }
    });
  }

  function closeGalleryModal() {
    document.getElementById('pgal-overlay').classList.remove('show');
    document.body.style.overflow = '';
    const dd = document.getElementById('pgal-quote-dd');
    if (dd) dd.remove();
  }
  const closeBtn = document.getElementById('pgal-close-btn');
  const backdrop = document.getElementById('pgal-backdrop');
  if (closeBtn) closeBtn.addEventListener('click', closeGalleryModal);
  if (backdrop) backdrop.addEventListener('click', closeGalleryModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGalleryModal(); });

  /* ---------------------------------------------------------------------
   * Router
   * ------------------------------------------------------------------- */
  function scrollBrowserIntoView() {
    // Route rendering changes the browser's height and visibility first. Wait
    // one frame so its final document position is used for the fixed-nav offset.
    requestAnimationFrame(function () {
      const nav = document.querySelector('nav');
      const navHeight = nav ? nav.getBoundingClientRect().height : 0;
      const top = browserEl.getBoundingClientRect().top + window.scrollY - navHeight - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
  }

  function route(shouldScrollToBrowser) {
    const hash = location.hash.replace(/^#/, '');
    // Empty hash (fresh page load) or bare '#products' -> the original
    // overview grid (Layer 1). '#products/<cat>/...' -> the drill-down
    // browser (Layer 2). A hash that points elsewhere on the page
    // (#services, #signup, ...) -> leave whichever layer is showing alone.
    if (hash && hash.indexOf('products') !== 0) return;
    const parts = hash.split('/').filter(Boolean); // ['products', cat, brand, family]

    if (parts.length <= 1) {
      if (searchInput) searchInput.value = '';
      showOverview();
      return;
    }
    showBrowser();
    if (searchInput && searchInput.value.trim()) return; // search takes over rendering

    const cat = findCategory(parts[1]);
    if (!cat) { renderCategoryGrid(); if (shouldScrollToBrowser) scrollBrowserIntoView(); return; }
    if (parts.length === 2) { renderBrandGrid(cat); if (shouldScrollToBrowser) scrollBrowserIntoView(); return; }

    const brand = findBrand(cat, parts[2]);
    if (!brand) { renderBrandGrid(cat); if (shouldScrollToBrowser) scrollBrowserIntoView(); return; }
    if (parts.length === 3) { renderFamilyGrid(cat, brand); if (shouldScrollToBrowser) scrollBrowserIntoView(); return; }

    const fam = findFamily(brand, parts[3]);
    if (!fam) { renderFamilyGrid(cat, brand); if (shouldScrollToBrowser) scrollBrowserIntoView(); return; }
    renderModelGrid(cat, brand, fam);
    if (shouldScrollToBrowser) scrollBrowserIntoView();
  }

  window.addEventListener('hashchange', function () { route(true); });

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length >= 2) {
          renderSearchResults(q);
        } else {
          route(false);
        }
      }, 150);
    });
  }

  function initCatalog() {
    // The overview must exist regardless of which hash the page happens to
    // load on (#signup, #services, #coverage, ...) — route() alone returns
    // early for non-product hashes and would otherwise leave #catalog-overview
    // permanently empty. renderOverview() is idempotent (overviewRendered
    // guard), so calling it here plus whatever route() does next is safe.
    renderOverview();
    loadApprovedGeneratedCatalog();
    // A refreshed deep link should land on the rendered category browser,
    // while ordinary initial loads keep their existing position.
    route(location.hash.indexOf('#products/') === 0);
  }

  document.addEventListener('DOMContentLoaded', initCatalog);
  if (document.readyState !== 'loading') initCatalog();
})();
