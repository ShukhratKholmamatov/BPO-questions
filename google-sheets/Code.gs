/**
 * «Пульс рынка: BPO-логистика Узбекистан — США», волна 1
 * Google Sheets collector + live analytical Dashboard
 * ---------------------------------------------------------------
 * • doPost      — appends ONE ROW per submission to "Responses"
 *                 (columns auto-created; every role fits one sheet).
 * • Contacts    — interview volunteers post a separate {type:"contact"} record.
 *                 It carries NO responseId, so it lands in its own "Contacts"
 *                 tab and can never be joined back to a set of answers.
 * • Dashboard   — rebuilt after every submission, following the analysis
 *                 matrix of the specification (§5): profile, fraud exposure,
 *                 legislation awareness, cyber maturity, diversification
 *                 funnel, US-market trust barometer, forecast barometer.
 *
 * SETUP: Extensions → Apps Script → paste ALL of this → Save.
 *        Deploy → Manage deployments → ✏️ → Version: NEW VERSION → Deploy.
 *        (Use "New version" on the EXISTING deployment — not "New deployment",
 *         which would create a different /exec URL.)
 *
 * Build the dashboard from existing rows: select `refreshDashboard` in the
 * function dropdown → Run. Or use the sheet menu «BPO Survey → Refresh dashboard».
 */

var SHEET_NAME = 'Responses';
var DASH_NAME  = 'Dashboard';
var CONTACT_NAME = 'Contacts';

/* ============================ WEB APP ============================ */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);

    /* Interview volunteers land in their OWN tab, with no responseId, so they can
       never be joined back to a set of answers. The main base stays anonymous. */
    if (data.type === 'contact') {
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var cs = ss2.getSheetByName(CONTACT_NAME);
      if (!cs) {
        cs = ss2.insertSheet(CONTACT_NAME);
        cs.getRange(1, 1, 1, 4).setValues([['received_at', 'nick', 'contact', 'language']]);
        cs.setFrozenRows(1);
      }
      cs.appendRow([new Date(), data.nick || '', data.contact || '', data.language || '']);
      return jsonOut({ ok: true, kind: 'contact' });
    }

    var row = {
      received_at:  new Date(),
      responseId:   data.responseId || '',
      submitted_at: data.submittedAtISO || '',
      language:     data.language || '',
      consent:      data.consent || '',
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
    sheet.appendRow(headers.map(function (h) {
      return row.hasOwnProperty(h) ? row[h] : '';
    }));

    try { refreshDashboard(); } catch (dErr) { /* never block saving */ }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOut({ ok: true, message: 'BPO Pulse survey collector is live. POST responses here.' });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BPO Survey')
    .addItem('Refresh dashboard', 'refreshDashboard').addToUi();
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
  var cSheet = ss.getSheetByName(CONTACT_NAME);
  var contacts = cSheet ? Math.max(0, cSheet.getLastRow() - 1) : 0;   // minus header
  var out = computeDashboardGrid(resp.getDataRange().getValues(), nowStr, contacts);

  dash.getRange(1, 1, out.grid.length, 3).setValues(out.grid);
  out.bold.forEach(function (i) { dash.getRange(i, 1, 1, 3).setFontWeight('bold'); });
  out.header.forEach(function (i) {
    dash.getRange(i, 1, 1, 3).setFontWeight('bold').setBackground('#eef2f7');
  });
  out.kpi.forEach(function (i) {
    dash.getRange(i, 1, 1, 3).setBackground('#e6f2f5').setFontWeight('bold');
  });
  dash.getRange(1, 1, 1, 3).setFontSize(14).setFontWeight('bold');
  dash.setColumnWidth(1, 400); dash.setColumnWidth(2, 130); dash.setColumnWidth(3, 220);
  dash.setFrozenRows(1);
}

