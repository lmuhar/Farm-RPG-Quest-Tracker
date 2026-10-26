import masteriesData from './data/masteries.json';
import recipesData from './data/recipes.json';
import { itemLocations } from './data/itemSources';
import { PASSIVE_INPUTS, CRAFTWORKS_SKIP } from './data/passiveMaterials';
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

// ── Craftworks guide for a location ─────────────────────────────────────────
// Lines worth running while you farm one location: crafting/steelworks masteries
// with an AP milestone ahead whose raw materials drop there, easiest (by your
// ranking) first, then chains that need only passive materials in any slots left. Each Craftworks line only makes one item, so every ingredient
// Craftworks can make gets its own slot, set up ahead of the line it feeds: the
// whole chain then runs on passive materials and what you farm here, instead of
// on stock that runs out.

export interface GuideSlot {
  item: string;
  difficulty: number | null; // null for items with no mastery
  progress: Progress | null; // null once there's no AP milestone left
  target: number;
  feeds?: string;            // sub-line: this line's output goes into that line
  source?: 'drops' | 'mastery' | 'passive'; // sub-line: made from drops here, earns AP itself, or runs on passive materials
  plan?: CraftPlan;          // root lines only
  fromHere: string[];        // materials the chain draws from this location's drops
  elsewhere: string[];       // short materials you'll have to get somewhere else
  perThousand: number;       // root crafts each 1,000 attempts here keep fed (Infinity: drops not needed)
}

export interface LocationGuide {
  slots: GuideSlot[];
  gathers: { item: string; difficulty: number; progress: Progress; target: number; rate: number; attempts: number }[];
}

const CRAFTWORKS_METHODS = new Set(['crafting', 'steelworks']);
// A location counts as a source for a material when its drop rate is within this factor of the best one
const GOOD_SOURCE = 2;

// Craftworks can make it: a crafting/steelworks mastery, or a non-mastery recipe that isn't cooked
function craftworksCan(item: string): boolean {
  const m = masteryByName.get(item);
  if (m) return CRAFTWORKS_METHODS.has(m.method);
  const r = recipeByName.get(item.toLowerCase());
  return !!r && !r.ingredients.some((i) => i.item.toLowerCase() === 'cooking pot');
}

// Drop rates at a location, for the items it's a sensible place to get
// (within GOOD_SOURCE of their best rate anywhere)
const sourceRates = new Map<string, Map<string, number>>();
function ratesAt(location: string): Map<string, number> {
  let rates = sourceRates.get(location);
  if (rates) return rates;
  rates = new Map();
  for (const [item, locs] of Object.entries(itemLocations)) {
    const here = locs.find((l) => l.name === location && l.rate);
    if (!here) continue;
    const best = Math.min(...locs.filter((l) => l.rate).map((l) => l.rate!));
    if (here.rate! <= best * GOOD_SOURCE) rates.set(item, here.rate!);
  }
  sourceRates.set(location, rates);
  return rates;
}

