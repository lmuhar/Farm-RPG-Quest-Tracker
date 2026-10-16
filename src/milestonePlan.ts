import masteriesData from './data/masteries.json';
import recipesData from './data/recipes.json';
import { itemLocations } from './data/itemSources';
import { PASSIVE_INPUTS, CRAFTWORKS_SKIP } from './data/passiveMaterials';
import type { CropTime } from './types';

// Plans the next 10k / 100k mastery milestones (10 and 100 Ascension Points),
// ranked by how much of each one current inventory already covers. Crafted
// items are planned as chains: ingredients that are themselves masteries short
// of 100k get crafted (or gathered) fresh so they pick up progress on the way,
// and the plan counts every milestone that progress crosses.

interface Mastery { name: string; difficulty: number; method: string; estimated?: boolean }
interface Recipe { name: string; ingredients: { item: string; quantity: number }[] }

const masteries = masteriesData as Mastery[];
const masteryByName = new Map(masteries.map((m) => [m.name, m]));
const recipeByName = new Map((recipesData as Recipe[]).map((r) => [r.name.toLowerCase(), r]));

const CRAFT_METHODS = new Set(['crafting', 'cooking', 'steelworks', 'other']);
const GATHER_TYPE: Record<string, string> = { fishing: 'fishing', exploring: 'explore', mining: 'mining' };
const GATHER_VERB: Record<string, string> = { fishing: 'casts', explore: 'explores', mining: 'digs' };

// Materials that refill on their own (farm buildings, daily resets)
export const PASSIVE_MATERIALS = new Set([...PASSIVE_INPUTS, 'Coal', 'Eggs', 'Milk', 'Feathers']);

export const MILESTONE_PTS = [10, 100] as const;

export interface Progress { level: number; count: number }

function targetFor(level: number) { return level === 0 ? 10_000 : 100_000; }
function ptsFor(level: number) { return level === 0 ? 10 : 100; }

// Ascension Points earned by adding `added` to an item's mastery count
function pointsCrossed({ level, count }: Progress, added: number): number {
  let pts = 0;
  if (level < 1 && count + added >= 10_000) pts += 10;
  if (level < 2 && count + added >= 100_000) pts += 100;
  return pts;
}

export interface ChainStep {
  item: string;
  method: string;
  how: 'craft' | 'gather';
  added: number;        // units crafted/gathered for this plan
  difficulty: number;   // your mastery ranking (1 easy – 10 expert)
  depth: number;        // crafted links: steps below the root (1 = direct ingredient)
  progress: Progress;
  pts: number;          // AP this step crosses
}

export interface Material { item: string; need: number; have: number; short: number; passive: boolean }

export interface CraftPlan {
  kind: 'craft';
  item: string;
  method: string;
  difficulty: number;
  progress: Progress;
  target: number;
  remaining: number;
  pts: number;
  chain: ChainStep[];       // other masteries that progress along the way
  totalPts: number;         // root + chain milestones
  ease: number;             // hardest ranking among the masteries you craft (root + crafted links)
  materials: Material[];    // raw materials, most short first
  coverage: number;         // 0–1: share of the plan current inventory covers
  readyNow: number;         // root crafts possible right now
}

export interface GatherPlan {
  kind: 'gather';
  item: string;
  method: string;
  difficulty: number;
  progress: Progress;
  target: number;
  remaining: number;
  pts: number;
  location: string | null;
  effort: number;           // attempts, or grows for crops
  minutes?: number;         // crops: total grow time
  effortLabel: string;
}

export interface PlanInput {
  masteryLevels: Record<string, number>;
  masteryProgress: Record<string, number>;
  inventory: Record<string, number>;
  cropTimes: CropTime[];
  plotCount: number;
}

function progressOf(item: string, input: PlanInput): Progress {
  return { level: input.masteryLevels[item] ?? 0, count: input.masteryProgress[item] ?? 0 };
}

// An item whose mastery still has an AP milestone ahead
function earnsAp(item: string, input: PlanInput): boolean {
  return masteryByName.has(item) && (input.masteryLevels[item] ?? 0) < 2;
}