/* ---- label dictionary: "QID" -> { value: readable } ---- */
var LABELS = {
  role: { dispatcher:'Dispatcher / BPO specialist', owner:'BPO manager / owner',
    driver:'CDL driver / owner-operator', carrier:'US carrier', broker:'Broker / 3PL',
    lawyer:'Lawyer / compliance', diaspora:'Diaspora / NGO / media', other:'Other' },
  P1:{ uz:'Uzbekistan', ca:'Other Central Asia', us:'USA (citizen/GC)', dual:'Dual', other:'Other', na:'No answer' },
  P2:{ uz:'Uzbekistan', us:'USA', mx:'Mexico', ca:'Canada', other:'Other country' },
  P3:{ lt1:'<1 year', '1_3':'1–3 years', '3_5':'3–5 years', '5_10':'5–10 years', '10p':'10+ years' },
  P4:{ resident:'IT Park resident company', employee:'Works at a resident', none:'Not connected', dk:'Hard to say' },
  F1:{ yes_loss:'Yes — suffered real damage', yes_prevented:'Yes — attempts, prevented',
    observed:'Observed at partners', no:'No' },
  F2:{ double_broker:'Double / triple brokering', nonpayment:'Non-payment for a completed trip',
    identity_theft:'Company identity theft (MC/DOT)', fictitious_pickup:'Fictitious pickup',
    theft_by_deception:'Theft-by-deception (rerouted)', bec:'BEC / phishing',
    loadboard_hack:'Load-board account hacked', fake_docs:'Forged BOL / POD / rate con',
    deepfake:'Voice spoofing / deepfake', other:'Other' },
  F3:{ none:'No damage (prevented)', lt10k:'Up to $10k', '10_50k':'$10–50k', '50_200k':'$50–200k',
    '200kp':'Over $200k', na:'Confidential' },
  F4:{ police:'Police / FBI (IC3)', fmcsa:'FMCSA (NCCDB)', platform:'Platform (DAT/Truckstop)',
    insurance:'Insurance', lawyers:'Lawyers', itpark:'IT Park / UZ state bodies', nowhere:'Turned NOWHERE' },
  F5:{ full:'Fully compensated', partial:'Partially compensated', ongoing:'Proceedings continue',
    nothing:'No result', na:'Did not apply / too early' },
  G2:{ crit_neg:'Critically negative', neg:'Rather negative', neutral:'Neutral',
    pos:'Rather positive (cleans market)', dk:'Hard to say' },
  G5:{ mou:'Intergovernmental MOU (FMCSA, platforms)', broker_help:'Help register as brokers (bond)',
    relocate:'Encourage offices in Mexico/Canada', registry:'National registry + certification',
    enforce:'Toughen liability inside the country', nothing:'Nothing — market self-regulates', other:'Other' },
  H1:{ '2fa':'2FA / MFA', fido2:'Hardware keys / passkeys (FIDO2)', sso:'SSO',
    edr:'Corporate devices with EDR', no_byod:'Personal devices banned',
    dmarc:'SPF / DKIM / DMARC', training:'Regular phishing training',
    none:'NONE of the above', dk:'Don’t know' },
  H2:{ always:'Always', sometimes:'Sometimes', no:'No', na:'Not involved in payments' },
  H3:{ successful:'Yes — successful for attackers', repelled:'Yes — repelled', no:'No', dk:'Don’t know' },
  I1:{ moved:'Already moved / opened office', preparing:'Actively preparing', discussing:'Discussing as idea',
    stay:'Staying in Uzbekistan', exit:'Would exit the US market', dk:'Don’t know' },
  I3:{ mou:'MOU with FMCSA + platforms', registry:'National registry', subsidy:'ISO/SOC2 subsidies',
    bond:'Broker registration + $75k bond help', legal:'Legal protection / insurance',
    tax:'IT Park tax benefits', nothing:'Nothing — depends on US law' },
  B5:{ bona_fide:'Bona fide agent (1 carrier)', multi_carrier:'One team → several carriers (BROKER RISK)',
    mixed:'Mixed contracts / verbal', verbal:'Mostly verbal (HIGH RISK)', dk:'Hard to say' },
  B7:{ preparing:'Already preparing to register', will_register:'Will register if required',
    relocate:'Move to Mexico / Canada', exit:'Wind down US market', dk:'Hard to say' },
  C3:{ domiciled:'Regular state CDL', non_domiciled:'Non-domiciled CDL', no_cdl:'No CDL', na:'No answer' },
  C3a:{ at_risk:'Licence AT RISK of non-renewal', will_switch:'Will switch visa/status',
    not_affected:'Not affected', never_heard:'First time hearing of the rule' },
  C4:{ fluent:'Fluent', confident:'Confident on work topics', basic:'Basic phrases only',
    none:'Practically does not speak' },
  C7:{ continue:'Continue in the industry (US)', change:'Change company / format',
    leave_industry:'Leave industry, stay in US', return_uz:'Return to Uzbekistan', dk:'Hard to say' },
  D3:{ uz:'Yes — from Uzbekistan', other:'Yes — other countries', multi:'Yes — several incl. Uzbekistan',
    no:'No — all inside the USA', stopped:'Used to, but stopped' },
  D6:{ none:'No losses', lt10k:'Up to $10k', '10_50k':'$10–50k', '50_200k':'$50–200k',
    '200kp':'Over $200k', na:'No answer' },
  D7:{ already:'Already work with them', yes:'Yes', yes_guarantees:'Yes, with guarantees',
    no:'No', dk:'Hard to say' },
  E4:{ improved:'Improved', same:'Unchanged', worse:'Worsened', much_worse:'Sharply worsened', dk:'Hard to say' },
  E5:{ state:'State + IT Park', companies:'Companies via association', embassy:'Embassy / diaspora',
    police:'Law enforcement of both countries', us_side:'US platforms / regulators', dk:'Hard to say' },
  J1:{ mou:'MOU with FMCSA + platforms', registry:'Registry of accredited BPO', subsidy:'ISO/SOC2 subsidies',
    legal_center:'Legal aid centre for US cases', bond:'Broker registration + $75k bond',
    hub:'Office programme in Mexico/Canada', training:'Training (English, compliance, anti-fraud)',
    blacklist:'Blacklist + hotline', cyber_ins:'Cyber-insurance', other:'Other' },
  J2:{ yes:'Yes', yes_cheap:'Yes, if free/cheap', no:'No', na:'Not applicable' },
  J3:{ growth:'Growth', stable:'Stable', halve:'Contraction by ~half',
    disappear:'Sector will disappear', dk:'Hard to say' },
  A7:{ company:'Yes — at the company', self:'Yes — self-taught', no:'No' },
  language:{ ru:'Russian', uz:'Uzbek', en:'English' },
  G1AW:{ detail:'Know in detail', general:'In general terms', first_time:'First time hearing' },
  B6:{ certified:'Already certified', in_progress:'Certification in progress',
    planned:'Planned within 12 months', no_plan:'Not planned', never_heard:'Never heard of the standards' },
  C1:{ company_driver:'Company driver', oo_authority:'Owner-operator (own authority)',
    lease_on:'Owner-operator (lease-on)', unemployed:'Currently out of work' },
  C2:{ citizen:'US citizen', green_card:'Green card', work_visa:'Work visa H-2A/H-2B/E-2',
    other_visa:'Other visa / in process', none:'NO valid status', na:'Prefer not to answer' },
  C6:{ always:'Always', sometimes:'Sometimes', no:'No', dk:'Don’t know' },
  D1:{ carrier:'Motor carrier', broker:'Broker', '3pl':'3PL / forwarder', both:'Carrier + brokerage' },
  D4:{ fraud:'Risk of fraud / data leaks', legal:'Legal uncertainty (SAFER Act)',
    quality:'Work quality & turnover', language:'Language barrier / accent',
    pressure:'Pressure from clients & insurers', timezone:'Time-zone difference',
    none:'No barriers — positive experience', na:'Does not use foreign services' },
  D5:{ safer:'FMCSA SAFER', highway:'Highway', rmis:'RMIS', carrier411:'Carrier411 / CarrierOK',
    callback:'Call-back to FMCSA-listed number', insurance:'Insurance cert checked with agent',
    domain:'Sender domain / DMARC check', none:'NO systematic check' },
  I2:{ cost:'Office cost', visa:'Visas & relocation', law:'Unfamiliar jurisdiction / taxes',
    lang:'Language barrier (ES/FR)', safety:'Security concerns (Mexico)',
    partners:'Hard to find local partners', law_change:'Risk the law changes again',
    none:'No barriers', dk:'Hard to say' },
  ID1:{ yes:'Yes, I know', vaguely:'Heard in general terms', no:'No' },
  ID2:{ acceptable:'Acceptable alternative to offshore', indifferent:'No difference — quality matters',
    better:'Better than offshore, worse than US', unacceptable:'Unacceptable — US staff only', dk:'Hard to say' },
  E2:{ nonpayment:'Non-payment to drivers/dispatchers', double_broker:'Double brokering & cargo theft',
    immigration:'Immigration status & CDL', language:'Language barrier',
    cyber:'Cyber-attacks & e-mail compromise', reputation:'Worsening reputation of Uzbek firms',
    internal:'Internal conflicts between compatriots', none:'No problems observed', other:'Other' },
  E3:{ '0':'None', '1_5':'1–5', '6_20':'6–20', '20p':'More than 20', no_count:'No records kept' },
  C5:{ uz_dispatcher:'Dispatcher in Uzbekistan', us_dispatcher:'Dispatcher in the USA',
    other_country:'Dispatcher elsewhere', self:'Finds loads himself', other:'Other' }
};
LABELS.G3 = LABELS.G2; // same 5-point impact scale
var G1_ROWS = { 'G1.cdl':'Non-domiciled CDL rule', 'G1.safer':'SAFER Transport Act',
  'G1.corca':'CORCA act', 'G1.motus':'Motus / Login.gov' };

