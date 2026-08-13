import { useMemo, useState } from 'react';
import { CheckCircle2, Hammer, Sprout, AlertTriangle, TrendingUp, Zap, Clock, ChevronDown, ChevronRight, X, ChefHat, Gift, Fish } from 'lucide-react';
import { useStore } from '../store';
import { parseItems, calcGrowsNeeded, resolveRawIngredients, formatDuration } from '../utils';
import type { Quest } from '../types';
import recipesData from '../data/recipes.json';
import petsData from '../data/pets.json';
import itemLocationsData from '../data/item-locations.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const allRecipes = recipesData as Recipe[];
const recipeByName = new Map<string, Recipe>(allRecipes.map(r => [r.name.toLowerCase(), r]));

// Curated list of rare bottleneck items and where to find them
const RARE_ITEMS = new Map<string, string>([
  ['Gold Feather',  'Forest / Misty Forest / Mt. Banon'],
  ['Gold Leaf',     'Forest'],
  ['Model Ship',    'Small Cave'],
  ['Skull Coin',    'Small Spring'],
  ['Tea Leaves',    'Cane Pole Ridge'],
  ['Horned Beetle', 'Cane Pole Ridge'],
  ['Lima Bean',     'Cane Pole Ridge'],
  ['Spider',        'Misty Forest / Haunted House'],
  ['Orange Gecko',  'Black Rock Canyon'],
  ['Dragon Skull',  'Mount Banon'],
  ['Bacon',         'Mount Banon'],
  ['Diamond',       'Ember Lagoon'],
  ['Herbs',         'Whispering Creek'],
  ['Onyx Scorpion', 'Jundland Desert'],
]);

// Compute items that drop only from pets (not findable via explore/fishing and not craftable)
const _itemLocKeys = new Set(Object.keys(itemLocationsData as Record<string, unknown>).map(k => k.toLowerCase()));
const _recipeKeys = new Set(allRecipes.map(r => r.name.toLowerCase()));
const _petLootItems = new Set<string>();
for (const pet of petsData as { loot: Record<string, string[]> }[]) {
  for (const items of Object.values(pet.loot)) {
    for (const item of items) _petLootItems.add(item);
  }
}
const PET_ONLY_ITEMS = new Set<string>(
  [..._petLootItems].filter(item => !_itemLocKeys.has(item.toLowerCase()) && !_recipeKeys.has(item.toLowerCase()))
);

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
  onTabChange?: (tab: string) => void;
}

