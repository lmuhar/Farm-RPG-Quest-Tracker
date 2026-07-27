import { useState, useMemo } from 'react';
import {
  ChevronDown, CheckCircle2, Hammer, MapPin,
  Lock, Sprout, Building2,
} from 'lucide-react';
import type { Quest } from '../types';
import { parseItems, formatDuration, calcGrowsNeeded, compareQuests } from '../utils';
import { getQuestStatus } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { resolveRawIngredients } from '../utils';
import { ItemLocationPanel } from './ItemLocationPanel';
import questsData from '../data/quests.json';

const QUESTLINE = 'A Towering Investment';
const allQuestsData = questsData as Quest[];

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map((r) => [r.name.toLowerCase(), r])
);

type QuestFilter = 'all' | 'active' | 'upcoming' | 'completed';

// ── Item row ────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  quantity,
  inventory,
  plotCount,
  cropTimes,
  allNeededItems,
}: {
  item: string;
  quantity: number;
  inventory: Record<string, number>;
  plotCount: number;
  cropTimes: { item: string; growMinutes: number }[];
  allNeededItems: string[];
}) {
  const [showCraft, setShowCraft] = useState(false);
  const [showLoc, setShowLoc] = useState(false);

  const have = inventory[item] ?? 0;
  const deficit = Math.max(0, quantity - have);
  const pct = Math.min(100, quantity > 0 ? Math.round((have / quantity) * 100) : 100);
  const done = have >= quantity;

  const recipe = recipeByName.get(item.toLowerCase());
  const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
  const grows = cropTime && deficit > 0 ? calcGrowsNeeded(deficit, plotCount) : null;
  const totalTime = grows && cropTime ? grows * cropTime.growMinutes : null;

  const directIngredients = useMemo(
    () =>
      recipe && deficit > 0
        ? new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]))
        : null,
    [recipe, deficit]
  );
  const rawMaterials = useMemo(
    () => (recipe && deficit > 0 ? resolveRawIngredients(item, deficit, recipeByName) : null),
    [recipe, item, deficit]
  );
  const hasDeepChain =
    rawMaterials &&
    directIngredients &&
    [...rawMaterials.keys()].some((k) => !directIngredients.has(k));

  return (
    <div className="py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Main row */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span
            className="text-sm font-medium truncate"
            style={{ color: done ? 'var(--accent-green)' : 'var(--text-primary)' }}
          >
            {item}
          </span>

          {recipe && (
            <button
              onClick={() => setShowCraft((v) => !v)}
              className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-opacity hover:opacity-80"
              style={
                showCraft
                  ? { background: 'var(--accent-blue)', color: '#fff', border: '1px solid var(--accent-blue)' }
                  : { background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }
              }
            >
              <Hammer size={9} /> craft
            </button>
          )}

          {cropTime && grows && totalTime && !done && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-green)' }}>
              <Sprout size={9} />
              {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(totalTime)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowLoc((v) => !v)}
            className="p-0.5 rounded transition-opacity hover:opacity-80"
            style={{ color: showLoc ? 'var(--accent-purple)' : 'var(--text-muted)' }}
            aria-label="Show farming locations"
          >
            <MapPin size={11} />
          </button>

          {done ? (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent-green)' }}>
              <CheckCircle2 size={11} /> done
            </span>
          ) : (
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}
            >
              {have.toLocaleString()}/{quantity.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: done ? 'var(--accent-green)' : 'var(--accent-orange)',
            transition: 'width 0.3s',
          }}
        />
      </div>

      {/* Crafting panel */}
      {showCraft && recipe && directIngredients && (
        <div
          className="mt-3 rounded-lg p-3 space-y-2"
          style={{ background: 'var(--surface-inset)', border: '1px solid var(--accent-blue-border)' }}
        >
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--accent-blue)' }}
          >
            Recipe — craft ×{deficit.toLocaleString()}
          </p>
          <div className="space-y-1">
            {[...directIngredients.entries()].map(([ing, qty]) => {
              const haveIng = inventory[ing] ?? 0;
              const ok = haveIng >= qty;
              return (
                <div key={ing} className="flex items-center justify-between gap-2 text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>{ing}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: ok ? 'var(--accent-green)' : 'var(--accent-orange)',
                    }}
                  >
                    {haveIng.toLocaleString()}/{qty.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {hasDeepChain && rawMaterials && (
            <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Raw materials
              </p>
              {[...rawMaterials.entries()].map(([ri, rq]) => {
                const haveRaw = inventory[ri] ?? 0;
                const ok = haveRaw >= rq;
                return (
                  <div key={ri} className="flex items-center justify-between gap-2 text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>{ri}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        color: ok ? 'var(--accent-green)' : 'var(--accent-orange)',
                      }}
                    >
                      {haveRaw.toLocaleString()}/{rq.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Location panel */}
      {showLoc && (
        <div className="mt-3">
          <ItemLocationPanel item={item} allNeededItems={allNeededItems} />
        </div>
      )}
    </div>
  );
}

// ── Quest section ───────────────────────────────────────────────────────────

function QuestSection({
  quest,
  status,
  inventory,
  plotCount,
  cropTimes,
  allNeededItems,
  setQuestStatus,
}: {
  quest: Quest;
  status: string;
  inventory: Record<string, number>;
  plotCount: number;
  cropTimes: { item: string; growMinutes: number }[];
  allNeededItems: string[];
  setQuestStatus: (id: string, s: 'completed') => void;
}) {
  const [open, setOpen] = useState(status === 'active');
  const items = useMemo(() => parseItems(quest.itemsRequired), [quest.itemsRequired]);

  const stockedCount = items.filter(
    ({ item, quantity }) => (inventory[item] ?? 0) >= quantity
  ).length;
  const canComplete = items.length > 0 && stockedCount === items.length;

  const statusStyle: Record<string, { color: string; label: string }> = {
    active:    { color: 'var(--accent-orange)', label: 'In Progress' },
    completed: { color: 'var(--accent-green)',  label: 'Complete' },
    available: { color: 'var(--accent-yellow)', label: 'Available' },
    locked:    { color: 'var(--text-muted)',    label: 'Locked' },
  };
  const { color: statusColor, label: statusLabel } = statusStyle[status] ?? {
    color: 'var(--accent-purple)',
    label: 'Upcoming',
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Accordion header */}
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-700/10"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {status === 'completed' ? (
            <CheckCircle2 size={15} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          ) : status === 'locked' ? (
            <Lock size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          ) : (
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: statusColor }}
            />
          )}
          <div className="min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              {quest.name}
            </p>
            {items.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {stockedCount}/{items.length} items ready
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] font-semibold" style={{ color: statusColor }}>
            {statusLabel}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-muted)',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </div>
      </button>

      {/* Accordion body */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {items.length === 0 ? (
            <p
              className="px-5 py-4 text-sm"
              style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}
            >
              No items required — talk to the NPC to complete this quest.
            </p>
          ) : (
            <div className="px-5">
              {items.map(({ item, quantity }) => (
                <ItemRow
                  key={item}
                  item={item}
                  quantity={quantity}
                  inventory={inventory}
                  plotCount={plotCount}
                  cropTimes={cropTimes}
                  allNeededItems={allNeededItems}
                />
              ))}
            </div>
          )}

          {(status === 'active' || status === 'available') && (
            <div
              className="px-5 py-3"
              style={{ borderTop: items.length > 0 ? '1px solid var(--border-subtle)' : undefined }}
            >
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
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function ToweringInvestmentPage() {
  const { inventory, cropTimes, plotCount, player, questStatuses, setQuestStatus } = useStore();
  const [filter, setFilter] = useState<QuestFilter>('all');

  const quests = useMemo(
    () =>
      allQuestsData
        .filter((q) => q.questline === QUESTLINE)
        .sort((a, b) => compareQuests(a.name, b.name)),
    []
  );

  const questsWithStatus = useMemo(
    () => quests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [quests, player, questStatuses]
  );

  const completedCount = questsWithStatus.filter(({ status }) => status === 'completed').length;
  const activeCount    = questsWithStatus.filter(({ status }) => status === 'active').length;
  const upcomingCount  = questsWithStatus.filter(({ status }) => status !== 'completed' && status !== 'active').length;
  const progress = Math.round((completedCount / quests.length) * 100);

  // All items still needed — gives location panel context across the full questline
  const allNeededItems = useMemo(() => {
    const items = new Set<string>();
    questsWithStatus.forEach(({ quest, status }) => {
      if (status !== 'completed') {
        parseItems(quest.itemsRequired).forEach(({ item }) => items.add(item));
      }
    });
    return [...items];
  }, [questsWithStatus]);

  const filtered = useMemo(() => {
    if (filter === 'active')    return questsWithStatus.filter(({ status }) => status === 'active');
    if (filter === 'upcoming')  return questsWithStatus.filter(({ status }) => status !== 'completed' && status !== 'active');
    if (filter === 'completed') return questsWithStatus.filter(({ status }) => status === 'completed');
    return questsWithStatus;
  }, [questsWithStatus, filter]);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div
        className="rounded-xl p-5"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={18} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
              <h2
                className="text-xl font-bold truncate"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                {QUESTLINE}
              </h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {completedCount} of {quests.length} quests completed
            </p>
          </div>
          <span
            className="text-2xl font-bold flex-shrink-0"
            style={{
              fontFamily: 'var(--font-mono)',
              color: progress === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)',
            }}
          >
            {progress}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: progress === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)',
            }}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}
      >
        {([
          { id: 'all',       label: `All (${quests.length})` },
          { id: 'active',    label: `Active (${activeCount})` },
          { id: 'upcoming',  label: `Upcoming (${upcomingCount})` },
          { id: 'completed', label: `Done (${completedCount})` },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={
              filter === id
                ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Quest accordions */}
      <div className="space-y-2">
        {filtered.map(({ quest, status }) => (
          <QuestSection
            key={quest.id}
            quest={quest}
            status={status}
            inventory={inventory}
            plotCount={plotCount}
            cropTimes={cropTimes}
            allNeededItems={allNeededItems}
            setQuestStatus={setQuestStatus}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
            No quests match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
