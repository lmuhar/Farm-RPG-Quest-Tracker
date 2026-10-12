import { useMemo, useState } from 'react';
import { Route, Fish, Compass, Gem, Hammer, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Quest } from '../types';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { formatRate } from '../data/itemSources';
import { planRun, questNeeds, rankLocations, runLocations, RUN_VERB } from '../farmingRun';
import type { DropPlan, Recipe, SlotPlan } from '../farmingRun';
import { ItemIcon } from './ItemIcon';

const builtInRecipes = recipesData as Recipe[];

const ATTEMPT_PRESETS = [100, 500, 1000, 5000];

const TYPE_STYLE: Record<string, { Icon: typeof Fish; accent: string }> = {
  explore: { Icon: Compass, accent: 'green' },
  fishing: { Icon: Fish, accent: 'blue' },
  mining: { Icon: Gem, accent: 'red' },
};

const TIER_COLOR = { 0: '#cd7f32', 1: '#c0c0c0' } as Record<number, string>;

function approx(n: number) {
  return n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1);
}

function forQuests(names: string[], max = 2) {
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} +${names.length - max} more` : shown;
}

function Tag({ color, children, title }: { color: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
      style={{ color: `var(--accent-${color})`, background: `var(--accent-${color}-bg)`, border: `1px solid var(--accent-${color}-border)` }}
    >
      {children}
    </span>
  );
}

function MilestoneTag({ m, adds }: { m: NonNullable<DropPlan['mastery']>; adds: number }) {
  const color = TIER_COLOR[m.level];
  const left = m.target - m.count;
  return (
    <span
      title={`Mastery ${m.count.toLocaleString()}/${m.target.toLocaleString()}`}
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
      style={{ color, border: `1px solid ${color}80`, background: `${color}22` }}
    >
      {adds >= left ? `hits ${m.level === 0 ? '10k' : '100k'}` : `${m.level === 0 ? '10k' : '100k'} in ${left.toLocaleString()}`}
    </span>
  );
}

function DropRow({ d, cap, verb }: { d: DropPlan; cap: number; verb: string }) {
  const after = Math.min(cap, d.have + d.gain);
  return (
    <div className="px-4 py-2.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm min-w-0" style={{ color: 'var(--text-primary)' }}>
          <ItemIcon item={d.item} />{d.item}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatRate(d.rate)} {verb}</span>
        {d.quest && <Tag color="yellow" title={d.quest.quests.join(', ')}>🎯 need {d.quest.short.toLocaleString()}</Tag>}
        {d.wasted >= 1 && <Tag color="orange">⚠️ ≈{approx(d.wasted)} over cap</Tag>}
        {d.mastery && <MilestoneTag m={d.mastery} adds={d.gain} />}
        <span className="ml-auto text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {d.have.toLocaleString()} <span style={{ color: 'var(--accent-green)' }}>+≈{approx(d.gain)}</span> → {Math.round(after).toLocaleString()}
          <span style={{ color: 'var(--text-muted)' }}>/{cap.toLocaleString()}</span>
        </span>
      </div>
      {d.quest && (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {d.quest.viaCraft ? 'to craft for ' : 'for '}{forQuests(d.quest.quests)}
          {d.gain >= d.quest.short ? ' · this run should cover it' : ` · ≈${Math.ceil(d.quest.short * d.rate).toLocaleString()} ${verb} for all of it`}
        </p>
      )}
    </div>
  );
}

function SlotRow({ s, i }: { s: SlotPlan; i: number }) {
  return (
    <div className="px-4 py-2.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)' }}>{i + 1}</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}><ItemIcon item={s.output} />{s.output}</span>
        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>×{s.crafts.toLocaleString()}</span>
        {s.mastery && <MilestoneTag m={s.mastery} adds={s.crafts} />}
        <span className="ml-auto text-[11px]" style={{ color: 'var(--accent-green)' }}>uses {s.absorbed.toLocaleString()} overflow</span>
      </div>
      <p className="text-[11px] pl-7" style={{ color: 'var(--text-muted)' }}>
        {s.uses.map((u, j) => (
          <span key={u.item}>
            {j > 0 && ' · '}
            <span style={{ color: u.overflow ? 'var(--accent-orange)' : undefined }}>{u.qty.toLocaleString()} {u.item}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
  initialLocation?: string | null;
}

export function FarmingRunPage({ activeQuests, nextUpQuests, initialLocation }: Props) {
  const { inventory, inventoryMax, craftingRecipes, craftworksSlots, masteryLevels, masteryProgress } = useStore();

  const recipes = useMemo(() => {
    const map = new Map<string, Recipe>(builtInRecipes.map((r) => [r.name.toLowerCase(), r]));
    for (const [item, ings] of Object.entries(craftingRecipes)) map.set(item.toLowerCase(), { name: item, ingredients: ings });
    return map;
  }, [craftingRecipes]);

  const needs = useMemo(
    () => questNeeds(activeQuests, nextUpQuests, inventory, recipes),
    [activeQuests, nextUpQuests, inventory, recipes]
  );
  const ranked = useMemo(() => rankLocations(needs, inventory), [needs, inventory]);

  const [locName, setLocName] = useState<string>(initialLocation ?? ranked[0]?.loc.name ?? runLocations[0].name);
  const [attempts, setAttempts] = useState(500);

  const location = runLocations.find((l) => l.name === locName) ?? runLocations[0];
  const verb = RUN_VERB[location.type];
  const { Icon, accent } = TYPE_STYLE[location.type];

  const plan = useMemo(() => planRun({
    location, attempts, inventory, inventoryMax, needs,
    recipes: [...recipes.values()], masteryLevels, masteryProgress, slotCount: craftworksSlots,
  }), [location, attempts, inventory, inventoryMax, needs, recipes, masteryLevels, masteryProgress, craftworksSlots]);

  const questDrops = plan.drops.filter((d) => d.quest);
  const milestoneHits = plan.drops.filter((d) => d.mastery && d.gain >= d.mastery.target - d.mastery.count).length
    + plan.slots.filter((s) => s.hitsMilestone).length;
  const withQuests = ranked.filter((r) => r.questItems.length > 0);
  const others = ranked.filter((r) => r.questItems.length === 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Route size={16} style={{ color: 'var(--accent-purple)' }} />
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            Farming Run
          </h2>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Pick where you're going and how long for. See what the run is expected to drop, what it does for your quests and
          masteries, and which Craftworks lines to set first so nothing over your {inventoryMax.toLocaleString()} cap gets voided.
          Drop rates are buddy.farm averages, so amounts are estimates.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={location.name}
            onChange={(e) => setLocName(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 min-w-0 max-w-full"
            style={{ background: 'var(--surface-inset)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}
          >
            {withQuests.length > 0 && (
              <optgroup label="Has items your quests need">
                {withQuests.map(({ loc, questItems }) => (
                  <option key={loc.name} value={loc.name}>{loc.name} ({loc.type}) · {questItems.length} quest item{questItems.length !== 1 ? 's' : ''}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={withQuests.length > 0 ? 'Other locations' : 'Locations'}>
              {others.map(({ loc }) => <option key={loc.name} value={loc.name}>{loc.name} ({loc.type})</option>)}
            </optgroup>
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={attempts}
              onChange={(e) => setAttempts(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 text-sm rounded-lg px-2 py-1.5"
              style={{ background: 'var(--surface-inset)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', fontFamily: 'var(--font-mono)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{verb}</span>
          </div>
          <div className="flex gap-1">
            {ATTEMPT_PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => setAttempts(n)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={attempts === n
                  ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                  : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
          <span style={{ color: questDrops.length ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>🎯 {questDrops.length} quest item{questDrops.length !== 1 ? 's' : ''}</span>
          <span style={{ color: milestoneHits ? 'var(--accent-purple)' : 'var(--text-muted)' }}>🏅 {milestoneHits} milestone{milestoneHits !== 1 ? 's' : ''} hit</span>
          {plan.wastedBefore === 0 ? (
            <span style={{ color: 'var(--accent-green)' }}><CheckCircle2 size={12} className="inline -mt-0.5" /> nothing goes over your cap</span>
          ) : (
            <span style={{ color: plan.wastedAfter > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
              ⚠️ ≈{plan.wastedBefore.toLocaleString()} over cap
              {plan.slots.length > 0 && (plan.wastedAfter > 0
                ? ` · ≈${plan.wastedAfter.toLocaleString()} still lost with the Craftworks lines below`
                : ' · the Craftworks lines below use all of it')}
            </span>
          )}
        </div>
      </div>

      {plan.wastedBefore > 0 && (
        <section className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--accent-purple-border)' }}>
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-purple-bg)', borderBottom: '1px solid var(--accent-purple-border)' }}>
            <Hammer size={13} style={{ color: 'var(--accent-purple)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--accent-purple)' }}>Before you go, set Craftworks to…</span>
            <span className="text-[11px] ml-auto" style={{ color: 'var(--accent-purple)', opacity: 0.8 }}>{craftworksSlots} slots · keeps what quests need</span>
          </div>
          <div className="divide-y divide-[color:var(--border-subtle)]" style={{ background: 'var(--surface-card)' }}>
            {plan.slots.map((s, i) => <SlotRow key={s.output} s={s} i={i} />)}
            {plan.slots.length === 0 && (
              <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No recipe can use the overflow from this run.</p>
            )}
            {plan.noSink.length > 0 && (
              <p className="px-4 py-2.5 text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-orange)' }} />
                No recipe uses {plan.noSink.join(', ')}. Sell the extra or skip it.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: `var(--accent-${accent}-bg)`, borderBottom: `1px solid var(--accent-${accent}-border)` }}>
          <Icon size={13} style={{ color: `var(--accent-${accent})` }} />
          <span className="text-sm font-semibold" style={{ color: `var(--accent-${accent})` }}>{location.name}</span>
          <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>
            have +≈run → after / cap
          </span>
        </div>
        <div className="divide-y divide-[color:var(--border-subtle)]" style={{ background: 'var(--surface-card)' }}>
          {[...plan.drops]
            .sort((a, b) => Number(!!b.quest) - Number(!!a.quest) || Number(b.wasted >= 1) - Number(a.wasted >= 1) || a.rate - b.rate)
            .map((d) => <DropRow key={d.item} d={d} cap={inventoryMax} verb={verb} />)}
        </div>
      </section>

      {activeQuests.length === 0 && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <Target size={12} /> Mark quests as active to see which drops they need.
        </p>
      )}
    </div>
  );
}
