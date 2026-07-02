import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, GrowQueueItem, ParsedItem, PlayerProfile, Quest, QuestStatus } from './types';
import questsData from './data/quests.json';
import { compareQuests, getQuestStatus } from './utils';

// Set when auto-advance activates the next quest, consumed once by QuestCard on mount
let _pendingExpandId: string | null = null;
export const getPendingExpandId = () => {
  const id = _pendingExpandId;
  _pendingExpandId = null;
  return id;
};

const allQuests = questsData as Quest[];

// Build questline groups sorted by Roman numeral order, for auto-advance
const questlineMap = new Map<string, Quest[]>();
for (const q of allQuests) {
  if (!q.questline) continue;
  if (!questlineMap.has(q.questline)) questlineMap.set(q.questline, []);
  questlineMap.get(q.questline)!.push(q);
}
for (const [, qs] of questlineMap) qs.sort((a, b) => compareQuests(a.name, b.name));

interface Store extends AppState {
  setQuestStatus: (id: string, status: QuestStatus) => void;
  setInventoryItem: (item: string, qty: number) => void;
  setPlayer: (player: PlayerProfile) => void;
  setNpcLevel: (npc: string, level: number) => void;
  setCropTime: (item: string, growMinutes: number) => void;
  removeCropTime: (item: string) => void;
  setPlotCount: (count: number) => void;
  resetAll: () => void;
  importState: (data: Partial<AppState>) => void;
  setCraftingRecipe: (item: string, ingredients: ParsedItem[]) => void;
  removeCraftingRecipe: (item: string) => void;
  setGrowQueue: (queue: GrowQueueItem[]) => void;
  setQuestNote: (id: string, note: string) => void;
}

const defaultCropTimes = [
  { item: 'Peppers',     growMinutes: 0.183 },  // 11 secs
  { item: 'Carrot',      growMinutes: 0.383 },  // 23 secs
  { item: 'Peas',        growMinutes: 0.583 },  // 35 secs
  { item: 'Cucumber',    growMinutes: 0.783 },  // 47 secs
  { item: 'Eggplant',    growMinutes: 1 },
  { item: 'Radish',      growMinutes: 2 },
  { item: 'Onion',       growMinutes: 3 },
  { item: 'Hops',        growMinutes: 4 },
  { item: 'Potato',      growMinutes: 5 },
  { item: 'Tomato',      growMinutes: 6 },
  { item: 'Mushroom',    growMinutes: 18 },
  { item: 'Leek',        growMinutes: 12 },
  { item: 'Watermelon',  growMinutes: 24 },
  { item: 'Corn',        growMinutes: 38.4 },   // 38m 24s
  { item: 'Sugar Cane',  growMinutes: 90 },
  { item: 'Cabbage',     growMinutes: 96 },
  { item: 'Pine',        growMinutes: 96 },
  { item: 'Pumpkin',     growMinutes: 144 },
  { item: 'Wheat',       growMinutes: 288 },    // 4h 48m
  { item: 'Broccoli',    growMinutes: 576 },    // 9h 36m
  { item: 'Cotton',      growMinutes: 1152 },   // 19h 12m
];

const defaultPlayer: PlayerProfile = {
  farmingLv: 1,
  fishingLv: 1,
  craftingLv: 1,
  exploringLv: 1,
  npcLevels: {},
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      questStatuses: {},
      inventory: {},
      player: defaultPlayer,
      cropTimes: defaultCropTimes,
      plotCount: 28,
      craftingRecipes: {},
      growQueue: [],
      questNotes: {},

      setQuestStatus: (id, status) =>
        set((s) => {
          const updated = { ...s.questStatuses, [id]: status };

          // Auto-advance: when completing a quest in a line, activate the next one if requirements met
          if (status === 'completed') {
            const quest = allQuests.find((q) => q.id === id);
            if (quest?.questline) {
              const line = questlineMap.get(quest.questline) ?? [];
              const idx = line.findIndex((q) => q.id === id);
              const next = line[idx + 1];
              if (next && !updated[next.id]) {
                const nextStatus = getQuestStatus(next, s.player, updated);
                if (nextStatus === 'available') {
                  updated[next.id] = 'active';
                  _pendingExpandId = next.id;
                }
              }
            }
          }

          return { questStatuses: updated };
        }),

      setInventoryItem: (item, qty) =>
        set((s) => ({ inventory: { ...s.inventory, [item]: qty } })),

      setPlayer: (player) => set({ player }),

      setNpcLevel: (npc, level) =>
        set((s) => ({
          player: {
            ...s.player,
            npcLevels: { ...s.player.npcLevels, [npc]: level },
          },
        })),

      setCropTime: (item, growMinutes) =>
        set((s) => {
          const existing = s.cropTimes.filter((c) => c.item !== item);
          return { cropTimes: [...existing, { item, growMinutes }] };
        }),

      removeCropTime: (item) =>
        set((s) => ({ cropTimes: s.cropTimes.filter((c) => c.item !== item) })),

      setPlotCount: (plotCount) => set({ plotCount }),

      resetAll: () =>
        set({
          questStatuses: {},
          inventory: {},
          player: defaultPlayer,
          cropTimes: defaultCropTimes,
          plotCount: 28,
          craftingRecipes: {},
          growQueue: [],
          questNotes: {},
        }),

      importState: (data) =>
        set((s) => ({
          // Merge questStatuses so importing partial data doesn't wipe active/other quests
          questStatuses: data.questStatuses
            ? { ...s.questStatuses, ...data.questStatuses }
            : s.questStatuses,
          inventory: data.inventory ?? s.inventory,
          player: data.player ?? s.player,
          cropTimes: data.cropTimes ?? s.cropTimes,
          plotCount: data.plotCount ?? s.plotCount,
          craftingRecipes: data.craftingRecipes ?? s.craftingRecipes,
          growQueue: data.growQueue ?? s.growQueue,
          questNotes: data.questNotes ?? s.questNotes,
        })),

      setCraftingRecipe: (item, ingredients) =>
        set((s) => ({ craftingRecipes: { ...s.craftingRecipes, [item]: ingredients } })),

      removeCraftingRecipe: (item) =>
        set((s) => {
          const recipes = { ...s.craftingRecipes };
          delete recipes[item];
          return { craftingRecipes: recipes };
        }),

      setGrowQueue: (growQueue) => set({ growQueue }),

      setQuestNote: (id, note) =>
        set((s) => ({ questNotes: { ...s.questNotes, [id]: note } })),
    }),
    { name: 'farm-rpg-tracker' }
  )
);
