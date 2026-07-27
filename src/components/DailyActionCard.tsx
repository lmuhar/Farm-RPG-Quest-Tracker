import { useMemo } from 'react';
import { CheckCircle2, Hammer, Landmark, Sprout } from 'lucide-react';
import { useStore } from '../store';
import {
  parseItems, calcGrowsNeeded, calcHoneyRuns, calcCutlassRuns,
  HONEY_RADISHES_PER_RUN, CUTLASS_TRIBAL_STAFF_PER_RUN,
  formatDoneBy,
} from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map(r => [r.name.toLowerCase(), r])
);

interface TempleInfo {
  type: 'honey' | 'cutlass';
  runs: number;
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

    const itemMap = new Map<string, number>();
    activeQuests.forEach(quest => {
      parseItems(quest.itemsRequired).forEach(({ item, quantity }) => {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      });
    });

    const craftNow: string[] = [];
    const templeItems: TempleInfo[] = [];
    const cropActions: CropAction[] = [];

    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      const deficit = Math.max(0, totalNeeded - have);
      if (deficit === 0) continue;

      const isHoney = item.toLowerCase() === 'honey';
      const isCutlass = item.toLowerCase() === 'cutlass';

      if (isHoney) {
        const honey = calcHoneyRuns(deficit);
        const radishHave = inventory['Radish'] ?? 0;
        templeItems.push({
          type: 'honey',
          runs: honey.runs,
          // 1 temple run per day
          doneBy: formatDoneBy(honey.runs * 24 * 60),
          materialsReady: radishHave >= HONEY_RADISHES_PER_RUN,
          materialName: 'radishes',
          materialHave: radishHave,
          materialNeeded: HONEY_RADISHES_PER_RUN,
        });
      } else if (isCutlass) {
        const cutlass = calcCutlassRuns(deficit);
        const staffHave = inventory['Tribal Staff'] ?? 0;
        templeItems.push({
          type: 'cutlass',
          runs: cutlass.runs,
          doneBy: formatDoneBy(cutlass.runs * 24 * 60),
          materialsReady: staffHave >= CUTLASS_TRIBAL_STAFF_PER_RUN,
          materialName: 'tribal staff',
          materialHave: staffHave,
          materialNeeded: CUTLASS_TRIBAL_STAFF_PER_RUN,
        });
      } else {
        const recipe = recipeByName.get(item.toLowerCase());
        if (recipe) {
          const directIngredients = new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]));
          const allReady = [...directIngredients.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty);
          if (allReady) craftNow.push(item);
        } else {
          const cropTime = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
          if (cropTime) {
            const grows = calcGrowsNeeded(deficit, plotCount);
            cropActions.push({ item, grows, doneBy: formatDoneBy(grows * cropTime.growMinutes) });
          }
        }
      }
    }

    // Shortest grow time first
    cropActions.sort((a, b) => a.grows - b.grows);

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

      {/* Temple runs */}
      {templeItems.length > 0 && (
        <div className="flex items-start gap-2">
          <Landmark size={13} style={{ color: 'var(--accent-yellow)', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1 min-w-0 space-y-1.5">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-yellow)' }}>Temple</span>
            {templeItems.map(({ type, runs, doneBy, materialsReady, materialName, materialHave, materialNeeded }) => (
              <div key={type} className="pl-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {type === 'honey' ? 'Honey' : 'Cutlass'}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-yellow)' }}>
                    {runs} run{runs !== 1 ? 's' : ''} · {runs} day{runs !== 1 ? 's' : ''} · {doneBy}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: materialsReady ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                  {materialsReady
                    ? `✓ ${materialNeeded.toLocaleString()} ${materialName} ready — do today's run`
                    : `${materialHave.toLocaleString()} / ${materialNeeded.toLocaleString()} ${materialName} for next run`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grow crops — vertical list, fastest first */}
      {cropActions.length > 0 && (
        <div className="flex items-start gap-2">
          <Sprout size={13} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Plant today</span>
            {cropActions.map(({ item, grows, doneBy }) => (
              <div key={item} className="flex items-baseline justify-between gap-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                <span className="text-[11px] flex-shrink-0 text-right" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {grows} grow{grows !== 1 ? 's' : ''} · {doneBy}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
