import { useMemo } from 'react';
import { Hammer, Target, Trophy } from 'lucide-react';
import { useStore } from '../store';
import { ItemIcon } from './ItemIcon';
import { buildMilestonePlan, buildFarmLadder, buildLocationGuide } from '../milestonePlan';
import { bestRunLocation, type Shortfalls } from '../questNeeds';
import type { RunLocation } from '../runLocations';

// What to do at one location: the quest items you're short that drop there,
// the mastery milestones it leads to, and what to keep Craftworks making while
// you farm.

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.ceil(n).toLocaleString();
}

interface CraftLine { item: string; kind: 'quest' | 'mastery'; note: string }

function Heading({ Icon, color, children }: { Icon: typeof Target; color: string; children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
      <Icon size={11} /> {children}
    </p>
  );
}

export function LocationPlanner({ location, shortfalls }: { location: RunLocation; shortfalls: Shortfalls }) {
  const { inventory, craftworksSlots, masteryLevels, masteryProgress, cropTimes, plotCount } = useStore();

  const questDrops = useMemo(() => location.drops
    .filter((d) => shortfalls.raw.has(d.item))
    .map((d) => {
      const r = shortfalls.raw.get(d.item)!;
      const best = bestRunLocation(d.item);
      return { ...d, ...r, betterAt: best && best.name !== location.name && best.rate < d.rate * 0.8 ? best.name : null };
    }), [location, shortfalls]);

  const mastery = useMemo(() => {
    const input = { masteryLevels, masteryProgress, inventory, cropTimes, plotCount };
    const plan = buildMilestonePlan(input);
    return {
      ladder: buildFarmLadder(location.name, location.type, input, plan.crafts, plan.gathers),
      guide: buildLocationGuide(location.name, input, plan.crafts, craftworksSlots),
    };
  }, [location, masteryLevels, masteryProgress, inventory, cropTimes, plotCount, craftworksSlots]);

  // The first few milestones farming here leads to, in the order you'd reach them
  const milestones = mastery.ladder.steps.slice(0, 5);

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

  return (
    <div className="px-3 pb-3 pt-2 space-y-3 text-xs" style={{ background: 'var(--surface-inset)' }}>
      {questDrops.length > 0 && (
        <div className="space-y-1">
          <Heading Icon={Target} color="var(--accent-orange)">Quest items here</Heading>
          {questDrops.map((d) => (
            <div key={d.item} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }} title={d.forItems.length ? `for ${d.forItems.join(', ')}` : undefined}>
                <ItemIcon item={d.item} />{d.item}
                {d.betterAt && <span className="text-[10px] ml-1.5" style={{ color: 'var(--accent-yellow)' }}>drops more at {d.betterAt}</span>}
              </span>
              <span className="font-mono" style={{ color: 'var(--accent-orange)' }}>need {fmt(d.qty)}</span>
            </div>
          ))}
        </div>
      )}

      {milestones.length > 0 && (
        <div className="space-y-1">
          <Heading Icon={Trophy} color="var(--accent-purple)">Mastery milestones here</Heading>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-secondary)' }}>
            {milestones.map((m) => (
              <span key={m.item}><ItemIcon item={m.item} />{m.item} <span className="font-mono" style={{ color: 'var(--accent-purple)' }}>+{m.pts} AP</span></span>
            ))}
          </p>
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

      {questDrops.length === 0 && milestones.length === 0 && lines.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>Nothing you're working on drops here.</p>
      )}
    </div>
  );
}
