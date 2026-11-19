import { itemLocations } from './data/itemSources';

// Locations you farm by spending attempts (crops come from the Farm instead),
// with what drops there and how often (1 in `rate` attempts).
const RUN_TYPES = new Set(['explore', 'fishing', 'mining']);
export const RUN_VERB: Record<string, string> = { explore: 'explores', fishing: 'casts', mining: 'digs' };

export interface Drop { item: string; rate: number }
export interface RunLocation { name: string; type: string; drops: Drop[] }

export const runLocations: RunLocation[] = (() => {
  const byName = new Map<string, RunLocation>();
  for (const [item, locs] of Object.entries(itemLocations)) {
    for (const loc of locs) {
      if (!RUN_TYPES.has(loc.type) || !loc.rate) continue;
      const entry = byName.get(loc.name) ?? { name: loc.name, type: loc.type, drops: [] };
      entry.drops.push({ item, rate: loc.rate });
      byName.set(loc.name, entry);
    }
  }
  for (const loc of byName.values()) loc.drops.sort((a, b) => a.rate - b.rate);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

export const runLocationByName = new Map(runLocations.map((l) => [l.name, l]));