/**
 * PURE aggregation (no Spreadsheet APIs) — unit-testable.
 */
function computeDashboardGrid(values, nowStr, contactCount) {
  var headers = values[0], col = {};
  headers.forEach(function (h, i) { col[h] = i; });
  function get(r, k) { return col.hasOwnProperty(k) ? r[col[k]] : ''; }

  var all = values.slice(1).filter(function (r) { return get(r, 'responseId') !== ''; });
  var rows = all.filter(function (r) { return get(r, 'consent') !== 'no'; }); // completed
  var declined = all.length - rows.length;
  var total = rows.length;

  var grid = [], bold = [], header = [], kpi = [];
  function T(t){ grid.push([t,'','']); bold.push(grid.length); }
  function H(a,b,c){ grid.push([a,b||'',c||'']); header.push(grid.length); }
  function R(a,b,c){ grid.push([a, b==null?'':b, c==null?'':c]); }
  function K(a,b,c){ grid.push([a, b==null?'':b, c==null?'':c]); kpi.push(grid.length); }
  function B(){ grid.push(['','','']); }

  function lbl(q,v){ return (LABELS[q] && LABELS[q][v]) || v; }
  function pctOf(n,d){ return d ? Math.round(n/d*100)+'%' : '—'; }
  function tally(k){ var m={}; rows.forEach(function(r){ var v=get(r,k);
    if(v===''||v==null) return; m[v]=(m[v]||0)+1; }); return m; }
  function tallyMulti(k){ var m={}; rows.forEach(function(r){ var v=get(r,k); if(!v) return;
    String(v).split(';').forEach(function(x){ x=x.trim(); if(x) m[x]=(m[x]||0)+1; }); }); return m; }
  function sortDesc(m){ return Object.keys(m).map(function(k){return [k,m[k]];})
    .sort(function(a,b){return b[1]-a[1];}); }
  function answered(k){ return rows.filter(function(r){ return get(r,k)!=='' && get(r,k)!=null; }).length; }
  function avg(k){ var s=0,n=0; rows.forEach(function(r){ var v=Number(get(r,k));
    if(v>0){ s+=v; n++; } }); return n ? (s/n).toFixed(2) : '—'; }
  function countIn(k, vals){ var n=0; rows.forEach(function(r){
    if(vals.indexOf(get(r,k))!==-1) n++; }); return n; }

  /* distribution block helper */
  function dist(title, key, order){
    T(title);
    H('Answer','Count','% of answered');
    var m = tally(key), a = answered(key);
    var keys = order ? order.filter(function(k){return m[k];}) :
      sortDesc(m).map(function(kv){return kv[0];});
    if(!keys.length) R('(no answers yet)','','');
    keys.forEach(function(k){ R(lbl(key,k), m[k], pctOf(m[k],a)); });
    B();
  }
  function distMulti(title, key, note){
    T(title);
    H('Option','Count','% of respondents who answered');
    var m = tallyMulti(key), a = answered(key);
    var s = sortDesc(m);
    if(!s.length) R('(no answers yet)','','');
    s.forEach(function(kv){ R(lbl(key,kv[0]), kv[1], pctOf(kv[1],a)); });
    if(note) R(note,'','');
    B();
  }

  /* ================= HEADER ================= */
  T('«Пульс рынка: BPO-логистика Узбекистан — США», волна 1 — Dashboard');
  R('Last updated', nowStr);
  R('Completed responses', total);
  R('Declined consent (S0 = No)', declined);
  B();

  /* ================= KEY INDICES (spec §5) ================= */
  T('KEY INDICES');
  H('Index','Value','Interpretation');

  // 1. Fraud exposure
  var f1a = answered('F1');
  var damaged = countIn('F1', ['yes_loss']);
  var anyFraud = countIn('F1', ['yes_loss','yes_prevented','observed']);
  K('Fraud exposure — suffered real damage (F1)', pctOf(damaged, f1a), damaged + ' of ' + f1a + ' respondents');
  K('Fraud exposure — encountered fraud in any form', pctOf(anyFraud, f1a), anyFraud + ' of ' + f1a);

  // 2. Cyber maturity index 0–10 = H1 measures (0–7) + H2 always (+2) + A7 trained (+1)
  var cyN = 0, cySum = 0;
  rows.forEach(function (r) {
    var h1 = get(r, 'H1');
    if (h1 === '' || h1 == null) return;
    var items = String(h1).split(';').map(function (x) { return x.trim(); })
      .filter(function (x) { return x && x !== 'none' && x !== 'dk'; });
    var score = items.length;                                   // 0–7
    if (get(r, 'H2') === 'always') score += 2;                  // +2
    var a7 = get(r, 'A7'); if (a7 === 'company' || a7 === 'self') score += 1; // +1
    cySum += Math.min(score, 10); cyN++;
  });
  K('Cyber-maturity index (0–10)', cyN ? (cySum / cyN).toFixed(2) : '—',
    cyN ? 'avg over ' + cyN + ' respondents (H1+H2+A7)' : '—');
  K('Self-assessed cyber protection (H4, 1–5)', avg('H4'), 'average');

  // 3. Diversification funnel — spec threshold: >25% moved/preparing → launch hub programme
  var i1a = answered('I1');
  var movingN = countIn('I1', ['moved','preparing']);
  var movingPct = i1a ? Math.round(movingN / i1a * 100) : 0;
  K('Diversification funnel — moved or preparing (I1)', movingPct + '%',
    i1a ? (movingPct > 25 ? '⚠ ABOVE 25% — spec threshold to launch the Mexico/Canada hub programme'
                          : 'below the 25% threshold') : '—');

  // 4. US-market trust barometer — D7 (already+yes+yes_guarantees) minus (no)
  var d7a = answered('D7');
  var trustPos = countIn('D7', ['already','yes','yes_guarantees']);
  var trustNeg = countIn('D7', ['no']);
  K('US-market trust barometer (D7)',
    d7a ? (Math.round(trustPos / d7a * 100) - Math.round(trustNeg / d7a * 100)) + ' pts' : '—',
    d7a ? 'positive ' + trustPos + ' − negative ' + trustNeg + ' (of ' + d7a + ')' : 'no US-market respondents yet');

  // 5. Forecast barometer — J3 net optimists
  var j3a = answered('J3');
  var opt = countIn('J3', ['growth']);
  var pes = countIn('J3', ['halve','disappear']);
  K('Forecast barometer 2027 (J3, net optimists)',
    j3a ? (Math.round(opt / j3a * 100) - Math.round(pes / j3a * 100)) + ' pts' : '—',
    j3a ? 'growth ' + opt + ' − contraction/disappear ' + pes : '—');

  // 6. Regulatory readiness: safe contract model (B5 bona_fide) among BPO owners
  var b5a = answered('B5');
  var safeModel = countIn('B5', ['bona_fide']);
  var riskModel = countIn('B5', ['multi_carrier','verbal']);
  K('Broker-classification risk (B5)', b5a ? pctOf(riskModel, b5a) : '—',
    b5a ? riskModel + ' of ' + b5a + ' owners use a risky model; safe (bona fide) = ' + safeModel : 'no BPO owners yet');

  // 7. Did not report fraud anywhere
  var f4a = answered('F4');
  var nowhere = 0;
  rows.forEach(function (r) {
    var v = get(r, 'F4'); if (!v) return;
    if (String(v).split(';').map(function (x) { return x.trim(); }).indexOf('nowhere') !== -1) nowhere++;
  });
  K('Victims who reported NOWHERE (F4)', f4a ? pctOf(nowhere, f4a) : '—',
    f4a ? nowhere + ' of ' + f4a + ' fraud-affected respondents' : '—');
  B();

  /* ================= PROFILE ================= */
  dist('Profile — role (P5)', 'role');
  dist('Profile — citizenship (P1)', 'P1');
  dist('Profile — physical location (P2)', 'P2');
  dist('Profile — experience (P3)', 'P3', ['lt1','1_3','3_5','5_10','10p']);
  dist('Profile — IT Park connection (P4)', 'P4');
  dist('Response language', 'language');

  /* ================= FRAUD ================= */
  dist('Fraud — exposure (F1)', 'F1', ['yes_loss','yes_prevented','observed','no']);
  distMulti('Fraud — schemes encountered (F2)', 'F2');
  dist('Fraud — financial damage (F3)', 'F3', ['none','lt10k','10_50k','50_200k','200kp','na']);
  distMulti('Fraud — where victims turned (F4)', 'F4');
  dist('Fraud — outcome of the most significant incident (F5)', 'F5',
    ['full','partial','ongoing','nothing','na']);

  /* ================= LEGISLATION ================= */
  T('Legislation — awareness (G1)');
  H('Norm', 'Know in detail', 'First time hearing');
  Object.keys(G1_ROWS).forEach(function (k) {
    var m = tally(k), a = answered(k);
    R(G1_ROWS[k],
      (m['detail'] || 0) + ' (' + pctOf(m['detail'] || 0, a) + ')',
      (m['first_time'] || 0) + ' (' + pctOf(m['first_time'] || 0, a) + ')');
  });
  B();
  dist('Legislation — impact of SAFER Act (G2)', 'G2',
    ['crit_neg','neg','neutral','pos','dk']);
  dist('Legislation — impact of non-domiciled CDL + ELP (G3)', 'G3',
    ['crit_neg','neg','neutral','pos','dk']);
  T('Legislation — attitude to tightening control (G4, 1–5)');
  H('Metric','Value','');
  R('Average score (1 = strongly against, 5 = fully support)', avg('G4'), '');
  B();
  dist('Legislation — what Uzbekistan should do first (G5)', 'G5');

  /* ================= CYBER ================= */
  distMulti('Cyber — measures actually in use (H1)', 'H1');
  dist('Cyber — call-back verification of payment details (H2)', 'H2',
    ['always','sometimes','no','na']);
  dist('Cyber — hacking attempts in last 12 months (H3)', 'H3',
    ['successful','repelled','no','dk']);
  dist('Anti-fraud / cyber training in last 12 months (A7)', 'A7', ['company','self','no']);

  /* ================= DIVERSIFICATION ================= */
  dist('Diversification — relocation funnel (I1)', 'I1',
    ['moved','preparing','discussing','stay','exit','dk']);
  distMulti('Diversification — barriers (I2)', 'I2');
  distMulti('Diversification — what would keep business in Uzbekistan (I3)', 'I3');
  dist('US market — awareness of Mexico/Canada carve-out (ID1)', 'ID1');
  dist('US market — acceptability of a Mexico/Canada team (ID2)', 'ID2');

  /* ================= BPO OWNERS ================= */
  dist('BPO owners — contract model (B5)', 'B5',
    ['bona_fide','multi_carrier','mixed','verbal','dk']);
  dist('BPO owners — reaction to mandatory broker registration (B7)', 'B7',
    ['preparing','will_register','relocate','exit','dk']);
  dist('BPO owners — ISO 27001 / SOC 2 status (B6)', 'B6');

  /* ================= DRIVERS ================= */
  dist('Drivers — licence type (C3)', 'C3', ['domiciled','non_domiciled','no_cdl','na']);
  dist('Drivers — non-domiciled CDL impact (C3a)', 'C3a',
    ['at_risk','will_switch','not_affected','never_heard']);
  dist('Drivers — English for DOT inspection (C4)', 'C4',
    ['fluent','confident','basic','none']);
  dist('Drivers — broker vetting before booking (C6)', 'C6');
  dist('Drivers — plans for next 12 months (C7)', 'C7',
    ['continue','change','leave_industry','return_uz','dk']);
  dist('Drivers — immigration status (C2)', 'C2');

  /* ================= US MARKET ================= */
  dist('US market — use of foreign back office (D3)', 'D3',
    ['uz','other','multi','no','stopped']);
  distMulti('US market — barriers to foreign dispatch (D4)', 'D4');
  distMulti('US market — counterparty vetting tools (D5)', 'D5');
  dist('US market — losses 2024–2026 (D6)', 'D6',
    ['none','lt10k','10_50k','50_200k','200kp','na']);
  dist('US market — readiness to work with a certified UZ registry (D7)', 'D7',
    ['already','yes','yes_guarantees','no','dk']);

  /* ================= EXPERTS ================= */
  distMulti('Experts — most frequent problems (E2)', 'E2');
  dist('Experts — fraud cases handled in 12 months (E3)', 'E3');
  dist('Experts — reputation dynamics over 2 years (E4)', 'E4',
    ['improved','same','worse','much_worse','dk']);
  dist('Experts — who should lead the solution (E5)', 'E5');

  /* ================= SUPPORT ================= */
  distMulti('Support measures needed first (J1)', 'J1');
  dist('Readiness to join an industry association (J2)', 'J2',
    ['yes','yes_cheap','no','na']);
  dist('Forecast for the sector by end of 2027 (J3)', 'J3',
    ['growth','stable','halve','disappear','dk']);

  /* ================= OPEN TEXT ================= */
  T('Open answers (K1) — moderate before analysis (remove names)');
  H('Response ID','Role','Text');
  var anyOpen = false;
  rows.forEach(function (r) {
    var txt = get(r, 'K1');
    if (txt && String(txt).trim()) {
      anyOpen = true;
      R(get(r, 'responseId'), lbl('role', get(r, 'role')), String(txt).slice(0, 500));
    }
  });
  if (!anyOpen) R('(no open answers yet)', '', '');
  B();
  T('Interview volunteers');
  H('Metric', 'Value', '');
  R('Said yes to an interview (K2)', countIn('K2', ['yes']), '');
  R('Contacts actually left', (contactCount == null ? 0 : contactCount),
    'stored in the "' + CONTACT_NAME + '" tab, unlinked to any answers');

  return { grid: grid, bold: bold, header: header, kpi: kpi };
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
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
