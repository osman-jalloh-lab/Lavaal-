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
  const catalogShell = document.querySelector('.catalog-shell');
  const mediaDebugEnabled = new URLSearchParams(window.location.search).get('mediaDebug') === '1';
  let mediaDebugLastError = null;
  let mediaDebugLastNoCacheTest = null;
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

  /* ---------------------------------------------------------------------
   * Human-device media forensics (opt-in only: ?mediaDebug=1)
   *
   * This intentionally observes the displayed gallery image rather than
   * repairing it. In debug mode image errors are retained for inspection;
   * automatic gallery fallback is suspended so a human can capture the state
   * that actually failed on their device.
   * ------------------------------------------------------------------- */
  function mediaDebugValue(value) { return value == null ? null : value; }
  function mediaDebugRect(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
    return { width: rect.width, height: rect.height, display: style.display, visibility: style.visibility, overflow: style.overflow, opacity: style.opacity };
  }
  function mediaDebugStorage(storage) {
    const values = {};
    try { for (let index = 0; index < storage.length; index += 1) { const key = storage.key(index); if (key && /(catalog|product|gallery|lavaall)/i.test(key)) values[key] = storage.getItem(key); } } catch (_) {}
    return values;
  }
  function mediaDebugProduct() {
    if (!currentModelCtx || currentModelCtx.isCategoryQuote) return null;
    const model = currentModelCtx.model;
    return {
      sourceProductId: mediaDebugValue(model.sourceProductId), name: mediaDebugValue(model.name),
      primaryImage: mediaDebugValue(model.primaryImage), images: (model.images || []).map(function (image) { return image && image.src; }).filter(Boolean),
      mpn: mediaDebugValue(model.mpn || model.modelNumber), category: mediaDebugValue(currentModelCtx.cat && currentModelCtx.cat.id), brand: mediaDebugValue(currentModelCtx.brand && currentModelCtx.brand.name)
    };
  }
  async function mediaDebugResource(url) {
    if (!url) return null;
    const match = performance.getEntriesByType('resource').filter(function (entry) { return entry.name === url; }).pop();
    const result = match ? { name: match.name, initiatorType: match.initiatorType, duration: match.duration, transferSize: match.transferSize, encodedBodySize: match.encodedBodySize, decodedBodySize: match.decodedBodySize } : null;
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      result && (result.diagnosticFetch = {});
      const target = result ? result.diagnosticFetch : (result || {});
      target.status = response.status; target.contentType = response.headers.get('content-type'); target.contentLength = response.headers.get('content-length');
      return result || { diagnosticFetch: target };
    } catch (error) { return { diagnosticFetch: { error: String(error) } }; }
  }
  async function mediaDebugReport() {
    const image = document.getElementById('pgal-main-img');
    const style = image ? getComputedStyle(image) : null;
    const rect = image && image.getBoundingClientRect();
    const expected = mediaDebugProduct();
    let worker = { registrations: [], cacheKeys: [] };
    try { worker.registrations = (await navigator.serviceWorker.getRegistrations()).map(function (registration) { return registration.scope; }); } catch (_) {}
    try { worker.cacheKeys = await caches.keys(); } catch (_) {}
    const displayed = image ? {
      src: image.src, currentSrc: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      renderedWidth: rect.width, renderedHeight: rect.height, display: style.display, visibility: style.visibility, opacity: style.opacity,
      objectFit: style.objectFit, objectPosition: style.objectPosition, parents: [mediaDebugRect(image.parentElement), mediaDebugRect(image.parentElement && image.parentElement.parentElement)]
    } : null;
    const currentSource = displayed && (displayed.currentSrc || displayed.src);
    const resource = await mediaDebugResource(currentSource);
    const fetchState = resource && resource.diagnosticFetch;
    const catalogCommit = window.LAVAALL_GENERATED_CATALOG?.commit || window.LAVAALL_GENERATED_CATALOG?.generatedCommit || null;
    let deployment = { deployedCommit: document.querySelector('meta[name="lavaall-build"]')?.content || null, vercelId: null, vercelCache: null };
    try {
      const response = await fetch(location.href, { cache: 'no-store', credentials: 'same-origin' });
      deployment.vercelId = response.headers.get('x-vercel-id');
      deployment.vercelCache = response.headers.get('x-vercel-cache');
    } catch (_) {}
    let classification = 'NO_ACTIVE_PRODUCT';
    if (displayed) {
      const expectedSources = expected && expected.images ? expected.images.map(function (source) { return new URL(source, location.href).href; }) : [];
      const mixedVersion = deployment.deployedCommit && catalogCommit && deployment.deployedCommit !== catalogCommit;
      if (mixedVersion) classification = 'CASE_G_MIXED_BUILD_OR_CATALOG_VERSION';
      else if (expectedSources.length && expectedSources.indexOf(currentSource) === -1) classification = 'CASE_E_ROUTE_OR_GALLERY_STATE';
      else if (displayed.naturalWidth > 0 && (!displayed.renderedWidth || !displayed.renderedHeight)) classification = 'CASE_A_LAYOUT_OR_CSS';
      else if (displayed.naturalWidth > 0 && displayed.renderedWidth > 0 && displayed.renderedHeight > 0 && (displayed.display === 'none' || displayed.visibility === 'hidden' || Number(displayed.opacity) === 0)) classification = 'CASE_B_COMPOSITING_OR_VISIBILITY';
      else if (!displayed.naturalWidth && mediaDebugLastNoCacheTest && mediaDebugLastNoCacheTest.ok) classification = 'CASE_F_STALE_CLIENT_OR_CDN_CACHE';
      else if (!displayed.naturalWidth && fetchState && !fetchState.error && fetchState.status >= 200 && fetchState.status < 300 && /^image\//i.test(fetchState.contentType || '')) classification = 'CASE_D_BROWSER_DECODE_OR_LOAD';
      else if (!displayed.naturalWidth && fetchState) classification = 'CASE_C_NETWORK_CDN_OR_PATH';
      else if (displayed.naturalWidth && displayed.renderedWidth && displayed.renderedHeight) classification = 'RENDERED_AT_CAPTURE';
    }
    return {
      schema: 'lavaall-media-debug-v1', capturedAt: new Date().toISOString(), version: {
        deployedCommit: deployment.deployedCommit,
        vercelId: deployment.vercelId, vercelCache: deployment.vercelCache, catalogCommit: catalogCommit, catalogGeneratedAt: window.LAVAALL_GENERATED_CATALOG?.generatedAt || null,
        catalogProductCount: window.LAVAALL_GENERATED_CATALOG?.products?.length || 0
      },
      browser: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio: devicePixelRatio, route: location.hash, visibilityState: document.visibilityState, online: navigator.onLine },
      product: expected, displayedImage: displayed, resource: resource, cacheState: { serviceWorker: worker, localStorage: mediaDebugStorage(localStorage), sessionStorage: mediaDebugStorage(sessionStorage) },
      lastImageError: mediaDebugLastError, noCacheTest: mediaDebugLastNoCacheTest, classification: classification
    };
  }
  function updateMediaDebugPanel() {
    if (!mediaDebugEnabled) return;
    const panel = document.getElementById('media-debug-panel'); if (!panel) return;
    mediaDebugReport().then(function (report) {
      panel.querySelector('[data-media-debug-summary]').textContent = report.classification + ' · ' + (report.product ? report.product.sourceProductId : 'no product');
      panel.querySelector('[data-media-debug-preview]').textContent = JSON.stringify({ product: report.product, displayedImage: report.displayedImage, resource: report.resource, classification: report.classification }, null, 2);
      panel._mediaDebugReport = report;
    });
  }
  function initMediaDebug() {
    if (!mediaDebugEnabled || document.getElementById('media-debug-panel')) return;
    const panel = document.createElement('aside'); panel.id = 'media-debug-panel'; panel.setAttribute('aria-label', 'Media diagnostics');
    panel.innerHTML = '<details><summary>Media diagnostics</summary><div class="media-debug-body"><div class="media-debug-title">Rendered image forensics</div><div data-media-debug-summary>Open a product to inspect its rendered image.</div><div class="media-debug-actions"><button type="button" data-media-debug-copy>Copy debug report</button><button type="button" data-media-debug-recheck>Recheck image</button><button type="button" data-media-debug-nocache>Test no-cache image</button></div><pre data-media-debug-preview></pre></div></details>';
    document.body.appendChild(panel);
    panel.querySelector('[data-media-debug-copy]').addEventListener('click', function () {
      const report = panel._mediaDebugReport; if (!report) return;
      const text = JSON.stringify(report, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () { window.prompt('Copy this media debug report:', text); });
      else window.prompt('Copy this media debug report:', text);
    });
    panel.querySelector('[data-media-debug-recheck]').addEventListener('click', updateMediaDebugPanel);
    panel.querySelector('[data-media-debug-nocache]').addEventListener('click', function () {
      const main = document.getElementById('pgal-main-img'); const src = main && (main.currentSrc || main.src); if (!src) return;
      const diagnostic = new Image(); const url = new URL(src, location.href); url.searchParams.set('__mediaDebug', Date.now().toString());
      diagnostic.onload = function () { mediaDebugLastNoCacheTest = { url: url.href, ok: true, naturalWidth: diagnostic.naturalWidth, naturalHeight: diagnostic.naturalHeight }; updateMediaDebugPanel(); };
      diagnostic.onerror = function () { mediaDebugLastNoCacheTest = { url: url.href, ok: false }; updateMediaDebugPanel(); };
      diagnostic.src = url.href;
    });
  }
  function displayName(brand, model) {
    // avoid "Dell Dell OptiPlex" when the model name already includes the brand
    return model.name.toLowerCase().indexOf(brand.name.toLowerCase()) === 0
      ? model.name
      : brand.name + ' ' + model.name;
  }
  function isVerifiedModel(model) { return model && model.listingType === 'verified'; }
  const CATALOG_PRESENTATION = {
    computers: 'enterprise', monitors: 'enterprise', servers: 'enterprise', networking: 'enterprise',
    cables: 'enterprise', switches: 'enterprise', power: 'enterprise', fiber: 'enterprise',
    tvs: 'cinema', phones: 'mobile', tablets: 'mobile', watches: 'mobile',
    refrigeration: 'appliance', accessories: 'procurement'
  };
  const BRAND_SHOWROOMS = {
    dell: 'dell', samsung: 'samsung', lg: 'lg', lenovo: 'lenovo'
  };
  function catalogPresentation(cat, model) {
    if (model && !isVerifiedModel(model)) return 'procurement';
    return CATALOG_PRESENTATION[cat && cat.id] || 'enterprise';
  }
  function catalogGeometry(cat) {
    if (!cat) return 'landscape';
    if (cat.id === 'tvs') return 'wide';
    if (cat.id === 'refrigeration') return 'tall';
    if (cat.id === 'phones' || cat.id === 'tablets' || cat.id === 'watches') return 'portrait';
    return 'landscape';
  }
  function brandShowroom(brand, model) {
    if (!brand || (model && !isVerifiedModel(model))) return '';
    return BRAND_SHOWROOMS[String(brand.name || '').toLowerCase()] || '';
  }
  function applyCatalogPresentation(cat, model, brand) {
    const theme = catalogPresentation(cat, model);
    const showroom = brandShowroom(brand, model);
    const geometry = catalogGeometry(cat);
    [catalogShell, browserEl].forEach(function (element) {
      if (!element) return;
      element.setAttribute('data-catalog-theme', theme);
      element.setAttribute('data-catalog-geometry', geometry);
      if (showroom) element.setAttribute('data-catalog-brand', showroom);
      else element.removeAttribute('data-catalog-brand');
    });
    setCatalogSearchContext(cat, brand);
    return theme;
  }
  function catalogSearchCategory(cat) {
    const labels = {
      computers: ['computers', 'ordinateurs'], monitors: ['monitors', 'moniteurs'],
      tvs: ['televisions', 'téléviseurs'], phones: ['phones', 'téléphones'],
      tablets: ['tablets', 'tablettes'], watches: ['watches', 'montres'],
      refrigeration: ['refrigeration', 'réfrigération'], servers: ['servers', 'serveurs']
    };
    const pair = labels[cat && cat.id];
    return pair ? pair[document.documentElement.lang === 'fr' ? 1 : 0] : (cat ? String(cat.name).toLowerCase() : 'products');
  }
  let catalogSearchContext = { cat: null, brand: null };
  function setCatalogSearchContext(cat, brand) {
    catalogSearchContext = { cat: cat || null, brand: brand || null };
    if (!searchInput) return;
    const french = document.documentElement.lang === 'fr';
    if (!cat) {
      searchInput.placeholder = french ? 'Rechercher des produits' : 'Search products';
      return;
    }
    searchInput.placeholder = (french ? 'Rechercher ' : 'Search ') + (brand ? brand.name + ' ' : '') + catalogSearchCategory(cat);
  }
  window.addEventListener('lavaall-languagechange', function () {
    setCatalogSearchContext(catalogSearchContext.cat, catalogSearchContext.brand);
  });
  function catalogText(key) {
    const french = document.documentElement.lang === 'fr';
    const strings = {
      verified: ['Verified product', 'Produit vérifié'],
      sourcing: ['Sourcing available', 'Disponible sur demande'],
      viewDetails: ['View Details', 'Voir les détails'],
      requestQuote: ['Request Quote', 'Demander un devis'],
      requestSourcing: ['Request sourcing', 'Demander un approvisionnement'],
      sourcingDescription: ['Sourcing request — availability and configuration vary by market.', 'Demande d’approvisionnement — la disponibilité et la configuration varient selon le marché.'],
      sourcingNote: ['Share your preferred configuration and quantity for a tailored quote.', 'Indiquez la configuration souhaitée et la quantité pour un devis adapté.'],
      sourcingRequest: ['Product sourcing', 'Approvisionnement produit'],
      requestedModel: ['Requested family/model', 'Famille/modèle demandé'],
      verifiedModel: ['verified model', 'modèle vérifié'],
      verifiedModels: ['verified models', 'modèles vérifiés'],
    };
    return (strings[key] || [key, key])[french ? 1 : 0];
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
  function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // Source values sometimes already embed the declared unit (for example
  // "37.1 cm (14.6\")" with unit "cm"). Keep source text intact but never
  // repeat that unit in customer-facing summaries.
  function formatSourceSpecification(value, unit) {
    const text = String(value || '').trim();
    const suffix = String(unit || '').trim();
    if (!text || !suffix) return text;
    const unitPattern = new RegExp('(^|[^a-z0-9])' + escapeRegExp(suffix) + '(?=$|[^a-z0-9])', 'i');
    return unitPattern.test(text) ? text : text + ' ' + suffix;
  }
  function generatedSpec(product, names) {
    const entry = (product.specifications || []).find(function (item) { return names.indexOf(item.name) !== -1 && item.value; });
    if (!entry) return null;
    return formatSourceSpecification(entry.value, entry.unit);
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
      listingType: 'verified',
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
  function productImageHtml(imageUrl, alt, iconKey, options) {
    if (imageUrl) {
      const unavailable = options && options.explicitFailure
        ? '<div class="catalog-image-unavailable" role="status"><strong>Product image temporarily unavailable</strong><span>Please request a quote for verified product details.</span></div>'
        : placeholderInnerHtml(iconKey);
      return '<div class="product-image">' +
        '<img src="' + esc(imageUrl) + '" alt="' + esc(alt) + '" loading="lazy" ' +
        'onerror="this.closest(\'.product-image\').innerHTML=' + "'" + esc(unavailable).replace(/'/g, "\\'") + "'" + '">' +
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

  function modelListingType(model) { return isVerifiedModel(model) ? 'verified' : 'sourcing'; }

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
    applyCatalogPresentation(null);
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
    applyCatalogPresentation(cat);
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

  function verifiedBrandFeature(brand, fallbackAlt) {
    for (let f = 0; f < brand.families.length; f += 1) {
      const model = brand.families[f].models.find(isVerifiedModel);
      if (model) {
        const image = primaryProductImage(model, fallbackAlt);
        if (image) return { model: model, image: image };
      }
    }
    return null;
  }
  function brandShowroomHeader(cat, brand, family) {
    const showroom = brandShowroom(brand);
    if (!showroom) return '';
    const feature = verifiedBrandFeature(brand, brand.name + ' ' + cat.name);
    const familyLabel = family ? family.name : cat.name;
    const familyList = brand.families.slice(0, 4).map(function (item) { return esc(item.name); }).join('<span aria-hidden="true">/</span>');
    const media = feature
      ? '<div class="brand-showroom-feature-media"><img src="' + esc(feature.image.src) + '" alt="' + esc(feature.image.alt || displayName(brand, feature.model)) + '" loading="eager"></div>'
      : '';
    return '<section class="brand-showroom-header brand-showroom-header--' + showroom + '" data-brand-showroom="' + showroom + '">' +
      '<div class="brand-showroom-rail" aria-hidden="true"></div>' +
      '<div class="brand-showroom-copy"><p>' + esc(brand.name) + ' · ' + esc(cat.name) + '</p>' +
      '<h2>' + esc(familyLabel) + '</h2>' +
      '<span>' + esc(catalogText('verified')) + ' · ' + esc(brand.name) + '</span>' +
      '<div class="brand-showroom-index">' + familyList + '</div></div>' + media +
      '</section>';
  }
  function renderFamilyGrid(cat, brand) {
    applyCatalogPresentation(cat, null, brand);
    renderBreadcrumbs([
      { label: 'Products', hash: '#products' },
      { label: cat.name, hash: '#products/' + cat.id },
      { label: brand.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) },
    ]);
    const samsungCollections = brandShowroom(brand) === 'samsung' && (cat.id === 'phones' || cat.id === 'tablets');
    const totalVerified = brand.families.reduce(function (count, fam) { return count + fam.models.filter(isVerifiedModel).length; }, 0);
    const cards = brand.families.map(fam => {
      if (samsungCollections) {
        const verifiedCount = fam.models.filter(isVerifiedModel).length;
        const label = fam.name === 'Models' ? 'All ' + brand.name + ' ' + cat.name.toLowerCase() : fam.name;
        const countLabel = verifiedCount
          ? verifiedCount + ' ' + catalogText(verifiedCount === 1 ? 'verifiedModel' : 'verifiedModels')
          : catalogText('sourcing');
        return '<a class="samsung-collection-link" href="#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name) + '">' +
          '<span><strong>' + esc(label) + '</strong><small>' + esc(countLabel) + '</small></span><b aria-hidden="true">→</b></a>';
      }
      return '<a class="cat-card" href="#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name) + '">' +
        '<span class="cat-card-icon">' + iconSvg(cat.icon) + '</span>' +
        '<span class="cat-card-name">' + esc(fam.name) + '</span>' +
        '<span class="cat-card-count">' + fam.models.length + (fam.models.length === 1 ? ' model' : ' models') + '</span>' +
        '</a>';
    }).join('');
    const collectionSummary = samsungCollections && totalVerified
      ? '<div class="samsung-collection-summary">' + totalVerified + ' ' + esc(catalogText(totalVerified === 1 ? 'verifiedModel' : 'verifiedModels')) + '</div>' : '';
    root.innerHTML = brandShowroomHeader(cat, brand) + collectionSummary + '<div class="' + (samsungCollections ? 'samsung-collection-nav' : 'cat-grid') + '">' + cards + '</div>';
  }

  function modelCardHtml(model, cat, brand, fam) {
    const verified = isVerifiedModel(model);
    // Handwritten records have no source identity/provenance. Do not let an
    // old local image imply that it is exact media for a named SKU.
    const primary = verified ? primaryProductImage(model, displayName(brand, model)) : null;
    const media = verified
      ? '<div class="catalog-product-media">' + productImageHtml(primary && primary.src, primary ? primary.alt : displayName(brand, model), cat.icon, { explicitFailure: true }) + '</div>'
      : '<div class="catalog-procurement-mark" aria-hidden="true">' + iconSvg(cat.icon) + '</div>';
    const listing = modelListingType(model);
    const theme = catalogPresentation(cat, model);
    const showroom = brandShowroom(brand, model);
    const actions = verified
      ? '<div style="display:flex;gap:8px;"><button type="button" class="pbtn model-details-btn" style="flex:1">' + esc(catalogText('viewDetails')) + '</button><button type="button" class="pbtn model-quote-btn" style="flex:1">' + esc(catalogText('requestQuote')) + ' &#9662;</button></div>'
      : '<div class="model-card-actions--single"><button type="button" class="pbtn model-details-btn" style="width:100%">' + esc(catalogText('requestSourcing')) + ' &#9662;</button></div>';
    return '<div class="model-card model-card--' + listing + '" data-model-id="' + esc(model.id) + '" data-listing-type="' + listing + '" data-catalog-theme="' + theme + '" data-catalog-geometry="' + catalogGeometry(cat) + '"' + (showroom ? ' data-catalog-brand="' + showroom + '"' : '') + '>' +
      media +
      '<div class="model-card-body">' +
      '<div class="listing-badge listing-badge--' + listing + '">' + esc(catalogText(listing)) + '</div>' +
      '<div class="model-card-brand">' + esc(brand.name) + '</div>' +
      '<div class="model-card-name">' + esc(model.name) + '</div>' +
      '<div class="model-card-spec">' + esc(model.specLine || '') + '</div>' +
      actions +
      '</div></div>';
  }

  function renderModelGrid(cat, brand, fam) {
    applyCatalogPresentation(cat, null, brand);
    renderBreadcrumbs([
      { label: 'Products', hash: '#products' },
      { label: cat.name, hash: '#products/' + cat.id },
      { label: brand.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) },
      { label: fam.name, hash: '#products/' + cat.id + '/' + slugify(brand.name) + '/' + slugify(fam.name) },
    ]);
    const cards = fam.models.map(model => modelCardHtml(model, cat, brand, fam)).join('');
    root.innerHTML = brandShowroomHeader(cat, brand, fam) + '<div class="model-grid">' + cards + '</div>';
    wireModelCards(root, cat, brand, fam);
  }

  function renderSearchResults(query) {
    applyCatalogPresentation(null);
    const q = query.trim().toLowerCase();
    crumbEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'crumb-current';
    label.textContent = 'Search results for “' + query.trim() + '”';
    crumbEl.appendChild(label);

    const matches = allModelsFlat().filter(({ model, category, brand, family }) => {
      const hay = [model.name, model.specLine, model.mpn, model.modelNumber, model.gtin, brand.name, family.name, category.name].join(' ').toLowerCase();
      return q.split(/\s+/).every(term => hay.indexOf(term) !== -1);
    }).sort((a, b) => Number(isVerifiedModel(b.model)) - Number(isVerifiedModel(a.model))).slice(0, 60);

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
    const sourcing = !isVerifiedModel(model);
    const theme = applyCatalogPresentation(cat, model, brand);
    currentModelCtx = { model, cat, brand, fam, isSourcing: sourcing, values: {} };
    const modal = document.getElementById('pgal-overlay');
    modal.setAttribute('data-catalog-theme', theme);
    modal.setAttribute('data-catalog-geometry', catalogGeometry(cat));
    const showroom = brandShowroom(brand, model);
    if (showroom) modal.setAttribute('data-catalog-brand', showroom); else modal.removeAttribute('data-catalog-brand');

    document.getElementById('pgal-kicker').textContent = sourcing
      ? catalogText('sourcing') + ' · ' + brand.name
      : catalogText('verified') + ' · ' + brand.name;
    document.getElementById('pgal-title').textContent = displayName(brand, model);
    document.getElementById('pgal-desc').textContent = sourcing
      ? [catalogText('sourcingDescription'), catalogText('sourcingNote')].join(' ')
      : [model.desc, model.mpn && ('MPN: ' + model.mpn), model.specLine].filter(Boolean).join(' · ');

    renderProductGallery(sourcing ? { primaryImage: null, images: [], image: null } : model, displayName(brand, model), cat.icon);

    // hide the old grouped "options" accordion (not used by catalog models)
    const optWrap = document.getElementById('pgal-options');
    if (optWrap) { optWrap.style.display = 'none'; optWrap.innerHTML = ''; }

    renderModelFields(model.fields || []);

    const btn = document.getElementById('pgal-request-btn');
    btn.onclick = function (e) { handleModelQuoteClick(e, btn); };

    document.getElementById('pgal-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    updateMediaDebugPanel();
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
      updateMediaDebugPanel();
    }

    mainImg.onerror = function () {
      mediaDebugLastError = { role: 'main-image', source: mainImg.currentSrc || mainImg.src, activeIndex: activeIndex, at: new Date().toISOString() };
      if (mediaDebugEnabled) { updateMediaDebugPanel(); return; }
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
        mediaDebugLastError = { role: 'thumbnail', source: thumbnail.currentSrc || thumbnail.src, index: index, at: new Date().toISOString() };
        if (mediaDebugEnabled) { updateMediaDebugPanel(); return; }
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
    updateMediaDebugPanel();
  }

  /* Category-level "I don't know the exact model" sourcing enquiry — reuses
   * the same #pgal-overlay modal, WhatsApp/Telegram/Messenger/Email flow, and
   * SecurityUtils sanitization as openModelQuote(), just without a specific
   * model/brand/family attached. */
  function openCategoryQuote(cat, image) {
    currentModelCtx = { isCategoryQuote: true, cat, values: {} };
    document.getElementById('pgal-overlay').setAttribute('data-catalog-theme', catalogPresentation(cat, null));
    document.getElementById('pgal-kicker').textContent = catalogText('sourcing') + ' · ' + cat.name;

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
    updateMediaDebugPanel();
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
    if (currentModelCtx.isSourcing) {
      const lines = ['Category: ' + currentModelCtx.cat.name, 'Request Type: ' + catalogText('sourcingRequest'), catalogText('requestedModel') + ': ' + displayName(brand, model)];
      (model.fields || []).forEach(f => {
        const v = currentModelCtx.values[f.key];
        if (v !== undefined && v !== '') lines.push(f.label + ': ' + v);
      });
      return lines.join('\n');
    }
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
    initMediaDebug();
    renderOverview();
    loadApprovedGeneratedCatalog();
    // A refreshed deep link should land on the rendered category browser,
    // while ordinary initial loads keep their existing position.
    route(location.hash.indexOf('#products/') === 0);
  }

  document.addEventListener('DOMContentLoaded', initCatalog);
  if (document.readyState !== 'loading') initCatalog();
})();
