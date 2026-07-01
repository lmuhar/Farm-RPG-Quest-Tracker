import { useState, useMemo } from 'react';
import { Swords, Clock, ChevronDown, ChevronUp, GitBranch, X, Hammer } from 'lucide-react';
import type { Quest, QuestStatus } from '../types';
import recipesData from '../data/recipes.json';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map((r) => [r.name.toLowerCase(), r])
);

function ItemBreakdown({ item, have, questBreakdown }: {
  item: string;
  have: number;
  questBreakdown: { quest: Quest; quantity: number }[];
}) {
  const recipe = recipeByName.get(item.toLowerCase());
  return (
    <div className="mt-2 ml-1 bg-slate-900/60 rounded-lg border border-slate-600/50 p-2.5 space-y-2">
      <div className="space-y-1.5">
        <p className="text-xs text-slate-400 font-medium">Needed by {questBreakdown.length} quest{questBreakdown.length !== 1 ? 's' : ''}:</p>
        {questBreakdown.map(({ quest, quantity }) => (
          <div key={quest.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-300 truncate">{quest.name}</span>
            <span className={`flex-shrink-0 font-mono ${have >= quantity ? 'text-green-400' : 'text-yellow-400'}`}>
              {have >= quantity ? `✓ ${quantity}` : `${have}/${quantity}`}
            </span>
          </div>
        ))}
      </div>
      {recipe && (
        <div className="border-t border-slate-700/50 pt-2 space-y-1">
          <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Hammer size={10} className="text-amber-400" /> Crafted from:
          </p>
          {recipe.ingredients.map(({ item: ing, quantity }) => (
            <div key={ing} className="flex items-center justify-between gap-2 text-xs pl-2">
              <span className="text-slate-300">{ing}</span>
              <span className="text-slate-400 font-mono">×{quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { parseItems, formatDuration, calcGrowsNeeded } from '../utils';
import { useStore } from '../store';

interface QuestlineGroup {
  name: string;
  quests: Quest[];
}

interface Props {
  quests: Quest[];
  questStatuses: Record<string, QuestStatus>;
  questlineGroups: QuestlineGroup[];
}

export function ActiveQuestsSummary({ quests, questStatuses, questlineGroups }: Props) {
  const { inventory, cropTimes, plotCount } = useStore();
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const toggleLine = (name: string) =>
    setExpandedLines((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleItem = (item: string) =>
    setSelectedItem((prev) => (prev === item ? null : item));

  // Per-item quest breakdown: item -> list of {quest, quantity}
  const itemQuestMap = useMemo(() => {
    const map = new Map<string, { quest: Quest; quantity: number }[]>();
    for (const quest of quests) {
      for (const { quantity, item } of parseItems(quest.itemsRequired)) {
        if (!map.has(item)) map.set(item, []);
        map.get(item)!.push({ quest, quantity });
      }
    }
    return map;
  }, [quests]);

  // Aggregate items for active quests
  const itemMap = new Map<string, number>();
  for (const quest of quests) {
    for (const { quantity, item } of parseItems(quest.itemsRequired)) {
      itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
    }
  }

  const items = [...itemMap.entries()].map(([item, totalNeeded]) => {
    const have = inventory[item] ?? 0;
    const need = Math.max(0, totalNeeded - have);
    const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
    const grows = cropTime && need > 0 ? calcGrowsNeeded(need, plotCount) : null;
    const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;
    return { item, totalNeeded, have, need, cropTime, grows, totalTime };
  });

  const cropItems = items.filter((i) => i.cropTime);
  const otherItems = items.filter((i) => !i.cropTime && i.need > 0);

  // Find quest lines that have at least one active quest, and collect their remaining quests
  const activeQuestIds = new Set(quests.map((q) => q.id));
  const upcomingByLine = questlineGroups
    .filter(({ quests: qs }) => qs.some((q) => activeQuestIds.has(q.id)))
    .map(({ name, quests: qs }) => {
      const lastActiveIdx = qs.reduce((max, q, i) => (activeQuestIds.has(q.id) ? i : max), -1);
      const upcoming = qs.slice(lastActiveIdx + 1).filter((q) => questStatuses[q.id] !== 'completed');

      // Build per-quest item breakdown
      const questBreakdown = upcoming.map((quest) => {
        const items = parseItems(quest.itemsRequired).map(({ item, quantity }) => {
          const have = inventory[item] ?? 0;
          const need = Math.max(0, quantity - have);
          const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
          const grows = cropTime && need > 0 ? calcGrowsNeeded(need, plotCount) : null;
          const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;
          return { item, quantity, have, need, cropTime, grows, totalTime };
        });
        const allDone = items.length > 0 && items.every((i) => i.need === 0);
        return { quest, items, allDone };
      });

      return { name, upcoming, questBreakdown };
    })
    .filter(({ upcoming }) => upcoming.length > 0);

  if (quests.length === 0) {
    return (
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-6 text-center">
        <Swords size={24} className="text-slate-600 mx-auto mb-2" />
        <p className="text-slate-500 text-sm">No active quests — mark some as active to see your shopping list here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current active quest items */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Swords size={16} className="text-yellow-400" />
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Active Quests — Item Summary
          </h2>
          <span className="text-xs text-slate-500 ml-auto">{quests.length} quests</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cropItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1">
                <Clock size={11} /> Crops to grow
              </p>
              <div className="space-y-2">
                {cropItems.map(({ item, totalNeeded, have, need, grows, totalTime }) => {
                  const isSelected = selectedItem === item;
                  const breakdown = itemQuestMap.get(item) ?? [];
                  return (
                    <div key={item} className={`bg-slate-700/40 rounded p-2 cursor-pointer transition-colors hover:bg-slate-700/60 ${isSelected ? 'ring-1 ring-purple-500/50' : ''}`} onClick={() => toggleItem(item)}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-200 font-medium">{item}</span>
                        <div className="flex items-center gap-2">
                          <span className={have >= totalNeeded ? 'text-green-400' : 'text-yellow-400'}>
                            {have}/{totalNeeded}
                          </span>
                          {breakdown.length > 1 && <span className="text-slate-500">{isSelected ? <X size={10} /> : `${breakdown.length} quests`}</span>}
                        </div>
                      </div>
                      {need > 0 && grows !== null && totalTime !== null && (
                        <div className="text-xs text-green-300 mt-0.5">
                          {grows} grow{grows !== 1 ? 's' : ''} needed · {formatDuration(totalTime)} total
                        </div>
                      )}
                      {need === 0 && <div className="text-xs text-green-400 mt-0.5">✓ Have enough</div>}
                      {isSelected && <ItemBreakdown item={item} have={have} questBreakdown={breakdown} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {otherItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-2">Still needed</p>
              <div className="space-y-1">
                {otherItems.map(({ item, totalNeeded, have }) => {
                  const isSelected = selectedItem === item;
                  const breakdown = itemQuestMap.get(item) ?? [];
                  return (
                    <div key={item} className={`rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-slate-700/40 ${isSelected ? 'bg-slate-700/40 ring-1 ring-purple-500/50' : ''}`} onClick={() => toggleItem(item)}>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300">{item}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-red-400">
                            {have > 0 ? `${have}/${totalNeeded}` : `${totalNeeded} needed`}
                          </span>
                          {breakdown.length > 1 && <span className="text-slate-500 text-xs">{isSelected ? <X size={10} /> : `${breakdown.length} quests`}</span>}
                        </div>
                      </div>
                      {isSelected && <ItemBreakdown item={item} have={have} questBreakdown={breakdown} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming quests per quest line */}
      {upcomingByLine.map(({ name, upcoming, questBreakdown }) => (
        <div key={name} className="bg-slate-800/40 rounded-xl border border-slate-600/60 overflow-hidden">
          <button
            onClick={() => toggleLine(name)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700/30 transition-colors text-left"
          >
            <GitBranch size={14} className="text-purple-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200">{name}</span>
            <span className="text-xs text-slate-500">
              — {upcoming.length} quest{upcoming.length !== 1 ? 's' : ''} ahead
            </span>
            <span className="ml-auto text-slate-500">
              {expandedLines.has(name) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {expandedLines.has(name) && (
            <div className="border-t border-slate-700/50 divide-y divide-slate-700/40">
              {questBreakdown.map(({ quest, items, allDone }, idx) => (
                <div key={quest.id} className={`px-4 py-3 ${allDone ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${idx === 0 ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'bg-slate-700 text-slate-400'}`}>
                      {idx === 0 ? 'Next' : `+${idx}`}
                    </span>
                    <span className={`text-xs font-medium ${allDone ? 'text-green-400' : 'text-slate-200'}`}>
                      {quest.name}
                    </span>
                    {allDone && <span className="text-xs text-green-400 ml-auto">✓ ready</span>}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-600 pl-8">No items required</p>
                  ) : (
                    <div className="pl-8 space-y-1">
                      {items.map(({ item, quantity, have, need, cropTime, grows, totalTime }) => (
                        <div key={item} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                            <span className={need === 0 ? 'text-green-400 line-through' : 'text-slate-300'}>
                              {item}
                            </span>
                            {cropTime && need > 0 && grows !== null && totalTime !== null && (
                              <span className="text-green-300 flex items-center gap-0.5">
                                <Clock size={9} />{grows}x · {formatDuration(totalTime)}
                              </span>
                            )}
                          </div>
                          <span className={`flex-shrink-0 font-mono ${need === 0 ? 'text-green-400' : have > 0 ? 'text-yellow-400' : 'text-slate-400'}`}>
                            {have > 0 ? `${have}/${quantity}` : `×${quantity}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
