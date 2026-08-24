import { useMemo, useState } from 'react';
import { Package, Plus, Trash2, Search, X, Lock, ChevronDown } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { useStore } from '../store';
import { parseItems, getQuestStatus, compareQuests } from '../utils';

const allQuests = questsData as Quest[];

// Inline badge component
function Badge({ tone, children }: { tone: 'deficit' | 'success' | 'locked' | 'future'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    deficit: { background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' },
    success: { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' },
    locked: { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' },
    future: { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' },
  };
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ fontFamily: 'var(--font-mono)', ...styles[tone] }}
    >
      {children}
    </span>
  );
}

export function InventoryPage() {
  const { player, questStatuses, inventory, setInventoryItem } = useStore();
  const [search, setSearch] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [lookupItem, setLookupItem] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'qty' | 'deficit'>('deficit');

  // Aggregate items needed from all active quests
  const activeNeeds = useMemo(() => {
    const map = new Map<string, { needed: number; quests: string[] }>();
    for (const quest of allQuests) {
      const status = getQuestStatus(quest, player, questStatuses);
      if (status !== 'active') continue;
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const entry = map.get(item) ?? { needed: 0, quests: [] };
        entry.needed += quantity;
        if (!entry.quests.includes(quest.name)) entry.quests.push(quest.name);
        map.set(item, entry);
      }
    }
    return new Map([...map.entries()].map(([item, { needed, quests }]) => {
      const have = inventory[item] ?? 0;
      return [item, { needed, have, deficit: Math.max(0, needed - have), quests }];
    }));
  }, [player, questStatuses, inventory]);

  // Items needed in the next 5 quests of each active questline
  const futureNeeds = useMemo(() => {
    const questlineMap = new Map<string, Quest[]>();
    for (const q of allQuests) {
      if (!q.questline) continue;
      if (!questlineMap.has(q.questline)) questlineMap.set(q.questline, []);
      questlineMap.get(q.questline)!.push(q);
    }
    for (const [, qs] of questlineMap) qs.sort((a, b) => compareQuests(a.name, b.name));

    const itemMap = new Map<string, { needed: number; entries: { questName: string; stepsAhead: number }[] }>();
    for (const quest of allQuests) {
      if (questStatuses[quest.id] !== 'active') continue;
      if (!quest.questline) continue;
      const line = questlineMap.get(quest.questline) ?? [];
      const idx = line.findIndex((q) => q.id === quest.id);
      if (idx === -1) continue;
      line.slice(idx + 1, idx + 6).forEach((upq, i) => {
        for (const { item, quantity } of parseItems(upq.itemsRequired)) {
          if (!itemMap.has(item)) itemMap.set(item, { needed: 0, entries: [] });
          const entry = itemMap.get(item)!;
          entry.needed += quantity;
          entry.entries.push({ questName: upq.name, stepsAhead: i + 1 });
        }
      });
    }
    return new Map([...itemMap.entries()].map(([item, { needed, entries }]) => [
      item,
      {
        needed,
        have: inventory[item] ?? 0,
        entries: entries.sort((a, b) => a.stepsAhead - b.stepsAhead),
        minSteps: Math.min(...entries.map((e) => e.stepsAhead)),
      },
    ]));
  }, [questStatuses, inventory]);

  // All quests needing a looked-up item
  const lookupResults = useMemo(() => {
    if (!lookupItem) return null;
    const statusOrder = { active: 0, available: 1, locked: 2, completed: 3 } as const;
    return allQuests
      .flatMap((q) => {
        const match = parseItems(q.itemsRequired).find((i) => i.item === lookupItem);
        if (!match) return [];
        const status = getQuestStatus(q, player, questStatuses);
        return [{ quest: q, quantity: match.quantity, status }];
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [lookupItem, player, questStatuses]);

  // Full inventory list
  const inventoryItems = useMemo(() => {
    const s = search.toLowerCase();
    const entries = Object.entries(inventory)
      .filter(([item, qty]) => qty > 0 && (!s || item.toLowerCase().includes(s)))
      .map(([item, qty]) => {
        const activeNeed = activeNeeds.get(item);
        const futureNeed = !activeNeed ? futureNeeds.get(item) : undefined;
        return { item, qty, activeNeed, futureNeed };
      });

    return entries.sort((a, b) => {
      if (sortBy === 'name') return a.item.localeCompare(b.item);
      if (sortBy === 'qty') return b.qty - a.qty;
      // deficit first: items with active deficit sorted by % complete desc (almost done first), then future need, then rest
      const aHasDef = !!a.activeNeed?.deficit;
      const bHasDef = !!b.activeNeed?.deficit;
      if (aHasDef !== bHasDef) return bHasDef ? 1 : -1;
      if (aHasDef && bHasDef) {
        const aPct = a.activeNeed!.have / a.activeNeed!.needed;
        const bPct = b.activeNeed!.have / b.activeNeed!.needed;
        if (aPct !== bPct) return bPct - aPct;
      }
      const aFuture = !!a.futureNeed;
      const bFuture = !!b.futureNeed;
      if (aFuture !== bFuture) return bFuture ? 1 : -1;
      return a.item.localeCompare(b.item);
    });
  }, [inventory, search, sortBy, activeNeeds, futureNeeds]);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    const qty = parseInt(newQty) || 1;
    setInventoryItem(trimmed, (inventory[trimmed] ?? 0) + qty);
    setNewItem('');
    setNewQty('');
  };

  const totalItems = Object.values(inventory).filter((q) => q > 0).length;
  const statusColor = { active: 'var(--accent-yellow)', available: 'var(--text-secondary)', locked: 'var(--text-muted)', completed: 'var(--accent-green)' } as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <Package size={18} style={{ color: 'var(--accent-yellow)' }} />
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Inventory
          </h2>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {totalItems} tracked
          </span>
        </div>
      </div>

      <div className="space-y-3">

          {/* Add single item */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Item name…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />
            <input
              type="number"
              min={0}
              placeholder="qty"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="w-20 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <button
              onClick={addItem}
              className="rounded-lg px-3 py-2 font-medium transition-colors"
              style={{ background: 'var(--accent-yellow)', color: '#0f172a' }}
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Search + sort */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none"
                style={{
                  background: 'var(--surface-card)',
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
                  <X size={12} />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg px-2 py-2 text-xs focus:outline-none"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <option value="deficit">Quest needs first</option>
              <option value="name">Name A–Z</option>
              <option value="qty">Qty high–low</option>
            </select>
          </div>

          {/* Inventory list */}
          {inventoryItems.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
            >
              {search ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No items match "{search}"</p>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No items tracked yet.</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Add items using the form above.</p>
                </>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {inventoryItems.map(({ item, qty, activeNeed, futureNeed }) => {
                  const isMissing = activeNeed && activeNeed.deficit > 0;
                  const isFulfilled = activeNeed && activeNeed.deficit === 0;
                  const isLookedUp = lookupItem === item;

                  return (
                    <div
                      key={item}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        background: isLookedUp ? 'var(--surface-card-hover)' : undefined,
                      }}
                    >
                      <div
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                        onClick={() => setLookupItem(isLookedUp ? null : item)}
                        title="Click to see which quests need this"
                      >
                        {/* Item name + quest context */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate transition-colors"
                            style={{
                              fontFamily: 'var(--font-body)',
                              color: isLookedUp ? 'var(--accent-purple)' : 'var(--text-primary)',
                            }}
                          >
                            {item}
                          </p>
                          {/* Inline quest context — visible without clicking */}
                          {isMissing && activeNeed && (
                            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {activeNeed.quests.slice(0, 2).join(' · ')}
                              {activeNeed.quests.length > 2 ? ` +${activeNeed.quests.length - 2}` : ''}
                            </p>
                          )}
                          {futureNeed && !isMissing && !isFulfilled && (
                            <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-purple)' }}>
                              <Lock size={9} />
                              in {futureNeed.minSteps} quest{futureNeed.minSteps !== 1 ? 's' : ''} — {futureNeed.entries[0].questName}
                            </p>
                          )}
                        </div>

                        {/* Qty + badges */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isMissing && activeNeed && <Badge tone="deficit">−{activeNeed.deficit}</Badge>}
                          {isFulfilled && <Badge tone="success">✓</Badge>}
                          {futureNeed && !isMissing && !isFulfilled && (
                            <Badge tone="future">
                              <Lock size={9} />
                            </Badge>
                          )}
                          <input
                            type="number"
                            min={0}
                            value={qty || ''}
                            placeholder="0"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = e.target.value === '' ? 0 : parseInt(e.target.value);
                              if (!isNaN(v)) setInventoryItem(item, v);
                            }}
                            className="w-16 sm:w-20 rounded px-2 py-1 text-sm text-right focus:outline-none"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--surface-inset)',
                              border: `1px solid ${isMissing ? 'var(--accent-orange-border)' : isFulfilled ? 'var(--accent-green-border)' : 'var(--border-default)'}`,
                              color: isMissing ? 'var(--accent-orange)' : isFulfilled ? 'var(--accent-green)' : 'var(--text-primary)',
                            }}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); setInventoryItem(item, 0); }}
                            title="Remove item"
                            style={{ color: 'var(--text-muted)' }}
                            className="flex-shrink-0 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                          <ChevronDown
                            size={13}
                            style={{
                              color: 'var(--text-muted)',
                              transform: isLookedUp ? 'rotate(180deg)' : 'none',
                              transition: 'var(--transition-fast)',
                              flexShrink: 0,
                            }}
                          />
                        </div>
                      </div>

                      {/* Expanded quest lookup */}
                      {isLookedUp && lookupResults && (
                        <div
                          className="px-4 pb-3 pt-2 space-y-1.5"
                          style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                            Used in
                          </p>
                          {lookupResults.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No quests need this item.</p>
                          ) : (
                            lookupResults.map(({ quest, quantity, status }) => (
                              <div key={quest.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate" style={{ color: statusColor[status] }}>{quest.name}</span>
                                <span className="flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                                  ×{quantity}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div
                className="px-4 py-2"
                style={{ background: 'var(--surface-inset)', borderTop: '1px solid var(--border-subtle)' }}
              >
                <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {inventoryItems.length} item{inventoryItems.length !== 1 ? 's' : ''}{search ? ' matching' : ''}
                </span>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
