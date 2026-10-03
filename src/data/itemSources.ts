import locationData from './item-locations.json';
import sourcesData from './item-sources.json';

// Both files are refreshed by `npm run sync:buddyfarm`.

// `rate` is buddy.farm's average number of attempts (explores, casts, digs) per drop.
export interface ItemLocation { name: string; type: string; rate?: number }
export interface ItemSource { type: string; label: string }

export const itemLocations = locationData as Record<string, ItemLocation[]>;
export const itemSources = sourcesData as Record<string, ItemSource[]>;

export function formatRate(rate: number): string {
  return `1 in ${rate < 10 ? rate.toFixed(1) : Math.round(rate).toLocaleString()}`;
}

// Expected attempts to collect `quantity` more of an item at its best location of `type`.
export function bestDrop(item: string, type: string, quantity: number): { location: string; attempts: number } | null {
  let best: ItemLocation | null = null;
  for (const loc of itemLocations[item] ?? []) {
    if (loc.type === type && loc.rate && (!best || loc.rate < best.rate!)) best = loc;
  }
  return best ? { location: best.name, attempts: Math.ceil(quantity * best.rate!) } : null;
}
