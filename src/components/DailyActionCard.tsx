import { useMemo } from 'react';
import { CheckCircle2, Hammer, Landmark, Sprout } from 'lucide-react';
import { useStore } from '../store';
import {
  parseItems, calcGrowsNeeded, calcHoneyRuns, calcCutlassRuns,
  HONEY_RADISHES_PER_RUN, CUTLASS_TRIBAL_STAFF_PER_RUN,
  formatDoneBy, formatDuration,
} from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map(r => [r.name.toLowerCase(), r])
);

interface TempleQuestRow {
  questName: string;
  itemNeeded: number;
  runs: number;
}

interface TempleInfo {
  type: 'honey' | 'cutlass';
  questRows: TempleQuestRow[];
  totalRuns: number;
  doneBy: string;
  materialsReady: boolean;
  materialName: string;
  materialHave: number;
  materialNeeded: number;
}

interface CropAction {
  item: string;
  grows: number;
  doneBy: string;
  growMinutes: number;
  deficit: number;
}

interface Props {
  activeQuests: Quest[];
}

export function DailyActionCard({ activeQuests }: Props) {
  const { inventory, cropTimes, plotCount } = useStore();

  const { turnInReady, craftNow, templeItems, cropActions } = useMemo(() => {
    const turnInReady = activeQuests.filter(quest =>
      parseItems(quest.itemsRequired).every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity)
    );

    // Aggregate map for non-temple items
    const itemMap = new Map<string, number>();
    activeQuests.forEach(quest => {
      parseItems(quest.itemsRequired).forEach(({ item, quantity }) => {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      });
    });

    const craftNow: string[] = [];
    const templeItems: TempleInfo[] = [];
    const cropActions: CropAction[] = [];

    // ── Honey: per-quest rows ─────────────────────────────────────────────────
    const honeyQuestRows: TempleQuestRow[] = activeQuests.flatMap(quest => {
      const honeyItem = parseItems(quest.itemsRequired).find(i => i.item.toLowerCase() === 'honey');
      if (!honeyItem) return [];
      const { runs } = calcHoneyRuns(honeyItem.quantity);
      return [{ questName: quest.name, itemNeeded: honeyItem.quantity, runs }];
    });
    const totalHoneyNeeded = itemMap.get('Honey') ?? itemMap.get('honey') ?? 0;
    const honeyHave = inventory['Honey'] ?? 0;
    const honeyDeficit = Math.max(0, totalHoneyNeeded - honeyHave);
    if (honeyQuestRows.length > 0 && honeyDeficit > 0) {
      const { runs: totalRuns } = calcHoneyRuns(honeyDeficit);
      const radishHave = inventory['Radish'] ?? 0;
      templeItems.push({
        type: 'honey',
        questRows: honeyQuestRows,
        totalRuns,
        doneBy: formatDoneBy(totalRuns * 24 * 60),
        materialsReady: radishHave >= HONEY_RADISHES_PER_RUN,
        materialName: 'radishes',
        materialHave: radishHave,
        materialNeeded: HONEY_RADISHES_PER_RUN,
      });
    }

    // ── Cutlass: per-quest rows ───────────────────────────────────────────────
    const cutlassQuestRows: TempleQuestRow[] = activeQuests.flatMap(quest => {
      const cutlassItem = parseItems(quest.itemsRequired).find(i => i.item.toLowerCase() === 'cutlass');
      if (!cutlassItem) return [];
      const { runs } = calcCutlassRuns(cutlassItem.quantity);
      return [{ questName: quest.name, itemNeeded: cutlassItem.quantity, runs }];
    });
    const totalCutlassNeeded = itemMap.get('Cutlass') ?? itemMap.get('cutlass') ?? 0;
    const cutlassHave = inventory['Cutlass'] ?? 0;
    const cutlassDeficit = Math.max(0, totalCutlassNeeded - cutlassHave);
    if (cutlassQuestRows.length > 0 && cutlassDeficit > 0) {
      const { runs: totalRuns } = calcCutlassRuns(cutlassDeficit);
      const staffHave = inventory['Tribal Staff'] ?? 0;
      templeItems.push({
        type: 'cutlass',
        questRows: cutlassQuestRows,
        totalRuns,
        doneBy: formatDoneBy(totalRuns * 24 * 60),
        materialsReady: staffHave >= CUTLASS_TRIBAL_STAFF_PER_RUN,
        materialName: 'tribal staff',
        materialHave: staffHave,
        materialNeeded: CUTLASS_TRIBAL_STAFF_PER_RUN,
      });
    }

    // ── Other items ───────────────────────────────────────────────────────────
    for (const [item, totalNeeded] of itemMap.entries()) {
      const isHoney = item.toLowerCase() === 'honey';
      const isCutlass = item.toLowerCase() === 'cutlass';
      if (isHoney || isCutlass) continue;

      const have = inventory[item] ?? 0;
      const deficit = Math.max(0, totalNeeded - have);
      if (deficit === 0) continue;

      const recipe = recipeByName.get(item.toLowerCase());
      if (recipe) {
        const directIngredients = new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]));
        const allReady = [...directIngredients.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty);
        if (allReady) craftNow.push(item);
      } else {
        const cropTime = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
        if (cropTime) {
          const grows = calcGrowsNeeded(deficit, plotCount);
          cropActions.push({ item, grows, doneBy: formatDoneBy(grows * cropTime.growMinutes), growMinutes: cropTime.growMinutes, deficit });
        }
      }
    }

    // Shortest grow time per cycle first
    cropActions.sort((a, b) => a.growMinutes - b.growMinutes);

    return { turnInReady, craftNow, templeItems, cropActions };
  }, [activeQuests, inventory, cropTimes, plotCount]);

  const hasActions =
    turnInReady.length > 0 || craftNow.length > 0 || templeItems.length > 0 || cropActions.length > 0;

  if (!hasActions) return null;

  return (
    <div
      className="rounded-xl px-5 py-4 space-y-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.08em' }}
      >
        Do now
      </p>

      {/* Turn in ready */}
      {turnInReady.length > 0 && (
        <div className="flex items-start gap-2">
          <CheckCircle2 size={13} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-snug">
            <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>
              Turn in {turnInReady.length} quest{turnInReady.length !== 1 ? 's' : ''}:
            </span>
            <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>
              {turnInReady.map(q => q.name).join(', ')}
            </span>
          </p>
        </div>
      )}

      {/* Craft now */}
      {craftNow.length > 0 && (
        <div className="flex items-start gap-2">
          <Hammer size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-snug">
            <span className="font-semibold" style={{ color: 'var(--accent-blue)' }}>Craft now:</span>
            <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>{craftNow.join(', ')}</span>
          </p>
        </div>
      )}

      {/* Temple runs — one section per type (honey / cutlass) */}
      {templeItems.map(({ type, questRows, totalRuns, doneBy, materialsReady, materialName, materialHave, materialNeeded }) => (
        <div key={type} className="flex items-start gap-2">
          <Landmark size={13} style={{ color: 'var(--accent-yellow)', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-yellow)' }}>
              {type === 'honey' ? 'Honey' : 'Cutlass'} Temple
            </span>

            {/* Per-quest rows */}
            {questRows.map(({ questName, itemNeeded, runs }) => (
              <div key={questName} className="flex items-baseline justify-between gap-2">
                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{questName}</span>
                <span className="text-[11px] flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {itemNeeded.toLocaleString()} × {type === 'honey' ? 'honey' : 'cutlass'} · {runs} run{runs !== 1 ? 's' : ''}
                </span>
              </div>
            ))}

            {/* Total footer */}
            <div className="flex items-baseline justify-between gap-2 pt-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--accent-yellow)' }}>
                {totalRuns} run{totalRuns !== 1 ? 's' : ''} total · {totalRuns} day{totalRuns !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-yellow)' }}>
                done {doneBy}
              </span>
            </div>

            {/* Materials status */}
            <p className="text-[11px]" style={{ color: materialsReady ? 'var(--accent-green)' : 'var(--text-muted)' }}>
              {materialsReady
                ? `✓ ${materialNeeded.toLocaleString()} ${materialName} ready — do today's run`
                : `${materialHave.toLocaleString()} / ${materialNeeded.toLocaleString()} ${materialName} for next run`}
            </p>
          </div>
        </div>
      ))}

      {/* Grow crops — vertical list, fastest first */}
      {cropActions.length > 0 && (
        <div className="flex items-start gap-2">
          <Sprout size={13} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Plant today</span>
            {cropActions.map(({ item, grows, doneBy, growMinutes, deficit }) => (
              <div key={item} className="flex items-baseline justify-between gap-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                <span className="text-[11px] flex-shrink-0 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  ×{deficit} · {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(growMinutes)}/cycle · {doneBy}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
