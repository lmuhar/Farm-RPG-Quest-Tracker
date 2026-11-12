import shippedData from './data/tower-mastery-items.json';

// From level 201 the Tower also asks for one specific item to be Mega Mastered
// (1M) before you can climb. The game only reveals the next level's item, and
// buddy.farm doesn't list them, so known ones ship in tower-mastery-items.json
// and you can record new ones from the Tower page (stored in the save).
// A saved entry of '' hides a shipped one.

export const MEGA_MASTERY_COUNT = 1_000_000;

export interface TowerMasteryRequirement {
  level: number;
  item: string;
  userAdded: boolean;
}

const shipped = shippedData as Record<string, string>;

export function towerMasteryRequirements(saved: Record<string, string>): TowerMasteryRequirement[] {
  const merged: Record<string, { item: string; userAdded: boolean }> = {};
  for (const [lv, item] of Object.entries(shipped)) merged[lv] = { item, userAdded: false };
  for (const [lv, item] of Object.entries(saved)) merged[lv] = { item, userAdded: shipped[lv] !== item };
  return Object.entries(merged)
    .filter(([, v]) => v.item)
    .map(([lv, v]) => ({ level: Number(lv), ...v }))
    .sort((a, b) => a.level - b.level);
}

export interface TowerMasteryStatus extends TowerMasteryRequirement {
  done: boolean;
  count: number;      // mastery progress (crafts / catches / …) toward 1M
  pct: number;        // 0–1
}

export function towerMasteryStatus(
  req: TowerMasteryRequirement,
  masteryLevels: Record<string, number>,
  masteryProgress: Record<string, number>,
): TowerMasteryStatus {
  const count = masteryProgress[req.item] ?? 0;
  const done = (masteryLevels[req.item] ?? 0) >= 3 || count >= MEGA_MASTERY_COUNT;
  return { ...req, done, count, pct: done ? 1 : Math.min(1, count / MEGA_MASTERY_COUNT) };
}

// Known requirements for floors you haven't climbed yet that still need mastering
export function upcomingTowerMasteries(state: {
  towerLevel: number;
  towerMasteryItems: Record<string, string>;
  masteryLevels: Record<string, number>;
  masteryProgress: Record<string, number>;
}): TowerMasteryStatus[] {
  return towerMasteryRequirements(state.towerMasteryItems)
    .filter((r) => r.level > state.towerLevel)
    .map((r) => towerMasteryStatus(r, state.masteryLevels, state.masteryProgress))
    .filter((r) => !r.done);
}
