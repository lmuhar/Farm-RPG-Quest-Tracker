import petsData from './pets.json';
import itemLocationsData from './item-locations.json';
import recipesData from './recipes.json';

interface Recipe { id: string; name: string; ingredients: { item: string; quantity: number }[] }
const allRecipes = recipesData as Recipe[];

const _itemLocKeys = new Set(Object.keys(itemLocationsData as Record<string, unknown>).map(k => k.toLowerCase()));
const _recipeKeys = new Set(allRecipes.map(r => r.name.toLowerCase()));
const _petLootItems = new Set<string>();
for (const pet of petsData as { loot: Record<string, string[]> }[]) {
  for (const items of Object.values(pet.loot)) {
    for (const item of items) _petLootItems.add(item);
  }
}
export const PET_ONLY_ITEMS = new Set<string>(
  [..._petLootItems].filter(item => !_itemLocKeys.has(item.toLowerCase()) && !_recipeKeys.has(item.toLowerCase()))
);

export const RARE_ITEMS = new Map<string, string>([
  ['Gold Feather',    'Forest / Misty Forest / Mt. Banon'],
  ['Gold Leaf',       'Forest'],
  ['Model Ship',      'Small Cave'],
  ['Skull Coin',      'Small Spring'],
  ['Tea Leaves',      'Cane Pole Ridge'],
  ['Horned Beetle',   'Cane Pole Ridge'],
  ['Lima Bean',       'Cane Pole Ridge'],
  ['Spider',          'Misty Forest / Haunted House'],
  ['Orange Gecko',    'Black Rock Canyon'],
  ['Dragon Skull',    'Mount Banon'],
  ['Bacon',           'Mount Banon'],
  ['Diamond',         'Ember Lagoon'],
  ['Herbs',           'Whispering Creek'],
  ['Onyx Scorpion',   'Jundland Desert'],
  ['White Truffle',   'Pig (daily reset)'],
  ['Black Truffle',   'Pig (daily reset)'],
  ['Steel Soap Belt', 'Borgen Shop'],
  ['Wax Candle',        'Wishing Well'],
  ['Carved Bear',       'Wishing Well'],
  ['Carved Camel',      'Wishing Well'],
  ['Carved Dragon',     'Wishing Well'],
  ['Carved Fox',        'Wishing Well'],
  ['Carved Moose',      'Wishing Well'],
  ['Carved Mouse',      'Wishing Well'],
  ['Carved Owl',        'Wishing Well'],
  ['Carved Rabbit',     'Wishing Well'],
  ['Carved Rhino',      'Wishing Well'],
  ['Carved Squirrel',   'Wishing Well'],
  ['Carved Squisquatch','Wishing Well'],
  ['Carved Warthog',    'Wishing Well'],
]);

// Wishing Well: items to throw in to get each carved item (highest → lowest drop %)
export const WISHING_WELL_SOURCES = new Map<string, { item: string; pct: number }[]>([
  ['Carved Bear',       [{ item: 'Pirate Bandana', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Camel',      [{ item: 'Carved Owl', pct: 33.3 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Dragon',     [{ item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Fox',        [{ item: 'Carved Bear', pct: 25 }, { item: 'Wooden Box', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Moose',      [{ item: 'Carved Warthog', pct: 25 }, { item: 'Carved Bear', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Mouse',      [{ item: 'Carved Rabbit', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Owl',        [{ item: 'Wooden Mask', pct: 33.3 }, { item: 'Carved Rabbit', pct: 25 }, { item: 'Teapot', pct: 14.3 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Rabbit',     [{ item: 'Carved Warthog', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Rhino',      [{ item: 'Carved Owl', pct: 33.3 }, { item: 'Carved Bear', pct: 25 }, { item: 'Teapot', pct: 14.3 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Squirrel',   [{ item: 'Carved Warthog', pct: 25 }, { item: 'Spectacles', pct: 20 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Squisquatch',[{ item: 'Carved Warthog', pct: 25 }, { item: 'Block of Wood', pct: 6.3 }]],
  ['Carved Warthog',    [{ item: 'Carved Owl', pct: 33.3 }, { item: 'Carved Rabbit', pct: 25 }, { item: 'Small Flute', pct: 20 }, { item: 'Teapot', pct: 14.3 }, { item: 'Block of Wood', pct: 6.3 }]],
]);
