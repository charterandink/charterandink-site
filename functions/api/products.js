// GET /api/products  -> storefront catalog with live stock.
// Cached at the edge for 60 seconds so busy days don't hammer Square.
import { loadCatalog, SHIPPING } from "../_lib/square.js";

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL("/api/products?v=1", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  try {
    const products = await loadCatalog(env);
    const res = Response.json(
      { mode: env.SQUARE_ENV === "production" ? "live" : "test", shipping: SHIPPING, products },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
    waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    console.error(err);
    return Response.json({ error: "The shop is having trouble loading. Try again in a minute." }, { status: 502 });
  }
}
