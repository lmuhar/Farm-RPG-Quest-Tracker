import { useState, useMemo } from 'react';
import type { Quest } from '../types';
import { compareQuests, getQuestStatus, parseItems } from '../utils';
import { useStore } from '../store';
import { CraftworksSuggestions } from './CraftworksSuggestions';
import type { DirectItem } from './CraftworksSuggestions';
import questsData from '../data/quests.json';
import masteriesData from '../data/masteries.json';
import itemLocationsData from '../data/item-locations.json';
import recipesData from '../data/recipes.json';
import { RARE_ITEMS, PET_ONLY_ITEMS, isFarmableItem } from '../data/bottlenecks';
import { resolveRawIngredients } from '../utils';
import { Fish, AlertTriangle, TrendingUp, Compass, Link2 } from 'lucide-react';

const allQuestsData = questsData as Quest[];

interface Mastery { name: string; difficulty: number; method: string }
const allMasteries = masteriesData as Mastery[];
const craftingMasteries = allMasteries.filter((m) => m.method === 'crafting');

const fishingMasteryNames = new Set(
  allMasteries.filter((m) => m.method === 'fishing').map((m) => m.name)
);

const itemLocations = itemLocationsData as Record<string, { name: string; type: string }[]>;

// Fishing spot → list of fish that have a mastery, ranked by most mastery fish
const fishingSpots: { spot: string; fish: string[] }[] = (() => {
  const spotMap = new Map<string, string[]>();
  for (const [item, sources] of Object.entries(itemLocations)) {
    if (!fishingMasteryNames.has(item)) continue;
    for (const src of sources) {
      if (src.type !== 'fishing') continue;
      if (!spotMap.has(src.name)) spotMap.set(src.name, []);
      spotMap.get(src.name)!.push(item);
    }
  }
  return [...spotMap.entries()]
    .map(([spot, fish]) => ({ spot, fish }))
    .sort((a, b) => b.fish.length - a.fish.length);
})();

// Crafting masteries using only passive inputs (Wood, Stone, Nails, Straw, Iron, Worms, Grubs, Minnows)
const PASSIVE_100K_NAMES = [
  'Awl', 'Board', 'Broom', 'Bucket', 'Butter Churn', 'Chum',
  'Fancy Pipe', 'Horseshoe', 'Iron Cup', 'Iron Ring',
  'Ladder', 'Nailed Board', 'Rope',
  'Sturdy Box', 'Sturdy Shield',
  'Treasure Chest', 'Twine',
  'Wagon Wheel', 'Wooden Barrel', 'Wooden Box', 'Wooden Button',
  'Wooden Plank', 'Wooden Shield', 'Wooden Sword', 'Wooden Table', 'Yarn',
] as const;

const PASSIVE_MASTERY_ITEMS: { name: string; difficulty: number }[] = [
  { name: 'Board',        difficulty: 1 },
  { name: 'Broom',        difficulty: 1 },
  { name: 'Ladder',       difficulty: 1 },
  { name: 'Nailed Board', difficulty: 1 },
  { name: 'Rope',         difficulty: 1 },
  { name: 'Twine',        difficulty: 1 },
  { name: 'Wooden Plank', difficulty: 1 },
  { name: 'Yarn',         difficulty: 1 },
  { name: 'Wagon Wheel',  difficulty: 2 },
  { name: 'Wooden Box',   difficulty: 2 },
  { name: 'Wooden Table', difficulty: 2 },
];

interface RawRecipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const allRawRecipes = recipesData as RawRecipe[];
const rawRecipeMap = new Map<string, RawRecipe>(allRawRecipes.map((r) => [r.name.toLowerCase(), r]));

// Auto-regenerating materials — no dedicated farming trip needed for these
const PASSIVE_BASE_MATERIALS = new Set(['Wood', 'Stone', 'Nails', 'Straw', 'Iron', 'Worms', 'Grubs', 'Minnows']);

