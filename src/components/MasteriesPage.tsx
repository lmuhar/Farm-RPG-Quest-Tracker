import { useState, useMemo } from 'react';
import { Search, X, Trophy, Star, Zap } from 'lucide-react';
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

const TIER_LABELS = ['', 'M', 'GM', 'MM'] as const;
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

interface ItemCardProps {
  item: MasteryItem;
  level: number;
  onLevelClick: (tier: 1 | 2 | 3) => void;
}

function ItemCard({ item, level, onLevelClick }: ItemCardProps) {
  const ms = METHOD_STYLES[item.method] ?? METHOD_STYLES.other;

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
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
            {item.name}
          </p>
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
          const active = level >= tier;
          return (
            <button
              key={tier}
              onClick={() => handleTierClick(tier)}
              className="flex-1 text-[11px] font-bold py-1 rounded transition-colors"
              style={
                active
                  ? { background: TIER_BG[tier], color: TIER_COLORS[tier], border: `1px solid ${TIER_BORDER[tier]}` }
                  : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
              }
              title={tier === 1 ? 'Mastered (1,000x)' : tier === 2 ? 'Grand Mastered (10,000x)' : 'Mega Mastered (100,000x)'}
            >
              {TIER_LABELS[tier]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MasteriesPage() {
  const { masteryLevels, setMasteryLevel } = useStore();
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
    // Items not yet started, sorted by difficulty ascending
    return masteries
      .filter((item) => (masteryLevels[item.name] ?? 0) === 0)
      .sort((a, b) => a.difficulty - b.difficulty)
      .slice(0, 9);
  }, [masteryLevels]);

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
            { label: 'Mastered', count: stats.m, color: TIER_COLORS[1], bg: TIER_BG[1] },
            { label: 'Grand Master', count: stats.gm, color: TIER_COLORS[2], bg: TIER_BG[2] },
            { label: 'Mega Master', count: stats.mm, color: TIER_COLORS[3], bg: TIER_BG[3] },
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

      {/* Suggestions */}
      {suggestions.length > 0 && !hasFilter && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Star size={15} style={{ color: 'var(--accent-yellow)' }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
              Suggested Next
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· easiest unstarted items</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {suggestions.map((item) => (
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
                { id: 'mastered', label: 'M' },
                { id: 'grand-mastered', label: 'GM' },
                { id: 'mega-mastered', label: 'MM' },
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