export function Dashboard({ activeQuests, nextUpQuests, onTabChange }: Props) {
  const { inventory, cropTimes, plotCount, inventoryMax, craftingRecipes, player } = useStore();
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);

  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe>(recipeByName);
    Object.entries(craftingRecipes).forEach(([item, ings]) => {
      map.set(item.toLowerCase(), { id: 'custom', name: item, ingredients: ings });
    });
    return map;
  }, [craftingRecipes]);

  const { readyToTurnIn, craftNowItems, cropItems, bottlenecks, craftworksPicks, goldFishNeeds } = useMemo(() => {
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

    // Crop grows needed
    const cropItems: { item: string; grows: number; growMinutes: number; totalMinutes: number }[] = [];
    for (const [item, totalNeeded] of itemMap.entries()) {
      const have = inventory[item] ?? 0;
      const deficit = totalNeeded - have;
      if (deficit <= 0) continue;
      const crop = cropTimes.find(c => c.item.toLowerCase() === item.toLowerCase());
      if (crop) {
        const grows = calcGrowsNeeded(deficit, plotCount);
        cropItems.push({ item, grows, growMinutes: crop.growMinutes, totalMinutes: grows * crop.growMinutes });
      }
    }

    // Bottleneck items — curated rare items + pet-only drops
    const bottleneckMap = new Map<string, { active: number; nextup: number; have: number; need: number; location: string }>();
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
        const existing = bottleneckMap.get(item) ?? { active: 0, nextup: 0, have, need: 0, location };
        if (isNextUp) existing.nextup++;
        else existing.active++;
        existing.need = Math.max(existing.need, quantity);
        bottleneckMap.set(item, existing);
      }
    }
    const bottlenecks = [...bottleneckMap.entries()]
      .map(([item, { active, nextup, have, need, location }]) => ({ item, active, nextup, have, need, location }))
      .sort((a, b) => b.active - a.active || b.nextup - a.nextup)
      .slice(0, 8);

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

    // Craftworks picks: craftable items for active/nextup quests, sorted by priority
    const craftworksPicks: {
      item: string;
      deficit: number;
      totalNeeded: number;
      have: number;
      priority: 'active' | 'nextup';
      ingredientsReady: boolean;
      missingRaw: [string, number][];
    }[] = [];

    const allQuestsForCraft = [
      ...activeQuests.map(q => ({ quest: q, priority: 'active' as const })),
      ...nextUpQuests.map(q => ({ quest: q, priority: 'nextup' as const })),
    ];

    const seenCraftItems = new Set<string>();
    for (const { quest, priority } of allQuestsForCraft) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        if (seenCraftItems.has(item)) continue;
        if (quantity > inventoryMax) continue;
        const recipe = recipeMap.get(item.toLowerCase());
        if (!recipe) continue;
        const have = inventory[item] ?? 0;
        if (have >= inventoryMax) continue; // at cap
        const deficit = quantity - have;
        if (deficit <= 0) continue;
        seenCraftItems.add(item);

        const rawMats = resolveRawIngredients(item, deficit, recipeMap);
        const ingredientsReady = [...rawMats.entries()].every(([ing, qty]) => (inventory[ing] ?? 0) >= qty);
        const missingRaw: [string, number][] = [...rawMats.entries()]
          .filter(([ing, qty]) => (inventory[ing] ?? 0) < qty)
          .map(([ing, qty]) => [ing, qty - (inventory[ing] ?? 0)]);

        craftworksPicks.push({ item, deficit, totalNeeded: quantity, have, priority, ingredientsReady, missingRaw });
      }
    }
    craftworksPicks.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'active' ? -1 : 1;
      return b.deficit - a.deficit;
    });

    return { readyToTurnIn, craftNowItems, cropItems, bottlenecks, craftworksPicks: craftworksPicks.slice(0, 6), goldFishNeeds };
  }, [activeQuests, nextUpQuests, inventory, cropTimes, plotCount, inventoryMax, recipeMap]);

  const hasDoNow = readyToTurnIn.length > 0 || craftNowItems.length > 0;

  const COOKING_UNLOCKS = [
    {
      recipe: 'Mushroom Stew',
      npc: 'Holger',
      npcLvRequired: 40,
      cookingLvRequired: 20,
      lovedItems: ['Cheese', 'Mushroom Stew', 'Milk', 'Trout', 'Horn', 'Peach', 'Worms', 'Apple Cider', 'Largemouth Bass', 'Valentines Card', 'Arrowhead', 'Bluegill', 'Carp', 'Aquamarine', 'Peas', 'Marlin', 'Mug of Beer', 'Gold Trout', 'Potato', 'Wooden Table'],
    },
    {
      recipe: 'Breakfast Boost',
      npc: 'Lorn',
      npcLvRequired: 40,
      cookingLvRequired: 40,
      lovedItems: ['Gold Peas', 'Iced Tea', 'Iron Cup', 'Old Boot', 'Purple Parchment', 'Green Parchment', '3-leaf Clover', 'Snail', 'Worms', 'Bucket', 'Spider', 'Peas', 'Crappie', 'Apple Cider', 'Shrimp', 'Glass Orb', 'Milk', 'Small Prawn'],
    },
    {
      recipe: 'Hickory Omelette',
      npc: 'Mariya',
      npcLvRequired: 40,
      cookingLvRequired: 35,
      lovedItems: ['Radish', 'Worms', 'Spider', 'Black Powder', 'Explosive', 'Iced Tea', 'Milk', 'Eggs', 'Peach', 'Eggplant', 'Cucumber', 'Onion Soup', 'Shrimp-a-Plenty', "Cat's Meow", 'Quandary Chowder', 'Sea Pincher Special', 'Over The Moon', 'Leather Diary', 'Mushroom Stew'],
    },
    {
      recipe: 'Quandary Chowder',
      npc: 'Jill',
      npcLvRequired: 50,
      cookingLvRequired: 25,
      lovedItems: ['Peach', 'Old Boot', 'Tomato', 'Grubs', 'Scrap Metal', 'Stingray', 'Spider', 'Hops', 'Snowball', 'Cheese', 'Milk', 'Grapes', 'Worms', 'Yellow Perch', 'Corn Husk Doll', 'MIAB', 'Mushroom Paste', 'Leather', 'Corn'],
    },
  ] as const;

  const cookingHints = useMemo(() => {
    return COOKING_UNLOCKS.flatMap((unlock) => {
      const npcLv = player.npcLevels[unlock.npc] ?? 0;
      const cookingLv = player.cookingLv ?? 0;
      const npcMet = npcLv >= unlock.npcLvRequired;
      const cookingMet = cookingLv >= unlock.cookingLvRequired;
      if (npcMet && cookingMet) return [];
      const itemsAtMax = unlock.lovedItems.filter((item) => (inventory[item] ?? 0) >= inventoryMax);
      return [{ ...unlock, npcLv, cookingLv, npcMet, cookingMet, itemsAtMax }];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, inventory, inventoryMax]);

  // Per-quest item details for expansion
  const questItemDetails = useMemo(() => {
    const map = new Map<string, { item: string; quantity: number; have: number; pct: number }[]>();
    for (const q of activeQuests) {
      map.set(q.id, parseItems(q.itemsRequired).map(({ item, quantity }) => {
        const have = Math.min(inventory[item] ?? 0, quantity);
        return { item, quantity, have, pct: quantity > 0 ? have / quantity : 1 };
      }));
    }
    return map;
  }, [activeQuests, inventory]);

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
        {bottlenecks.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}>
              <AlertTriangle size={13} style={{ color: 'var(--accent-orange)' }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-orange)' }}>Bottlenecks</span>
              <span className="text-xs ml-1" style={{ color: 'var(--accent-orange)', opacity: 0.7 }}>— no easy source</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {bottlenecks.map(({ item, active, nextup, have, need, location }) => (
                <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{location}</span>
                      {active > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}>
                          {active} active
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
              {[...cropItems].sort((a, b) => a.totalMinutes - b.totalMinutes).map(({ item, grows, growMinutes, totalMinutes }) => {
                const finishAt = new Date(Date.now() + totalMinutes * 60 * 1000);
                const finishStr = finishAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const isToday = finishAt.toDateString() === new Date().toDateString();
                const doneLabel = isToday ? `done by ${finishStr}` : `done in ${formatDuration(totalMinutes)}`;
                return (
                  <div key={item} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item}</span>
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
            {cookingHints.map(({ recipe, npc, npcLvRequired, cookingLvRequired, npcLv, cookingLv, npcMet, cookingMet, itemsAtMax }) => (
              <div key={recipe} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 mb-2">
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
                {itemsAtMax.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {itemsAtMax.map((item) => (
                      <div key={item} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}>
                        <Gift size={10} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Give</span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                        <span style={{ color: 'var(--text-muted)' }}>→ {npc}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    No loved items at max inventory yet — gift {npc} to progress friendship.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Craftworks picks */}
      {craftworksPicks.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
            <Hammer size={13} style={{ color: 'var(--accent-blue)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-blue)' }}>Craftworks</span>
            <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>— suggested items for your slots</span>
            {onTabChange && (
              <button
                onClick={() => onTabChange('craftworks')}
                className="ml-auto text-xs flex items-center gap-1 flex-shrink-0"
                style={{ color: 'var(--accent-purple)' }}
              >
                See all <ChevronRight size={11} />
              </button>
            )}
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {craftworksPicks.map(({ item, deficit, totalNeeded, have, priority, ingredientsReady, missingRaw }) => (
              <div key={item} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Hammer size={11} style={{ color: ingredientsReady ? 'var(--accent-green)' : 'var(--accent-yellow)', flexShrink: 0 }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                    {priority === 'nextup' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                        next up
                      </span>
                    )}
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: ingredientsReady ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                    {have}/{totalNeeded} · ×{deficit} to craft
                  </span>
                </div>
                {!ingredientsReady && missingRaw.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 pl-5">
                    {missingRaw.slice(0, 4).map(([ing, short]) => (
                      <span key={ing} className="text-xs" style={{ color: 'var(--accent-orange)', fontFamily: 'var(--font-mono)' }}>
                        {ing} –{short}
                      </span>
                    ))}
                    {missingRaw.length > 4 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{missingRaw.length - 4} more</span>
                    )}
                  </div>
                )}
                {ingredientsReady && (
                  <p className="text-xs mt-1 pl-5" style={{ color: 'var(--accent-green)' }}>✓ All ingredients ready — craft now</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active quests — expandable */}
      {activeQuests.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-subtle)' }}>
            <TrendingUp size={13} style={{ color: 'var(--accent-purple)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-purple)' }}>Active quests</span>
            <span className="ml-auto text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{activeQuests.length} total</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {(() => {
              const lines = new Map<string, Quest[]>();
              for (const q of activeQuests) {
                const key = q.questline || '(standalone)';
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key)!.push(q);
              }
              return [...lines.entries()].map(([line, quests]) => (
                <div key={line}>
                  <div className="px-4 py-2" style={{ background: 'var(--surface-inset)' }}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{line}</span>
                  </div>
                  {quests.map(q => {
                    const isExpanded = expandedQuestId === q.id;
                    const items = questItemDetails.get(q.id) ?? [];
                    const allReady = items.every(i => i.pct >= 1);
                    const overallPct = items.length > 0
                      ? items.reduce((sum, i) => sum + i.pct, 0) / items.length
                      : 1;
                    return (
                      <div key={q.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          onClick={() => setExpandedQuestId(isExpanded ? null : q.id)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-slate-500/5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium" style={{ color: allReady ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                                {q.name}
                              </span>
                              {allReady && <CheckCircle2 size={11} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.round(overallPct * 100)}%`, background: allReady ? 'var(--accent-green)' : 'var(--accent-yellow)' }}
                                />
                              </div>
                              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                {Math.round(overallPct * 100)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{q.npc}</span>
                            {isExpanded
                              ? <X size={12} style={{ color: 'var(--text-muted)' }} />
                              : <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
                            }
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 pt-1 space-y-1.5" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-inset)' }}>
                            {items.map(({ item, quantity, have, pct }) => {
                              const ready = pct >= 1;
                              return (
                                <div key={item} className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-xs" style={{ color: ready ? 'var(--accent-green)' : 'var(--text-secondary)' }}>{item}</span>
                                      <span className="text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)', color: ready ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                        {have}/{quantity}{ready ? ' ✓' : ''}
                                      </span>
                                    </div>
                                    <div className="h-1 rounded-full overflow-hidden mt-0.5" style={{ background: 'var(--border-default)' }}>
                                      <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: ready ? 'var(--accent-green)' : 'var(--accent-yellow)' }} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
