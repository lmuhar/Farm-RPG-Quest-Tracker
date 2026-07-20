import { useMemo, useState } from 'react';
import { Swords, Clock, ChevronDown, Hammer, X, Landmark, MapPin, CheckCircle2, Package } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems, formatDuration, calcGrowsNeeded, calcHoneyRuns, calcCutlassRuns, HONEY_RADISHES_PER_RUN, CUTLASS_TRIBAL_STAFF_PER_RUN } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { resolveRawIngredients } from '../utils';
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

export function ActiveQuestsSummary({ quests }: Props) {
  const { inventory, cropTimes, plotCount, inventoryMax } = useStore();
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [locationItem, setLocationItem] = useState<string | null>(null);
  const [showStocked, setShowStocked] = useState(false);

  const toggleItem = (item: string) =>
    setSelectedItem((prev) => (prev === item ? null : item));

  const toggleLocation = (item: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocationItem((prev) => (prev === item ? null : item));
  };

  // Per-item quest breakdown map
  const itemQuestMap = useMemo(() => {
    const map = new Map<string, { quest: Quest; quantity: number }[]>();
    for (const quest of quests) {
      for (const { quantity, item } of parseItems(quest.itemsRequired)) {
        if (!map.has(item)) map.set(item, []);
        map.get(item)!.push({ quest, quantity });
      }
    }
    return map;
  }, [quests]);

  const { turnInQuests, craftableItems, collectingItems, stockedItems, templeRecommendation } = useMemo(() => {
    // Aggregate item totals across all active quests
    const itemMap = new Map<string, number>();
    for (const quest of quests) {
      for (const { quantity, item } of parseItems(quest.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      }
    }

    const all = [...itemMap.entries()].map(([item, totalNeeded]) => {
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
      const seedsHave = cropTime && grows ? (inventory[`${item} Seed`] ?? 0) : 0;
      const seedsToBuy = cropTime && grows ? Math.max(0, grows * plotCount - seedsHave) : 0;
      const recipe = recipeByName.get(item.toLowerCase());
      // Craft-now: has recipe, not a temple item, has a deficit, and ALL raw materials are in inventory
      const rawMaterials = recipe && deficit > 0 ? resolveRawIngredients(item, deficit, recipeByName) : null;
      const isCraftNow = !isHoney && !isCutlass && recipe != null && rawMaterials != null && deficit > 0 &&
        [...rawMaterials.entries()].every(([ri, rq]) => (inventory[ri] ?? 0) >= rq);
      return { item, totalNeeded, have, deficit, pct, isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave, cropTime, grows, totalTime, seedsHave, seedsToBuy, recipe, rawMaterials, isCraftNow };
    });

    // Tier 1: quests where every item is fully stocked
    const turnInQuests = quests.filter((quest) =>
      parseItems(quest.itemsRequired).every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity)
    );

    const needed = all.filter((i) => i.deficit > 0);
    const craftableItems = needed.filter((i) => i.isCraftNow).sort((a, b) => b.pct - a.pct);
    const collectingItems = needed.filter((i) => !i.isCraftNow).sort((a, b) => b.pct - a.pct);
    const stockedItems = all.filter((i) => i.deficit === 0);

    // Temple priority recommendation
    const honeyNeeded = needed.find((i) => i.isHoney);
    const cutlassNeeded = needed.find((i) => i.isCutlass);
    let templeRecommendation: 'honey' | 'cutlass' | null = null;
    if (honeyNeeded && cutlassNeeded) {
      const canDoHoney = (inventory['Radish'] ?? 0) >= HONEY_RADISHES_PER_RUN;
      const canDoCutlass = (inventory['Tribal Staff'] ?? 0) >= CUTLASS_TRIBAL_STAFF_PER_RUN;
      if (canDoHoney && !canDoCutlass) templeRecommendation = 'honey';
      else if (canDoCutlass && !canDoHoney) templeRecommendation = 'cutlass';
      else templeRecommendation = honeyNeeded.deficit >= cutlassNeeded.deficit ? 'honey' : 'cutlass';
    }

    return { turnInQuests, craftableItems, collectingItems, stockedItems, templeRecommendation };
  }, [quests, inventory, cropTimes, plotCount]);

  // Inventory pressure
  const usedSlots = Object.keys(inventory).length;
  const slotPct = inventoryMax > 0 ? usedSlots / inventoryMax : 0;
  const slotColor = slotPct >= 0.9 ? 'var(--accent-orange)' : slotPct >= 0.75 ? 'var(--accent-yellow)' : 'var(--accent-green)';

  const totalNeeded = collectingItems.length + craftableItems.length;

  if (quests.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <Swords size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No active quests — mark some as active to start tracking
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex flex-wrap items-center gap-2"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}
        >
          <Swords size={11} />
          {quests.length} quest{quests.length !== 1 ? 's' : ''} active
        </span>
        {turnInQuests.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
          >
            <CheckCircle2 size={11} />
            {turnInQuests.length} ready to turn in
          </span>
        )}
        {craftableItems.length > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
          >
            <Hammer size={11} />
            {craftableItems.length} craft now
          </span>
        )}
        {totalNeeded === 0 && turnInQuests.length === 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
          >
            ✓ All items stocked
          </span>
        )}
        {/* Inventory pressure */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <Package size={11} style={{ color: slotColor }} />
          <span className="text-xs font-semibold" style={{ color: slotColor, fontFamily: 'var(--font-mono)' }}>
            {usedSlots}/{inventoryMax}
          </span>
          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(slotPct * 100, 100)}%`, background: slotColor }}
            />
          </div>
        </div>
      </div>

      {/* Temple priority banner */}
      {templeRecommendation && (
        <div
          className="px-5 py-2 flex items-center gap-2 text-xs"
          style={{ background: 'var(--accent-yellow-bg)', borderBottom: '1px solid var(--accent-yellow-border)' }}
        >
          <Landmark size={11} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
          <span style={{ color: 'var(--accent-yellow)' }}>
            <strong>Do {templeRecommendation === 'honey' ? 'Honey' : 'Cutlass'} today</strong>
            {' '}— temple resets once daily; {templeRecommendation === 'honey' ? 'Cutlass' : 'Honey'} can wait
          </span>
        </div>
      )}

      {/* TIER 1 — Turn in now */}
      {turnInQuests.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            className="px-5 py-2 flex items-center gap-2"
            style={{ background: 'var(--accent-green-bg)', borderBottom: '1px solid var(--accent-green-border)' }}
          >
            <CheckCircle2 size={11} style={{ color: 'var(--accent-green)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-green)' }}>
              Turn in now
            </span>
          </div>
          {turnInQuests.map((quest) => {
            const items = parseItems(quest.itemsRequired);
            return (
              <div
                key={quest.id}
                className="px-5 py-3"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{quest.name}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{quest.npc}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {items.map(({ item, quantity }) => (
                    <span key={item} className="text-xs" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                      ✓ {item} ×{quantity}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TIER 2 — Craft now */}
      {craftableItems.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            className="px-5 py-2 flex items-center gap-2"
            style={{ background: 'var(--accent-blue-bg)', borderBottom: '1px solid var(--accent-blue-border)' }}
          >
            <Hammer size={11} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>
              Craft now
            </span>
            <span className="text-[11px]" style={{ color: 'var(--accent-blue)', opacity: 0.7 }}>
              — all materials in inventory
            </span>
          </div>
          {craftableItems.map(({ item, totalNeeded, have, deficit, rawMaterials }) => {
            const isSelected = selectedItem === item;
            const breakdown = itemQuestMap.get(item) ?? [];
            return (
              <div
                key={item}
                style={{ borderBottom: '1px solid var(--border-subtle)', background: isSelected ? 'var(--surface-card-hover)' : undefined }}
              >
                <div className="px-5 py-3 cursor-pointer" onClick={() => toggleItem(item)}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                      <button
                        onClick={(e) => toggleLocation(item, e)}
                        className="flex-shrink-0 p-0.5 rounded transition-opacity hover:opacity-80"
                        style={{ color: locationItem === item ? 'var(--accent-purple)' : 'var(--text-muted)' }}
                        aria-label="Show locations"
                      >
                        <MapPin size={11} />
                      </button>
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                      >
                        <Hammer size={9} /> craft ×{deficit}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSelected && <X size={12} style={{ color: 'var(--text-muted)' }} />}
                      <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                        {have}/{totalNeeded}
                      </span>
                    </div>
                  </div>
                  {/* Raw materials inline */}
                  {rawMaterials && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {[...rawMaterials.entries()].map(([ri, rq]) => {
                        const haveRaw = inventory[ri] ?? 0;
                        return (
                          <span key={ri} className="text-xs" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                            ✓ {ri} {haveRaw}/{rq}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {locationItem === item && (
                    <div className="mt-2">
                      <ItemLocationPanel
                        item={item}
                        allNeededItems={[...craftableItems, ...collectingItems].map((i) => i.item)}
                      />
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div
                    className="px-5 pb-3 space-y-1"
                    style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-inset)', paddingTop: 10 }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                      Needed by
                    </p>
                    {breakdown.map(({ quest, quantity }) => (
                      <div key={quest.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{quest.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>×{quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TIER 3 — Still collecting */}
      {collectingItems.length > 0 && (
        <div style={{ borderBottom: stockedItems.length > 0 ? '1px solid var(--border-subtle)' : undefined }}>
          <div
            className="px-5 py-2 flex items-center gap-2"
            style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}
          >
            <Swords size={11} style={{ color: 'var(--accent-orange)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-orange)' }}>
              Still collecting
            </span>
          </div>
          {collectingItems.map(({ item, totalNeeded, have, pct, isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave, cropTime, grows, totalTime, seedsHave, seedsToBuy, recipe, rawMaterials }) => {
            const isSelected = selectedItem === item;
            const breakdown = itemQuestMap.get(item) ?? [];
            const pctDisplay = Math.round(pct * 100);

            return (
              <div
                key={item}
                style={{ borderBottom: '1px solid var(--border-subtle)', background: isSelected ? 'var(--surface-card-hover)' : undefined }}
              >
                <div className="px-5 py-3 cursor-pointer" onClick={() => toggleItem(item)}>
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
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {seedsToBuy > 0
                            ? `buy ${seedsToBuy} seed${seedsToBuy !== 1 ? 's' : ''}${seedsHave > 0 ? ` (have ${seedsHave})` : ''}`
                            : `seeds stocked${seedsHave > 0 ? ` (have ${seedsHave})` : ''}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                      {breakdown.length > 1 && !isSelected && (
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {breakdown.length} quests
                        </span>
                      )}
                      {isSelected && <X size={12} style={{ color: 'var(--text-muted)' }} />}
                      <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
                        {have}/{totalNeeded}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pctDisplay}%`, background: 'var(--accent-orange)', transition: 'var(--transition-default)' }}
                    />
                  </div>
                  {locationItem === item && (
                    <div className="mt-2">
                      <ItemLocationPanel
                        item={item}
                        allNeededItems={[...craftableItems, ...collectingItems].map((i) => i.item)}
                      />
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div
                    className="px-5 pb-3 space-y-2"
                    style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-inset)', paddingTop: 10 }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Needed by
                    </p>
                    {breakdown.map(({ quest, quantity }) => (
                      <div key={quest.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{quest.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>×{quantity}</span>
                      </div>
                    ))}
                    {recipe && rawMaterials && (() => {
                      const isDeep = [...rawMaterials.keys()].some((r) => !recipe.ingredients.find((i) => i.item === r));
                      if (!isDeep) return null;
                      return (
                        <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Raw materials needed</p>
                          {[...rawMaterials.entries()].map(([rawItem, rawQty]) => {
                            const haveRaw = inventory[rawItem] ?? 0;
                            const ok = haveRaw >= rawQty;
                            return (
                              <div key={rawItem} className="flex items-center justify-between text-xs gap-2">
                                <span style={{ color: 'var(--text-secondary)' }}>{rawItem}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: ok ? 'var(--accent-green)' : 'var(--accent-orange)', flexShrink: 0 }}>
                                  {haveRaw}/{rawQty}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stocked items — collapsible */}
      {stockedItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowStocked((v) => !v)}
            className="w-full flex items-center gap-2 px-5 py-2.5 transition-colors hover:bg-slate-700/10"
            style={{ background: 'var(--accent-green-bg)' }}
          >
            <span className="flex-1 text-left text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>
              ✓ {stockedItems.length} item{stockedItems.length !== 1 ? 's' : ''} fully stocked
            </span>
            <ChevronDown
              size={12}
              style={{ color: 'var(--text-muted)', transform: showStocked ? 'rotate(180deg)' : 'none', transition: 'var(--transition-fast)' }}
            />
          </button>
          {showStocked && (
            <div>
              {stockedItems.map(({ item, totalNeeded, have }) => (
                <div
                  key={item}
                  className="px-5 py-2 flex items-center justify-between"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                >
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                  <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-green)' }}>
                    {have}/{totalNeeded} ✓
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
