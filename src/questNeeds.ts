// What your quests still need, counted the way the game takes it.
//
// Most quests take their items when you turn them in, so two quests asking for
// the same item need the sum. STARMAPS and PAMRATS only check that you hold the
// items, and each quest's list repeats the one before, so across those the
// need is the largest single amount, not the sum.
import recipesData from './data/recipes.json';
import masteriesData from './data/masteries.json';
import { runLocations } from './runLocations';
import { PASSIVE_MATERIALS } from './milestonePlan';
import { parseItems } from './utils';
import type { Quest } from './types';

const HOLD_LINES: [RegExp, string][] = [
  [/^Starting To Actually Realize/, 'STARMAPS'],
  [/^Pleasantly Arbitrating Misconstrued/, 'PAMRATS'],
];

export function isHoldQuest(quest: Quest): boolean {
  return HOLD_LINES.some(([re]) => re.test(quest.questline));
}

// "Pleasantly Arbitrating…<br/>…Skirted III" → "PAMRATS III"; other names lose their line breaks
export function questLabel(quest: Quest): string {
  const hold = HOLD_LINES.find(([re]) => re.test(quest.questline));
  if (hold) return `${hold[1]} ${quest.name.trim().split(/\s+/).pop()}`;
  return quest.name.replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface QuestNeed { need: number; quests: string[] }

export function combineQuestNeeds(quests: Quest[]): Map<string, QuestNeed> {
  const taken = new Map<string, QuestNeed>();
  const held = new Map<string, QuestNeed>();
  for (const q of quests) {
    const hold = isHoldQuest(q);
    const into = hold ? held : taken;
    for (const { item, quantity } of parseItems(q.itemsRequired)) {
      const e = into.get(item) ?? { need: 0, quests: [] };
      e.need = hold ? Math.max(e.need, quantity) : e.need + quantity;
      e.quests.push(questLabel(q));
      into.set(item, e);
    }
  }
  for (const [item, h] of held) {
    const e = taken.get(item) ?? { need: 0, quests: [] };
    taken.set(item, { need: e.need + h.need, quests: [...e.quests, ...h.quests] });
  }
  return taken;
}

// ── Breaking shortfalls down to what you gather ─────────────────────────────
// Crafted items are broken down to their raw materials, using up spare
// intermediates you already have first (never stock in `reserved`). Cooked
// items stop at the Kitchen; passive materials (Wood, Nails…) are left out.

const recipes = new Map<string, { item: string; quantity: number }[]>(
  (recipesData as { name: string; ingredients: { item: string; quantity: number }[] }[]).map((r) => [r.name, r.ingredients]),
);
const cookedNames = new Set(
  (masteriesData as { name: string; method: string }[]).filter((m) => m.method === 'cooking').map((m) => m.name),
);

export function recipeFor(item: string) { return recipes.get(item); }

export interface RawNeed {
  qty: number;
  forItems: string[];   // the short items it ends up in
  madeInto: string[];   // recipes that use it directly
}

export function breakDown(
  short: Map<string, number>,
  inventory: Record<string, number>,
  reserved: Map<string, number>,
): { raw: Map<string, RawNeed>; cook: Map<string, RawNeed> } {
  const spare = new Map<string, number>();
  const avail = (item: string) => {
    if (!spare.has(item)) spare.set(item, Math.max(0, (inventory[item] ?? 0) - (reserved.get(item) ?? 0)));
    return spare.get(item)!;
  };
  const raw = new Map<string, RawNeed>();
  const cook = new Map<string, RawNeed>();
  const add = (into: Map<string, RawNeed>, item: string, qty: number, top: string, parent?: string) => {
    const e = into.get(item) ?? { qty: 0, forItems: [], madeInto: [] };
    e.qty += qty;
    if (top !== item && !e.forItems.includes(top)) e.forItems.push(top);
    if (parent && !e.madeInto.includes(parent)) e.madeInto.push(parent);
    into.set(item, e);
  };

  const need = (item: string, qty: number, top: string, depth: number, parent?: string) => {
    if (depth > 0) {
      const use = Math.min(avail(item), qty);
      spare.set(item, avail(item) - use);
      qty -= use;
    }
    if (qty <= 0) return;
    const recipe = recipes.get(item);
    if (recipe && cookedNames.has(item)) { add(cook, item, qty, top, parent); return; }
    if (!recipe || depth > 6 || recipe.some((i) => i.item === 'Cooking Pot')) {
      if (!PASSIVE_MATERIALS.has(item)) add(raw, item, qty, top, parent);
      return;
    }
    for (const ing of recipe) need(ing.item, ing.quantity * qty, top, depth + 1, item);
  };
  for (const [item, qty] of short) need(item, qty, item, 0);
  return { raw, cook };
}

// Where an item drops most often among places you farm by spending attempts
export function bestRunLocation(item: string): { name: string; type: string; rate: number } | null {
  let best: { name: string; type: string; rate: number } | null = null;
  for (const loc of runLocations) {
    const drop = loc.drops.find((d) => d.item === item);
    if (drop && (!best || drop.rate < best.rate)) best = { name: loc.name, type: loc.type, rate: drop.rate };
  }
  return best;
}

export interface Shortfalls {
  needs: Map<string, QuestNeed>;   // what the quests ask for in total
  raw: Map<string, RawNeed>;       // what's short, broken down to what you gather
  cook: Map<string, RawNeed>;
}

export function questShortfalls(quests: Quest[], inventory: Record<string, number>): Shortfalls {
  const needs = combineQuestNeeds(quests);
  const short = new Map<string, number>();
  for (const [item, { need }] of needs) {
    const s = need - (inventory[item] ?? 0);
    if (s > 0) short.set(item, s);
  }
  const reserved = new Map([...needs].map(([item, n]) => [item, n.need]));
  return { needs, ...breakDown(short, inventory, reserved) };
}
