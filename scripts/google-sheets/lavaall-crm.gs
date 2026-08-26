const CRM_HEADERS = {
  Leads: ['Lead ID','Received At (UTC)','Request Type','Status','Name','Email','Phone','Company','Country','Quantity','Category','Brand','Product Name','Requested Model','Source Product ID','MPN','GTIN','Message','Product Image URL','Product Preview','Source Page','Follow-up Date','Owner','Notes'],
  Products: ['Source Product ID','Brand','Product Name','MPN','GTIN','Category','Listing Type','Primary Image URL','Product Preview','Gallery Count','Verified At (UTC)','Status'],
  'Image Health': ['Checked At (UTC)','Product ID','Route','Image URL','Result','HTTP Status','Content Type','Natural W','Natural H','Rendered W','Rendered H','Attempts','Run ID'],
  'QA Runs': ['Run ID','Checked At (UTC)','Environment','Viewport','Result','Verified SKUs','Sourcing Listings','Routes','Products Opened','Thumbnail Clicks','Broken Images','Wrong Images','Blank Routes','Dead Controls','Console Errors','Network Failures','Commit']
};

const STATUS_VALUES = ['New','Contacted','Qualified','Quoted','Negotiating','Won','Lost'];
const REQUEST_TYPES = ['verified-product','sourcing','internal-test'];

function createOrSetupCRM() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty('CRM_SHEET_ID');
  let ss;
  if (sheetId) {
    ss = SpreadsheetApp.openById(sheetId);
  } else {
    ss = SpreadsheetApp.create('LAVAALL CRM');
    sheetId = ss.getId();
    props.setProperty('CRM_SHEET_ID', sheetId);
  }

  Object.keys(CRM_HEADERS).forEach(name => ensureSheet_(ss, name, CRM_HEADERS[name]));
  ensureDashboard_(ss);
  ensureValidations_(ss);

  if (!props.getProperty('CRM_WEBHOOK_SECRET')) {
    props.setProperty('CRM_WEBHOOK_SECRET', Utilities.getUuid() + Utilities.getUuid().replace(/-/g, ''));
  }

  const result = {
    spreadsheetUrl: ss.getUrl(),
    spreadsheetId: sheetId,
    webhookSecret: props.getProperty('CRM_WEBHOOK_SECRET')
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function getCRMSetupInfo() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CRM_SHEET_ID');
  return {
    spreadsheetUrl: id ? SpreadsheetApp.openById(id).getUrl() : null,
    spreadsheetId: id || null,
    webhookSecret: props.getProperty('CRM_WEBHOOK_SECRET') || null
  };
}

function rotateCRMWebhookSecret() {
  const next = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('CRM_WEBHOOK_SECRET', next);
  console.log('CRM webhook secret rotated. Update QUOTE_WEBHOOK_SECRET and CRM_WEBHOOK_SECRET in every authorized environment.');
  return next;
}

function doGet() {
  return json_({ ok: true, service: 'lavaall-crm', configured: Boolean(PropertiesService.getScriptProperties().getProperty('CRM_SHEET_ID')) });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const props = PropertiesService.getScriptProperties();
    const expectedSecret = props.getProperty('CRM_WEBHOOK_SECRET');
    if (!expectedSecret || body.secret !== expectedSecret) return json_({ ok: false, error: 'unauthorized' });

    const eventType = String(body.eventType || '');
    if (eventType === 'lead') return handleLead_(body.payload || {});
    if (eventType === 'product-sync') return handleProductSync_(body.products || []);
    if (eventType === 'qa-run') return handleQARun_(body.payload || {});
    return json_({ ok: false, error: 'unknown_event_type' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'invalid_request' });
  }
}

