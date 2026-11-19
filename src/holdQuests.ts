// Planning for the two long "show me" questlines, STARMAPS (Star Meerif) and
// PAMRATS (Borgen & Holger). Each quest's list repeats the previous one and
// grows, and both finales ask for 1x of every item: you prove you hold the
// items rather than hand them over. So the same stack of an item covers both
// lines at once (the need is the larger of the two, not the sum), and
// anything you craft or hand to another quest must come out of stock above
// that held amount.
import questsData from './data/quests.json';
import type { Quest, QuestStatus } from './types';
import { compareQuests, parseItems } from './utils';
import { breakDown, bestRunLocation, recipeFor } from './questNeeds';

export type HoldLineKey = 'starmaps' | 'pamrats';

export interface HoldLine {
  key: HoldLineKey;
  short: string;       // community acronym
  npc: string;
  quests: Quest[];     // in order I, II, III…
}

const allQuests = questsData as Quest[];

function lineQuests(match: RegExp): Quest[] {
  return allQuests
    .filter((q) => match.test(q.questline))
    .sort((a, b) => compareQuests(a.name, b.name));
}

export const HOLD_LINES: HoldLine[] = [
  { key: 'starmaps', short: 'STARMAPS', npc: 'Star Meerif', quests: lineQuests(/^Starting To Actually Realize/) },
  { key: 'pamrats', short: 'PAMRATS', npc: 'Borgen & Holger', quests: lineQuests(/^Pleasantly Arbitrating Misconstrued/) },
];

const holdQuestIds = new Set(HOLD_LINES.flatMap((l) => l.quests.map((q) => q.id)));

// "Starting To … Pretty IV" → "STARMAPS IV"
export function shortQuestName(line: HoldLine, quest: Quest): string {
  const numeral = quest.name.trim().split(/\s+/).pop() ?? '';
  return `${line.short} ${numeral}`;
}

// The quest you're on: the first one not marked completed (null once all are done).
export function currentIndex(line: HoldLine, statuses: Record<string, QuestStatus>): number | null {
  const idx = line.quests.findIndex((q) => statuses[q.id] !== 'completed');
  return idx === -1 ? null : idx;
}

function needMap(quest: Quest | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!quest) return m;
  for (const { item, quantity } of parseItems(quest.itemsRequired)) m.set(item, quantity);
  return m;
}

export interface LineNeed { now: number; next: number; peak: number }

export interface CraftDraw { product: string; qty: number }      // crafting `qty` more `product` uses this item
export interface OtherUse { quest: string; qty: number }         // another active quest takes this item

export interface HoldRow {
  item: string;
  have: number;
  lines: Partial<Record<HoldLineKey, LineNeed>>;
  holdNow: number;      // to turn in both current quests
  holdNext: number;     // to also turn in both next quests
  peak: number;         // most any remaining quest asks for
  craftDraws: CraftDraw[];
  otherUses: OtherUse[];
  target: number;       // holdNow + craft draws + other quests
  short: number;
  shared: boolean;      // on both current lists
}

export interface CraftClash {
  product: string;      // what you still need to craft
  productShort: number;
  ingredient: string;   // a held item the recipe uses up
  perCraft: number;
  draw: number;
}

export interface FeedReward {
  from: string;         // short quest name
  item: string;
  qty: number;
  helps: string[];      // short names of quests that ask for it
}

export interface HoldPlan {
  current: Partial<Record<HoldLineKey, number | null>>;
  rows: HoldRow[];
  clashes: CraftClash[];
  feeds: FeedReward[];
  maxHold: number;
}

