// GET /api/commissions?key=ADMIN_KEY  -> all commission requests as a CSV, newest first.

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key");
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return new Response("Not found", { status: 404 });

  const cols = ["received", "name", "email", "type", "budget", "needBy", "idea", "refs"];
  const rows = [];
  let cursor;
  do {
    const page = await env.SUBSCRIBERS.list({ prefix: "commission:", cursor });
    for (const k of page.keys) rows.push(JSON.parse((await env.SUBSCRIBERS.get(k.name)) || "{}"));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  rows.sort((a, b) => String(b.received).localeCompare(String(a.received)));

  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="charterandink-commissions.csv"',
    },
  });
}
