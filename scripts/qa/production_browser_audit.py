"""Browser-level LAVAALL product-tree audit. Invoked by production-browser-audit.mjs."""
import argparse, json, pathlib, re, sys, time
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='https://www.lavaall.com')
parser.add_argument('--report', default='scripts/qa/reports/production-browser-audit.json')
parser.add_argument('--mobile', action='store_true')
args = parser.parse_args()
base = args.base_url.rstrip('/')
report = {'baseUrl': base, 'mobile': args.mobile, 'categoriesVisited': [], 'brandsVisited': [], 'familiesVisited': [], 'routesVisited': [], 'productsOpened': [], 'cardsInspected': 0, 'imagesInspected': 0, 'galleryThumbnailsClicked': 0, 'searchesPerformed': 0, 'quoteChecks': 0, 'languageChecks': {}, 'brokenImages': [], 'wrongImages': [], 'fallbackImages': [], 'blankRoutes': [], 'deadButtons': [], 'consoleErrors': [], 'networkErrors': [], 'routingFailures': [], 'searchFailures': [], 'quoteFailures': [], 'quarantinedVisible': [], 'generatedCatalogMissing': False}

def wait(page, ms=220):
    page.wait_for_timeout(ms)

def slug(value):
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', str(value).lower()))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 390, 'height': 844} if args.mobile else {'width': 1440, 'height': 900})
    page = context.new_page()
    page.on('console', lambda msg: report['consoleErrors'].append({'type': msg.type, 'text': msg.text, 'url': page.url}) if msg.type in ('error', 'warning') else None)
    page.on('requestfailed', lambda req: report['networkErrors'].append({'url': req.url, 'error': req.failure, 'route': page.url}))
    page.on('response', lambda res: report['networkErrors'].append({'url': res.url, 'status': res.status, 'route': page.url}) if res.status >= 400 else None)
    page.goto(base + '/#products', wait_until='domcontentloaded')
    wait(page, 900)
    report['generatedCatalogMissing'] = not bool(page.evaluate('Boolean(window.LAVAALL_GENERATED_CATALOG && window.LAVAALL_GENERATED_CATALOG.products)'))
    seed = page.locator('#catalog-overview-grid a[href^="#products/"]').evaluate_all('(els) => els.map(e => e.getAttribute("href"))')
    report['overviewCardsInspected'] = len(seed)
    runtime_categories = page.evaluate('window.LAVAALL_CATALOG_CATEGORY_IDS || []')
    report['runtimeCategoryManifestCount'] = len(runtime_categories)
    queue, seen, leaves = list(dict.fromkeys(seed + ["#products/" + category for category in runtime_categories])), set(), []
    while queue:
        route = queue.pop(0)
        if route in seen: continue
        seen.add(route)
        page.goto(base + '/' + route, wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.LAVAALL_GENERATED_CATALOG && window.LAVAALL_GENERATED_CATALOG.products)', timeout=5000)
        wait(page, 500)
        cats = page.locator('#catalog-root a.cat-card[href^="#products/"]').evaluate_all('(els) => els.map(e => e.getAttribute("href"))')
        cards = page.locator('#catalog-root .model-card').count()
        report['routesVisited'].append(route)
        parts = route.split('/')
        if len(parts) > 1: report['categoriesVisited'].append(parts[1])
        if len(parts) > 2: report['brandsVisited'].append('/'.join(parts[1:3]))
        if len(parts) > 3: report['familiesVisited'].append('/'.join(parts[1:4]))
        if not cats and not cards: report['blankRoutes'].append(route)
        if cards: leaves.append(route)
        queue.extend(x for x in cats if x not in seen)
    # A generated family can be appended during the catalog's post-load merge.
    # Re-expand discovered branch nodes after a settled render, so a fast initial
    # response cannot make the audit accidentally omit a newly merged branch.
    queue = list(seen)
    while queue:
        route = queue.pop(0)
        page.goto(base + '/' + route, wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.LAVAALL_GENERATED_CATALOG && window.LAVAALL_GENERATED_CATALOG.products)', timeout=5000)
        wait(page, 900)
        cats = page.locator('#catalog-root a.cat-card[href^="#products/"]').evaluate_all('(els) => els.map(e => e.getAttribute("href"))')
        cards = page.locator('#catalog-root .model-card').count()
        if cards and route not in leaves: leaves.append(route)
        for child in cats:
            if child not in seen:
                seen.add(child); queue.append(child)
    # The data bundle is also a runtime customer-facing source. Derive each
    # approved SKU's family route from it, rather than maintaining a hand list;
    # this catches any branch that was appended after a browser hash rendered.
    generated = page.evaluate('window.LAVAALL_GENERATED_CATALOG.products')
    for product in generated:
        family = product.get('family') or product.get('series') or 'Models'
        route = '#products/{}/{}/{}'.format(slug(product['category']), slug(product['brand']), slug(family))
        if route not in leaves: leaves.append(route)
    for route in leaves:
        page.goto(base + '/' + route, wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.LAVAALL_GENERATED_CATALOG && window.LAVAALL_GENERATED_CATALOG.products)', timeout=5000)
        wait(page, 500)
        cards = page.locator('#catalog-root .model-card')
        for i in range(cards.count()):
            card = cards.nth(i)
            card.scroll_into_view_if_needed()
            card_data = card.evaluate('''el => { const im=el.querySelector('img'); const r=im && im.getBoundingClientRect(); return { id:el.dataset.modelId, text:el.innerText, placeholder:!!el.querySelector('.product-image.ph'), image:im && {src:im.src, complete:im.complete, w:im.naturalWidth, h:im.naturalHeight, rw:r.width, rh:r.height} }; }''')
            report['cardsInspected'] += 1
            if card_data['placeholder']:
                report['fallbackImages'].append({'route': route, 'id': card_data['id']})
            elif not card_data['image'] or not card_data['image']['complete'] or not card_data['image']['w']:
                report['brokenImages'].append({'scope':'card','route':route,'id':card_data['id'],'image':card_data['image']})
            else:
                report['imagesInspected'] += 1
            details = card.locator('.model-details-btn')
            quote = card.locator('.model-quote-btn')
            if not details.is_enabled() or not quote.is_enabled(): report['deadButtons'].append({'route':route,'id':card_data['id']})
            details.click()
            page.locator('.pgal-overlay.show').wait_for(state='visible')
            wait(page, 15)
            modal = page.evaluate('''() => { const im=document.querySelector('#pgal-main-img'); const ph=document.querySelector('#pgal-main-placeholder'); return {title:document.querySelector('#pgal-title')?.textContent || '', desc:document.querySelector('#pgal-desc')?.textContent || '', src:im?.src || '', w:im?.naturalWidth || 0, h:im?.naturalHeight || 0, placeholder:!!ph && getComputedStyle(ph).display !== 'none'}; }''')
            if not modal['title'] or 'undefined' in (modal['title'] + modal['desc']).lower() or (not modal['placeholder'] and not modal['w']):
                report['brokenImages'].append({'scope':'detail','route':route,'id':card_data['id'],'modal':modal})
            thumbs = page.locator('.pgal-thumbs button')
            thumb_count = thumbs.count()
            if thumb_count > 1:
                for thumb in range(thumb_count):
                    thumbs.nth(thumb).click()
                    # Remote production images can take longer than a local
                    # cached file. Wait for a real decode/load, not one frame.
                    try:
                        page.wait_for_function('document.querySelector("#pgal-main-img").naturalWidth > 0', timeout=5000)
                    except Exception:
                        pass
                    state = page.evaluate('''() => ({w:document.querySelector('#pgal-main-img').naturalWidth, pressed:[...document.querySelectorAll('.pgal-thumbs button')].map(b=>b.getAttribute('aria-pressed'))})''')
                    report['galleryThumbnailsClicked'] += 1
                    if not state['w'] or state['pressed'].count('true') != 1 or state['pressed'][thumb] != 'true':
                        report['brokenImages'].append({'scope':'gallery','route':route,'id':card_data['id'],'thumbnail':thumb,'state':state})
                thumbs.nth(0).click()
                report['galleryThumbnailsClicked'] += 1
            if str(card_data['id']).startswith('icecat-'):
                if '145145130' in card_data['id'] or '145145101' in card_data['id']: report['quarantinedVisible'].append(card_data['id'])
                # Verify the shared quote flow retains exact SKU identity. It
                # opens the client-side form only; this audit never submits.
                # The detail modal is already open for this exact card. Its
                # shared Request Quote control is the same flow exposed by
                # the card button, without trying to click through its own
                # active backdrop.
                page.locator('#pgal-request-btn').click()
                wait(page, 12)
                quote_text = page.locator('[name="message"]').input_value() if page.locator('[name="message"]').count() else ''
                expected = card_data['id'].replace('icecat-', '')
                if expected not in quote_text or not quote_text.strip():
                    report['quoteFailures'].append({'route': route, 'id': card_data['id'], 'summary': quote_text})
                report['quoteChecks'] += 1
                page.evaluate('document.getElementById("pgal-quote-dd")?.remove()')
            report['productsOpened'].append({'route':route, 'id':card_data['id'], 'title':modal['title'], 'thumbnailCount':thumb_count})
            page.keyboard.press('Escape')
    # Search every production-approved exact SKU by its stable visible MPN.
    # Search runs from the customer-facing category browser, not from bundle data.
    for product in generated:
        page.goto(base + '/#products/' + slug(product['category']), wait_until='domcontentloaded')
        wait(page, 450)
        search = page.locator('#catalog-search')
        term = product.get('mpn') or product.get('productName')
        search.fill(term)
        wait(page, 260)  # production search deliberately debounces at 150 ms
        product_id = 'icecat-' + str(product['sourceProductId'])
        if not page.locator('.model-card[data-model-id="{}"]'.format(product_id)).count():
            report['searchFailures'].append({'id': product_id, 'term': term})
        report['searchesPerformed'] += 1
    # The language switch must preserve a usable Products overview. This uses
    # the actual toggle and restores the starting language afterwards.
    page.goto(base + '/#products', wait_until='domcontentloaded')
    wait(page, 350)
    report['languageChecks']['enOverviewCards'] = page.locator('#catalog-overview-grid a[href^="#products/"]').count()
    switch = page.locator('.lb', has_text='FR')
    if switch.count():
        switch.click(); wait(page, 250)
        report['languageChecks']['alternateOverviewCards'] = page.locator('#catalog-overview-grid a[href^="#products/"]').count()
        page.locator('.lb', has_text='EN').click(); wait(page, 100)
    else:
        report['languageChecks']['toggleMissing'] = True
    report['categoriesVisited'] = sorted(set(report['categoriesVisited']))
    report['brandsVisited'] = sorted(set(report['brandsVisited']))
    report['familiesVisited'] = sorted(set(report['familiesVisited']))
    report['result'] = 'PASS' if not any([report['generatedCatalogMissing'], report['brokenImages'], report['blankRoutes'], report['deadButtons'], report['quarantinedVisible'], report['searchFailures'], report['quoteFailures']]) else 'FAIL'
    context.close(); browser.close()
path = pathlib.Path(args.report); path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({k: report[k] for k in ('result','overviewCardsInspected','cardsInspected','galleryThumbnailsClicked','generatedCatalogMissing','brokenImages','blankRoutes','deadButtons')}, indent=2))
sys.exit(0 if report['result'] == 'PASS' else 1)
