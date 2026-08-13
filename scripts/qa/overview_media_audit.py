"""Screenshot-first audit of the frozen LAVAALL Products overview.

This deliberately evaluates what a customer sees. A 200 response is recorded,
but can never turn a zero-sized, hidden, or placeholder image into a PASS.
"""
import argparse
import hashlib
import json
import pathlib
import re
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='https://www.lavaall.com')
parser.add_argument('--output', default='scripts/qa/artifacts/overview-media-audit')
args = parser.parse_args()

base = args.base_url.rstrip('/')
root = pathlib.Path(__file__).resolve().parents[2]
out = root / args.output
manifest_path = root / 'scripts/product-images/product-image-manifest.json'
manifest = {item['id']: item for item in json.loads(manifest_path.read_text(encoding='utf-8'))}

def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')

def local_path(source):
    parsed = urlparse(source or '')
    if parsed.netloc and parsed.netloc not in urlparse(base).netloc:
        return None
    return parsed.path.lstrip('/') if parsed.path else None

def classification(card):
    item = manifest.get(card['id'])
    image = card['image']
    if image and image['visuallyBroken']:
        return 'BROKEN', 'The rendered image element is hidden, collapsed, or undecoded.'
    if card['placeholder']:
        if item and item.get('usageStatus') in ('unclear', 'restricted'):
            return 'INTENTIONAL_NO_MEDIA', item.get('notes', 'Exact media rights are unresolved.')
        return 'GENERIC_ICON', 'The overview fell back to a generic icon without an intentional no-media record.'
    if not image:
        return 'BROKEN', 'The card has neither an image element nor an intentional placeholder.'
    if item and item.get('usageStatus') == 'original' and item.get('localFile') == card['localPath']:
        return 'REAL_CATEGORY_ART', item.get('notes', 'Approved original category artwork.')
    # Unmanifested assets may look fine but cannot make a media-rights claim.
    return 'UNKNOWN_SOURCE', 'Local asset is rendered, but no matching provenance record establishes its source and permitted usage.'

report = {
    'baseUrl': base,
    'overviewCardExpectedCount': 24,
    'runs': [],
    'cards': [],
    'summary': {},
}

