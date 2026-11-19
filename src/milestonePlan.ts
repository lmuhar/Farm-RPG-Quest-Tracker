import masteriesData from './data/masteries.json';
import recipesData from './data/recipes.json';
import { itemLocations } from './data/itemSources';
import { PASSIVE_INPUTS } from './data/passiveMaterials';
import type { CropTime } from './types';

// Plans the next 10k / 100k mastery milestones (10 and 100 Ascension Points)
// by the farming each one takes: inventory is only a head start, since no
// milestone fits under the inventory cap, so every shortfall is turned into
// attempts at its best location (and grows for crops). Crafted
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
export const GATHER_VERB: Record<string, string> = { fishing: 'casts', explore: 'explores', mining: 'digs' };

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

// One farming location a plan's short materials drop at. They all drop from the same
// attempts, so the scarcest one sets the count.
export interface FarmStop { location: string; type: string; attempts: number; items: string[] }

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
  farm: FarmStop[];         // where the short materials drop, most attempts first
  crops: string[];          // short materials you grow
  grows: number;            // grows for all of them on your plots
  other: string[];          // short materials with no drop or crop (shops, rewards…)
  attempts: number;         // farming cost: attempts at every stop, plus one per crop
  apPerThousand: number;    // totalPts per 1,000 attempts (Infinity: passive materials and stock cover it)
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

// Best place to farm an item by spending attempts, or null for crops, shops and the like
const RUN_TYPES = new Set(Object.values(GATHER_TYPE));
function bestRunLocation(item: string): { name: string; type: string; rate: number } | null {
  let best: { name: string; type: string; rate: number } | null = null;
  for (const loc of itemLocations[item] ?? []) {
    if (RUN_TYPES.has(loc.type) && loc.rate && (!best || loc.rate < best.rate)) best = { name: loc.name, type: loc.type, rate: loc.rate };
  }
  return best;
}

function planCraft(m: Mastery, input: PlanInput, crops: Set<string>): CraftPlan | null {
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

  // What farming the shortfall takes
  const stops = new Map<string, FarmStop>();
  const cropNeeds: string[] = [];
  const other: string[] = [];
  let cropUnits = 0;
  for (const mat of materials) {
    if (mat.short === 0 || mat.passive) continue;
    const best = bestRunLocation(mat.item);
    if (best) {
      const stop = stops.get(best.name) ?? { location: best.name, type: best.type, attempts: 0, items: [] };
      stop.attempts = Math.max(stop.attempts, Math.ceil(mat.short * best.rate));
      stop.items.push(mat.item);
      stops.set(best.name, stop);
    } else if (crops.has(mat.item)) {
      cropNeeds.push(mat.item);
      cropUnits += mat.short;
    } else {
      other.push(mat.item);
    }
  }
  const farm = [...stops.values()].sort((a, b) => b.attempts - a.attempts);
  // A crop counts as one attempt: roughly one item per plot per grow
  const attempts = farm.reduce((sum, s) => sum + s.attempts, 0) + cropUnits;

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
  const totalPts = pts + chain.reduce((sum, s) => sum + s.pts, 0);
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
    totalPts,
    ease: Math.max(m.difficulty, ...chain.filter((s) => s.how === 'craft').map((s) => s.difficulty)),
    materials,
    farm,
    crops: cropNeeds,
    grows: input.plotCount > 0 ? Math.ceil(cropUnits / input.plotCount) : 0,
    other,
    attempts,
    apPerThousand: attempts > 0 ? (totalPts * 1000) / attempts : Infinity,
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
  const crops = new Set(masteries.filter((m) => m.method === 'farming').map((m) => m.name));
  const crafts: CraftPlan[] = [];
  const gathers: GatherPlan[] = [];
  for (const m of masteries) {
    if ((input.masteryLevels[m.name] ?? 0) >= 2) continue;
    if (CRAFT_METHODS.has(m.method) && recipeByName.has(m.name.toLowerCase())) {
      const plan = planCraft(m, input, crops);
      if (plan) crafts.push(plan);
    } else {
      const plan = planGather(m, input, cropMinutes);
      if (plan) gathers.push(plan);
    }
  }
  return { crafts, gathers };
}
