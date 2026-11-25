/**
 * Charter & Ink: website signups and commission requests -> this Google Sheet.
 * Sends one digest email a day when something new came in. Nothing new, no email.
 * Every Monday it also emails a visitor report from Cloudflare Web Analytics (see weeklyReport).
 *
 * Setup (once):
 *  1. Paste this into Extensions > Apps Script of the sheet. Change SECRET below.
 *  2. Run setup() once and approve the permissions. It makes the tabs and the daily trigger.
 *  3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *     Copy the Web app URL (ends in /exec).
 *  4. In Cloudflare Pages settings add SHEETS_WEBHOOK_URL (that URL) and
 *     SHEETS_SECRET (Secret, same value as SECRET below), then retry the deployment.
 */

const SECRET = 'CHANGE-ME-to-a-long-random-password';
const DIGEST_TO = 'mike@charterandink.com';
const DIGEST_HOUR = 7; // 7am, the sheet's time zone

const TABS = {
  signup: {
    name: 'Subscribers',
    headers: ['Joined', 'Email', 'Source', 'Notified'],
    row: d => [new Date(), d.email, d.source || ''],
  },
  commission: {
    name: 'Commissions',
    headers: ['Received', 'Name', 'Email', 'Type', 'Budget', 'Need by', 'Idea', 'References', 'Status', 'Notified'],
    row: d => [new Date(), d.name, d.email, d.type, d.budget, d.needBy, d.idea, d.refs, 'New'],
  },
};

// ---------- receives rows from the website ----------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'forbidden' });
    const tab = TABS[body.kind];
    if (!tab) return json({ ok: false, error: 'unknown kind' });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sh = sheet(tab);
      if (body.kind === 'signup' && emailExists(sh, body.data.email)) return json({ ok: true, duplicate: true });
      const row = tab.row(body.data || {}).map(safe);
      while (row.length < tab.headers.length) row.push('');
      sh.appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, service: 'Charter & Ink sheet webhook' });
}

// ---------- daily digest ----------
function sendDigest() {
  const parts = [];
  const stamp = new Date();

  const subs = pending(TABS.signup);
  if (subs.rows.length) {
    parts.push(`NEW SUBSCRIBERS (${subs.rows.length})`);
    subs.rows.forEach(r => parts.push(`  ${r[1]}   from ${label(r[2])}`));
    parts.push(`  Total on the list: ${subs.total}`);
    parts.push('');
  }

  const coms = pending(TABS.commission);
  if (coms.rows.length) {
    parts.push(`NEW COMMISSION REQUESTS (${coms.rows.length})`);
    coms.rows.forEach(r => {
      parts.push('');
      parts.push(`  ${r[1]} <${r[2]}>`);
      parts.push(`  ${r[3] || 'Not sure yet'} · Budget: ${r[4] || 'Not sure'} · Need by: ${r[5] || 'no date'}`);
      parts.push(`  "${r[6]}"`);
      if (r[7]) parts.push(`  References: ${r[7]}`);
    });
    parts.push('');
  }

  if (!parts.length) return; // nothing new today

  const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const subject = [
    subs.rows.length ? `${subs.rows.length} new subscriber${subs.rows.length > 1 ? 's' : ''}` : '',
    coms.rows.length ? `${coms.rows.length} commission request${coms.rows.length > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');
  MailApp.sendEmail(DIGEST_TO, `Charter & Ink daily: ${subject}`, parts.join('\n') + `\nOpen the sheet: ${url}\n`);

  subs.mark(stamp);
  coms.mark(stamp);
}

// ---------- weekly visitor report (Cloudflare Web Analytics) ----------
// Needs three Script Properties (Project Settings > Script Properties):
//   CF_API_TOKEN  a Cloudflare API token with "Account Analytics: Read"
//   CF_ACCOUNT_ID your Cloudflare account ID
//   CF_SITE_TAG   the Web Analytics site tag for charterandink.com
function weeklyReport() {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('CF_API_TOKEN'), account = p.getProperty('CF_ACCOUNT_ID'), site = p.getProperty('CF_SITE_TAG');
  if (!token || !account || !site) throw new Error('Add CF_API_TOKEN, CF_ACCOUNT_ID and CF_SITE_TAG in Script Properties.');

  const day = 864e5, now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight today
  const start = new Date(end - 7 * day), prevStart = new Date(end - 14 * day);
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const fmt = d => Utilities.formatDate(d, tz, 'MMM d');

  const thisWeek = cfTotals(token, account, site, start, end);
  const lastWeek = cfTotals(token, account, site, prevStart, start);
  const top = dim => cfTop(token, account, site, start, end, dim);

  const change = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}% vs. week before` : 'first week of data');
  const list = (rows, blank) => rows.length
    ? rows.map(r => `  ${String(r.count).padStart(5)}  ${r.name || blank}`).join('\n')
    : '  (none yet)';

  const newSubs = countSince(TABS.signup, start, end), newComs = countSince(TABS.commission, start, end);

  const body = [
    `charterandink.com, ${fmt(start)} to ${fmt(new Date(end - day))}`,
    '',
    `Visits:      ${thisWeek.visits}   (${change(thisWeek.visits, lastWeek.visits)})`,
    `Page views:  ${thisWeek.views}   (${change(thisWeek.views, lastWeek.views)})`,
    `New signups: ${newSubs}`,
    `Commission requests: ${newComs}`,
    '',
    'TOP PAGES', list(top('requestPath'), '/'),
    '',
    'WHERE VISITORS CAME FROM', list(top('refererHost'), 'Direct or typed in'),
    '',
    'COUNTRIES', list(top('countryName'), 'Unknown'),
    '',
    'DEVICES', list(top('deviceType'), 'Unknown'),
    '',
    'Full dashboard: https://dash.cloudflare.com (Analytics & Logs > Web Analytics)',
  ].join('\n');

  MailApp.sendEmail(DIGEST_TO, `Charter & Ink weekly: ${thisWeek.visits} visits`, body);
}

