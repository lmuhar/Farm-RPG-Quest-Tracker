import towerMasteryData from './data/tower-mastery-items.json';

// From level 201 each Tower level also needs specific items mastered: Mega
// Mastery (1M) for 201–300, then a mix of Grand (100K) and Mega from 301.
// Source: the in-game Library page "Tower Masteries" (buddy.farm only lists
// the Mega Mastery count), kept in tower-mastery-items.json.

export const MASTERY_COUNT = { 2: 100_000, 3: 1_000_000 } as const;
export type MasteryTier = keyof typeof MASTERY_COUNT; // 2 = Grand, 3 = Mega

interface LevelEntry { level: number; grandMaster?: string[]; megaMaster: string[] }
const levels = towerMasteryData as LevelEntry[];

export interface TowerMasteryStatus {
  level: number;
  item: string;
  tier: MasteryTier;
  target: number;
  count: number;
  estimated: boolean; // no synced count: count is the floor of the mastery level you have
  done: boolean;
  pct: number; // 0–1
}

function status(level: number, item: string, tier: MasteryTier, masteryLevels: Record<string, number>, masteryProgress: Record<string, number>): TowerMasteryStatus {
  const target = MASTERY_COUNT[tier];
  const lv = masteryLevels[item] ?? 0;
  const synced = masteryProgress[item];
  // Older Mastery syncs didn't keep counts past 100K, so fall back to your tier's floor
  const floor = lv >= 2 ? 100_000 : lv >= 1 ? 10_000 : 0;
  const count = Math.max(synced ?? 0, floor);
  const estimated = (synced ?? 0) < floor;
  const done = lv >= tier || count >= target;
  return { level, item, tier, target, count, estimated, done, pct: done ? 1 : Math.min(1, count / target) };
}

// Every tower level's item requirements, with your progress
export function towerMasteryByLevel(
  masteryLevels: Record<string, number>,
  masteryProgress: Record<string, number>,
): Map<number, TowerMasteryStatus[]> {
  const map = new Map<number, TowerMasteryStatus[]>();
  for (const l of levels) {
    map.set(l.level, [
      ...(l.grandMaster ?? []).map((item) => status(l.level, item, 2, masteryLevels, masteryProgress)),
      ...l.megaMaster.map((item) => status(l.level, item, 3, masteryLevels, masteryProgress)),
    ]);
  }
  return map;
}

// Unfinished requirements for floors you haven't climbed yet, nearest first
export function upcomingTowerMasteries(state: {
  towerLevel: number;
  masteryLevels: Record<string, number>;
  masteryProgress: Record<string, number>;
}): TowerMasteryStatus[] {
  return [...towerMasteryByLevel(state.masteryLevels, state.masteryProgress).values()]
    .flat()
    .filter((r) => r.level > state.towerLevel && !r.done);
}
