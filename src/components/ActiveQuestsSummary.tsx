import { useState } from 'react';
import { Swords, Clock, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import type { Quest, QuestStatus } from '../types';
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

  const toggleLine = (name: string) =>
    setExpandedLines((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

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
      // Future = not completed and not currently active (i.e. after the active one)
      const lastActiveIdx = qs.reduce((max, q, i) => (activeQuestIds.has(q.id) ? i : max), -1);
      const upcoming = qs.slice(lastActiveIdx + 1).filter((q) => questStatuses[q.id] !== 'completed');

      // Aggregate items for upcoming quests
      const upMap = new Map<string, { total: number }>();
      for (const quest of upcoming) {
        for (const { quantity, item } of parseItems(quest.itemsRequired)) {
          upMap.set(item, { total: (upMap.get(item)?.total ?? 0) + quantity });
        }
      }

      const upItems = [...upMap.entries()].map(([item, { total }]) => {
        const have = inventory[item] ?? 0;
        const need = Math.max(0, total - have);
        const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
        const grows = cropTime && need > 0 ? calcGrowsNeeded(need, plotCount) : null;
        const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;
        return { item, total, have, need, cropTime, grows, totalTime };
      }).sort((a, b) => {
        if (a.cropTime && !b.cropTime) return -1;
        if (!a.cropTime && b.cropTime) return 1;
        return a.item.localeCompare(b.item);
      });

      return { name, upcoming, upItems };
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
                {cropItems.map(({ item, totalNeeded, have, need, grows, totalTime }) => (
                  <div key={item} className="bg-slate-700/40 rounded p-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200 font-medium">{item}</span>
                      <span className={have >= totalNeeded ? 'text-green-400' : 'text-yellow-400'}>
                        {have}/{totalNeeded}
                      </span>
                    </div>
                    {need > 0 && grows !== null && totalTime !== null && (
                      <div className="text-xs text-green-300 mt-0.5">
                        {grows} grow{grows !== 1 ? 's' : ''} needed · {formatDuration(totalTime)} total
                      </div>
                    )}
                    {need === 0 && <div className="text-xs text-green-400 mt-0.5">✓ Have enough</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {otherItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-2">Still needed</p>
              <div className="space-y-1">
                {otherItems.map(({ item, totalNeeded, have }) => (
                  <div key={item} className="flex justify-between text-xs">
                    <span className="text-slate-300">{item}</span>
                    <span className="text-red-400">
                      {have > 0 ? `${have}/${totalNeeded}` : `${totalNeeded} needed`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming items per quest line */}
      {upcomingByLine.map(({ name, upcoming, upItems }) => (
        <div key={name} className="bg-slate-800/40 rounded-xl border border-slate-600/60 overflow-hidden">
          <button
            onClick={() => toggleLine(name)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700/30 transition-colors text-left"
          >
            <GitBranch size={14} className="text-purple-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200">{name}</span>
            <span className="text-xs text-slate-500">
              — {upcoming.length} quest{upcoming.length !== 1 ? 's' : ''} ahead · {upItems.length} items
            </span>
            <span className="ml-auto text-slate-500">
              {expandedLines.has(name) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {expandedLines.has(name) && (
            <div className="border-t border-slate-700/50 px-4 py-3">
              <p className="text-xs text-slate-500 mb-3">
                Next: {upcoming.map((q) => q.name).join(' → ')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {upItems.map(({ item, total, have, need, grows, totalTime, cropTime }) => (
                  <div key={item} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
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
                      {have > 0 ? `${have}/${total}` : `×${total}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