function planCraft(m: Mastery, input: PlanInput): CraftPlan | null {
  const progress = progressOf(m.name, input);
  const target = targetFor(progress.level);
  const remaining = Math.max(0, target - progress.count);

  const invLeft = new Map<string, number>();
  const takeInv = (item: string, want: number) => {
    const left = invLeft.has(item) ? invLeft.get(item)! : (input.inventory[item] ?? 0);
    const took = Math.min(left, want);
    invLeft.set(item, left - took);
    return took;
  };
  const crafted = new Map<string, number>();
  const depth = new Map<string, number>();
  const raw = new Map<string, number>();

  const expand = (item: string, units: number, seen: Set<string>) => {
    const recipe = recipeByName.get(item.toLowerCase());
    if (!recipe) return;
    const nextSeen = new Set(seen).add(item);
    for (const { item: ing, quantity } of recipe.ingredients) {
      const need = quantity * units;
      const ingRecipe = recipeByName.get(ing.toLowerCase());
      if (ingRecipe && !nextSeen.has(ing) && earnsAp(ing, input)) {
        // Chain link: craft it fresh so its own mastery moves too
        crafted.set(ing, (crafted.get(ing) ?? 0) + need);
        depth.set(ing, Math.max(depth.get(ing) ?? 0, nextSeen.size));
        expand(ing, need, nextSeen);
      } else if (ingRecipe && !nextSeen.has(ing)) {
        const fromInv = takeInv(ing, need);
        if (need > fromInv) expand(ing, need - fromInv, nextSeen);
      } else {
        raw.set(ing, (raw.get(ing) ?? 0) + need);
      }
    }
  };
  expand(m.name, remaining, new Set());
  if (remaining > 0 && raw.size === 0 && crafted.size === 0) return null;

  const materials: Material[] = [...raw.entries()].map(([item, need]) => {
    const have = Math.min(need, takeInv(item, need));
    return { item, need, have, short: need - have, passive: PASSIVE_MATERIALS.has(item) };
  });
  materials.sort((a, b) => (b.short / b.need) - (a.short / a.need) || b.short - a.short);

  // Inventory caps how many root crafts can happen right now: the scarcest material
  const coverage = remaining === 0 ? 1 : materials.reduce((min, mat) => Math.min(min, mat.have / mat.need), 1);

  const chain: ChainStep[] = [];
  for (const [item, added] of crafted) {
    const p = progressOf(item, input);
    const im = masteryByName.get(item)!;
    chain.push({ item, method: im.method, how: 'craft', added, difficulty: im.difficulty, depth: depth.get(item)!, progress: p, pts: pointsCrossed(p, added) });
  }
  // Raw materials you still have to gather that are masteries themselves (fish, crops, ores…)
  for (const mat of materials) {
    if (mat.short > 0 && earnsAp(mat.item, input)) {
      const p = progressOf(mat.item, input);
      const im = masteryByName.get(mat.item)!;
      chain.push({ item: mat.item, method: im.method, how: 'gather', added: mat.short, difficulty: im.difficulty, depth: 0, progress: p, pts: pointsCrossed(p, mat.short) });
    }
  }
  chain.sort((a, b) => b.pts - a.pts || b.added - a.added);

  const pts = ptsFor(progress.level);
  return {
    kind: 'craft',
    item: m.name,
    method: m.method,
    difficulty: m.difficulty,
    progress,
    target,
    remaining,
    pts,
    chain,
    totalPts: pts + chain.reduce((sum, s) => sum + s.pts, 0),
    ease: Math.max(m.difficulty, ...chain.filter((s) => s.how === 'craft').map((s) => s.difficulty)),
    materials,
    coverage,
    readyNow: Math.min(remaining, Math.floor(coverage * remaining)),
  };
}

function planGather(m: Mastery, input: PlanInput, cropMinutes: Map<string, number>): GatherPlan | null {
  const progress = progressOf(m.name, input);
  const target = targetFor(progress.level);
  const remaining = Math.max(0, target - progress.count);
  const base = { kind: 'gather' as const, item: m.name, method: m.method, difficulty: m.difficulty, progress, target, remaining, pts: ptsFor(progress.level) };

  if (m.method === 'farming') {
    const minutes = cropMinutes.get(m.name);
    if (minutes == null || input.plotCount <= 0) return null;
    const grows = Math.ceil(remaining / input.plotCount);
    return { ...base, location: 'Farm', effort: grows, minutes: grows * minutes, effortLabel: `${grows.toLocaleString()} grows` };
  }
  const type = GATHER_TYPE[m.method];
  if (!type) return null;
  let best: { name: string; rate: number } | null = null;
  for (const loc of itemLocations[m.name] ?? []) {
    if (loc.type === type && loc.rate && (!best || loc.rate < best.rate)) best = { name: loc.name, rate: loc.rate };
  }
  if (!best) return null;
  const attempts = Math.ceil(remaining * best.rate);
  return { ...base, location: best.name, effort: attempts, effortLabel: `${attempts.toLocaleString()} ${GATHER_VERB[type]}` };
}

export function buildMilestonePlan(input: PlanInput) {
  const cropMinutes = new Map(input.cropTimes.map((c) => [c.item, c.growMinutes]));
  const crafts: CraftPlan[] = [];
  const gathers: GatherPlan[] = [];
  for (const m of masteries) {
    if ((input.masteryLevels[m.name] ?? 0) >= 2) continue;
    if (CRAFT_METHODS.has(m.method) && recipeByName.has(m.name.toLowerCase())) {
      const plan = planCraft(m, input);
      if (plan) crafts.push(plan);
    } else {
      const plan = planGather(m, input, cropMinutes);
      if (plan) gathers.push(plan);
    }
  }
  return { crafts, gathers };
}

