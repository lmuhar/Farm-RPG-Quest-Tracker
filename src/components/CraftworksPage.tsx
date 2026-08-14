import { useState, useMemo } from 'react';
import { Leaf } from 'lucide-react';
import type { Quest } from '../types';
import { compareQuests, getQuestStatus, parseItems } from '../utils';
import { useStore } from '../store';
import { CraftworksSuggestions } from './CraftworksSuggestions';
import type { DirectItem } from './CraftworksSuggestions';
import questsData from '../data/quests.json';
import masteriesData from '../data/masteries.json';

const allQuestsData = questsData as Quest[];

interface Mastery { name: string; difficulty: number; method: string }
const allMasteries = masteriesData as Mastery[];
const craftingMasteries = allMasteries.filter((m) => m.method === 'crafting');

const WOOD_PASSIVE_ITEMS = new Set(['Wood', 'Board', 'Straw', 'Oak', 'Feathers']);

type CraftworksTab = 'active' | 'focus' | 'mastery' | 'passive';

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function CraftworksPage({ activeQuests, nextUpQuests }: Props) {
  const [tab, setTab] = useState<CraftworksTab>('active');
  const { trackedQuestline, player, questStatuses, masteryLevels, inventoryMax, inventory } = useStore();

  // ── Tab 1: all active quests excluding the focused questline ──────────────
  const activeExFocus = useMemo(
    () => activeQuests.filter((q) => q.questline !== trackedQuestline),
    [activeQuests, trackedQuestline]
  );
  const nextUpExFocus = useMemo(
    () => nextUpQuests.filter((q) => q.questline !== trackedQuestline),
    [nextUpQuests, trackedQuestline]
  );

  // ── Tab 2: quest focus (tracked questline) ────────────────────────────────
  const focusQuests = useMemo(
    () =>
      allQuestsData
        .filter((q) => q.questline === trackedQuestline)
        .sort((a, b) => compareQuests(a.name, b.name)),
    [trackedQuestline]
  );
  const focusQuestsWithStatus = useMemo(
    () => focusQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [focusQuests, player, questStatuses]
  );
  const focusActive = useMemo(
    () => focusQuestsWithStatus.filter(({ status }) => status === 'active').map(({ quest }) => quest),
    [focusQuestsWithStatus]
  );
  const focusUpcoming = useMemo(
    () =>
      focusQuestsWithStatus
        .filter(({ status }) => status !== 'completed' && status !== 'active')
        .map(({ quest }) => quest),
    [focusQuestsWithStatus]
  );

  // ── Tab 3: mastery-based suggestions ──────────────────────────────────────
  const masteryDirectItems = useMemo((): DirectItem[] => {
    const sorted = [...craftingMasteries].sort((a, b) => {
      const lvA = masteryLevels[a.name] ?? 0;
      const lvB = masteryLevels[b.name] ?? 0;
      // Skip already mega-mastered (handled by filter below)
      // In-progress (1 or 2) before unstarted (0)
      const inA = lvA > 0 && lvA < 3 ? 1 : 0;
      const inB = lvB > 0 && lvB < 3 ? 1 : 0;
      if (inA !== inB) return inB - inA;
      // Within in-progress: higher level first (closer to done)
      if (inA && inB && lvA !== lvB) return lvB - lvA;
      // Within unstarted: easiest first
      return a.difficulty - b.difficulty;
    });

    return sorted
      .filter((m) => (masteryLevels[m.name] ?? 0) < 3)
      .map((m) => {
        const lv = masteryLevels[m.name] ?? 0;
        const label =
          lv === 2 ? '→ Mega Master'
          : lv === 1 ? '→ Grand Master'
          : `diff ${m.difficulty}`;
        return {
          item: m.name,
          quantity: inventoryMax,
          label,
          priority: lv > 0 ? 'active' : 'nextup',
        };
      });
  }, [masteryLevels, inventoryMax]);

  const woodPassiveNeeds = useMemo(() => {
    const allQ = [...activeQuests, ...nextUpQuests];
    const woodPassiveMap = new Map<string, { have: number; need: number; activeCount: number; nextupCount: number }>();
    for (const q of allQ) {
      const isNextUp = !activeQuests.includes(q);
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        if (!WOOD_PASSIVE_ITEMS.has(item)) continue;
        const have = inventory[item] ?? 0;
        if (have >= quantity) continue;
        const existing = woodPassiveMap.get(item) ?? { have, need: 0, activeCount: 0, nextupCount: 0 };
        if (isNextUp) existing.nextupCount++;
        else existing.activeCount++;
        existing.need = Math.max(existing.need, quantity);
        woodPassiveMap.set(item, existing);
      }
    }
    return [...woodPassiveMap.entries()]
      .map(([item, data]) => ({ item, ...data }))
      .sort((a, b) => b.activeCount - a.activeCount || b.nextupCount - a.nextupCount);
  }, [activeQuests, nextUpQuests, inventory]);

  const tabs: { id: CraftworksTab; label: string }[] = [
    { id: 'active', label: 'All Active' },
    { id: 'focus',  label: `Quest Focus` },
    { id: 'mastery', label: 'Mastery' },
    { id: 'passive', label: 'Passive' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={
              tab === id
                ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1 — all active quests (excluding focus questline) */}
      {tab === 'active' && (
        activeExFocus.length === 0 && nextUpExFocus.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No active quests outside the current quest focus — mark quests active to see suggestions here.
            </p>
          </div>
        ) : (
          <CraftworksSuggestions quests={activeExFocus} nextUpQuests={nextUpExFocus} />
        )
      )}

      {/* Tab 2 — quest focus */}
      {tab === 'focus' && (
        focusActive.length === 0 && focusUpcoming.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All quests in <strong>{trackedQuestline}</strong> are complete — nothing left to craft.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Focus: <span style={{ color: 'var(--text-secondary)' }}>{trackedQuestline}</span>
            </p>
            <CraftworksSuggestions
              quests={focusActive}
              nextUpQuests={focusUpcoming}
              questlineOnly
              subtitle="quest focus · auto-chain order"
            />
          </div>
        )
      )}

      {/* Tab 4 — wood passive */}
      {tab === 'passive' && (
        woodPassiveNeeds.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              You have all the Wood, Board, Straw, Oak, and Feathers you need — nothing left to farm passively.
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-green-border)' }}>
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-green-bg)', borderBottom: '1px solid var(--accent-green-border)' }}>
              <Leaf size={13} style={{ color: 'var(--accent-green)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>Wood passive</span>
              <span className="text-xs ml-1" style={{ color: 'var(--accent-green)', opacity: 0.7 }}>— set these in craftworks or pick up while exploring</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {woodPassiveNeeds.map(({ item, have, need, activeCount, nextupCount }) => {
                const pct = Math.min(have / need, 1);
                const done = have >= need;
                return (
                  <div key={item} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium" style={{ color: done ? 'var(--accent-green)' : 'var(--text-primary)' }}>{item}</span>
                        {activeCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                            {activeCount} active
                          </span>
                        )}
                        {nextupCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                            {nextupCount} next up
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                        {have}/{need}
                      </span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: 'var(--accent-green)', opacity: done ? 1 : 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Tab 3 — mastery suggestions */}
      {tab === 'mastery' && (
        masteryDirectItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All craftable masteries are at Mega Master — nothing left to craft.
            </p>
          </div>
        ) : (
          <CraftworksSuggestions
            quests={[]}
            directItems={masteryDirectItems}
            subtitle="mastery priority · in-progress first"
          />
        )
      )}
    </div>
  );
}
