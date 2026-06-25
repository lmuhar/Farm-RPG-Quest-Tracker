import { useMemo } from 'react';
import { Sprout } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { parseItems, getQuestStatus, calcGrowsNeeded, formatDuration } from '../utils';
import { useStore } from '../store';

const allQuests = questsData as Quest[];

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function GrowPlanner({ questlineGroups }: Props) {
  const { player, questStatuses, inventory, cropTimes, plotCount } = useStore();

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
