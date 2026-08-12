import { useMemo, useState } from 'react';
import { Hammer, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Minus, Plus, Link2, ChevronRight, RefreshCw } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems, resolveRawIngredients } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const allRecipes = recipesData as Recipe[];
const builtInRecipeMap = new Map<string, Recipe>(allRecipes.map((r) => [r.name.toLowerCase(), r]));

// Items that regenerate automatically without player intervention.
// Craftworks slots that use ONLY these as raw inputs will self-sustain indefinitely.
const PASSIVE_INPUTS = new Set(['Wood', 'Stone', 'Nails', 'Straw']);

interface Candidate {
  item: string;
  needed: number;
  have: number;
  deficit: number;
  priority: 'active' | 'nextup' | 'filler';
  isIntermediate: boolean;
  questNames: string[];
  recipe: Recipe;
  anchorMaterial: string | null;
  passiveScore: number;   // 0–1: fraction of raw ingredient qty from passive inputs
  passiveInputs: string[]; // which passive materials this item uses
  componentId: string;       // union-find group key
  feedsInto: string[];       // other candidates that use this as a direct ingredient
  componentMaterials: string[]; // raw mats shared by 2+ items in the same component
}

interface Props {
  quests: Quest[];
  nextUpQuests?: Quest[];
  questlineOnly?: boolean;
}

