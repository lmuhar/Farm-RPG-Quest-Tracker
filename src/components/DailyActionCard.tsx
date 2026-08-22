import { useMemo } from 'react';
import { CheckCircle2, Hammer, Landmark, Sprout, Moon, Clock, Zap } from 'lucide-react';
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

interface CropAction {
  item: string;
  grows: number;
  doneBy: string;
  growMinutes: number;
  deficit: number;
}

interface TempleAction {
  type: 'honey' | 'cutlass';
  totalRuns: number;
  doneBy: string;
  materialsReady: boolean;
  materialName: string;
  materialHave: number;
  materialNeeded: number;
}

interface Props {
  activeQuests: Quest[];
}

export function DailyActionCard({ activeQuests }: Props) {
  const { inventory, cropTimes, plotCount } = useStore();

  const { turnInReady, craftNow, templeActions, cropActions } = useMemo(() => {
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
    const templeActions: TempleAction[] = [];
    const cropActions: CropAction[] = [];

    // Honey temple
    const totalHoneyNeeded = itemMap.get('Honey') ?? itemMap.get('honey') ?? 0;
    const honeyHave = inventory['Honey'] ?? 0;
    const honeyDeficit = Math.max(0, totalHoneyNeeded - honeyHave);
    if (honeyDeficit > 0) {
      const { runs } = calcHoneyRuns(honeyDeficit);
      const radishHave = inventory['Radish'] ?? 0;
      templeActions.push({
        type: 'honey',
        totalRuns: runs,
        doneBy: formatDoneBy(runs * 24 * 60),
        materialsReady: radishHave >= HONEY_RADISHES_PER_RUN,
        materialName: 'radishes',
        materialHave: radishHave,
        materialNeeded: HONEY_RADISHES_PER_RUN,
      });
    }

    // Cutlass temple
    const totalCutlassNeeded = itemMap.get('Cutlass') ?? itemMap.get('cutlass') ?? 0;
    const cutlassHave = inventory['Cutlass'] ?? 0;
    const cutlassDeficit = Math.max(0, totalCutlassNeeded - cutlassHave);
    if (cutlassDeficit > 0) {
      const { runs } = calcCutlassRuns(cutlassDeficit);
      const staffHave = inventory['Tribal Staff'] ?? 0;
      templeActions.push({
        type: 'cutlass',
        totalRuns: runs,
        doneBy: formatDoneBy(runs * 24 * 60),
        materialsReady: staffHave >= CUTLASS_TRIBAL_STAFF_PER_RUN,
        materialName: 'tribal staff',
        materialHave: staffHave,
        materialNeeded: CUTLASS_TRIBAL_STAFF_PER_RUN,
      });
    }

    for (const [item, totalNeeded] of itemMap.entries()) {
      if (item.toLowerCase() === 'honey' || item.toLowerCase() === 'cutlass') continue;

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

    cropActions.sort((a, b) => a.growMinutes - b.growMinutes);

    return { turnInReady, craftNow, templeActions, cropActions };
  }, [activeQuests, inventory, cropTimes, plotCount]);

  // Partition crops by time-of-day bucket
  const afkCrops = cropActions.filter(c => c.growMinutes <= 60);
  const bedCrops = cropActions.filter(c => c.growMinutes > 60);

  const doNowTemples = templeActions.filter(t => t.materialsReady);
  const doLaterTemples = templeActions.filter(t => !t.materialsReady);

  const hasDoNow = turnInReady.length > 0 || craftNow.length > 0 || doNowTemples.length > 0;
  const hasAfk = afkCrops.length > 0;
  const hasBed = bedCrops.length > 0 || doLaterTemples.length > 0;

  if (!hasDoNow && !hasAfk && !hasBed) return null;

  const SectionHeader = ({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) => (
    <div className="flex items-center gap-2 pb-1" style={{ borderBottom: `1px solid var(--border-subtle)` }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );

  const TempleRow = ({ t }: { t: TempleAction }) => (
    <div className="flex items-start gap-2">
      <Landmark size={12} style={{ color: 'var(--accent-yellow)', flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0 text-xs">
        <span className="font-semibold" style={{ color: 'var(--accent-yellow)' }}>
          {t.type === 'honey' ? 'Honey' : 'Cutlass'} temple
        </span>
        <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>
          {t.totalRuns} run{t.totalRuns !== 1 ? 's' : ''} · {t.doneBy}
        </span>
        {!t.materialsReady && (
          <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>
            · {t.materialHave}/{t.materialNeeded} {t.materialName}
          </span>
        )}
      </div>
    </div>
  );

  const CropRow = ({ c }: { c: CropAction }) => (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span style={{ color: 'var(--text-secondary)' }}>{c.item}</span>
      <span className="flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
        ×{c.deficit} · {c.grows} grow{c.grows !== 1 ? 's' : ''} · {formatDuration(c.growMinutes)}/cycle · {c.doneBy}
      </span>
    </div>
  );

  return (
    <div
      className="rounded-xl px-5 py-4 space-y-4"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Do now */}
      {hasDoNow && (
        <div className="space-y-2">
          <SectionHeader icon={<Zap size={11} />} label="Do now" color="var(--accent-green)" />

          {turnInReady.length > 0 && (
            <div className="flex items-start gap-2">
              <CheckCircle2 size={12} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
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
              <Hammer size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs leading-snug">
                <span className="font-semibold" style={{ color: 'var(--accent-blue)' }}>Craft now:</span>
                <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>{craftNow.join(', ')}</span>
              </p>
            </div>
          )}

          {doNowTemples.map(t => <TempleRow key={t.type} t={t} />)}
        </div>
      )}

      {/* While AFK */}
      {hasAfk && (
        <div className="space-y-2">
          <SectionHeader icon={<Clock size={11} />} label="While AFK" color="var(--accent-yellow)" />
          <div className="flex items-start gap-2">
            <Sprout size={12} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1 min-w-0 space-y-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Plant medium crops</span>
              {afkCrops.map(c => <CropRow key={c.item} c={c} />)}
            </div>
          </div>
        </div>
      )}

      {/* Before bed */}
      {hasBed && (
        <div className="space-y-2">
          <SectionHeader icon={<Moon size={11} />} label="Before bed" color="var(--accent-purple)" />
          {bedCrops.length > 0 && (
            <div className="flex items-start gap-2">
              <Sprout size={12} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }} />
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>Plant overnight crops</span>
                {bedCrops.map(c => <CropRow key={c.item} c={c} />)}
              </div>
            </div>
          )}
          {doLaterTemples.map(t => <TempleRow key={t.type} t={t} />)}
        </div>
      )}
    </div>
  );
}
