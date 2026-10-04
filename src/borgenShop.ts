// Parses Borgen's shop pages (Borgen Mercantile, bmerc.php, and Borgen's Camp)
// from page text — either the page's innerText (bookmarklet) or text copied
// from the page (paste). Each item reads:
//   Name / description line(s) / "− + +MAX" / "25 Bucks"
//
// Self-contained on purpose: the bookmarklet embeds this function via
// toString(), so it must not reference anything outside itself.
export function parseBorgenShop(text: string): BorgenShopCapture | null {
  const lines = text.split('\n')
    .map(function (l) { return l.trim().replace(/^\*\s+/, ''); })
    .filter(Boolean);
  // The shop list starts after "Take a look". Framework7 can keep earlier
  // pages in the DOM, so use the last one (the page being viewed).
  const start = lines.lastIndexOf('Take a look');
  if (start < 0) return null;
  const priceRe = /^([\d,]+)\s+(Borgen Bucks?|Bucks?|Ancient Coins?)$/i;
  const controlRe = /^[−\-+\s]*(\+?MAX)?$/;
  const items: { item: string; price: number }[] = [];
  let currency = '';
  let name: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    const pm = l.match(priceRe);
    if (pm) {
      if (name) items.push({ item: name, price: parseInt(pm[1].replace(/,/g, ''), 10) });
      if (!currency) currency = /coin/i.test(pm[2]) ? 'Ancient Coins' : 'Borgen Bucks';
      name = null;
      continue;
    }
    if (controlRe.test(l)) continue;
    if (name === null) name = l; // first line of an item block; the rest is description
  }
  if (!items.length) return null;
  const bal = text.match(/You currently have ([\d,]+) Borgen Bucks/);
  return {
    shop: currency === 'Ancient Coins' ? 'camp' : 'mercantile',
    currency,
    items,
    balance: bal ? parseInt(bal[1].replace(/,/g, ''), 10) : undefined,
  };
}

export interface BorgenShopCapture {
  shop: 'mercantile' | 'camp';
  currency: string;
  items: { item: string; price: number }[];
  balance?: number;
}

export const BORGEN_SHOP_NAMES: Record<BorgenShopCapture['shop'], string> = {
  mercantile: 'Borgen Mercantile',
  camp: "Borgen's Camp",
};

// Borgen's Camp restocks on Wednesdays (game time, US Central). Approximated
// as Wednesday 05:00 UTC, i.e. midnight Central daylight time.
export function lastCampRestock(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(5, 0, 0, 0);
  while (d.getUTCDay() !== 3 || d > now) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export interface BorgenOffer {
  shop: string;          // display name
  price: number;
  currency: string;
  capturedAt: string;
  outdated: boolean;     // Camp stock captured before its last restock
}

type Shops = { mercantile?: StockLike; camp?: StockLike };
type StockLike = { items: { item: string; price: number }[]; currency: string; capturedAt: string };

// Where an item is (or was, when last captured) for sale from Borgen
export function borgenOffers(item: string, shops: Shops): BorgenOffer[] {
  const out: BorgenOffer[] = [];
  for (const key of ['mercantile', 'camp'] as const) {
    const stock = shops[key];
    const hit = stock?.items.find((i) => i.item === item);
    if (!stock || !hit) continue;
    out.push({
      shop: BORGEN_SHOP_NAMES[key],
      price: hit.price,
      currency: stock.currency,
      capturedAt: stock.capturedAt,
      outdated: key === 'camp' && new Date(stock.capturedAt) < lastCampRestock(),
    });
  }
  return out;
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Stamp a capture with the time it was taken, for storing in borgenShops
export function toStock(capture: BorgenShopCapture) {
  return { items: capture.items, currency: capture.currency, balance: capture.balance, capturedAt: new Date().toISOString() };
}
