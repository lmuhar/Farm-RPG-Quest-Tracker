import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, GrowQueueItem, ParsedItem, PlayerProfile, Quest, QuestStatus } from './types';
import questsData from './data/quests.json';
import { compareQuests } from './utils';

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
  setInventoryMax: (max: number) => void;
  resetAll: () => void;
  importState: (data: Partial<AppState>) => void;
  setCraftingRecipe: (item: string, ingredients: ParsedItem[]) => void;
  removeCraftingRecipe: (item: string) => void;
  setGrowQueue: (queue: GrowQueueItem[]) => void;
  setQuestNote: (id: string, note: string) => void;
  setPinnedQuestline: (name: string | null) => void;
  setOwnedPetLevel: (petId: number, level: number) => void;
  setTowerLevel: (level: number) => void;
  setTrackedQuestline: (name: string) => void;
  setMastered: (count: number) => void;
  setGrandMastered: (count: number) => void;
  setMegaMastered: (count: number) => void;
  setCraftworksSlots: (count: number) => void;
  setInventoryGoal: (goal: number) => void;
  setDailyGain: (gain: number) => void;
  setDailyResetTime: (time: string) => void;
  setMasteryLevel: (item: string, level: number) => void;
}

const defaultCropTimes = [
  { item: 'Peppers',    growMinutes: 0.0915 },  // ~5.5 secs
  { item: 'Carrot',     growMinutes: 0.1915 },  // ~11.5 secs
  { item: 'Peas',       growMinutes: 0.2915 },  // ~17.5 secs
  { item: 'Cucumber',   growMinutes: 0.3915 },  // ~23.5 secs
  { item: 'Eggplant',   growMinutes: 0.5 },     // 30 secs
  { item: 'Radish',     growMinutes: 1 },
  { item: 'Onion',      growMinutes: 1.5 },
  { item: 'Hops',       growMinutes: 2 },
  { item: 'Potato',     growMinutes: 2.5 },
  { item: 'Tomato',     growMinutes: 3 },
  { item: 'Leek',       growMinutes: 6 },
  { item: 'Mushroom',   growMinutes: 9 },
  { item: 'Watermelon', growMinutes: 12 },
  { item: 'Corn',       growMinutes: 19.2 },    // 19m 12s
  { item: 'Sugar Cane', growMinutes: 45 },
  { item: 'Cabbage',    growMinutes: 48 },
  { item: 'Pine Tree',  growMinutes: 48 },
  { item: 'Pumpkin',    growMinutes: 72 },
  { item: 'Wheat',      growMinutes: 144 },     // 2h 24m
  { item: 'Broccoli',   growMinutes: 288 },     // 4h 48m
  { item: 'Cotton',     growMinutes: 576 },     // 9h 36m
  { item: 'Sunflower',  growMinutes: 864 },     // 14h 24m
  { item: 'Beet',       growMinutes: 1296 },    // 21h 36m
  { item: 'Rice',       growMinutes: 1440 },    // 1d
];

const defaultPlayer: PlayerProfile = {
  farmingLv: 1,
  fishingLv: 1,
  craftingLv: 1,
  exploringLv: 1,
  npcLevels: {},
};