// Every crafting mastery with a known recipe — the resolvable set for material/location guidance
const CRAFTABLE_MASTERY_NAMES = craftingMasteries
  .filter((m) => rawRecipeMap.has(m.name.toLowerCase()))
  .map((m) => m.name);
const craftDifficultyMap = new Map<string, number>(craftingMasteries.map((m) => [m.name, m.difficulty]));

// Per-unit raw material breakdown for every craftable crafting mastery, reduced all
// the way down to terminal (non-craftable) ingredients — location drops, mined
// items, pet loot, whatever the recipe chain bottoms out at.
const CRAFTING_RAW_INPUTS = new Map<string, Map<string, number>>(
  CRAFTABLE_MASTERY_NAMES.map((name) => [name, resolveRawIngredients(name, 1, rawRecipeMap)])
);

type CraftworksTab = 'active' | 'focus' | 'mastery' | 'fishing' | 'passive' | 'push10k' | 'chains' | 'passive1m' | 'ascension';

const nextMilestone = (level: number) => (level === 0 ? 10_000 : level === 1 ? 100_000 : 1_000_000);
const milestoneLabel = (level: number) => (level === 0 ? '10k' : level === 1 ? '100k' : '1M');

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function CraftworksPage({ activeQuests, nextUpQuests }: Props) {
  const [tab, setTab] = useState<CraftworksTab>('active');
  const { trackedQuestline, player, questStatuses, masteryLevels, masteryProgress, inventoryMax, inventory, cropTimes } = useStore();

  // ── Tab 1: all active quests excluding the focused questline ──────────────
  const activeExFocus = useMemo(
    () => activeQuests.filter((q) => q.questline !== trackedQuestline),
    [activeQuests, trackedQuestline]
  );
  const nextUpExFocus = useMemo(
    () => nextUpQuests.filter((q) => q.questline !== trackedQuestline),
    [nextUpQuests, trackedQuestline]
  );

  // ── Tab 2: quest focus (tracked questline) ────────────────────────────────
  const focusQuests = useMemo(
    () =>
      allQuestsData
        .filter((q) => q.questline === trackedQuestline)
        .sort((a, b) => compareQuests(a.name, b.name)),
    [trackedQuestline]
  );
  const focusQuestsWithStatus = useMemo(
    () => focusQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [focusQuests, player, questStatuses]
  );
  const focusActive = useMemo(
    () => focusQuestsWithStatus.filter(({ status }) => status === 'active').map(({ quest }) => quest),
    [focusQuestsWithStatus]
  );
  const focusUpcoming = useMemo(
    () =>
      focusQuestsWithStatus
        .filter(({ status }) => status !== 'completed' && status !== 'active')
        .map(({ quest }) => quest),
    [focusQuestsWithStatus]
  );

  // ── Focus bottlenecks: rare/pet-only items needed across the entire questline ──
  const focusBottlenecks = useMemo(() => {
    const itemMap = new Map<string, number>();
    const itemQuestCount = new Map<string, number>();
    for (const quest of focusQuests) {
      if (getQuestStatus(quest, player, questStatuses) === 'completed') continue;
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
        itemQuestCount.set(item, (itemQuestCount.get(item) ?? 0) + 1);
      }
    }
    const entries: { item: string; have: number; need: number; location: string; questCount: number }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      if (have >= totalNeeded) continue;
      if (isFarmableItem(item, cropTimes)) continue;
      let location: string | undefined;
      if (RARE_ITEMS.has(item)) location = RARE_ITEMS.get(item)!;
      else if (PET_ONLY_ITEMS.has(item)) location = 'Pet drops';
      else continue;
      entries.push({ item, have, need: totalNeeded, location, questCount: itemQuestCount.get(item) ?? 1 });
    }
    return entries.sort((a, b) => b.questCount - a.questCount).slice(0, 10);
  }, [focusQuests, player, questStatuses, inventory, cropTimes]);

  // ── Tab 3: mastery crafting suggestions ───────────────────────────────────
  const masteryDirectItems = useMemo((): DirectItem[] => {
    const sorted = [...craftingMasteries].sort((a, b) => {
      const lvA = masteryLevels[a.name] ?? 0;
      const lvB = masteryLevels[b.name] ?? 0;
      const inA = lvA > 0 && lvA < 3 ? 1 : 0;
      const inB = lvB > 0 && lvB < 3 ? 1 : 0;
      if (inA !== inB) return inB - inA;
      if (inA && inB && lvA !== lvB) return lvB - lvA;
      return a.difficulty - b.difficulty;
    });

    return sorted
      .filter((m) => (masteryLevels[m.name] ?? 0) < 3)
      .map((m) => {
        const lv = masteryLevels[m.name] ?? 0;
        const label =
          lv === 2 ? '→ Mega Master'
          : lv === 1 ? '→ Grand Master'
          : `diff ${m.difficulty}`;
        return {
          item: m.name,
          quantity: inventoryMax,
          label,
          priority: lv > 0 ? 'active' : 'nextup',
        };
      });
  }, [masteryLevels, inventoryMax]);

  // ── Tab 4: fishing spot recommendation ────────────────────────────────────
  const fishingRanking = useMemo(() =>
    fishingSpots
      .map(({ spot, fish }) => ({
        spot,
        unmastered: fish.filter((f) => (masteryLevels[f] ?? 0) < 3),
      }))
      .filter(({ unmastered }) => unmastered.length > 0)
      .sort((a, b) => b.unmastered.length - a.unmastered.length),
    [masteryLevels]
  );

  // ── Tab 5: passive wood/board crafting masteries ───────────────────────────
  const passiveMasteryItems = useMemo((): DirectItem[] => {
    const sorted = [...PASSIVE_MASTERY_ITEMS].sort((a, b) => {
      const lvA = masteryLevels[a.name] ?? 0;
      const lvB = masteryLevels[b.name] ?? 0;
      const inA = lvA > 0 && lvA < 3 ? 1 : 0;
      const inB = lvB > 0 && lvB < 3 ? 1 : 0;
      if (inA !== inB) return inB - inA;
      if (inA && inB && lvA !== lvB) return lvB - lvA;
      return a.difficulty - b.difficulty;
    });
    return sorted
      .filter((m) => (masteryLevels[m.name] ?? 0) < 3)
      .map((m) => {
        const lv = masteryLevels[m.name] ?? 0;
        const label =
          lv === 2 ? '→ Mega Master'
          : lv === 1 ? '→ Grand Master'
          : `diff ${m.difficulty}`;
        return {
          item: m.name,
          quantity: inventoryMax,
          label,
          priority: lv > 0 ? 'active' : 'nextup',
        };
      });
  }, [masteryLevels, inventoryMax]);

  // ── Tab: 10k push — every craftable crafting mastery under 10k, grouped by
  // closeness to the milestone, then by the farming location that feeds its raw materials ──
  const push10kCandidates = useMemo(() => {
    type Candidate = { item: string; difficulty: number; count: number; pct: number; remaining: number; raw: Map<string, number> };
    const list: Candidate[] = [];
    for (const name of CRAFTABLE_MASTERY_NAMES) {
      const level = masteryLevels[name] ?? 0;
      const count = masteryProgress[name] ?? 0;
      if (level >= 1 || count >= 10_000) continue;
      list.push({
        item: name,
        difficulty: craftDifficultyMap.get(name) ?? 0,
        count,
        pct: Math.min(1, count / 10_000),
        remaining: 10_000 - count,
        raw: CRAFTING_RAW_INPUTS.get(name) ?? new Map<string, number>(),
      });
    }
    return list.sort((a, b) => b.pct - a.pct || a.difficulty - b.difficulty || a.item.localeCompare(b.item));
  }, [masteryLevels, masteryProgress]);

  // Feed straight into the Craftworks slot engine, same as the other mastery tabs
  const push10kDirectItems = useMemo((): DirectItem[] => {
    return push10kCandidates.map(({ item, count, pct, difficulty }) => ({
      item,
      quantity: inventoryMax,
      label: `10k · ${count.toLocaleString()}/10,000 (${Math.round(pct * 100)}% · diff ${difficulty})`,
      priority: count > 0 ? 'active' : 'nextup',
    }));
  }, [push10kCandidates, inventoryMax]);

  // Assign each craftable item to exactly ONE explore location — its best match
  // (the location covering the most of its non-passive raw materials), with ties
  // broken toward whichever tied location has fewer items assigned so far. This
  // spreads items evenly across locations instead of piling everything onto
  // whichever handful of spots happen to stock a common material — otherwise
  // most locations end up showing nearly the same craft list.
  const push10kLocationGroups = useMemo(() => {
    type Candidate = (typeof push10kCandidates)[number];
    const entries: { candidate: Candidate; bestLocs: string[] }[] = [];
    const unlocatedItems: string[] = [];
    for (const c of push10kCandidates) {
      const mats = [...c.raw.keys()].filter((m) => !PASSIVE_BASE_MATERIALS.has(m));
      if (mats.length === 0) continue; // fully passive item, no location needed
      const matLocSets = mats.map(
        (m) => new Set((itemLocations[m] ?? []).filter((l) => l.type === 'explore').map((l) => l.name))
      );
      const allLocs = new Set<string>();
      for (const s of matLocSets) for (const l of s) allLocs.add(l);
      if (allLocs.size === 0) { unlocatedItems.push(c.item); continue; }
      let best = 0;
      const coverage = new Map<string, number>();
      for (const loc of allLocs) {
        const cov = matLocSets.filter((s) => s.has(loc)).length;
        coverage.set(loc, cov);
        if (cov > best) best = cov;
      }
      const bestLocs = [...coverage.entries()].filter(([, cov]) => cov === best).map(([l]) => l).sort();
      entries.push({ candidate: c, bestLocs });
    }
    // Items with fewer good options get first pick of their location
    entries.sort((a, b) => a.bestLocs.length - b.bestLocs.length);
    const countPerLoc = new Map<string, number>();
    const byLocation = new Map<string, Candidate[]>();
    for (const { candidate, bestLocs } of entries) {
      let chosen = bestLocs[0];
      let chosenCount = countPerLoc.get(chosen) ?? 0;
      for (const loc of bestLocs.slice(1)) {
        const cnt = countPerLoc.get(loc) ?? 0;
        if (cnt < chosenCount) { chosen = loc; chosenCount = cnt; }
      }
      countPerLoc.set(chosen, chosenCount + 1);
      if (!byLocation.has(chosen)) byLocation.set(chosen, []);
      byLocation.get(chosen)!.push(candidate);
    }
    const groups = [...byLocation.entries()]
      .map(([name, items]) => {
        const sorted = [...items].sort((a, b) => b.pct - a.pct || a.difficulty - b.difficulty || a.item.localeCompare(b.item));
        const directItems: DirectItem[] = sorted.map(({ item, count, pct, difficulty }) => ({
          item,
          quantity: inventoryMax,
          label: `10k · ${count.toLocaleString()}/10,000 (${Math.round(pct * 100)}% · diff ${difficulty})`,
          priority: count > 0 ? 'active' : 'nextup',
        }));
        return { name, itemCount: items.length, directItems };
      })
      .sort((a, b) => b.itemCount - a.itemCount);
    return { groups, unlocatedItems };
  }, [push10kCandidates, inventoryMax]);

  // ── Tab: crafting chains — masteries whose output is a direct ingredient in
  // another still-in-progress mastery (e.g. Axe → Spoon, Axe → Block of Wood).
  // Stocking up on the intermediate while grinding its own mastery also feeds
  // the downstream one, instead of crafting each from scratch separately.
  const craftChains = useMemo(() => {
    type ChainNode = { item: string; level: number; count: number; pct: number };
    type Chain = { intermediate: ChainNode; products: ChainNode[] };
    const toNode = (item: string): ChainNode => {
      const level = masteryLevels[item] ?? 0;
      const count = masteryProgress[item] ?? 0;
      return { item, level, count, pct: Math.min(1, count / nextMilestone(level)) };
    };
    const chains: Chain[] = [];
    for (const name of CRAFTABLE_MASTERY_NAMES) {
      const level = masteryLevels[name] ?? 0;
      if (level >= 3) continue;
      const products: ChainNode[] = [];
      for (const other of CRAFTABLE_MASTERY_NAMES) {
        if (other === name) continue;
        if ((masteryLevels[other] ?? 0) >= 3) continue;
        const recipe = rawRecipeMap.get(other.toLowerCase());
        if (recipe?.ingredients.some((ing) => ing.item === name)) products.push(toNode(other));
      }
      if (products.length === 0) continue;
      products.sort((a, b) => b.pct - a.pct || a.item.localeCompare(b.item));
      chains.push({ intermediate: toNode(name), products });
    }
    return chains.sort((a, b) => b.products.length - a.products.length || b.intermediate.pct - a.intermediate.pct);
  }, [masteryLevels, masteryProgress]);

  // Feed every item that appears in a chain into the real slot engine — it
  // already detects ingredient→product edges and groups them with a flow arrow.
  const chainDirectItems = useMemo((): DirectItem[] => {
    const seen = new Map<string, DirectItem>();
    const add = (node: { item: string; level: number; count: number; pct: number }) => {
      if (seen.has(node.item)) return;
      seen.set(node.item, {
        item: node.item,
        quantity: inventoryMax,
        label: `${milestoneLabel(node.level)} · ${node.count.toLocaleString()}/${nextMilestone(node.level).toLocaleString()} (${Math.round(node.pct * 100)}%)`,
        priority: node.count > 0 ? 'active' : 'nextup',
      });
    };
    for (const chain of craftChains) {
      add(chain.intermediate);
      for (const p of chain.products) add(p);
    }
    return [...seen.values()];
  }, [craftChains, inventoryMax]);

  // ── Tab 6: passive 1M (Mega Master) — items under 1M mastery, quest-independent ──
  // Past-1M items excluded as primary targets; they can still appear as
  // intermediate ingredients inside CraftworksSuggestions if inventory needs them.
  const passive1mItems = useMemo((): DirectItem[] => {
    type Candidate = { item: string; count: number; level: number; pct: number };
    const candidates: Candidate[] = [];
    for (const name of PASSIVE_100K_NAMES) {
      const level = masteryLevels[name] ?? 0;
      const count = masteryProgress[name] ?? 0;
      if (level >= 3 || count >= 1_000_000) continue;
      candidates.push({ item: name, count, level, pct: Math.min(1, count / 1_000_000) });
    }
    candidates.sort((a, b) => (b.level - a.level) || (b.pct - a.pct));
    return candidates.map(({ item, count, level, pct }) => ({
      item,
      quantity: inventoryMax,
      label: `1M · ${count.toLocaleString()}/1,000,000 (${Math.round(pct * 100)}% · ${(1_000_000 - count).toLocaleString()} left)`,
      priority: level > 0 ? 'active' : 'nextup',
    }));
  }, [masteryProgress, masteryLevels, inventoryMax]);

  // ── Tab 7: ascension points — sorted by tier, then craft difficulty, then % done ──
  const ascensionDirectItems = useMemo((): DirectItem[] => {
    const craftDiff = new Map<string, number>(craftingMasteries.map((m) => [m.name, m.difficulty]));
    type Candidate = { item: string; count: number; target: number; pts: number; pct: number; diff: number; priority: 'active' | 'nextup' };
    const candidates: Candidate[] = [];
    for (const [item, count] of Object.entries(masteryProgress)) {
      const level = masteryLevels[item] ?? 0;
      const diff = craftDiff.get(item) ?? Infinity;
      if (level === 0) candidates.push({ item, count, target: 10_000, pts: 10, pct: Math.min(1, count / 10_000), diff, priority: 'active' });
      else if (level === 1) candidates.push({ item, count, target: 100_000, pts: 100, pct: Math.min(1, count / 100_000), diff, priority: 'nextup' });
    }
    // 10k first, then 100k; within each tier: easiest craft first, then closest to milestone
    candidates.sort((a, b) => a.pts - b.pts || a.diff - b.diff || b.pct - a.pct);
    return candidates.map(({ item, count, target, pts, pct, priority }) => {
      const remaining = target - count;
      const done = count >= target;
      return {
        item,
        quantity: inventoryMax,
        label: done
          ? `+${pts} pts · complete!`
          : `+${pts} pts · ${count.toLocaleString()}/${target.toLocaleString()} (${Math.round(pct * 100)}% · ${remaining.toLocaleString()} left)`,
        priority,
      };
    });
  }, [masteryProgress, masteryLevels, inventoryMax]);

  const tabs: { id: CraftworksTab; label: string; dot?: boolean }[] = [
    { id: 'active',    label: 'All Active' },
    { id: 'focus',     label: 'Quest Focus' },
    { id: 'mastery',   label: 'Mastery' },
    { id: 'fishing',   label: 'Fishing' },
    { id: 'passive',    label: 'Passive' },
    { id: 'push10k',    label: '10k Push', dot: push10kCandidates.length > 0 },
    { id: 'chains',     label: 'Chains', dot: craftChains.length > 0 },
    { id: 'passive1m',  label: 'Passive 1M', dot: passive1mItems.length > 0 },
    { id: 'ascension',  label: 'Ascension Pts', dot: ascensionDirectItems.length > 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="overflow-x-auto">
        <div
          className="flex gap-1 p-1 rounded-lg w-max"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          {tabs.map(({ id, label, dot }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              style={
                tab === id
                  ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                  : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
              }
            >
              {label}
              {dot && tab !== id && (
                <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: 'var(--accent-green)' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1 — all active quests (excluding focus questline) */}
      {tab === 'active' && (
        activeExFocus.length === 0 && nextUpExFocus.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No active quests outside the current quest focus — mark quests active to see suggestions here.
            </p>
          </div>
        ) : (
          <CraftworksSuggestions quests={activeExFocus} nextUpQuests={nextUpExFocus} />
        )
      )}

      {/* Tab 2 — quest focus */}
      {tab === 'focus' && (
        focusActive.length === 0 && focusUpcoming.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All quests in <strong>{trackedQuestline}</strong> are complete — nothing left to craft.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Focus: <span style={{ color: 'var(--text-secondary)' }}>{trackedQuestline}</span>
            </p>
            <CraftworksSuggestions
              quests={focusActive}
              nextUpQuests={focusUpcoming}
              questlineOnly
              subtitle="quest focus · auto-chain order"
            />
            {focusBottlenecks.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-orange-border)' }}
              >
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}>
                  <AlertTriangle size={13} style={{ color: 'var(--accent-orange)' }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-orange)' }}>Bottlenecks</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--accent-orange)', opacity: 0.7 }}>— entire questline</span>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {focusBottlenecks.map(({ item, have, need, location, questCount }) => (
                    <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{location}</span>
                          {questCount > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }}>
                              {questCount} quests
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: have >= need ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                        {have}/{need}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Tab 3 — mastery crafting suggestions */}
      {tab === 'mastery' && (
        masteryDirectItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All craftable masteries are at Mega Master — nothing left to craft.
            </p>
          </div>
        ) : (
          <CraftworksSuggestions
            quests={[]}
            directItems={masteryDirectItems}
            subtitle="mastery priority · in-progress first"
          />
        )
      )}

      {/* Tab 4 — fishing spot recommendation */}
      {tab === 'fishing' && (
        fishingRanking.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All fishing masteries are at Mega Master — nothing left to catch.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Ranked by unmastered fish per spot
            </p>
            {fishingRanking.map(({ spot, unmastered }, i) => (
              <div
                key={spot}
                className="rounded-xl p-4"
                style={{
                  background: 'var(--surface-card)',
                  border: `1px solid ${i === 0 ? 'var(--accent-blue-border)' : 'var(--border-subtle)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Fish size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                      {spot}
                    </span>
                    {i === 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                      >
                        best
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {unmastered.length} remaining
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {unmastered.map((f) => {
                    const lv = masteryLevels[f] ?? 0;
                    return (
                      <span
                        key={f}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: lv > 0 ? 'var(--accent-yellow-bg)' : 'var(--surface-inset)',
                          color: lv > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)',
                          border: `1px solid ${lv > 0 ? 'var(--accent-yellow-border)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        {f}{lv > 0 ? ` ·lv${lv}` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab — 10k push, grouped by closeness, then a mini Craftworks setup per farming location */}
      {tab === 'push10k' && (
        push10kCandidates.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No crafting masteries left under 10k — everything's past the first milestone.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              {push10kCandidates.length} craft{push10kCandidates.length !== 1 ? 's' : ''} under 10k · closest first
            </p>

            <CraftworksSuggestions
              quests={[]}
              directItems={push10kDirectItems}
              noFiller
              subtitle="10k push · closest to done first"
            />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
                By farming location — what to queue after a trip there
              </p>
              {push10kLocationGroups.groups.map((loc) => (
                <div key={loc.name} className="space-y-1.5">
                  <div className="flex items-center gap-2 px-1">
                    <Compass size={13} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>{loc.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {loc.itemCount} item{loc.itemCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <CraftworksSuggestions
                    quests={[]}
                    directItems={loc.directItems}
                    noFiller
                    subtitle={`${loc.name} · 10k push`}
                  />
                </div>
              ))}
              {push10kLocationGroups.unlocatedItems.length > 0 && (
                <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No explore location for: {push10kLocationGroups.unlocatedItems.join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Tab — crafting chains: intermediate masteries that feed another still-in-progress craft */}
      {tab === 'chains' && (
        craftChains.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No stacking opportunities right now — no in-progress craft feeds directly into another.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Craft the intermediate once — it feeds these still-in-progress masteries too, so stock up before moving on
            </p>

            <CraftworksSuggestions
              quests={[]}
              directItems={chainDirectItems}
              noFiller
              subtitle="stacked chains · ingredient before product"
            />

            <div className="space-y-2">
              {craftChains.map((chain) => (
                <div
                  key={chain.intermediate.item}
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link2 size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{chain.intermediate.item}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {milestoneLabel(chain.intermediate.level)} · {Math.round(chain.intermediate.pct * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 ml-[19px] flex-wrap">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>feeds</span>
                    {chain.products.map((p) => (
                      <span
                        key={p.item}
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                      >
                        {p.item} · {milestoneLabel(p.level)} {Math.round(p.pct * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Tab 6 — passive 1M (Mega Master) */}
      {tab === 'passive1m' && (
        passive1mItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All passive items have hit 1M crafted — Mega Master!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Mega Master milestone — in-progress first, then closest to done. Past-1M items only appear if needed as a build step.
            </p>
            <CraftworksSuggestions
              quests={[]}
              directItems={passive1mItems}
              noFiller
              subtitle="passive 1M · quest-independent"
            />
          </div>
        )
      )}

      {/* Tab 7 — ascension points */}
      {tab === 'ascension' && (
        ascensionDirectItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <TrendingUp size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No ascension point data yet — sync your mastery progress from farmrpg.com/mastery.php.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              10k milestones (+10 pts) first, then 100k (+100 pts) — closest to done within each tier
            </p>
            <CraftworksSuggestions
              quests={[]}
              directItems={ascensionDirectItems}
              subtitle="ascension pts · 10k first, closest to done"
            />
          </div>
        )
      )}

      {/* Tab 5 — passive wood/board crafting masteries */}
      {tab === 'passive' && (
        passiveMasteryItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All passive wood &amp; board masteries are at Mega Master.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Crafts using only Wood · Board · Straw · Stone · in-progress first
            </p>
            <CraftworksSuggestions
              quests={[]}
              directItems={passiveMasteryItems}
              subtitle="passive crafts · wood · board · straw · stone"
            />
          </div>
        )
      )}
    </div>
  );
}
