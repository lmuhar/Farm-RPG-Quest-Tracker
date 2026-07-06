import { useState, useMemo } from 'react';
import { ChevronDown, CheckCircle2, Clock, Hammer, Landmark } from 'lucide-react';
import type { Quest } from '../types';
import { getQuestStatus, parseItems, formatDuration, calcGrowsNeeded, calcHoneyRuns, compareQuests } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { resolveRawIngredients } from '../utils';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const allRecipes = recipesData as Recipe[];
const recipeByName = new Map<string, Recipe>(allRecipes.map((r) => [r.name.toLowerCase(), r]));

function ItemProgressRow({
  item,
  quantity,
  have,
  inventory,
}: {
  item: string;
  quantity: number;
  have: number;
  inventory: Record<string, number>;
}) {
  const { cropTimes, plotCount } = useStore();
  const done = have >= quantity;
  const deficit = Math.max(0, quantity - have);
  const pct = Math.min(100, quantity > 0 ? Math.round((have / quantity) * 100) : 100);

  const isHoney = item.toLowerCase() === 'honey';
  const honey = isHoney && !done ? calcHoneyRuns(deficit) : null;
  const honeyRadishHave = honey ? (inventory['Radish'] ?? 0) : 0;
  const honeyRadishDeficit = honey ? Math.max(0, honey.radishes - honeyRadishHave) : 0;
  const honeyGrows = honeyRadishDeficit > 0 ? calcGrowsNeeded(honeyRadishDeficit, plotCount) : 0;
  const recipe = !isHoney ? recipeByName.get(item.toLowerCase()) : undefined;
  const cropTime = !isHoney ? cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase()) : undefined;
  const grows = cropTime && !done ? calcGrowsNeeded(deficit, plotCount) : null;
  const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;

  // Show raw materials hint when chain goes deeper
  const rawHint = useMemo(() => {
    if (!recipe || done) return null;
    const raw = resolveRawIngredients(item, deficit, recipeByName);
    return [...raw.entries()]
      .map(([rawItem, rawQty]) => {
        const haveRaw = inventory[rawItem] ?? 0;
        return `${haveRaw}/${rawQty}× ${rawItem}`;
      })
      .join(' · ');
  }, [recipe, done, item, deficit, inventory]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm text-slate-200 truncate">{item}</span>
          {isHoney && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
              <Landmark size={9} /> temple
            </span>
          )}
          {recipe && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] border border-[var(--accent-blue-border)]">
              <Hammer size={9} /> crafted
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {done ? (
            <span className="flex items-center gap-1 text-xs font-medium text-[var(--accent-green)]">
              <CheckCircle2 size={11} /> done
            </span>
          ) : (
            <span className="text-xs font-semibold text-[var(--accent-orange)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {have}/{quantity}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: done ? 'var(--accent-green)' : 'var(--accent-orange)',
            transition: 'var(--transition-default)',
          }}
        />
      </div>

      {/* Sub-hints */}
      {!done && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
          {isHoney && honey && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--accent-yellow)' }}>
              <Landmark size={10} />
              {honey.runs} run{honey.runs !== 1 ? 's' : ''} · {honey.radishes.toLocaleString()} radishes
              {honeyGrows > 0
                ? ` · ${honeyGrows} grow${honeyGrows !== 1 ? 's' : ''} (have ${honeyRadishHave.toLocaleString()})`
                : ' · radishes stocked'}
              {' '}· {honey.runs} day{honey.runs !== 1 ? 's' : ''}
            </span>
          )}
          {cropTime && grows && totalTime && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} className="text-green-400/70" />
              {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(totalTime)}
            </span>
          )}
          {rawHint && (
            <span className="text-[11px] text-slate-500 truncate">
              raw: {rawHint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function UpcomingQuestRow({ quest, inventory }: { quest: Quest; inventory: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const items = parseItems(quest.itemsRequired);

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-slate-700/10"
      >
        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          {quest.name}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {items.length > 0 && (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown
            size={12}
            style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'var(--transition-fast)' }}
          />
        </div>
      </button>
      {open && (
        <div className="px-5 pb-3 space-y-2" style={{ background: 'var(--surface-inset)' }}>
          {items.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No items required</p>
          ) : (
            items.map(({ item, quantity }) => {
              const have = inventory[item] ?? 0;
              const done = have >= quantity;
              const pct = Math.min(100, quantity > 0 ? Math.round((have / quantity) * 100) : 100);
              const recipe = recipeByName.get(item.toLowerCase());
              return (
                <div key={item} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs truncate" style={{ color: done ? 'var(--accent-green)' : 'var(--text-secondary)' }}>{item}</span>
                      {recipe && (
                        <span className="text-[10px] px-1 rounded" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)' }}>crafted</span>
                      )}
                    </div>
                    <span className="text-[11px] flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                      {have}/{quantity}
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: done ? 'var(--accent-green)' : 'var(--accent-purple)' }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  questline: string;
  quests: Quest[];
}

export function ActiveQuestLine({ questline, quests }: Props) {
  const { player, questStatuses, inventory, setQuestStatus } = useStore();
  const [showUpcoming, setShowUpcoming] = useState(false);

  const sortedQuests = useMemo(
    () => [...quests].sort((a, b) => compareQuests(a.name, b.name)),
    [quests]
  );

  const statuses = sortedQuests.map((q) => getQuestStatus(q, player, questStatuses));
  const completedCount = statuses.filter((s) => s === 'completed').length;
  const progress = sortedQuests.length > 0 ? Math.round((completedCount / sortedQuests.length) * 100) : 0;

  const activeQuestsInLine = sortedQuests.filter((_, i) => statuses[i] === 'active');

  const lastActiveIdx = statuses.reduce((max, s, i) => (s === 'active' ? i : max), -1);
  const upcomingQuests = lastActiveIdx >= 0
    ? sortedQuests
        .slice(lastActiveIdx + 1)
        .map((q, i) => ({ quest: q, status: statuses[lastActiveIdx + 1 + i] }))
        .filter(({ status }) => status !== 'completed' && status !== 'active')
    : [];

  const allItemsFulfilledFor = (quest: Quest) => {
    const items = parseItems(quest.itemsRequired);
    if (items.length === 0) return true;
    return items.every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Card header */}
      <div
        className="px-5 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.06em' }}
            >
              {questline}
            </p>
            {activeQuestsInLine.map((q) => (
              <h3
                key={q.id}
                className="text-lg font-bold leading-tight truncate"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                {q.name}
              </h3>
            ))}
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span
              className="text-xs"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
            >
              {completedCount}/{sortedQuests.length}
            </span>
            <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${progress}%`, background: 'var(--accent-green)', transition: 'var(--transition-default)' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Item progress rows */}
      <div className="px-5 py-4 space-y-5">
        {activeQuestsInLine.map((quest) => {
          const items = parseItems(quest.itemsRequired);
          const canComplete = allItemsFulfilledFor(quest);
          return (
            <div key={quest.id} className="space-y-4">
              {items.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No items required
                </p>
              ) : (
                items.map(({ item, quantity }) => (
                  <ItemProgressRow
                    key={item}
                    item={item}
                    quantity={quantity}
                    have={inventory[item] ?? 0}
                    inventory={inventory}
                  />
                ))
              )}

              {/* Complete action — always visible */}
              <div className="pt-1">
                <button
                  onClick={() => setQuestStatus(quest.id, 'completed')}
                  className="text-xs font-medium rounded-lg px-3 py-1.5 transition-colors"
                  style={
                    canComplete
                      ? { background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }
                      : { background: 'var(--surface-inset)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }
                  }
                >
                  {canComplete ? '✓ Mark Complete' : 'Mark Complete'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Collapsible upcoming quests */}
      {upcomingQuests.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setShowUpcoming((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-700/20"
            style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-body)' }}
          >
            <span>Upcoming quests ({upcomingQuests.length})</span>
            <ChevronDown
              size={14}
              style={{ transform: showUpcoming ? 'rotate(180deg)' : 'none', transition: 'var(--transition-fast)' }}
            />
          </button>
          {showUpcoming && (
            <div className="pb-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {upcomingQuests.map(({ quest }) => (
                <UpcomingQuestRow key={quest.id} quest={quest} inventory={inventory} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
