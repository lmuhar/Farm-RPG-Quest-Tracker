import { useMemo, useState } from 'react';
import { Users, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useStore } from '../store';
import npcsData from '../data/npcs.json';
import questsData from '../data/quests.json';
import type { Quest } from '../types';

const allNpcs = npcsData as { name: string; items: string[] }[];
const allQuests = questsData as Quest[];

export function NpcPage() {
  const { player, inventory } = useStore();
  const [search, setSearch] = useState('');
  const [expandedNpc, setExpandedNpc] = useState<string | null>(null);

  // Map npc name -> current friendship level
  const npcLevels = player.npcLevels ?? {};

  // Build a set of NPC names that appear in quests (so we can show only relevant ones)
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
        const inStock = npc.items.filter((item) => (inventory[item] ?? 0) > 0);
        return { ...npc, level, inStock };
      })
      .sort((a, b) => {
        // Sort: NPCs with items in stock first, then by name
        if (b.inStock.length !== a.inStock.length) return b.inStock.length - a.inStock.length;
        return a.name.localeCompare(b.name);
      });
  }, [search, npcLevels, inventory, questNpcNames]);

  return (
    <div className="space-y-4">
      {/* Search */}
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
            return (
              <div key={npc.name}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                  onClick={() => setExpandedNpc(isExpanded ? null : npc.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{npc.name}</span>
                      {npc.inStock.length > 0 && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
                        >
                          {npc.inStock.length} in stock
                        </span>
                      )}
                      {npc.items.length === 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>no favourites data</span>
                      )}
                    </div>
                    {!isExpanded && npc.inStock.length > 0 && (
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {npc.inStock.slice(0, 4).join(', ')}{npc.inStock.length > 4 ? '…' : ''}
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
                  <div className="px-4 pb-3" style={{ background: 'var(--surface-inset)' }}>
                    <p className="text-[10px] font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                      Favourite items
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {npc.items.map((item) => {
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
          })}
        </div>
      </div>
    </div>
  );
}
