import { useState, useEffect, useMemo } from 'react';
import { Search, X, CheckSquare, Square } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { useStore } from '../store';
import { compareQuests } from '../utils';

const allQuests = questsData as Quest[];

interface Props {
  onClose: () => void;
}

export function SetupWizard({ onClose }: Props) {
  const { questStatuses, setQuestStatus } = useStore();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const groups = useMemo(() => {
    const groupMap = new Map<string, Quest[]>();
    for (const q of allQuests) {
      const key = q.questline || '__other__';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(q);
    }
    const sorted = [...groupMap.entries()].map(([name, quests]) => ({
      name,
      quests: [...quests].sort((a, b) => compareQuests(a.name, b.name)),
    })).sort((a, b) => {
      if (a.name === '__other__') return 1;
      if (b.name === '__other__') return -1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const s = search.toLowerCase();
    return groups.map(({ name, quests }) => ({
      name,
      quests: quests.filter(
        (q) => q.name.toLowerCase().includes(s) || q.npc.toLowerCase().includes(s)
      ),
    })).filter(({ quests }) => quests.length > 0);
  }, [groups, search]);

  const getStatus = (id: string) => pending[id] ?? questStatuses[id] === 'completed';

  const toggle = (id: string) => {
    setPending((p) => ({ ...p, [id]: !getStatus(id) }));
  };

  const markAllAbove = (groupQuests: Quest[]) => {
    const updates: Record<string, boolean> = {};
    for (const q of groupQuests) {
      updates[q.id] = true;
    }
    setPending((p) => ({ ...p, ...updates }));
  };

  const applyAndClose = () => {
    for (const [id, completed] of Object.entries(pending)) {
      if (completed && questStatuses[id] !== 'completed') {
        setQuestStatus(id, 'completed');
      } else if (!completed && questStatuses[id] === 'completed') {
        setQuestStatus(id, 'available');
      }
    }
    onClose();
  };

  const pendingCount = Object.values(pending).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center gap-3 p-4 border-b border-slate-700">
          <CheckSquare size={18} className="text-purple-400" />
          <h2 className="text-base font-bold text-white flex-1">Quick Setup — Bulk Mark Completed</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-3 border-b border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search quests or NPCs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-4">
          {filteredGroups.map(({ name, quests }) => (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                  {name === '__other__' ? 'Other' : name}
                </span>
                <button
                  onClick={() => markAllAbove(quests)}
                  className="text-xs text-slate-400 hover:text-purple-300 underline"
                >
                  Mark all complete
                </button>
              </div>
              <div className="space-y-1">
                {quests.map((q) => {
                  const checked = getStatus(q.id);
                  return (
                    <label key={q.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-700/50 cursor-pointer">
                      <span className={`flex-shrink-0 ${checked ? 'text-green-400' : 'text-slate-600'}`}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </span>
                      <input type="checkbox" className="hidden" checked={checked} onChange={() => toggle(q.id)} />
                      <span className={`text-sm ${checked ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                        {q.name}
                      </span>
                      <span className="text-xs text-slate-500 ml-auto">{q.npc}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-700 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{pendingCount} changes pending</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded border border-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={applyAndClose}
              className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
