import { useMemo, useState } from 'react';
import { Check, MapPin, Hammer, Package, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { ItemIcon } from './ItemIcon';
import { sourceHint } from '../data/itemSources';
import { parseItems } from '../utils';
import { CraftworksSuggestions, type DirectItem } from './CraftworksSuggestions';
import { LocationPlanner } from './LocationPlanner';
import { breakDown, type Shortfalls } from '../questNeeds';
import { runLocationByName } from '../runLocations';
import { HOLD_LINES, buildHoldPlan, buildGatherPlan, type GatherPlan, type OtherNeed, shortQuestName, type FeedReward, type HoldLine, type HoldRow } from '../holdQuests';

const LINE_COLOR = { starmaps: 'var(--accent-purple)', pamrats: 'var(--accent-blue)' } as const;

function formatQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function LineRow({ line, index }: { line: HoldLine; index: number | null }) {
  const { inventory, questStatuses, setQuestStatus } = useStore();
  const quest = index === null ? null : line.quests[index];
  const items = quest ? parseItems(quest.itemsRequired) : [];
  const met = items.filter((i) => (inventory[i.item] ?? 0) >= i.quantity).length;
  const ready = quest !== null && met === items.length;

  // Picking a quest marks everything before it done and it active; anything
  // after it that was marked done goes back to not started.
  const pick = (k: number) => {
    line.quests.forEach((q, i) => {
      if (i < k && questStatuses[q.id] !== 'completed') setQuestStatus(q.id, 'completed');
      if (i > k && (questStatuses[q.id] === 'completed' || questStatuses[q.id] === 'active')) setQuestStatus(q.id, 'available');
    });
    if (k < line.quests.length) setQuestStatus(line.quests[k].id, 'active');
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs">
      <span className="font-bold w-20 flex-shrink-0" style={{ color: LINE_COLOR[line.key], fontFamily: 'var(--font-display)' }}>{line.short}</span>
      <select
        value={index ?? line.quests.length}
        onChange={(e) => pick(Number(e.target.value))}
        className="rounded px-1.5 py-0.5"
        style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        title={`Which ${line.short} quest you're on`}
      >
        {line.quests.map((q, i) => <option key={q.id} value={i}>{shortQuestName(line, q).split(' ').pop()} of {line.quests.length}</option>)}
        <option value={line.quests.length}>Done</option>
      </select>
      {quest && (
        <>
          <span className="font-mono" style={{ color: ready ? 'var(--accent-green)' : 'var(--text-muted)' }}>
            {met}/{items.length} held
          </span>
          {ready && (
            <button
              onClick={() => setQuestStatus(quest.id, 'completed')}
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded font-semibold"
              style={{ background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', color: 'var(--accent-green)' }}
            >
              <Check size={11} /> Turned in
            </button>
          )}
        </>
      )}
    </div>
  );
}

// One short note per row: what else the stock is for, or a reward on the way.
function rowNote(row: HoldRow, feeds: FeedReward[]): { text: string; warn: boolean } | null {
  const extra = [
    ...row.craftDraws.map((d) => `+${formatQty(d.qty)} to craft ${d.product}`),
    ...row.otherUses.map((o) => `+${formatQty(o.qty)} for ${o.quest}`),
  ];
  if (extra.length) return { text: extra.join(' · '), warn: true };
  const f = feeds.find((x) => x.item === row.item);
  if (f) return { text: `${formatQty(f.qty)} from ${f.from}`, warn: false };
  return null;
}

type View = 'collect' | 'held';
type Section = 'farm' | 'craft' | 'items';

const TYPE_VERB: Record<string, string> = { explore: 'explores', fishing: 'casts', mining: 'digs' };

type Horizon = 'now' | 'next';

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden text-xs" style={{ border: '1px solid var(--border-subtle)' }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="px-2.5 py-1"
          style={v === value
            ? { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', fontWeight: 600 }
            : { background: 'var(--surface-inset)', color: 'var(--text-muted)' }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}


function FarmSection({ gather, shortfalls }: { gather: GatherPlan; shortfalls: Shortfalls }) {
  const [open, setOpen] = useState<string | null>(null);
  const otherGroups = new Map<string, OtherNeed[]>();
  for (const o of gather.other) {
    const key = o.source.split(':')[0].replace(/\s*\(.*$/, '');
    otherGroups.set(key, [...(otherGroups.get(key) ?? []), o]);
  }
  if (gather.stops.length === 0 && gather.other.length === 0 && gather.cook.length === 0) {
    return <p className="text-sm px-1" style={{ color: 'var(--accent-green)' }}>Nothing left to gather for these quests.</p>;
  }
  return (
    <div className="space-y-3">
      {gather.stops.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          {gather.stops.map((s, i) => (
            <div key={s.location} style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
             <button
              onClick={() => setOpen(open === s.location ? null : s.location)}
              className="w-full text-left px-3 py-2.5"
              style={open === s.location ? { background: 'var(--surface-inset)' } : undefined}
             >
              <div className="flex items-center gap-2">
                <MapPin size={12} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.location}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  ~{s.attempts.toLocaleString()} {TYPE_VERB[s.type] ?? 'attempts'}
                </span>
                <span className="ml-auto flex items-center text-[11px]" style={{ color: 'var(--accent-blue)' }}>
                  {open === s.location ? 'Close' : 'Plan run'}
                  <ChevronRight size={12} style={{ transform: open === s.location ? 'rotate(90deg)' : undefined }} />
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ml-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {s.items.map((it) => (
                  <span key={it.item} title={it.forItems.length ? `For ${it.forItems.join(', ')}` : undefined}>
                    <ItemIcon item={it.item} />{it.item} <span className="font-mono" style={{ color: 'var(--accent-orange)' }}>{formatQty(it.qty)}</span>
                  </span>
                ))}
              </div>
              {s.forItems.length > 0 && (
                <p className="mt-0.5 ml-5 text-[11px] truncate" style={{ color: 'var(--text-muted)' }} title={s.forItems.join(', ')}>
                  to craft {s.forItems.slice(0, 5).join(', ')}{s.forItems.length > 5 && ` +${s.forItems.length - 5} more`}
                </p>
              )}
             </button>
             {open === s.location && runLocationByName.has(s.location) && (
              <LocationPlanner key={s.location} location={runLocationByName.get(s.location)!} shortfalls={shortfalls} />
             )}
            </div>
          ))}
        </div>
      )}
      {(otherGroups.size > 0 || gather.cook.length > 0) && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          {[...(gather.cook.length ? [['Cook in the Kitchen', gather.cook] as const] : []), ...otherGroups].map(([group, items], i) => (
            <div key={group} className="px-3 py-2 flex gap-3 text-xs" style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
              <span className="w-28 flex-shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>{group}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                {items.map((it) => (
                  <span key={it.item} title={[it.source, it.forItems.length ? `for ${it.forItems.join(', ')}` : ''].filter(Boolean).join(' · ')}>
                    <ItemIcon item={it.item} />{it.item} <span className="font-mono" style={{ color: 'var(--accent-orange)' }}>{formatQty(it.qty)}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HoldQuestsPage() {
  const { questStatuses, inventory, inventoryMax } = useStore();
  const plan = useMemo(() => buildHoldPlan(questStatuses, inventory), [questStatuses, inventory]);
  const [section, setSection] = useState<Section>('farm');
  const [view, setView] = useState<View>('collect');
  const [horizon, setHorizon] = useState<Horizon>('now');

  const { rows, collect, held } = useMemo(() => {
    const rows = plan.rows
      .map((r) => {
        const hold = horizon === 'now' ? r.holdNow : r.holdNext;
        const target = hold === 0 ? 0 : hold + (r.target - r.holdNow);
        return { r, hold, target, short: Math.max(0, target - r.have) };
      })
      .filter((x) => x.hold > 0);
    return {
      rows,
      collect: rows.filter((x) => x.short > 0).sort((a, b) => a.r.have / a.target - b.r.have / b.target || b.short - a.short),
      held: rows.filter((x) => x.short === 0).sort((a, b) => a.r.item.localeCompare(b.r.item)),
    };
  }, [plan, horizon]);
  const shown = view === 'collect' ? collect : held;

  // Only these two lines' needs, in the shape the shared location planner takes
  const shortfalls = useMemo<Shortfalls>(() => ({
    needs: new Map(rows.map((x) => [x.r.item, { need: x.target, quests: [] }])),
    ...breakDown(
      new Map(collect.map((x) => [x.r.item, x.short])),
      inventory,
      new Map(rows.map((x) => [x.r.item, x.target])),
    ),
  }), [collect, rows, inventory]);

  const gather = useMemo(() => buildGatherPlan(
    new Map(collect.map((x) => [x.r.item, x.short])),
    inventory,
    new Map(rows.map((x) => [x.r.item, x.target])),
    sourceHint,
  ), [collect, rows, inventory]);

  // Craftworks targets: the held amount (plus craft/other-quest draws), labelled with the quests asking
  const craftItems: DirectItem[] = collect.map((x) => ({
    item: x.r.item,
    quantity: x.target,
    label: HOLD_LINES.filter((l) => (x.r.lines[l.key]?.[horizon] ?? 0) > 0)
      .map((l) => { const i = plan.current[l.key]; return i == null ? l.short : shortQuestName(l, l.quests[Math.min(i + (horizon === 'next' ? 1 : 0), l.quests.length - 1)]); })
      .join(' + '),
  }));

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>STARMAPS &amp; PAMRATS</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          You keep these items, so one stack counts for both lines — don't sell or craft away anything below its target.
        </p>
      </div>

      <div className="rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        {HOLD_LINES.map((l, i) => (
          <div key={l.key} style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : undefined}>
            <LineRow line={l} index={plan.current[l.key] ?? null} />
          </div>
        ))}
      </div>

      {inventoryMax > 0 && plan.maxHold > inventoryMax && (
        <p className="text-xs px-1" style={{ color: 'var(--accent-orange)' }}>
          Lists ask for up to {plan.maxHold.toLocaleString()} of an item — your cap is {inventoryMax.toLocaleString()}.
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md overflow-hidden text-xs" style={{ border: '1px solid var(--border-subtle)' }}>
          {([['farm', 'Where to farm', MapPin], ['craft', 'Craftworks', Hammer], ['items', `Items · ${collect.length}`, Package]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className="px-2.5 py-1 flex items-center gap-1"
              style={id === section
                ? { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', fontWeight: 600 }
                : { background: 'var(--surface-inset)', color: 'var(--text-muted)' }}
            >
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Toggle value={horizon} onChange={setHorizon} options={[['now', 'This quest'], ['next', 'Next quest']]} />
        </div>
      </div>

      {section === 'farm' && <FarmSection gather={gather} shortfalls={shortfalls} />}

      {section === 'craft' && (
        craftItems.length
          ? <CraftworksSuggestions quests={[]} directItems={craftItems} questlineOnly subtitle="for STARMAPS & PAMRATS" />
          : <p className="text-sm px-1" style={{ color: 'var(--accent-green)' }}>Nothing left to craft for these quests.</p>
      )}

      {section === 'items' && (
        <>
          <Toggle value={view} onChange={setView} options={[['collect', `To collect · ${collect.length}`], ['held', `Held · ${held.length}`]]} />
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'var(--surface-inset)' }}>
              <th className="text-left font-medium px-3 py-1.5">Item</th>
              {HOLD_LINES.map((l) => (
                <th key={l.key} className="text-right font-medium px-2 py-1.5 hidden sm:table-cell" style={{ color: LINE_COLOR[l.key] }}>{l.short}</th>
              ))}
              <th className="text-right font-medium px-2 py-1.5">Have</th>
              <th className="text-right font-medium px-3 py-1.5">{view === 'collect' ? 'Need' : 'Spare'}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, target, short }) => {
              const note = rowNote(r, plan.feeds);
              const hint = view === 'collect' ? sourceHint(r.item) : null;
              const keep = Math.max(r.peak, target);
              return (
                <tr key={r.item} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-3 py-1.5">
                    <div style={{ color: 'var(--text-primary)' }}><ItemIcon item={r.item} />{r.item}</div>
                    {(note || hint) && (
                      <div className="text-[10px] truncate max-w-[16rem] sm:max-w-md" style={{ color: 'var(--text-muted)' }} title={[note?.text, hint].filter(Boolean).join(' · ')}>
                        {note && <span style={{ color: note.warn ? 'var(--accent-yellow)' : 'var(--accent-purple)' }}>{note.text}</span>}
                        {note && hint && ' · '}
                        {hint}
                      </div>
                    )}
                  </td>
                  {HOLD_LINES.map((l) => {
                    const n = r.lines[l.key]?.[horizon] ?? 0;
                    return (
                      <td key={l.key} className="text-right font-mono px-2 py-1.5 hidden sm:table-cell" style={{ color: n > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        {n ? formatQty(n) : '—'}
                      </td>
                    );
                  })}
                  <td className="text-right font-mono px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{formatQty(r.have)}</td>
                  <td className="text-right font-mono px-3 py-1.5 font-semibold" style={{ color: view === 'collect' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                    {view === 'collect' ? formatQty(short) : r.have > keep ? formatQty(r.have - keep) : '—'}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                {view === 'collect' ? 'Everything for these quests is held.' : 'Nothing held at its target yet.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