export function buildHoldPlan(
  statuses: Record<string, QuestStatus>,
  inventory: Record<string, number>,
): HoldPlan {
  const current: Partial<Record<HoldLineKey, number | null>> = {};
  const rowMap = new Map<string, HoldRow>();
  const row = (item: string): HoldRow => {
    let r = rowMap.get(item);
    if (!r) {
      r = { item, have: inventory[item] ?? 0, lines: {}, holdNow: 0, holdNext: 0, peak: 0, craftDraws: [], otherUses: [], target: 0, short: 0, shared: false };
      rowMap.set(item, r);
    }
    return r;
  };

  for (const line of HOLD_LINES) {
    const idx = currentIndex(line, statuses);
    current[line.key] = idx;
    if (idx === null) continue;
    const now = needMap(line.quests[idx]);
    const next = needMap(line.quests[idx + 1]);
    const peak = new Map<string, number>();
    for (const q of line.quests.slice(idx)) {
      for (const [item, qty] of needMap(q)) peak.set(item, Math.max(peak.get(item) ?? 0, qty));
    }
    for (const [item, p] of peak) {
      const n = now.get(item) ?? 0;
      const nx = Math.max(n, next.get(item) ?? 0);
      const r = row(item);
      r.lines[line.key] = { now: n, next: nx, peak: p };
      r.holdNow = Math.max(r.holdNow, n);
      r.holdNext = Math.max(r.holdNext, nx);
      r.peak = Math.max(r.peak, p);
    }
  }

  // Other quests you've marked active hand their items over, so they come on top.
  for (const q of allQuests) {
    if (statuses[q.id] !== 'active' || holdQuestIds.has(q.id)) continue;
    for (const { item, quantity } of parseItems(q.itemsRequired)) {
      const r = rowMap.get(item);
      if (r) r.otherUses.push({ quest: q.name.replace(/<br\s*\/?>/g, ' '), qty: quantity });
    }
  }

  // Crafting a held item from another held item eats into that stock, e.g.
  // Leather Belt uses an Awl and a Steel Buckle. Resolve to a fixed point so
  // chains (Fancy Table → Corn Oil → Machine Press) add up.
  const rows = [...rowMap.values()];
  const base = new Map(rows.map((r) => [
    r.item,
    r.holdNow + (r.holdNow > 0 ? r.otherUses.reduce((sum, o) => sum + o.qty, 0) : 0),
  ]));
  for (const r of rows) r.target = base.get(r.item)!;
  let clashes: CraftClash[] = [];
  for (let pass = 0; pass < 8; pass++) {
    const draws = new Map<string, CraftDraw[]>();
    clashes = [];
    for (const r of rows) {
      const short = r.target - r.have;
      if (short <= 0) continue;
      for (const ing of recipeFor(r.item) ?? []) {
        if (!rowMap.has(ing.item) || rowMap.get(ing.item)!.holdNow === 0) continue;
        const draw = short * ing.quantity;
        draws.set(ing.item, [...(draws.get(ing.item) ?? []), { product: r.item, qty: draw }]);
        clashes.push({ product: r.item, productShort: short, ingredient: ing.item, perCraft: ing.quantity, draw });
      }
    }
    let changed = false;
    for (const r of rows) {
      r.craftDraws = draws.get(r.item) ?? [];
      const target = base.get(r.item)! + r.craftDraws.reduce((sum, d) => sum + d.qty, 0);
      if (target !== r.target) { r.target = target; changed = true; }
    }
    if (!changed) break;
  }

  for (const r of rows) {
    r.short = Math.max(0, r.target - r.have);
    r.shared = Object.values(r.lines).filter((l) => l && l.now > 0).length > 1;
  }

  // Rewards still to come that count toward items one of the lines asks for.
  const feeds: FeedReward[] = [];
  for (const line of HOLD_LINES) {
    const idx = current[line.key];
    if (idx == null) continue;
    for (const q of line.quests.slice(idx)) {
      for (const { item, quantity } of parseItems(q.rewardItems)) {
        if (!rowMap.has(item)) continue;
        const helps: string[] = [];
        for (const other of HOLD_LINES) {
          const oi = current[other.key];
          if (oi == null) continue;
          for (const oq of other.quests.slice(oi)) {
            if ((needMap(oq).get(item) ?? 0) > 1 && !(other.key === line.key && line.quests.indexOf(oq) <= line.quests.indexOf(q))) {
              helps.push(shortQuestName(other, oq));
            }
          }
        }
        if (helps.length) feeds.push({ from: shortQuestName(line, q), item, qty: quantity, helps });
      }
    }
  }

  rows.sort((a, b) => b.holdNow - a.holdNow || a.item.localeCompare(b.item));
  const maxHold = rows.reduce((m, r) => Math.max(m, r.holdNext), 0);
  return { current, rows, clashes, feeds, maxHold };
}

// ── Where to get what's still short ─────────────────────────────────────────
// Crafted items are broken down to what you'd actually go and gather, using up
// spare intermediates you already have first (never ones you're holding for
// these quests). Gatherable items go to the location where they drop most
// often; everything else is listed with its best other source.

export interface GatherItem { item: string; qty: number; rate: number; forItems: string[]; madeInto: string[] }
export interface GatherStop { location: string; type: string; items: GatherItem[]; attempts: number; forItems: string[] }
export interface OtherNeed { item: string; qty: number; source: string; forItems: string[] }

export interface GatherPlan {
  stops: GatherStop[];
  cook: OtherNeed[];      // cooked items (the Kitchen, not Craftworks)
  other: OtherNeed[];     // pet loot, locksmith, wishing well, crops, shops…
}

export function buildGatherPlan(
  short: Map<string, number>,
  inventory: Record<string, number>,
  reserved: Map<string, number>,
  sourceOf: (item: string) => string | null,
): GatherPlan {
  const { raw, cook } = breakDown(short, inventory, reserved);
  const stopMap = new Map<string, GatherStop>();
  const other: OtherNeed[] = [];
  for (const [item, r] of raw) {
    const best = bestRunLocation(item);
    if (best) {
      const stop = stopMap.get(best.name) ?? { location: best.name, type: best.type, items: [], attempts: 0, forItems: [] };
      stop.items.push({ item, qty: r.qty, rate: best.rate, forItems: r.forItems, madeInto: r.madeInto });
      for (const f of r.forItems) if (!stop.forItems.includes(f)) stop.forItems.push(f);
      stop.attempts = Math.max(stop.attempts, Math.ceil(r.qty * best.rate));
      stopMap.set(best.name, stop);
    } else {
      other.push({ item, qty: r.qty, source: sourceOf(item) ?? 'Unknown source', forItems: r.forItems });
    }
  }
  const stops = [...stopMap.values()];
  for (const st of stops) st.items.sort((a, b) => b.qty * b.rate - a.qty * a.rate);
  stops.sort((a, b) => b.items.length - a.items.length || a.attempts - b.attempts);
  other.sort((a, b) => a.source.localeCompare(b.source) || a.item.localeCompare(b.item));
  return {
    stops,
    cook: [...cook].map(([item, r]) => ({ item, qty: r.qty, source: 'Kitchen', forItems: r.forItems })).sort((a, b) => a.item.localeCompare(b.item)),
    other,
  };
}
