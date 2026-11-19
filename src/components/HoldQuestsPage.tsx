import { useMemo } from 'react';
import { Map as MapIcon, Scale, CheckCircle2, AlertTriangle, Hammer, Gift, ArrowRight, Lock, Info } from 'lucide-react';
import { useStore } from '../store';
import { ItemIcon } from './ItemIcon';
import { sourceHint } from '../data/itemSources';
import { parseItems } from '../utils';
import { HOLD_LINES, buildHoldPlan, shortQuestName, type HoldLine, type HoldRow } from '../holdQuests';

const LINE_STYLE = {
  starmaps: { color: 'var(--accent-purple)', bg: 'var(--accent-purple-bg)', border: 'var(--accent-purple-border)', Icon: MapIcon },
  pamrats: { color: 'var(--accent-blue)', bg: 'var(--accent-blue-bg)', border: 'var(--accent-blue-border)', Icon: Scale },
} as const;

function formatQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function Card({ title, sub, accent, Icon, children }: {
  title: string; sub?: string; accent: 'green' | 'orange' | 'yellow' | 'purple' | 'blue';
  Icon: typeof Info; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: `1px solid var(--accent-${accent}-border)` }}>
      <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: `var(--accent-${accent}-bg)`, borderBottom: `1px solid var(--accent-${accent}-border)` }}>
        <Icon size={13} style={{ color: `var(--accent-${accent})` }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: `var(--accent-${accent})` }}>{title}</span>
        {sub && <span className="text-xs" style={{ color: `var(--accent-${accent})`, opacity: 0.7 }}>— {sub}</span>}
      </div>
      {children}
    </div>
  );
}

function LineCard({ line, index }: { line: HoldLine; index: number | null }) {
  const { inventory, questStatuses, setQuestStatus } = useStore();
  const st = LINE_STYLE[line.key];
  const quest = index === null ? null : line.quests[index];
  const items = quest ? parseItems(quest.itemsRequired) : [];
  const met = items.filter((i) => (inventory[i.item] ?? 0) >= i.quantity).length;

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
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-card)', border: `1px solid ${st.border}` }}>
      <div className="flex items-center gap-2">
        <st.Icon size={15} style={{ color: st.color }} />
        <span className="text-sm font-bold" style={{ color: st.color, fontFamily: 'var(--font-display)' }}>{line.short}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{line.npc}</span>
      </div>
      <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        I'm on
        <select
          value={index ?? line.quests.length}
          onChange={(e) => pick(Number(e.target.value))}
          className="flex-1 rounded-md px-2 py-1 text-sm"
          style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          {line.quests.map((q, i) => <option key={q.id} value={i}>{shortQuestName(line, q)}</option>)}
          <option value={line.quests.length}>All done</option>
        </select>
      </label>
      {quest ? (
        <>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Quest {index! + 1} of {line.quests.length}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: met === items.length ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {items.length ? `${met}/${items.length} items held` : 'Nothing to hand in'}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-inset)' }}>
            <div className="h-full" style={{ width: `${items.length ? (met / items.length) * 100 : 100}%`, background: met === items.length ? 'var(--accent-green)' : st.color }} />
          </div>
          {quest.rewardItems && quest.rewardItems !== 'None' && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Reward: {parseItems(quest.rewardItems).map((r) => `${formatQty(r.quantity)} ${r.item}`).join(', ')}
            </p>
          )}
          <button
            onClick={() => setQuestStatus(quest.id, 'completed')}
            className="w-full text-xs font-semibold py-1.5 rounded-md"
            style={met === items.length
              ? { background: 'var(--accent-green-bg)', border: '1px solid var(--accent-green-border)', color: 'var(--accent-green)' }
              : { background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            Turned in {shortQuestName(line, quest)} — move to the next one
          </button>
        </>
      ) : (
        <p className="text-sm" style={{ color: 'var(--accent-green)' }}>Questline finished — everything held for it is free to use.</p>
      )}
    </div>
  );
}

function NeedChips({ row, field }: { row: HoldRow; field: 'now' | 'next' }) {
  return (
    <span className="flex gap-1 flex-wrap">
      {HOLD_LINES.map((l) => {
        const n = row.lines[l.key]?.[field] ?? 0;
        if (!n) return null;
        const st = LINE_STYLE[l.key];
        return (
          <span key={l.key} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
            {l.short} {formatQty(n)}
          </span>
        );
      })}
    </span>
  );
}

function CollectRow({ row }: { row: HoldRow }) {
  const pct = row.target ? Math.min(100, (row.have / row.target) * 100) : 100;
  const hint = sourceHint(row.item);
  const extras = [
    ...row.craftDraws.map((d) => `+${formatQty(d.qty)} to craft ${d.product}`),
    ...row.otherUses.map((o) => `+${formatQty(o.qty)} for ${o.quest}`),
  ];
  return (
    <div className="px-4 py-2.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}><ItemIcon item={row.item} />{row.item}</span>
        {row.shared && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}>
            one stack covers both
          </span>
        )}
        <NeedChips row={row} field="now" />
        <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-secondary)' }}>
          {row.have.toLocaleString()} / {row.target.toLocaleString()}
          <span style={{ color: 'var(--accent-orange)' }}> · need {row.short.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-inset)' }}>
        <div className="h-full" style={{ width: `${pct}%`, background: 'var(--accent-orange)' }} />
      </div>
      {(hint || extras.length > 0) && (
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {extras.length > 0 && <span style={{ color: 'var(--accent-yellow)' }}>{formatQty(row.holdNow)} held {extras.join(', ')}{hint ? ' · ' : ''}</span>}
          {hint}
        </p>
      )}
    </div>
  );
}

