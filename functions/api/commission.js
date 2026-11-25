// POST /api/commission  -> saves a commission request in the SUBSCRIBERS KV namespace
// under the key "commission:<timestamp>:<random>". Download them at /api/commissions?key=ADMIN_KEY.

import { toSheet } from "../_lib/sheets.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES = ["Custom chonk", "Custom set", "Gift", "Not sure yet"];
const BUDGETS = ["$100 to $150", "$150 to $300", "$300+", "Not sure"];
const clip = (v, n) => String(v || "").trim().slice(0, n);

export async function onRequestPost({ request, env, waitUntil }) {
  let form;
  try { form = await request.formData(); } catch { return fail("Bad request.", 400); }
  if (clip(form.get("company"), 200)) return Response.json({ ok: true }); // bot trap

  const r = {
    name: clip(form.get("name"), 120),
    email: clip(form.get("email"), 254).toLowerCase(),
    type: clip(form.get("type"), 40),
    idea: clip(form.get("idea"), 4000),
    budget: clip(form.get("budget"), 40),
    needBy: clip(form.get("needBy"), 40),
    refs: clip(form.get("refs"), 500),
    received: new Date().toISOString(),
  };
  if (!r.name) return fail("Please add your name.", 400);
  if (!EMAIL_RE.test(r.email)) return fail("That email doesn't look right.", 400);
  if (r.idea.length < 10) return fail("Tell us a little more about your idea.", 400);
  if (r.type && !TYPES.includes(r.type)) r.type = "Not sure yet";
  if (r.budget && !BUDGETS.includes(r.budget)) r.budget = "Not sure";

  const key = `commission:${r.received}:${crypto.randomUUID().slice(0, 8)}`;
  await env.SUBSCRIBERS.put(key, JSON.stringify(r));
  waitUntil(toSheet(env, "commission", r));
  return Response.json({ ok: true });
}

const fail = (error, status) => Response.json({ ok: false, error }, { status });
