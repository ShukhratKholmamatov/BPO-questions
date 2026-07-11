/**
 * BPO-Logistics Survey — Google Sheets collector + live Dashboard
 * ---------------------------------------------------------------
 * • doPost  — appends ONE ROW per submission to the "Responses" tab
 *             (columns are created automatically; different roles fit one sheet).
 * • Dashboard — a "Dashboard" tab is rebuilt after every submission with:
 *             totals, responses by role, incident types, reported loss,
 *             improper-pressure indicator, support for regulation, and more.
 *
 * All data stays inside YOUR Google account — no third party.
 *
 * SETUP — see google-sheets/SETUP.md.
 *   1. Create a Google Sheet (sheets.new).
 *   2. Extensions → Apps Script → paste ALL of this file → Save.
 *   3. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone →
 *      Deploy → authorize → copy the /exec URL into index.html CONFIG.
 *
 * IMPORTANT — after editing this file you must RE-PUBLISH:
 *   Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy.
 *   (The /exec URL stays the same.)
 *
 * To build the dashboard from existing rows right now, open this editor,
 * pick "refreshDashboard" in the function dropdown, and click Run once.
 * You can also use the sheet menu: "BPO Survey → Refresh dashboard".
 */

var SHEET_NAME = 'Responses';
var DASH_NAME  = 'Dashboard';

/* ============================ WEB APP ============================ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);

    var row = {
      received_at:  new Date(),
      responseId:   data.responseId || '',
      submitted_at: data.submittedAtISO || '',
      language:     data.language || '',
      role:         data.role || ''
    };
    flatten(data.answers || {}, '', row);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    var lastCol = sheet.getLastColumn();
    var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

    var changed = false;
    Object.keys(row).forEach(function (k) {
      if (headers.indexOf(k) === -1) { headers.push(k); changed = true; }
    });
    if (changed || sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }

    var out = headers.map(function (h) { return row.hasOwnProperty(h) ? row[h] : ''; });
    sheet.appendRow(out);

    try { refreshDashboard(); } catch (dErr) { /* never let dashboard block saving */ }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOut({ ok: true, message: 'BPO survey collector is live. Responses are accepted via POST.' });
}

/* ======================= SHEET MENU / TRIGGER ==================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BPO Survey')
    .addItem('Refresh dashboard', 'refreshDashboard')
    .addToUi();
}

/* ========================== DASHBOARD =========================== */

function refreshDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resp = ss.getSheetByName(SHEET_NAME);
  var dash = ss.getSheetByName(DASH_NAME) || ss.insertSheet(DASH_NAME);
  dash.clear();

  if (!resp || resp.getLastRow() < 2) {
    dash.getRange(1, 1).setValue('No responses yet.').setFontWeight('bold');
    return;
  }

  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var out = computeDashboardGrid(resp.getDataRange().getValues(), nowStr);

  dash.getRange(1, 1, out.grid.length, 3).setValues(out.grid);
  out.bold.forEach(function (i) { dash.getRange(i, 1, 1, 3).setFontWeight('bold'); });
  out.header.forEach(function (i) {
    dash.getRange(i, 1, 1, 3).setFontWeight('bold').setBackground('#eef2f7');
  });
  dash.getRange(1, 1, 1, 3).setFontSize(14).setFontWeight('bold');
  dash.setColumnWidth(1, 340);
  dash.setColumnWidth(2, 150);
  dash.setColumnWidth(3, 190);
  dash.setFrozenRows(1);
}

/**
 * PURE aggregation (no Spreadsheet APIs) so it can be unit-tested.
 * @param values 2D array: row 0 = headers, following rows = data.
 * @param nowStr string timestamp for the "last updated" line.
 * @return {grid:[[a,b,c]...], bold:[rowIdx...], header:[rowIdx...]}
 */
