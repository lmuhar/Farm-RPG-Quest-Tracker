import { useMemo, useState } from 'react';
import { CheckCircle, Gift, Star, Users } from 'lucide-react';
import { useStore } from '../store';
import npcsData from '../data/npcs.json';

const allNpcs = npcsData as { name: string; items: string[] }[];
const npcItemsMap = new Map(allNpcs.map((n) => [n.name, n.items]));

const REWARD_MILESTONES: { npc: string; nextRewardLv: number }[] = [
  { npc: 'Rosalie',       nextRewardLv: 40 },
  { npc: 'Thomas',        nextRewardLv: 40 },
  { npc: 'Cecil',         nextRewardLv: 30 },
  { npc: 'George',        nextRewardLv: 40 },
  { npc: 'Jill',          nextRewardLv: 60 },
  { npc: 'Vincent',       nextRewardLv: 30 },
  { npc: 'Borgen',        nextRewardLv: 60 },
  { npc: 'Ric Ryph',      nextRewardLv: 30 },
  { npc: 'Mummy',         nextRewardLv: 30 },
  { npc: 'Star Meerif',   nextRewardLv: 18 },
  { npc: 'Captain Thomas',nextRewardLv: 20 },
  { npc: 'frank',         nextRewardLv: 40 },
  { npc: 'Mariya',        nextRewardLv: 40 },
  { npc: 'Baba Gec',      nextRewardLv: 30 },
  { npc: 'Geist',         nextRewardLv: 20 },
  { npc: 'Cid',           nextRewardLv: 30 },
  { npc: 'Goostav',       nextRewardLv: 20 },
];

const HELP_MILESTONES: { npc: string; nextHelpLv: number }[] = [
  { npc: 'Buddy',         nextHelpLv: 90 },
  { npc: 'Captain Thomas',nextHelpLv: 20 },
  { npc: 'Geist',         nextHelpLv: 25 },
  { npc: 'ROOMBA',        nextHelpLv: 40 },
  { npc: 'Lorn',          nextHelpLv: 60 },
  { npc: 'George',        nextHelpLv: 70 },
  { npc: 'Jill',          nextHelpLv: 96 },
  { npc: 'Gary Bearson V',nextHelpLv: 80 },
  { npc: 'Goostav',       nextHelpLv: 80 },
  { npc: 'Rosalie',       nextHelpLv: 50 },
  { npc: 'Thomas',        nextHelpLv: 40 },
  { npc: 'Vincent',       nextHelpLv: 30 },
  { npc: 'Borgen',        nextHelpLv: 60 },
  { npc: 'Ric Ryph',      nextHelpLv: 30 },
  { npc: 'Mummy',         nextHelpLv: 30 },
  { npc: 'Star Meerif',   nextHelpLv: 30 },
  { npc: 'frank',         nextHelpLv: 40 },
  { npc: 'Mariya',        nextHelpLv: 50 },
  { npc: 'Baba Gec',      nextHelpLv: 30 },
  { npc: 'Cid',           nextHelpLv: 30 },
];

interface NpcEntry {
  npc: string;
  nextRewardLv?: number;
  nextHelpLv?: number;
  items: string[];
}

// Build merged NPC list — reward milestones first, then help-only NPCs
const NPC_ENTRIES: NpcEntry[] = (() => {
  const map = new Map<string, NpcEntry>();
  for (const { npc, nextRewardLv } of REWARD_MILESTONES) {
    map.set(npc, { npc, nextRewardLv, items: npcItemsMap.get(npc) ?? [] });
  }
  for (const { npc, nextHelpLv } of HELP_MILESTONES) {
    const existing = map.get(npc);
    if (existing) {
      existing.nextHelpLv = nextHelpLv;
    } else {
      map.set(npc, { npc, nextHelpLv, items: npcItemsMap.get(npc) ?? [] });
    }
  }
  return [...map.values()];
})();