export function HoldQuestsPage() {
  const { questStatuses, inventory, inventoryMax } = useStore();
  const plan = useMemo(() => buildHoldPlan(questStatuses, inventory), [questStatuses, inventory]);

  const active = plan.rows.filter((r) => r.holdNow > 0);
  const collect = active.filter((r) => r.short > 0).sort((a, b) => a.have / a.target - b.have / b.target || b.short - a.short);
  const covered = active.filter((r) => r.short === 0);
  const ahead = plan.rows
    .filter((r) => r.holdNext > Math.max(r.holdNow, r.have))
    .sort((a, b) => (b.holdNext - b.have) - (a.holdNext - a.have));
  const clashes = plan.clashes.filter((c) => c.productShort > 0);
  const sharedCount = active.filter((r) => r.shared).length;
  const sumSeparate = active.reduce((s, r) => s + Object.values(r.lines).reduce((t, l) => t + (l?.now ?? 0), 0), 0);
  const sumHeld = active.reduce((s, r) => s + r.holdNow, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>STARMAPS &amp; PAMRATS</h2>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Both questlines ask you to <b>hold</b> items rather than hand them over — each list repeats the last one and grows,
          and the finales ask for 1 of everything. So keep what you collect until both lines are done, and one stack
          of an item counts for both lines at once.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {HOLD_LINES.map((l) => <LineCard key={l.key} line={l} index={plan.current[l.key] ?? null} />)}
      </div>

      {active.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Items to hold', value: active.length, color: 'var(--text-primary)' },
            { label: 'Held enough', value: covered.length, color: 'var(--accent-green)' },
            { label: 'Still to collect', value: collect.length, color: 'var(--accent-orange)' },
            { label: 'Shared stacks', value: sharedCount, color: 'var(--accent-blue)', note: sumSeparate > sumHeld ? `saves ${formatQty(sumSeparate - sumHeld)}` : undefined },
          ].map((s) => (
            <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
              <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.label}{s.note && ` · ${s.note}`}</div>
            </div>
          ))}
        </div>
      )}

      {inventoryMax > 0 && plan.maxHold > inventoryMax && (
        <div className="rounded-lg px-4 py-2.5 flex gap-2 text-xs" style={{ background: 'var(--accent-orange-bg)', border: '1px solid var(--accent-orange-border)', color: 'var(--accent-orange)' }}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>These quests ask for up to {plan.maxHold.toLocaleString()} of an item but your inventory holds {inventoryMax.toLocaleString()}. Raise your cap before the bigger lists.</span>
        </div>
      )}

      {collect.length > 0 && (
        <Card title="Still to collect" sub="for both current quests" accent="orange" Icon={AlertTriangle}>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {collect.map((r) => <CollectRow key={r.item} row={r} />)}
          </div>
        </Card>
      )}

      {clashes.length > 0 && (
        <Card title="Craft these first" sub="they use up items you're holding" accent="yellow" Icon={Hammer}>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {clashes.map((c) => (
              <div key={`${c.product}-${c.ingredient}`} className="px-4 py-2 text-sm flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-primary)' }}>
                <span>Craft {c.productShort.toLocaleString()} <ItemIcon item={c.product} />{c.product}</span>
                <span style={{ color: 'var(--text-muted)' }}>before topping up</span>
                <span><ItemIcon item={c.ingredient} />{c.ingredient}</span>
                <span className="text-xs ml-auto font-mono" style={{ color: 'var(--accent-yellow)' }}>uses {c.draw.toLocaleString()} ({c.perCraft} each)</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {plan.feeds.length > 0 && (
        <Card title="Rewards that feed the lists" accent="purple" Icon={Gift}>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {plan.feeds.map((f, i) => (
              <div key={i} className="px-4 py-2 text-sm flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--text-primary)' }}>
                <span className="font-mono text-xs" style={{ color: 'var(--accent-purple)' }}>{f.from}</span>
                <span>gives {formatQty(f.qty)} <ItemIcon item={f.item} />{f.item}</span>
                <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {f.helps.slice(0, 3).join(', ')}{f.helps.length > 3 && ` +${f.helps.length - 3} more`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {ahead.length > 0 && (
        <Card title="Get ahead" sub="what the next quest in each line adds" accent="blue" Icon={ArrowRight}>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {ahead.map((r) => (
              <div key={r.item} className="px-4 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}><ItemIcon item={r.item} />{r.item}</span>
                <NeedChips row={r} field="next" />
                <span className="text-xs ml-auto font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {r.have.toLocaleString()} / {r.holdNext.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {covered.length > 0 && (
        <Card title="Held — don't sell or craft with these" accent="green" Icon={Lock}>
          <div className="px-4 py-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {covered.map((r) => (
              <div key={r.item} className="flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={11} className="inline mr-1" style={{ color: 'var(--accent-green)' }} />
                  <ItemIcon item={r.item} />{r.item}
                </span>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                  keep {formatQty(Math.max(r.peak, r.target))}{r.have > Math.max(r.peak, r.target) && ` · ${formatQty(r.have - Math.max(r.peak, r.target))} spare`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
