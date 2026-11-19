import { useMemo, useState } from 'react';
import { Hammer, Target, Trophy, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { ItemIcon } from './ItemIcon';
import { buildMilestonePlan, buildFarmLadder, buildLocationGuide } from '../milestonePlan';
import { bestRunLocation, type Shortfalls } from '../questNeeds';
import { RUN_VERB, type RunLocation } from '../runLocations';

// One trip to one location, everything in one place: how far a run gets the
// quest items you're short, which mastery milestones it crosses, what to keep
// Craftworks making while you farm, and which drops would pass your cap.

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toLocaleString();
}

const PRESETS = [100, 1_000, 5_000, 10_000];

interface CraftLine { item: string; kind: 'quest' | 'mastery'; note: string }

function Heading({ Icon, color, children }: { Icon: typeof Target; color: string; children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
      <Icon size={11} /> {children}
    </p>
  );
}

export function LocationPlanner({ location, shortfalls }: { location: RunLocation; shortfalls: Shortfalls }) {
  const { inventory, inventoryMax, craftworksSlots, masteryLevels, masteryProgress, cropTimes, plotCount } = useStore();
  const verb = RUN_VERB[location.type] ?? 'attempts';

  const questDrops = useMemo(() => location.drops
    .filter((d) => shortfalls.raw.has(d.item))
    .map((d) => {
      const r = shortfalls.raw.get(d.item)!;
      const best = bestRunLocation(d.item);
      return { ...d, ...r, betterAt: best && best.name !== location.name && best.rate < d.rate * 0.8 ? best.name : null };
    }), [location, shortfalls]);
  const finishAll = questDrops.reduce((m, d) => Math.max(m, Math.ceil(d.qty * d.rate)), 0);
  const [attempts, setAttempts] = useState(() => (finishAll > 0 ? Math.min(finishAll, 1_000) : 1_000));

  const mastery = useMemo(() => {
    const input = { masteryLevels, masteryProgress, inventory, cropTimes, plotCount };
    const plan = buildMilestonePlan(input);
    return {
      ladder: buildFarmLadder(location.name, location.type, input, plan.crafts, plan.gathers),
      guide: buildLocationGuide(location.name, input, plan.crafts, craftworksSlots),
    };
  }, [location, masteryLevels, masteryProgress, inventory, cropTimes, plotCount, craftworksSlots]);

  const hit = mastery.ladder.steps.filter((s) => s.attempts <= attempts);
  const upcoming = mastery.ladder.steps.filter((s) => s.attempts > attempts).slice(0, 3);
  const apHit = hit.reduce((sum, s) => sum + s.pts, 0);

  // Craftworks: quest lines first (what the quest drops here get made into), then mastery chains
  const lines: CraftLine[] = [];
  for (const d of [...questDrops].sort((a, b) => a.rate - b.rate)) {
    for (const product of d.madeInto) {
      const line = lines.find((l) => l.item === product);
      if (line) line.note += `, ${d.item}`;
      else lines.push({ item: product, kind: 'quest', note: `uses ${d.item}` });
    }
  }
  for (const slot of mastery.guide.slots) {
    if (lines.some((l) => l.item === slot.item)) continue;
    const note = slot.feeds
      ? `feeds the ${slot.feeds} line`
      : slot.fromHere.length
        ? `uses ${slot.fromHere.join(', ')}${slot.plan ? ` · +${slot.plan.pts} AP` : ''}`
        : 'runs on passive materials';
    lines.push({ item: slot.item, kind: 'mastery', note });
  }
  const slots = Math.max(1, craftworksSlots);

  const overflow = location.drops
    .map((d) => {
      const have = inventory[d.item] ?? 0;
      const gain = attempts / d.rate;
      return { item: d.item, over: Math.max(0, have + gain - inventoryMax) - Math.max(0, have - inventoryMax) };
    })
    .filter((d) => inventoryMax > 0 && d.over >= 1)
    .sort((a, b) => b.over - a.over);

  const presets = [...PRESETS, ...(finishAll > 0 && !PRESETS.includes(finishAll) ? [finishAll] : [])].sort((a, b) => a - b);

  return (
    <div className="px-3 pb-3 pt-2 space-y-3 text-xs" style={{ background: 'var(--surface-inset)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min={1}
          value={attempts}
          onChange={(e) => setAttempts(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 rounded px-2 py-1 font-mono"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
        <span style={{ color: 'var(--text-muted)' }}>{verb}</span>
        {presets.map((n) => (
          <button
            key={n}
            onClick={() => setAttempts(n)}
            className="px-2 py-0.5 rounded-full font-mono"
            title={n === finishAll ? 'Enough to finish every quest item here' : undefined}
            style={n === attempts
              ? { background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }
              : { background: 'var(--surface-card)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          >
            {n === finishAll ? `all ${fmt(n)}` : fmt(n)}
          </button>
        ))}
      </div>

      {questDrops.length > 0 && (
        <div className="space-y-1.5">
          <Heading Icon={Target} color="var(--accent-orange)">Quest items here</Heading>
          {questDrops.map((d) => {
            const gain = attempts / d.rate;
            const pct = Math.min(1, gain / d.qty);
            const left = Math.max(0, Math.ceil((d.qty - gain) * d.rate));
            return (
              <div key={d.item}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }} title={d.forItems.length ? `for ${d.forItems.join(', ')}` : undefined}>
                    <ItemIcon item={d.item} />{d.item}
                    {d.betterAt && <span className="text-[10px] ml-1.5" style={{ color: 'var(--accent-yellow)' }}>drops more at {d.betterAt}</span>}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--accent-green)' }}>+{fmt(gain)}</span>
                  <span className="font-mono w-20 text-right" style={{ color: 'var(--text-muted)' }}>of {fmt(d.qty)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-card)' }}>
                    <div className="h-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--accent-green)' : 'var(--accent-orange)' }} />
                  </div>
                  <span className="text-[10px] w-20 text-right font-mono" style={{ color: 'var(--text-muted)' }}>{left ? `${fmt(left)} more` : 'done'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mastery.ladder.steps.length > 0 && (
        <div className="space-y-1">
          <Heading Icon={Trophy} color="var(--accent-purple)">
            Mastery milestones {apHit > 0 && <span className="normal-case tracking-normal font-mono">· +{apHit} AP on this run</span>}
          </Heading>
          {hit.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              {hit.map((s) => (
                <span key={s.item}><ItemIcon item={s.item} />{s.item} <span className="font-mono" style={{ color: 'var(--accent-purple)' }}>+{s.pts}</span></span>
              ))}
            </p>
          )}
          {upcoming.map((s) => (
            <p key={s.item} style={{ color: 'var(--text-muted)' }}>
              Next: <ItemIcon item={s.item} />{s.item} <span className="font-mono" style={{ color: 'var(--accent-purple)' }}>+{s.pts} AP</span> at ≈ {fmt(s.attempts)} {verb}
            </p>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="space-y-1">
          <Heading Icon={Hammer} color="var(--accent-yellow)">Craftworks while you're here · {slots} slots</Heading>
          {lines.slice(0, slots).map((l, i) => (
            <p key={l.item} style={{ color: 'var(--text-secondary)' }}>
              <span className="font-mono mr-1.5" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
              <ItemIcon item={l.item} />{l.item}
              <span
                className="text-[9px] uppercase tracking-wider font-bold mx-1.5 px-1 rounded"
                style={l.kind === 'quest'
                  ? { color: 'var(--accent-orange)', background: 'var(--accent-orange-bg)' }
                  : { color: 'var(--accent-purple)', background: 'var(--accent-purple-bg)' }}
              >
                {l.kind}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{l.note}</span>
            </p>
          ))}
          {lines.length > slots && (
            <p style={{ color: 'var(--text-muted)' }}>
              +{lines.length - slots} more:{' '}
              {lines.slice(slots).map((l, i) => <span key={l.item}>{i > 0 && ', '}<ItemIcon item={l.item} size={14} />{l.item}</span>)}
            </p>
          )}
        </div>
      )}

      {overflow.length > 0 && (
        <p className="flex gap-1.5" style={{ color: 'var(--accent-orange)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            Past your {inventoryMax.toLocaleString()} cap on this run:{' '}
            {overflow.slice(0, 5).map((o, i) => (
              <span key={o.item}>{i > 0 && ', '}<ItemIcon item={o.item} />{o.item} (~{fmt(o.over)})</span>
            ))}
            {overflow.length > 5 && ` +${overflow.length - 5} more`} — craft them down as you go or the extra is lost.
          </span>
        </p>
      )}

      {questDrops.length === 0 && mastery.ladder.steps.length === 0 && lines.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>Nothing you're working on drops here.</p>
      )}
    </div>
  );
}
