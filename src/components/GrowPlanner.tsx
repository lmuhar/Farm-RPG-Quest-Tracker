import { useMemo, useState } from 'react';
import { Sprout, Plus, Minus, Trash2, AlertTriangle } from 'lucide-react';
import questsData from '../data/quests.json';
import itemLocationsData from '../data/item-locations.json';
import type { Quest } from '../types';
import { parseItems, getQuestStatus, calcGrowsNeeded, formatDuration } from '../utils';
import { useStore } from '../store';

const allQuests = questsData as Quest[];
const itemLocations = itemLocationsData as Record<string, { name: string; type: string }[]>;

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
}

type ViewMode = 'total' | 'by-quest';

function buildCropRows(
  itemMap: Map<string, number>,
  cropTimes: { item: string; growMinutes: number }[],
  inventory: Record<string, number>,
  plotCount: number
) {
  return [...itemMap.entries()]
    .map(([item, totalNeeded]) => {
      const ct = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())!;
      const have = inventory[item] ?? 0;
      const stillNeed = Math.max(0, totalNeeded - have);
      const grows = stillNeed === 0 ? 0 : calcGrowsNeeded(stillNeed, plotCount);
      const totalTime = grows * ct.growMinutes;
      return { item, have, totalNeeded, stillNeed, grows, timePerGrow: ct.growMinutes, totalTime };
    })
    .sort((a, b) => {
      // Done items always sink to the bottom
      if (a.stillNeed === 0 && b.stillNeed > 0) return 1;
      if (b.stillNeed === 0 && a.stillNeed > 0) return -1;
      return a.timePerGrow - b.timePerGrow;
    });
}

