import { useRef, useState } from 'react';
import { Download, Upload, ClipboardPaste, Check, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import type { AppState } from '../types';

export function ImportExport() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const handleExport = () => {
    const data: AppState = {
      questStatuses: store.questStatuses,
      inventory: store.inventory,
      player: store.player,
      cropTimes: store.cropTimes,
      plotCount: store.plotCount,
      inventoryMax: store.inventoryMax,
      craftingRecipes: store.craftingRecipes,
      growQueue: store.growQueue,
      questNotes: store.questNotes,
      pinnedQuestline: store.pinnedQuestline,
      ownedPets: store.ownedPets,
      towerLevel: store.towerLevel,
      trackedQuestline: store.trackedQuestline,
      mastered: store.mastered,
      grandMastered: store.grandMastered,
      megaMastered: store.megaMastered,
      craftworksSlots: store.craftworksSlots,
      inventoryGoal: store.inventoryGoal,
      dailyGain: store.dailyGain,
      dailyResetTime: store.dailyResetTime,
      masteryLevels: store.masteryLevels,
      masteryProgress: store.masteryProgress,
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

  const handlePasteApply = () => {
    try {
      const data = JSON.parse(pasteText.trim()) as Partial<AppState>;
      store.importState(data);
      setPasteStatus('ok');
      setPasteText('');
      setTimeout(() => setPasteStatus('idle'), 2500);
    } catch {
      setPasteStatus('error');
      setTimeout(() => setPasteStatus('idle'), 2500);
    }
  };

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4 space-y-4">
      <div className="flex items-center gap-2">
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
          <Upload size={12} /> Import file
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>

      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardPaste size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paste JSON update</span>
        </div>
        <textarea
          rows={4}
          placeholder={'Paste a partial save JSON here, e.g.\n{"player": {"farmingLv": 99, "npcLevels": {"Holger": 13}}}'}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 font-mono resize-none focus:outline-none focus:border-purple-500"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={handlePasteApply}
            disabled={!pasteText.trim()}
            className="flex items-center gap-1.5 bg-purple-700/40 hover:bg-purple-700/60 disabled:opacity-40 text-purple-300 border border-purple-700/50 rounded px-3 py-1.5 text-xs"
          >
            <ClipboardPaste size={11} /> Apply
          </button>
          {pasteStatus === 'ok' && (
            <span className="flex items-center gap-1 text-xs text-green-400"><Check size={11} /> Applied!</span>
          )}
          {pasteStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400"><AlertCircle size={11} /> Invalid JSON</span>
          )}
        </div>
      </div>
    </div>
  );
}
