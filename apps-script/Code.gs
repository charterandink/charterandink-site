/**
 * Charter & Ink: website signups and commission requests -> this Google Sheet.
 * Sends one digest email a day when something new came in. Nothing new, no email.
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

// ---------- one-time setup ----------
function setup() {
  Object.values(TABS).forEach(sheet);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendDigest')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDigest').timeBased().everyDays(1).atHour(DIGEST_HOUR).create();
  Logger.log('Tabs ready, daily digest scheduled around %s:00.', DIGEST_HOUR);
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
