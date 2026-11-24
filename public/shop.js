// Charter & Ink storefront: catalog loading, cart drawer, checkout.
(() => {
  const CART_KEY = "ci-cart-v1";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = c => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);

  // ---------- cart storage ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
    set(items) { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {} render(); },
  };
  const count = () => store.get().reduce((n, i) => n + i.qty, 0);

  let catalog = null, shipping = { flatCents: 700, freeOverCents: 7500 }, mode = "test";
  async function loadCatalog() {
    if (catalog) return catalog;
    const r = await fetch("/api/products");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Couldn't load the shop.");
    catalog = j.products; shipping = j.shipping || shipping; mode = j.mode;
    if (mode === "test") document.body.classList.add("test-mode");
    reconcile();
    return catalog;
  }
  const findVar = id => {
    for (const p of catalog || []) for (const v of p.variations) if (v.id === id) return { p, v };
    return null;
  };
  // Drop sold-out or deleted items, refresh prices, clamp quantities.
  function reconcile() {
    if (!catalog) return;
    const next = [];
    for (const i of store.get()) {
      const f = findVar(i.id);
      if (!f) continue;
      const max = f.v.stock === null ? 99 : f.v.stock;
      if (max < 1) continue;
      next.push({ ...i, price: f.v.price, qty: Math.min(i.qty, max) });
    }
    store.set(next);
  }

  function add(product, variation, qty = 1) {
    const items = store.get();
    const max = variation.stock === null ? 99 : variation.stock;
    const ex = items.find(i => i.id === variation.id);
    if (ex) ex.qty = Math.min(max, ex.qty + qty);
    else items.push({
      id: variation.id, qty: Math.min(max, qty), price: variation.price,
      name: product.name, option: product.variations.length > 1 ? variation.name : "",
      image: product.images[0] || "", slug: product.slug,
    });
    store.set(items);
    open();
  }

  // ---------- drawer ----------
  function mount() {
    if ($("#cart-drawer")) return;
    document.body.insertAdjacentHTML("afterbegin", `<div class="test-banner">Test mode. Orders here are not real and nothing ships.</div>`);
    document.body.insertAdjacentHTML("beforeend", `
      <button class="cart-fab" id="cart-fab" aria-label="Open cart"><span>Cart</span><b id="cart-count">0</b></button>
      <div class="cart-scrim" id="cart-scrim" hidden></div>
      <aside class="cart-drawer" id="cart-drawer" aria-label="Your cart" aria-hidden="true">
        <header><h2>Your cart</h2><button class="x" id="cart-close" aria-label="Close cart">×</button></header>
        <div class="cart-items" id="cart-items"></div>
        <footer id="cart-foot"></footer>
      </aside>`);
    $("#cart-fab").onclick = open;
    $("#cart-close").onclick = close;
    $("#cart-scrim").onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    $("#cart-items").addEventListener("click", e => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const items = store.get(), i = items.find(x => x.id === b.dataset.id); if (!i) return;
      const f = findVar(i.id), max = f && f.v.stock !== null ? f.v.stock : 99;
      if (b.dataset.act === "inc") i.qty = Math.min(max, i.qty + 1);
      if (b.dataset.act === "dec") i.qty -= 1;
      if (b.dataset.act === "rm") i.qty = 0;
      store.set(items.filter(x => x.qty > 0));
    });
    document.querySelectorAll("[data-open-cart]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); open(); }));
    render();
  }
  function open() { $("#cart-drawer").classList.add("open"); $("#cart-drawer").setAttribute("aria-hidden", "false"); $("#cart-scrim").hidden = false; }
  function close() { $("#cart-drawer")?.classList.remove("open"); $("#cart-drawer")?.setAttribute("aria-hidden", "true"); const s = $("#cart-scrim"); if (s) s.hidden = true; }

  function render() {
    const el = $("#cart-items"); if (!el) return;
    const items = store.get();
    $("#cart-count").textContent = count();
    $("#cart-fab").classList.toggle("has", items.length > 0);
    if (!items.length) {
      el.innerHTML = `<p class="cart-empty">Nothing here yet. The ogre is disappointed but understanding.</p>`;
      $("#cart-foot").innerHTML = `<a class="btn ghost full" href="/shop/">Browse the shop</a>`;
      return;
    }
    el.innerHTML = items.map(i => {
      const f = findVar(i.id), max = f && f.v.stock !== null ? f.v.stock : 99;
      return `<div class="ci">
        <a href="/product.html?p=${esc(i.slug)}" class="ci-img">${i.image ? `<img src="${esc(i.image)}" alt="">` : ""}</a>
        <div class="ci-info">
          <a href="/product.html?p=${esc(i.slug)}" class="ci-name">${esc(i.name)}</a>
          ${i.option ? `<span class="ci-opt">${esc(i.option)}</span>` : ""}
          <div class="ci-row">
            <div class="qty">
              <button data-act="dec" data-id="${esc(i.id)}" aria-label="One fewer">−</button>
              <span>${i.qty}</span>
              <button data-act="inc" data-id="${esc(i.id)}" aria-label="One more" ${i.qty >= max ? "disabled" : ""}>+</button>
            </div>
            <span class="ci-price">${money(i.price * i.qty)}</span>
          </div>
          <button class="ci-rm" data-act="rm" data-id="${esc(i.id)}">Remove</button>
        </div>
      </div>`;
    }).join("");

    const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
    const free = sub >= shipping.freeOverCents;
    const toGo = shipping.freeOverCents - sub;
    $("#cart-foot").innerHTML = `
      <div class="ship-meter"><div style="width:${Math.min(100, sub / shipping.freeOverCents * 100)}%"></div></div>
      <p class="ship-note">${free ? "You've got free shipping." : `${money(toGo)} more for free shipping.`}</p>
      <div class="tot"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="tot dim"><span>Shipping</span><span>${free ? "Free" : money(shipping.flatCents)}</span></div>
      <p class="tax-note">Sales tax is added at checkout.</p>
      <button class="btn full" id="checkout-btn">Check out</button>
      <p class="cart-msg" id="cart-msg" role="status" aria-live="polite"></p>`;
    $("#checkout-btn").onclick = checkout;
  }

  async function checkout() {
    const btn = $("#checkout-btn"), msg = $("#cart-msg");
    btn.disabled = true; btn.textContent = "One moment...";
    try {
      const r = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: store.get().map(i => ({ id: i.id, qty: i.qty })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { location.href = j.url; return; }
      msg.textContent = j.error || "Something went wrong. Try again?";
      if (r.status === 409) { catalog = null; await loadCatalog().catch(() => {}); }
    } catch { msg.textContent = "Something went wrong. Try again?"; }
    btn.disabled = false; btn.textContent = "Check out";
  }

  window.CI = { loadCatalog, add, open, money, esc, clear: () => store.set([]), findVar };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();
  loadCatalog().catch(() => {});
})();
