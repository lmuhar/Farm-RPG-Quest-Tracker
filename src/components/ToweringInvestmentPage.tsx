import { useState, useMemo } from 'react';
import {
  ChevronDown, CheckCircle2, Hammer, MapPin,
  Lock, Sprout, Building2, Clock, Landmark, Fish, Compass,
} from 'lucide-react';
import type { Quest } from '../types';
import {
  parseItems, formatDuration, formatDoneBy, calcGrowsNeeded, compareQuests,
  calcHoneyRuns, calcCutlassRuns,
} from '../utils';
import { getQuestStatus } from '../utils';
import { useStore } from '../store';
import recipesData from '../data/recipes.json';
import { resolveRawIngredients } from '../utils';
import { ItemLocationPanel } from './ItemLocationPanel';
import questsData from '../data/quests.json';
import itemLocationsData from '../data/item-locations.json';

const itemLocations = itemLocationsData as Record<string, { name: string; type: string }[]>;

const QUESTLINE = 'A Towering Investment';
const allQuestsData = questsData as Quest[];

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const recipeByName = new Map<string, Recipe>(
  (recipesData as Recipe[]).map((r) => [r.name.toLowerCase(), r])
);

type QuestFilter = 'incomplete' | 'active' | 'upcoming' | 'completed';

function getItemTierData(
  item: string,
  quantity: number,
  inventory: Record<string, number>,
  cropTimes: { item: string; growMinutes: number }[],
  plotCount: number,
) {
  const have = inventory[item] ?? 0;
  const deficit = Math.max(0, quantity - have);
  const pct = quantity > 0 ? Math.min(1, have / quantity) : 1;
  const done = have >= quantity;
  const isHoney = item.toLowerCase() === 'honey';
  const isCutlass = item.toLowerCase() === 'cutlass';
  const recipe = !isHoney && !isCutlass ? recipeByName.get(item.toLowerCase()) : undefined;
  const directIngredients = recipe && deficit > 0
    ? new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]))
    : null;
  const isDirectCraftNow = !!recipe && !!directIngredients && deficit > 0 &&
    [...directIngredients.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty);
  const rawMaterials = recipe && deficit > 0 ? resolveRawIngredients(item, deficit, recipeByName) : null;
  const isRawCraftNow = !isDirectCraftNow && !!recipe && !!rawMaterials && deficit > 0 &&
    [...rawMaterials.entries()].every(([ri, rq]) => (inventory[ri] ?? 0) >= rq);
  const isCraftNow = isDirectCraftNow || isRawCraftNow;
  const cropTime = !isHoney && !isCutlass
    ? cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase())
    : undefined;
  const grows = cropTime && deficit > 0 ? calcGrowsNeeded(deficit, plotCount) : null;
  const totalTime = grows && cropTime ? grows * cropTime.growMinutes : null;
  const seedsHave = cropTime && grows ? (inventory[`${item} Seeds`] ?? 0) : 0;
  const seedsToBuy = cropTime && grows ? Math.max(0, grows * plotCount - seedsHave) : 0;
  const honey = isHoney && deficit > 0 ? calcHoneyRuns(deficit) : null;
  const honeyRadishHave = honey ? (inventory['Radish'] ?? 0) : 0;
  const honeyGrows = honey ? calcGrowsNeeded(Math.max(0, honey.radishes - honeyRadishHave), plotCount) : 0;
  const cutlass = isCutlass && deficit > 0 ? calcCutlassRuns(deficit) : null;
  const cutlassStaffHave = cutlass ? (inventory['Tribal Staff'] ?? 0) : 0;
  const allLocs = itemLocations[item] ?? [];
  const fishingSources = allLocs.filter(l => l.type === 'fishing').map(l => l.name);
  const exploreSources = allLocs.filter(l => l.type === 'explore').map(l => l.name);
  return {
    item, quantity, have, deficit, pct, done,
    recipe, directIngredients, rawMaterials,
    isDirectCraftNow, isRawCraftNow, isCraftNow,
    cropTime, grows, totalTime, seedsHave, seedsToBuy,
    isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave,
    fishingSources, exploreSources,
  };
}

type ItemData = ReturnType<typeof getItemTierData>;

// ── Tier header ───────────────────────────────────────────────────────────────

