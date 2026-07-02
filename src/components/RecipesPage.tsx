import { useMemo, useState } from 'react';
import { Search, X, Hammer, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import recipesData from '../data/recipes.json';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { useStore } from '../store';
import { parseItems } from '../utils';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const allRecipes = recipesData as Recipe[];
const allQuests = questsData as Quest[];

// Build map: crafted item name → quests that need it
const itemQuestMap = new Map<string, string[]>();
for (const quest of allQuests) {
  for (const { item } of parseItems(quest.itemsRequired)) {
    if (!itemQuestMap.has(item)) itemQuestMap.set(item, []);
    itemQuestMap.get(item)!.push(quest.name);
  }
}

type CraftFilter = 'all' | 'craftable' | 'missing';

export function RecipesPage() {
  const { inventory } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CraftFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const recipes = useMemo(() => {
    const s = search.toLowerCase();
    return allRecipes
      .map((recipe) => {
        const ingredients = recipe.ingredients.map(({ item, quantity }) => {
          const have = inventory[item] ?? 0;
          const need = Math.max(0, quantity - have);
          return { item, quantity, have, need };
        });
        const canCraft = ingredients.every((i) => i.need === 0);
        const maxCraftable = ingredients.length === 0
          ? 0
          : Math.min(...ingredients.map(({ item, quantity }) =>
              Math.floor((inventory[item] ?? 0) / quantity)
            ));
        const questsNeeded = itemQuestMap.get(recipe.name) ?? [];
        return { recipe, ingredients, canCraft, maxCraftable, questsNeeded };
      })
      .filter(({ recipe, canCraft }) => {
        if (filter === 'craftable' && !canCraft) return false;
        if (filter === 'missing' && canCraft) return false;
        if (s) return recipe.name.toLowerCase().includes(s);
        return true;
      })
      .sort((a, b) => {
        // Craftable now first, then alphabetical
        if (a.canCraft !== b.canCraft) return a.canCraft ? -1 : 1;
        return a.recipe.name.localeCompare(b.recipe.name);
      });
  }, [search, filter, inventory]);

  const craftableCount = useMemo(
    () => allRecipes.filter((r) =>
      r.ingredients.every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity)
    ).length,
    [inventory]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Hammer size={18} className="text-amber-400" />
          <h2 className="text-lg font-bold text-slate-100">Recipes</h2>
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
            {allRecipes.length} recipes · {craftableCount} craftable now
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search recipes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-8 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700">
          {(['all', 'craftable', 'missing'] as CraftFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                filter === f
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'craftable' ? '✓ Can craft' : '✗ Missing'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>

      <div className="space-y-2">
        {recipes.map(({ recipe, ingredients, canCraft, maxCraftable, questsNeeded }) => {
          const isExpanded = expanded.has(recipe.id);
          return (
            <div
              key={recipe.id}
              className={`rounded-lg border transition-all ${
                canCraft
                  ? 'border-green-600/40 bg-green-500/5'
                  : 'border-slate-700 bg-slate-800/40'
              }`}
            >
              <button
                onClick={() => toggle(recipe.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <Hammer size={13} className={canCraft ? 'text-green-400' : 'text-amber-400'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-100">{recipe.name}</span>
                    {canCraft && (
                      <span className="text-xs text-green-400 flex items-center gap-0.5">
                        <CheckCircle2 size={11} /> ready
                        {maxCraftable > 1 && <span className="ml-1 text-green-500">×{maxCraftable}</span>}
                      </span>
                    )}
                    {questsNeeded.length > 0 && (
                      <span className="text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                        {questsNeeded.length} quest{questsNeeded.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {ingredients.map((i) => `${i.quantity}× ${i.item}`).join(', ')}
                    </p>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={13} className="text-slate-500 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-500 flex-shrink-0" />}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 mb-2">Ingredients</p>
                    <div className="space-y-1.5">
                      {ingredients.map(({ item, quantity, have, need }) => (
                        <div key={item} className="flex items-center justify-between gap-3 text-xs">
                          <span className={need === 0 ? 'text-green-400' : 'text-slate-300'}>{item}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">×{quantity}</span>
                            <span className={`font-mono ${need === 0 ? 'text-green-400' : have > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {have}/{quantity}
                            </span>
                            {need > 0 && (
                              <span className="text-red-400 text-xs">need {need}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {questsNeeded.length > 0 && (
                    <div className="border-t border-slate-700/50 pt-2">
                      <p className="text-xs font-semibold text-slate-400 mb-1">Used in quests</p>
                      <div className="flex flex-wrap gap-1">
                        {questsNeeded.slice(0, 6).map((q) => (
                          <span key={q} className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5">
                            {q}
                          </span>
                        ))}
                        {questsNeeded.length > 6 && (
                          <span className="text-xs text-slate-500">+{questsNeeded.length - 6} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
