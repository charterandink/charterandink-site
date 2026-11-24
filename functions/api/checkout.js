// POST /api/checkout  body: { items: [{ id: variationId, qty }] }
// Checks prices and stock against Square (never trusts the browser),
// then creates a Square-hosted checkout and returns its URL.
import { sq, loadCatalog, SHIPPING } from "../_lib/square.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return fail("Bad request.", 400); }
  const wanted = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!wanted.length) return fail("Your cart is empty.", 400);

  let products;
  try { products = await loadCatalog(env); }
  catch (e) { console.error(e); return fail("Checkout is having trouble. Try again in a minute.", 502); }

  const byVar = new Map();
  for (const p of products) for (const v of p.variations) byVar.set(v.id, { p, v });

  const lineItems = [], problems = [];
  let subtotal = 0;
  for (const w of wanted) {
    const found = byVar.get(String(w.id));
    const qty = Math.max(1, Math.min(99, parseInt(w.qty, 10) || 1));
    if (!found) { problems.push("An item in your cart is no longer available."); continue; }
    const { p, v } = found;
    if (v.stock !== null && v.stock < qty) {
      problems.push(v.stock === 0 ? `${p.name} just sold out.` : `Only ${v.stock} left of ${p.name}.`);
      continue;
    }
    subtotal += v.price * qty;
    lineItems.push({ catalog_object_id: v.id, quantity: String(qty) });
  }
  if (problems.length) return fail(problems.join(" "), 409);

  const origin = new URL(request.url).origin;
  const shipCents = subtotal >= SHIPPING.freeOverCents ? 0 : SHIPPING.flatCents;
  const checkout_options = {
    ask_for_shipping_address: true,
    redirect_url: `${origin}/thanks.html`,
    merchant_support_email: "mike@charterandink.com",
  };
  if (shipCents > 0) {
    checkout_options.shipping_fee = { name: "Shipping", charge: { amount: shipCents, currency: "USD" } };
  }

  try {
    const r = await sq(env, "/online-checkout/payment-links", {
      method: "POST",
      body: {
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: env.SQUARE_LOCATION_ID,
          source: { name: "charterandink.com" },
          line_items: lineItems,
          pricing_options: { auto_apply_taxes: true },
        },
        checkout_options,
      },
    });
    return Response.json({ url: r.payment_link.url });
  } catch (e) {
    console.error(e);
    return fail("Couldn't start checkout. Try again in a minute.", 502);
  }
}

const fail = (error, status) => Response.json({ error }, { status });