// ── Craftworks guide for a location ─────────────────────────────────────────
// Lines worth running while you farm one location: crafting/steelworks masteries
// with an AP milestone ahead whose raw materials drop there, easiest (by your
// ranking) first. A chain's crafted links get their own slot, set up first, since
// each Craftworks line only makes one item.

export interface GuideSlot {
  item: string;
  difficulty: number;
  progress: Progress;
  target: number;
  feeds?: string;            // chain link: this line's output goes into that line
  plan?: CraftPlan;          // root lines only
  fromHere: string[];        // short materials that drop at this location
  elsewhere: string[];       // short materials you'll have to get somewhere else
  attempts: number;          // attempts here to cover the short materials that drop here
}

export interface LocationGuide {
  slots: GuideSlot[];
  gathers: { item: string; difficulty: number; progress: Progress; target: number; rate: number; attempts: number }[];
}

const CRAFTWORKS_METHODS = new Set(['crafting', 'steelworks']);
// Attempts past which a line is a long-term project rather than something to run on this trip
export const LONG_HAUL = 50_000;
// A location counts as a source for a material when its drop rate is within this factor of the best one
const GOOD_SOURCE = 2;

export function buildLocationGuide(location: string, input: PlanInput, crafts: CraftPlan[], slotCount: number): LocationGuide {
  const rateHere = new Map<string, number>();
  const gathers: LocationGuide['gathers'] = [];
  for (const [item, locs] of Object.entries(itemLocations)) {
    const here = locs.find((l) => l.name === location && l.rate);
    if (!here) continue;
    // Only count it as this location's material when here is a sensible place to get it
    const best = Math.min(...locs.filter((l) => l.rate).map((l) => l.rate!));
    if (here.rate! <= best * GOOD_SOURCE) rateHere.set(item, here.rate!);
    const m = masteryByName.get(item);
    if (m && earnsAp(item, input)) {
      const progress = progressOf(item, input);
      const target = targetFor(progress.level);
      gathers.push({ item, difficulty: m.difficulty, progress, target, rate: here.rate!, attempts: Math.ceil(Math.max(0, target - progress.count) * here.rate!) });
    }
  }
  gathers.sort((a, b) => a.attempts - b.attempts);
  // Rare drops (Runestones…) would take millions of attempts, so leave them out
  const nearGathers = gathers.filter((g) => g.attempts <= 1_000_000);

  const group = (c: { elsewhere: string[]; attempts: number }) => (c.elsewhere.length > 0 ? 2 : c.attempts > LONG_HAUL ? 1 : 0);
  const candidates = crafts
    .filter((p) => CRAFTWORKS_METHODS.has(p.method) && !CRAFTWORKS_SKIP.has(p.item) && p.remaining > 0)
    .map((p) => {
      const usesHere = p.materials.some((mat) => !mat.passive && rateHere.has(mat.item));
      const short = p.materials.filter((mat) => mat.short > 0 && !mat.passive);
      const fromHere = short.filter((mat) => rateHere.has(mat.item));
      const elsewhere = short.filter((mat) => !rateHere.has(mat.item)).map((mat) => mat.item);
      const attempts = Math.ceil(Math.max(0, ...fromHere.map((mat) => mat.short * rateHere.get(mat.item)!)));
      return { p, usesHere, fromHere: fromHere.map((mat) => mat.item), elsewhere, attempts };
    })
    .filter((c) => c.usesHere)
    // Lines this location (plus your stock and passive materials) can fully feed in a sensible
    // number of attempts come first, then easiest by your ranking, then the most AP the chain earns
    .sort((a, b) =>
      group(a) - group(b)
      || a.p.ease - b.p.ease
      || b.p.totalPts - a.p.totalPts
      || a.attempts - b.attempts);

  const slots: GuideSlot[] = [];
  const taken = new Set<string>();
  for (const c of candidates) {
    const links = c.p.chain.filter((s) => s.how === 'craft' && !taken.has(s.item) && CRAFTWORKS_METHODS.has(s.method));
    if (taken.has(c.p.item) || slots.length + 1 + links.length > slotCount) continue;
    // Deepest links first so each line's input is already being made
    for (const s of [...links].sort((a, b) => b.depth - a.depth)) {
      taken.add(s.item);
      slots.push({ item: s.item, difficulty: s.difficulty, progress: s.progress, target: targetFor(s.progress.level), feeds: c.p.item, fromHere: [], elsewhere: [], attempts: 0 });
    }
    taken.add(c.p.item);
    slots.push({ item: c.p.item, difficulty: masteryByName.get(c.p.item)!.difficulty, progress: c.p.progress, target: c.p.target, plan: c.p, fromHere: c.fromHere, elsewhere: c.elsewhere, attempts: c.attempts });
    if (slots.length >= slotCount) break;
  }
  return { slots, gathers: nearGathers };
}
