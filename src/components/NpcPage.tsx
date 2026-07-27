import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight, Search, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { getQuestStatus, compareQuests, parseItems } from '../utils';
import npcsData from '../data/npcs.json';
import questsData from '../data/quests.json';
import type { Quest } from '../types';

const allNpcs = npcsData as { name: string; items: string[] }[];
const allQuests = questsData as Quest[];

function FavouriteItems({
  items,
  inventory,
  activeNeeds,
  upcomingNeeds,
}: {
  items: string[];
  inventory: Record<string, number>;
  activeNeeds: Map<string, string[]>;
  upcomingNeeds: Map<string, string[]>;
}) {
  const keepItems = items.filter((i) => activeNeeds.has(i) || upcomingNeeds.has(i));
  const safeItems = items.filter((i) => !activeNeeds.has(i) && !upcomingNeeds.has(i));

  return (
    <div className="space-y-2.5">
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
  );
}

export function NpcPage() {
  const { player, questStatuses, inventory } = useStore();
  const [search, setSearch] = useState('');
  const [expandedNpc, setExpandedNpc] = useState<string | null>(null);

  const npcLevels = player.npcLevels ?? {};

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const activeQuests = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'active').map((q) => q.quest),
    [questsWithStatus]
  );

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
    const groups = new Map<string, Quest[]>();
    for (const q of allQuests) {
      if (!q.questline) continue;
      if (!groups.has(q.questline)) groups.set(q.questline, []);
      groups.get(q.questline)!.push(q);
    }

    const map = new Map<string, string[]>();
    for (const quests of groups.values()) {
      if (!quests.some((q) => activeIds.has(q.id))) continue;
      const sorted = [...quests].sort((a, b) => compareQuests(a.name, b.name));
      const lastActiveIdx = sorted.reduce((max, q, i) => (activeIds.has(q.id) ? i : max), -1);
      if (lastActiveIdx < 0) continue;
      for (const quest of sorted.slice(lastActiveIdx + 1)) {
        if (questStatuses[quest.id] === 'completed') continue;
        for (const { item } of parseItems(quest.itemsRequired)) {
          if (activeNeeds.has(item)) continue; // already flagged as active need
          if (!map.has(item)) map.set(item, []);
          map.get(item)!.push(quest.name);
        }
      }
    }
    return map;
  }, [activeQuests, questStatuses, activeNeeds]);

  const questNpcNames = useMemo(() => new Set(allQuests.map((q) => q.npc)), []);

  const npcs = useMemo(() => {
    const s = search.toLowerCase();
    return allNpcs
      .filter((npc) => {
        if (!questNpcNames.has(npc.name)) return false;
        if (s) return npc.name.toLowerCase().includes(s) || npc.items.some((i) => i.toLowerCase().includes(s));
        return true;
      })
      .map((npc) => {
        const level = npcLevels[npc.name] ?? 0;
        const safeInStock = npc.items.filter(
          (item) => (inventory[item] ?? 0) > 0 && !activeNeeds.has(item) && !upcomingNeeds.has(item)
        );
        const conflictInStock = npc.items.filter(
          (item) => (inventory[item] ?? 0) > 0 && (activeNeeds.has(item) || upcomingNeeds.has(item))
        );
        return { ...npc, level, safeInStock, conflictInStock };
      })
      .sort((a, b) => {
        // NPCs with safe giveables first, then by name
        const aScore = a.safeInStock.length * 2 + a.conflictInStock.length;
        const bScore = b.safeInStock.length * 2 + b.conflictInStock.length;
        if (bScore !== aScore) return bScore - aScore;
        return a.name.localeCompare(b.name);
      });
  }, [search, npcLevels, inventory, questNpcNames, activeNeeds, upcomingNeeds]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search NPCs or items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none"
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Users size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            NPC Friendship
          </p>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
          >
            {npcs.length}
          </span>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {npcs.map((npc) => {
            const isExpanded = expandedNpc === npc.name;
            const hasConflict = npc.conflictInStock.length > 0;
            return (
              <div key={npc.name}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                  onClick={() => setExpandedNpc(isExpanded ? null : npc.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{npc.name}</span>
                      {npc.safeInStock.length > 0 && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
                        >
                          {npc.safeInStock.length} safe to give
                        </span>
                      )}
                      {hasConflict && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                        >
                          <AlertTriangle size={9} />
                          {npc.conflictInStock.length} quest conflict
                        </span>
                      )}
                      {npc.items.length === 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>no favourites data</span>
                      )}
                    </div>
                    {!isExpanded && npc.safeInStock.length > 0 && (
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {npc.safeInStock.slice(0, 4).join(', ')}{npc.safeInStock.length > 4 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                    >
                      Lv {npc.level}
                    </span>
                    {npc.items.length > 0 && (
                      isExpanded
                        ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                </button>
                {isExpanded && npc.items.length > 0 && (
                  <div className="px-4 pb-3 pt-2" style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}>
                    <FavouriteItems
                      items={npc.items}
                      inventory={inventory}
                      activeNeeds={activeNeeds}
                      upcomingNeeds={upcomingNeeds}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
