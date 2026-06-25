import { useState, useMemo } from 'react';
import { Package, Plus, Trash2, AlignLeft } from 'lucide-react';
import { useStore } from '../store';

function parseBulkLine(line: string): { item: string; quantity: number } | null {
  const s = line.trim();
  if (!s) return null;
  // 50x Carrot
  let m = s.match(/^(\d+)[xX]\s+(.+)$/);
  if (m) return { quantity: parseInt(m[1]), item: m[2].trim() };
  // Carrot x50
  m = s.match(/^(.+?)\s+[xX](\d+)$/);
  if (m) return { quantity: parseInt(m[2]), item: m[1].trim() };
  // Carrot: 50
  m = s.match(/^(.+?):\s*(\d+)$/);
  if (m) return { quantity: parseInt(m[2]), item: m[1].trim() };
  // 50 Carrot
  m = s.match(/^(\d+)\s+(.+)$/);
  if (m) return { quantity: parseInt(m[1]), item: m[2].trim() };
  return null;
}

export function InventoryPanel() {
  const { inventory, setInventoryItem } = useStore();
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const items = Object.entries(inventory).filter(([, qty]) => qty > 0);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setInventoryItem(trimmed, (inventory[trimmed] ?? 0) + newQty);
    setNewItem('');
    setNewQty(1);
  };

  const parsedBulk = useMemo(() => {
    return bulkText.split('\n').map(parseBulkLine).filter(Boolean) as { item: string; quantity: number }[];
  }, [bulkText]);

  const commitBulk = () => {
    for (const { item, quantity } of parsedBulk) {
      setInventoryItem(item, (inventory[item] ?? 0) + quantity);
    }
    setBulkText('');
    setBulkMode(false);
  };

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Package size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex-1">Inventory</h2>
        <button
          onClick={() => setBulkMode(!bulkMode)}
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
            bulkMode
              ? 'bg-amber-600/30 text-amber-300 border-amber-600/40'
              : 'text-slate-400 border-slate-600 hover:text-slate-200'
          }`}
          title="Bulk add"
        >
          <AlignLeft size={12} /> Bulk
        </button>
      </div>

      {bulkMode ? (
        <div className="mb-3 space-y-2">
          <textarea
            placeholder={"50x Carrot\nCarrot: 50\n50 Carrot\nCarrot x50"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none font-mono"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {parsedBulk.length > 0 ? `${parsedBulk.length} item${parsedBulk.length !== 1 ? 's' : ''} parsed` : 'No items parsed'}
            </span>
            <button
              onClick={commitBulk}
              disabled={parsedBulk.length === 0}
              className="text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-3 py-1"
            >
              Parse &amp; Add
            </button>
          </div>
        </div>
      ) : (
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
      )}

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
