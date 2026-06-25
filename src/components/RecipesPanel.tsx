import { useState } from 'react';
import { ChevronDown, ChevronUp, Hammer, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { parseItems } from '../utils';

export function RecipesPanel() {
  const { craftingRecipes, setCraftingRecipe, removeCraftingRecipe } = useStore();
  const [collapsed, setCollapsed] = useState(true);
  const [itemName, setItemName] = useState('');
  const [ingredientsRaw, setIngredientsRaw] = useState('');

  const addRecipe = () => {
    const name = itemName.trim();
    if (!name || !ingredientsRaw.trim()) return;
    const ingredients = parseItems(ingredientsRaw.replace(/,/g, ';'));
    if (ingredients.length === 0) return;
    setCraftingRecipe(name, ingredients);
    setItemName('');
    setIngredientsRaw('');
  };

  const recipes = Object.entries(craftingRecipes);

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Hammer size={16} className="text-orange-400 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex-1">Crafting Recipes</h2>
        {collapsed ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Item name (e.g. Wooden Plank)"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
            <input
              type="text"
              placeholder="Ingredients: 5x Wood, 2x Rope"
              value={ingredientsRaw}
              onChange={(e) => setIngredientsRaw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRecipe()}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
            <button
              onClick={addRecipe}
              className="w-full flex items-center justify-center gap-1.5 bg-orange-700/40 hover:bg-orange-700/60 text-orange-300 border border-orange-700/50 rounded px-3 py-1.5 text-xs"
            >
              <Plus size={12} /> Add Recipe
            </button>
          </div>

          {recipes.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">No recipes defined yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recipes.map(([item, ingredients]) => (
                <div key={item} className="bg-slate-700/40 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-orange-300">{item}</span>
                    <button onClick={() => removeCraftingRecipe(item)} className="text-slate-500 hover:text-red-400">
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {ingredients.map((i) => `${i.quantity}x ${i.item}`).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
