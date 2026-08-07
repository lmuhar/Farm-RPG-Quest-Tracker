import { useMemo, useState } from 'react';
import { Hammer, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Minus, Plus, Link2, ChevronRight } from 'lucide-react';
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

interface Candidate {
  item: string;
  needed: number;
  have: number;
  deficit: number;
  priority: 'active' | 'nextup';
  isIntermediate: boolean;
  questNames: string[];
  recipe: Recipe;
  anchorMaterial: string | null;
}

interface Props {
  quests: Quest[];
  nextUpQuests?: Quest[];
}

export function CraftworksSuggestions({ quests, nextUpQuests = [] }: Props) {
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
    const candidateMap = new Map<string, Omit<Candidate, 'anchorMaterial'>>();

    const addCandidate = (
      item: string,
      needed: number,
      priority: 'active' | 'nextup',
      questName: string,
      isIntermediate: boolean
    ) => {
      const recipe = recipeMap.get(item.toLowerCase());
      if (!recipe) return;
      const have = inventory[item] ?? 0;
      if (have >= inventoryMax) return; // already at cap — Craftworks suspends here anyway
      const deficit = needed - have;
      if (deficit <= 0) return;

      const existing = candidateMap.get(item);
      if (existing) {
        if (!isIntermediate && questName && !existing.questNames.includes(questName)) {
          existing.questNames.push(questName);
        }
        if (priority === 'active') existing.priority = 'active';
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

    // Active quests first (higher priority)
    for (const quest of quests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        addCandidate(item, quantity, 'active', quest.name, false);
      }
    }

    // Next-up quests (lower priority, skip if already queued)
    for (const quest of nextUpQuests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        if (!candidateMap.has(item)) {
          addCandidate(item, quantity, 'nextup', quest.name, false);
        }
      }
    }

    // Pull in craftable intermediate ingredients that also have a deficit
    const directCandidates = [...candidateMap.values()];
    for (const c of directCandidates) {
      for (const { item: ing, quantity: ingQty } of c.recipe.ingredients) {
        if (!candidateMap.has(ing)) {
          addCandidate(ing, ingQty * c.deficit, c.priority, '', true);
        }
      }
    }

    // ── Smarter clustering ───────────────────────────────────────────────
    // Resolve every candidate down to its raw base ingredients so we can
    // find which items share the same source materials.  Items that draw
    // from the same base (e.g. Wood → Twine, Board, Lantern) are scored
    // higher and sorted together so Craftworks can run the whole chain
    // automatically in one go.
    const candidateRawMap = new Map<string, Map<string, number>>();
    for (const c of candidateMap.values()) {
      candidateRawMap.set(c.item, resolveRawIngredients(c.item, 1, recipeMap));
    }

    // Count how many candidates each raw ingredient appears in
    const rawFreq = new Map<string, number>();
    for (const rawMats of candidateRawMap.values()) {
      for (const raw of rawMats.keys()) {
        rawFreq.set(raw, (rawFreq.get(raw) ?? 0) + 1);
      }
    }

    // Cluster score = sum of freq of each raw ingredient.
    // Higher score → this item shares more base materials with other candidates.
    const clusterScore = (item: string) => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return 0;
      return [...rawMats.keys()].reduce((s, raw) => s + (rawFreq.get(raw) ?? 0), 0);
    };

    // Anchor = the raw ingredient shared by the most other candidates.
    // Used to label and visually group a chain of related crafts.
    const anchorOf = (item: string): string | null => {
      const rawMats = candidateRawMap.get(item);
      if (!rawMats) return null;
      let best = '';
      let bestFreq = 1; // only meaningful if shared by ≥ 2
      for (const raw of rawMats.keys()) {
        const f = rawFreq.get(raw) ?? 0;
        if (f > bestFreq) { bestFreq = f; best = raw; }
      }
      return best || null;
    };

    const allCandidates: Candidate[] = [...candidateMap.values()].map((c) => ({
      ...c,
      anchorMaterial: anchorOf(c.item),
    }));

    // ── Topological sort (ingredients before products) ───────────────────
    // Pre-sort by cluster score so that high-sharing items anchor the visit
    // order, which naturally pulls related crafts into adjacent slots.
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

    const presorted = [...allCandidates].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'active' ? -1 : 1;
      if (a.isIntermediate !== b.isIntermediate) return a.isIntermediate ? 1 : -1;
      return clusterScore(b.item) - clusterScore(a.item);
    });
    for (const c of presorted) visit(c);

    return result;
  }, [quests, nextUpQuests, inventory, recipeMap]);

  const displaySlots = suggestions.slice(0, Math.max(craftworksSlots, 0));

  // Check ingredient availability per slot, treating prior slots as already having run
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

  // Group consecutive slots that share the same anchor material so we can
  // render a "Wood chain" header above each cluster
  const chainGroups = useMemo(() => {
    const groups: { anchor: string | null; indices: number[] }[] = [];
    for (let i = 0; i < displaySlots.length; i++) {
      const anchor = displaySlots[i].anchorMaterial;
      const last = groups[groups.length - 1];
      if (last && last.anchor === anchor) {
        last.indices.push(i);
      } else {
        groups.push({ anchor, indices: [i] });
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

                  // Find chain group for this slot
                  const chainGroup = chainGroups.find(g => g.indices.includes(slotIdx));
                  const isChainStart = chainGroup && chainGroup.anchor && chainGroup.indices.length > 1 && chainGroup.indices[0] === slotIdx;

                  const { canCraft, ingredientStatus } = slotReadiness[slotIdx];
                  const isExpanded = expandedSlot === slotIdx;
                  const pct = candidate.needed > 0 ? Math.min(1, candidate.have / candidate.needed) : 1;
                  const isLast = localIdx === pageSlots.length - 1;

                  return (
                    <div key={candidate.item}>
                      {/* Chain sub-header */}
                      {isChainStart && (
                        <div
                          className="flex items-center gap-1.5 px-4 py-1.5"
                          style={{ background: 'color-mix(in srgb, var(--accent-blue-bg) 50%, transparent)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <Link2 size={10} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
                            {chainGroup!.anchor} chain
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            · slots {chainGroup!.indices.map(i => i + 1).join(', ')} run together
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
                            <div className="flex items-center gap-1.5 flex-shrink-0">
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
                              {candidate.isIntermediate ? 'needed as ingredient' : candidate.questNames.join(' · ')}
                            </span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                {candidate.have.toLocaleString()}/{candidate.needed.toLocaleString()}
                              </span>
                              <div className="w-12 h-1 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-inset)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)' }} />
                              </div>
                            </div>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3" style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider pt-2.5 pb-2" style={{ color: 'var(--text-muted)' }}>
                              Ingredients for {candidate.deficit.toLocaleString()} × {candidate.item}
                            </p>
                            <div className="space-y-1.5">
                              {ingredientStatus.map(({ item: ing, totalNeeded, haveNow, ok }) => (
                                <div key={ing} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="truncate" style={{ color: ok ? 'var(--text-secondary)' : 'var(--accent-orange)' }}>{ing}</span>
                                  <span className="tabular-nums flex-shrink-0 font-medium" style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                                    {haveNow.toLocaleString()} / {totalNeeded.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {!canCraft && (
                              <p className="text-[11px] mt-2.5 italic" style={{ color: 'var(--text-muted)' }}>
                                Earlier slots supply missing ingredients once crafted.
                              </p>
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

      {suggestions.length > craftworksSlots && (
        <div
          className="px-4 py-2.5 text-xs text-center"
          style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
        >
          +{suggestions.length - craftworksSlots} more craftable items — increase slots to include them
        </div>
      )}
    </div>
  );
}
