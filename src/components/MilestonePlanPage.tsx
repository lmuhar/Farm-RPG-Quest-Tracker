import { useMemo, useState } from 'react';
import { Target, Link2, Compass, ChevronDown, ChevronUp, Factory, ArrowDown, MapPin, X } from 'lucide-react';
import { useStore } from '../store';
import { buildMilestonePlan, buildLocationGuide, buildFarmLadder, apWithin } from '../milestonePlan';
import type { CraftPlan, GatherPlan, Material, GuideSlot, FarmLadder } from '../milestonePlan';
import { itemLocations, formatRate, sourceHint } from '../data/itemSources';
import { formatDuration } from '../utils';
import { runLocations, RUN_VERB } from '../farmingRun';

type SortMode = 'farming' | 'easiest';
type TierFilter = 'all' | '10k' | '100k';

const SORTS: { id: SortMode; label: string; hint: string }[] = [
  { id: 'farming', label: 'Least farming', hint: 'most AP (chain milestones included) per 1,000 attempts · chains needing shop or reward items last' },
  { id: 'easiest', label: 'Easiest to master', hint: 'by your mastery ranking (hardest step in the chain), most AP first' },
];

// Attempts the ladder ranks locations by
const LADDER_BUDGET = 100_000;

const METHOD_LABELS: Record<string, string> = {
  crafting: 'Crafting', cooking: 'Cooking', steelworks: 'Steelworks', other: 'Other',
  fishing: 'Fishing', exploring: 'Exploring', mining: 'Mining', farming: 'Farming',
};

const TIER_COLOR = { 10: '#cd7f32', 100: '#c0c0c0' } as Record<number, string>;

function inTier(p: { pts: number }, tier: TierFilter) {
  return tier === 'all' || (tier === '10k' ? p.pts === 10 : p.pts === 100);
}

function sortCrafts(list: CraftPlan[], mode: SortMode): CraftPlan[] {
  return [...list].sort((a, b) => {
    if (mode === 'easiest') return a.ease - b.ease || b.totalPts - a.totalPts || a.attempts - b.attempts;
    return Number(a.other.length > 0) - Number(b.other.length > 0)
      || b.apPerThousand - a.apPerThousand
      || b.totalPts - a.totalPts
      || a.ease - b.ease;
  });
}

