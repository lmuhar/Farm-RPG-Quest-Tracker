import { useMemo, useState } from 'react';
import { Hammer, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const allRecipes = recipesData as Recipe[];

interface Candidate {
  item: string;
  needed: number;
  have: number;
  deficit: number;
  priority: 'active' | 'nextup';
  isIntermediate: boolean;
  questNames: string[];
  recipe: Recipe;
}

interface Props {
  quests: Quest[];
  nextUpQuests?: Quest[];
}

export function CraftworksSuggestions({ quests, nextUpQuests = [] }: Props) {
  const { inventory, craftingRecipes, craftworksSlots, setCraftworksSlots } = useStore();
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>();
    allRecipes.forEach((r) => map.set(r.name.toLowerCase(), r));
    Object.entries(craftingRecipes).forEach(([item, ings]) => {
      map.set(item.toLowerCase(), { id: 'custom', name: item, ingredients: ings });
    });
    return map;
  }, [craftingRecipes]);

  const suggestions = useMemo(() => {
    const candidateMap = new Map<string, Candidate>();

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
          item,
          needed,
          have,
          deficit,
          priority,
          isIntermediate,
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

    for (const quest of nextUpQuests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        if (!candidateMap.has(item)) {
          addCandidate(item, quantity, 'nextup', quest.name, false);
        }
      }
    }

    // Add intermediate craftable ingredients that also have a deficit
    const directCandidates = [...candidateMap.values()];
    for (const c of directCandidates) {
      for (const { item: ing, quantity: ingQty } of c.recipe.ingredients) {
        if (!candidateMap.has(ing)) {
          addCandidate(ing, ingQty * c.deficit, c.priority, '', true);
        }
      }
    }

    // Topological sort: if item A's recipe needs item B (also a candidate), B comes first
    const allCandidates = [...candidateMap.values()];
    const itemKeys = new Set(allCandidates.map((c) => c.item.toLowerCase()));
    const visited = new Set<string>();
    const result: Candidate[] = [];

    const visit = (c: Candidate) => {
      const key = c.item.toLowerCase();
      if (visited.has(key)) return;
      visited.add(key);
      for (const { item: dep } of c.recipe.ingredients) {
        if (itemKeys.has(dep.toLowerCase())) {
          const depCand = candidateMap.get(dep) ?? allCandidates.find((x) => x.item.toLowerCase() === dep.toLowerCase());
          if (depCand) visit(depCand);
        }
      }
      result.push(c);
    };

    // Visit in priority order so higher-priority items anchor the topo sort
    const sorted = [...allCandidates].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'active' ? -1 : 1;
      if (a.isIntermediate !== b.isIntermediate) return a.isIntermediate ? 1 : -1;
      return b.deficit - a.deficit;
    });
    for (const c of sorted) visit(c);

    return result;
  }, [quests, nextUpQuests, inventory, recipeMap]);

  // For each displayed slot, check ingredient availability assuming prior slots produce their items
  const slotReadiness = useMemo(() => {
    const displaySlots = suggestions.slice(0, craftworksSlots);
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
      const canCraft = ingredientStatus.every((s) => s.ok);
      return { canCraft, ingredientStatus };
    });
  }, [suggestions, craftworksSlots, inventory]);

  const displaySlots = suggestions.slice(0, craftworksSlots);

  if (quests.length === 0 && nextUpQuests.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <Hammer size={15} style={{ color: 'var(--accent-blue)' }} />
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Craftworks
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            suggested slot order
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Slots:</span>
          <button
            onClick={() => setCraftworksSlots(Math.max(1, craftworksSlots - 1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            aria-label="Fewer slots"
          >
            <Minus size={11} />
          </button>
          <span
            className="text-sm font-bold w-5 text-center"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
          >
            {craftworksSlots}
          </span>
          <button
            onClick={() => setCraftworksSlots(Math.min(15, craftworksSlots + 1))}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-muted)' }}
            aria-label="More slots"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      {displaySlots.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Nothing to craft — all needed items are stocked.
          </p>
        </div>
      ) : (
        <div>
          {displaySlots.map((candidate, slotIdx) => {
            const { canCraft, ingredientStatus } = slotReadiness[slotIdx];
            const isExpanded = expandedSlot === slotIdx;
            const pct = candidate.needed > 0 ? Math.min(1, candidate.have / candidate.needed) : 1;

            return (
              <div key={candidate.item} style={{ borderBottom: slotIdx < displaySlots.length - 1 ? '1px solid var(--border-subtle)' : undefined }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ background: isExpanded ? 'var(--surface-inset)' : undefined }}
                  onClick={() => setExpandedSlot(isExpanded ? null : slotIdx)}
                >
                  {/* Slot number */}
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: 'var(--accent-blue-bg)',
                      color: 'var(--accent-blue)',
                      border: '1px solid var(--accent-blue-border)',
                    }}
                  >
                    {slotIdx + 1}
                  </span>

                  {/* Item info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {candidate.item}
                      </span>
                      {candidate.isIntermediate && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: 'var(--accent-purple-bg)',
                            color: 'var(--accent-purple)',
                            border: '1px solid var(--accent-purple-border)',
                          }}
                        >
                          ingredient
                        </span>
                      )}
                      {candidate.priority === 'nextup' && !candidate.isIntermediate && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: 'var(--accent-yellow-bg)',
                            color: 'var(--accent-yellow)',
                            border: '1px solid var(--accent-yellow-border)',
                          }}
                        >
                          up next
                        </span>
                      )}
                    </div>
                    {candidate.questNames.length > 0 && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {candidate.questNames.join(' · ')}
                      </p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {candidate.have.toLocaleString()} / {candidate.needed.toLocaleString()}
                      </div>
                      <div
                        className="w-16 h-1 rounded-full mt-1 overflow-hidden"
                        style={{ background: 'var(--surface-inset)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct * 100}%`,
                            background: pct >= 1 ? 'var(--accent-green)' : 'var(--accent-blue)',
                          }}
                        />
                      </div>
                    </div>
                    {canCraft ? (
                      <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                    ) : (
                      <AlertCircle size={14} style={{ color: 'var(--accent-orange)' }} />
                    )}
                    {isExpanded ? (
                      <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
                    ) : (
                      <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div
                    className="px-4 pb-3"
                    style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-2 pt-3"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Ingredients for {candidate.deficit.toLocaleString()} {candidate.item}
                      {candidate.deficit > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-1.5">
                      {ingredientStatus.map(({ item: ing, totalNeeded, haveNow, ok }) => (
                        <div key={ing} className="flex items-center justify-between text-xs gap-3">
                          <span style={{ color: ok ? 'var(--text-secondary)' : 'var(--accent-orange)' }}>
                            {ing}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: ok ? 'var(--accent-green)' : 'var(--accent-orange)',
                            }}
                          >
                            {haveNow.toLocaleString()} / {totalNeeded.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    {!canCraft && (
                      <p className="text-xs mt-2.5 italic" style={{ color: 'var(--text-muted)' }}>
                        Earlier slots may supply missing ingredients once crafted.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > craftworksSlots && (
        <div
          className="px-4 py-2 text-xs text-center"
          style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
        >
          +{suggestions.length - craftworksSlots} more craftable items — increase slots to see them
        </div>
      )}
    </div>
  );
}
