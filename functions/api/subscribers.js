// Download the email list as a CSV.
// GET /api/subscribers?key=YOUR_ADMIN_KEY
// ADMIN_KEY is a secret you set in Cloudflare Pages settings.

export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key");
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return new Response("Not found", { status: 404 });

  const rows = [["email", "source", "joined"]];
  let cursor;
  do {
    const page = await env.SUBSCRIBERS.list({ cursor });
    for (const k of page.keys) {
      const v = JSON.parse((await env.SUBSCRIBERS.get(k.name)) || "{}");
      rows.push([k.name, v.source || "", v.joined || ""]);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="charterandink-subscribers.csv"`,
    },
  });
}
