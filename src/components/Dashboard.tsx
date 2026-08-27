import { useMemo } from 'react';
import { CheckCircle2, Hammer, Sprout, Zap, Clock, ChefHat, Gift, Fish, Users } from 'lucide-react';
import { useStore } from '../store';
import { parseItems, calcGrowsNeeded, formatDuration, calcHoneyRuns, calcCutlassRuns } from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';
import questsData from '../data/quests.json';
import { RARE_ITEMS, PET_ONLY_ITEMS, findTowerLevel } from '../data/bottlenecks';
import { BottleneckPanel } from './BottleneckPanel';
import type { BottleneckEntry } from './BottleneckPanel';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const allRecipes = recipesData as Recipe[];
const recipeByName = new Map<string, Recipe>(allRecipes.map(r => [r.name.toLowerCase(), r]));
const allQuestsData = questsData as Quest[];

// Gold fish items catchable only via manual fishing with mealworms, mapped to their fishing location
const GOLD_FISH = new Map<string, string>([
  ['Gold Drum',     'Small Pond'],
  ['Gold Trout',    'Farm Pond'],
  ['Gold Sea Bass', 'Small Island'],
  ['Gold Catfish',  'Crystal River'],
  ['Gold Flier',    'Lake Tempest'],
  ['Gold Sea Crest','Glacier Lake'],
  ['Gold Jelly',    "Pirate's Cove"],
  ['Gold Coral',    'Large Island'],
  ['Gold Boot',     'Large Island'],
]);

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

