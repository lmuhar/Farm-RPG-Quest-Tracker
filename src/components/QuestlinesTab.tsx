import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import { QuestLineView } from './QuestLineView';

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
  globalSearch?: string;
  setGlobalSearch?: (v: string) => void;
}

export function QuestlinesTab({ questlineGroups, globalSearch, setGlobalSearch }: Props) {
  const { questStatuses } = useStore();
  const [localSearch, setLocalSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [activeOnly, setActiveOnly] = useState(false);

  const search = globalSearch ?? localSearch;
  const setSearch = setGlobalSearch ?? setLocalSearch;

  const filtered = useMemo(() => {
    if (!search) return questlineGroups;
    const s = search.toLowerCase();
    return questlineGroups.filter(
      ({ name, quests }) =>
        name.toLowerCase().includes(s) ||
        quests.some(
          (q) =>
            q.name.toLowerCase().includes(s) ||
            q.itemsRequired.toLowerCase().includes(s) ||
            q.npc.toLowerCase().includes(s)
        )
    );
  }, [questlineGroups, search]);

  const visible = useMemo(() => {
    let result = filtered;
    if (!showCompleted)
      result = result.filter(
        ({ quests }) => quests.filter((q) => questStatuses[q.id] === 'completed').length < quests.length
      );
    if (activeOnly)
      result = result.filter(({ quests }) => quests.some((q) => questStatuses[q.id] === 'active'));
    return result;
  }, [filtered, showCompleted, activeOnly, questStatuses]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search quest lines by name, NPC, or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none"
          style={{
            background: 'var(--surface-inset)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{visible.length} quest lines</p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveOnly((v) => !v)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              background: activeOnly ? 'var(--accent-green-bg)' : 'var(--surface-inset)',
              color: activeOnly ? 'var(--accent-green)' : 'var(--text-muted)',
              border: `1px solid ${activeOnly ? 'var(--accent-green-border)' : 'var(--border-default)'}`,
            }}
          >
            Active only
          </button>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{
              background: showCompleted ? 'var(--surface-inset)' : 'var(--surface-card)',
              color: showCompleted ? 'var(--text-secondary)' : 'var(--text-muted)',
              border: '1px solid var(--border-default)',
            }}
          >
            {showCompleted ? 'Hide completed' : 'Show completed'}
          </button>
        </div>
      </div>

      {visible.map(({ name, quests }) => (
        <QuestLineView key={name} questline={name} quests={quests} />
      ))}
    </div>
  );
}
