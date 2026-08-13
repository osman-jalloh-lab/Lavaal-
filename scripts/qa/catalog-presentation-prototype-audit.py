"""Capture real-data catalog presentation prototypes with screenshots and DOM evidence.

This does not call the catalog router directly. Each state is reached through the
public hash route, then product details and gallery thumbnails are activated as a
customer would. A visibly blank verified image is a failure even if its request
completed successfully.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:5173')
parser.add_argument('--browser', choices=('chromium', 'webkit'), default='chromium')
parser.add_argument('--mobile', action='store_true')
parser.add_argument('--output', required=True)
args = parser.parse_args()

cases = [
    ('01-products-overview', '#products', None),
    ('02-computers-marketplace', '#products/computers', None),
    ('03-dell-family', '#products/computers/dell', None),
    ('04-dell-pb16250-detail', '#products/computers/dell/models', 'icecat-131194172'),
    ('05-dell-p2726he-monitor', '#products/monitors/dell/models', 'icecat-143869546'),
    ('06-dell-poweredge-sourcing', '#products/servers/dell/poweredge', 'dell-poweredge'),
    ('07-tv-marketplace', '#products/tvs', None),
    ('08-lg-results', '#products/tvs/lg/models', None),
    ('09-lg-65ua731-detail', '#products/tvs/lg/models', 'icecat-139920272'),
    ('10-samsung-tablet-family', '#products/tablets/samsung', None),
    ('11-samsung-tablet-detail', '#products/tablets/samsung/models', 'icecat-134687128'),
    ('12-samsung-phone-family', '#products/phones/samsung', None),
    ('13-samsung-phone-detail', '#products/phones/samsung/galaxy-z', 'icecat-148400072'),
    ('14-refrigeration-marketplace', '#products/refrigeration', None),
    ('15-samsung-rz70-detail', '#products/refrigeration/samsung/models', 'icecat-141982141'),
    ('16-lenovo-family', '#products/computers/lenovo', None),
    ('17-lenovo-p16s-detail', '#products/computers/lenovo/models', 'icecat-149919314'),
]
base = args.base_url.rstrip('/')
out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
report = {'browser': args.browser, 'mobile': args.mobile, 'baseUrl': base, 'cases': [], 'console': [], 'failedRequests': [], 'fatal': None}

def inspect(page):
    return page.evaluate('''() => {
      const image=document.querySelector('#pgal-main-img'); const style=image&&getComputedStyle(image); const rect=image&&image.getBoundingClientRect();
      return {route:location.hash, theme:document.querySelector('.catalog-shell')?.dataset.catalogTheme,
        modalTheme:document.querySelector('#pgal-overlay')?.dataset.catalogTheme,
        sourcingCards:[...document.querySelectorAll('.model-card--sourcing')].map(card=>({hasImageStage:!!card.querySelector('.catalog-product-media,.product-image'),text:card.innerText.trim()})),
        image:image?{src:image.src,currentSrc:image.currentSrc,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,width:rect.width,height:rect.height,display:style.display,visibility:style.visibility,opacity:style.opacity}:null,
        thumbs:[...document.querySelectorAll('#pgal-thumbs button')].map((button,index)=>({index,pressed:button.getAttribute('aria-pressed'),src:button.querySelector('img')?.currentSrc||''}))};
    }''')

with sync_playwright() as p:
    browser = getattr(p, args.browser).launch(headless=True)
    context = browser.new_context(viewport={'width':390,'height':844} if args.mobile else {'width':1440,'height':900}, is_mobile=args.mobile, has_touch=args.mobile, device_scale_factor=2 if args.mobile else 1, record_har_path=str(out/'network.har'), service_workers='block')
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    page.on('console', lambda msg: report['console'].append({'type':msg.type,'text':msg.text,'url':page.url}) if msg.type in ('error','warning') else None)
    page.on('requestfailed', lambda req: report['failedRequests'].append({'url':req.url,'failure':req.failure,'route':page.url}))
    try:
        for name, route, model_id in cases:
            page.goto(base + '/' + route, wait_until='domcontentloaded'); page.wait_for_timeout(900)
            if model_id:
                card = page.locator(f'.model-card[data-model-id="{model_id}"]')
                card.scroll_into_view_if_needed(); page.screenshot(path=str(out/f'{name}-listing.png'), full_page=False); card.locator('.model-details-btn').click(force=True)
                page.locator('.pgal-overlay.show').wait_for(state='visible'); page.wait_for_timeout(650)
            state = inspect(page)
            page.screenshot(path=str(out/f'{name}.png'), full_page=False)
            item = {'name':name, 'state':state, 'screenshot':str(out/f'{name}.png')}
            report['cases'].append(item)
            if model_id and model_id.startswith('icecat-'):
                image=state['image'] or {}
                if not (image.get('naturalWidth',0)>0 and image.get('naturalHeight',0)>0 and image.get('width',0)>0 and image.get('height',0)>0 and image.get('display') != 'none' and image.get('visibility') != 'hidden' and float(image.get('opacity','0'))>0):
                    raise RuntimeError(f'Visually invalid primary image: {model_id}')
                for thumb in page.locator('#pgal-thumbs button').all():
                    thumb.click(); page.wait_for_timeout(350)
                    thumb_state=inspect(page)
                    page.screenshot(path=str(out/f'{name}-thumb-{thumb_state["thumbs"].index(next(t for t in thumb_state["thumbs"] if t["pressed"]=="true"))}.png'), full_page=False)
                    active=[item for item in thumb_state['thumbs'] if item['pressed']=='true']
                    if len(active)!=1 or not thumb_state['image'] or thumb_state['image']['naturalWidth']<=0:
                        raise RuntimeError(f'Gallery visual/state failure: {model_id}')
                if model_id == 'icecat-149919314':
                    panel = page.locator('.pgal-panel')
                    panel.evaluate('(element) => { element.scrollTop = element.scrollHeight; }')
                    page.wait_for_timeout(250)
                    quote = page.locator('#pgal-request-btn')
                    quote.scroll_into_view_if_needed()
                    page.screenshot(path=str(out/f'{name}-quote-visible.png'), full_page=False)
                    quote_state = quote.evaluate('''(element) => { const rect=element.getBoundingClientRect(); const style=getComputedStyle(element); return {top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,background:style.backgroundColor,color:style.color,visible:style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0}; }''')
                    if not quote_state['visible'] or quote_state['bottom'] > page.viewport_size['height'] or quote_state['background'] != 'rgb(226, 35, 26)' or quote_state['color'] != 'rgb(255, 255, 255)':
                        raise RuntimeError(f'Lenovo quote CTA is not visibly high contrast: {quote_state}')
                page.keyboard.press('Escape')
            if model_id == 'dell-poweredge' and any(card['hasImageStage'] for card in state['sourcingCards']):
                raise RuntimeError('Sourcing listing rendered a product media stage')
            if model_id:
                page.keyboard.press('Escape')
    except Exception as error:
        report['fatal'] = str(error)
    finally:
        context.tracing.stop(path=str(out/'trace.zip')); context.close(); browser.close()
out.joinpath('report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'cases':len(report['cases']),'fatal':report['fatal'],'report':str(out/'report.json')},indent=2))
raise SystemExit(1 if report['fatal'] else 0)
