import { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import { getQuestStatus, compareQuests } from '../utils';
import questsData from '../data/quests.json';

const allQuests = questsData as Quest[];

interface GateEntry {
  npc: string;
  currentLevel: number;
  neededLevel: number;
  questName: string;
  levelsAway: number;
}

interface Props {
  activeQuests: Quest[];
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function NpcGatesCard({ activeQuests, questlineGroups }: Props) {
  const { player, questStatuses } = useStore();

  const gates = useMemo((): GateEntry[] => {
    const activeIds = new Set(activeQuests.map((q) => q.id));
    const seen = new Set<string>(); // npc key to dedupe
    const result: GateEntry[] = [];

    // For each questline with active quests, find the next locked/available quest
    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeIds.has(q.id))) continue;
      const sorted = [...quests].sort((a, b) => compareQuests(a.name, b.name));

      // Find the first quest after the last active one that isn't completed
      const lastActiveIdx = sorted.reduce((max, q, i) => (activeIds.has(q.id) ? i : max), -1);
      if (lastActiveIdx < 0) continue;

      for (let i = lastActiveIdx + 1; i < sorted.length; i++) {
        const q = sorted[i];
        const status = getQuestStatus(q, player, questStatuses);
        if (status === 'completed') continue;

        // This is the next upcoming quest — check if NPC level is the blocker
        const currentNpcLevel = player.npcLevels[q.npc] ?? 0;
        if (q.requiredNpcLevel > currentNpcLevel) {
          const key = `${q.npc}-${q.requiredNpcLevel}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({
              npc: q.npc,
              currentLevel: currentNpcLevel,
              neededLevel: q.requiredNpcLevel,
              questName: q.name,
              levelsAway: q.requiredNpcLevel - currentNpcLevel,
            });
          }
        }
        break; // only look at first upcoming quest per questline
      }
    }

    // Also check standalone active quests that reference quests needing NPC level
    for (const quest of allQuests) {
      const status = getQuestStatus(quest, player, questStatuses);
      if (status !== 'available' && status !== 'locked') continue;
      if (questStatuses[quest.id]) continue; // already has a manual status
      const currentNpcLevel = player.npcLevels[quest.npc] ?? 0;
      if (quest.requiredNpcLevel > currentNpcLevel) {
        // Only include if a directly preceding quest is active
        const key = `${quest.npc}-${quest.requiredNpcLevel}`;
        if (!seen.has(key)) {
          // Check if any active quest is from same questline and close in line
          const sameLineActive = activeQuests.some((q) => q.questline && q.questline === quest.questline);
          if (sameLineActive) {
            seen.add(key);
            result.push({
              npc: quest.npc,
              currentLevel: currentNpcLevel,
              neededLevel: quest.requiredNpcLevel,
              questName: quest.name,
              levelsAway: quest.requiredNpcLevel - currentNpcLevel,
            });
          }
        }
      }
    }

    return result.sort((a, b) => a.levelsAway - b.levelsAway);
  }, [activeQuests, questlineGroups, player, questStatuses]);

  if (gates.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <Users size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          NPC Friendship Gates
        </p>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
        >
          {gates.length}
        </span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        NPC levels needed to unlock your next quests.
      </p>
      <div className="space-y-2">
        {gates.map((g) => (
          <div
            key={`${g.npc}-${g.neededLevel}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{g.npc}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>→ {g.questName}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
              >
                Lv {g.currentLevel}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>→</span>
              <span
                className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                style={
                  g.levelsAway <= 2
                    ? { background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }
                    : { background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }
                }
              >
                Lv {g.neededLevel}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
