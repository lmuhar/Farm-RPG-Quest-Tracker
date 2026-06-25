import { useMemo } from 'react';
import { Sprout, Plus, Minus, Trash2 } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { parseItems, getQuestStatus, calcGrowsNeeded, formatDuration } from '../utils';
import { useStore } from '../store';

const allQuests = questsData as Quest[];

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function GrowPlanner({ questlineGroups }: Props) {
  const { player, questStatuses, inventory, cropTimes, plotCount, growQueue, setGrowQueue } = useStore();

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const activeQuestIds = useMemo(
    () => new Set(questsWithStatus.filter((q) => q.status === 'active').map((q) => q.quest.id)),
    [questsWithStatus]
  );

  const cropMap = useMemo(() => {
    const map = new Map<string, number>();

    // Active quests
    for (const { quest, status } of questsWithStatus) {
      if (status !== 'active') continue;
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const ct = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
        if (!ct) continue;
        map.set(item, (map.get(item) ?? 0) + quantity);
      }
    }

    // Upcoming quests in quest lines that have an active quest
    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeQuestIds.has(q.id))) continue;
      const lastActiveIdx = quests.reduce((max, q, i) => (activeQuestIds.has(q.id) ? i : max), -1);
      const upcoming = quests.slice(lastActiveIdx + 1).filter((q) => questStatuses[q.id] !== 'completed');
      for (const quest of upcoming) {
        for (const { item, quantity } of parseItems(quest.itemsRequired)) {
          const ct = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
          if (!ct) continue;
          map.set(item, (map.get(item) ?? 0) + quantity);
        }
      }
    }

    return map;
  }, [questsWithStatus, activeQuestIds, questlineGroups, cropTimes, questStatuses]);

  const rows = useMemo(() => {
    return [...cropMap.entries()]
      .map(([item, totalNeeded]) => {
        const ct = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())!;
        const have = inventory[item] ?? 0;
        const stillNeed = Math.max(0, totalNeeded - have);
        const grows = calcGrowsNeeded(stillNeed, plotCount);
        const totalTime = grows * ct.growMinutes;
        return { item, have, totalNeeded, stillNeed, grows, timePerGrow: ct.growMinutes, totalTime };
      })
      .sort((a, b) => a.timePerGrow - b.timePerGrow);
  }, [cropMap, cropTimes, inventory, plotCount]);

  const totalFarmTime = useMemo(() => rows.reduce((sum, r) => sum + r.totalTime, 0), [rows]);

  const addToQueue = (item: string) => {
    const existing = growQueue.find((q) => q.item === item);
    if (existing) {
      setGrowQueue(growQueue.map((q) => q.item === item ? { ...q, grows: q.grows + 1 } : q));
    } else {
      setGrowQueue([...growQueue, { item, grows: 1 }]);
    }
  };

  const updateQueueGrows = (item: string, delta: number) => {
    const existing = growQueue.find((q) => q.item === item);
    if (!existing) return;
    const next = existing.grows + delta;
    if (next <= 0) {
      setGrowQueue(growQueue.filter((q) => q.item !== item));
    } else {
      setGrowQueue(growQueue.map((q) => q.item === item ? { ...q, grows: next } : q));
    }
  };

  const removeFromQueue = (item: string) => setGrowQueue(growQueue.filter((q) => q.item !== item));

  const queueRows = useMemo(() => {
    return growQueue.map(({ item, grows }) => {
      const ct = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
      if (!ct) return null;
      const timePerGrow = ct.growMinutes;
      const totalTime = grows * timePerGrow;
      return { item, grows, timePerGrow, totalTime };
    }).filter(Boolean) as { item: string; grows: number; timePerGrow: number; totalTime: number }[];
  }, [growQueue, cropTimes]);

  const queueTotalTime = useMemo(() => queueRows.reduce((sum, r) => sum + r.totalTime, 0), [queueRows]);

  const queueDoneAt = useMemo(() => {
    if (queueTotalTime <= 0) return null;
    return new Date(Date.now() + queueTotalTime * 60 * 1000);
  }, [queueTotalTime]);

  if (rows.length === 0) {
    return (
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-8 text-center">
        <Sprout size={28} className="text-slate-600 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No crop items needed right now.</p>
        <p className="text-slate-500 text-xs mt-1">Mark quests as active and add crop grow times to see planning data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
        <p className="text-sm font-semibold text-green-300">
          Total farm time: <span className="text-white">{formatDuration(totalFarmTime)}</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">Across {rows.length} crop type{rows.length !== 1 ? 's' : ''} · {plotCount} plots</p>
      </div>

      <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
              <th className="text-left px-4 py-3">Crop</th>
              <th className="text-right px-4 py-3">Have</th>
              <th className="text-right px-4 py-3">Need</th>
              <th className="text-right px-4 py-3">Grows</th>
              <th className="text-right px-4 py-3 hidden sm:table-cell">Per grow</th>
              <th className="text-right px-4 py-3">Total time</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, have, totalNeeded, stillNeed, grows, timePerGrow, totalTime }) => (
              <tr key={item} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/20">
                <td className="px-4 py-2.5 text-slate-200 font-medium">{item}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${have >= totalNeeded ? 'text-green-400' : 'text-yellow-400'}`}>
                  {have}/{totalNeeded}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-300">{stillNeed}</td>
                <td className="px-4 py-2.5 text-right font-mono text-purple-300">{stillNeed === 0 ? '—' : grows}</td>
                <td className="px-4 py-2.5 text-right text-slate-400 text-xs hidden sm:table-cell">{formatDuration(timePerGrow)}</td>
                <td className={`px-4 py-2.5 text-right text-xs ${stillNeed === 0 ? 'text-green-400' : 'text-green-300'}`}>
                  {stillNeed === 0 ? '✓ done' : formatDuration(totalTime)}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => addToQueue(item)}
                    className="text-slate-500 hover:text-green-400 transition-colors"
                    title="Add to grow queue"
                  >
                    <Plus size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Grow Queue */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
          <Sprout size={14} className="text-green-400" />
          <span className="text-sm font-semibold text-slate-200">Grow Queue</span>
          {growQueue.length > 0 && (
            <button
              onClick={() => setGrowQueue([])}
              className="ml-auto text-xs text-slate-500 hover:text-red-400"
            >
              Clear all
            </button>
          )}
        </div>
        {queueRows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">
            Click + on any crop row above to add to queue
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Crop</th>
                  <th className="text-right px-4 py-2">Grows</th>
                  <th className="text-right px-4 py-2 hidden sm:table-cell">Per grow</th>
                  <th className="text-right px-4 py-2">Subtotal</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {queueRows.map(({ item, grows, timePerGrow, totalTime }) => (
                  <tr key={item} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/20">
                    <td className="px-4 py-2 text-slate-200">{item}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => updateQueueGrows(item, -1)} className="text-slate-500 hover:text-slate-300"><Minus size={11} /></button>
                        <span className="font-mono text-purple-300 w-6 text-center">{grows}</span>
                        <button onClick={() => updateQueueGrows(item, 1)} className="text-slate-500 hover:text-slate-300"><Plus size={11} /></button>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400 text-xs hidden sm:table-cell">{formatDuration(timePerGrow)}</td>
                    <td className="px-4 py-2 text-right text-xs text-green-300">{formatDuration(totalTime)}</td>
                    <td className="px-2 py-2">
                      <button onClick={() => removeFromQueue(item)} className="text-slate-600 hover:text-red-400"><Trash2 size={11} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-slate-900/40 border-t border-slate-700/50 space-y-1">
              <p className="text-sm font-semibold text-green-300">
                Total queue time: <span className="text-white">{formatDuration(queueTotalTime)}</span>
              </p>
              {queueDoneAt && (
                <p className="text-xs text-slate-400">
                  If you start now, done at{' '}
                  <span className="text-slate-200">
                    {queueDoneAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {queueDoneAt.toDateString() !== new Date().toDateString() && ` (${queueDoneAt.toLocaleDateString([], { month: 'short', day: 'numeric' })})`}
                  </span>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
