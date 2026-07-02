import { CheckCircle, Circle, Clock, Lock, Play, ChevronDown, ChevronUp, Hammer } from 'lucide-react';
import { useState } from 'react';
import type { Quest, QuestStatus } from '../types';
import { parseItems, npcColor, statusColor, formatDuration, calcGrowsNeeded } from '../utils';
import { useStore, getPendingExpandId } from '../store';

interface Props {
  quest: Quest;
  status: QuestStatus;
}

const statusIcon = {
  completed: <CheckCircle size={14} className="text-green-400" />,
  active: <Play size={14} className="text-yellow-400" />,
  available: <Circle size={14} className="text-slate-400" />,
  locked: <Lock size={14} className="text-slate-600" />,
};

export function QuestCard({ quest, status }: Props) {
  const { setQuestStatus, inventory, cropTimes, plotCount, craftingRecipes, player, questNotes, setQuestNote } = useStore();
  const [expanded, setExpanded] = useState(() => getPendingExpandId() === quest.id);
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());

  const toggleRecipe = (item: string) => {
    setExpandedRecipes((prev) => {
      const next = new Set(prev);
      next.has(item) ? next.delete(item) : next.add(item);
      return next;
    });
  };

  const required = parseItems(quest.itemsRequired);
  const rewards = parseItems(quest.rewardItems);

  const cycleStatus = () => {
    if (status === 'locked') return;
    if (status === 'available') setQuestStatus(quest.id, 'active');
    else if (status === 'active') setQuestStatus(quest.id, 'completed');
    else if (status === 'completed') setQuestStatus(quest.id, 'available');
  };

  const isLimited = quest.startDate || quest.endDate;

  // Compute locked reasons
  const lockedReasons: string[] = [];
  if (status === 'locked') {
    if (quest.farmingLv > 0 && player.farmingLv < quest.farmingLv)
      lockedReasons.push(`🌾 Need Farming ${quest.farmingLv} (you have ${player.farmingLv})`);
    if (quest.fishingLv > 0 && player.fishingLv < quest.fishingLv)
      lockedReasons.push(`🎣 Need Fishing ${quest.fishingLv} (you have ${player.fishingLv})`);
    if (quest.craftingLv > 0 && player.craftingLv < quest.craftingLv)
      lockedReasons.push(`🔨 Need Crafting ${quest.craftingLv} (you have ${player.craftingLv})`);
    if (quest.exploringLv > 0 && player.exploringLv < quest.exploringLv)
      lockedReasons.push(`🗺️ Need Exploring ${quest.exploringLv} (you have ${player.exploringLv})`);
    if (quest.requiredNpcLevel > 0 && (player.npcLevels[quest.npc] ?? 0) < quest.requiredNpcLevel)
      lockedReasons.push(`💬 Need ${quest.npc} lv ${quest.requiredNpcLevel} (you have ${player.npcLevels[quest.npc] ?? 0})`);
  }

  const note = questNotes[quest.id] ?? '';

  return (
    <div className={`rounded-lg border transition-all ${statusColor(status)}`}>
      <div
        className="flex items-start gap-3 p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); cycleStatus(); }}
          className="mt-0.5 flex-shrink-0 hover:scale-110 transition-transform"
          title={status === 'locked' ? 'Locked — level up to unlock' : 'Click to change status'}
        >
          {statusIcon[status]}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${npcColor(quest.npc)}`}>
              {quest.npc}
            </span>
            {quest.questline && (
              <span className="text-xs text-slate-500 italic truncate">{quest.questline}</span>
            )}
            {isLimited && (
              <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">
                ⏰ Limited
              </span>
            )}
            {note && (
              <span className="text-xs text-yellow-400" title={note}>📝</span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-100 mt-1">{quest.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {required.map((i) => `${i.quantity}x ${i.item}`).join(', ') || 'No items required'}
          </p>
          {status === 'locked' && lockedReasons.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              {lockedReasons.join(' · ')}
            </p>
          )}
        </div>

        {expanded ? <ChevronUp size={14} className="text-slate-500 flex-shrink-0 mt-1" /> : <ChevronDown size={14} className="text-slate-500 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 p-3 space-y-3">
          <p className="text-xs text-slate-400 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: quest.description }} />

          {required.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">Items Required</p>
              <div className="space-y-1">
                {required.map(({ quantity, item }) => {
                  const have = inventory[item] ?? 0;
                  const need = Math.max(0, quantity - have);
                  const cropTime = cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase());
                  const grows = cropTime ? calcGrowsNeeded(need, plotCount) : null;
                  const totalTime = cropTime && grows ? grows * cropTime.growMinutes : null;

                  const recipe = craftingRecipes[item];
                  const isRecipeExpanded = expandedRecipes.has(item);

                  return (
                    <div key={item} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 flex items-center gap-1">
                          <span className="font-mono text-slate-100">{quantity}x</span> {item}
                          {recipe && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRecipe(item); }}
                              className="text-orange-400 hover:text-orange-300 ml-1"
                              title="Show crafting ingredients"
                            >
                              <Hammer size={10} />
                            </button>
                          )}
                        </span>
                        <div className="flex items-center gap-2 text-right">
                          {have > 0 && (
                            <span className={`${have >= quantity ? 'text-green-400' : 'text-yellow-400'}`}>
                              {have}/{quantity}
                            </span>
                          )}
                          {need > 0 && cropTime && (
                            <span className="text-green-300 flex items-center gap-1">
                              <Clock size={10} />
                              {grows}x grow ({formatDuration(totalTime!)})
                            </span>
                          )}
                          {need > 0 && !cropTime && (
                            <span className="text-red-400">need {need}</span>
                          )}
                        </div>
                      </div>
                      {recipe && isRecipeExpanded && (
                        <div className="ml-4 mt-0.5 text-orange-300/80 bg-orange-500/5 rounded px-2 py-1">
                          <span className="text-orange-400 font-medium">Raw materials: </span>
                          {recipe.map((ing) => `${ing.quantity * quantity}x ${ing.item}`).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rewards.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">Rewards</p>
              <p className="text-xs text-emerald-400">
                {rewards.map((i) => `${i.quantity}x ${i.item}`).join(', ')}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-slate-500">
            {quest.farmingLv > 0 && <span>🌾 Lv{quest.farmingLv}</span>}
            {quest.fishingLv > 0 && <span>🎣 Lv{quest.fishingLv}</span>}
            {quest.craftingLv > 0 && <span>🔨 Lv{quest.craftingLv}</span>}
            {quest.exploringLv > 0 && <span>🗺️ Lv{quest.exploringLv}</span>}
            {quest.requiredNpcLevel > 0 && <span>💬 NPC Lv{quest.requiredNpcLevel}</span>}
            {isLimited && (
              <span className="text-orange-400">
                {quest.startDate} – {quest.endDate}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {status !== 'locked' && (
              <>
                {status !== 'active' && (
                  <button
                    onClick={() => setQuestStatus(quest.id, 'active')}
                    className="text-xs bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-300 border border-yellow-600/40 rounded px-2 py-1"
                  >
                    Mark Active
                  </button>
                )}
                {status !== 'completed' && (
                  <button
                    onClick={() => setQuestStatus(quest.id, 'completed')}
                    className="text-xs bg-green-600/30 hover:bg-green-600/50 text-green-300 border border-green-600/40 rounded px-2 py-1"
                  >
                    Mark Complete
                  </button>
                )}
                {(status === 'completed' || status === 'active') && (
                  <button
                    onClick={() => setQuestStatus(quest.id, 'available')}
                    className="text-xs bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 border border-slate-600/40 rounded px-2 py-1"
                  >
                    Reset
                  </button>
                )}
              </>
            )}
          </div>

          <div>
            <textarea
              placeholder="Add a note…"
              value={note}
              onChange={(e) => setQuestNote(quest.id, e.target.value)}
              onBlur={(e) => setQuestNote(quest.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              rows={2}
              className="w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-yellow-500/60 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