def inspect_run(playwright, browser_name, mobile):
    browser = getattr(playwright, browser_name).launch(headless=True)
    run_name = f'{browser_name}-{"mobile" if mobile else "desktop"}'
    run_dir = out / run_name
    run_dir.mkdir(parents=True, exist_ok=True)
    options = {
        'viewport': {'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 900},
        'service_workers': 'block',
        'record_har_path': str(run_dir / 'network.har'),
        'record_har_mode': 'full',
    }
    if mobile:
        options.update({'is_mobile': True, 'has_touch': True, 'device_scale_factor': 2})
    context = browser.new_context(**options)
    context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = context.new_page()
    responses, console, failed = {}, [], []
    page.on('console', lambda msg: console.append({'type': msg.type, 'text': msg.text, 'url': page.url}) if msg.type in ('error', 'warning') else None)
    page.on('requestfailed', lambda req: failed.append({'url': req.url, 'failure': req.failure, 'route': page.url}))
    def response(res):
        if '/images/' in res.url:
            responses[res.url] = {'status': res.status, 'contentType': res.headers.get('content-type', '')}
    page.on('response', response)
    failure = None
    cards = []
    try:
        page.goto(base, wait_until='domcontentloaded')
        page.locator('a[href="#products"]:visible').first.click()
        page.locator('#catalog-overview-grid .prod-card').first.wait_for(state='visible', timeout=10000)
        locator = page.locator('#catalog-overview-grid .prod-card')
        count = locator.count()
        if count != 24:
            raise RuntimeError(f'expected 24 overview cards, found {count}')
        for index in range(count):
            card = locator.nth(index)
            card.scroll_into_view_if_needed()
            page.wait_for_timeout(160)
            snapshot = card.evaluate('''el => {
              const img = el.querySelector('img');
              const r = img ? img.getBoundingClientRect() : {width:0,height:0};
              const p = el.querySelector('.product-image');
              const pr = p ? p.getBoundingClientRect() : {width:0,height:0};
              const s = img ? getComputedStyle(img) : null;
              return {
                title: el.querySelector('h3')?.textContent?.trim() || '',
                id: el.dataset.overviewModel || el.dataset.overviewCategory || '',
                cardType: el.dataset.overviewModel ? 'spotlight-model' : 'category-teaser',
                placeholder: !!el.querySelector('.product-image.ph'),
                image: img ? {src:img.src, currentSrc:img.currentSrc, complete:img.complete,
                  naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight,
                  renderedWidth:r.width, renderedHeight:r.height, display:s.display,
                  visibility:s.visibility, opacity:s.opacity,
                  visuallyBroken: s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || r.width === 0 || r.height === 0 || img.naturalWidth === 0 || img.naturalHeight === 0} : null,
                parent: {width:pr.width, height:pr.height, display:p ? getComputedStyle(p).display : '', visibility:p ? getComputedStyle(p).visibility : ''}
              };
            }''')
            if snapshot['image']:
                snapshot['localPath'] = local_path(snapshot['image']['currentSrc'] or snapshot['image']['src'])
                snapshot['isLocal'] = bool(snapshot['localPath'])
                snapshot['network'] = responses.get(snapshot['image']['currentSrc'] or snapshot['image']['src'])
            else:
                snapshot['localPath'] = None
                snapshot['isLocal'] = False
                snapshot['network'] = None
            image_file = root / snapshot['localPath'] if snapshot['localPath'] else None
            snapshot['file'] = ({'sha256': hashlib.sha256(image_file.read_bytes()).hexdigest(), 'bytes': image_file.stat().st_size}
                                if image_file and image_file.is_file() else None)
            screenshot = run_dir / f'{index + 1:02d}-{slug(snapshot["title"])}.png'
            card.screenshot(path=str(screenshot))
            snapshot['screenshot'] = str(screenshot.relative_to(root))
            cards.append(snapshot)
        # WebKit cannot capture an arbitrarily tall full-page bitmap. Every
        # card has already received its own screenshot above; retain a
        # viewport overview screenshot as an equivalent browser-safe artifact.
        try:
            page.screenshot(path=str(run_dir / 'overview-full.png'), full_page=True)
        except Exception:
            page.screenshot(path=str(run_dir / 'overview-viewport.png'), full_page=False)
    except Exception as error:
        failure = str(error)
    finally:
        context.tracing.stop(path=str(run_dir / 'trace.zip'))
        context.close(); browser.close()
    return {'browser': browser_name, 'mobile': mobile, 'cards': cards, 'console': console, 'failedRequests': failed, 'failure': failure}

with sync_playwright() as playwright:
    for browser_name, mobile in (('chromium', False), ('chromium', True), ('webkit', False), ('webkit', True)):
        report['runs'].append(inspect_run(playwright, browser_name, mobile))

# Desktop Chromium is the canonical card inventory; all contexts are retained
# separately to prove rendering, dimensions, and screenshots per browser.
canonical = report['runs'][0]['cards']
for card in canonical:
    classification_name, reason = classification(card)
    item = manifest.get(card['id'])
    card['classification'] = classification_name
    card['rootCause'] = reason
    card['expectedMediaType'] = item.get('type') if item else ('generic-category' if card['cardType'] == 'category-teaser' else 'legacy-family-or-model')
    card['provenance'] = item or None
report['cards'] = canonical
for kind in ('REAL_CATEGORY_ART', 'VERIFIED_EXACT_MEDIA', 'INTENTIONAL_NO_MEDIA', 'GENERIC_ICON', 'BROKEN', 'WRONG_MEDIA', 'UNKNOWN_SOURCE'):
    report['summary'][kind] = sum(card['classification'] == kind for card in canonical)
report['summary']['allContextsPassed'] = all(not run['failure'] and len(run['cards']) == 24 for run in report['runs'])

out.mkdir(parents=True, exist_ok=True)
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'cards': len(canonical), 'summary': report['summary'], 'runs': [{'browser': run['browser'], 'mobile': run['mobile'], 'failure': run['failure']} for run in report['runs']]}))
