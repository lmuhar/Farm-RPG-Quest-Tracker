// How many of each item your active quests need, counted the same way as the
// tracker's STARMAPS & PAMRATS page: quests that take their items add up,
// STARMAPS/PAMRATS only check you hold them (so the larger amount counts), and
// crafting a held item from another held item comes on top.
import questsData from '../../src/data/quests.json';
import { isHoldQuest, questLabel } from '../../src/questNeeds';
import { buildHoldPlan } from '../../src/holdQuests';
import { parseItems } from '../../src/utils';
import type { Quest, QuestStatus } from '../../src/types';

const allQuests = questsData as Quest[];

export interface NeedLine { label: string; qty: number; kind: 'quest' | 'hold' | 'craft' }

export interface ItemNeed {
  have: number;
  need: number;
  state: 'short' | 'ok' | 'hold';
  lines: NeedLine[];
}

export function activeQuests(statuses: Record<string, QuestStatus>): Quest[] {
  return allQuests.filter((q) => statuses[q.id] === 'active');
}

export function itemNeeds(
  statuses: Record<string, QuestStatus>,
  inventory: Record<string, number>,
): Map<string, ItemNeed> {
  const taken = new Map<string, number>();
  const held = new Map<string, number>();
  const lines = new Map<string, NeedLine[]>();
  const addLine = (item: string, line: NeedLine) => lines.set(item, [...(lines.get(item) ?? []), line]);

  for (const q of activeQuests(statuses)) {
    const hold = isHoldQuest(q);
    for (const { item, quantity } of parseItems(q.itemsRequired)) {
      if (hold) held.set(item, Math.max(held.get(item) ?? 0, quantity));
      else taken.set(item, (taken.get(item) ?? 0) + quantity);
      addLine(item, { label: questLabel(q), qty: quantity, kind: hold ? 'hold' : 'quest' });
    }
  }

  // Held items that crafting another held item would use up
  const draws = new Map<string, number>();
  if (held.size) {
    for (const row of buildHoldPlan(statuses, inventory).rows) {
      if (!held.has(row.item)) continue;
      for (const d of row.craftDraws) {
        draws.set(row.item, (draws.get(row.item) ?? 0) + d.qty);
        addLine(row.item, { label: `${d.product} (crafting)`, qty: d.qty, kind: 'craft' });
      }
    }
  }

  const out = new Map<string, ItemNeed>();
  for (const [item, itemLines] of lines) {
    const t = taken.get(item) ?? 0;
    const h = held.get(item) ?? 0;
    const c = draws.get(item) ?? 0;
    const need = t + h + c;
    const have = inventory[item] ?? 0;
    out.set(item, {
      have,
      need,
      state: have >= need ? 'ok' : h >= t + c ? 'hold' : 'short',
      lines: itemLines,
    });
  }
  return out;
}
