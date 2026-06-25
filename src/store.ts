import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, PlayerProfile, QuestStatus } from './types';

interface Store extends AppState {
  setQuestStatus: (id: string, status: QuestStatus) => void;
  setInventoryItem: (item: string, qty: number) => void;
  setPlayer: (player: PlayerProfile) => void;
  setNpcLevel: (npc: string, level: number) => void;
  setCropTime: (item: string, growMinutes: number) => void;
  removeCropTime: (item: string) => void;
  setPlotCount: (count: number) => void;
  resetAll: () => void;
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

      setQuestStatus: (id, status) =>
        set((s) => ({ questStatuses: { ...s.questStatuses, [id]: status } })),

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
        }),
    }),
    { name: 'farm-rpg-tracker' }
  )
);
