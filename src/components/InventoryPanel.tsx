import { useState } from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';

export function InventoryPanel() {
  const { inventory, setInventoryItem } = useStore();
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState(1);

  const items = Object.entries(inventory).filter(([, qty]) => qty > 0);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setInventoryItem(trimmed, (inventory[trimmed] ?? 0) + newQty);
    setNewItem('');
    setNewQty(1);
  };

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Package size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Inventory</h2>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Item name..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <input
          type="number"
          min={1}
          value={newQty}
          onChange={(e) => setNewQty(parseInt(e.target.value) || 1)}
          className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={addItem}
          className="bg-amber-600 hover:bg-amber-500 text-white rounded px-2 py-1"
        >
          <Plus size={14} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">No items tracked yet</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {items.map(([item, qty]) => (
            <div key={item} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-300 flex-1 truncate">{item}</span>
              <input
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setInventoryItem(item, parseInt(e.target.value) || 0)}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setInventoryItem(item, 0)}
                className="text-slate-500 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
