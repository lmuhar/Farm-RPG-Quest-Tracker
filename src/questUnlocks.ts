import questsData from './data/quests.json';
import type { PlayerProfile, Quest, QuestStatus } from './types';
import { getPrereq, getUnlocks } from './questChains';
import { isLimitedTime } from './utils';

// "What should I do to open more quests?" — finds the single steps (finish an
// active quest, climb the Tower) that are the last thing holding quests back.
// A quest only counts when that step is its *only* blocker, so a quest that
// would still be short on a skill or NPC level afterwards isn't promised.

const allQuests = questsData as Quest[];

interface Ctx {
  player: PlayerProfile;
  questStatuses: Record<string, QuestStatus>;
  towerLevel: number;
}

export interface QuestBlockers {
  tower?: number;    // required Tower level when above the player's
  prereq?: Quest;    // unlocking quest when not yet completed
  skills: string[];  // e.g. "Farming 50", "Rosalie lv 10"
}

export function getQuestBlockers(quest: Quest, { player, questStatuses, towerLevel }: Ctx): QuestBlockers {
  const skills: string[] = [];
  const skill = (label: string, have: number, need: number) => { if (have < need) skills.push(`${label} ${need}`); };
  skill('Farming', player.farmingLv, quest.farmingLv);
  skill('Fishing', player.fishingLv, quest.fishingLv);
  skill('Crafting', player.craftingLv, quest.craftingLv);
  skill('Exploring', player.exploringLv, quest.exploringLv);
  skill('Mining', player.miningLv ?? 0, quest.miningLv);
  if ((player.npcLevels[quest.npc] ?? 0) < quest.requiredNpcLevel) skills.push(`${quest.npc} lv ${quest.requiredNpcLevel}`);

  const prereq = getPrereq(quest);
  return {
    tower: (quest.towerLv ?? 0) > towerLevel ? quest.towerLv : undefined,
    prereq: prereq && questStatuses[prereq.id] !== 'completed' ? prereq : undefined,
    skills,
  };
}

// Not started yet and still obtainable (expired event quests are skipped)
function isPending(quest: Quest, questStatuses: Record<string, QuestStatus>): boolean {
  const s = questStatuses[quest.id];
  return s !== 'completed' && s !== 'active' && !isLimitedTime(quest);
}

export type UnlockSuggestion =
  | { kind: 'tower'; level: number; floorsAway: number; quests: Quest[] }
  | { kind: 'quest'; quest: Quest; quests: Quest[] };

// Nearest Tower level that opens quests, with every quest it opens up to that level
export function nextTowerUnlock(ctx: Ctx): { level: number; floorsAway: number; quests: Quest[] } | undefined {
  const byLevel = new Map<number, Quest[]>();
  for (const q of allQuests) {
    if (!isPending(q, ctx.questStatuses)) continue;
    const b = getQuestBlockers(q, ctx);
    if (b.tower === undefined || b.prereq || b.skills.length > 0) continue;
    const list = byLevel.get(b.tower) ?? [];
    list.push(q);
    byLevel.set(b.tower, list);
  }
  if (byLevel.size === 0) return undefined;
  const level = Math.min(...byLevel.keys());
  return { level, floorsAway: level - ctx.towerLevel, quests: byLevel.get(level)! };
}

export function getUnlockSuggestions(ctx: Ctx, limit = 3): UnlockSuggestion[] {
  const suggestions: UnlockSuggestion[] = [];

  const tower = nextTowerUnlock(ctx);
  if (tower) suggestions.push({ kind: 'tower', ...tower });

  // Finishing an active quest opens the quests it unlocks that have nothing else in the way
  for (const quest of allQuests) {
    if (ctx.questStatuses[quest.id] !== 'active') continue;
    const opens = getUnlocks(quest).filter((u) => {
      if (!isPending(u, ctx.questStatuses)) return false;
      const b = getQuestBlockers(u, ctx);
      return b.tower === undefined && b.skills.length === 0;
    });
    if (opens.length > 0) suggestions.push({ kind: 'quest', quest, quests: opens });
  }

  // Most quests opened first; on a tie, prefer opening a new questline over the next step of the same one
  const opensNewLine = (s: UnlockSuggestion) =>
    s.kind === 'quest' && s.quests.some((q) => q.questline !== s.quest.questline) ? 1 : 0;
  return suggestions
    .sort((a, b) => b.quests.length - a.quests.length || opensNewLine(b) - opensNewLine(a))
    .slice(0, limit);
}

export function describeBlockers(b: QuestBlockers, towerLevel: number, fromQuestline: string): string[] {
  const parts: string[] = [];
  if (b.prereq) {
    const name = b.prereq.questline && b.prereq.questline !== fromQuestline ? `${b.prereq.name} (${b.prereq.questline})` : b.prereq.name;
    parts.push(`finish ${name}`);
  }
  if (b.tower !== undefined) parts.push(`reach Tower ${b.tower} (you're at ${towerLevel})`);
  parts.push(...b.skills.map((s) => `reach ${s}`));
  return parts;
}
