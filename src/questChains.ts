import questsData from './data/quests.json';
import type { Quest } from './types';

// Quest unlock chains from buddy.farm: each quest's `prereqId` is the quest that
// unlocks it. Chains can cross questlines (e.g. Dig In III → Hello Hollow Holler I).

const allQuests = questsData as Quest[];
const questById = new Map(allQuests.map((q) => [q.id, q]));
const unlocksById = new Map<string, Quest[]>();
for (const q of allQuests) {
  if (!q.prereqId) continue;
  const list = unlocksById.get(q.prereqId) ?? [];
  list.push(q);
  unlocksById.set(q.prereqId, list);
}

export function getPrereq(quest: Quest): Quest | undefined {
  return quest.prereqId ? questById.get(quest.prereqId) : undefined;
}

export function getUnlocks(quest: Quest): Quest[] {
  return unlocksById.get(quest.id) ?? [];
}

// "Sol Good I" or "Sol Good I (Sol Good)" when it's in a different questline
export function chainLabel(quest: Quest, fromQuestline: string): string {
  return quest.questline && quest.questline !== fromQuestline ? `${quest.name} (${quest.questline})` : quest.name;
}
