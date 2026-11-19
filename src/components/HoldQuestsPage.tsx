import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useStore } from '../store';
import { ItemIcon } from './ItemIcon';
import { sourceHint } from '../data/itemSources';
import { parseItems } from '../utils';
import { HOLD_LINES, buildHoldPlan, shortQuestName, type FeedReward, type HoldLine, type HoldRow } from '../holdQuests';

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

export function HoldQuestsPage() {
  const { questStatuses, inventory, inventoryMax } = useStore();
  const plan = useMemo(() => buildHoldPlan(questStatuses, inventory), [questStatuses, inventory]);
  const [view, setView] = useState<View>('collect');
  const [horizon, setHorizon] = useState<Horizon>('now');

  const rows = plan.rows
    .map((r) => {
      const hold = horizon === 'now' ? r.holdNow : r.holdNext;
      const target = hold === 0 ? 0 : hold + (r.target - r.holdNow);
      return { r, hold, target, short: Math.max(0, target - r.have) };
    })
    .filter((x) => x.hold > 0);
  const collect = rows.filter((x) => x.short > 0).sort((a, b) => a.r.have / a.target - b.r.have / b.target || b.short - a.short);
  const held = rows.filter((x) => x.short === 0).sort((a, b) => a.r.item.localeCompare(b.r.item));
  const shown = view === 'collect' ? collect : held;

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
        <Toggle value={view} onChange={setView} options={[['collect', `To collect · ${collect.length}`], ['held', `Held · ${held.length}`]]} />
        <div className="ml-auto">
          <Toggle value={horizon} onChange={setHorizon} options={[['now', 'This quest'], ['next', 'Next quest']]} />
        </div>
      </div>

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
    </div>
  );
}
