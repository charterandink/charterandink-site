// Email signup. Stores each address in the SUBSCRIBERS KV namespace.
// POST /api/subscribe   (form fields: email, source, company = honeypot)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");
  const reply = (ok, error, status = 200) =>
    wantsJson
      ? Response.json(ok ? { ok: true } : { ok: false, error }, { status })
      : Response.redirect(new URL(ok ? "/?subscribed=1#list" : "/#list", request.url), 303);

  let form;
  try { form = await request.formData(); } catch { return reply(false, "Bad request.", 400); }

  // Bots fill the hidden field. Pretend it worked.
  if ((form.get("company") || "").trim()) return reply(true);

  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(false, "That email doesn't look right.", 400);

  const source = String(form.get("source") || "site").slice(0, 40);
  const existing = await env.SUBSCRIBERS.get(email);
  if (!existing) {
    await env.SUBSCRIBERS.put(email, JSON.stringify({ source, joined: new Date().toISOString() }));
  }
  return reply(true);
}