function TierHeader({ label, hint, accent, icon }: { label: string; hint?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div
      className="px-5 py-1.5 flex items-center gap-2"
      style={{ background: `var(--accent-${accent}-bg)`, borderBottom: `1px solid var(--accent-${accent}-border)` }}
    >
      <span style={{ color: `var(--accent-${accent})`, display: 'flex' }}>{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: `var(--accent-${accent})` }}>{label}</span>
      {hint && <span className="text-[11px]" style={{ color: `var(--accent-${accent})`, opacity: 0.7 }}>{hint}</span>}
    </div>
  );
}

// ── Tier item row ─────────────────────────────────────────────────────────────

function TierItemRow({
  data, inventory, tier, openLoc, onToggleLoc, allNeededItems,
}: {
  data: ItemData;
  inventory: Record<string, number>;
  tier: 'directCraft' | 'rawCraft' | 'craftingQueue' | 'crop' | 'collecting' | 'temple' | 'fishing' | 'explore';
  openLoc: boolean;
  onToggleLoc: () => void;
  allNeededItems: string[];
}) {
  const { item, quantity, have, deficit, pct, recipe, directIngredients, rawMaterials,
    cropTime, grows, totalTime, seedsToBuy, seedsHave,
    isHoney, isCutlass, honey, honeyRadishHave, honeyGrows, cutlass, cutlassStaffHave } = data;
  const pctDisplay = Math.round(pct * 100);

  const progressColor =
    tier === 'directCraft' ? 'var(--accent-blue)' :
    tier === 'rawCraft' ? 'var(--accent-purple)' :
    tier === 'craftingQueue' ? 'var(--accent-yellow)' :
    tier === 'crop' ? 'var(--accent-green)' :
    tier === 'fishing' ? 'var(--accent-blue)' :
    tier === 'explore' ? 'var(--accent-purple)' :
    'var(--accent-orange)';

  const valueColor =
    tier === 'directCraft' ? 'var(--accent-blue)' :
    tier === 'rawCraft' ? 'var(--accent-purple)' :
    tier === 'craftingQueue' ? 'var(--accent-yellow)' :
    'var(--accent-orange)';

  const rawDiffersFromDirect = tier === 'craftingQueue' && rawMaterials && directIngredients &&
    ([...rawMaterials.keys()].some(k => !directIngredients.has(k)) ||
     [...directIngredients.keys()].some(k => !rawMaterials.has(k)));
  const missingRaw = rawDiffersFromDirect
    ? [...rawMaterials!.entries()].filter(([ri, rq]) => (inventory[ri] ?? 0) < rq)
    : [];

  return (
    <div className="px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>

            {/* Craft tier badge */}
            {(tier === 'directCraft' || tier === 'rawCraft') && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: tier === 'directCraft' ? 'var(--accent-blue-bg)' : 'var(--accent-purple-bg)',
                  color: tier === 'directCraft' ? 'var(--accent-blue)' : 'var(--accent-purple)',
                  border: `1px solid var(--accent-${tier === 'directCraft' ? 'blue' : 'purple'}-border)`,
                }}>
                <Hammer size={9} /> craft ×{deficit.toLocaleString()}
              </span>
            )}
            {tier === 'craftingQueue' && recipe && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                <Hammer size={9} /> crafted
              </span>
            )}
            {(isHoney || isCutlass) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                <Landmark size={9} /> temple
              </span>
            )}

            <button onClick={onToggleLoc} className="p-0.5 rounded transition-opacity hover:opacity-80"
              style={{ color: openLoc ? 'var(--accent-purple)' : 'var(--text-muted)' }} aria-label="Show locations">
              <MapPin size={11} />
            </button>
          </div>

          {/* Craft now — show all ingredients (all green) */}
          {tier === 'directCraft' && directIngredients && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {[...directIngredients.entries()].map(([ing, qty]) => {
                const haveIng = inventory[ing] ?? 0;
                return <span key={ing} className="text-xs" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>✓ {ing} {haveIng.toLocaleString()}/{qty.toLocaleString()}</span>;
              })}
            </div>
          )}

          {/* Craft with prep — show direct ingredients with arrows for need-to-craft, plus raw materials (all green) */}
          {tier === 'rawCraft' && (
            <>
              {directIngredients && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {[...directIngredients.entries()].map(([ing, qty]) => {
                    const haveIng = inventory[ing] ?? 0;
                    const ok = haveIng >= qty;
                    return <span key={ing} className="text-xs" style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-orange)', fontFamily: 'var(--font-mono)' }}>
                      {ok ? '✓' : '→'} {ing} {haveIng.toLocaleString()}/{qty.toLocaleString()}
                    </span>;
                  })}
                </div>
              )}
              {rawMaterials && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {[...rawMaterials.entries()].map(([ri, rq]) => {
                    const haveRaw = inventory[ri] ?? 0;
                    return <span key={ri} className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>✓ {ri} {haveRaw.toLocaleString()}/{rq.toLocaleString()}</span>;
                  })}
                </div>
              )}
            </>
          )}

          {/* Crafting queue — show ✓/✗ for each ingredient */}
          {tier === 'craftingQueue' && directIngredients && (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {[...directIngredients.entries()].map(([ing, qty]) => {
                  const haveIng = inventory[ing] ?? 0;
                  const ok = haveIng >= qty;
                  return <span key={ing} className="text-xs" style={{ color: ok ? 'var(--accent-green)' : 'var(--accent-orange)', fontFamily: 'var(--font-mono)' }}>
                    {ok ? '✓' : '✗'} {ing} {haveIng.toLocaleString()}/{qty.toLocaleString()}
                  </span>;
                })}
              </div>
              {missingRaw.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider w-full" style={{ color: 'var(--text-muted)' }}>collect:</span>
                  {missingRaw.map(([ri, rq]) => {
                    const haveRaw = inventory[ri] ?? 0;
                    return <span key={ri} className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ri} {haveRaw.toLocaleString()}/{rq.toLocaleString()}</span>;
                  })}
                </div>
              )}
            </>
          )}

          {/* Grow crops */}
          {tier === 'crop' && cropTime && grows && totalTime && (
            <>
              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-green)' }}>
                <Clock size={10} />
                {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(totalTime)} · done {formatDoneBy(totalTime)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {seedsToBuy > 0
                  ? `buy ${seedsToBuy} seed${seedsToBuy !== 1 ? 's' : ''}${seedsHave > 0 ? ` (have ${seedsHave})` : ''}`
                  : `seeds stocked${seedsHave > 0 ? ` (have ${seedsHave})` : ''}`}
              </p>
            </>
          )}

          {/* Fishing locations */}
          {tier === 'fishing' && data.fishingSources.length > 0 && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
              <Fish size={10} />
              {data.fishingSources.join(' · ')}
            </p>
          )}

          {/* Explore locations */}
          {tier === 'explore' && data.exploreSources.length > 0 && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-purple)' }}>
              <Compass size={10} />
              {data.exploreSources.join(' · ')}
            </p>
          )}

          {/* Temple items */}
          {isHoney && honey && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-yellow)' }}>
              <Landmark size={10} />
              {honey.runs} run{honey.runs !== 1 ? 's' : ''} · {honey.radishes.toLocaleString()} radishes
              {honeyGrows > 0 ? ` · ${honeyGrows} grow${honeyGrows !== 1 ? 's' : ''} (have ${honeyRadishHave.toLocaleString()})` : ' · radishes stocked'}
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
        </div>

        <span className="text-sm font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: valueColor }}>
          {have.toLocaleString()}/{quantity.toLocaleString()}
        </span>
      </div>

      {/* Progress bar */}
      {tier !== 'directCraft' && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pctDisplay}%`, background: progressColor }} />
        </div>
      )}

      {openLoc && (
        <div className="mt-2">
          <ItemLocationPanel item={item} allNeededItems={allNeededItems} />
        </div>
      )}
    </div>
  );
}

// ── Aggregate summary panel ───────────────────────────────────────────────────

function SummaryPanel({
  questsWithStatus, inventory, cropTimes, plotCount, allNeededItems,
}: {
  questsWithStatus: { quest: Quest; status: string }[];
  inventory: Record<string, number>;
  cropTimes: { item: string; growMinutes: number }[];
  plotCount: number;
  allNeededItems: string[];
}) {
  const [openLocations, setOpenLocations] = useState<Set<string>>(new Set());
  const toggleLoc = (item: string) => setOpenLocations(prev => {
    const next = new Set(prev);
    if (next.has(item)) next.delete(item); else next.add(item);
    return next;
  });

  const tiers = useMemo(() => {
    const itemMap = new Map<string, number>();
    questsWithStatus
      .filter(({ status }) => status !== 'completed')
      .forEach(({ quest }) => {
        parseItems(quest.itemsRequired).forEach(({ item, quantity }) => {
          itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
        });
      });
    const all = [...itemMap.entries()].map(([item, quantity]) =>
      getItemTierData(item, quantity, inventory, cropTimes, plotCount)
    );
    return {
      done:         all.filter(i => i.done),
      directCraft:  all.filter(i => !i.done && i.isDirectCraftNow),
      rawCraft:     all.filter(i => !i.done && i.isRawCraftNow),
      craftingQueue:all.filter(i => !i.done && !i.isCraftNow && i.recipe && !i.isHoney && !i.isCutlass),
      crops:        all.filter(i => !i.done && !i.isCraftNow && !i.recipe && i.cropTime && !i.isHoney && !i.isCutlass),
      collecting:   all.filter(i => !i.done && !i.isCraftNow && !i.recipe && !i.cropTime),
    };
  }, [questsWithStatus, inventory, cropTimes, plotCount]);

  const totalNeeded = tiers.directCraft.length + tiers.rawCraft.length + tiers.craftingQueue.length + tiers.crops.length + tiers.collecting.length;

  if (totalNeeded === 0 && tiers.done.length > 0) {
    return (
      <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>All Tower items stocked!</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      {tiers.directCraft.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <TierHeader label="Craft now" hint="— ingredients ready" accent="blue" icon={<Hammer size={11} />} />
          {tiers.directCraft.map(d => (
            <TierItemRow key={d.item} data={d} inventory={inventory} tier="directCraft"
              openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLoc(d.item)}
              allNeededItems={allNeededItems} />
          ))}
        </div>
      )}
      {tiers.rawCraft.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <TierHeader label="Craft with prep" hint="— base materials ready" accent="purple" icon={<Hammer size={11} />} />
          {tiers.rawCraft.map(d => (
            <TierItemRow key={d.item} data={d} inventory={inventory} tier="rawCraft"
              openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLoc(d.item)}
              allNeededItems={allNeededItems} />
          ))}
        </div>
      )}
      {tiers.craftingQueue.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <TierHeader label="Crafting queue" hint="— collecting ingredients" accent="yellow" icon={<Hammer size={11} />} />
          {tiers.craftingQueue.map(d => (
            <TierItemRow key={d.item} data={d} inventory={inventory} tier="craftingQueue"
              openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLoc(d.item)}
              allNeededItems={allNeededItems} />
          ))}
        </div>
      )}
      {tiers.crops.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <TierHeader label="Grow crops" accent="green" icon={<Sprout size={11} />} />
          {tiers.crops.map(d => (
            <TierItemRow key={d.item} data={d} inventory={inventory} tier="crop"
              openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLoc(d.item)}
              allNeededItems={allNeededItems} />
          ))}
        </div>
      )}
      {tiers.collecting.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <TierHeader label="Still collecting" accent="orange" icon={<span style={{ fontSize: 11 }}>⚔</span>} />
          {tiers.collecting.map(d => (
            <TierItemRow key={d.item} data={d} inventory={inventory}
              tier={d.isHoney || d.isCutlass ? 'temple' : 'collecting'}
              openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLoc(d.item)}
              allNeededItems={allNeededItems} />
          ))}
        </div>
      )}
      {tiers.done.length > 0 && (
        <div className="px-5 py-2.5 flex flex-wrap gap-x-4 gap-y-0.5"
          style={{ background: 'var(--accent-green-bg)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider w-full" style={{ color: 'var(--accent-green)', opacity: 0.7 }}>stocked</span>
          {tiers.done.map(({ item, quantity }) => (
            <span key={item} className="text-xs" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
              ✓ {item} ×{quantity.toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Gathering panel ───────────────────────────────────────────────────────────

function GatheringPanel({
  questsWithStatus, inventory, allNeededItems,
}: {
  questsWithStatus: { quest: Quest; status: string }[];
  inventory: Record<string, number>;
  allNeededItems: string[];
}) {
  const [openLocations, setOpenLocations] = useState<Set<string>>(new Set());
  const toggleLoc = (item: string) => setOpenLocations(prev => {
    const next = new Set(prev);
    if (next.has(item)) next.delete(item); else next.add(item);
    return next;
  });

  const { fishing, explore } = useMemo(() => {
    const itemMap = new Map<string, number>();
    questsWithStatus
      .filter(({ status }) => status !== 'completed')
      .forEach(({ quest }) => {
        parseItems(quest.itemsRequired).forEach(({ item, quantity }) => {
          itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
        });
      });

    const fishing: { item: string; quantity: number; have: number; sources: string[] }[] = [];
    const explore: { item: string; quantity: number; have: number; sources: string[] }[] = [];

    for (const [item, quantity] of itemMap) {
      const have = inventory[item] ?? 0;
      if (have >= quantity) continue;
      const locs = itemLocations[item] ?? [];
      const fishingSources = locs.filter(l => l.type === 'fishing').map(l => l.name);
      const exploreSources = locs.filter(l => l.type === 'explore').map(l => l.name);
      if (fishingSources.length > 0) {
        fishing.push({ item, quantity, have, sources: fishingSources });
      } else if (exploreSources.length > 0) {
        explore.push({ item, quantity, have, sources: exploreSources });
      }
    }

    fishing.sort((a, b) => a.item.localeCompare(b.item));
    explore.sort((a, b) => a.item.localeCompare(b.item));
    return { fishing, explore };
  }, [questsWithStatus, inventory]);

  if (fishing.length === 0 && explore.length === 0) {
    return (
      <div className="rounded-xl px-5 py-8 text-center" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <CheckCircle2 size={24} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>All fishing & explore items stocked!</p>
      </div>
    );
  }

  const GatherRow = ({ item, quantity, have, sources, accent }: {
    item: string; quantity: number; have: number; sources: string[]; accent: string;
  }) => (
    <div className="px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
            <button onClick={() => toggleLoc(item)} className="p-0.5 rounded"
              style={{ color: openLocations.has(item) ? 'var(--accent-purple)' : 'var(--text-muted)' }}
              aria-label="Show locations">
              <MapPin size={11} />
            </button>
          </div>
          <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: `var(--accent-${accent})` }}>
            {accent === 'blue' ? <Fish size={10} /> : <Compass size={10} />}
            {sources.join(' · ')}
          </p>
        </div>
        <span className="text-sm font-semibold flex-shrink-0"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
          {have.toLocaleString()}/{quantity.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, have / quantity) * 100)}%`, background: `var(--accent-${accent})` }} />
      </div>
      {openLocations.has(item) && (
        <div className="mt-2">
          <ItemLocationPanel item={item} allNeededItems={allNeededItems} />
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      {fishing.length > 0 && (
        <div style={explore.length > 0 ? { borderBottom: '1px solid var(--border-subtle)' } : {}}>
          <TierHeader label="Go fishing" accent="blue" icon={<Fish size={11} />} />
          {fishing.map(d => <GatherRow key={d.item} {...d} accent="blue" />)}
        </div>
      )}
      {explore.length > 0 && (
        <div>
          <TierHeader label="Explore" accent="purple" icon={<Compass size={11} />} />
          {explore.map(d => <GatherRow key={d.item} {...d} accent="purple" />)}
        </div>
      )}
    </div>
  );
}