// Merge saved crop times with defaults: saved entries win, new defaults fill gaps
function mergeCropTimes(
  saved: { item: string; growMinutes: number }[]
): { item: string; growMinutes: number }[] {
  // Migrate old "Beets" → "Beet" to match quest item names
  const migrated = saved.map((c) => c.item === 'Beets' ? { ...c, item: 'Beet' } : c);
  const savedItems = new Set(migrated.map((c) => c.item));
  return [...defaultCropTimes.filter((d) => !savedItems.has(d.item)), ...migrated];
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      questStatuses: {},
      inventory: {},
      player: defaultPlayer,
      cropTimes: defaultCropTimes,
      plotCount: 36,
      inventoryMax: 654,
      craftingRecipes: {},
      growQueue: [],
      questNotes: {},
      pinnedQuestline: null,
      ownedPets: {},
      towerLevel: 0,
      trackedQuestline: 'A Towering Investment',
      mastered: 0,
      grandMastered: 0,
      megaMastered: 0,
      craftworksSlots: 5,
      inventoryGoal: 1000,
      dailyGain: 14,
      dailyResetTime: '00:00',
      masteryLevels: {},

      setQuestStatus: (id, status) =>
        set((s) => {
          const updated = { ...s.questStatuses, [id]: status };

          // Auto-advance: when completing a quest in a line, activate the next one.
          // Completing a quest grants the NPC friendship that unlocks the next tier,
          // so level-checking here incorrectly blocks quests that just became reachable.
          if (status === 'completed') {
            const quest = allQuests.find((q) => q.id === id);
            if (quest?.questline) {
              const line = questlineMap.get(quest.questline) ?? [];
              const idx = line.findIndex((q) => q.id === id);
              const next = line[idx + 1];
              if (next && !updated[next.id]) {
                updated[next.id] = 'active';
                _pendingExpandId = next.id;
              }
            }
          }

          return { questStatuses: updated };
        }),

      setInventoryItem: (item, qty) =>
        set((s) => {
          if (qty <= 0) {
            const next = { ...s.inventory };
            delete next[item];
            return { inventory: next };
          }
          return { inventory: { ...s.inventory, [item]: qty } };
        }),

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
      setInventoryMax: (inventoryMax) => set({ inventoryMax }),

      resetAll: () =>
        set({
          questStatuses: {},
          inventory: {},
          player: defaultPlayer,
          cropTimes: defaultCropTimes,
          plotCount: 36,
          inventoryMax: 654,
          craftingRecipes: {},
          growQueue: [],
          questNotes: {},
          pinnedQuestline: null,
          ownedPets: {},
          towerLevel: 0,
          trackedQuestline: 'A Towering Investment',
          mastered: 0,
          grandMastered: 0,
          megaMastered: 0,
          craftworksSlots: 5,
          inventoryGoal: 1000,
          dailyGain: 14,
          dailyResetTime: '00:00',
          masteryLevels: {},
        }),

      importState: (data) =>
        set((s) => ({
          // Merge questStatuses so importing partial data doesn't wipe active/other quests
          questStatuses: data.questStatuses
            ? { ...s.questStatuses, ...data.questStatuses }
            : s.questStatuses,
          inventory: data.inventory ?? s.inventory,
          player: data.player ?? s.player,
          cropTimes: data.cropTimes ? mergeCropTimes(data.cropTimes) : s.cropTimes,
          plotCount: data.plotCount ?? s.plotCount,
          inventoryMax: data.inventoryMax ?? s.inventoryMax,
          craftingRecipes: data.craftingRecipes ?? s.craftingRecipes,
          growQueue: data.growQueue ?? s.growQueue,
          questNotes: data.questNotes ?? s.questNotes,
          pinnedQuestline: data.pinnedQuestline ?? s.pinnedQuestline,
          ownedPets: data.ownedPets ?? s.ownedPets,
          towerLevel: data.towerLevel ?? s.towerLevel,
          trackedQuestline: data.trackedQuestline ?? s.trackedQuestline,
          mastered: data.mastered ?? s.mastered,
          grandMastered: data.grandMastered ?? s.grandMastered,
          megaMastered: data.megaMastered ?? s.megaMastered,
          craftworksSlots: data.craftworksSlots ?? s.craftworksSlots,
          inventoryGoal: data.inventoryGoal ?? s.inventoryGoal,
          dailyGain: data.dailyGain ?? s.dailyGain,
          dailyResetTime: data.dailyResetTime ?? s.dailyResetTime,
          masteryLevels: data.masteryLevels ?? s.masteryLevels,
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

      setPinnedQuestline: (pinnedQuestline) => set({ pinnedQuestline }),

      setOwnedPetLevel: (petId, level) =>
        set((s) => {
          if (level <= 0) {
            const next = { ...s.ownedPets };
            delete next[petId];
            return { ownedPets: next };
          }
          return { ownedPets: { ...s.ownedPets, [petId]: level } };
        }),

      setTowerLevel: (towerLevel) => set({ towerLevel }),

      setTrackedQuestline: (trackedQuestline) => set({ trackedQuestline }),

      setMastered: (mastered) => set({ mastered }),
      setGrandMastered: (grandMastered) => set({ grandMastered }),
      setMegaMastered: (megaMastered) => set({ megaMastered }),
      setCraftworksSlots: (craftworksSlots) => set({ craftworksSlots }),
      setInventoryGoal: (inventoryGoal) => set({ inventoryGoal }),
      setDailyGain: (dailyGain) => set({ dailyGain }),
      setDailyResetTime: (dailyResetTime) => set({ dailyResetTime }),
      setMasteryLevel: (item, level) =>
        set((s) => {
          if (level <= 0) {
            const next = { ...s.masteryLevels };
            delete next[item];
            return { masteryLevels: next };
          }
          return { masteryLevels: { ...s.masteryLevels, [item]: level } };
        }),
    }),
    {
      name: 'farm-rpg-tracker',
      version: 1,
      migrate: (persistedState, version) => {
        const s = persistedState as Partial<AppState>;
        if (version < 1) {
          // Reset crop times to updated defaults (all crops now 50% faster)
          return { ...s, cropTimes: defaultCropTimes };
        }
        return s;
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState>;
        return {
          ...(current as Store),
          ...(p as object),
          cropTimes: p.cropTimes ? mergeCropTimes(p.cropTimes) : (current as Store).cropTimes,
        };
      },
    }
  )
);
