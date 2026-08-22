import { useState, useMemo } from 'react';
import type { Quest } from '../types';
import { compareQuests, getQuestStatus, parseItems } from '../utils';
import { useStore } from '../store';
import { CraftworksSuggestions } from './CraftworksSuggestions';
import type { DirectItem } from './CraftworksSuggestions';
import questsData from '../data/quests.json';
import masteriesData from '../data/masteries.json';
import itemLocationsData from '../data/item-locations.json';
import { RARE_ITEMS, PET_ONLY_ITEMS } from '../data/bottlenecks';
import { Fish, AlertTriangle, TrendingUp } from 'lucide-react';

const allQuestsData = questsData as Quest[];

interface Mastery { name: string; difficulty: number; method: string }
const allMasteries = masteriesData as Mastery[];
const craftingMasteries = allMasteries.filter((m) => m.method === 'crafting');

const fishingMasteryNames = new Set(
  allMasteries.filter((m) => m.method === 'fishing').map((m) => m.name)
);

const itemLocations = itemLocationsData as Record<string, { name: string; type: string }[]>;

// Fishing spot → list of fish that have a mastery, ranked by most mastery fish
const fishingSpots: { spot: string; fish: string[] }[] = (() => {
  const spotMap = new Map<string, string[]>();
  for (const [item, sources] of Object.entries(itemLocations)) {
    if (!fishingMasteryNames.has(item)) continue;
    for (const src of sources) {
      if (src.type !== 'fishing') continue;
      if (!spotMap.has(src.name)) spotMap.set(src.name, []);
      spotMap.get(src.name)!.push(item);
    }
  }
  return [...spotMap.entries()]
    .map(([spot, fish]) => ({ spot, fish }))
    .sort((a, b) => b.fish.length - a.fish.length);
})();

// Crafting masteries using only Wood / Board / Straw / Nails / Rope / Twine chain
const PASSIVE_MASTERY_ITEMS: { name: string; difficulty: number }[] = [
  { name: 'Board',        difficulty: 1 },
  { name: 'Broom',        difficulty: 1 },
  { name: 'Ladder',       difficulty: 1 },
  { name: 'Nailed Board', difficulty: 1 },
  { name: 'Rope',         difficulty: 1 },
  { name: 'Twine',        difficulty: 1 },
  { name: 'Wooden Plank', difficulty: 1 },
  { name: 'Yarn',         difficulty: 1 },
  { name: 'Wagon Wheel',  difficulty: 2 },
  { name: 'Wooden Box',   difficulty: 2 },
  { name: 'Wooden Table', difficulty: 2 },
];

