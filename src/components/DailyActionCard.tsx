import { useMemo } from 'react';
import { CheckCircle2, Hammer, Landmark, Sprout } from 'lucide-react';
import { useStore } from '../store';
import {
  parseItems, calcGrowsNeeded, calcHoneyRuns, calcCutlassRuns,
  HONEY_RADISHES_PER_RUN, CUTLASS_TRIBAL_STAFF_PER_RUN, formatDoneBy,
} from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map(r => [r.name.toLowerCase(), r])
);

interface Props {
  activeQuests: Quest[];
}

export function DailyActionCard({ activeQuests }: Props) {
  const { inventory, cropTimes, plotCount } = useStore();

  const { turnInReady, craftNow, templeReady, cropActions } = useMemo(() => {
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
    let honeyReady = false;
    let cutlassReady = false;
    const cropActions: { item: string; grows: number; doneBy: string }[] = [];

    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      const deficit = Math.max(0, totalNeeded - have);
      if (deficit === 0) continue;

      const isHoney = item.toLowerCase() === 'honey';
      const isCutlass = item.toLowerCase() === 'cutlass';

      if (isHoney) {
        const honey = calcHoneyRuns(deficit);
        honeyReady = (inventory['Radish'] ?? 0) >= honey.radishes / honey.runs;
      } else if (isCutlass) {
        const cutlass = calcCutlassRuns(deficit);
        cutlassReady = (inventory['Tribal Staff'] ?? 0) >= cutlass.tribalStaff / cutlass.runs;
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
            const totalTime = grows * cropTime.growMinutes;
            cropActions.push({ item, grows, doneBy: formatDoneBy(totalTime) });
          }
        }
      }
    }

    // Sort crops shortest-grow-time first so most actionable appear first
    cropActions.sort((a, b) => a.grows - b.grows);

    const honeyNeeded = [...itemMap.keys()].some(k => k.toLowerCase() === 'honey');
    const cutlassNeeded = [...itemMap.keys()].some(k => k.toLowerCase() === 'cutlass');
    let templeReady: 'honey' | 'cutlass' | null = null;
    if (honeyNeeded && honeyReady && (inventory['Radish'] ?? 0) >= HONEY_RADISHES_PER_RUN) {
      templeReady = 'honey';
    } else if (cutlassNeeded && cutlassReady && (inventory['Tribal Staff'] ?? 0) >= CUTLASS_TRIBAL_STAFF_PER_RUN) {
      templeReady = 'cutlass';
    }

    return { turnInReady, craftNow, templeReady, cropActions };
  }, [activeQuests, inventory, cropTimes, plotCount]);

  const hasActions =
    turnInReady.length > 0 || craftNow.length > 0 || templeReady !== null || cropActions.length > 0;

  if (!hasActions) return null;

  return (
    <div
      className="rounded-xl px-5 py-4 space-y-2.5"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', letterSpacing: '0.08em' }}
      >
        Do now
      </p>

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

      {craftNow.length > 0 && (
        <div className="flex items-start gap-2">
          <Hammer size={13} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-snug">
            <span className="font-semibold" style={{ color: 'var(--accent-blue)' }}>Craft now:</span>
            <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>{craftNow.join(', ')}</span>
          </p>
        </div>
      )}

      {templeReady && (
        <div className="flex items-center gap-2">
          <Landmark size={13} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
          <p className="text-xs font-semibold" style={{ color: 'var(--accent-yellow)' }}>
            Temple run ready — do {templeReady === 'honey' ? 'Honey' : 'Cutlass'} today
          </p>
        </div>
      )}

      {cropActions.length > 0 && (
        <div className="flex items-start gap-2">
          <Sprout size={13} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-snug">
            <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>Plant today:</span>
            <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>
              {cropActions.map(({ item, grows, doneBy }) =>
                `${item} (${grows} grow${grows !== 1 ? 's' : ''}, done ${doneBy})`
              ).join(' · ')}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
