import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import { QuestLineView } from './QuestLineView';

interface Props {
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function QuestlinesTab({ questlineGroups }: Props) {
  const { questStatuses } = useStore();
  const [search, setSearch] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

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
    if (showCompleted) return filtered;
    return filtered.filter(
      ({ quests }) => quests.filter((q) => questStatuses[q.id] === 'completed').length < quests.length
    );
  }, [filtered, showCompleted, questStatuses]);

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

      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{visible.length} quest lines</p>
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className="text-xs px-2 py-1 rounded transition-colors"
          style={{
            background: showCompleted ? 'var(--surface-inset)' : 'var(--surface-card)',
            color: showCompleted ? 'var(--text-secondary)' : 'var(--text-muted)',
            border: '1px solid var(--border-default)',
          }}
        >
          {showCompleted ? 'Hide completed lines' : 'Show completed lines'}
        </button>
      </div>

      {visible.map(({ name, quests }) => (
        <QuestLineView key={name} questline={name} quests={quests} />
      ))}
    </div>
  );
}
