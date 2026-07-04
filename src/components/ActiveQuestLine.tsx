import { useState } from 'react';
import { GitBranch, ChevronRight, ChevronDown } from 'lucide-react';
import type { Quest } from '../types';
import { getQuestStatus } from '../utils';
import { useStore } from '../store';
import { QuestCard } from './QuestCard';

interface Props {
  questline: string;
  quests: Quest[];
}

const statusDot = {
  completed: 'bg-green-500',
  active: 'bg-yellow-400',
  available: 'bg-slate-400',
  locked: 'bg-slate-700',
} as const;

export function ActiveQuestLine({ questline, quests }: Props) {
  const { player, questStatuses } = useStore();
  const [showUpcoming, setShowUpcoming] = useState(true);

  const statuses = quests.map((q) => getQuestStatus(q, player, questStatuses));
  const completedCount = statuses.filter((s) => s === 'completed').length;
  const progress = Math.round((completedCount / quests.length) * 100);

  const lastActiveIdx = statuses.reduce((max, s, i) => (s === 'active' ? i : max), -1);
  const upcomingQuests = lastActiveIdx >= 0
    ? quests
        .slice(lastActiveIdx + 1)
        .map((q, i) => ({ quest: q, status: statuses[lastActiveIdx + 1 + i] }))
        .filter(({ status }) => status !== 'completed' && status !== 'active')
    : [];

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
        <GitBranch size={13} className="text-purple-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-200 flex-1 truncate">{questline}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-0.5">
            {quests.slice(0, 10).map((q, i) => (
              <div
                key={q.id}
                className={`w-2 h-2 rounded-full ${statusDot[statuses[i]]}`}
                title={`${q.name} (${statuses[i]})`}
              />
            ))}
            {quests.length > 10 && (
              <span className="text-xs text-slate-600 ml-1">+{quests.length - 10}</span>
            )}
          </div>
          <span className="text-xs text-slate-500">{completedCount}/{quests.length}</span>
          <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {quests
          .filter((_, i) => statuses[i] === 'active')
          .map((quest) => (
            <QuestCard key={quest.id} quest={quest} status="active" />
          ))}

        {upcomingQuests.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowUpcoming(!showUpcoming)}
              className="flex items-center gap-1.5 px-1 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors w-full"
            >
              {showUpcoming ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span>{upcomingQuests.length} upcoming quest{upcomingQuests.length !== 1 ? 's' : ''}</span>
            </button>
            {showUpcoming && (
              <div className="space-y-2 mt-1">
                {upcomingQuests.map(({ quest, status }, i) => (
                  <div key={quest.id} className="opacity-50 hover:opacity-75 transition-opacity">
                    <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1 pl-1">
                      <ChevronRight size={11} />
                      {i === 0 ? 'Up next' : `+${i} ahead`}
                    </p>
                    <QuestCard quest={quest} status={status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