function computeDashboardGrid(values, nowStr) {
  var headers = values[0];
  var col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  function get(r, key) { return col.hasOwnProperty(key) ? r[col[key]] : ''; }

  var rows = values.slice(1).filter(function (r) {
    return get(r, 'responseId') !== '' || get(r, 'role') !== '';
  });
  var total = rows.length;

  var grid = [], bold = [], header = [];
  function T(t) { grid.push([t, '', '']); bold.push(grid.length); }
  function H(a, b, c) { grid.push([a, b || '', c || '']); header.push(grid.length); }
  function R(a, b, c) { grid.push([a, (b == null ? '' : b), (c == null ? '' : c)]); }
  function B() { grid.push(['', '', '']); }

  function pct(n) { return total ? Math.round(n / total * 100) + '%' : '0%'; }
  function money(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function tally(key) {
    var m = {};
    rows.forEach(function (r) { var v = get(r, key); if (v === '' || v == null) return; m[v] = (m[v] || 0) + 1; });
    return m;
  }
  function tallyMulti(key) {
    var m = {};
    rows.forEach(function (r) {
      var v = get(r, key); if (!v) return;
      String(v).split(';').forEach(function (x) { x = x.trim(); if (x) m[x] = (m[x] || 0) + 1; });
    });
    return m;
  }
  function sortDesc(m) {
    return Object.keys(m).map(function (k) { return [k, m[k]]; })
                 .sort(function (a, b) { return b[1] - a[1]; });
  }

  var ROLE = { dispatcher:'Dispatcher', teamlead:'Team lead / Ops manager', owner:'Owner / CEO / Founder',
    carrier:'Carrier / Truck owner (MC)', broker:'Freight broker', backoffice:'Back office (Safety/Billing)', other:'Other' };
  var ANY = { yes:'Yes', no:'No', unsure:'Not sure' };
  var INC = {
    'inc_counts.nonpay_broker':'Broker / client did not pay',
    'inc_counts.nonpay_carrier':'Carrier / employer did not pay',
    'inc_counts.double_brokered':'Victim of double brokering',
    'inc_counts.cargo_theft':'Cargo / load stolen',
    'inc_counts.load_missing':'Load disappeared / not delivered',
    'inc_counts.identity_stolen':'MC/DOT identity stolen or misused',
    'inc_counts.impersonated':'Company impersonated',
    'inc_counts.bec':'Email hacked / BEC',
    'inc_counts.loadboard_hacked':'Load-board account hacked',
    'inc_counts.fake_broker':'Fake broker / shipper',
    'inc_counts.fake_carrier':'Fake carrier took the load',
    'inc_counts.fuel_advance':'Fuel-advance scam',
    'inc_counts.fake_docs':'Fake / forged documents',
    'inc_counts.claim_dispute':'Damage / shortage claim dispute',
    'inc_counts.platform_block':'Platform account blocked',
    'inc_counts.geo_block':'Blocked (Uzbekistan/CIS location or IP)',
    'inc_counts.deepfake':'Deepfake / voice impersonation',
    'inc_counts.law_contact':'Law-enforcement contact',
    'inc_counts.other':'Other incident'
  };
  var LOSS = { '0':{l:'No loss',m:0}, 'lt1k':{l:'Under $1k',m:500}, '1_10k':{l:'$1k–$10k',m:5500},
    '10_50k':{l:'$10k–$50k',m:30000}, '50_250k':{l:'$50k–$250k',m:150000},
    '250k_1m':{l:'$250k–$1M',m:625000}, '1mp':{l:'Over $1M',m:1500000}, 'na':{l:'Prefer not to say',m:null} };
  var LOSS_ORDER = ['0','lt1k','1_10k','10_50k','50_250k','250k_1m','1mp','na'];
  var SUPPORT = { strong_support:'Strongly support', support:'Support', neutral:'Neutral', oppose:'Oppose', strong_oppose:'Strongly oppose' };
  var SUPPORT_ORDER = ['strong_support','support','neutral','oppose','strong_oppose'];
  var REG = { licensing:'Licensing / registration', training:'Training & certification', code:'Code of conduct',
    dispute:'Dispute mechanism', blacklist:'Blacklist of fraudsters', gov_coop:'Gov cooperation (FMCSA/FCC)',
    standards:'Insurance / contract standards', kyc:'KYC of foreign clients', cyber:'Cyber-security standards',
    tax:'Clear tax rules', against:'Against regulation' };
  var LANG = { en:'English', ru:'Russian', uz:'Uzbek' };

  /* ---- header ---- */
  T('BPO-Logistics Survey — Dashboard');
  R('Last updated', nowStr);
  R('Total responses', total);
  B();

  /* ---- responses by role ---- */
  T('Responses by role');
  H('Role', 'Count', '% of total');
  var roleT = tally('role');
  sortDesc(roleT).forEach(function (kv) { R(ROLE[kv[0]] || kv[0], kv[1], pct(kv[1])); });
  B();

  /* ---- faced an incident ---- */
  T('Faced fraud / theft / non-payment in last 12 months?');
  H('Answer', 'Count', '% of total');
  var anyT = tally('inc_any');
  ['yes','no','unsure'].forEach(function (k) { if (anyT[k]) R(ANY[k], anyT[k], pct(anyT[k])); });
  B();

  /* ---- incident types ---- */
  T('Incident types (last 12 months)');
  H('Incident', 'Times reported', 'Companies affected');
  var incKeys = headers.filter(function (h) { return h.indexOf('inc_counts.') === 0; });
  var incStats = incKeys.map(function (key) {
    var sum = 0, affected = 0;
    rows.forEach(function (r) {
      var n = Number(get(r, key)) || 0;
      if (n > 0) { sum += n; affected++; }
    });
    return { key: key, sum: sum, affected: affected };
  }).filter(function (s) { return s.sum > 0; })
    .sort(function (a, b) { return b.sum - a.sum; });
  if (incStats.length === 0) R('No incidents reported yet', '', '');
  else incStats.forEach(function (s) { R(INC[s.key] || s.key, s.sum, s.affected); });
  B();

  /* ---- reported loss ---- */
  T('Reported financial loss');
  H('Band', 'Count', '');
  var lossT = tally('inc_loss'), estTotal = 0;
  LOSS_ORDER.forEach(function (k) { if (lossT[k]) R(LOSS[k].l, lossT[k], ''); });
  rows.forEach(function (r) {
    var v = get(r, 'inc_loss'); var band = LOSS[v];
    if (band && band.m != null) estTotal += band.m * (1); // one respondent = one band midpoint
  });
  R('Estimated total (band midpoints, excl. “prefer not to say”)', money(estTotal), '');
  B();

  /* ---- improper pressure (indirect integrity signal) ---- */
  T('Reported improper pressure (mkt_asked)');
  var answeredAsked = 0, pressured = 0;
  rows.forEach(function (r) {
    var v = get(r, 'mkt_asked'); if (!v) return;
    answeredAsked++;
    var items = String(v).split(';').map(function (x) { return x.trim(); }).filter(Boolean);
    var real = items.filter(function (x) { return x !== 'none' && x !== 'na'; });
    if (real.length) pressured++;
  });
  H('Indicator', 'Value', '');
  R('Answered this question', answeredAsked, '');
  R('Reported being asked / pressured', pressured,
    answeredAsked ? Math.round(pressured / answeredAsked * 100) + '% of answered' : '');
  var askedItems = tallyMulti('mkt_asked');
  sortDesc(askedItems).forEach(function (kv) {
    if (kv[0] === 'none' || kv[0] === 'na') return;
    R('  • ' + kv[0], kv[1], '');
  });
  B();

  /* ---- support for regulation ---- */
  T('Support for regulation of the sector');
  H('Position', 'Count', '% of total');
  var supT = tally('reg_support');
  SUPPORT_ORDER.forEach(function (k) { if (supT[k]) R(SUPPORT[k], supT[k], pct(supT[k])); });
  B();

  /* ---- most-wanted regulation elements ---- */
  T('Most-wanted regulation elements');
  H('Element', 'Count', '');
  var regT = tallyMulti('reg_elements');
  sortDesc(regT).forEach(function (kv) { R(REG[kv[0]] || kv[0], kv[1], ''); });
  B();

  /* ---- language ---- */
  T('Response language');
  H('Language', 'Count', '');
  var langT = tally('language');
  sortDesc(langT).forEach(function (kv) { R(LANG[kv[0]] || kv[0], kv[1], ''); });

  return { grid: grid, bold: bold, header: header };
}

/* ============================ HELPERS =========================== */

function flatten(obj, prefix, out) {
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    var key = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) out[key] = v.join('; ');
    else if (v !== null && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
