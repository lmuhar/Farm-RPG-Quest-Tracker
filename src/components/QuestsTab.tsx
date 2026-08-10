import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { Quest } from '../types';
import { getQuestStatus, isLimitedTime, isCompletable } from '../utils';
import { useStore } from '../store';
import { QuestCard } from './QuestCard';
import questsData from '../data/quests.json';

const allQuests = questsData as Quest[];
const npcs = [...new Set(allQuests.map((q) => q.npc))].sort();

type FilterStatus = 'all' | 'available' | 'locked' | 'completed' | 'completable' | 'limited';

interface Props {
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
}

export function QuestsTab({ globalSearch, setGlobalSearch }: Props) {
  const { player, questStatuses, inventory } = useStore();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterNpc, setFilterNpc] = useState('');

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const filteredQuests = useMemo(() => {
    return questsWithStatus.filter(({ quest, status }) => {
      if (filterStatus === 'limited') {
        if (!isLimitedTime(quest)) return false;
      } else if (filterStatus === 'completable') {
        if (status === 'completed' || status === 'locked') return false;
        if (!isCompletable(quest, inventory)) return false;
      } else if (filterStatus !== 'all' && status !== filterStatus) {
        return false;
      }
      if (filterNpc && quest.npc !== filterNpc) return false;
      const s = globalSearch.toLowerCase();
      if (s) {
        return (
          quest.name.toLowerCase().includes(s) ||
          quest.npc.toLowerCase().includes(s) ||
          quest.questline.toLowerCase().includes(s) ||
          quest.description.toLowerCase().includes(s) ||
          quest.itemsRequired.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [questsWithStatus, filterStatus, filterNpc, globalSearch, inventory]);

  const hasFilters = !!(globalSearch || filterNpc || filterStatus !== 'all');

  const inputStyle = {
    background: 'var(--surface-inset)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Filter by quest, item, NPC…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="all">All statuses</option>
            <option value="completable">Completable now</option>
            <option value="available">Available</option>
            <option value="locked">Locked</option>
            <option value="completed">Completed</option>
            <option value="limited">Limited time</option>
          </select>
          <select
            value={filterNpc}
            onChange={(e) => setFilterNpc(e.target.value)}
            className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="">All NPCs</option>
            {npcs.map((npc) => (
              <option key={npc} value={npc}>{npc}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setGlobalSearch(''); setFilterNpc(''); setFilterStatus('all'); }}
              className="flex items-center gap-1 px-2 py-2 text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {filteredQuests.length} {hasFilters ? 'results' : 'quests'}
      </p>

      <div className="space-y-2">
        {filteredQuests.slice(0, 200).map(({ quest, status }) => (
          <QuestCard key={quest.id} quest={quest} status={status} />
        ))}
        {filteredQuests.length > 200 && (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>
            Showing first 200 — use search/filters to narrow results
          </p>
        )}
      </div>
    </div>
  );
}
