"""Screenshot-first production audit for real customer gallery navigation.

This deliberately clicks through the public Products UI. It never passes an
image based solely on transport state: every opened exact SKU produces a
settled modal screenshot plus DOM/layout/network evidence.
"""
import argparse, json, pathlib, re, time
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--browser', choices=('chromium', 'webkit'), required=True)
parser.add_argument('--mobile', action='store_true')
parser.add_argument('--base-url', default='https://www.lavaall.com')
parser.add_argument('--output', required=True)
parser.add_argument('--focused-only', action='store_true')
args = parser.parse_args()
base = args.base_url.rstrip('/')
out = pathlib.Path(args.output); shots = out / 'screenshots'; shots.mkdir(parents=True, exist_ok=True)

focused = {
  '55170975', '36393926', '139920272', '120583473', '130695305', '130728217',
  '134687128', '134687130', '134687132', '134688919',
  '134687004', '148400072', '148400062', '148400059', '132622687', '132622684',
  '142313844', '141819608', '134662666', '149919314', '130590632'
}
slug = lambda value: re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', str(value).lower()))
report = {'baseUrl': base, 'browser': args.browser, 'mobile': args.mobile, 'products': [], 'console': [], 'failedRequests': [], 'networkErrors': [], 'fatal': None}

def settle(page):
    page.wait_for_timeout(1200)
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    page.wait_for_timeout(300)

def snapshot(page):
    return page.evaluate('''() => {
      const img = document.querySelector('#pgal-main-img');
      const box = document.querySelector('.pgal-main');
      const style = img ? getComputedStyle(img) : null;
      const r = img ? img.getBoundingClientRect() : {width:0,height:0};
      const p = box ? box.getBoundingClientRect() : {width:0,height:0};
      return { title:document.querySelector('#pgal-title')?.textContent?.trim(),
        route:location.hash, html:document.querySelector('.pgal-overlay')?.outerHTML || '',
        image:img ? {src:img.src,currentSrc:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,display:style.display,visibility:style.visibility,opacity:style.opacity,parentWidth:p.width,parentHeight:p.height} : null,
        placeholder:getComputedStyle(document.querySelector('#pgal-main-placeholder') || document.body).display,
        thumbnails:[...document.querySelectorAll('.pgal-thumbs button')].map((b,i)=>({i,pressed:b.getAttribute('aria-pressed'),display:getComputedStyle(b).display,src:b.querySelector('img')?.currentSrc || b.querySelector('img')?.src || ''}))
      };
    }''')

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch(headless=True)
    options = {'viewport': {'width': 390, 'height': 844} if args.mobile else {'width': 1440, 'height': 900},
               'record_har_path': str(out / 'network.har'), 'record_har_mode': 'full',
               # A fresh browser context begins without persisted browser
               # cache/state. Do not add Cache-Control request headers: those
               # cause cross-origin font/CDN preflights that customers do not
               # make and would contaminate the console evidence.
               'service_workers': 'block'}
    if args.mobile:
        options.update({'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2})
    context = browser.new_context(**options)
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    responses = {}
    page.on('console', lambda msg: report['console'].append({'type':msg.type, 'text':msg.text, 'url':page.url}) if msg.type in ('error','warning') else None)
    page.on('requestfailed', lambda req: report['failedRequests'].append({'url':req.url, 'failure':req.failure, 'route':page.url}))
    def response(res):
        if '/images/catalog/' in res.url:
            responses[res.url] = {'status':res.status, 'contentType':res.headers.get('content-type',''), 'route':page.url}
        if res.status >= 400: report['networkErrors'].append({'url':res.url,'status':res.status,'route':page.url})
    page.on('response', response)
    try:
        # Customer start: homepage then actual Products navigation click.
        page.goto(base, wait_until='domcontentloaded'); settle(page)
        page.locator('a[href="#products"]:visible').first.click(); page.wait_for_timeout(800)
        products = page.evaluate('window.LAVAALL_GENERATED_CATALOG?.products || []')
        report['productionCatalog'] = {'count':len(products), 'generatedAt':page.evaluate('window.LAVAALL_GENERATED_CATALOG?.generatedAt || null')}
        for product in products:
            product_id = str(product['sourceProductId'])
            if args.focused_only and product_id not in focused: continue
            # Restart each product at the actual homepage and use visible public
            # category/brand/family links, not a deep-link or router function.
            page.goto(base, wait_until='domcontentloaded'); settle(page)
            page.locator('a[href="#products"]:visible').first.click(); page.wait_for_timeout(500)
            category = slug(product['category']); brand = slug(product['brand']); family = slug(product.get('family') or product.get('series') or 'Models')
            category_link = page.locator(f'#catalog-overview-grid a[href="#products/{category}"]')
            if category_link.count():
                category_link.first.click(); page.wait_for_timeout(450)
                page.locator(f'#catalog-root a[href="#products/{category}/{brand}"]').first.click(); page.wait_for_timeout(450)
                page.locator(f'#catalog-root a[href="#products/{category}/{brand}/{family}"]').first.click(); page.wait_for_timeout(550)
                card = page.locator(f'.model-card[data-model-id="icecat-{product_id}"]')
            else:
                # Some existing Layer-1 overview cards are specific sourcing
                # families rather than a broad category. Enter the visible
                # catalog by clicking one of that category's overview cards,
                # then use the public search control instead of a direct route.
                page.locator(f'#catalog-overview-grid a[href^="#products/{category}/"]').first.click(); page.wait_for_timeout(450)
                search = page.locator('#catalog-search'); search.fill(product.get('mpn') or product['name']); page.wait_for_timeout(500)
                card = page.locator(f'.model-card[data-model-id="icecat-{product_id}"]')
            card.scroll_into_view_if_needed(); card.locator('.model-details-btn').click(force=True)
            page.locator('.pgal-overlay.show').wait_for(state='visible'); settle(page)
            state = snapshot(page)
            filebase = f'{product_id}-{slug(product.get("name", "product"))}'
            shot = shots / f'{filebase}.png'; page.screenshot(path=str(shot), full_page=False)
            dom = out / f'{filebase}.html'; dom.write_text(state['html'], encoding='utf-8')
            state.update({'sourceProductId':product_id, 'productName':product.get('name'), 'mpn':product.get('mpn'), 'screenshot':str(shot), 'html':str(dom), 'network':responses.get(state.get('image',{}).get('currentSrc') or state.get('image',{}).get('src'))})
            report['products'].append(state)
            image = state.get('image') or {}
            visually_invalid = not (image.get('complete') and image.get('naturalWidth',0)>0 and image.get('naturalHeight',0)>0 and image.get('renderedWidth',0)>0 and image.get('renderedHeight',0)>0 and image.get('display') != 'none' and image.get('visibility') != 'hidden' and float(image.get('opacity','0')) > 0)
            if visually_invalid:
                report['fatal'] = {'reason':'visually-invalid-primary', 'product':state}
                break
            page.keyboard.press('Escape')
    except Exception as error:
        report['fatal'] = {'reason':'automation-error', 'error':str(error), 'route':page.url}
    finally:
        context.tracing.stop(path=str(out / 'trace.zip'))
        context.close(); browser.close()
out.joinpath('report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'products':len(report['products']), 'fatal':report['fatal'], 'report':str(out/'report.json')}, indent=2))
