import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, User } from 'lucide-react';
import { useStore } from '../store';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { getQuestStatus } from '../utils';

const quests = questsData as Quest[];
const allNpcs = [...new Set(quests.map((q) => q.npc))].sort();
const mainNpcs = ['Thomas', 'Rosalie', 'Holger', 'Cecil', 'Beatrix', 'Jill', 'George', 'Lorn', 'Buddy'];

export function SkillsPanel() {
  const { player, questStatuses, setPlayer, setNpcLevel } = useStore();
  const [showAllNpcs, setShowAllNpcs] = useState(false);

  const npcCounts = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const q of quests) {
      const e = map.get(q.npc) ?? { completed: 0, total: 0 };
      e.total++;
      const status = getQuestStatus(q, player, questStatuses);
      if (status === 'completed') e.completed++;
      map.set(q.npc, e);
    }
    return map;
  }, [player, questStatuses]);

  const skills = [
    { key: 'farmingLv', label: 'Farming', emoji: '🌾' },
    { key: 'fishingLv', label: 'Fishing', emoji: '🎣' },
    { key: 'craftingLv', label: 'Crafting', emoji: '🔨' },
    { key: 'exploringLv', label: 'Exploring', emoji: '🗺️' },
  ] as const;

  const displayedNpcs = showAllNpcs ? allNpcs : mainNpcs;

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <User size={16} className="text-purple-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Player Skills</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {skills.map(({ key, label, emoji }) => (
          <div key={key}>
            <label className="text-xs text-slate-400 mb-1 block">{emoji} {label}</label>
            <input
              type="number"
              min={0}
              max={999}
              value={player[key]}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                if (!isNaN(val)) setPlayer({ ...player, [key]: val });
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-700 pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">NPC Levels</span>
          <button
            onClick={() => setShowAllNpcs(!showAllNpcs)}
            className="text-xs text-purple-400 flex items-center gap-1 hover:text-purple-300"
          >
            {showAllNpcs ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showAllNpcs ? 'Show less' : 'Show all'}
          </button>
        </div>
        <div className="space-y-2">
          {displayedNpcs.map((npc) => {
            const counts = npcCounts.get(npc);
            return (
              <div key={npc} className="flex items-center gap-2">
                <span className="text-xs text-slate-300 w-20 truncate flex-shrink-0">{npc}</span>
                {counts && (
                  <span className="text-xs text-slate-500 w-9 flex-shrink-0 text-right">
                    {counts.completed}/{counts.total}
                  </span>
                )}
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={player.npcLevels[npc] ?? 0}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    if (!isNaN(val)) setNpcLevel(npc, val);
                  }}
                  className="w-14 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
