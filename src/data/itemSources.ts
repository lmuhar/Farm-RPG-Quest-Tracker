import locationData from './item-locations.json';
import sourcesData from './item-sources.json';
import petsData from './pets.json';
import locksmithData from './locksmith-items.json';
import { RARE_ITEMS } from './bottlenecks';

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

// One-line "where to get it" for items with no drop location, best source first:
// farm production (Chicken Coop, Sawmill…) or growing it, the hand-kept note
// (e.g. "Pig (daily reset)"), pet loot, locksmith containers, then the first
// other buddy.farm source (shop, NPC reward, Wishing Well, quest reward…).
const petLoot = new Map<string, string[]>();
for (const pet of petsData as { name: string; loot: Record<string, string[]> }[]) {
  // All pets are level 6, so every loot tier counts
  for (const item of new Set(Object.values(pet.loot).flat())) {
    petLoot.set(item, [...(petLoot.get(item) ?? []), pet.name]);
  }
}
const locksmith = locksmithData as Record<string, { name: string }[]>;

export function sourceHint(item: string): string | null {
  const steady = (itemSources[item] ?? []).filter((src) => src.type === 'production' || src.type === 'farming');
  if (steady.length) return steady.map((src) => src.label).join(' · ');
  const rare = RARE_ITEMS.get(item);
  if (rare && !rare.startsWith('Unknown')) return rare;
  const pets = petLoot.get(item);
  if (pets) return `Pet loot: ${pets.slice(0, 2).join(', ')}${pets.length > 2 ? '…' : ''}`;
  const boxes = locksmith[item];
  if (boxes?.length) return `Locksmith: ${boxes.slice(0, 2).map((b) => b.name).join(', ')}${boxes.length > 2 ? '…' : ''}`;
  return itemSources[item]?.[0]?.label ?? null;
}
