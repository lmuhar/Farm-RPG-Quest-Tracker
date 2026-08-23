import { useState, useMemo } from 'react';
import { Search, X, Trophy, Star, Zap, TrendingUp } from 'lucide-react';
import masteriesData from '../data/masteries.json';
import { useStore } from '../store';

interface MasteryItem {
  name: string;
  difficulty: number;
  method: string;
}

const masteries = masteriesData as MasteryItem[];

type MethodFilter = 'all' | 'crafting' | 'fishing' | 'farming' | 'cooking' | 'exploring' | 'steelworks' | 'other';
type StatusFilter = 'all' | 'none' | 'mastered' | 'grand-mastered' | 'mega-mastered';
type DiffFilter = 'all' | '1-3' | '4-6' | '7-8' | '9-10';

const METHOD_LABELS: Record<string, string> = {
  crafting: 'Crafting', fishing: 'Fishing', farming: 'Farming',
  cooking: 'Cooking', exploring: 'Exploring', steelworks: 'Steelworks',
  locksmith: 'Locksmith', other: 'Other',
};

const METHOD_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  crafting:   { bg: 'var(--accent-orange-bg)',  color: 'var(--accent-orange)',  border: 'var(--accent-orange-border)'  },
  fishing:    { bg: 'var(--accent-blue-bg)',    color: 'var(--accent-blue)',    border: 'var(--accent-blue-border)'    },
  farming:    { bg: 'var(--accent-green-bg)',   color: 'var(--accent-green)',   border: 'var(--accent-green-border)'   },
  cooking:    { bg: 'var(--accent-yellow-bg)',  color: 'var(--accent-yellow)',  border: 'var(--accent-yellow-border)'  },
  exploring:  { bg: 'var(--accent-purple-bg)',  color: 'var(--accent-purple)',  border: 'var(--accent-purple-border)'  },
  steelworks: { bg: 'oklch(0.28 0.02 220/0.5)', color: 'oklch(0.70 0.06 220)', border: 'oklch(0.38 0.04 220)'         },
  locksmith:  { bg: 'oklch(0.28 0.03 30/0.5)',  color: 'oklch(0.75 0.10 30)',  border: 'oklch(0.40 0.06 30)'          },
  other:      { bg: 'var(--surface-inset)',     color: 'var(--text-muted)',     border: 'var(--border-default)'        },
};

function diffColor(d: number) {
  if (d <= 3) return 'var(--accent-green)';
  if (d <= 6) return 'var(--accent-yellow)';
  if (d <= 8) return 'var(--accent-orange)';
  return '#f87171';
}
function diffBg(d: number) {
  if (d <= 3) return 'var(--accent-green-bg)';
  if (d <= 6) return 'var(--accent-yellow-bg)';
  if (d <= 8) return 'var(--accent-orange-bg)';
  return 'rgba(248,113,113,0.15)';
}
function diffLabel(d: number) {
  if (d <= 3) return 'Easy';
  if (d <= 6) return 'Medium';
  if (d <= 8) return 'Hard';
  return 'Expert';
}

// Tier III = Mastery (1,000×), Tier IV = Grand Master (10,000×), Tier V = Mega Mastery (100,000×)
const TIER_LABELS   = ['', 'T.III', 'T.IV', 'T.V'] as const;
const TIER_NAMES    = ['', 'Tier III · Mastery', 'Tier IV · Grand Master', 'Tier V · Mega Mastery'] as const;
const TIER_TITLES   = ['', 'Tier III · Mastery (1,000×)', 'Tier IV · Grand Master (10,000×)', 'Tier V · Mega Mastery (100,000×)'] as const;
const TIER_COLORS = [
  '',
  '#cd7f32',
  '#c0c0c0',
  '#ffd700',
] as const;
const TIER_BG = [
  '',
  'rgba(205,127,50,0.18)',
  'rgba(192,192,192,0.18)',
  'rgba(255,215,0,0.18)',
] as const;
const TIER_BORDER = [
  '',
  'rgba(205,127,50,0.4)',
  'rgba(192,192,192,0.4)',
  'rgba(255,215,0,0.4)',
] as const;

