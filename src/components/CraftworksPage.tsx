import { useState, useMemo } from 'react';
import type { Quest } from '../types';
import { compareQuests, getQuestStatus } from '../utils';
import { useStore } from '../store';
import { CraftworksSuggestions } from './CraftworksSuggestions';
import type { DirectItem } from './CraftworksSuggestions';
import questsData from '../data/quests.json';
import masteriesData from '../data/masteries.json';

const allQuestsData = questsData as Quest[];

interface Mastery { name: string; difficulty: number; method: string }
const allMasteries = masteriesData as Mastery[];
const craftingMasteries = allMasteries.filter((m) => m.method === 'crafting');

type CraftworksTab = 'active' | 'focus' | 'mastery';

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function CraftworksPage({ activeQuests, nextUpQuests }: Props) {
  const [tab, setTab] = useState<CraftworksTab>('active');
  const { trackedQuestline, player, questStatuses, masteryLevels, inventoryMax } = useStore();

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

  const tabs: { id: CraftworksTab; label: string }[] = [
    { id: 'active', label: 'All Active' },
    { id: 'focus',  label: `Quest Focus` },
    { id: 'mastery', label: 'Mastery' },
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
