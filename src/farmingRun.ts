import masteriesData from './data/masteries.json';
import { itemLocations } from './data/itemSources';
import type { Quest } from './types';
import { parseItems, resolveRawIngredients } from './utils';
import { PASSIVE_MATERIALS } from './milestonePlan';
import { CRAFTWORKS_SKIP } from './data/passiveMaterials';

// Plans one trip to a farming location: what the run is expected to drop, what
// that does for your quests and masteries, and which Craftworks lines would use
// up anything the run pushes over your inventory cap instead of voiding it.

interface Mastery { name: string; method: string }
export interface Recipe { name: string; ingredients: { item: string; quantity: number }[] }

const masteryNames = new Set((masteriesData as Mastery[]).map((m) => m.name));
const cookingNames = new Set((masteriesData as Mastery[]).filter((m) => m.method === 'cooking').map((m) => m.name));


// Locations you farm by spending attempts (crops come from the Farm instead)
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

export interface QuestNeed { need: number; quests: string[]; viaCraft: boolean }

// Everything active and next-up quests still need, direct items plus the raw
// ingredients of required crafts you're short on. Active quests come first in `quests`.
export function questNeeds(
  activeQuests: Quest[], nextUpQuests: Quest[], inventory: Record<string, number>, recipeMap: Map<string, Recipe>,
): Map<string, QuestNeed> {
  const needs = new Map<string, QuestNeed>();
  const add = (item: string, qty: number, quests: string[], viaCraft: boolean) => {
    const n = needs.get(item) ?? { need: 0, quests: [], viaCraft };
    n.need += qty;
    for (const quest of quests) if (!n.quests.includes(quest)) n.quests.push(quest);
    n.viaCraft &&= viaCraft;
    needs.set(item, n);
  };
  for (const q of [...activeQuests, ...nextUpQuests]) {
    for (const { item, quantity } of parseItems(q.itemsRequired)) add(item, quantity, [q.name], false);
  }
  // Short crafted items: what's still missing has to come from raw ingredients
  for (const [item, { need, quests }] of [...needs]) {
    const short = need - (inventory[item] ?? 0);
    if (short <= 0 || !recipeMap.has(item.toLowerCase())) continue;
    for (const [raw, qty] of resolveRawIngredients(item, short, recipeMap)) {
      if (raw !== item) add(raw, qty, quests, true);
    }
  }
  return needs;
}

export interface Progress { level: number; count: number; target: number }

function masteryOf(item: string, levels: Record<string, number>, progress: Record<string, number>): Progress | null {
  const level = levels[item] ?? 0;
  if (!masteryNames.has(item) || level >= 3) return null;
  return { level, count: progress[item] ?? 0, target: level === 0 ? 10_000 : level === 1 ? 100_000 : 1_000_000 };
}

export interface DropPlan {
  item: string;
  rate: number;
  have: number;
  gain: number;          // expected drops from the run
  wasted: number;        // expected drops past the inventory cap
  quest?: QuestNeed & { short: number };
  mastery: Progress | null;
}

export interface SlotPlan {
  output: string;
  crafts: number;
  reason: 'overflow' | 'mastery';
  uses: { item: string; qty: number; overflow: boolean }[];
  absorbed: number;      // overflow units this line uses up
  mastery: Progress | null;
  hitsMilestone: boolean;
}

export interface RunPlan {
  drops: DropPlan[];
  slots: SlotPlan[];
  wastedBefore: number;
  wastedAfter: number;
  noSink: string[];      // overflowing items no recipe can use
}

export interface RunInput {
  location: RunLocation;
  attempts: number;
  inventory: Record<string, number>;
  inventoryMax: number;
  needs: Map<string, QuestNeed>;
  recipes: Recipe[];
  masteryLevels: Record<string, number>;
  masteryProgress: Record<string, number>;
  slotCount: number;
}