function handleLead_(lead) {
  const required = ['deliveryId','receivedAt','requestType','name','email','phone','company','country','quantity'];
  if (required.some(key => lead[key] === undefined || lead[key] === null || lead[key] === '')) return json_({ ok: false, error: 'invalid_lead' });
  if (REQUEST_TYPES.indexOf(String(lead.requestType)) === -1) return json_({ ok: false, error: 'invalid_request_type' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = openCRM_();
    const sheet = ss.getSheetByName('Leads');
    const deliveryId = String(lead.deliveryId);
    if (findExact_(sheet, 1, deliveryId)) return json_({ ok: true, accepted: true, duplicate: true, leadId: deliveryId });

    const context = lead.context || {};
    let productImageUrl = '';
    if (lead.requestType === 'verified-product' && context.sourceProductId) {
      productImageUrl = lookupProductImage_(ss, String(context.sourceProductId));
    }

    const row = [
      deliveryId,
      new Date(lead.receivedAt),
      safe_(lead.requestType, 32),
      'New',
      safe_(lead.name, 100),
      safe_(lead.email, 160),
      safe_(lead.phone, 40),
      safe_(lead.company, 120),
      safe_(lead.country, 80),
      Number(lead.quantity) || 1,
      safe_(context.category, 80),
      safe_(context.brand, 80),
      safe_(context.productName, 240),
      safe_(context.requestedModel, 240),
      safe_(context.sourceProductId, 80),
      safe_(context.mpn, 160),
      safe_(context.gtin, 80),
      safe_(lead.message, 2000),
      productImageUrl,
      '',
      safe_(lead.sourcePage, 500),
      '',
      '',
      ''
    ];
    sheet.appendRow(row);
    const rowNumber = sheet.getLastRow();
    if (productImageUrl) sheet.getRange(rowNumber, 20).setFormula(`=IF(S${rowNumber}<>"",IMAGE(S${rowNumber}),"")`);
    return json_({ ok: true, accepted: true, leadId: deliveryId });
  } finally {
    lock.releaseLock();
  }
}

function handleProductSync_(products) {
  if (!Array.isArray(products) || products.length > 5000) return json_({ ok: false, error: 'invalid_products' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = openCRM_();
    const sheet = ss.getSheetByName('Products');
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, CRM_HEADERS.Products.length).clearContent();
    const rows = products.map(product => [
      safe_(product.sourceProductId, 80),
      safe_(product.brand, 100),
      safe_(product.productName, 260),
      safe_(product.mpn, 160),
      safe_(product.gtin, 100),
      safe_(product.category, 100),
      safe_(product.listingType || 'verified', 40),
      safe_(product.primaryImageUrl, 600),
      '',
      Number(product.galleryCount) || 0,
      product.verifiedAt ? new Date(product.verifiedAt) : new Date(),
      safe_(product.status || 'Live', 40)
    ]);
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, CRM_HEADERS.Products.length).setValues(rows);
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2;
        if (rows[i][7]) sheet.getRange(rowNumber, 9).setFormula(`=IF(H${rowNumber}<>"",IMAGE(H${rowNumber}),"")`);
      }
    }
    return json_({ ok: true, accepted: true, products: rows.length });
  } finally {
    lock.releaseLock();
  }
}

function handleQARun_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = openCRM_();
    const qa = ss.getSheetByName('QA Runs');
    const runId = safe_(payload.runId || Utilities.getUuid(), 120);
    qa.appendRow([
      runId,
      payload.checkedAt ? new Date(payload.checkedAt) : new Date(),
      safe_(payload.environment || 'production', 40),
      safe_(payload.viewport, 40),
      safe_(payload.result, 20),
      Number(payload.verifiedSkus) || 0,
      Number(payload.sourcingListings) || 0,
      Number(payload.routes) || 0,
      Number(payload.productsOpened) || 0,
      Number(payload.thumbnailClicks) || 0,
      Number(payload.brokenImages) || 0,
      Number(payload.wrongImages) || 0,
      Number(payload.blankRoutes) || 0,
      Number(payload.deadControls) || 0,
      Number(payload.consoleErrors) || 0,
      Number(payload.networkFailures) || 0,
      safe_(payload.commit, 120)
    ]);

    const imageHealth = ss.getSheetByName('Image Health');
    const checks = Array.isArray(payload.imageChecks) ? payload.imageChecks.slice(0, 5000) : [];
    if (checks.length) {
      if (imageHealth.getLastRow() > 1) imageHealth.getRange(2, 1, imageHealth.getLastRow() - 1, CRM_HEADERS['Image Health'].length).clearContent();
      const rows = checks.map(check => [
        payload.checkedAt ? new Date(payload.checkedAt) : new Date(),
        safe_(check.productId, 100),
        safe_(check.route, 500),
        safe_(check.url, 700),
        safe_(check.result, 80),
        Number(check.httpStatus) || '',
        safe_(check.contentType, 100),
        Number(check.naturalWidth) || 0,
        Number(check.naturalHeight) || 0,
        Number(check.renderedWidth) || 0,
        Number(check.renderedHeight) || 0,
        Number(check.attempts) || 0,
        runId
      ]);
      imageHealth.getRange(2, 1, rows.length, CRM_HEADERS['Image Health'].length).setValues(rows);
    }
    return json_({ ok: true, accepted: true, runId: runId, imageChecks: checks.length });
  } finally {
    lock.releaseLock();
  }
}

