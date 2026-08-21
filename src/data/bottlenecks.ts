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
  ['Wax Candle',      'Wishing Well'],
]);