export function Dashboard({ activeQuests, nextUpQuests }: Props) {
  const { inventory, cropTimes, plotCount, inventoryMax, craftingRecipes, player, questStatuses, towerLevel } = useStore();

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>(recipeByName);
    Object.entries(craftingRecipes).forEach(([item, ings]) => {
      map.set(item.toLowerCase(), { id: 'custom', name: item, ingredients: ings });
    });
    return map;
  }, [craftingRecipes]);

  const { readyToTurnIn, craftNowItems, cropItems, bottlenecks, goldFishNeeds } = useMemo(() => {
    const allQ = [...activeQuests, ...nextUpQuests];

    // Aggregate item needs across active quests
    const itemMap = new Map<string, number>();
    for (const q of activeQuests) {
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      }
    }

    const readyToTurnIn = activeQuests.filter(q =>
      parseItems(q.itemsRequired).every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity)
    );

    // Craft now: all direct ingredients in inventory, deficit ≤ inventoryMax
    const craftNowItems: { item: string; deficit: number; totalNeeded: number }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      if (totalNeeded > inventoryMax) continue; // can't hold this many
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const recipe = recipeMap.get(item.toLowerCase());
      if (!recipe) continue;
      const directIngs = new Map(recipe.ingredients.map(({ item: ing, quantity: qty }) => [ing, qty * deficit]));
      if ([...directIngs.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty)) {
        craftNowItems.push({ item, deficit, totalNeeded });
      }
    }

    // Crop grows needed — active quests + immediate next-up quest per questline
    const nextupItemMap = new Map<string, number>();
    for (const q of nextUpQuests) {
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        nextupItemMap.set(item, (nextupItemMap.get(item) ?? 0) + quantity);
      }
    }
    const cropItems: { item: string; have: number; totalNeeded: number; grows: number; growMinutes: number; totalMinutes: number; priority: 'active' | 'nextup' }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      if (totalNeeded > inventoryMax) continue;
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
      if (crop) {
        const grows = calcGrowsNeeded(deficit, plotCount);
        cropItems.push({ item, have, totalNeeded, grows, growMinutes: crop.growMinutes, totalMinutes: grows * crop.growMinutes, priority: 'active' });
      }
    }
    const activeItemKeys = new Set(cropItems.map(c => c.item.toLowerCase()));
    for (const [item, totalNeeded] of nextupItemMap.entries()) {
      if (activeItemKeys.has(item.toLowerCase())) continue;
      if (totalNeeded > inventoryMax) continue;
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
      if (crop) {
        const grows = calcGrowsNeeded(deficit, plotCount);
        cropItems.push({ item, have, totalNeeded, grows, growMinutes: crop.growMinutes, totalMinutes: grows * crop.growMinutes, priority: 'nextup' });
      }
    }

    // Bottleneck items — curated rare items + pet-only drops
    const bottleneckMap = new Map<string, { activeCount: number; nextupCount: number; have: number; need: number; location: string; towerLv?: { level: number; levelsAway: number } }>();
    for (const q of allQ) {
      const isNextUp = !activeQuests.includes(q);
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        const have = inventory[item] ?? 0;
        if (have >= quantity) continue;
        const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
        if (crop) continue;
        let location: string | undefined;
        if (RARE_ITEMS.has(item)) {
          location = RARE_ITEMS.get(item)!;
        } else if (PET_ONLY_ITEMS.has(item)) {
          location = 'Pet drops';
        } else {
          continue;
        }
        const existing = bottleneckMap.get(item) ?? { activeCount: 0, nextupCount: 0, have, need: 0, location, towerLv: findTowerLevel(item, towerLevel) };
        if (isNextUp) existing.nextupCount++;
        else existing.activeCount++;
        existing.need = Math.max(existing.need, quantity);
        bottleneckMap.set(item, existing);
      }
    }
    // Add honey/cutlass temple as special bottleneck entries
    for (const [templeItem, location, calcRuns] of [
      ['Honey', 'Honey Temple', calcHoneyRuns] as const,
      ['Cutlass', 'Cutlass Temple', calcCutlassRuns] as const,
    ]) {
      let activeCount = 0, nextupCount = 0, totalNeed = 0;
      for (const q of allQ) {
        const isNextUp = !activeQuests.includes(q);
        for (const { item, quantity } of parseItems(q.itemsRequired)) {
          if (item !== templeItem) continue;
          const have = inventory[item] ?? 0;
          if (have >= quantity) continue;
          totalNeed = Math.max(totalNeed, quantity);
          if (isNextUp) nextupCount++; else activeCount++;
        }
      }
      if (activeCount > 0 || nextupCount > 0) {
        const have = inventory[templeItem] ?? 0;
        const deficit = Math.max(0, totalNeed - have);
        const { runs } = calcRuns(deficit);
        bottleneckMap.set(templeItem, { activeCount, nextupCount, have, need: totalNeed, location: `${location} · ${runs} run${runs !== 1 ? 's' : ''}` });
      }
    }

    const bottlenecks: BottleneckEntry[] = [...bottleneckMap.entries()]
      .map(([item, { activeCount, nextupCount, have, need, location, towerLv }]) => ({ item, activeCount, nextupCount, have, need, location, towerLv }))
      .sort((a, b) => (b.activeCount ?? 0) - (a.activeCount ?? 0) || (b.nextupCount ?? 0) - (a.nextupCount ?? 0))
      .slice(0, 10);

    // Gold fish needed for active/next-up quests
    const goldFishMap = new Map<string, { have: number; need: number; location: string }>();
    for (const q of allQ) {
      for (const { item, quantity } of parseItems(q.itemsRequired)) {
        if (!GOLD_FISH.has(item)) continue;
        const have = inventory[item] ?? 0;
        if (have >= quantity) continue;
        const existing = goldFishMap.get(item);
        if (!existing) {
          goldFishMap.set(item, { have, need: quantity, location: GOLD_FISH.get(item)! });
        } else {
          existing.need = Math.max(existing.need, quantity);
        }
      }
    }
    const goldFishNeeds = [...goldFishMap.entries()]
      .map(([item, { have, need, location }]) => ({ item, have, need, location }))
      .sort((a, b) => a.item.localeCompare(b.item));

    return { readyToTurnIn, craftNowItems, cropItems, bottlenecks, goldFishNeeds };
  }, [activeQuests, nextUpQuests, inventory, cropTimes, plotCount, inventoryMax, recipeMap, towerLevel]);

  const hasDoNow = readyToTurnIn.length > 0 || craftNowItems.length > 0;

  const COOKING_UNLOCKS = [
    {
      recipe: 'Mushroom Stew',
      npc: 'Holger',
      npcLvRequired: 40,
      cookingLvRequired: 20,
      lovedItems: ['Wooden Table', 'Gold Trout', 'Mug of Beer', 'Potato'],
    },
    {
      recipe: 'Breakfast Boost',
      npc: 'Lorn',
      npcLvRequired: 40,
      cookingLvRequired: 40,
      lovedItems: ['Glass Orb', 'Milk', 'Gold Peas', 'Small Prawn', 'Shrimp'],
    },
    {
      recipe: 'Hickory Omelette',
      npc: 'Mariya',
      npcLvRequired: 40,
      cookingLvRequired: 35,
      lovedItems: ['Tomato', 'Shrimp-a-Plenty', 'Onion Soup', 'Over The Moon', 'Quandary Chowder', "Cat's Meow", 'Sea Pincher Special', 'Leather Diary', 'Mushroom Stew'],
    },
    {
      recipe: 'Quandary Chowder',
      npc: 'Jill',
      npcLvRequired: 50,
      cookingLvRequired: 25,
      lovedItems: ['Yellow Perch', 'Mushroom Paste', 'MIAB', 'Corn', 'Leather', 'Corn Husk Doll', 'Peach'],
    },
  ];

  const cookingHints = useMemo(() => {
    return COOKING_UNLOCKS.flatMap((unlock) => {
      const npcLv = player.npcLevels[unlock.npc] ?? 0;
      const cookingLv = player.cookingLv ?? 0;
      const npcMet = npcLv >= unlock.npcLvRequired;
      const cookingMet = cookingLv >= unlock.cookingLvRequired;
      if (npcMet && cookingMet) return [];
      const lovedItemStats = unlock.lovedItems.map((item) => {
        const have = inventory[item] ?? 0;
        const pct = inventoryMax > 0 ? have / inventoryMax : 0;
        return { item, have, atMax: have >= inventoryMax, nearMax: pct >= 0.9 };
      });
      return [{ ...unlock, npcLv, cookingLv, npcMet, cookingMet, lovedItemStats }];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, inventory, inventoryMax]);

  const HELP_REQUEST_NPCS = [
    { npc: 'Buddy',          nextHelpLv: 90, lovedItems: ['Pirate Bandana', 'Valentines Card', 'Buddy Doll', 'Purple Flower', 'Pirate Flag', 'Buddystone'] },
    { npc: 'Captain Thomas', nextHelpLv: 20, lovedItems: ['Fishing Net', 'Gold Catfish', 'Large Net', 'Gold Drum', 'Gold Trout', 'Slobster'] },
    { npc: 'Geist',          nextHelpLv: 25, lovedItems: ['Gold Catfish', 'Shrimp-a-Plenty', 'Sea Pincher Special', 'Goldgill'] },
    { npc: 'ROOMBA',         nextHelpLv: 40, lovedItems: ['Cogwheel', 'Carbon Sphere', 'Scrap Metal'] },
    { npc: 'Lorn',           nextHelpLv: 60, lovedItems: ['Glass Orb', 'Milk', 'Gold Peas', 'Small Prawn', 'Shrimp'] },
    { npc: 'George',         nextHelpLv: 70, lovedItems: ['Hide', 'Spider', 'Apple Cider', 'Mug of Beer', 'Carbon Sphere'] },
    { npc: 'Jill',           nextHelpLv: 96, lovedItems: ['Yellow Perch', 'Mushroom Paste', 'MIAB', 'Corn', 'Leather', 'Corn Husk Doll', 'Peach'] },
    { npc: 'Gary Bearson V', nextHelpLv: 80, lovedItems: ['Yarn', 'Gold Trout', 'You Rock Card', 'Apple Cider'] },
    { npc: 'Goostav',        nextHelpLv: 80, lovedItems: ['Slime Egg Shell', 'Glowshroom', 'Swamp Gourd', 'Mini Slime Squid', 'Gold Slimeback'] },
    { npc: 'Rosalie',        nextHelpLv: 50, lovedItems: [] },
    { npc: 'Thomas',         nextHelpLv: 40, lovedItems: [] },
    { npc: 'Vincent',        nextHelpLv: 30, lovedItems: [] },
    { npc: 'Borgen',         nextHelpLv: 60, lovedItems: [] },
    { npc: 'Ric Ryph',       nextHelpLv: 30, lovedItems: [] },
    { npc: 'Mummy',          nextHelpLv: 30, lovedItems: [] },
    { npc: 'Star Meerif',    nextHelpLv: 30, lovedItems: [] },
    { npc: 'frank',          nextHelpLv: 40, lovedItems: [] },
    { npc: 'Mariya',         nextHelpLv: 50, lovedItems: [] },
    { npc: 'Baba Gec',       nextHelpLv: 30, lovedItems: [] },
    { npc: 'Cid',            nextHelpLv: 30, lovedItems: [] },
  ];

  const helpRequestHints = useMemo(() => {
    return HELP_REQUEST_NPCS
      .map((entry) => {
        const npcLv = player.npcLevels[entry.npc] ?? 0;
        const met = npcLv >= entry.nextHelpLv;
        const lovedItemStats = entry.lovedItems.map((item) => {
          const have = inventory[item] ?? 0;
          const pct = inventoryMax > 0 ? have / inventoryMax : 0;
          return { item, have, atMax: have >= inventoryMax, nearMax: pct >= 0.9 };
        });
        return { ...entry, npcLv, met, lovedItemStats, gap: entry.nextHelpLv - npcLv };
      })
      .filter(({ met }) => !met)
      .sort((a, b) => a.gap - b.gap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, inventory, inventoryMax]);

  const craftingCrops = useMemo(() => {
    const activeQuestIds = new Set(activeQuests.map(q => q.id));
    const nextUpQuestIds = new Set(nextUpQuests.map(q => q.id));
    const activeQuestlineNames = new Set(
      activeQuests.map(q => q.questline).filter((ql): ql is string => !!ql)
    );

    const questlineQuests = allQuestsData.filter(
      q => q.questline && activeQuestlineNames.has(q.questline) && questStatuses[q.id] !== 'completed'
    );

    const priorityOrder = { active: 0, nextup: 1, other: 2 } as const;
    const agg = new Map<string, { totalNeeded: number; priority: 'active' | 'nextup' | 'other' }>();

    for (const quest of questlineQuests) {
      const tier: 'active' | 'nextup' | 'other' = activeQuestIds.has(quest.id) ? 'active'
        : nextUpQuestIds.has(quest.id) ? 'nextup'
        : 'other';

      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        if (cropTimes.some(c => c.item.toLowerCase() === item.toLowerCase())) continue;
        const recipe = recipeMap.get(item.toLowerCase());
        if (!recipe) continue;
        for (const { item: ing, quantity: ingQty } of recipe.ingredients) {
          if (!cropTimes.some(c => c.item.toLowerCase() === ing.toLowerCase())) continue;
          const existing = agg.get(ing);
          const newPriority = !existing || priorityOrder[tier] < priorityOrder[existing.priority] ? tier : existing.priority;
          agg.set(ing, { totalNeeded: (existing?.totalNeeded ?? 0) + ingQty * quantity, priority: newPriority });
        }
      }
    }

    return [...agg.entries()]
      .flatMap(([item, { totalNeeded, priority }]) => {
        const have = inventory[item] ?? 0;
        const deficit = totalNeeded - have;
        if (deficit <= 0) return [];
        const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase())!;
        const grows = calcGrowsNeeded(deficit, plotCount);
        return [{ item, have, totalNeeded, grows, growMinutes: crop.growMinutes, totalMinutes: grows * crop.growMinutes, priority }];
      })
      .sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority];
        return a.totalMinutes - b.totalMinutes;
      });
  }, [activeQuests, nextUpQuests, questStatuses, inventory, cropTimes, plotCount, recipeMap]);

  return (
    <div className="space-y-4">
      {/* Do right now */}
      {hasDoNow && (
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
                <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{q.npc}</span>
              </div>
            ))}
            {craftNowItems.map(({ item, deficit, totalNeeded }) => {
              const have = inventory[item] ?? 0;
              return (
                <div key={item} className="px-4 py-2.5 flex items-center gap-2">
                  <Hammer size={12} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Craft: {item}</span>
                  <span className="text-xs ml-auto flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
                    ×{deficit} needed · {have}/{totalNeeded}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bottleneck items */}
        <BottleneckPanel entries={bottlenecks} hint="— no easy source" />

        {/* Crops to grow */}
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
              {cropItems.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority === 'active' ? -1 : 1;
                return a.totalMinutes - b.totalMinutes;
              }).map(({ item, have, totalNeeded, grows, growMinutes, totalMinutes, priority }) => {
                const finishAt = new Date(Date.now() + totalMinutes * 60 * 1000);
                const finishStr = finishAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const isToday = finishAt.toDateString() === new Date().toDateString();
                const doneLabel = isToday ? `done by ${finishStr}` : `done in ${formatDuration(totalMinutes)}`;
                return (
                  <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                          {priority === 'nextup' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                              next up
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          have {have} / need {totalNeeded}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(growMinutes)}/cycle
                      </div>
                      <div className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>{doneLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Crops for crafting */}
        {craftingCrops.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-blue-bg)', borderBottom: '1px solid var(--accent-blue-border)' }}>
              <Hammer size={13} style={{ color: 'var(--accent-blue)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-blue)' }}>Crops for crafting</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {craftingCrops.map(({ item, have, totalNeeded, grows, growMinutes, totalMinutes, priority }) => {
                const finishAt = new Date(Date.now() + totalMinutes * 60 * 1000);
                const finishStr = finishAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const isToday = finishAt.toDateString() === new Date().toDateString();
                const doneLabel = isToday ? `done by ${finishStr}` : `done in ${formatDuration(totalMinutes)}`;
                return (
                  <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
                          {priority === 'nextup' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                              next up
                            </span>
                          )}
                          {priority === 'other' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                              upcoming
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          have {have} / need {totalNeeded}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {grows} grow{grows !== 1 ? 's' : ''} · {formatDuration(growMinutes)}/cycle
                      </div>
                      <div className="text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>{doneLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Gold fish — Use your mealworms here */}
      {goldFishNeeds.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-blue-border)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-blue-bg)', borderBottom: '1px solid var(--accent-blue-border)' }}>
            <Fish size={13} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-blue)' }}>Use your mealworms here</span>
            <span className="text-xs ml-1" style={{ color: 'var(--accent-blue)', opacity: 0.7 }}>— manual fishing only</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {goldFishNeeds.map(({ item, have, need, location }) => {
              const pct = Math.min(have / need, 1);
              const done = have >= need;
              return (
                <div key={item} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-medium" style={{ color: done ? 'var(--accent-green)' : 'var(--text-primary)' }}>{item}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{location}</span>
                      <span className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                        {have}/{need}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: done ? 'var(--accent-green)' : 'var(--accent-blue)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Next help requests */}
      {helpRequestHints.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-yellow-border)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-yellow-bg)', borderBottom: '1px solid var(--accent-yellow-border)' }}>
            <Users size={13} style={{ color: 'var(--accent-yellow)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-yellow)' }}>Next help requests</span>
            <span className="text-xs ml-1" style={{ color: 'var(--accent-yellow)', opacity: 0.7 }}>— gift loved items to unlock new quests</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {helpRequestHints.map(({ npc, nextHelpLv, npcLv, gap, lovedItemStats }) => (
              <div key={npc} className="px-4 py-3">
                <div className="mb-2.5">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{npc}</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{
                        background: gap <= 5 ? 'var(--accent-green-bg)' : 'var(--accent-orange-bg)',
                        color: gap <= 5 ? 'var(--accent-green)' : 'var(--accent-orange)',
                        border: `1px solid ${gap <= 5 ? 'var(--accent-green-border)' : 'var(--accent-orange-border)'}`,
                      }}
                    >
                      lv {npcLv}/{nextHelpLv} · {gap} to go
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lovedItemStats.map(({ item, have, atMax, nearMax }) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                      style={{
                        background: atMax ? 'var(--accent-green-bg)' : nearMax ? 'var(--accent-yellow-bg)' : 'var(--surface-inset)',
                        border: `1px solid ${atMax ? 'var(--accent-green-border)' : nearMax ? 'var(--accent-yellow-border)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {(atMax || nearMax) && <Gift size={10} style={{ color: atMax ? 'var(--accent-green)' : 'var(--accent-yellow)', flexShrink: 0 }} />}
                      <span className="font-medium" style={{ color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>{item}</span>
                      <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>{have}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cooking unlock hints */}
      {cookingHints.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-purple-border)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-purple-bg)', borderBottom: '1px solid var(--accent-purple-border)' }}>
            <ChefHat size={13} style={{ color: 'var(--accent-purple)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-purple)' }}>Cooking unlocks</span>
            <span className="text-xs ml-1" style={{ color: 'var(--accent-purple)', opacity: 0.7 }}>— give loved items to level up NPCs</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {cookingHints.map(({ recipe, npc, npcLvRequired, cookingLvRequired, npcLv, cookingLv, npcMet, cookingMet, lovedItemStats }) => (
              <div key={recipe} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{recipe}</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{
                          background: npcMet ? 'var(--accent-green-bg)' : 'var(--accent-orange-bg)',
                          color: npcMet ? 'var(--accent-green)' : 'var(--accent-orange)',
                          border: `1px solid ${npcMet ? 'var(--accent-green-border)' : 'var(--accent-orange-border)'}`,
                        }}
                      >
                        {npc} lv {npcLv}/{npcLvRequired}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{
                          background: cookingMet ? 'var(--accent-green-bg)' : 'var(--accent-blue-bg)',
                          color: cookingMet ? 'var(--accent-green)' : 'var(--accent-blue)',
                          border: `1px solid ${cookingMet ? 'var(--accent-green-border)' : 'var(--accent-blue-border)'}`,
                        }}
                      >
                        Cooking lv {cookingLv}/{cookingLvRequired}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {lovedItemStats.map(({ item, have, atMax, nearMax }) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                      style={{
                        background: atMax ? 'var(--accent-green-bg)' : nearMax ? 'var(--accent-yellow-bg)' : 'var(--surface-inset)',
                        border: `1px solid ${atMax ? 'var(--accent-green-border)' : nearMax ? 'var(--accent-yellow-border)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {(atMax || nearMax) && <Gift size={10} style={{ color: atMax ? 'var(--accent-green)' : 'var(--accent-yellow)', flexShrink: 0 }} />}
                      <span className="font-medium" style={{ color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : 'var(--text-secondary)' }}>{item}</span>
                      <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>{have}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