function openCRM_() {
  const id = PropertiesService.getScriptProperties().getProperty('CRM_SHEET_ID');
  if (!id) throw new Error('CRM_SHEET_ID is not configured. Run createOrSetupCRM first.');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#0A0A14').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), headers.length).setWrap(true);
  return sheet;
}

function ensureDashboard_(ss) {
  let sheet = ss.getSheetByName('Dashboard');
  if (!sheet) sheet = ss.insertSheet('Dashboard', 0);
  sheet.clear();
  sheet.getRange('A1:H1').merge().setValue('LAVAALL CRM + Production Health').setBackground('#0A0A14').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange('A3:B3').setValues([['CRM Metric','Value']]).setBackground('#F4F9FF').setFontWeight('bold');
  sheet.getRange('A4:B9').setValues([
    ['Total Leads','=COUNTA(Leads!A2:A)'],
    ['New Leads','=COUNTIF(Leads!D2:D,"New")'],
    ['Qualified','=COUNTIF(Leads!D2:D,"Qualified")'],
    ['Won','=COUNTIF(Leads!D2:D,"Won")'],
    ['Verified-product Requests','=COUNTIF(Leads!C2:C,"verified-product")'],
    ['Sourcing Requests','=COUNTIF(Leads!C2:C,"sourcing")']
  ]);
  sheet.getRange('D3:E3').setValues([['Production Metric','Value']]).setBackground('#F4F9FF').setFontWeight('bold');
  sheet.getRange('D4:E8').setValues([
    ['Verified Products','=COUNTIF(Products!G2:G,"verified")'],
    ['Tracked Product Images','=COUNTA(Products!H2:H)'],
    ['Latest QA Result','=IFERROR(LOOKUP(2,1/(\'QA Runs\'!A2:A<>""),\'QA Runs\'!E2:E),"No run")'],
    ['Latest Broken Images','=IFERROR(LOOKUP(2,1/(\'QA Runs\'!A2:A<>""),\'QA Runs\'!K2:K),0)'],
    ['Latest Network Failures','=IFERROR(LOOKUP(2,1/(\'QA Runs\'!A2:A<>""),\'QA Runs\'!P2:P),0)']
  ]);
  sheet.getRange('A11:H11').merge().setValue('Verified exact quotes may show the exact product image. Sourcing-only leads intentionally do not receive an exact product image unless a verified product mapping exists.').setBackground('#FFE03D').setFontWeight('bold').setWrap(true);
  sheet.autoResizeColumns(1, 8);
}

function ensureValidations_(ss) {
  const leads = ss.getSheetByName('Leads');
  leads.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(REQUEST_TYPES, true).setAllowInvalid(false).build());
  leads.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, true).setAllowInvalid(false).build());
}

function lookupProductImage_(ss, sourceProductId) {
  const sheet = ss.getSheetByName('Products');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const finder = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(sourceProductId).matchEntireCell(true).findNext();
  if (!finder) return '';
  return safe_(sheet.getRange(finder.getRow(), 8).getDisplayValue(), 600);
}

function findExact_(sheet, column, value) {
  if (sheet.getLastRow() < 2) return null;
  return sheet.getRange(2, column, sheet.getLastRow() - 1, 1).createTextFinder(value).matchEntireCell(true).findNext();
}

function safe_(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/[<>`]/g, '').slice(0, max || 500);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
