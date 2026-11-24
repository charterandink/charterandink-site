// Shared Square API helper.
// Env (set in Cloudflare Pages > Settings > Variables and Secrets):
//   SQUARE_ENV           "sandbox" or "production"
//   SQUARE_ACCESS_TOKEN  secret, from developer.squareup.com
//   SQUARE_LOCATION_ID   the location orders and stock belong to
//   SQUARE_VERSION       optional, API version date

export const SHIPPING = { flatCents: 700, freeOverCents: 7500 };

export function squareBase(env) {
  return env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com/v2"
    : "https://connect.squareupsandbox.com/v2";
}

export async function sq(env, path, { method = "GET", body } = {}) {
  if (!env.SQUARE_ACCESS_TOKEN) throw new Error("SQUARE_ACCESS_TOKEN is not set");
  const res = await fetch(squareBase(env) + path, {
    method,
    headers: {
      "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": env.SQUARE_VERSION || "2024-10-17",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.errors || []).map(e => e.detail || e.code).join("; ") || res.statusText;
    throw new Error(`Square ${res.status}: ${msg}`);
  }
  return data;
}

// Pull the whole sellable catalog plus stock, flattened for the storefront.
export async function loadCatalog(env) {
  const items = [], related = new Map();
  let cursor;
  do {
    const page = await sq(env, "/catalog/search", {
      method: "POST",
      body: { object_types: ["ITEM"], include_related_objects: true, cursor, limit: 100 },
    });
    items.push(...(page.objects || []));
    for (const o of page.related_objects || []) related.set(o.id, o);
    cursor = page.cursor;
  } while (cursor);

  const variationIds = [];
  for (const it of items) for (const v of it.item_data?.variations || []) variationIds.push(v.id);

  // Stock counts, in chunks.
  const stock = new Map();
  for (let i = 0; i < variationIds.length; i += 500) {
    let c;
    do {
      const r = await sq(env, "/inventory/counts/batch-retrieve", {
        method: "POST",
        body: {
          catalog_object_ids: variationIds.slice(i, i + 500),
          location_ids: [env.SQUARE_LOCATION_ID],
          states: ["IN_STOCK"],
          cursor: c,
        },
      });
      for (const cnt of r.counts || []) stock.set(cnt.catalog_object_id, Math.floor(Number(cnt.quantity) || 0));
      c = r.cursor;
    } while (c);
  }

  const products = [];
  for (const it of items) {
    const d = it.item_data || {};
    if (it.is_deleted || d.is_archived) continue;
    if (d.ecom_visibility === "HIDDEN" || d.ecom_visibility === "UNAVAILABLE") continue;

    const images = (d.image_ids || []).map(id => related.get(id)?.image_data?.url).filter(Boolean);
    const catIds = [d.category_id, ...(d.categories || []).map(c => c.id)].filter(Boolean);
    const categories = [...new Set(catIds.map(id => related.get(id)?.category_data?.name).filter(Boolean))];

    const variations = [];
    for (const v of d.variations || []) {
      const vd = v.item_variation_data || {};
      if (v.is_deleted || vd.pricing_type !== "FIXED_PRICING" || !vd.price_money) continue;
      const tracked = isTracked(vd, env.SQUARE_LOCATION_ID);
      variations.push({
        id: v.id,
        name: vd.name || "",
        sku: vd.sku || "",
        price: Number(vd.price_money.amount),
        stock: tracked ? (stock.get(v.id) ?? 0) : null, // null = not tracked, always available
      });
    }
    if (!variations.length) continue;

    products.push({
      id: it.id,
      name: d.name,
      slug: slugify(d.name) + "-" + it.id.slice(-6).toLowerCase(),
      description: d.description_plaintext || stripHtml(d.description_html || d.description || ""),
      categories,
      images,
      variations,
      updated: it.updated_at,
    });
  }
  return products;
}

function isTracked(vd, locationId) {
  const o = (vd.location_overrides || []).find(x => x.location_id === locationId);
  if (o && typeof o.track_inventory === "boolean") return o.track_inventory;
  return !!vd.track_inventory;
}

const slugify = s => String(s || "item").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const stripHtml = s => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
