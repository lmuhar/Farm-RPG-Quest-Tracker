import { ChevronRight, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { Quest, QuestStatus } from '../types';
import { getQuestStatus, npcColor, parseItems, formatDuration, calcGrowsNeeded } from '../utils';
import { useStore } from '../store';
import { QuestCard } from './QuestCard';
import { useState } from 'react';

interface Props {
  questline: string;
  quests: Quest[];
}

const statusDot: Record<QuestStatus, string> = {
  completed: 'bg-green-500',
  active: 'bg-yellow-400',
  available: 'bg-slate-400',
  locked: 'bg-slate-700',
};

export function QuestLineView({ questline, quests }: Props) {
  const { player, questStatuses, inventory, cropTimes, plotCount } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [showFuture, setShowFuture] = useState(false);

  const statuses = quests.map((q) => getQuestStatus(q, player, questStatuses));
  const completedCount = statuses.filter((s) => s === 'completed').length;
  const progress = Math.round((completedCount / quests.length) * 100);

  // Per-quest item breakdown for non-completed quests
  const questItemBreakdown = quests
    .map((quest, i) => {
      if (statuses[i] === 'completed') return null;
      const items = parseItems(quest.itemsRequired).map(({ quantity, item }) => {
        const have = inventory[item] ?? 0;
        const need = Math.max(0, quantity - have);
        const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
        const grows = cropTime && need > 0 ? calcGrowsNeeded(need, plotCount) : null;
        const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;
        return { item, quantity, have, need, cropTime, grows, totalTime };
      });
      return { quest, status: statuses[i], items };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const remainingQuests = questItemBreakdown.map((x) => x.quest);
  const isFullyCompleted = completedCount === quests.length;

  return (
    <div className={`bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden${isFullyCompleted ? ' opacity-60' : ''}`}>
      <button
        onClick={() => !isFullyCompleted && setExpanded(!expanded)}
        disabled={isFullyCompleted}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-colors text-left"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-slate-100">{questline}</span>
            <span className="text-xs text-slate-400">{completedCount}/{quests.length}</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {quests.map((q, i) => {
              const status = statuses[i];
              return (
                <div key={q.id} className="flex items-center gap-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${statusDot[status]} flex-shrink-0`}
                    title={`${q.name} (${status})`}
                  />
                  {i < quests.length - 1 && <ChevronRight size={10} className="text-slate-600" />}
                </div>
              );
            })}
          </div>
          <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden w-full max-w-xs">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex -space-x-1">
            {[...new Set(quests.map((q) => q.npc))].slice(0, 3).map((npc) => (
              <span key={npc} className={`text-xs px-1.5 py-0.5 rounded border ${npcColor(npc)}`}>
                {npc.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700/50">
          {/* Future items summary — per quest */}
          {questItemBreakdown.length > 0 && (
            <div className="px-4 py-3 bg-slate-900/40 border-b border-slate-700/50">
              <button
                onClick={(e) => { e.stopPropagation(); setShowFuture(!showFuture); }}
                className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-slate-100 w-full"
              >
                {showFuture ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Items needed ({remainingQuests.length} remaining quest{remainingQuests.length !== 1 ? 's' : ''})
              </button>

              {showFuture && (
                <div className="mt-3 space-y-4">
                  {questItemBreakdown.map(({ quest, status, items }) => (
                    <div key={quest.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          status === 'active' ? 'bg-yellow-400' : status === 'available' ? 'bg-slate-400' : 'bg-slate-700'
                        }`} />
                        <span className="text-xs font-medium text-slate-300">{quest.name}</span>
                        {status === 'active' && <span className="text-xs text-yellow-400">● active</span>}
                        {status === 'locked' && <span className="text-xs text-slate-600">locked</span>}
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-slate-600 ml-4">No items required</p>
                      ) : (
                        <div className="ml-4 space-y-1">
                          {items.map(({ item, quantity, have, need, cropTime, grows, totalTime }) => (
                            <div key={item} className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={need === 0 ? 'text-green-400 line-through' : 'text-slate-300'}>
                                  {quantity}x {item}
                                </span>
                                {cropTime && need > 0 && grows !== null && totalTime !== null && (
                                  <span className="text-green-300 flex items-center gap-0.5">
                                    <Clock size={9} />{grows}x · {formatDuration(totalTime)}
                                  </span>
                                )}
                              </div>
                              <span className={`flex-shrink-0 font-mono ${need === 0 ? 'text-green-400' : have > 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                                {have > 0 ? `${have}/${quantity}` : ''}
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
          )}

          {/* Individual quest cards */}
          <div className="p-4 space-y-2">
            {quests.map((quest, i) => (
              <QuestCard key={quest.id} quest={quest} status={statuses[i]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