const ALL_METHODS: MethodFilter[] = ['all', 'crafting', 'fishing', 'farming', 'cooking', 'exploring', 'steelworks', 'other'];
const ALL_DIFFS: DiffFilter[] = ['all', '1-3', '4-6', '7-8', '9-10'];

function inDiffRange(d: number, range: DiffFilter) {
  if (range === 'all') return true;
  if (range === '1-3') return d <= 3;
  if (range === '4-6') return d >= 4 && d <= 6;
  if (range === '7-8') return d >= 7 && d <= 8;
  return d >= 9;
}

function itemMatchesStatus(level: number, filter: StatusFilter) {
  if (filter === 'all') return true;
  if (filter === 'none') return level === 0;
  if (filter === 'mastered') return level === 1;
  if (filter === 'grand-mastered') return level === 2;
  return level === 3;
}

const NEXT_STEP_LABEL = ['→ T.III', '→ T.IV', '→ T.V', ''] as const;
const NEXT_STEP_TIER = [1, 2, 3] as const; // next tier to achieve for level 0,1,2

interface ItemCardProps {
  item: MasteryItem;
  level: number;
  onLevelClick: (tier: 1 | 2 | 3) => void;
  showNextStep?: boolean;
}

function ItemCard({ item, level, onLevelClick, showNextStep }: ItemCardProps) {
  const ms = METHOD_STYLES[item.method] ?? METHOD_STYLES.other;
  const nextTier = level < 3 ? NEXT_STEP_TIER[level] : null;

  const handleTierClick = (tier: 1 | 2 | 3) => {
    if (level === tier) {
      onLevelClick((tier - 1) as 1 | 2 | 3);
    } else {
      onLevelClick(tier);
    }
  };

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
              {item.name}
            </p>
            {showNextStep && nextTier && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: TIER_BG[nextTier], color: TIER_COLORS[nextTier], border: `1px solid ${TIER_BORDER[nextTier]}` }}
              >
                {NEXT_STEP_LABEL[level]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: diffBg(item.difficulty), color: diffColor(item.difficulty), border: `1px solid ${diffColor(item.difficulty)}40` }}
            >
              {item.difficulty} · {diffLabel(item.difficulty)}
            </span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: ms.bg, color: ms.color, border: `1px solid ${ms.border}` }}
            >
              {METHOD_LABELS[item.method] ?? item.method}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        {([1, 2, 3] as const).map((tier) => {
          const isCurrent = level === tier;
          const isDone = level > tier;
          const isNext = showNextStep && nextTier === tier;
          return (
            <button
              key={tier}
              onClick={() => handleTierClick(tier)}
              className="flex-1 text-[11px] font-bold py-1 rounded transition-colors"
              style={
                isCurrent
                  ? { background: TIER_BG[tier], color: TIER_COLORS[tier], border: `2px solid ${TIER_COLORS[tier]}` }
                  : isDone
                  ? { background: 'transparent', color: TIER_COLORS[tier], border: `1px solid ${TIER_BORDER[tier]}`, opacity: 0.4 }
                  : isNext
                  ? { background: 'transparent', color: TIER_COLORS[tier], border: `1.5px dashed ${TIER_COLORS[tier]}` }
                  : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
              }
              title={TIER_TITLES[tier]}
            >
              {isDone ? '✓' : TIER_LABELS[tier]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AscensionRow({ item, count, target, pts, pct }: { item: string; count: number; target: number; pts: number; pct: number }) {
  const remaining = target - count;
  const done = count >= target;
  const color = pts === 100 ? 'var(--accent-yellow)' : 'var(--accent-green)';
  const masterItem = masteries.find((m) => m.name === item);
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium" style={{ color: done ? 'var(--accent-green)' : 'var(--text-primary)' }}>{item}</span>
          {masterItem && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{METHOD_LABELS[masterItem.method] ?? masterItem.method}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
            {count.toLocaleString()}/{target.toLocaleString()}
          </span>
          {!done && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({remaining.toLocaleString()} left)</span>
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: done ? 'var(--accent-green)' : color }} />
      </div>
    </div>
  );
}

function AscensionSection({
  label, pts, color, items,
}: {
  label: string; pts: number; color: string;
  items: { item: string; count: number; target: number; pts: number; pct: number }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 5);
  const hidden = items.length - 5;
  return (
    <div>
      <div className="px-4 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-inset)' }}>
        <span className="text-xs font-bold" style={{ color }}>{label}</span>
        <span className="text-xs font-semibold ml-auto" style={{ color, fontFamily: 'var(--font-mono)' }}>+{pts} pts each</span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {visible.map((c) => <AscensionRow key={c.item} {...c} />)}
      </div>
      {items.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full text-xs py-2 text-center"
          style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
        >
          {showAll ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}

// Items with progress data targeting a milestone that yields ascension points:
// level 0/1 (unstarted/Tier III) → 10k milestone → 10 pts; level 2 (Tier IV/GM) → 100k milestone → 100 pts
function AscensionPointsPanel({
  masteryLevels,
  masteryProgress,
}: {
  masteryLevels: Record<string, number>;
  masteryProgress: Record<string, number>;
}) {
  const { tenK, hundredK } = useMemo(() => {
    const tenK: { item: string; count: number; target: number; pts: number; pct: number }[] = [];
    const hundredK: { item: string; count: number; target: number; pts: number; pct: number }[] = [];
    for (const [item, count] of Object.entries(masteryProgress)) {
      const level = masteryLevels[item] ?? 0;
      if (level <= 1) {
        const pct = Math.min(1, count / 10_000);
        tenK.push({ item, count, target: 10_000, pts: 10, pct });
      } else if (level === 2) {
        const pct = Math.min(1, count / 100_000);
        hundredK.push({ item, count, target: 100_000, pts: 100, pct });
      }
    }
    tenK.sort((a, b) => b.pct - a.pct);
    hundredK.sort((a, b) => b.pct - a.pct);
    return { tenK, hundredK };
  }, [masteryLevels, masteryProgress]);

  if (tenK.length === 0 && hundredK.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--accent-purple-border)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-purple-bg)', borderBottom: '1px solid var(--accent-purple-border)' }}>
        <TrendingUp size={13} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--accent-purple)' }}>Ascension Points</span>
      </div>
      <div style={{ background: 'var(--surface-card)' }}>
        {hundredK.length > 0 && (
          <AscensionSection label="100k milestone" pts={100} color="var(--accent-yellow)" items={hundredK} />
        )}
        {tenK.length > 0 && hundredK.length > 0 && (
          <div style={{ borderTop: '2px solid var(--border-subtle)' }} />
        )}
        {tenK.length > 0 && (
          <AscensionSection label="10k milestone" pts={10} color="var(--accent-green)" items={tenK} />
        )}
      </div>
    </div>
  );
}

export function MasteriesPage() {
  const { masteryLevels, masteryProgress, setMasteryLevel } = useStore();
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');

  const stats = useMemo(() => {
    let started = 0, m = 0, gm = 0, mm = 0;
    for (const item of masteries) {
      const lv = masteryLevels[item.name] ?? 0;
      if (lv >= 1) { started++; m++; }
      if (lv >= 2) gm++;
      if (lv >= 3) mm++;
    }
    return { started, m, gm, mm, total: masteries.length };
  }, [masteryLevels]);

  const suggestions = useMemo(() => {
    // Finish in-progress items to MM before starting new ones.
    // Priority: GM (1 step from MM) → M (2 steps) → not started (easiest first)
    const byLevel = [2, 1, 0].flatMap((targetLevel) =>
      masteries
        .filter((item) => (masteryLevels[item.name] ?? 0) === targetLevel)
        .sort((a, b) => a.difficulty - b.difficulty)
    );
    return byLevel.slice(0, 9);
  }, [masteryLevels]);

  const suggestionSubtitle = useMemo(() => {
    if (suggestions.some((item) => (masteryLevels[item.name] ?? 0) === 2)) {
      return '· Tier IV · Grand Master — 1 step from Tier V · Mega Mastery';
    }
    if (suggestions.some((item) => (masteryLevels[item.name] ?? 0) === 1)) {
      return '· Tier III · Mastery — push these to Tier V before starting new ones';
    }
    return '· nothing in progress — easiest items to start';
  }, [suggestions, masteryLevels]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return masteries.filter((item) => {
      const lv = masteryLevels[item.name] ?? 0;
      if (methodFilter !== 'all' && item.method !== methodFilter) return false;
      if (!itemMatchesStatus(lv, statusFilter)) return false;
      if (!inDiffRange(item.difficulty, diffFilter)) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, methodFilter, statusFilter, diffFilter, masteryLevels]);

  const hasFilter = search || methodFilter !== 'all' || statusFilter !== 'all' || diffFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setMethodFilter('all');
    setStatusFilter('all');
    setDiffFilter('all');
  };

  return (
    <div className="space-y-4">
      {/* Stats header */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: 'var(--accent-yellow)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            Mastery Progress
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-3 text-center" style={{ background: 'var(--surface-inset)' }}>
            <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {stats.started}
              <span className="text-sm font-normal ml-0.5" style={{ color: 'var(--text-muted)' }}>/{stats.total}</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Started</div>
          </div>
          {([
            { label: TIER_NAMES[1], count: stats.m, color: TIER_COLORS[1], bg: TIER_BG[1] },
            { label: TIER_NAMES[2], count: stats.gm, color: TIER_COLORS[2], bg: TIER_BG[2] },
            { label: TIER_NAMES[3], count: stats.mm, color: TIER_COLORS[3], bg: TIER_BG[3] },
          ] as const).map(({ label, count, color, bg }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ background: bg }}>
              <div className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)', color }}>
                {count}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ascension Points */}
      {!hasFilter && (
        <AscensionPointsPanel masteryLevels={masteryLevels} masteryProgress={masteryProgress} />
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && !hasFilter && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Star size={15} style={{ color: 'var(--accent-yellow)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Focus
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{suggestionSubtitle}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {suggestions.map((item) => (
              <ItemCard
                key={item.name}
                item={item}
                level={masteryLevels[item.name] ?? 0}
                showNextStep
                onLevelClick={(tier) => {
                  const current = masteryLevels[item.name] ?? 0;
                  setMasteryLevel(item.name, current === tier ? tier - 1 : tier);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Method filter chips */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Method</p>
          <div className="flex flex-wrap gap-1">
            {ALL_METHODS.map((m) => {
              const active = methodFilter === m;
              const ms = m === 'all' ? null : (METHOD_STYLES[m] ?? METHOD_STYLES.other);
              return (
                <button
                  key={m}
                  onClick={() => setMethodFilter(m)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                  style={
                    active && ms
                      ? { background: ms.bg, color: ms.color, border: `1px solid ${ms.border}` }
                      : active
                      ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                      : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                  }
                >
                  {m === 'all' ? 'All' : METHOD_LABELS[m] ?? m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status + Difficulty filters */}
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</p>
            <div className="flex flex-wrap gap-1">
              {([
                { id: 'all', label: 'All' },
                { id: 'none', label: 'Not started' },
                { id: 'mastered', label: 'T.III' },
                { id: 'grand-mastered', label: 'T.IV' },
                { id: 'mega-mastered', label: 'T.V' },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                  style={
                    statusFilter === id
                      ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                      : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Difficulty</p>
            <div className="flex flex-wrap gap-1">
              {ALL_DIFFS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDiffFilter(d)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                  style={
                    diffFilter === d
                      ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                      : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                  }
                >
                  {d === 'all' ? 'All' : d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </p>
          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <X size={11} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Item grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl px-5 py-10 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          <Zap size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No items match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filtered.map((item) => (
            <ItemCard
              key={item.name}
              item={item}
              level={masteryLevels[item.name] ?? 0}
              onLevelClick={(tier) => {
                const current = masteryLevels[item.name] ?? 0;
                setMasteryLevel(item.name, current === tier ? tier - 1 : tier);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
