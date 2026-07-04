import type { Quest, ParsedItem, PlayerProfile, QuestStatus } from './types';

// Longest-match-first Roman numeral table
const ROMAN_MAP: [string, number][] = [
  ['XVIII', 18], ['XVII', 17], ['XVI', 16], ['XIX', 19], ['XV', 15],
  ['XIV', 14], ['XIII', 13], ['XII', 12], ['XI', 11], ['VIII', 8],
  ['VII', 7], ['VI', 6], ['XX', 20], ['XXX', 30], ['XL', 40],
  ['L', 50], ['IV', 4], ['IX', 9], ['III', 3], ['II', 2],
  ['I', 1], ['V', 5], ['X', 10],
];
export function parseRoman(s: string): number {
  let total = 0;
  let i = 0;
  const upper = s.toUpperCase();
  while (i < upper.length) {
    let matched = false;
    for (const [token, val] of ROMAN_MAP) {
      if (upper.startsWith(token, i)) {
        total += val;
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return total;
}

export function questSortKey(name: string): [string, number] {
  // Split off a trailing Roman numeral, e.g. "Big Boom III" → ["Big Boom", 3]
  const match = name.match(/^(.*?)\s+([IVXLCDM]+)$/i);
  if (match) {
    const num = parseRoman(match[2]);
    if (num > 0) return [match[1], num];
  }
  return [name, 0];
}

export function compareQuests(a: string, b: string): number {
  const [baseA, numA] = questSortKey(a);
  const [baseB, numB] = questSortKey(b);
  if (baseA !== baseB) return baseA.localeCompare(baseB);
  return numA - numB;
}

export function parseItems(raw: string): ParsedItem[] {
  if (!raw || raw.trim() === 'None' || raw.trim() === '') return [];
  return raw.split(';').map((s) => {
    const trimmed = s.trim();
    const match = trimmed.match(/^(\d+)x\s+(.+)$/);
    if (match) return { quantity: parseInt(match[1]), item: match[2].trim() };
    return { quantity: 1, item: trimmed };
  });
}

export function getQuestStatus(
  quest: Quest,
  player: PlayerProfile,
  statuses: Record<string, QuestStatus>
): QuestStatus {
  const saved = statuses[quest.id];
  if (saved === 'completed' || saved === 'active') return saved;

  const npcLevel = player.npcLevels[quest.npc] ?? 0;
  const meetsSkills =
    player.farmingLv >= quest.farmingLv &&
    player.fishingLv >= quest.fishingLv &&
    player.craftingLv >= quest.craftingLv &&
    player.exploringLv >= quest.exploringLv;
  const meetsNpc = npcLevel >= quest.requiredNpcLevel;

  if (meetsSkills && meetsNpc) return 'available';
  return 'locked';
}

export function resolveRawIngredients(
  item: string,
  quantity: number,
  recipeMap: Map<string, { ingredients: { item: string; quantity: number }[] }>,
  visited = new Set<string>()
): Map<string, number> {
  const recipe = recipeMap.get(item.toLowerCase());
  if (!recipe || visited.has(item.toLowerCase())) {
    return new Map([[item, quantity]]);
  }
  const nextVisited = new Set(visited);
  nextVisited.add(item.toLowerCase());
  const result = new Map<string, number>();
  for (const { item: ing, quantity: ingQty } of recipe.ingredients) {
    for (const [raw, rawQty] of resolveRawIngredients(ing, ingQty * quantity, recipeMap, nextVisited)) {
      result.set(raw, (result.get(raw) ?? 0) + rawQty);
    }
  }
  return result;
}

export function isLimitedTime(quest: Quest): boolean {
  return quest.startDate !== '' || quest.endDate !== '';
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) {
    const m = Math.floor(minutes);
    const s = Math.round((minutes - m) * 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function calcGrowsNeeded(qty: number, plotCount: number): number {
  return Math.ceil(qty / plotCount);
}

export function npcColor(npc: string): string {
  const colors: Record<string, string> = {
    Thomas: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    Rosalie: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    Holger: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    Cecil: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    Beatrix: 'bg-red-500/20 text-red-300 border-red-500/30',
    Jill: 'bg-green-500/20 text-green-300 border-green-500/30',
    George: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    Lorn: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    Buddy: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  };
  return colors[npc] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
}

export function isCompletable(quest: Quest, inventory: Record<string, number>): boolean {
  const items = parseItems(quest.itemsRequired);
  if (items.length === 0) return true;
  return items.every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity);
}

export function statusColor(status: QuestStatus): string {
  switch (status) {
    case 'completed': return 'border-green-500/50 bg-green-500/5';
    case 'active': return 'border-yellow-500/50 bg-yellow-500/5';
    case 'available': return 'border-slate-600 bg-slate-800/50';
    case 'locked': return 'border-slate-700/50 bg-slate-900/30 opacity-60';
  }
}
