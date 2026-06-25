import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { getQuestStatus } from '../utils';
import { useStore } from '../store';

const allQuests = questsData as Quest[];

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function StatsTab({ questlineGroups }: Props) {
  const { player, questStatuses } = useStore();

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const overall = useMemo(() => {
    const completed = questsWithStatus.filter((q) => q.status === 'completed').length;
    const active = questsWithStatus.filter((q) => q.status === 'active').length;
    const available = questsWithStatus.filter((q) => q.status === 'available').length;
    const locked = questsWithStatus.filter((q) => q.status === 'locked').length;
    return { completed, active, available, locked, total: allQuests.length };
  }, [questsWithStatus]);

  const byNpc = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const { quest, status } of questsWithStatus) {
      const entry = map.get(quest.npc) ?? { completed: 0, total: 0 };
      entry.total++;
      if (status === 'completed') entry.completed++;
      map.set(quest.npc, entry);
    }
    return [...map.entries()]
      .map(([npc, counts]) => ({ npc, ...counts }))
      .sort((a, b) => b.completed - a.completed || a.npc.localeCompare(b.npc));
  }, [questsWithStatus]);

  const bySkill = useMemo(() => {
    const skills = [
      { key: 'farmingLv' as const, label: 'Farming', emoji: '🌾' },
      { key: 'fishingLv' as const, label: 'Fishing', emoji: '🎣' },
      { key: 'craftingLv' as const, label: 'Crafting', emoji: '🔨' },
      { key: 'exploringLv' as const, label: 'Exploring', emoji: '🗺️' },
    ];
    return skills.map(({ key, label, emoji }) => {
      const relevant = questsWithStatus.filter(({ quest }) => quest[key] > 0);
      const completed = relevant.filter(({ status }) => status === 'completed').length;
      return { label, emoji, completed, total: relevant.length };
    });
  }, [questsWithStatus]);

  const questlineStats = useMemo(() => {
    let fullyCompleted = 0, inProgress = 0, notStarted = 0;
    for (const { quests } of questlineGroups) {
      const statuses = quests.map((q) => getQuestStatus(q, player, questStatuses));
      const completedCount = statuses.filter((s) => s === 'completed').length;
      if (completedCount === quests.length) fullyCompleted++;
      else if (completedCount > 0 || statuses.some((s) => s === 'active')) inProgress++;
      else notStarted++;
    }
    return { fullyCompleted, inProgress, notStarted, total: questlineGroups.length };
  }, [questlineGroups, player, questStatuses]);

  const progressPct = Math.round((overall.completed / overall.total) * 100);

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={16} className="text-purple-400" />
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Overall Progress</h2>
          <span className="ml-auto text-2xl font-bold text-white">{progressPct}%</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Completed', value: overall.completed, color: 'text-green-400' },
            { label: 'Active', value: overall.active, color: 'text-yellow-400' },
            { label: 'Available', value: overall.available, color: 'text-slate-300' },
            { label: 'Locked', value: overall.locked, color: 'text-slate-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-700/40 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2 text-center">{overall.total} total quests</p>
      </div>

      {/* By NPC */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">By NPC</h2>
        <div className="space-y-2">
          {byNpc.map(({ npc, completed, total }) => {
            const pct = Math.round((completed / total) * 100);
            return (
              <div key={npc}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-slate-300">{npc}</span>
                  <span className="text-slate-400">{completed}/{total}</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By skill */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">By Skill Requirement</h2>
        <div className="grid grid-cols-2 gap-3">
          {bySkill.map(({ label, emoji, completed, total }) => {
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <div key={label} className="bg-slate-700/30 rounded-lg p-3">
                <div className="flex items-center gap-1 mb-1">
                  <span>{emoji}</span>
                  <span className="text-xs text-slate-300 font-medium">{label}</span>
                </div>
                <div className="text-lg font-bold text-white">{completed}<span className="text-xs text-slate-400 font-normal">/{total}</span></div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quest lines */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">Quest Lines</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Fully Completed', value: questlineStats.fullyCompleted, color: 'text-green-400' },
            { label: 'In Progress', value: questlineStats.inProgress, color: 'text-yellow-400' },
            { label: 'Not Started', value: questlineStats.notStarted, color: 'text-slate-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-700/40 rounded-lg p-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2 text-center">{questlineStats.total} total quest lines</p>
      </div>
    </div>
  );
}