export function planRun(input: RunInput): RunPlan {
  const { location, attempts, inventory, inventoryMax: cap, needs, masteryLevels, masteryProgress } = input;

  const drops: DropPlan[] = location.drops.map(({ item, rate }) => {
    const have = inventory[item] ?? 0;
    const gain = attempts / rate;
    const need = needs.get(item);
    return {
      item, rate, have, gain,
      wasted: Math.max(0, have + gain - cap) - Math.max(0, have - cap),
      quest: need && need.need > have ? { ...need, short: need.need - have } : undefined,
      mastery: masteryOf(item, masteryLevels, masteryProgress),
    };
  });

  // Units left over after the run that quests don't need: the most a Craftworks line may use.
  // Overflowing drops are what we're trying to use up; everything else is a helper ingredient.
  const overflow = new Map(drops.filter((d) => d.wasted >= 1).map((d) => [d.item, Math.floor(d.wasted)]));
  const gainOf = new Map(drops.map((d) => [d.item, d.gain]));
  // Craftworks runs alongside the trip, so everything the run brings in can feed it
  const spare = (item: string) =>
    Math.max(0, Math.floor((inventory[item] ?? 0) + (gainOf.get(item) ?? 0) - (needs.get(item)?.need ?? 0)));
  const spareLeft = new Map<string, number>();
  const takeable = (item: string) => spareLeft.get(item) ?? spare(item);

  const craftable = input.recipes.filter((r) =>
    !cookingNames.has(r.name) && !CRAFTWORKS_SKIP.has(r.name) && !r.ingredients.some((i) => i.item.toLowerCase() === 'cooking pot'));
  const candidates = craftable.filter((r) => r.ingredients.some((i) => overflow.has(i.item)));

  // Most crafts a recipe can run on spare stock without its output going over the cap
  const maxCrafts = (r: Recipe) => Math.min(
    Math.max(0, cap - (inventory[r.name] ?? 0)),
    ...r.ingredients.map((i) => Math.floor(takeable(i.item) / i.quantity)),
  );

  const slots: SlotPlan[] = [];
  const wastedBefore = [...overflow.values()].reduce((a, b) => a + b, 0);
  const fill = (pool: Recipe[], evaluate: (r: Recipe) => { slot: SlotPlan; score: number } | null) => {
    while (slots.length < input.slotCount) {
      let best: { slot: SlotPlan; score: number } | null = null;
      for (const r of pool) {
        if (slots.some((x) => x.output === r.name)) continue;
        const option = evaluate(r);
        if (option && (!best || option.score > best.score)) best = option;
      }
      if (!best) return;
      slots.push(best.slot);
      for (const u of best.slot.uses) {
        spareLeft.set(u.item, takeable(u.item) - u.qty);
        if (overflow.has(u.item)) overflow.set(u.item, Math.max(0, overflow.get(u.item)! - u.qty));
      }
    }
  };
  const slotFor = (r: Recipe, crafts: number, reason: SlotPlan['reason'], mastery: Progress | null): SlotPlan => ({
    output: r.name, crafts, reason, mastery,
    absorbed: r.ingredients.reduce((sum, i) => sum + Math.min(overflow.get(i.item) ?? 0, i.quantity * crafts), 0),
    hitsMilestone: !!mastery && mastery.count + crafts >= mastery.target,
    uses: r.ingredients.map((i) => ({ item: i.item, qty: i.quantity * crafts, overflow: (overflow.get(i.item) ?? 0) > 0 })),
  });

  // 1. Use up what the run would push over the cap
  fill(candidates, (r) => {
    const toClear = Math.max(0, ...r.ingredients
      .filter((i) => (overflow.get(i.item) ?? 0) > 0)
      .map((i) => Math.ceil(overflow.get(i.item)! / i.quantity)));
    const crafts = Math.min(maxCrafts(r), toClear);
    if (crafts <= 0) return null;
    const mastery = masteryOf(r.name, masteryLevels, masteryProgress);
    const slot = slotFor(r, crafts, 'overflow', mastery);
    // Prefer lines made mostly of overflow and self-refilling materials over ones that eat
    // other stock, and count a line that moves a mastery toward its next milestone up to double
    const total = r.ingredients.reduce((sum, i) => sum + i.quantity, 0);
    const free = r.ingredients.reduce((sum, i) => sum + (overflow.has(i.item) || PASSIVE_MATERIALS.has(i.item) ? i.quantity : 0), 0);
    return { slot, score: slot.absorbed * (0.5 + 0.5 * free / total) * (mastery ? 1 + mastery.count / mastery.target : 1) };
  });

  // 2. Fill the remaining slots with mastery pushes from spare stock: lines that reach their
  // next milestone first, then the closest to it, with a nudge for ones fed by this run's drops
  // (10k/100k, which earn AP, ahead of 1M)
  fill(craftable, (r) => {
    const mastery = masteryOf(r.name, masteryLevels, masteryProgress);
    if (!mastery) return null;
    const crafts = Math.min(maxCrafts(r), mastery.target - mastery.count);
    if (crafts <= 0) return null;
    const slot = slotFor(r, crafts, 'mastery', mastery);
    const fedByRun = r.ingredients.some((i) => (gainOf.get(i.item) ?? 0) >= 1);
    return { slot, score: (slot.hitsMilestone ? 4 : 0) + 2 * mastery.count / mastery.target + (fedByRun ? 1 : 0) + (mastery.level < 2 ? 1 : 0) };
  });

  const sinkable = new Set(candidates.flatMap((r) => r.ingredients.map((i) => i.item)));
  return {
    drops,
    slots,
    wastedBefore,
    wastedAfter: [...overflow.values()].reduce((a, b) => a + b, 0),
    noSink: drops.filter((d) => d.wasted >= 1 && !sinkable.has(d.item)).map((d) => d.item),
  };
}

// Locations ranked by how many short quest items drop there
export function rankLocations(needs: Map<string, QuestNeed>, inventory: Record<string, number>) {
  return runLocations
    .map((loc) => ({ loc, questItems: loc.drops.filter((d) => (needs.get(d.item)?.need ?? 0) > (inventory[d.item] ?? 0)).map((d) => d.item) }))
    .sort((a, b) => b.questItems.length - a.questItems.length || a.loc.name.localeCompare(b.loc.name));
}
