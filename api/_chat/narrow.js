'use strict';

const {
  loadCatalog,
  purchaseDetails,
  normalize,
  tokensOf,
  expandToken,
  levenshtein,
  isTransposition
} = require('./catalog');
const phrase = (text, value) => (' ' + normalize(text) + ' ').includes(' ' + normalize(value) + ' ');
const stem = w => w.replace(/s$/, '');
const weakIdentity = token => /^(pro|max|mini|plus|standard|office|home|business|wireless|bluetooth|smart|blue|black|white|red|green|silver|gold)$/.test(token);
const generic = value => /^(models?|series)?$/.test(normalize(value));
const distinct = values => [...new Set(values)];
const trees = new WeakMap();

// Source families are reused only within the same brand and category.
function normalizedFamily(product, products) {
  if (!generic(product.family)) return product.family;
  const candidates = products.filter(other =>
    normalize(other.brand) === normalize(product.brand)
    && other.categoryId === product.categoryId
    && !generic(other.family));
  const families = distinct(candidates.map(other => other.family));
  return families.filter(family =>
    normalize(product.name).startsWith(normalize(family)) || phrase(product.name, family)
  ).sort((a, b) => b.length - a.length)[0] || 'Other ' + product.brand + ' models';
}

function buildTree(products) {
  if (trees.has(products)) return trees.get(products);
  const brands = new Map();
  for (const p of products) {
    const key = normalize(p.brand);
    if (!brands.has(key) || p.source === 'site-catalog') brands.set(key, p.brand);
  }
  const seen = new Set();
  const tree = products.map(p => {
    const brand = brands.get(normalize(p.brand));
    const family = normalizedFamily({ ...p, brand }, products);
    return {
      ...p,
      brand,
      family,
      options: (p.options || []).map(f => ({
        ...f,
        options: f.options && [...f.options]
      }))
    };
  }).filter(p => {
    const key = normalize([p.categoryId, p.brand, p.family, p.name].join(' '));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  trees.set(products, tree);
  return tree;
}

function variantField(product) {
  const fields = (product.options || []).filter(f => f.type === 'select' && f.options && f.options.length && !['condition', 'quantity'].includes(f.key));
  return fields.find(f => f.key === 'color') || fields[0] || null;
}

function brandLabel(brand, products) {
  const items = products.filter(p => p.brand === brand);
  const families = distinct(items.map(p => p.family));
  const first = families[0] && families[0].split(' ')[0];
  // A shared family prefix is useful only when it is not itself a family.
  if (families.length >= 2 && first && families.every(f => f.split(' ')[0] === first) && !families.includes(first) && items.every(p => !phrase(p.name, brand))) return first;
  return brand;
}
// Keep curated labels first; generations sort newest first within each source.
function ordered(labels, products, key) {
  const curated = new Set(products.filter(p => p.source === 'site-catalog').map(p => p[key]));
  return labels.map((label, index) => ({
    label,
    index,
    curated: curated.has(label),
    fallback: /^Other .+ models$/.test(label),
    generation: Number((label.match(/\d+/) || [0])[0])
  })).sort((a, b) => Number(a.fallback) - Number(b.fallback) || Number(b.curated) - Number(a.curated) || b.generation - a.generation || a.index - b.index).map(item => item.label);
}

function orderedBrands(products) {
  const brands = distinct(products.map(p => p.brand)).filter(b => normalize(b) !== 'various');
  const curated = new Set(products.filter(p => p.source === 'site-catalog').map(p => p.brand));
  return brands.sort((a, b) => Number(curated.has(b)) - Number(curated.has(a)) || products.filter(p => p.brand === b).length - products.filter(p => p.brand === a).length || a.localeCompare(b));
}

function categoryLabels(products) {
  const labels = distinct(products.map(p => p.categoryId)).map(id => {
    const items = products.filter(p => p.categoryId === id);
    return (items.find(p => p.source === 'site-catalog') || items[0]).category;
  });
  return ordered(labels, products, 'category');
}

// Resolve display text from catalogue fields while keeping matching terms normalized.
function displayLabel(value, products) {
  const key = normalize(value);
  const isIphone = product => /\biphone\b/i.test(product.family + ' ' + product.name);
  // Use the source-backed product line when the matched phone set is all iPhones.
  if (products.length && (/^iphones?$/.test(key) || (/^phones?$/.test(key) && products.every(isIphone))) && products.some(isIphone)) return 'iPhones';
  const preferred = [...products].sort((a, b) => Number(b.source === 'site-catalog') - Number(a.source === 'site-catalog'));
  for (const p of preferred) {
    if (normalize(p.categoryId) === key || normalize(p.category) === key) return p.category;
  }
  for (const p of preferred) {
    for (const field of [p.family, p.brand, p.name]) {
      if (normalize(field) === key) return field;
    }
  }
  const tokens = tokensOf(value);
  const matching = preferred.filter(p => tokens.some(token => termMatches(p, token)));
  if (matching.length) {
    const categories = distinct(matching.map(p => p.category));
    if (categories.length === 1) return categories[0];
    const families = distinct(matching.map(p => p.family));
    if (families.length === 1) return families[0];
  }
  return null;
}

function inScope(products, scope) {
  return products.filter(p =>
    (!scope.categoryId || p.categoryId === scope.categoryId)
    && (!scope.brand || normalize(p.brand) === normalize(scope.brand))
    && (!scope.family || p.family === scope.family)
    && (!scope.modelId || p.id === scope.modelId)
    && (!scope.term || termMatches(p, scope.term)));
}

function termMatches(p, token) {
  const words = normalize([p.name, p.family, p.brand, p.category].join(' ')).split(' ');
  return [...expandToken(token)].some(t => words.some(w => expandToken(w).has(t)));
}

function resolve(text, stored = {}) {
  // An unambiguous generation plus model suffix must name an actual catalogue item.
  text = purchaseDetails(text).query;
  // Storage is a configuration slot; it must not become a model-generation token.
  const shorthand = normalize(text).replace(/\b\d+\s*(?:gb|tb)\b/g, '').replace(/\b(pro max|pro|plus|mini)\s+\d{3,4}$/, '$1').replace(/\s+/g, ' ').trim();
  const abbreviated = shorthand.match(/^(?:([a-z]+) )?(\d{1,2} (?:pro(?: max)?|plus|mini))$/);
  if (abbreviated) {
    const candidates = loadCatalog().products.filter(p => {
      const name = normalize(p.name);
      const prefix = name.split(' ')[0];
      return name.endsWith(' ' + abbreviated[2]) && (!abbreviated[1] || prefix === abbreviated[1] || (abbreviated[1].length >= 4 && levenshtein(prefix, abbreviated[1]) <= 1));
    });
    if (distinct(candidates.map(p => normalize(p.name))).length === 1) text = candidates[0].name;
  }
  const variantAsk = String(text).match(/^(.+?)\s+in\s+(.+?)\s*[?]?$/i);
  if (variantAsk) {
    const base = resolve(variantAsk[1], stored);
    if (base.level === 'variant' || base.level === 'single') {
      const asked = variantAsk[2].replace(/[?]$/, '').trim();
      const exact = base.labels.find(value => normalize(value) === normalize(asked));
      const partial = base.labels.filter(value => normalize(value).includes(normalize(asked)) || normalize(asked).includes(normalize(value)));
      return {
        ...base,
        variantAsked: asked,
        matchedVariant: exact || (partial.length === 1 ? partial[0] : null)
      };
    }
  }
  const idsInScope = Array.isArray(stored.ids) && stored.ids.length ? new Set(stored.ids) : null;
  const all = buildTree(loadCatalog().products).filter(p => !idsInScope || idsInScope.has(p.id));
  const scope = {
    ...(stored.scope || stored)
  };
  let products = inScope(all, scope);
  const raw = normalize(text);
  const hasContext = Boolean(scope.modelId || scope.family || scope.brand || scope.categoryId || scope.term || stored.awaiting);
  const identifying = tokensOf(text);
  const quantityPrefix = raw.match(/^([0-9]+)\s+(?:laptops?|computers?|phones?|units?|pcs|pieces|ordinateurs?|portables?|tablets?|monitors?|printers?|routers?|switches?)\b/);
  const quantity = quantityPrefix && quantityPrefix[1];
  const words = distinct((hasContext || identifying.length ? raw.split(' ').filter(w => /\d/.test(w) && w !== quantity) : []).concat(identifying)).filter(w => !['please', 'color', 'colour', 'available', 'availability'].includes(w));
  if (!hasContext && !identifying.some(w => !/^(pro|max|mini|plus|standard|office|home|business|wireless|bluetooth|smart|blue|black|white|red|green|silver|gold)$/.test(w))) return { level: 'none', labels: [], ids: [], products: [], scope: {} };
  const used = new Set();
  let detected = false;
  const consume = value => normalize(value).split(' ').forEach(w => used.add(w));
  // Categories are identified by their own words, including singular forms.
  const categories = distinct(all.map(p => p.categoryId));
  const categoryWords = new Map(categories.map(c => [c, distinct(normalize(c + ' ' + all.find(p => p.categoryId === c).category).split(' '))]));
  const named = all.filter(p => phrase(raw, p.name) || normalize(p.name).split(' ').map(stem).join(' ') === raw.split(' ').map(stem).join(' ')).sort((a, b) => b.name.length - a.name.length)[0];
  const cat = named ? named.categoryId : categories.find(c => words.some(w => categoryWords.get(c).some(t => stem(w) === stem(t))));
  const namedField = named && variantField(named);
  const inlineVariant = namedField && namedField.options.map(String).filter(value => phrase(raw, value)).sort((a, b) => b.length - a.length)[0];
  if (inlineVariant) consume(inlineVariant);
  if (cat) {
    scope.categoryId = cat;
    products = inScope(all, scope);
    detected = true;
    words.filter(w => products.some(p => normalize(p.categoryId + ' ' + p.category).split(' ').some(t => stem(w) === stem(t)))).forEach(w => used.add(w));
  }
  const brands = distinct(products.map(p => p.brand)).filter(b => normalize(b) !== 'various');
  let brand = brands.find(b => phrase(raw, b) || phrase(raw, brandLabel(b, products)));
  if (!brand) brand = brands.find(b => words.some(w => w.length >= 4 && normalize(b).split(' ').some(t => t.length >= 4 && (isTransposition(w, t) || levenshtein(w, t) <= (w.length >= 7 && w[0] === t[0] ? 2 : 1)))));
  if (brand) {
    words.filter(w => w.length >= 4 && normalize(brand).split(' ').some(t => t.length >= 4 && (isTransposition(w, t) || levenshtein(w, t) <= (w.length >= 7 && w[0] === t[0] ? 2 : 1)))).forEach(w => used.add(w));
    consume(brand);
    consume(brandLabel(brand, products));
    scope.brand = brand;
    products = products.filter(p => p.brand === brand);
    detected = true;
  }
  // Use longest family phrase; a shared prefix can span several families.
  const families = distinct(products.map(p => p.family));
  const family = families.filter(f => phrase(raw, f)).sort((a, b) => b.length - a.length)[0];
  if (family) {
    scope.family = family;
    consume(family);
    products = products.filter(p => p.family === family);
    detected = true;
  } else {
    const shared = words.find(w => !used.has(w) && (hasContext || !/^\d/.test(w)) && w.length >= 4 && !weakIdentity(w) && families.filter(f => normalize(f).split(' ').includes(w)).length > 0);
    if (shared) {
      products = products.filter(p => normalize(p.family).split(' ').includes(shared));
      scope.term = shared;
      used.add(shared);
      detected = true;
    }
  }
  let missing = false;
  // Intersect every identifying word. Unknown words retain the nearest parent.
  for (const w of words.filter(w => !used.has(w))) {
    if (!detected && !hasContext && weakIdentity(w)) continue;
    const subset = products.filter(p => termMatches(p, w) && (!/^cameras?$/.test(w) || p.categoryId === 'cameras'));
    if (subset.length) {
      products = subset;
      detected = true;
      if (!scope.categoryId && !scope.brand && !scope.family && !scope.term && !/\d/.test(w)) scope.term = w;
    } else missing = true;
  }
  if (!detected) return {
    level: 'none',
    labels: [],
    ids: [],
    products: [],
    scope: {}
  };
  if (missing) {
    // A fused identifier can still identify its family's alphabetic prefix.
    const prefixes = words.filter(w => /\d/.test(w)).map(w => w.replace(/\d.*$/, '')).filter(Boolean);
    const inferred = distinct(products.map(p => p.family)).filter(f => phrase(raw.replace(/\b([a-z]+)\d[a-z0-9]*\b/g, '$1'), f)).sort((a, b) => b.length - a.length)[0];
    if (inferred) {
      products = products.filter(p => p.family === inferred);
      scope.family = inferred;
    }
    const related = products.filter(p => prefixes.some(pre => normalize(p.name).split(' ').some(w => w.startsWith(pre))));
    if (related.length) products = related;
    const missingBrand = !scope.brand && !scope.family && (scope.categoryId || scope.term) && !words.some(w => /\d/.test(w)) && distinct(products.map(p => p.brand)).filter(b => normalize(b) !== 'various').length > 1;
    const nearestFamilies = distinct(products.map(p => p.family));
    const missingCategory = scope.brand && !scope.categoryId && distinct(products.map(p => p.categoryId)).length > 1;
    const missingLevel = missingCategory ? 'category' : missingBrand ? 'brand' : nearestFamilies.length > 1 ? 'family' : 'model';
    const labelKey = missingLevel === 'family' ? 'family' : 'name';
    const labels = missingCategory ? categoryLabels(products) : missingBrand ? orderedBrands(products)
      : ordered(distinct(products.map(p => p[labelKey])), products, labelKey);
    return {
      level: 'not-carried',
      missing: text,
      missingLevel,
      labels,
      products: products.map(p => p.id),
      ids: products.map(p => p.id),
      scope
    };
  }
  // An exact model is selected unless the same phrase names a multi-model family.
  const exact = products.filter(p => normalize(p.name) === raw || phrase(raw, p.name));
  if (exact.length && !(family && normalize(family) === raw && products.length > 1)) {
    const longest = exact.sort((a, b) => b.name.length - a.name.length)[0];
    products = [longest];
  } else if (!family && stored && (stored.scope || stored).family && products.length > 1) {
    products.sort((a, b) => a.name.length - b.name.length);
    products = [products[0]];
  }
  // Synonym-defined product types use the category best represented by their
  // identity matches, avoiding incidental mentions in accessory descriptions.
  if (!scope.categoryId && scope.term && expandToken(scope.term).size > 1) {
    const counts = new Map();
    for (const p of products) if ([...expandToken(scope.term)].some(t => normalize(p.name + ' ' + p.family).split(' ').includes(t))) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    const category = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (category) {
      scope.categoryId = category[0];
      products = products.filter(p => p.categoryId === category[0]);
    }
  }
  const ids = products.map(p => p.id);
  let level, labels;
  const bs = distinct(products.map(p => p.brand)).filter(b => normalize(b) !== 'various');
  const fs = distinct(products.map(p => p.family));
  if (products.length === 1) {
    scope.modelId = products[0].id;
    const field = variantField(products[0]);
    level = field ? 'variant' : 'single';
    labels = field ? field.options.map(String) : [products[0].name];
  } else if (scope.brand && !scope.categoryId && distinct(products.map(p => p.categoryId)).length > 1) {
    level = 'category';
    labels = categoryLabels(products);
  } else if (bs.length > 1 && !scope.brand) {
    level = 'brand';
    labels = orderedBrands(products).map(b => brandLabel(b, products));
  } else if (fs.length > 1 && !scope.family) {
    level = 'family';
    labels = ordered(fs, products, 'family');
  } else {
    level = 'model';
    labels = ordered(distinct(products.map(p => p.name)), products, 'name');
  }
  return {
    level,
    labels,
    products: ids,
    ids,
    scope,
    ...(inlineVariant ? {
      variantAsked: inlineVariant,
      matchedVariant: inlineVariant
    } : {})
  };
}
function isCatalogLabel(value) {
  const key = normalize(value);
  if (key === 'iphones') return loadCatalog().products.some(p => /\biphone\b/i.test(p.family + ' ' + p.name));
  return buildTree(loadCatalog().products).some(p =>
    [p.category, p.brand, p.family, p.name].some(label => normalize(label) === key));
}
function assertCatalogLabel(value) {
  if (!isCatalogLabel(value)) throw new Error('Catalogue availability requires a catalogue label');
  return value;
}
module.exports = {
  buildTree,
  resolve,
  variantField,
  brandLabel,
  displayLabel,
  isCatalogLabel,
  assertCatalogLabel
};