type CraftworksTab = 'active' | 'focus' | 'mastery' | 'fishing' | 'passive' | 'ascension';

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function CraftworksPage({ activeQuests, nextUpQuests }: Props) {
  const [tab, setTab] = useState<CraftworksTab>('active');
  const { trackedQuestline, player, questStatuses, masteryLevels, masteryProgress, inventoryMax, inventory, cropTimes } = useStore();

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

  // ── Focus bottlenecks: rare/pet-only items needed across the entire questline ──
  const focusBottlenecks = useMemo(() => {
    const itemMap = new Map<string, number>();
    const itemQuestCount = new Map<string, number>();
    for (const quest of focusQuests) {
      if (getQuestStatus(quest, player, questStatuses) === 'completed') continue;
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
        itemQuestCount.set(item, (itemQuestCount.get(item) ?? 0) + 1);
      }
    }
    const entries: { item: string; have: number; need: number; location: string; questCount: number }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      if (have >= totalNeeded) continue;
      const isCrop = cropTimes.some(c => c.item.toLowerCase() === item.toLowerCase());
      if (isCrop) continue;
      let location: string | undefined;
      if (RARE_ITEMS.has(item)) location = RARE_ITEMS.get(item)!;
      else if (PET_ONLY_ITEMS.has(item)) location = 'Pet drops';
      else continue;
      entries.push({ item, have, need: totalNeeded, location, questCount: itemQuestCount.get(item) ?? 1 });
    }
    return entries.sort((a, b) => b.questCount - a.questCount).slice(0, 10);
  }, [focusQuests, player, questStatuses, inventory, cropTimes]);

  // ── Tab 3: mastery crafting suggestions ───────────────────────────────────
  const masteryDirectItems = useMemo((): DirectItem[] => {
    const sorted = [...craftingMasteries].sort((a, b) => {
      const lvA = masteryLevels[a.name] ?? 0;
      const lvB = masteryLevels[b.name] ?? 0;
      const inA = lvA > 0 && lvA < 3 ? 1 : 0;
      const inB = lvB > 0 && lvB < 3 ? 1 : 0;
      if (inA !== inB) return inB - inA;
      if (inA && inB && lvA !== lvB) return lvB - lvA;
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

  // ── Tab 4: fishing spot recommendation ────────────────────────────────────
  const fishingRanking = useMemo(() =>
    fishingSpots
      .map(({ spot, fish }) => ({
        spot,
        unmastered: fish.filter((f) => (masteryLevels[f] ?? 0) < 3),
      }))
      .filter(({ unmastered }) => unmastered.length > 0)
      .sort((a, b) => b.unmastered.length - a.unmastered.length),
    [masteryLevels]
  );

  // ── Tab 5: passive wood/board crafting masteries ───────────────────────────
  const passiveMasteryItems = useMemo((): DirectItem[] => {
    const sorted = [...PASSIVE_MASTERY_ITEMS].sort((a, b) => {
      const lvA = masteryLevels[a.name] ?? 0;
      const lvB = masteryLevels[b.name] ?? 0;
      const inA = lvA > 0 && lvA < 3 ? 1 : 0;
      const inB = lvB > 0 && lvB < 3 ? 1 : 0;
      if (inA !== inB) return inB - inA;
      if (inA && inB && lvA !== lvB) return lvB - lvA;
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

  // ── Tab 6: ascension points — items close to 10k / 100k milestones ──────────
  const ascensionCandidates = useMemo(() => {
    const masteriesMap = new Map(allMasteries.map((m) => [m.name, m]));
    return Object.entries(masteryProgress)
      .flatMap(([item, count]) => {
        const level = masteryLevels[item] ?? 0;
        if (level === 0) return [{ item, count, target: 10_000, pts: 10, pct: Math.min(1, count / 10_000), masterItem: masteriesMap.get(item) }];
        if (level === 1) return [{ item, count, target: 100_000, pts: 100, pct: Math.min(1, count / 100_000), masterItem: masteriesMap.get(item) }];
        return [];
      })
      .sort((a, b) => b.pts - a.pts || b.pct - a.pct);
  }, [masteryProgress, masteryLevels]);

  const tabs: { id: CraftworksTab; label: string; dot?: boolean }[] = [
    { id: 'active',    label: 'All Active' },
    { id: 'focus',     label: 'Quest Focus' },
    { id: 'mastery',   label: 'Mastery' },
    { id: 'fishing',   label: 'Fishing' },
    { id: 'passive',   label: 'Passive' },
    { id: 'ascension', label: 'Ascension Pts', dot: ascensionCandidates.length > 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}
      >
        {tabs.map(({ id, label, dot }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
            style={
              tab === id
                ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
            }
          >
            {label}
            {dot && tab !== id && (
              <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: 'var(--accent-green)' }} />
            )}
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
            {focusBottlenecks.length > 0 && (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-orange-border)' }}
              >
                <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}>
                  <AlertTriangle size={13} style={{ color: 'var(--accent-orange)' }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-orange)' }}>Bottlenecks</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--accent-orange)', opacity: 0.7 }}>— entire questline</span>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {focusBottlenecks.map(({ item, have, need, location, questCount }) => (
                    <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{location}</span>
                          {questCount > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }}>
                              {questCount} quests
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: have >= need ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                        {have}/{need}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Tab 3 — mastery crafting suggestions */}
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

      {/* Tab 4 — fishing spot recommendation */}
      {tab === 'fishing' && (
        fishingRanking.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All fishing masteries are at Mega Master — nothing left to catch.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Ranked by unmastered fish per spot
            </p>
            {fishingRanking.map(({ spot, unmastered }, i) => (
              <div
                key={spot}
                className="rounded-xl p-4"
                style={{
                  background: 'var(--surface-card)',
                  border: `1px solid ${i === 0 ? 'var(--accent-blue-border)' : 'var(--border-subtle)'}`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Fish size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                      {spot}
                    </span>
                    {i === 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                      >
                        best
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {unmastered.length} remaining
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {unmastered.map((f) => {
                    const lv = masteryLevels[f] ?? 0;
                    return (
                      <span
                        key={f}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: lv > 0 ? 'var(--accent-yellow-bg)' : 'var(--surface-inset)',
                          color: lv > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)',
                          border: `1px solid ${lv > 0 ? 'var(--accent-yellow-border)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        {f}{lv > 0 ? ` ·lv${lv}` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab 6 — ascension points */}
      {tab === 'ascension' && (
        ascensionCandidates.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <TrendingUp size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No ascension point data yet — sync your mastery progress from farmrpg.com/mastery.php.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Items tracking toward 10k (10 pts) or 100k (100 pts) — highest value and closest first
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {ascensionCandidates.map(({ item, count, target, pts, pct, masterItem }) => {
                  const remaining = target - count;
                  const done = count >= target;
                  const ptColor = pts === 100 ? 'var(--accent-yellow)' : 'var(--accent-green)';
                  return (
                    <div key={item} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: done ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                            {item}
                          </span>
                          {masterItem && (
                            <>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                                style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
                              >
                                {masterItem.method}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                                style={{
                                  background: masterItem.difficulty <= 3 ? 'var(--accent-green-bg)' : masterItem.difficulty <= 6 ? 'var(--accent-yellow-bg)' : 'var(--accent-orange-bg)',
                                  color: masterItem.difficulty <= 3 ? 'var(--accent-green)' : masterItem.difficulty <= 6 ? 'var(--accent-yellow)' : 'var(--accent-orange)',
                                  border: `1px solid ${masterItem.difficulty <= 3 ? 'var(--accent-green-border)' : masterItem.difficulty <= 6 ? 'var(--accent-yellow-border)' : 'var(--accent-orange-border)'}`,
                                }}
                              >
                                diff {masterItem.difficulty}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: ptColor }}>
                            +{pts} pts
                          </span>
                          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            {count.toLocaleString()}/{target.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.round(pct * 100)}%`, background: done ? 'var(--accent-green)' : ptColor }}
                          />
                        </div>
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {Math.round(pct * 100)}%
                          {!done && ` · ${remaining.toLocaleString()} left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )
      )}

      {/* Tab 5 — passive wood/board crafting masteries */}
      {tab === 'passive' && (
        passiveMasteryItems.length === 0 ? (
          <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              All passive wood &amp; board masteries are at Mega Master.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
              Crafts using only Wood · Board · Straw · Stone · in-progress first
            </p>
            <CraftworksSuggestions
              quests={[]}
              directItems={passiveMasteryItems}
              subtitle="passive crafts · wood · board · straw · stone"
            />
          </div>
        )
      )}
    </div>
  );
}