export function buildLocationGuide(location: string, input: PlanInput, crafts: CraftPlan[], slotCount: number): LocationGuide {
  const rateHere = ratesAt(location);
  const gathers: LocationGuide['gathers'] = [];
  for (const [item, locs] of Object.entries(itemLocations)) {
    const here = locs.find((l) => l.name === location && l.rate);
    if (!here) continue;
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

  const isHereDrop = (item: string) => rateHere.has(item) && !PASSIVE_MATERIALS.has(item);
  // Whether an item's recipe tree uses anything farmed here
  const touches = new Map<string, boolean>();
  const touchesHere = (item: string, seen = new Set<string>()): boolean => {
    if (touches.has(item)) return touches.get(item)!;
    const recipe = recipeByName.get(item.toLowerCase());
    if (!recipe || seen.has(item)) return false;
    const next = new Set(seen).add(item);
    const result = recipe.ingredients.some((i) => isHereDrop(i.item) || touchesHere(i.item, next));
    touches.set(item, result);
    return result;
  };

  // Expand a root into its Craftworks sub-lines and the raw materials they all draw on
  const expandRoot = (p: CraftPlan) => {
    const subLines = new Map<string, { depth: number; feeds: string; source: NonNullable<GuideSlot['source']> }>();
    const raw = new Map<string, number>();
    const invLeft = new Map<string, number>();
    const takeInv = (item: string, want: number) => {
      const left = invLeft.get(item) ?? (input.inventory[item] ?? 0);
      const took = Math.min(left, want);
      invLeft.set(item, left - took);
      return took;
    };
    const expand = (item: string, units: number, seen: Set<string>) => {
      const recipe = recipeByName.get(item.toLowerCase());
      if (!recipe) return;
      const next = new Set(seen).add(item);
      for (const { item: ing, quantity } of recipe.ingredients) {
        const need = quantity * units;
        const ingRecipe = recipeByName.get(ing.toLowerCase());
        if (ingRecipe && !next.has(ing) && craftworksCan(ing)) {
          // Its own line, made fresh so the chain never waits on stock
          const prev = subLines.get(ing);
          const source = touchesHere(ing) ? 'drops' : earnsAp(ing, input) ? 'mastery' : 'passive';
          subLines.set(ing, { depth: Math.max(prev?.depth ?? 0, next.size), feeds: prev?.feeds ?? item, source });
          expand(ing, need, next);
        } else if (ingRecipe && !next.has(ing)) {
          const fromInv = takeInv(ing, need);
          if (need > fromInv) expand(ing, need - fromInv, next);
        } else {
          raw.set(ing, (raw.get(ing) ?? 0) + need);
        }
      }
    };
    expand(p.item, p.remaining, new Set());
    const here = [...raw].filter(([item]) => isHereDrop(item));
    // Every drop comes from the same attempts, so the slowest one sets the pace
    const perCraft = Math.max(0, ...here.map(([item, need]) => (need / p.remaining) * rateHere.get(item)!));
    return {
      p,
      subLines,
      usesHere: here.length > 0,
      fromHere: here.map(([item]) => item),
      elsewhere: [...raw]
        .filter(([item, need]) => !PASSIVE_MATERIALS.has(item) && !rateHere.has(item) && need > takeInv(item, need))
        .map(([item]) => item),
      perThousand: perCraft > 0 ? 1000 / perCraft : Infinity,
    };
  };

  const lines = crafts
    .filter((p) => CRAFTWORKS_METHODS.has(p.method) && !CRAFTWORKS_SKIP.has(p.item) && p.remaining > 0)
    .map(expandRoot);
  const candidates = lines
    .filter((c) => c.usesHere)
    // Chains this location and passive materials can fully feed come first, then easiest by
    // your ranking, then the most AP the chain earns, then the most crafts per attempt
    .sort((a, b) =>
      Number(a.elsewhere.length > 0) - Number(b.elsewhere.length > 0)
      || a.p.ease - b.p.ease
      || b.p.totalPts - a.p.totalPts
      || b.perThousand - a.perThousand);

  const slotFor = (item: string): Pick<GuideSlot, 'difficulty' | 'progress' | 'target'> => {
    const m = masteryByName.get(item);
    const progress = m && earnsAp(item, input) ? progressOf(item, input) : null;
    return { difficulty: m?.difficulty ?? null, progress, target: progress ? targetFor(progress.level) : 0 };
  };

  // Slots this location can't fill go to chains that run on passive materials alone: they
  // keep building while the passive materials refill, most AP first (until 100k)
  const passiveOnly = lines
    .filter((c) => !c.usesHere && c.elsewhere.length === 0 && c.p.materials.every((m) => m.passive || m.short === 0))
    .sort((a, b) => b.p.totalPts - a.p.totalPts || a.p.ease - b.p.ease);

  const slots: GuideSlot[] = [];
  const taken = new Set<string>();
  for (const c of [...candidates, ...passiveOnly]) {
    const links = [...c.subLines].filter(([item]) => !taken.has(item));
    if (taken.has(c.p.item) || slots.length + 1 + links.length > slotCount) continue;
    // Deepest lines first so each line's input is already being made
    for (const [item, { feeds, source }] of links.sort((a, b) => b[1].depth - a[1].depth)) {
      taken.add(item);
      slots.push({ item, ...slotFor(item), feeds, source, fromHere: [], elsewhere: [], perThousand: Infinity });
    }
    taken.add(c.p.item);
    slots.push({ item: c.p.item, ...slotFor(c.p.item), plan: c.p, fromHere: c.fromHere, elsewhere: c.elsewhere, perThousand: c.perThousand });
    if (slots.length >= slotCount) break;
  }
  return { slots, gathers: nearGathers };
}

// ── Where to farm ───────────────────────────────────────────────────────────
// Staying at one location feeds every chain that uses its drops at once: two
// chains that both need Hide add their Hide together, but a chain that needs
// Hide and one that needs Feathers share the same attempts. So for a location
// this picks milestones up in the order that adds the most AP per extra
// attempt, with inventory shared across all of them, and says how many attempts
// in each one is done. Chains only count when this location, your crops and
// passive materials (plus stock) cover everything they need.

export interface LadderStep {
  item: string;
  kind: 'craft' | 'gather';
  difficulty: number;       // your ranking (for crafts: the hardest step in the chain)
  pts: number;              // AP this step adds that earlier steps haven't already crossed
  also: string[];           // other milestones it crosses on the way
  attempts: number;         // attempts here by the time it's done (all steps so far)
  crops: number;            // crops to grow by then (all steps so far)
  grow: string[];           // crops this step needs
  plan: CraftPlan | GatherPlan;
}

export interface FarmLadder { location: string; type: string; steps: LadderStep[] }

const LADDER_MAX_ATTEMPTS = 2_000_000;
const LADDER_MAX_STEPS = 25;

interface LadderCandidate {
  plan: CraftPlan | GatherPlan;
  ease: number;
  craftNeed: [string, number][]; // drops here (and crops) the chain uses up
  gatherNeed?: number;           // gathering mastery: fresh drops of plan.item it needs
  milestones: [string, number][];
}

export function buildFarmLadder(location: string, type: string, input: PlanInput, crafts: CraftPlan[], gathers: GatherPlan[]): FarmLadder {
  const rates = ratesAt(location);
  const isCrop = (item: string) => masteryByName.get(item)?.method === 'farming';
  const candidates: LadderCandidate[] = [];

  for (const p of crafts) {
    if (p.remaining === 0) continue;
    let usesHere = false;
    let fits = true;
    const need: [string, number][] = [];
    for (const mat of p.materials) {
      if (mat.passive) continue;
      if (rates.has(mat.item)) {
        need.push([mat.item, mat.need]);
        if (mat.short > 0) usesHere = true;
      } else if (isCrop(mat.item)) {
        need.push([mat.item, mat.need]);
      } else if (mat.short > 0) {
        fits = false;
        break;
      }
    }
    if (!fits || !usesHere) continue;
    const milestones: [string, number][] = [[p.item, p.pts], ...p.chain.filter((s) => s.pts > 0).map((s): [string, number] => [s.item, s.pts])];
    candidates.push({ plan: p, ease: p.ease, craftNeed: need, milestones });
  }
  for (const g of gathers) {
    if (g.location == null || !rates.has(g.item) || GATHER_TYPE[g.method] !== type) continue;
    candidates.push({ plan: g, ease: g.difficulty, craftNeed: [], gatherNeed: g.remaining, milestones: [[g.item, g.pts]] });
  }

  // Shared state: what every chosen step uses up, and the AP already crossed
  const craftNeed = new Map<string, number>();
  const gatherNeed = new Map<string, number>();
  const crossed = new Map<string, number>();
  let attempts = 0;
  let cropUnits = 0;

  // Fresh drops an item needs: gathering masteries count new drops, crafts use stock first
  const units = (item: string, craft: number, gather: number) => Math.max(gather, craft - (input.inventory[item] ?? 0), 0);
  const costOf = (c: LadderCandidate) => {
    let att = attempts;
    let crop = cropUnits;
    const touch = (item: string, addCraft: number, addGather: number) => {
      const before = units(item, craftNeed.get(item) ?? 0, gatherNeed.get(item) ?? 0);
      const after = units(item, (craftNeed.get(item) ?? 0) + addCraft, Math.max(gatherNeed.get(item) ?? 0, addGather));
      if (rates.has(item)) att = Math.max(att, Math.ceil(after * rates.get(item)!));
      else crop += after - before;
    };
    for (const [item, n] of c.craftNeed) touch(item, n, 0);
    if (c.gatherNeed != null) touch(c.plan.item, 0, c.gatherNeed);
    return { att, crop };
  };
  const gainOf = (c: LadderCandidate) => c.milestones.reduce((sum, [item, pts]) => sum + Math.max(0, pts - (crossed.get(item) ?? 0)), 0);

  const steps: LadderStep[] = [];
  let pool = candidates;
  while (steps.length < LADDER_MAX_STEPS) {
    let best: { c: LadderCandidate; gain: number; att: number; crop: number; ratio: number } | null = null;
    const next: LadderCandidate[] = [];
    for (const c of pool) {
      const gain = gainOf(c);
      if (gain === 0) continue;
      const { att, crop } = costOf(c);
      if (att > LADDER_MAX_ATTEMPTS) continue;
      next.push(c);
      const ratio = gain / Math.max(1, att - attempts + crop - cropUnits);
      if (!best || ratio > best.ratio || (ratio === best.ratio && c.ease < best.c.ease)) best = { c, gain, att, crop, ratio };
    }
    if (!best) break;
    const { c } = best;
    for (const [item, n] of c.craftNeed) craftNeed.set(item, (craftNeed.get(item) ?? 0) + n);
    if (c.gatherNeed != null) gatherNeed.set(c.plan.item, Math.max(gatherNeed.get(c.plan.item) ?? 0, c.gatherNeed));
    const also = c.milestones.filter(([item, pts]) => item !== c.plan.item && pts > (crossed.get(item) ?? 0)).map(([item]) => item);
    for (const [item, pts] of c.milestones) crossed.set(item, Math.max(crossed.get(item) ?? 0, pts));
    attempts = best.att;
    cropUnits = best.crop;
    const grow = c.craftNeed.filter(([item]) => !rates.has(item)).map(([item]) => item);
    steps.push({ item: c.plan.item, kind: c.plan.kind, difficulty: c.ease, pts: best.gain, also, attempts, crops: cropUnits, grow, plan: c.plan });
    pool = next.filter((n) => n !== c);
  }
  return { location, type, steps };
}

// AP a ladder reaches within a number of attempts
export function apWithin(ladder: FarmLadder, budget: number): number {
  return ladder.steps.filter((s) => s.attempts <= budget).reduce((sum, s) => sum + s.pts, 0);
}
