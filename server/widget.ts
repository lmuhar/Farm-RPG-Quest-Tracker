// What the iOS widget shows, worked out from the saved tracker state with the
// same code the app and the Chrome extension use.
import { itemNeeds, activeQuests } from '../src/itemNeeds';
import { HOLD_LINES, buildHoldPlan, currentIndex, shortQuestName } from '../src/holdQuests';
import { parseItems } from '../src/utils';
import type { CropTime, GrowQueueItem, QuestStatus } from '../src/types';

interface SavedState {
  questStatuses?: Record<string, QuestStatus>;
  inventory?: Record<string, number>;
  masteryProgress?: Record<string, number>;
  growQueue?: GrowQueueItem[];
  cropTimes?: CropTime[];
}

export interface WidgetSummary {
  updatedAt: string;
  activeQuestCount: number;
  holdLines: { line: string; quest: string | null; items: number; short: number }[];
  itemsShort: number;
  needed: { item: string; have: number; need: number; hold: boolean }[];
  mastery: { item: string; count: number; target: number }[];
  growQueue: { item: string; grows: number; totalMinutes: number | null }[];
}

export function widgetSummary(state: SavedState, updatedAt: string): WidgetSummary {
  const statuses = state.questStatuses ?? {};
  const inventory = state.inventory ?? {};

  // STARMAPS / PAMRATS: the quest you're on and how many of its items are short
  const plan = buildHoldPlan(statuses, inventory);
  const shortBy = new Map(plan.rows.map((r) => [r.item, r.short]));
  const holdLines = HOLD_LINES.map((line) => {
    const idx = currentIndex(line, statuses);
    if (idx === null) return { line: line.short, quest: null, items: 0, short: 0 };
    const quest = line.quests[idx];
    const items = parseItems(quest.itemsRequired);
    return {
      line: line.short,
      quest: shortQuestName(line, quest),
      items: items.length,
      short: items.filter(({ item }) => (shortBy.get(item) ?? 0) > 0).length,
    };
  });

  // Active quests' items, counted like the extension's badges; least covered first
  const short = [...itemNeeds(statuses, inventory)]
    .filter(([, n]) => n.state !== 'ok')
    .map(([item, n]) => ({ item, have: n.have, need: n.need, hold: n.state === 'hold' }))
    .sort((a, b) => a.have / a.need - b.have / b.need || b.need - a.need);

  // Mastery milestones closest to done (10K, 100K, then 1M)
  const mastery = Object.entries(state.masteryProgress ?? {})
    .map(([item, count]) => ({ item, count, target: count < 10_000 ? 10_000 : count < 100_000 ? 100_000 : 1_000_000 }))
    .filter((m) => m.count < m.target)
    .sort((a, b) => b.count / b.target - a.count / a.target)
    .slice(0, 6);

  const cropMinutes = new Map((state.cropTimes ?? []).map((c) => [c.item, c.growMinutes]));
  const growQueue = (state.growQueue ?? [])
    .filter((g) => g.grows > 0)
    .map((g) => ({ item: g.item, grows: g.grows, totalMinutes: cropMinutes.has(g.item) ? g.grows * cropMinutes.get(g.item)! : null }));

  return {
    updatedAt,
    activeQuestCount: activeQuests(statuses).length,
    holdLines,
    itemsShort: short.length,
    needed: short.slice(0, 8),
    mastery,
    growQueue: growQueue.slice(0, 4),
  };
}
