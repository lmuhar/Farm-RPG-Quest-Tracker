import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { useStore } from '../store';
import type { AppState } from '../types';

export function ImportExport() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data: AppState = {
      questStatuses: store.questStatuses,
      inventory: store.inventory,
      player: store.player,
      cropTimes: store.cropTimes,
      plotCount: store.plotCount,
      craftingRecipes: store.craftingRecipes,
      growQueue: store.growQueue,
      questNotes: store.questNotes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'farm-rpg-save.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as Partial<AppState>;
        store.importState(data);
      } catch {
        alert('Invalid save file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Download size={16} className="text-cyan-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Save / Load</h2>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-700/40 hover:bg-cyan-700/60 text-cyan-300 border border-cyan-700/50 rounded px-3 py-2 text-xs"
        >
          <Download size={12} /> Export
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-purple-700/40 hover:bg-purple-700/60 text-purple-300 border border-purple-700/50 rounded px-3 py-2 text-xs"
        >
          <Upload size={12} /> Import
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
    </div>
  );
}
