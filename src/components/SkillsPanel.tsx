import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, User, TrendingUp } from 'lucide-react';
import { useStore } from '../store';
import questsData from '../data/quests.json';
import type { Quest, PlayerProfile } from '../types';
import { getQuestStatus } from '../utils';

const quests = questsData as Quest[];
const allNpcs = [...new Set(quests.map((q) => q.npc))].sort();
const mainNpcs = ['Thomas', 'Rosalie', 'Holger', 'Cecil', 'Beatrix', 'Jill', 'George', 'Lorn', 'Buddy'];

type SkillKey = 'farmingLv' | 'fishingLv' | 'craftingLv' | 'exploringLv';

function computeLevelRecommendations(player: PlayerProfile, questStatuses: Record<string, string>) {
  const skillDefs: { key: SkillKey; label: string; emoji: string; questField: keyof Quest }[] = [
    { key: 'farmingLv', label: 'Farming', emoji: '🌾', questField: 'farmingLv' },
    { key: 'fishingLv', label: 'Fishing', emoji: '🎣', questField: 'fishingLv' },
    { key: 'craftingLv', label: 'Crafting', emoji: '🔨', questField: 'craftingLv' },
    { key: 'exploringLv', label: 'Exploring', emoji: '🗺️', questField: 'exploringLv' },
  ];

  // Currently locked quests (not completed/active)
  const lockedQuests = quests.filter((q) => {
    const s = questStatuses[q.id];
    return s !== 'completed' && s !== 'active';
  });

  type Rec = { level: number; unlocks: number };
  const results: { key: SkillKey; label: string; emoji: string; best: Rec | null; breakdowns: Rec[] }[] = [];

  for (const { key, label, emoji, questField } of skillDefs) {
    const currentLevel = player[key];
    // Find all thresholds above current level in data
    const thresholds = [...new Set(
      lockedQuests
        .map((q) => q[questField] as number)
        .filter((lv) => lv > currentLevel)
    )].sort((a, b) => a - b);

    const breakdowns: Rec[] = [];
    for (const threshold of thresholds) {
      // Count quests that would become unlocked if this skill were at threshold
      // (ignoring other requirements — just this skill being the blocker)
      const count = lockedQuests.filter((q) => {
        const needed = q[questField] as number;
        if (needed === 0 || needed <= currentLevel) return false; // not blocked by this skill
        if (needed > threshold) return false; // still blocked even at threshold
        // Would this quest be unlocked? Check other skill reqs would pass with current player
        const testPlayer: PlayerProfile = { ...player, [key]: threshold };
        const wouldBeAvailable = getQuestStatus(q, testPlayer, questStatuses as Record<string, import('../types').QuestStatus>) === 'available';
        return wouldBeAvailable;
      }).length;
      if (count > 0) breakdowns.push({ level: threshold, unlocks: count });
    }

    const best = breakdowns.reduce<Rec | null>((max, r) => (!max || r.unlocks > max.unlocks) ? r : max, null);
    results.push({ key, label, emoji, best, breakdowns });
  }

  return results;
}

export function SkillsPanel() {
  const { player, questStatuses, setPlayer, setNpcLevel } = useStore();
  const [showAllNpcs, setShowAllNpcs] = useState(false);
  const [showLevelRecs, setShowLevelRecs] = useState(false);

  const levelRecs = useMemo(() => computeLevelRecommendations(player, questStatuses), [player, questStatuses]);

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

      {/* What to level next */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <button
          onClick={() => setShowLevelRecs(!showLevelRecs)}
          className="flex items-center gap-2 w-full text-left hover:text-slate-100 transition-colors"
        >
          <TrendingUp size={14} className="text-green-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex-1">What to level next?</span>
          {showLevelRecs ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
        </button>
        {showLevelRecs && (
          <div className="mt-3 space-y-3">
            {levelRecs.map(({ key, label, emoji, best, breakdowns }) => (
              <div key={key}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-slate-300">{emoji} {label}</span>
                  {best ? (
                    <span className="text-xs text-green-400 font-medium">
                      Raise to {best.level} → unlocks {best.unlocks} quest{best.unlocks !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">no new unlocks</span>
                  )}
                </div>
                {breakdowns.length > 0 && (
                  <div className="ml-4 space-y-0.5">
                    {breakdowns.slice(0, 4).map(({ level, unlocks }) => (
                      <div key={level} className="text-xs text-slate-500 flex gap-2">
                        <span className="w-12">lv {level}</span>
                        <span className="text-slate-400">+{unlocks} quest{unlocks !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                    {breakdowns.length > 4 && (
                      <div className="text-xs text-slate-600">+{breakdowns.length - 4} more thresholds…</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
