// Sends a row to the Charter & Ink Google Sheet through its Apps Script web app.
// Env: SHEETS_WEBHOOK_URL (the /exec URL of the deployed script) and SHEETS_SECRET (Secret,
// must match SECRET in the script). Without them it does nothing; KV still keeps a copy.

export async function toSheet(env, kind, data) {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_SECRET) return;
  try {
    const res = await fetch(env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.SHEETS_SECRET, kind, data }),
      redirect: "follow",
    });
    const text = await res.text();
    if (!res.ok || !text.includes('"ok":true')) console.error("Sheet webhook", res.status, text.slice(0, 300));
  } catch (e) {
    console.error("Sheet webhook failed", e);
  }
}