export function NpcPage() {
  const { player, inventory, inventoryMax, setNpcLevel, toggleNpcLevelingComplete } = useStore();
  const [editingNpc, setEditingNpc] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const npcLevels = player.npcLevels ?? {};
  const completedSet = useMemo(
    () => new Set(player.completedNpcLeveling ?? []),
    [player.completedNpcLeveling]
  );

  const entries = useMemo(() => {
    return NPC_ENTRIES.map((entry) => {
      const level = npcLevels[entry.npc] ?? 0;
      const levelingDone = completedSet.has(entry.npc);
      const rewardGap = entry.nextRewardLv !== undefined ? entry.nextRewardLv - level : Infinity;
      const helpGap   = entry.nextHelpLv   !== undefined ? entry.nextHelpLv   - level : Infinity;
      const minGap    = Math.min(rewardGap, helpGap);
      return { ...entry, level, levelingDone, rewardGap, helpGap, minGap };
    }).sort((a, b) => {
      if (a.levelingDone !== b.levelingDone) return a.levelingDone ? 1 : -1;
      return a.minGap - b.minGap;
    });
  }, [npcLevels, completedSet]);

  const activeCount = entries.filter((e) => !e.levelingDone).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users size={14} style={{ color: 'var(--accent-purple)' }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          NPC Milestones
        </p>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
        >
          {activeCount} active
        </span>
      </div>

      {entries.map(({ npc, nextRewardLv, nextHelpLv, items, level, levelingDone, rewardGap, helpGap }) => {
        const isEditing = editingNpc === npc;

        const rewardColor  = rewardGap <= 0 ? 'var(--accent-green)' : rewardGap <= 5 ? 'var(--accent-yellow)' : 'var(--accent-orange)';
        const rewardBg     = rewardGap <= 0 ? 'var(--accent-green-bg)' : rewardGap <= 5 ? 'var(--accent-yellow-bg)' : 'var(--accent-orange-bg)';
        const rewardBorder = rewardGap <= 0 ? 'var(--accent-green-border)' : rewardGap <= 5 ? 'var(--accent-yellow-border)' : 'var(--accent-orange-border)';

        const helpColor  = helpGap <= 0 ? 'var(--accent-green)' : helpGap <= 5 ? 'var(--accent-yellow)' : 'var(--accent-purple)';
        const helpBg     = helpGap <= 0 ? 'var(--accent-green-bg)' : helpGap <= 5 ? 'var(--accent-yellow-bg)' : 'var(--accent-purple-bg)';
        const helpBorder = helpGap <= 0 ? 'var(--accent-green-border)' : helpGap <= 5 ? 'var(--accent-yellow-border)' : 'var(--accent-purple-border)';

        return (
          <div
            key={npc}
            className="rounded-xl overflow-hidden"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              opacity: levelingDone ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {/* Header row */}
            <div
              className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
              style={{ background: 'var(--surface-inset)', borderBottom: items.length > 0 ? '1px solid var(--border-subtle)' : undefined }}
            >
              <span className="text-sm font-semibold flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                {npc}
              </span>

              {/* Reward milestone badge */}
              {nextRewardLv !== undefined && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0"
                  style={{ background: rewardBg, color: rewardColor, border: `1px solid ${rewardBorder}` }}
                  title="Next reward milestone"
                >
                  <Star size={8} />
                  lv {level}/{nextRewardLv}
                  {rewardGap > 0 && <span style={{ opacity: 0.7 }}> · {rewardGap} to go</span>}
                </span>
              )}

              {/* Help milestone badge */}
              {nextHelpLv !== undefined && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: helpBg, color: helpColor, border: `1px solid ${helpBorder}` }}
                  title="Next help request level"
                >
                  help lv {level}/{nextHelpLv}
                  {helpGap > 0 && <span style={{ opacity: 0.7 }}> · {helpGap} to go</span>}
                </span>
              )}

              {/* Editable level */}
              {isEditing ? (
                <input
                  type="number"
                  min={0}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    const lv = parseInt(editValue, 10);
                    if (!isNaN(lv) && lv >= 0) setNpcLevel(npc, lv);
                    setEditingNpc(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditingNpc(null);
                  }}
                  autoFocus
                  className="w-14 text-xs font-mono font-semibold text-center px-1 py-0.5 rounded focus:outline-none flex-shrink-0"
                  style={{ background: 'var(--surface-card)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
                />
              ) : (
                <span
                  className="text-xs font-mono font-semibold px-2 py-0.5 rounded cursor-pointer hover:opacity-70 transition-opacity flex-shrink-0"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
                  title="Click to edit level"
                  onClick={() => { setEditingNpc(npc); setEditValue(String(level)); }}
                >
                  Lv {level}
                </span>
              )}

              {/* Leveling done toggle */}
              <button
                onClick={() => toggleNpcLevelingComplete(npc)}
                title={levelingDone ? 'Mark leveling incomplete' : 'Mark leveling complete'}
                className="flex-shrink-0 hover:opacity-70 transition-opacity"
              >
                <CheckCircle size={15} style={{ color: levelingDone ? 'var(--accent-green)' : 'var(--border-default)' }} />
              </button>
            </div>

            {/* Loved items */}
            {items.length > 0 && (
              <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
                {items.map((item) => {
                  const have = inventory[item] ?? 0;
                  const pct  = inventoryMax > 0 ? have / inventoryMax : 0;
                  const atMax   = have >= inventoryMax;
                  const nearMax = !atMax && pct >= 0.9;
                  const hasAny  = have > 0;
                  return (
                    <div
                      key={item}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: atMax ? 'var(--accent-green-bg)' : nearMax ? 'var(--accent-yellow-bg)' : hasAny ? 'var(--surface-raised)' : 'var(--surface-inset)',
                        border: `1px solid ${atMax ? 'var(--accent-green-border)' : nearMax ? 'var(--accent-yellow-border)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {(atMax || nearMax) && (
                        <Gift size={9} style={{ color: atMax ? 'var(--accent-green)' : 'var(--accent-yellow)', flexShrink: 0 }} />
                      )}
                      <span style={{ color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : hasAny ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {item}
                      </span>
                      {hasAny && (
                        <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', color: atMax ? 'var(--accent-green)' : nearMax ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                          ×{have}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