export function CraftworksSuggestions({ quests, nextUpQuests = [], questlineOnly = false }: Props) {
  const { inventory, inventoryMax, craftingRecipes, craftworksSlots, setCraftworksSlots } = useStore();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = (groupIdx: number) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupIdx)) next.delete(groupIdx);
      else next.add(groupIdx);
      return next;
    });

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>(builtInRecipeMap);
    Object.entries(craftingRecipes).forEach(([item, ings]) => {
      map.set(item.toLowerCase(), { id: 'custom', name: item, ingredients: ings });
    });
    return map;
  }, [craftingRecipes]);

  const suggestions = useMemo(() => {
    const candidateMap = new Map<string, Omit<Candidate, 'anchorMaterial' | 'passiveScore' | 'passiveInputs' | 'componentId' | 'feedsInto' | 'componentMaterials'>>();

    const addCandidate = (
      item: string,
      needed: number,
      priority: 'active' | 'nextup' | 'filler',
      questName: string,
      isIntermediate: boolean
    ) => {
      const recipe = recipeMap.get(item.toLowerCase());
      if (!recipe) return;
      const have = inventory[item] ?? 0;
      if (have >= inventoryMax) return;
      const deficit = needed - have;
      if (deficit <= 0) return;

      const existing = candidateMap.get(item);
      if (existing) {
        if (!isIntermediate && questName && !existing.questNames.includes(questName)) {
          existing.questNames.push(questName);
        }
        if (priority === 'active') existing.priority = 'active';
        else if (priority === 'nextup' && existing.priority === 'filler') existing.priority = 'nextup';
        if (needed > existing.needed) {
          existing.needed = needed;
          existing.deficit = needed - existing.have;
        }
      } else {
        candidateMap.set(item, {
          item, needed, have, deficit, priority, isIntermediate,
          questNames: isIntermediate ? [] : questName ? [questName] : [],
          recipe,
        });
      }
    };

    for (const quest of quests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        addCandidate(item, quantity, 'active', quest.name, false);
      }
    }

    // nextupRank: item → index of the quest in nextUpQuests (earlier quests = lower rank = higher priority)
    const nextupRankMap = new Map<string, number>();
    for (let qi = 0; qi < nextUpQuests.length; qi++) {
      for (const { item, quantity } of parseItems(nextUpQuests[qi].itemsRequired)) {
        if (!candidateMap.has(item)) {
          addCandidate(item, quantity, 'nextup', nextUpQuests[qi].name, false);
          if (!nextupRankMap.has(item)) nextupRankMap.set(item, qi);
        }
      }
    }

    // Pull in craftable intermediate ingredients
    const directCandidates = [...candidateMap.values()];
    for (const c of directCandidates) {
      for (const { item: ing, quantity: ingQty } of c.recipe.ingredients) {
        if (!candidateMap.has(ing)) {
          addCandidate(ing, ingQty * c.deficit, c.priority, '', true);
        }
      }
    }

    // ── Resolve raw ingredients for every candidate ───────────────────────
    const candidateRawMap = new Map<string, Map<string, number>>();
    for (const c of candidateMap.values()) {
      candidateRawMap.set(c.item, resolveRawIngredients(c.item, 1, recipeMap));
    }

    // Passive score helpers
    const passiveScoreOf = (item: string): number => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return 0;
      let passiveQty = 0, totalQty = 0;
      for (const [raw, qty] of rawMats) {
        totalQty += qty;
        if (PASSIVE_INPUTS.has(raw)) passiveQty += qty;
      }
      return totalQty > 0 ? passiveQty / totalQty : 0;
    };

    const passiveInputsOf = (item: string): string[] => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return [];
      return [...rawMats.keys()].filter((r) => PASSIVE_INPUTS.has(r));
    };

    // ── Passive filler: fully passive items to fill remaining slots ───────
    // Skipped when questlineOnly — craftworks should only surface questline items.
    if (!questlineOnly) {
      const questCount = candidateMap.size;
      if (questCount < craftworksSlots) {
        for (const [, recipe] of recipeMap) {
          if (candidateMap.has(recipe.name)) continue;
          const rawMats = resolveRawIngredients(recipe.name, 1, recipeMap);
          const fullyPassive = [...rawMats.keys()].every((r) => PASSIVE_INPUTS.has(r));
          if (!fullyPassive) continue;
          const have = inventory[recipe.name] ?? 0;
          if (have >= inventoryMax) continue;
          candidateMap.set(recipe.name, {
            item: recipe.name,
            needed: inventoryMax,
            have,
            deficit: inventoryMax - have,
            priority: 'filler',
            isIntermediate: false,
            questNames: [],
            recipe,
          });
          candidateRawMap.set(recipe.name, rawMats);
          if (candidateMap.size >= craftworksSlots + 5) break;
        }
      }
    }

    // ── Raw frequency + cluster helpers ──────────────────────────────────
    const rawFreq = new Map<string, number>();
    for (const rawMats of candidateRawMap.values()) {
      for (const raw of rawMats.keys()) {
        rawFreq.set(raw, (rawFreq.get(raw) ?? 0) + 1);
      }
    }

    const clusterScore = (item: string) => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return 0;
      return [...rawMats.keys()].reduce((s, raw) => s + (rawFreq.get(raw) ?? 0), 0);
    };

    const anchorOf = (item: string): string | null => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return null;
      let bestPassive = '', bestPassiveFreq = 1;
      for (const raw of rawMats.keys()) {
        if (!PASSIVE_INPUTS.has(raw)) continue;
        const f = rawFreq.get(raw) ?? 0;
        if (f > bestPassiveFreq) { bestPassiveFreq = f; bestPassive = raw; }
      }
      if (bestPassive) return bestPassive;
      let best = '', bestFreq = 1;
      for (const raw of rawMats.keys()) {
        const f = rawFreq.get(raw) ?? 0;
        if (f > bestFreq) { bestFreq = f; best = raw; }
      }
      return best || null;
    };

    // ── Union-find component grouping ─────────────────────────────────────
    const ufParent = new Map<string, string>();
    const candidateKeys = new Set([...candidateMap.keys()].map((k) => k.toLowerCase()));

    const ufFind = (x: string): string => {
      if (!ufParent.has(x)) ufParent.set(x, x);
      const p = ufParent.get(x)!;
      if (p !== x) { const root = ufFind(p); ufParent.set(x, root); return root; }
      return p;
    };
    const ufUnion = (a: string, b: string) => {
      const ra = ufFind(a), rb = ufFind(b);
      if (ra !== rb) ufParent.set(rb, ra);
    };

    for (const c of candidateMap.values()) ufFind(c.item.toLowerCase());

    // Edge type 1: A is a direct ingredient in B's recipe → same component
    for (const c of candidateMap.values()) {
      for (const { item: ing } of c.recipe.ingredients) {
        if (candidateKeys.has(ing.toLowerCase())) {
          ufUnion(c.item.toLowerCase(), ing.toLowerCase());
        }
      }
    }

    // Edge type 2: items share the same anchor material → same component
    const anchorGroupMap = new Map<string, string[]>();
    for (const c of candidateMap.values()) {
      const a = anchorOf(c.item);
      if (a) {
        if (!anchorGroupMap.has(a)) anchorGroupMap.set(a, []);
        anchorGroupMap.get(a)!.push(c.item.toLowerCase());
      }
    }
    for (const [, members] of anchorGroupMap) {
      for (let i = 1; i < members.length; i++) ufUnion(members[0], members[i]);
    }

    // feedsInto: for each candidate, which other candidates directly use it as ingredient
    const feedsIntoMap = new Map<string, string[]>();
    for (const c of candidateMap.values()) {
      for (const { item: ing } of c.recipe.ingredients) {
        const ingKey = ing.toLowerCase();
        if (candidateKeys.has(ingKey)) {
          if (!feedsIntoMap.has(ingKey)) feedsIntoMap.set(ingKey, []);
          feedsIntoMap.get(ingKey)!.push(c.item);
        }
      }
    }

    // componentMaterials: raw mats shared by 2+ candidates in the same component
    const compRawCount = new Map<string, Map<string, number>>();
    for (const c of candidateMap.values()) {
      const compId = ufFind(c.item.toLowerCase());
      if (!compRawCount.has(compId)) compRawCount.set(compId, new Map());
      const rawMats = candidateRawMap.get(c.item);
      if (rawMats) {
        for (const raw of rawMats.keys()) {
          const m = compRawCount.get(compId)!;
          m.set(raw, (m.get(raw) ?? 0) + 1);
        }
      }
    }
    const componentMaterialsMap = new Map<string, string[]>();
    for (const [compId, rawCount] of compRawCount) {
      componentMaterialsMap.set(
        compId,
        [...rawCount.entries()].filter(([, n]) => n >= 2).map(([r]) => r)
      );
    }

    const allCandidates: Candidate[] = [...candidateMap.values()].map((c) => {
      const compId = ufFind(c.item.toLowerCase());
      return {
        ...c,
        anchorMaterial: anchorOf(c.item),
        passiveScore: passiveScoreOf(c.item),
        passiveInputs: passiveInputsOf(c.item),
        componentId: compId,
        feedsInto: feedsIntoMap.get(c.item.toLowerCase()) ?? [],
        componentMaterials: componentMaterialsMap.get(compId) ?? [],
      };
    });

    // ── Topological sort (ingredients before products) ────────────────────
    const itemKeys = new Set(allCandidates.map((c) => c.item.toLowerCase()));
    const visited = new Set<string>();
    const result: Candidate[] = [];

    const visit = (c: Candidate) => {
      const key = c.item.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);
      for (const { item: dep } of c.recipe.ingredients) {
        if (itemKeys.has(dep.toLowerCase())) {
          const depCand = allCandidates.find((x) => x.item.toLowerCase() === dep.toLowerCase());
          if (depCand) visit(depCand);
        }
      }
      result.push(c);
    };

    // Sort: component priority first (keeps related items together), then within component
    const priorityOrder = { active: 0, nextup: 1, filler: 2 };
    const compPriorityMap = new Map<string, number>();
    for (const c of allCandidates) {
      const cur = compPriorityMap.get(c.componentId) ?? 999;
      compPriorityMap.set(c.componentId, Math.min(cur, priorityOrder[c.priority]));
    }

    const presorted = [...allCandidates].sort((a, b) => {
      const cpA = compPriorityMap.get(a.componentId) ?? 2;
      const cpB = compPriorityMap.get(b.componentId) ?? 2;
      if (cpA !== cpB) return cpA - cpB;
      // Keep same-component items adjacent
      if (a.componentId !== b.componentId) return a.componentId.localeCompare(b.componentId);
      // Within component: individual priority then nextup quest rank (earlier quest = higher priority)
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      if (a.priority === 'nextup' && b.priority === 'nextup') {
        const rA = nextupRankMap.get(a.item) ?? 999;
        const rB = nextupRankMap.get(b.item) ?? 999;
        if (rA !== rB) return rA - rB;
      }
      if (a.isIntermediate !== b.isIntermediate) return a.isIntermediate ? 1 : -1;
      const aPure = a.passiveScore >= 1;
      const bPure = b.passiveScore >= 1;
      if (aPure !== bPure) return aPure ? -1 : 1;
      return clusterScore(b.item) - clusterScore(a.item);
    });
    for (const c of presorted) visit(c);

    return result;
  }, [quests, nextUpQuests, inventory, inventoryMax, recipeMap, craftworksSlots, questlineOnly]);

  const displaySlots = suggestions.slice(0, Math.max(craftworksSlots, 0));

  const slotReadiness = useMemo(() => {
    return displaySlots.map((candidate, slotIdx) => {
      const virtual: Record<string, number> = { ...inventory };
      for (let i = 0; i < slotIdx; i++) {
        const prior = displaySlots[i];
        virtual[prior.item] = (virtual[prior.item] ?? 0) + prior.deficit;
      }
      const ingredientStatus = candidate.recipe.ingredients.map(({ item: ing, quantity: ingQty }) => {
        const totalNeeded = ingQty * candidate.deficit;
        const haveNow = virtual[ing] ?? 0;
        return { item: ing, totalNeeded, haveNow, ok: haveNow >= totalNeeded };
      });
      return { canCraft: ingredientStatus.every((s) => s.ok), ingredientStatus };
    });
  }, [displaySlots, inventory]);

  // Group slots by component (union-find id) — items sharing ingredients or raw mats cluster together
  const chainGroups = useMemo(() => {
    type Group = {
      componentId: string;
      indices: number[];
      isPassiveChain: boolean;
      label: string;
      flowArrow: string | null;
    };
    const groups: Group[] = [];

    for (let i = 0; i < displaySlots.length; i++) {
      const slot = displaySlots[i];
      const compId = slot.componentId;
      const last = groups[groups.length - 1];
      if (last && last.componentId === compId) {
        last.indices.push(i);
      } else {
        const mats = slot.componentMaterials;
        const isPassive = mats.length > 0 && mats.every((m) => PASSIVE_INPUTS.has(m));
        groups.push({
          componentId: compId,
          indices: [i],
          isPassiveChain: isPassive,
          label: mats.length > 0 ? mats.join(' · ') : (slot.anchorMaterial ?? ''),
          flowArrow: null,
        });
      }
    }

    // Second pass: detect ingredient→product flow arrows within each multi-item group
    for (const g of groups) {
      if (g.indices.length < 2) continue;
      const groupItemSet = new Set(g.indices.map((i) => displaySlots[i].item.toLowerCase()));
      for (const i of g.indices) {
        const slot = displaySlots[i];
        for (const { item: ing } of slot.recipe.ingredients) {
          if (groupItemSet.has(ing.toLowerCase()) && ing.toLowerCase() !== slot.item.toLowerCase()) {
            g.flowArrow = `${ing} → ${slot.item}`;
            break;
          }
        }
        if (g.flowArrow) break;
      }
    }

    return groups;
  }, [displaySlots]);

  if (quests.length === 0 && nextUpQuests.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Hammer size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Craftworks
          </span>
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
            auto-chain order
          </span>
        </div>

        {/* Slot counter */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Slots</span>
          <button
            onClick={() => setCraftworksSlots(Math.max(1, craftworksSlots - 1))}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            aria-label="Fewer slots"
          >
            <Minus size={11} />
          </button>
          <span
            className="text-sm font-bold w-5 text-center tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {craftworksSlots}
          </span>
          <button
            onClick={() => setCraftworksSlots(craftworksSlots + 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            aria-label="More slots"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {displaySlots.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CheckCircle2 size={22} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Nothing to craft — all needed items are stocked.
          </p>
        </div>
      ) : (
        <div>
          {Array.from({ length: Math.ceil(displaySlots.length / 5) }, (_, pageIdx) => {
            const pageStart = pageIdx * 5;
            const pageEnd = Math.min(pageStart + 5, displaySlots.length);
            const pageSlots = displaySlots.slice(pageStart, pageEnd);
            const isCollapsed = collapsedGroups.has(pageIdx);
            const pageReadyCount = pageSlots.filter((_, i) => slotReadiness[pageStart + i]?.canCraft).length;

            return (
              <div key={pageIdx} style={{ borderBottom: pageIdx < Math.ceil(displaySlots.length / 5) - 1 ? '2px solid var(--border-subtle)' : undefined }}>
                {/* Group header */}
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:opacity-80"
                  style={{ background: 'var(--surface-inset)' }}
                  onClick={() => toggleGroup(pageIdx)}
                >
                  {isCollapsed
                    ? <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    : <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  }
                  <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>
                    Slots {pageStart + 1}–{pageEnd}
                  </span>
                  <span className="text-[11px]" style={{ color: pageReadyCount === pageSlots.length ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {pageReadyCount}/{pageSlots.length} ready
                  </span>
                </button>

                {!isCollapsed && pageSlots.map((candidate, localIdx) => {
                  const slotIdx = pageStart + localIdx;

                  const chainGroup = chainGroups.find(g => g.indices.includes(slotIdx));
                  const isChainStart = chainGroup && chainGroup.label && chainGroup.indices.length > 1 && chainGroup.indices[0] === slotIdx;
                  const isPassiveChain = chainGroup?.isPassiveChain ?? false;
                  const isFullyPassive = candidate.passiveScore >= 1;

                  const { canCraft, ingredientStatus } = slotReadiness[slotIdx];
                  const isExpanded = expandedSlot === slotIdx;
                  const pct = candidate.needed > 0 ? Math.min(1, candidate.have / candidate.needed) : 1;
                  const isLast = localIdx === pageSlots.length - 1;

                  return (
                    <div key={candidate.item}>
                      {/* Chain sub-header */}
                      {isChainStart && (
                        <div
                          className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap"
                          style={{
                            background: isPassiveChain
                              ? 'color-mix(in srgb, var(--accent-green-bg) 60%, transparent)'
                              : 'color-mix(in srgb, var(--accent-blue-bg) 50%, transparent)',
                            borderTop: '1px solid var(--border-subtle)',
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          {isPassiveChain
                            ? <RefreshCw size={10} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                            : <Link2 size={10} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                          }
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: isPassiveChain ? 'var(--accent-green)' : 'var(--accent-blue)' }}
                          >
                            {chainGroup!.flowArrow ?? chainGroup!.label}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            · slots {chainGroup!.indices.map(i => i + 1).join(', ')}
                            {isPassiveChain && ' · auto-refills from passive resources'}
                            {!isPassiveChain && !chainGroup!.flowArrow && ' · shared ingredients'}
                            {!isPassiveChain && chainGroup!.flowArrow && ' · ingredient chain'}
                          </span>
                        </div>
                      )}

                      <div style={{ borderBottom: isLast ? undefined : '1px solid var(--border-subtle)' }}>
                        <button
                          className="w-full px-3 py-2.5 text-left"
                          style={{ background: isExpanded ? 'color-mix(in srgb, var(--surface-inset) 70%, transparent)' : undefined }}
                          onClick={() => setExpandedSlot(isExpanded ? null : slotIdx)}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                              style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                            >
                              {slotIdx + 1}
                            </span>
                            <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>
                              {candidate.item}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Passive inputs badges */}
                              {candidate.passiveInputs.length > 0 && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none hidden sm:inline-flex items-center gap-0.5"
                                  style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
                                  title={`Uses passive inputs: ${candidate.passiveInputs.join(', ')}`}
                                >
                                  {isFullyPassive && <RefreshCw size={8} />}
                                  {candidate.passiveInputs.join('+')}
                                </span>
                              )}
                              {candidate.priority === 'filler' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none hidden xs:inline" style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                                  filler
                                </span>
                              )}
                              {candidate.isIntermediate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none hidden xs:inline" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                                  ingredient
                                </span>
                              )}
                              {candidate.priority === 'nextup' && !candidate.isIntermediate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none hidden xs:inline" style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                                  next
                                </span>
                              )}
                              {canCraft ? (
                                <CheckCircle2 size={13} style={{ color: 'var(--accent-green)' }} />
                              ) : (
                                <AlertCircle size={13} style={{ color: 'var(--accent-orange)' }} />
                              )}
                              {isExpanded ? (
                                <ChevronUp size={12} style={{ color: 'var(--text-muted)' }} />
                              ) : (
                                <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 ml-7">
                            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>
                              {candidate.priority === 'filler'
                                ? `auto-refills from ${candidate.passiveInputs.join(', ')}`
                                : candidate.isIntermediate
                                ? 'needed as ingredient'
                                : candidate.questNames.join(' · ')}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                {candidate.priority === 'filler'
                                  ? `${candidate.have.toLocaleString()} stocked`
                                  : `${candidate.have.toLocaleString()}/${candidate.needed.toLocaleString()}`}
                              </span>
                              {candidate.priority !== 'filler' && (
                                <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-inset)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)' }} />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3" style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}>
                            {candidate.priority === 'filler' ? (
                              <div className="pt-2.5">
                                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                  Filler slot — keeps Craftworks running automatically using passive resources
                                  ({candidate.passiveInputs.join(', ')} regenerate on their own).
                                  No user action needed once queued.
                                </p>
                                <p className="text-[10px] font-semibold uppercase tracking-wider pt-2.5 pb-1.5" style={{ color: 'var(--text-muted)' }}>
                                  Ingredients (per craft)
                                </p>
                                <div className="space-y-1">
                                  {candidate.recipe.ingredients.map(({ item: ing, quantity: ingQty }) => (
                                    <div key={ing} className="flex items-center justify-between gap-2 text-xs">
                                      <span style={{ color: 'var(--text-secondary)' }}>{ing}</span>
                                      <span className="tabular-nums font-medium" style={{ color: 'var(--accent-green)' }}>×{ingQty}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="text-[10px] font-semibold uppercase tracking-wider pt-2.5 pb-2" style={{ color: 'var(--text-muted)' }}>
                                  Ingredients for {candidate.deficit.toLocaleString()} × {candidate.item}
                                </p>
                                <div className="space-y-1.5">
                                  {ingredientStatus.map(({ item: ing, totalNeeded, haveNow, ok }) => {
                                    const isPassiveIng = PASSIVE_INPUTS.has(ing);
                                    return (
                                      <div key={ing} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="flex items-center gap-1 truncate" style={{ color: ok ? 'var(--text-secondary)' : 'var(--accent-orange)' }}>
                                          {isPassiveIng && <RefreshCw size={9} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />}
                                          {ing}
                                        </span>
                                        <span className="tabular-nums flex-shrink-0 font-medium" style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                                          {haveNow.toLocaleString()} / {totalNeeded.toLocaleString()}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {!canCraft && (
                                  <p className="text-[11px] mt-2.5 italic" style={{ color: 'var(--text-muted)' }}>
                                    Earlier slots supply missing ingredients once crafted.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div
        className="px-4 py-2 flex items-center gap-2 flex-wrap"
        style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-inset)' }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <RefreshCw size={10} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Wood · Stone · Nails · Straw regenerate automatically — items using only these keep Craftworks running without intervention
          </span>
        </div>
        {suggestions.length > craftworksSlots && (
          <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            +{suggestions.length - craftworksSlots} more — add slots to include
          </span>
        )}
      </div>
    </div>
  );
}
