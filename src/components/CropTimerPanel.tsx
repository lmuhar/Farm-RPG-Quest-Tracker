import { useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { formatDuration } from '../utils';

export function CropTimerPanel() {
  const { cropTimes, setCropTime, removeCropTime, plotCount, setPlotCount, inventoryMax, setInventoryMax } = useStore();
  const [newCrop, setNewCrop] = useState('');
  const [newMinutes, setNewMinutes] = useState(60);

  const addCrop = () => {
    const trimmed = newCrop.trim();
    if (!trimmed || newMinutes <= 0) return;
    setCropTime(trimmed, newMinutes);
    setNewCrop('');
    setNewMinutes(60);
  };

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} className="text-green-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Crop Grow Times</h2>
      </div>

      <div className="mb-3 flex gap-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Plots available</label>
          <input
            type="number"
            min={1}
            value={plotCount}
            onChange={(e) => setPlotCount(parseInt(e.target.value) || 1)}
            className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Inventory max slots</label>
          <input
            type="number"
            min={1}
            value={inventoryMax}
            onChange={(e) => setInventoryMax(parseInt(e.target.value) || 1)}
            className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-green-500"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Crop name..."
          value={newCrop}
          onChange={(e) => setNewCrop(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCrop()}
          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-green-500"
        />
        <input
          type="number"
          min={1}
          value={newMinutes}
          onChange={(e) => setNewMinutes(parseInt(e.target.value) || 1)}
          placeholder="mins"
          className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-green-500"
        />
        <button onClick={addCrop} className="bg-green-700 hover:bg-green-600 text-white rounded px-2 py-1">
          <Plus size={14} />
        </button>
      </div>

      {cropTimes.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">No crop times set yet</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {cropTimes.map(({ item, growMinutes }) => (
            <div key={item} className="flex items-center justify-between text-sm">
              <span className="text-slate-300 flex-1 truncate">{item}</span>
              <span className="text-green-400 text-xs mr-2">{formatDuration(growMinutes)}</span>
              <button onClick={() => removeCropTime(item)} className="text-slate-500 hover:text-red-400">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
