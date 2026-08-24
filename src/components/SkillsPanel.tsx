import { User } from 'lucide-react';
import { useStore } from '../store';

export function SkillsPanel() {
  const { player, setPlayer } = useStore();

  const skills = [
    { key: 'farmingLv', label: 'Farming', emoji: '🌾' },
    { key: 'fishingLv', label: 'Fishing', emoji: '🎣' },
    { key: 'craftingLv', label: 'Crafting', emoji: '🔨' },
    { key: 'exploringLv', label: 'Exploring', emoji: '🗺️' },
    { key: 'cookingLv', label: 'Cooking', emoji: '🍳' },
  ] as const;

  return (
    <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <User size={16} className="text-purple-400" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Player Skills</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {skills.map(({ key, label, emoji }) => (
          <div key={key}>
            <label className="text-xs text-slate-400 mb-1 block">{emoji} {label}</label>
            <input
              type="number"
              min={0}
              max={999}
              value={player[key] || ''}
              placeholder="0"
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                if (!isNaN(val)) setPlayer({ ...player, [key]: val });
              }}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
