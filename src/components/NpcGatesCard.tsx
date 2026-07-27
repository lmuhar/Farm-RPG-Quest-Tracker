import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import { getQuestStatus, compareQuests, parseItems } from '../utils';
import questsData from '../data/quests.json';
import npcsData from '../data/npcs.json';

const allQuests = questsData as Quest[];
const npcFavorites = npcsData as { name: string; items: string[] }[];

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
  const { player, questStatuses, inventory } = useStore();
  const [expandedNpc, setExpandedNpc] = useState<string | null>(null);

  const gates = useMemo((): GateEntry[] => {
    const activeIds = new Set(activeQuests.map((q) => q.id));
    const seen = new Set<string>();
    const result: GateEntry[] = [];

    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeIds.has(q.id))) continue;
      const sorted = [...quests].sort((a, b) => compareQuests(a.name, b.name));
      const lastActiveIdx = sorted.reduce((max, q, i) => (activeIds.has(q.id) ? i : max), -1);
      if (lastActiveIdx < 0) continue;

      for (let i = lastActiveIdx + 1; i < sorted.length; i++) {
        const q = sorted[i];
        const status = getQuestStatus(q, player, questStatuses);
        if (status === 'completed') continue;
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
        break;
      }
    }

    for (const quest of allQuests) {
      const status = getQuestStatus(quest, player, questStatuses);
      if (status !== 'available' && status !== 'locked') continue;
      if (questStatuses[quest.id]) continue;
      const currentNpcLevel = player.npcLevels[quest.npc] ?? 0;
      if (quest.requiredNpcLevel > currentNpcLevel) {
        const key = `${quest.npc}-${quest.requiredNpcLevel}`;
        if (!seen.has(key)) {
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

  // Items with a deficit in active quests: item → quest names
  const activeNeeds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const quest of activeQuests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const have = inventory[item] ?? 0;
        if (have < quantity) {
          if (!map.has(item)) map.set(item, []);
          map.get(item)!.push(quest.name);
        }
      }
    }
    return map;
  }, [activeQuests, inventory]);

  // Items needed in upcoming questline quests: item → quest names
  const upcomingNeeds = useMemo(() => {
    const activeIds = new Set(activeQuests.map((q) => q.id));
    const map = new Map<string, string[]>();
    for (const { quests } of questlineGroups) {
      if (!quests.some((q) => activeIds.has(q.id))) continue;
      const sorted = [...quests].sort((a, b) => compareQuests(a.name, b.name));
      const lastActiveIdx = sorted.reduce((max, q, i) => (activeIds.has(q.id) ? i : max), -1);
      if (lastActiveIdx < 0) continue;
      for (const quest of sorted.slice(lastActiveIdx + 1)) {
        if (questStatuses[quest.id] === 'completed') continue;
        for (const { item } of parseItems(quest.itemsRequired)) {
          if (activeNeeds.has(item)) continue;
          if (!map.has(item)) map.set(item, []);
          map.get(item)!.push(quest.name);
        }
      }
    }
    return map;
  }, [activeQuests, questlineGroups, questStatuses, activeNeeds]);

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
        {gates.map((g) => {
          const favorites = npcFavorites.find((n) => n.name === g.npc)?.items ?? [];
          const isExpanded = expandedNpc === g.npc;

          const keepItems = favorites.filter((i) => activeNeeds.has(i) || upcomingNeeds.has(i));
          const safeItems = favorites.filter((i) => !activeNeeds.has(i) && !upcomingNeeds.has(i));
          const safeInStock = safeItems.filter((i) => (inventory[i] ?? 0) > 0);
          const conflictInStock = keepItems.filter((i) => (inventory[i] ?? 0) > 0);

          return (
            <div
              key={`${g.npc}-${g.neededLevel}`}
              className="rounded-lg overflow-hidden"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }}
            >
              <button
                className="w-full flex items-center gap-3 px-3 py-2 text-left"
                onClick={() => setExpandedNpc(isExpanded ? null : g.npc)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{g.npc}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>→ {g.questName}</span>
                    {safeInStock.length > 0 && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
                      >
                        {safeInStock.length} safe to give
                      </span>
                    )}
                    {conflictInStock.length > 0 && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                      >
                        <AlertTriangle size={9} />
                        {conflictInStock.length} keep for quests
                      </span>
                    )}
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
                  {favorites.length > 0 && (
                    isExpanded
                      ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      : <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                </div>
              </button>

              {isExpanded && favorites.length > 0 && (
                <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {/* Keep section */}
                  {keepItems.length > 0 && (
                    <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: '#f87171' }}>
                        <AlertTriangle size={10} />
                        Don't give — needed for your quests
                      </p>
                      {keepItems.map((item) => {
                        const have = inventory[item] ?? 0;
                        const isActive = activeNeeds.has(item);
                        const quests = (isActive ? activeNeeds.get(item) : upcomingNeeds.get(item)) ?? [];
                        const label = isActive ? 'active' : 'upcoming';
                        const labelColor = isActive ? '#f87171' : 'var(--accent-yellow)';
                        return (
                          <div key={item} className="flex items-baseline gap-2 flex-wrap">
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                              style={
                                have > 0
                                  ? { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }
                                  : { background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }
                              }
                            >
                              {item}{have > 0 ? ` ×${have}` : ''}
                            </span>
                            <span className="text-[10px]" style={{ color: labelColor }}>
                              {label}: {quests.slice(0, 2).join(', ')}{quests.length > 2 ? ` +${quests.length - 2} more` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Safe section */}
                  {safeItems.length > 0 && (
                    <div>
                      {keepItems.length > 0 && (
                        <p className="text-[10px] font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--accent-green)' }}>
                          Safe to give
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {safeItems.map((item) => {
                          const have = inventory[item] ?? 0;
                          return (
                            <span
                              key={item}
                              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                              style={
                                have > 0
                                  ? { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }
                                  : { background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }
                              }
                            >
                              {item}{have > 0 ? ` ×${have}` : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