export function GrowPlanner({ questlineGroups }: Props) {
  const { player, questStatuses, inventory, cropTimes, plotCount, growQueue, setGrowQueue } = useStore();
  const [viewMode, setViewMode] = useState<ViewMode>('total');
  const [selectedQuestId, setSelectedQuestId] = useState<string>('');

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const activeQuests = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'active').map((q) => q.quest),
    [questsWithStatus]
  );

  const activeQuestIds = useMemo(() => new Set(activeQuests.map((q) => q.id)), [activeQuests]);

  // Items in active/upcoming quests that have no grow time AND no known fishing/explore source
  // These are silently ignored by the planner and may be crops the user hasn't configured yet
  const missingCropTimes = useMemo(() => {
    const cropSet = new Set(cropTimes.map((c) => c.item.toLowerCase()));
    const missing = new Map<string, string[]>(); // item → quest names

    const check = (quest: Quest) => {
      for (const { item } of parseItems(quest.itemsRequired)) {
        if (cropSet.has(item.toLowerCase())) continue; // already tracked
        if (itemLocations[item]) continue; // has a known fishing/explore source — not a crop
        if (!missing.has(item)) missing.set(item, []);
        if (!missing.get(item)!.includes(quest.name)) missing.get(item)!.push(quest.name);
      }
    };

    for (const quest of activeQuests) check(quest);

    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeQuestIds.has(q.id))) continue;
      const lastActiveIdx = quests.reduce((max, q, i) => (activeQuestIds.has(q.id) ? i : max), -1);
      for (const quest of quests.slice(lastActiveIdx + 1)) {
        if (questStatuses[quest.id] === 'completed') continue;
        check(quest);
      }
    }

    return [...missing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeQuests, activeQuestIds, questlineGroups, questStatuses, cropTimes]);

  // Total view: active + upcoming quest line crops aggregated
  const totalCropMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const quest of activeQuests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        if (!cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())) continue;
        map.set(item, (map.get(item) ?? 0) + quantity);
      }
    }
    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeQuestIds.has(q.id))) continue;
      const lastActiveIdx = quests.reduce((max, q, i) => (activeQuestIds.has(q.id) ? i : max), -1);
      const upcoming = quests.slice(lastActiveIdx + 1).filter((q) => questStatuses[q.id] !== 'completed');
      for (const quest of upcoming) {
        for (const { item, quantity } of parseItems(quest.itemsRequired)) {
          if (!cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())) continue;
          map.set(item, (map.get(item) ?? 0) + quantity);
        }
      }
    }
    return map;
  }, [questsWithStatus, activeQuestIds, questlineGroups, cropTimes, questStatuses]);

  const totalRows = useMemo(
    () => buildCropRows(totalCropMap, cropTimes, inventory, plotCount),
    [totalCropMap, cropTimes, inventory, plotCount]
  );

  const totalFarmTime = useMemo(() => totalRows.reduce((sum, r) => sum + r.totalTime, 0), [totalRows]);

  // Per-quest view
  const selectedQuest = useMemo(
    () => activeQuests.find((q) => q.id === selectedQuestId) ?? activeQuests[0] ?? null,
    [activeQuests, selectedQuestId]
  );

  const questCropMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedQuest) return map;
    for (const { item, quantity } of parseItems(selectedQuest.itemsRequired)) {
      if (!cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())) continue;
      map.set(item, (map.get(item) ?? 0) + quantity);
    }
    return map;
  }, [selectedQuest, cropTimes]);

  const questRows = useMemo(
    () => buildCropRows(questCropMap, cropTimes, inventory, plotCount),
    [questCropMap, cropTimes, inventory, plotCount]
  );

  const questFarmTime = useMemo(() => questRows.reduce((sum, r) => sum + r.totalTime, 0), [questRows]);

  const rows = viewMode === 'total' ? totalRows : questRows;
  const farmTime = viewMode === 'total' ? totalFarmTime : questFarmTime;

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
      return { item, grows, timePerGrow: ct.growMinutes, totalTime: grows * ct.growMinutes };
    }).filter(Boolean) as { item: string; grows: number; timePerGrow: number; totalTime: number }[];
  }, [growQueue, cropTimes]);

  const queueTotalTime = useMemo(() => queueRows.reduce((sum, r) => sum + r.totalTime, 0), [queueRows]);

  const queueDoneAt = useMemo(() => {
    if (queueTotalTime <= 0) return null;
    return new Date(Date.now() + queueTotalTime * 60 * 1000);
  }, [queueTotalTime]);

  if (activeQuests.length === 0 && totalRows.length === 0) {
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
      {/* Missing grow times warning */}
      {missingCropTimes.length > 0 && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--accent-yellow)' }}>
              {missingCropTimes.length} item{missingCropTimes.length !== 1 ? 's' : ''} from your quests have no grow time — if any are crops, add them in Settings → Crop Grow Times
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {missingCropTimes.map(([item, quests]) => (
              <span
                key={item}
                className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(251,191,36,0.12)', color: 'var(--accent-yellow)', border: '1px solid rgba(251,191,36,0.3)' }}
                title={quests.join(', ')}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700">
        <button
          onClick={() => setViewMode('total')}
          className={`flex-1 py-1.5 px-3 rounded text-sm transition-colors ${viewMode === 'total' ? 'bg-green-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          All active + upcoming
        </button>
        <button
          onClick={() => setViewMode('by-quest')}
          className={`flex-1 py-1.5 px-3 rounded text-sm transition-colors ${viewMode === 'by-quest' ? 'bg-green-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          By quest
        </button>
      </div>

      {/* Quest selector */}
      {viewMode === 'by-quest' && (
        <select
          value={selectedQuestId || selectedQuest?.id || ''}
          onChange={(e) => setSelectedQuestId(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-green-500"
        >
          {activeQuests.map((q) => (
            <option key={q.id} value={q.id}>{q.name} — {q.npc}</option>
          ))}
          {activeQuests.length === 0 && <option disabled>No active quests</option>}
        </select>
      )}

      {/* Summary banner */}
      {rows.length > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-300">
            Total farm time: <span className="text-white">{formatDuration(farmTime)}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {rows.length} crop type{rows.length !== 1 ? 's' : ''} · {plotCount} plots
            {viewMode === 'by-quest' && selectedQuest && ` · ${selectedQuest.name}`}
          </p>
        </div>
      )}

      {rows.length === 0 && viewMode === 'by-quest' && (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-6 text-center">
          <p className="text-slate-500 text-sm">No crop items for this quest.</p>
        </div>
      )}

      {/* Crop table */}
      {rows.length > 0 && (
        <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
            <span className="text-xs text-slate-400">{rows.filter((r) => r.stillNeed > 0).length} crops needed</span>
            {rows.some((r) => r.stillNeed > 0) && (
              <button
                onClick={() => {
                  const needed = rows.filter((r) => r.stillNeed > 0);
                  const next = [...growQueue];
                  for (const { item, grows } of needed) {
                    if (!next.find((q) => q.item === item)) next.push({ item, grows });
                  }
                  setGrowQueue(next);
                }}
                className="text-xs text-green-400 hover:text-green-300 font-medium flex items-center gap-1"
              >
                <Plus size={11} /> Queue all needed
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3">Crop</th>
                <th className="text-right px-4 py-3">Have</th>
                <th className="text-right px-4 py-3">Need</th>
                <th className="text-right px-4 py-3">Grows</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Per grow ↑</th>
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
      )}

      {/* Grow Queue */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
          <Sprout size={14} className="text-green-400" />
          <span className="text-sm font-semibold text-slate-200">Grow Queue</span>
          {growQueue.length > 0 && (
            <button onClick={() => setGrowQueue([])} className="ml-auto text-xs text-slate-500 hover:text-red-400">
              Clear all
            </button>
          )}
        </div>
        {queueRows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Click + on any crop row above to add to queue</p>
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
