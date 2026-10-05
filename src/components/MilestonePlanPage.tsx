import { useMemo, useState } from 'react';
import { Target, Link2, Compass, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../store';
import { buildMilestonePlan } from '../milestonePlan';
import type { CraftPlan, GatherPlan, Material } from '../milestonePlan';
import { itemLocations, formatRate, sourceHint } from '../data/itemSources';
import { formatDuration } from '../utils';

type SortMode = 'easiest' | 'value';
type TierFilter = 'all' | '10k' | '100k';

const SORTS: { id: SortMode; label: string; hint: string }[] = [
  { id: 'easiest', label: 'Easiest now', hint: 'most covered by what you already have' },
  { id: 'value', label: 'Best value', hint: 'most AP (chain milestones included) per material you still need to gather' },
];

const METHOD_LABELS: Record<string, string> = {
  crafting: 'Crafting', cooking: 'Cooking', steelworks: 'Steelworks', other: 'Other',
  fishing: 'Fishing', exploring: 'Exploring', mining: 'Mining', farming: 'Farming',
};

const TIER_COLOR = { 10: '#cd7f32', 100: '#c0c0c0' } as Record<number, string>;

function inTier(p: { pts: number }, tier: TierFilter) {
  return tier === 'all' || (tier === '10k' ? p.pts === 10 : p.pts === 100);
}

function shortfall(plan: CraftPlan) {
  return plan.materials.reduce((sum, m) => sum + m.short, 0);
}

function sortCrafts(list: CraftPlan[], mode: SortMode): CraftPlan[] {
  const value = (p: CraftPlan) => p.totalPts / Math.max(1, shortfall(p));
  return [...list].sort((a, b) => {
    if (mode === 'easiest') return b.coverage - a.coverage || a.remaining - b.remaining || b.totalPts - a.totalPts;
    return value(b) - value(a) || b.coverage - a.coverage;
  });
}

// Where to get a material, best source first
function whereToGet(item: string): string | null {
  let best: { name: string; type: string; rate: number } | null = null;
  for (const loc of itemLocations[item] ?? []) {
    if (loc.rate && (!best || loc.rate < best.rate)) best = { name: loc.name, type: loc.type, rate: loc.rate };
  }
  if (best) return `${best.name} (${formatRate(best.rate)})`;
  return sourceHint(item);
}

function formatLong(minutes: number) {
  if (minutes < 1440) return formatDuration(minutes);
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function TierBadge({ pts, level }: { pts: number; level: number }) {
  const color = TIER_COLOR[pts];
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ color, border: `1px solid ${color}80`, background: `${color}22` }}
    >
      → {level === 0 ? '10k' : '100k'} · +{pts} AP
    </span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.round(pct * 100))}%`, background: color }} />
    </div>
  );
}

function MaterialRow({ m }: { m: Material }) {
  const where = m.short > 0 ? (m.passive ? 'refills on its own' : whereToGet(m.item)) : null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate" style={{ color: m.short > 0 ? 'var(--text-primary)' : 'var(--accent-green)' }}>
        {m.item}
        {where && <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{where}</span>}
      </span>
      <span className="flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: m.short > 0 ? 'var(--text-secondary)' : 'var(--accent-green)' }}>
        {m.have.toLocaleString()}/{m.need.toLocaleString()}
      </span>
    </div>
  );
}

function CraftCard({ plan }: { plan: CraftPlan }) {
  const [open, setOpen] = useState(false);
  const hits = plan.chain.filter((s) => s.pts > 0);
  const extra = plan.chain.filter((s) => s.pts === 0);
  const short = plan.materials.filter((m) => m.short > 0);
  const shownMats = open ? plan.materials : short.slice(0, 3);
  const coverColor = plan.coverage >= 1 ? 'var(--accent-green)' : plan.coverage >= 0.25 ? 'var(--accent-yellow)' : 'var(--accent-orange)';

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.item}</span>
            <TierBadge pts={plan.pts} level={plan.progress.level} />
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {METHOD_LABELS[plan.method] ?? plan.method} · {plan.progress.count.toLocaleString()}/{plan.target.toLocaleString()} · {plan.remaining.toLocaleString()} to craft
          </p>
        </div>
        {plan.totalPts > plan.pts && (
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>
            {plan.totalPts} AP total
          </span>
        )}
      </div>

      <div>
        <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
          <span>{plan.coverage >= 1 ? 'Inventory covers all of it' : `Inventory covers ${Math.floor(plan.coverage * 100)}%`}</span>
          {plan.coverage < 1 && <span>{plan.readyNow.toLocaleString()} craftable now</span>}
        </div>
        <Bar pct={plan.coverage} color={coverColor} />
      </div>

      {hits.length > 0 && (
        <div className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--accent-purple)' }}>
          <Link2 size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            Chain also hits{' '}
            {hits.map((s, i) => (
              <span key={s.item}>
                {i > 0 && ', '}
                <strong>{s.item}</strong>{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  ({s.how === 'gather' ? 'gather' : 'craft'} {s.added.toLocaleString()}, +{s.pts})
                </span>
              </span>
            ))}
          </span>
        </div>
      )}

      {shownMats.length > 0 && (
        <div className="space-y-0.5 pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold pt-1" style={{ color: 'var(--text-muted)' }}>
            {open ? 'All materials (have/need)' : 'Still need (have/need)'}
          </p>
          {shownMats.map((m) => <MaterialRow key={m.item} m={m} />)}
        </div>
      )}

      {open && extra.length > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Also progresses: {extra.map((s) => `${s.item} +${s.added.toLocaleString()}`).join(', ')}
        </p>
      )}

      {(plan.materials.length > shownMats.length || extra.length > 0) && (
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {open ? 'Less' : 'Full chain & materials'}
        </button>
      )}
    </div>
  );
}

function GatherRow({ plan }: { plan: GatherPlan }) {
  const pct = Math.min(1, plan.progress.count / plan.target);
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.item}</span>
          <TierBadge pts={plan.pts} level={plan.progress.level} />
        </div>
        <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {plan.progress.count.toLocaleString()}/{plan.target.toLocaleString()}
        </span>
      </div>
      <Bar pct={pct} color={TIER_COLOR[plan.pts]} />
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {METHOD_LABELS[plan.method]} · {plan.location} · ≈ {plan.effortLabel}
        {plan.minutes != null && <> · {formatLong(plan.minutes)}</>}
      </p>
    </div>
  );
}

export function MilestonePlanPage() {
  const { masteryLevels, masteryProgress, inventory, cropTimes, plotCount } = useStore();
  const [sort, setSort] = useState<SortMode>('easiest');
  const [tier, setTier] = useState<TierFilter>('all');
  const [craftLimit, setCraftLimit] = useState(12);
  const [gatherLimit, setGatherLimit] = useState(10);

  const plan = useMemo(
    () => buildMilestonePlan({ masteryLevels, masteryProgress, inventory, cropTimes, plotCount }),
    [masteryLevels, masteryProgress, inventory, cropTimes, plotCount]
  );

  const crafts = useMemo(() => sortCrafts(plan.crafts.filter((p) => inTier(p, tier)), sort), [plan, sort, tier]);
  const gathers = useMemo(
    () => plan.gathers.filter((p) => inTier(p, tier)).sort((a, b) => a.effort - b.effort),
    [plan, tier]
  );

  const summary = useMemo(() => {
    const all = [...plan.crafts, ...plan.gathers];
    const ready = plan.crafts.filter((p) => p.coverage >= 1);
    return {
      tenK: all.filter((p) => p.pts === 10).length,
      hundredK: all.filter((p) => p.pts === 100).length,
      apOnOffer: all.reduce((sum, p) => sum + p.pts, 0),
      ready: ready.length,
      readyAp: ready.reduce((sum, p) => sum + p.pts, 0),
    };
  }, [plan]);

  const hasProgress = Object.keys(masteryProgress).length > 0;
  const hasInventory = Object.keys(inventory).length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Target size={16} style={{ color: 'var(--accent-purple)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            Milestone Plan
          </h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Every 10k (+10 AP) and 100k (+100 AP) mastery milestone you can still hit, ranked against your current inventory.
          Crafts are planned as chains: ingredients that are masteries themselves get crafted fresh so they count too.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'AP on offer', value: summary.apOnOffer.toLocaleString(), color: 'var(--accent-purple)' },
            { label: 'Ready from inventory', value: `${summary.ready} · +${summary.readyAp}`, color: 'var(--accent-green)' },
            { label: '10k milestones left', value: summary.tenK, color: TIER_COLOR[10] },
            { label: '100k milestones left', value: summary.hundredK, color: TIER_COLOR[100] },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ background: 'var(--surface-inset)' }}>
              <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-mono)', color }}>{value}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
        {(!hasProgress || !hasInventory) && (
          <p className="text-xs" style={{ color: 'var(--accent-yellow)' }}>
            {!hasProgress && 'No mastery progress synced yet, so every count starts at 0. '}
            {!hasInventory && 'No inventory synced yet, so nothing counts as covered. '}
            Sync both from Settings for an accurate plan.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          {SORTS.map(({ id, label, hint }) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              title={hint}
              className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap"
              style={sort === id ? { background: 'var(--accent-purple)', color: '#fff' } : { color: 'var(--text-muted)' }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['all', '10k', '100k'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={
                tier === t
                  ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                  : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
              }
            >
              {t === 'all' ? 'All' : t}
            </button>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{SORTS.find((s) => s.id === sort)!.hint}</span>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Link2 size={13} /> Crafting chains <span style={{ color: 'var(--text-muted)' }}>({crafts.length})</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {crafts.slice(0, craftLimit).map((p) => <CraftCard key={p.item} plan={p} />)}
        </div>
        {crafts.length > craftLimit && (
          <button onClick={() => setCraftLimit((n) => n + 24)} className="w-full text-xs py-2 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
            Show more ({crafts.length - craftLimit} left)
          </button>
        )}
      </section>

      <section className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
          <Compass size={13} style={{ color: 'var(--accent-blue)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Gathering milestones</span>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>fewest actions first · crops on {plotCount} plots</span>
        </div>
        <div className="divide-y" style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}>
          {gathers.slice(0, gatherLimit).map((p) => <GatherRow key={p.item} plan={p} />)}
        </div>
        {gathers.length > gatherLimit && (
          <button onClick={() => setGatherLimit((n) => n + 20)} className="w-full text-xs py-2" style={{ color: 'var(--text-muted)', background: 'var(--surface-card)', borderTop: '1px solid var(--border-subtle)' }}>
            Show more ({gathers.length - gatherLimit} left)
          </button>
        )}
      </section>
    </div>
  );
}