// ── Quest section ─────────────────────────────────────────────────────────────

function QuestSection({
  quest, status, inventory, plotCount, cropTimes, allNeededItems, setQuestStatus,
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
  const [openLocations, setOpenLocations] = useState<Set<string>>(new Set());

  const toggleLocation = (item: string) => {
    setOpenLocations(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      return next;
    });
  };

  const items = useMemo(() => parseItems(quest.itemsRequired), [quest.itemsRequired]);

  const { tiers, canComplete, stockedCount } = useMemo(() => {
    const all = items.map(({ item, quantity }) =>
      getItemTierData(item, quantity, inventory, cropTimes, plotCount)
    );
    const done = all.filter(i => i.done);
    const directCraft = all.filter(i => !i.done && i.isDirectCraftNow);
    const rawCraft = all.filter(i => !i.done && i.isRawCraftNow);
    const craftingQueue = all.filter(i => !i.done && !i.isCraftNow && i.recipe && !i.isHoney && !i.isCutlass);
    const crops = all.filter(i => !i.done && !i.isCraftNow && !i.recipe && i.cropTime && !i.isHoney && !i.isCutlass);
    const collecting = all.filter(i => !i.done && !i.isCraftNow && !i.recipe && !i.cropTime);
    return {
      tiers: { done, directCraft, rawCraft, craftingQueue, crops, collecting },
      canComplete: done.length === all.length && all.length > 0,
      stockedCount: done.length,
    };
  }, [items, inventory, cropTimes, plotCount]);

  const statusStyle: Record<string, { color: string; label: string }> = {
    active:    { color: 'var(--accent-orange)', label: 'In Progress' },
    completed: { color: 'var(--accent-green)',  label: 'Complete' },
    available: { color: 'var(--accent-yellow)', label: 'Available' },
    locked:    { color: 'var(--text-muted)',    label: 'Locked' },
  };
  const { color: statusColor, label: statusLabel } = statusStyle[status] ?? { color: 'var(--accent-purple)', label: 'Upcoming' };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      {/* Accordion header */}
      <button
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-700/10"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {status === 'completed' ? (
            <CheckCircle2 size={15} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          ) : status === 'locked' ? (
            <Lock size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              {quest.name}
            </p>
            {items.length > 0 && (
              <p className="text-xs" style={{ color: canComplete ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                {canComplete ? '✓ all items ready' : `${stockedCount}/${items.length} items ready`}
                {tiers.directCraft.length > 0 && ` · ${tiers.directCraft.length} craft now`}
                {tiers.rawCraft.length > 0 && ` · ${tiers.rawCraft.length} craft with prep`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[11px] font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>
      </button>

      {/* Accordion body */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {items.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No items required — talk to the NPC to complete this quest.
            </p>
          ) : (
            <>
              {/* Turn in now banner */}
              {canComplete && (
                <div className="px-5 py-2 flex items-center gap-2"
                  style={{ background: 'var(--accent-green-bg)', borderBottom: '1px solid var(--accent-green-border)' }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--accent-green)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>
                    All items stocked — ready to turn in!
                  </span>
                </div>
              )}

              {/* Craft now (blue) */}
              {tiers.directCraft.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <TierHeader label="Craft now" hint="— ingredients ready" accent="blue" icon={<Hammer size={11} />} />
                  {tiers.directCraft.map(d => (
                    <TierItemRow key={d.item} data={d} inventory={inventory} tier="directCraft"
                      openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLocation(d.item)}
                      allNeededItems={allNeededItems} />
                  ))}
                </div>
              )}

              {/* Craft with prep (purple) */}
              {tiers.rawCraft.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <TierHeader label="Craft with prep" hint="— base materials ready" accent="purple" icon={<Hammer size={11} />} />
                  {tiers.rawCraft.map(d => (
                    <TierItemRow key={d.item} data={d} inventory={inventory} tier="rawCraft"
                      openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLocation(d.item)}
                      allNeededItems={allNeededItems} />
                  ))}
                </div>
              )}

              {/* Crafting queue (yellow) */}
              {tiers.craftingQueue.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <TierHeader label="Crafting queue" hint="— collecting ingredients" accent="yellow" icon={<Hammer size={11} />} />
                  {tiers.craftingQueue.map(d => (
                    <TierItemRow key={d.item} data={d} inventory={inventory} tier="craftingQueue"
                      openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLocation(d.item)}
                      allNeededItems={allNeededItems} />
                  ))}
                </div>
              )}

              {/* Grow crops (green) */}
              {tiers.crops.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <TierHeader label="Grow crops" accent="green" icon={<Sprout size={11} />} />
                  {tiers.crops.map(d => (
                    <TierItemRow key={d.item} data={d} inventory={inventory} tier="crop"
                      openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLocation(d.item)}
                      allNeededItems={allNeededItems} />
                  ))}
                </div>
              )}

              {/* Still collecting (orange — temple + other) */}
              {tiers.collecting.length > 0 && (
                <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <TierHeader label="Still collecting" accent="orange" icon={<span style={{ fontSize: 11 }}>⚔</span>} />
                  {tiers.collecting.map(d => (
                    <TierItemRow key={d.item} data={d} inventory={inventory}
                      tier={d.isHoney || d.isCutlass ? 'temple' : 'collecting'}
                      openLoc={openLocations.has(d.item)} onToggleLoc={() => toggleLocation(d.item)}
                      allNeededItems={allNeededItems} />
                  ))}
                </div>
              )}

              {/* Stocked items — compact strip */}
              {tiers.done.length > 0 && (
                <div className="px-5 py-2.5 flex flex-wrap gap-x-4 gap-y-0.5"
                  style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--accent-green-bg)' }}>
                  {tiers.done.map(({ item, quantity }) => (
                    <span key={item} className="text-xs" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                      ✓ {item} ×{quantity.toLocaleString()}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {(status === 'active' || status === 'available') && (
            <div className="px-5 py-3">
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

// ── Page ──────────────────────────────────────────────────────────────────────

type TowerSubTab = 'summary' | 'quests' | 'gathering';

export function ToweringInvestmentPage() {
  const { inventory, cropTimes, plotCount, player, questStatuses, setQuestStatus } = useStore();
  const [filter, setFilter] = useState<QuestFilter>('incomplete');
  const [towerSubTab, setTowerSubTab] = useState<TowerSubTab>('summary');

  const quests = useMemo(
    () =>
      allQuestsData
        .filter(q => q.questline === QUESTLINE)
        .sort((a, b) => compareQuests(a.name, b.name)),
    []
  );

  const questsWithStatus = useMemo(
    () => quests.map(q => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [quests, player, questStatuses]
  );

  const completedCount = questsWithStatus.filter(({ status }) => status === 'completed').length;
  const activeCount    = questsWithStatus.filter(({ status }) => status === 'active').length;
  const upcomingCount  = questsWithStatus.filter(({ status }) => status !== 'completed' && status !== 'active').length;
  const incompleteCount = activeCount + upcomingCount;
  const progress = Math.round((completedCount / quests.length) * 100);

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
    return questsWithStatus.filter(({ status }) => status !== 'completed');
  }, [questsWithStatus, filter]);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl p-5" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={18} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
              <h2 className="text-xl font-bold truncate" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {QUESTLINE}
              </h2>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {completedCount} of {quests.length} quests completed
            </p>
          </div>
          <span className="text-2xl font-bold flex-shrink-0"
            style={{ fontFamily: 'var(--font-mono)', color: progress === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
            {progress}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: progress === 100 ? 'var(--accent-green)' : 'var(--accent-yellow)' }} />
        </div>
      </div>

      {/* Sub-tabs: Summary / Quests */}
      <div className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
        {([
          { id: 'summary',   label: 'Summary' },
          { id: 'quests',    label: 'Quests' },
          { id: 'gathering', label: 'Fishing & Explore' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setTowerSubTab(id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={
              towerSubTab === id
                ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary sub-tab — aggregate resource view */}
      {towerSubTab === 'summary' && (
        <SummaryPanel
          questsWithStatus={questsWithStatus}
          inventory={inventory}
          cropTimes={cropTimes}
          plotCount={plotCount}
          allNeededItems={allNeededItems}
        />
      )}

      {/* Gathering sub-tab — fishing & explore items */}
      {towerSubTab === 'gathering' && (
        <GatheringPanel
          questsWithStatus={questsWithStatus}
          inventory={inventory}
          allNeededItems={allNeededItems}
        />
      )}

      {/* Quests sub-tab — filter pills + accordions */}
      {towerSubTab === 'quests' && (
        <>
          {/* Filter pills */}
          <div className="flex gap-1 p-1 rounded-lg"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
            {([
              { id: 'incomplete', label: `In Progress (${incompleteCount})` },
              { id: 'active',     label: `Active (${activeCount})` },
              { id: 'upcoming',   label: `Upcoming (${upcomingCount})` },
              { id: 'completed',  label: `Done (${completedCount})` },
            ] as const).map(({ id, label }) => (
              <button key={id} onClick={() => setFilter(id)}
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
        </>
      )}
    </div>
  );
}
