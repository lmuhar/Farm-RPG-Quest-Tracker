import { useMemo } from 'react';
import { CheckCircle2, Hammer, Sprout, Package, AlertTriangle, TrendingUp, Zap, Clock } from 'lucide-react';
import { useStore } from '../store';
import { parseItems, calcGrowsNeeded } from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const allRecipes = recipesData as Recipe[];
const recipeByName = new Map<string, Recipe>(allRecipes.map(r => [r.name.toLowerCase(), r]));

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function Dashboard({ activeQuests, nextUpQuests }: Props) {
  const { inventory, cropTimes, plotCount, inventoryMax, craftingRecipes } = useStore();

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>(recipeByName);
    Object.entries(craftingRecipes).forEach(([item, ings]) => {
      map.set(item.toLowerCase(), { id: 'custom', name: item, ingredients: ings });
    });
    return map;
  }, [craftingRecipes]);

  const {
    readyToTurnIn,
    craftNowItems,
    cropItems,
    bottlenecks,
  } = useMemo(() => {
    // All quests to consider
    const allQ = [...activeQuests, ...nextUpQuests];

    // Aggregate item needs across active quests
    const itemMap = new Map<string, number>();
    for (const q of activeQuests) {
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      }
    }

    // Turn in ready
    const readyToTurnIn = activeQuests.filter(q =>
      parseItems(q.itemsRequired).every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity)
    );

    // Craft now (all direct ingredients in inventory)
    const craftNowItems: string[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const recipe = recipeMap.get(item.toLowerCase());
      if (!recipe) continue;
      const directIngs = new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]));
      if ([...directIngs.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty)) {
        craftNowItems.push(item);
      }
    }

    // Crop grows needed
    const cropItems: { item: string; grows: number; growMinutes: number }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
      if (crop) {
        const grows = calcGrowsNeeded(deficit, plotCount);
        cropItems.push({ item, grows, growMinutes: crop.growMinutes });
      }
    }

    // Bottleneck items: deficit > 0, no recipe, no crop time, needed by ≥ 1 quest
    // Rank by: number of quests needing it (both active + next-up)
    const allItemQuestCount = new Map<string, { active: number; nextup: number; have: number; need: number }>();
    for (const q of allQ) {
      const isNextUp = !activeQuests.includes(q);
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        const have = inventory[item] ?? 0;
        if (have >= quantity) continue; // already stocked
        const recipe = recipeMap.get(item.toLowerCase());
        const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
        if (recipe || crop) continue; // has a path
        const isHoney = item.toLowerCase() === 'honey';
        const isCutlass = item.toLowerCase() === 'cutlass';
        if (isHoney || isCutlass) continue; // temple items handled separately
        const existing = allItemQuestCount.get(item) ?? { active: 0, nextup: 0, have, need: 0 };
        if (isNextUp) existing.nextup++;
        else existing.active++;
        existing.need = Math.max(existing.need, quantity);
        allItemQuestCount.set(item, existing);
      }
    }
    const bottlenecks = [...allItemQuestCount.entries()]
      .map(([item, { active, nextup, have, need }]) => ({ item, active, nextup, have, need }))
      .sort((a, b) => b.active - a.active || b.nextup - a.nextup)
      .slice(0, 6);

    return { readyToTurnIn, craftNowItems, cropItems, bottlenecks };
  }, [activeQuests, nextUpQuests, inventory, cropTimes, plotCount, recipeMap]);

  const usedSlots = Object.keys(inventory).length;
  const slotPct = inventoryMax > 0 ? usedSlots / inventoryMax : 0;
  const slotColor = slotPct >= 0.9 ? 'var(--accent-orange)' : slotPct >= 0.75 ? 'var(--accent-yellow)' : 'var(--accent-green)';

  const totalGrows = cropItems.reduce((s, c) => s + c.grows, 0);

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Ready to turn in */}
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: 'var(--surface-card)', border: readyToTurnIn.length > 0 ? '1px solid var(--accent-green-border)' : '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} style={{ color: readyToTurnIn.length > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Turn in</span>
          </div>
          <span className="text-2xl font-bold" style={{ color: readyToTurnIn.length > 0 ? 'var(--accent-green)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {readyToTurnIn.length}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {readyToTurnIn.length === 0 ? 'quest ready' : readyToTurnIn.length === 1 ? 'quest ready' : 'quests ready'}
          </span>
        </div>

        {/* Craft now */}
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: 'var(--surface-card)', border: craftNowItems.length > 0 ? '1px solid var(--accent-blue-border)' : '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Hammer size={14} style={{ color: craftNowItems.length > 0 ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Craft now</span>
          </div>
          <span className="text-2xl font-bold" style={{ color: craftNowItems.length > 0 ? 'var(--accent-blue)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {craftNowItems.length}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {craftNowItems.length === 1 ? 'item ready' : 'items ready'}
          </span>
        </div>

        {/* Crops */}
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Sprout size={14} style={{ color: 'var(--accent-green)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Grows needed</span>
          </div>
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {totalGrows}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {cropItems.length} crop type{cropItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Inventory pressure */}
        <div
          className="rounded-xl p-4 flex flex-col gap-1"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Package size={14} style={{ color: slotColor }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Inventory</span>
          </div>
          <span className="text-2xl font-bold" style={{ color: slotColor, fontFamily: 'var(--font-mono)' }}>
            {usedSlots}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>of {inventoryMax}</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(slotPct * 100, 100)}%`, background: slotColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* Do right now */}
      {(readyToTurnIn.length > 0 || craftNowItems.length > 0) && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-green-border)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-green-bg)', borderBottom: '1px solid var(--accent-green-border)' }}>
            <Zap size={13} style={{ color: 'var(--accent-green)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>Do right now</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {readyToTurnIn.map(q => (
              <div key={q.id} className="px-4 py-2.5 flex items-center gap-2">
                <CheckCircle2 size={12} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Turn in: {q.name}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{q.npc}</span>
              </div>
            ))}
            {craftNowItems.map(item => (
              <div key={item} className="px-4 py-2.5 flex items-center gap-2">
                <Hammer size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Craft: {item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bottleneck items */}
        {bottlenecks.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}>
              <AlertTriangle size={13} style={{ color: 'var(--accent-orange)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-orange)' }}>Bottlenecks</span>
              <span className="text-xs ml-1" style={{ color: 'var(--accent-orange)', opacity: 0.7 }}>— items with no easy source</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {bottlenecks.map(({ item, active, nextup, have, need }) => (
                <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {active > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                          {active} active quest{active !== 1 ? 's' : ''}
                        </span>
                      )}
                      {nextup > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                          {nextup} next up
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: have >= need ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                    {have}/{need}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Crops overview */}
        {cropItems.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-green-bg)', borderBottom: '1px solid var(--accent-green-border)' }}>
              <Sprout size={13} style={{ color: 'var(--accent-green)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-green)' }}>Crops to grow</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {[...cropItems].sort((a, b) => a.growMinutes - b.growMinutes).map(({ item, grows, growMinutes }) => (
                <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {grows} grow{grows !== 1 ? 's' : ''} · {growMinutes < 1 ? `${Math.round(growMinutes * 60)}s` : growMinutes < 60 ? `${growMinutes}m` : `${Math.round(growMinutes / 60 * 10) / 10}h`}/cycle
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active quests count by questline */}
      {activeQuests.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
            <TrendingUp size={13} style={{ color: 'var(--accent-purple)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-purple)' }}>Active quests</span>
            <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{activeQuests.length} total</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {/* Group by questline */}
            {(() => {
              const lines = new Map<string, Quest[]>();
              for (const q of activeQuests) {
                const key = q.questline || '(standalone)';
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key)!.push(q);
              }
              return [...lines.entries()].map(([line, quests]) => (
                <div key={line} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{line}</span>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {quests.map(q => q.name).join(' · ')}
                    </p>
                  </div>
                  <span
                    className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}
                  >
                    {quests.length}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {activeQuests.length === 0 && (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active quests — mark quests as active to see your dashboard.</p>
        </div>
      )}
    </div>
  );
}