function cfQuery(token, query, variables) {
  const res = UrlFetchApp.fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query, variables }),
  });
  const j = JSON.parse(res.getContentText());
  if (j.errors && j.errors.length) throw new Error('Cloudflare: ' + j.errors.map(e => e.message).join('; '));
  return j.data.viewer.accounts[0].rumPageloadEventsAdaptiveGroups;
}

function cfTotals(token, account, site, from, to) {
  const q = `query($a:String!,$s:String!,$f:Time!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
    rumPageloadEventsAdaptiveGroups(limit:1,filter:{siteTag:$s,datetime_geq:$f,datetime_lt:$t}){count sum{visits}}}}}`;
  const v = { a: account, s: site, f: from.toISOString(), t: to.toISOString() };
  let g;
  try { g = (cfQuery(token, q, v) || [])[0]; }
  catch (e) { // if this account's dataset has no visits field, fall back to page views only
    g = (cfQuery(token, q.replace(' sum{visits}', ''), v) || [])[0];
  }
  return { views: g ? g.count : 0, visits: g && g.sum ? g.sum.visits : (g ? g.count : 0) };
}

function cfTop(token, account, site, from, to, dim) {
  const q = `query($a:String!,$s:String!,$f:Time!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
    rumPageloadEventsAdaptiveGroups(limit:8,orderBy:[count_DESC],filter:{siteTag:$s,datetime_geq:$f,datetime_lt:$t}){count dimensions{${dim}}}}}}`;
  const v = { a: account, s: site, f: from.toISOString(), t: to.toISOString() };
  return (cfQuery(token, q, v) || []).map(g => ({ count: g.count, name: g.dimensions[dim] }));
}

function countSince(tab, from, to) {
  const sh = sheet(tab), last = sh.getLastRow();
  if (last < 2) return 0;
  return sh.getRange(2, 1, last - 1, 1).getValues().filter(r => r[0] instanceof Date && r[0] >= from && r[0] < to).length;
}

// ---------- one-time setup ----------
function setup() {
  Object.values(TABS).forEach(sheet);
  ScriptApp.getProjectTriggers()
    .filter(t => ['sendDigest', 'weeklyReport'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDigest').timeBased().everyDays(1).atHour(DIGEST_HOUR).create();
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(DIGEST_HOUR).create();
  Logger.log('Tabs ready. Daily digest and Monday visitor report scheduled around %s:00.', DIGEST_HOUR);
}

// ---------- helpers ----------
function sheet(tab) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(tab.name);
  if (!sh) {
    sh = ss.insertSheet(tab.name);
    sh.appendRow(tab.headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, tab.headers.length).setFontWeight('bold');
  }
  return sh;
}

function pending(tab) {
  const sh = sheet(tab);
  const last = sh.getLastRow();
  const notifiedCol = tab.headers.indexOf('Notified') + 1;
  if (last < 2) return { rows: [], total: 0, mark: () => {} };
  const values = sh.getRange(2, 1, last - 1, tab.headers.length).getValues();
  const idx = [];
  values.forEach((r, i) => { if (r[0] && !r[notifiedCol - 1]) idx.push(i); });
  return {
    rows: idx.map(i => values[i]),
    total: values.filter(r => r[0]).length,
    mark: stamp => idx.forEach(i => sh.getRange(i + 2, notifiedCol).setValue(stamp)),
  };
}

function emailExists(sh, email) {
  const last = sh.getLastRow();
  if (last < 2 || !email) return false;
  const want = String(email).toLowerCase();
  return sh.getRange(2, 2, last - 1, 1).getValues().some(r => String(r[0]).toLowerCase() === want);
}

// Stops a value like "=HYPERLINK(...)" from running as a formula in the sheet.
function safe(v) {
  if (v instanceof Date) return v;
  const s = String(v == null ? '' : v).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function label(src) {
  return { signature: 'Signature Sets teaser', con: 'a con QR code', home: 'home page' }[src] || src || 'the website';
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
