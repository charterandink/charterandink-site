# charterandink.com

Starter site for Charter & Ink. Plain HTML and CSS, hosted on Cloudflare Pages, with a small email signup.

## What's here

```
public/            the website (everything in here gets published)
  index.html
  styles.css
  _redirects       short links for QR codes (/hello, /shop, /con)
  img/             your photos go here (see list below)
functions/api/
  subscribe.js     saves signup emails
  subscribers.js   downloads the list as a CSV
```

## Photos to add to public/img

The page looks finished without them (each spot has a resin-color placeholder). Drop these in whenever they're ready. Use JPGs about 1600px wide.

| File | Where it shows |
|---|---|
| logo.png | next to the name in the header (transparent PNG, about 80px tall) |
| favicon.png | browser tab icon (square, 512px) |
| hero.jpg | the big circle at the top (square crop, one hero die) |
| shardform.jpg | Shardform card |
| emberblade.jpg | Emberblade card |
| mckraken.jpg | McKraken card |
| briar-thorn.jpg | Briar & Thorn card |
| arcane-fireball.jpg | Arcane Fireball card |
| maelstrom.jpg | Maelstrom card |
| chonk-55.jpg | 55mm Chonk wide card |
| canvas.jpg | canvas print (portrait, 2:3) |
| share.jpg | preview image when the link is shared (1200 × 630) |

## Putting it online (Cloudflare Pages)

1. Create a GitHub repository called `charterandink-site` and upload everything in this folder.
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, and pick that repository.
3. Build settings: Framework preset **None**, build command **blank**, build output directory **public**. Save and deploy.
4. Make the email storage: **Workers & Pages → KV → Create namespace**, name it `charterandink-subscribers`.
5. Back in the Pages project: **Settings → Bindings → Add → KV namespace**. Variable name `SUBSCRIBERS`, pick the namespace you just made.
6. Same project: **Settings → Variables and secrets → Add**. Name `ADMIN_KEY`, type **Secret**, value = a long random password only you know.
7. **Deployments → Retry deployment** so the new settings take effect.
8. **Custom domains → Set up a custom domain**: add `charterandink.com`, then again for `www.charterandink.com`. Cloudflare fills in the DNS records for you. If it complains about an existing record for the same name (Porkbun's old parking page), delete that record in DNS and try again. Leave the email records alone.

## Getting your email list

Visit `https://charterandink.com/api/subscribers?key=YOUR_ADMIN_KEY` and a CSV downloads.

## The Square store

New pages: `/shop/` (all products), `/product.html?p=...` (one product), `/thanks.html` (after checkout), `/policies.html` (shipping, returns, privacy; **edit the draft text before launch**). The cart lives on every shop page. The home page still points to Etsy until you're ready to launch.

How it works: products, photos, prices and stock come live from Square. The cart sends customers to Square's own checkout page. Shipping is $7 flat, free when the items total $75 or more (change it in `functions/_lib/square.js`). Sales tax is whatever tax you've set up in Square and applied to the items.

Products only show on the site if they have a fixed price and aren't hidden from online sales in Square. Turn on stock tracking for each item in Square, or the site treats it as unlimited.

### Testing in sandbox

1. At developer.squareup.com open your app, switch to **Sandbox**, and open the **Sandbox test account** dashboard. Add 3 or 4 test items there with photos, prices, a category and stock. (Your real catalog doesn't appear in sandbox. It's a separate practice account.)
2. Copy the **Sandbox access token** and the sandbox **Location ID** (Locations page in the developer dashboard).
3. In Cloudflare Pages → Settings → Variables and secrets, add:
   - `SQUARE_ENV` (Text) = `sandbox`
   - `SQUARE_LOCATION_ID` (Text) = the sandbox location ID
   - `SQUARE_ACCESS_TOKEN` (Secret) = the sandbox access token
4. Retry the deployment. Visit `/shop/`. A yellow "Test mode" bar shows at the top.
5. Buy something with Square's test card: `4111 1111 1111 1111`, any future date, any CVV, any ZIP.
6. Check the order in the sandbox dashboard, and that stock went down.

### Going live

1. Import your Etsy listings into your real Square account and check each item's SKU, price, photo, category and stock.
2. Swap the three Cloudflare values for the **production** token and location ID, and set `SQUARE_ENV` to `production`. Retry the deployment.
3. Do one real purchase of something cheap, then refund it in Square.
4. Connect Pirate Ship to Square (Pirate Ship → Settings → Integrations → Square) and check the test order shows up to ship.
5. Point the home page buttons and the `/shop` and `/hello` short links at `/shop/`.

## QR codes

Print QR codes that point to `charterandink.com/hello` (or `/con` for convention handouts). To change where they go, edit `public/_redirects`. When the Square store is live, `/hello` and `/shop` get pointed at it and every card you've printed still works.
