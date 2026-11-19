import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Sparkles, ChevronRight } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import wishingWellData from '../data/wishing-well.json';
import { ItemIcon } from './ItemIcon';
import { LocationPlanner } from './LocationPlanner';
import { questShortfalls } from '../questNeeds';
import { runLocations } from '../runLocations';
import { buildMilestonePlan, buildFarmLadder, apWithin } from '../milestonePlan';

// Generated from buddy.farm by `npm run sync:buddyfarm`: item → what to throw in (% chance)
const WISHING_WELL_OUTPUTS = Object.entries(wishingWellData as Record<string, { item: string; chance: number }[]>)
  .map(([item, inputs]) => ({ item, inputs }));

// Mastery AP is compared over the first this-many attempts at each location
const AP_BUDGET = 100_000;

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
  initialLocation?: string | null;
}

type TypeFilter = 'all' | 'fishing' | 'explore' | 'mining';
type Sort = 'quests' | 'mastery';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.ceil(n).toLocaleString();
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={v === value
            ? { background: 'var(--accent-purple)', color: '#fff' }
            : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function LocationsTab({ activeQuests, nextUpQuests, initialLocation }: Props) {
  const { inventory, masteryLevels, masteryProgress, cropTimes, plotCount } = useStore();
  const [includeNextUp, setIncludeNextUp] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<Sort>('quests');
  const [open, setOpen] = useState<string | null>(initialLocation ?? null);
  const openRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialLocation) openRef.current?.scrollIntoView({ block: 'start' });
  }, [initialLocation]);

  const shortfalls = useMemo(
    () => questShortfalls(includeNextUp ? [...activeQuests, ...nextUpQuests] : activeQuests, inventory),
    [activeQuests, nextUpQuests, includeNextUp, inventory],
  );

  const apByLocation = useMemo(() => {
    const input = { masteryLevels, masteryProgress, inventory, cropTimes, plotCount };
    const plan = buildMilestonePlan(input);
    return new Map(runLocations.map((l) => [l.name, apWithin(buildFarmLadder(l.name, l.type, input, plan.crafts, plan.gathers), AP_BUDGET)]));
  }, [masteryLevels, masteryProgress, inventory, cropTimes, plotCount]);

  const rows = useMemo(() => runLocations
    .filter((l) => typeFilter === 'all' || l.type === typeFilter)
    .map((l) => {
      const items = l.drops.filter((d) => shortfalls.raw.has(d.item)).map((d) => ({ item: d.item, qty: shortfalls.raw.get(d.item)!.qty }));
      return { location: l, items, ap: apByLocation.get(l.name) ?? 0 };
    })
    .filter((r) => r.items.length > 0 || r.ap > 0 || r.location.name === open)
    .sort((a, b) => sort === 'quests'
      ? b.items.length - a.items.length || b.ap - a.ap
      : b.ap - a.ap || b.items.length - a.items.length),
  [shortfalls, apByLocation, typeFilter, sort, open]);

  const wishingWell = WISHING_WELL_OUTPUTS.filter(({ item }) => {
    const n = shortfalls.needs.get(item);
    return n !== undefined && (inventory[item] ?? 0) < n.need;
  });

  return (
    <div className="space-y-3">
      <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <MapPin size={15} style={{ color: 'var(--accent-green)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Locations</h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Where your quest items drop and how much mastery AP each place is worth (over the first {fmt(AP_BUDGET)} attempts).
          Open one to plan a run: how far it gets you, milestones it crosses, what to put in Craftworks, and what would pass your cap.
        </p>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <Pills value={sort} onChange={setSort} options={[['quests', 'Quest items first'], ['mastery', 'Mastery AP first']]} />
          <Pills value={typeFilter} onChange={setTypeFilter} options={[['all', 'All'], ['explore', 'Explore'], ['fishing', 'Fishing'], ['mining', 'Mining']]} />
          <label className="flex items-center gap-2 ml-auto cursor-pointer select-none text-xs" style={{ color: 'var(--text-muted)' }}>
            Include next-up quests
            <input type="checkbox" checked={includeNextUp} onChange={(e) => setIncludeNextUp(e.target.checked)} className="w-3.5 h-3.5 accent-purple-500" />
          </label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
          Nothing you're working on drops anywhere {typeFilter === 'all' ? '' : 'of this type '}right now.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          {rows.map(({ location: l, items, ap }, i) => {
            const isOpen = open === l.name;
            return (
              <div key={l.name} ref={isOpen ? openRef : undefined} style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
                <button
                  onClick={() => setOpen(isOpen ? null : l.name)}
                  className="w-full text-left px-3 py-2.5"
                  style={isOpen ? { background: 'var(--surface-inset)' } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{l.name}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{l.type === 'explore' ? 'explore' : l.type}</span>
                    <span className="ml-auto flex items-center gap-3 text-[11px] font-mono">
                      {items.length > 0 && <span style={{ color: 'var(--accent-orange)' }}>{items.length} quest item{items.length > 1 ? 's' : ''}</span>}
                      {ap > 0 && <span style={{ color: 'var(--accent-purple)' }}>+{ap} AP</span>}
                      <ChevronRight size={13} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(90deg)' : undefined }} />
                    </span>
                  </div>
                  {items.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {items.slice(0, 6).map((it) => (
                        <span key={it.item}><ItemIcon item={it.item} />{it.item} <span className="font-mono" style={{ color: 'var(--accent-orange)' }}>{fmt(it.qty)}</span></span>
                      ))}
                      {items.length > 6 && <span style={{ color: 'var(--text-muted)' }}>+{items.length - 6} more</span>}
                    </div>
                  )}
                </button>
                {isOpen && <LocationPlanner key={l.name} location={l} shortfalls={shortfalls} />}
              </div>
            );
          })}
        </div>
      )}

      {wishingWell.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-purple-border)' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-purple-bg)', borderBottom: '1px solid var(--accent-purple-border)' }}>
            <Sparkles size={13} style={{ color: 'var(--accent-purple)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--accent-purple)' }}>Wishing Well</span>
            <span className="text-xs" style={{ color: 'var(--accent-purple)', opacity: 0.7 }}>— throw items in to receive rewards</span>
          </div>
          {wishingWell.map(({ item, inputs }, i) => {
            const need = shortfalls.needs.get(item)!.need;
            return (
              <div key={item} className="px-4 py-2 text-xs" style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}><ItemIcon item={item} />{item}</span>
                  <span className="font-mono" style={{ color: 'var(--accent-orange)' }}>{(inventory[item] ?? 0).toLocaleString()}/{need.toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {inputs.map((inp) => (
                    <span key={inp.item}>
                      <ItemIcon item={inp.item} size={14} />{inp.item} <span className="font-mono" style={{ color: 'var(--accent-purple)' }}>{inp.chance}%</span>{' '}
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>({(inventory[inp.item] ?? 0).toLocaleString()} in stock)</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