// 698,100 → "698k"
function approx(n: number) {
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) return `${Math.round(n / 1000).toLocaleString()}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function perThousandLabel(ap: number) {
  return ap >= 10 ? Math.round(ap).toLocaleString() : ap >= 0.1 ? ap.toFixed(1) : ap.toFixed(2);
}

const runLocationNames = new Set(runLocations.map((l) => l.name));

type OpenLocation = (location: string) => void;

// Location name that opens it on the Farming Run page
function LocationLink({ name, onOpen }: { name: string; onOpen?: OpenLocation }) {
  if (!onOpen || !runLocationNames.has(name)) return <>{name}</>;
  return (
    <button
      onClick={() => onOpen(name)}
      title="Plan a Farming Run here"
      className="underline decoration-dotted underline-offset-2 hover:opacity-80"
      style={{ color: 'var(--accent-blue)' }}
    >
      {name}
    </button>
  );
}

// Where to get a material, best source first
function WhereToGet({ item, onOpen }: { item: string; onOpen?: OpenLocation }) {
  let best: { name: string; type: string; rate: number } | null = null;
  for (const loc of itemLocations[item] ?? []) {
    if (loc.rate && (!best || loc.rate < best.rate)) best = { name: loc.name, type: loc.type, rate: loc.rate };
  }
  if (best) return <><LocationLink name={best.name} onOpen={onOpen} /> ({formatRate(best.rate)})</>;
  return <>{sourceHint(item)}</>;
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

function diffColor(d: number) {
  if (d <= 3) return 'var(--accent-green)';
  if (d <= 6) return 'var(--accent-yellow)';
  if (d <= 8) return 'var(--accent-orange)';
  return '#f87171';
}

// Your mastery ranking (1 easy – 10 expert), as on the Masteries page
function DiffBadge({ d }: { d: number }) {
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
      title="Your mastery ranking (1 easy – 10 expert)"
      style={{ color: diffColor(d), border: `1px solid ${diffColor(d)}60` }}
    >
      {d}
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

function MaterialRow({ m, onOpen }: { m: Material; onOpen?: OpenLocation }) {
  const where = m.short > 0 ? (m.passive ? 'refills on its own' : <WhereToGet item={m.item} onOpen={onOpen} />) : null;
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

function CraftCard({ plan, onOpen }: { plan: CraftPlan; onOpen?: OpenLocation }) {
  const [open, setOpen] = useState(false);
  const hits = plan.chain.filter((s) => s.pts > 0);
  const extra = plan.chain.filter((s) => s.pts === 0);
  const short = plan.materials.filter((m) => m.short > 0);
  const shownMats = open ? plan.materials : short.slice(0, 3);

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.item}</span>
            <DiffBadge d={plan.difficulty} />
            <TierBadge pts={plan.pts} level={plan.progress.level} />
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {METHOD_LABELS[plan.method] ?? plan.method} · {plan.progress.count.toLocaleString()}/{plan.target.toLocaleString()} · {plan.remaining.toLocaleString()} to craft
            {plan.ease > plan.difficulty && <> · chain ranks {plan.ease}</>}
          </p>
        </div>
        {plan.totalPts > plan.pts && (
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>
            {plan.totalPts} AP total
          </span>
        )}
      </div>

      <FarmingCost plan={plan} onOpen={onOpen} />

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
                  ({s.how === 'gather' ? 'gather' : 'craft'} {s.added.toLocaleString()}, +{s.pts}, rank {s.difficulty})
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
          {shownMats.map((m) => <MaterialRow key={m.item} m={m} onOpen={onOpen} />)}
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

// What the chain's shortfall takes to farm
function FarmingCost({ plan, onOpen }: { plan: CraftPlan; onOpen?: OpenLocation }) {
  const passive = plan.materials.filter((m) => m.passive && m.short > 0).map((m) => m.item);
  return (
    <div className="rounded-md px-2.5 py-2 space-y-0.5 text-xs" style={{ background: 'var(--surface-inset)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
          {plan.attempts > 0 ? <>Farming ≈ {approx(plan.attempts)} attempts</> : 'No farming needed'}
        </span>
        {plan.attempts > 0 && (
          <span className="text-[11px] font-bold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>
            {perThousandLabel(plan.apPerThousand)} AP / 1k
          </span>
        )}
      </div>
      {plan.farm.map((f) => (
        <p key={f.location} style={{ color: 'var(--text-muted)' }}>
          ≈ {approx(f.attempts)} {RUN_VERB[f.type] ?? 'attempts'} at <LocationLink name={f.location} onOpen={onOpen} /> · {f.items.join(', ')}
        </p>
      ))}
      {plan.crops.length > 0 && (
        <p style={{ color: 'var(--text-muted)' }}>≈ {plan.grows.toLocaleString()} grows · {plan.crops.join(', ')}</p>
      )}
      {passive.length > 0 && <p style={{ color: 'var(--text-muted)' }}>Passive: {passive.join(', ')}</p>}
      {plan.other.length > 0 && (
        <p style={{ color: 'var(--accent-yellow)' }}>Also needs {plan.other.join(', ')} (no drop location)</p>
      )}
    </div>
  );
}

function GatherRow({ plan, onOpen }: { plan: GatherPlan; onOpen?: OpenLocation }) {
  const pct = Math.min(1, plan.progress.count / plan.target);
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{plan.item}</span>
          <DiffBadge d={plan.difficulty} />
          <TierBadge pts={plan.pts} level={plan.progress.level} />
        </div>
        <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {plan.progress.count.toLocaleString()}/{plan.target.toLocaleString()}
        </span>
      </div>
      <Bar pct={pct} color={TIER_COLOR[plan.pts]} />
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {METHOD_LABELS[plan.method]} · {plan.location && <LocationLink name={plan.location} onOpen={onOpen} />} · ≈ {plan.effortLabel}
        {plan.minutes != null && <> · {formatLong(plan.minutes)}</>}
      </p>
    </div>
  );
}

// How many crafts the drops keep fed, e.g. "≈ 75 crafts per 1,000 explores"
function pace(perThousand: number, verb: string) {
  if (perThousand >= 1) return `≈ ${Math.floor(perThousand).toLocaleString()} crafts per 1,000 ${verb}`;
  return `≈ 1 craft per ${Math.round(1000 / perThousand).toLocaleString()} ${verb}`;
}

function GuideRow({ slot, n, verb }: { slot: GuideSlot; n: number; verb: string }) {
  const { progress } = slot;
  return (
    <div className="px-4 py-2.5 flex gap-3">
      <span className="text-xs font-bold w-4 text-right flex-shrink-0 pt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{n}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{slot.item}</span>
          {slot.difficulty != null && <DiffBadge d={slot.difficulty} />}
          {slot.plan && <TierBadge pts={slot.plan.pts} level={slot.plan.progress.level} />}
          {slot.plan && slot.plan.totalPts > slot.plan.pts && (
            <span className="text-[11px] font-bold" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>{slot.plan.totalPts} AP chain</span>
          )}
          {progress && (
            <span className="text-xs ml-auto" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {progress.count.toLocaleString()}/{slot.target.toLocaleString()}
            </span>
          )}
        </div>
        {progress && <Bar pct={Math.min(1, progress.count / slot.target)} color={TIER_COLOR[progress.level === 0 ? 10 : 100]} />}
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {slot.feeds ? (
            <span className="inline-flex items-center gap-1">
              <ArrowDown size={11} /> makes {slot.item} for the {slot.feeds} line
              {slot.source === 'drops' ? ' from what you farm here' : slot.source === 'mastery' ? ', so both masteries move' : ' from passive materials'}
            </span>
          ) : slot.fromHere.length === 0 && slot.elsewhere.length === 0 ? (
            'Runs on passive materials'
          ) : (
            <>
              {slot.fromHere.length > 0 && (
                <>
                  Farm {slot.fromHere.join(', ')} here · {pace(slot.perThousand, verb)}
                </>
              )}
              {slot.elsewhere.length > 0 && (
                <span style={{ color: 'var(--accent-yellow)' }}>{slot.fromHere.length > 0 && ' · '}also needs {slot.elsewhere.join(', ')} from elsewhere</span>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}

type RunLocation = (typeof runLocations)[number];

function CraftworksGuide({ location, crafts }: { location: RunLocation; crafts: CraftPlan[] }) {
  const { masteryLevels, masteryProgress, inventory, cropTimes, plotCount, craftworksSlots } = useStore();
  const guide = useMemo(
    () => buildLocationGuide(location.name, { masteryLevels, masteryProgress, inventory, cropTimes, plotCount }, crafts, craftworksSlots),
    [location, masteryLevels, masteryProgress, inventory, cropTimes, plotCount, crafts, craftworksSlots]
  );
  const verb = RUN_VERB[location.type] ?? 'attempts';

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
        <Factory size={13} style={{ color: 'var(--accent-orange)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Craftworks while you're here</span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {craftworksSlots} slots · every ingredient on its own line, fed by {location.name} drops and passive materials
        </span>
      </div>
      {guide.slots.length === 0 ? (
        <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          No crafting or steelworks mastery with an AP milestone left uses what drops here.
        </p>
      ) : (
        <div className="divide-y divide-[color:var(--border-subtle)]">
          {guide.slots.map((slot, i) => <GuideRow key={slot.item} slot={slot} n={i + 1} verb={verb} />)}
        </div>
      )}
    </div>
  );
}

type LadderStep = FarmLadder['steps'][number];

function LadderRow({ step, n, verb, prev }: { step: LadderStep; n: number; verb: string; prev?: LadderStep }) {
  const added = step.attempts - (prev?.attempts ?? 0);
  const grown = step.crops - (prev?.crops ?? 0);
  return (
    <div className="px-4 py-2 flex gap-3 items-start">
      <span className="text-xs font-bold w-4 text-right flex-shrink-0 pt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{step.item}</span>
          <DiffBadge d={step.difficulty} />
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{step.kind === 'craft' ? 'craft' : 'gather'}</span>
          <span className="text-[11px] font-bold" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>+{step.pts} AP</span>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {added > 0 ? `${approx(added)} more ${verb}` : `no extra ${verb}: the drops are already coming`}
          {step.also.length > 0 && <> · also crosses {step.also.join(', ')}</>}
          {grown > 0 && <> · grow {approx(grown)} {step.grow.join(', ')}</>}
        </p>
      </div>
      <span className="text-xs flex-shrink-0 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
        ≈ {approx(step.attempts)}
        <span className="block text-[10px]" style={{ color: 'var(--text-muted)' }}>{verb}</span>
      </span>
    </div>
  );
}

interface RankedLocation { location: RunLocation; ladder: FarmLadder; ap: number }

function WhereToFarm({ ranked, crafts, locName, setLocName, onOpen }: {
  ranked: RankedLocation[];
  crafts: CraftPlan[];
  locName: string;
  setLocName: (name: string) => void;
  onOpen?: OpenLocation;
}) {
  const [limit, setLimit] = useState(10);
  const picked = ranked.find((r) => r.location.name === locName);
  const verb = picked ? RUN_VERB[picked.location.type] ?? 'attempts' : '';
  const shown = picked ? picked.ladder.steps.slice(0, limit) : [];
  const totalAp = picked ? picked.ladder.steps.reduce((sum, s) => sum + s.pts, 0) : 0;

  return (
    <section className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
        <MapPin size={13} style={{ color: 'var(--accent-green)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Where to farm</span>
        <select
          value={locName}
          onChange={(e) => { setLocName(e.target.value); setLimit(10); }}
          className="text-xs rounded-lg px-2 py-1 ml-auto min-w-0 max-w-full"
          style={{ background: 'var(--surface-card)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}
        >
          <option value="">Best places first</option>
          {(['explore', 'fishing', 'mining'] as const).map((type) => (
            <optgroup key={type} label={type === 'explore' ? 'Exploring' : type === 'fishing' ? 'Fishing' : 'Mining'}>
              {runLocations.filter((l) => l.type === type).map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </optgroup>
          ))}
        </select>
        {picked && (
          <button onClick={() => setLocName('')} title="Back to the best places" style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ background: 'var(--surface-card)' }}>
        {!picked ? (
          <>
            <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
              Most AP from the first {approx(LADDER_BUDGET)} attempts at each location. Every chain fed there shares the same drops and your
              inventory, and only counts when that location, your crops and passive materials cover all of it. Pick one for the order to go in.
            </p>
            <div className="divide-y divide-[color:var(--border-subtle)]">
              {ranked.filter((r) => r.ap > 0).slice(0, 8).map((r) => (
                <button
                  key={r.location.name}
                  onClick={() => setLocName(r.location.name)}
                  className="w-full text-left px-4 py-2 flex items-start gap-3 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.location.name}</span>
                    <span className="text-[11px] ml-1.5" style={{ color: 'var(--text-muted)' }}>{RUN_VERB[r.location.type]}</span>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {r.ladder.steps.filter((s) => s.attempts <= LADDER_BUDGET).map((s) => s.item).join(', ')}
                    </p>
                  </div>
                  <span className="text-xs font-bold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>+{r.ap} AP</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
              {picked.ladder.steps.length === 0
                ? `Nothing with an AP milestone left can be fed from ${picked.location.name} alone.`
                : <>In order of most AP per extra {verb.replace(/s$/, '')}: +{totalAp} AP over ≈ {approx(picked.ladder.steps[picked.ladder.steps.length - 1].attempts)} {verb}. Counts on the right are totals so far.</>}
            </p>
            <div className="divide-y divide-[color:var(--border-subtle)]">
              {shown.map((step, i) => (
                <LadderRow key={step.item} step={step} n={i + 1} verb={verb} prev={shown[i - 1]} />
              ))}
            </div>
            {picked.ladder.steps.length > limit && (
              <button onClick={() => setLimit((n) => n + 15)} className="w-full text-xs py-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
                Show more ({picked.ladder.steps.length - limit} left)
              </button>
            )}
            <CraftworksGuide location={picked.location} crafts={crafts} />
            {onOpen && (
              <button
                onClick={() => onOpen(picked.location.name)}
                className="w-full text-xs py-2"
                style={{ color: 'var(--accent-blue)', borderTop: '1px solid var(--border-subtle)' }}
              >
                Plan a trip here on Farming Run (quest needs and overflow) →
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function MilestonePlanPage({ onOpenLocation }: { onOpenLocation?: OpenLocation }) {
  const { masteryLevels, masteryProgress, inventory, cropTimes, plotCount } = useStore();
  const [sort, setSort] = useState<SortMode>('farming');
  const [locName, setLocName] = useState('');
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

  const ranked = useMemo(() => {
    const input = { masteryLevels, masteryProgress, inventory, cropTimes, plotCount };
    return runLocations
      .map((location) => {
        const ladder = buildFarmLadder(location.name, location.type, input, plan.crafts, plan.gathers);
        return { location, ladder, ap: apWithin(ladder, LADDER_BUDGET) };
      })
      .sort((a, b) => b.ap - a.ap || (a.ladder.steps[0]?.attempts ?? Infinity) - (b.ladder.steps[0]?.attempts ?? Infinity));
  }, [plan, masteryLevels, masteryProgress, inventory, cropTimes, plotCount]);

  const summary = useMemo(() => {
    const all = [...plan.crafts, ...plan.gathers];
    return {
      tenK: all.filter((p) => p.pts === 10).length,
      hundredK: all.filter((p) => p.pts === 100).length,
      apOnOffer: all.reduce((sum, p) => sum + p.pts, 0),
      noFarming: plan.crafts.filter((p) => p.attempts === 0 && p.other.length === 0 && p.remaining > 0).length,
    };
  }, [plan]);
  const bestPlace = ranked[0]?.ap > 0 ? ranked[0] : null;

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
          Every 10k (+10 AP) and 100k (+100 AP) mastery milestone you can still hit, by the farming it takes: inventory only
          gives a head start, so each shortfall becomes attempts at its best location (a crop counts as one).
          Crafts are planned as chains: ingredients that are masteries themselves get crafted fresh so they count too.
          The number badge is your mastery ranking (1 easy – 10 expert).
          {summary.noFarming > 0 && <> {summary.noFarming} chains need no farming at all, only passive materials and stock: they lead the Least farming list.</>}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'AP on offer', value: summary.apOnOffer.toLocaleString(), color: 'var(--accent-purple)' },
            { label: bestPlace ? `Best place: ${bestPlace.location.name}` : 'Best place to farm', value: bestPlace ? `+${bestPlace.ap}` : '—', color: 'var(--accent-green)' },
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
            {!hasInventory && 'No inventory synced yet, so nothing counts as a head start. '}
            Sync both from Settings for an accurate plan.
          </p>
        )}
      </div>

      <WhereToFarm ranked={ranked} crafts={plan.crafts} locName={locName} setLocName={setLocName} onOpen={onOpenLocation} />

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
          {crafts.slice(0, craftLimit).map((p) => <CraftCard key={p.item} plan={p} onOpen={onOpenLocation} />)}
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
          {gathers.slice(0, gatherLimit).map((p) => <GatherRow key={p.item} plan={p} onOpen={onOpenLocation} />)}
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
