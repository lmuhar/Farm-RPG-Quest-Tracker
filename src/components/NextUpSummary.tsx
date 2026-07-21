import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Hammer, Landmark, MapPin } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems, formatDuration, calcGrowsNeeded, calcHoneyRuns, calcCutlassRuns } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { ItemLocationPanel } from './ItemLocationPanel';

interface Recipe {
  id: string;
  name: string;
  ingredients: { item: string; quantity: number }[];
}

const allRecipes = recipesData as Recipe[];
const recipeByName = new Map<string, Recipe>(allRecipes.map((r) => [r.name.toLowerCase(), r]));

interface Props {
  quests: Quest[];
}

export function NextUpSummary({ quests }: Props) {
  const { inventory, cropTimes, plotCount } = useStore();
  const [collapsed, setCollapsed] = useState(false);
  const [locationItem, setLocationItem] = useState<string | null>(null);

  const toggleLocation = (item: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocationItem((prev) => (prev === item ? null : item));
  };

  const items = useMemo(() => {
    const itemMap = new Map<string, number>();
    for (const quest of quests) {
      for (const { quantity, item } of parseItems(quest.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      }
    }
    return [...itemMap.entries()]
      .map(([item, totalNeeded]) => {
        const have = inventory[item] ?? 0;
        const deficit = Math.max(0, totalNeeded - have);
        const pct = totalNeeded > 0 ? have / totalNeeded : 1;
        const isHoney = item.toLowerCase() === 'honey';
        const isCutlass = item.toLowerCase() === 'cutlass';
        const honey = isHoney && deficit > 0 ? calcHoneyRuns(deficit) : null;
        const honeyRadishHave = honey ? (inventory['Radish'] ?? 0) : 0;
        const honeyGrows = honey ? calcGrowsNeeded(Math.max(0, honey.radishes - honeyRadishHave), plotCount) : 0;
        const cutlass = isCutlass && deficit > 0 ? calcCutlassRuns(deficit) : null;
        const cutlassStaffHave = cutlass ? (inventory['Tribal Staff'] ?? 0) : 0;
        const cropTime = !isHoney && !isCutlass ? cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase()) : undefined;
        const grows = cropTime && deficit > 0 ? calcGrowsNeeded(deficit, plotCount) : null;
        const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;
        const seedsHave = cropTime && grows ? (inventory[`${item} Seeds`] ?? 0) : 0;
        const seedsToBuy = cropTime && grows ? Math.max(0, grows * plotCount - seedsHave) : 0;
        const recipe = !isHoney && !isCutlass ? recipeByName.get(item.toLowerCase()) : undefined;
        return { item, totalNeeded, have, deficit, pct, isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave, cropTime, grows, totalTime, seedsHave, seedsToBuy, recipe };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [quests, inventory, cropTimes, plotCount]);

  if (quests.length === 0) return null;

  const neededCount = items.filter((i) => i.deficit > 0).length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <button
        className="w-full px-5 py-3 flex items-center gap-2"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-subtle)' }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
        >
          <ChevronRight size={11} />
          {quests.length} quest{quests.length !== 1 ? 's' : ''} next up
        </span>
        {neededCount > 0 && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {neededCount} item{neededCount !== 1 ? 's' : ''} still needed
          </span>
        )}
        {neededCount === 0 && items.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--accent-green)' }}>
            ✓ all items ready
          </span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto flex-shrink-0"
          style={{
            color: 'var(--text-muted)',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            transition: 'var(--transition-fast)',
          }}
        />
      </button>

      {!collapsed && (
        <div>
          {items.length === 0 ? (
            <p className="px-5 py-3 text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No items required for next quests
            </p>
          ) : (
            items.map(({ item, totalNeeded, have, deficit, pct, isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave, cropTime, grows, totalTime, seedsHave, seedsToBuy, recipe }) => {
              const pctDisplay = Math.round(pct * 100);
              const done = deficit === 0;
              return (
                <div key={item} className="px-5 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                          {item}
                        </span>
                        <button
                          onClick={(e) => toggleLocation(item, e)}
                          className="flex-shrink-0 p-0.5 rounded transition-opacity hover:opacity-80"
                          style={{ color: locationItem === item ? 'var(--accent-purple)' : 'var(--text-muted)' }}
                          aria-label="Show locations"
                        >
                          <MapPin size={11} />
                        </button>
                        {(isHoney || isCutlass) && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}
                          >
                            <Landmark size={9} /> temple
                          </span>
                        )}
                        {recipe && !isHoney && !isCutlass && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                          >
                            <Hammer size={9} /> crafted
                          </span>
                        )}
                      </div>
                      {isHoney && honey && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-yellow)' }}>
                          <Landmark size={10} />
                          {honey.runs} run{honey.runs !== 1 ? 's' : ''} · {honey.radishes.toLocaleString()} radishes
                          {honeyGrows > 0
                            ? ` · ${honeyGrows} grow${honeyGrows !== 1 ? 's' : ''} (have ${honeyRadishHave.toLocaleString()})`
                            : ' · radishes stocked'}
                          {' '}· {honey.runs} day{honey.runs !== 1 ? 's' : ''}
                        </p>
                      )}
                      {isCutlass && cutlass && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-yellow)' }}>
                          <Landmark size={10} />
                          {cutlass.runs} run{cutlass.runs !== 1 ? 's' : ''} · {cutlass.tribalStaff} tribal staff
                          {cutlassStaffHave > 0 && ` (have ${cutlassStaffHave.toLocaleString()})`}
                          {' '}· {cutlass.runs} day{cutlass.runs !== 1 ? 's' : ''}
                        </p>
                      )}
                      {cropTime && grows && totalTime && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-green)' }}>
                          <Clock size={10} />
                          {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(totalTime)}
                        </p>
                      )}
                      {cropTime && grows && (
                        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          {seedsToBuy > 0
                            ? <>buy {seedsToBuy} seed{seedsToBuy !== 1 ? 's' : ''}{seedsHave > 0 ? ` (have ${seedsHave})` : ''}</>
                            : <>seeds stocked{seedsHave > 0 ? ` (have ${seedsHave})` : ''}</>}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-sm font-semibold flex-shrink-0"
                      style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : 'var(--accent-purple)' }}
                    >
                      {have}/{totalNeeded}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pctDisplay}%`,
                        background: done ? 'var(--accent-green)' : 'var(--accent-purple)',
                        transition: 'var(--transition-default)',
                      }}
                    />
                  </div>
                  {locationItem === item && (
                    <div className="mt-2">
                      <ItemLocationPanel
                        item={item}
                        allNeededItems={items.map((i) => i.item)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
