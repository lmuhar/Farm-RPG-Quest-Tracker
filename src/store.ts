import { create } from 'zustand';
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
  toggleNpcLevelingComplete: (npc: string) => void;
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
  setMasteryProgress: (item: string, count: number) => void;
  mergeMasteryProgress: (data: Record<string, number>) => void;
  replaceMasteryProgress: (data: Record<string, number>) => void;
}

// Crop grow times with every Farm Supply speed perk (80% off base time), in
// minutes. Tower floor 10's Enriched Soil perk takes off another 10% of base
// time, halving these — see cropTimesForTower.
const farmSupplyCropTimes = [
  { item: 'Peppers',      growMinutes: 0.183 },   // ~11 secs
  { item: 'Gold Peppers', growMinutes: 0.183 },
  { item: 'Carrot',       growMinutes: 0.383 },   // ~23 secs
  { item: 'Gold Carrot',  growMinutes: 0.383 },
  { item: 'Peas',         growMinutes: 0.583 },   // ~35 secs
  { item: 'Gold Peas',    growMinutes: 0.583 },
  { item: 'Cucumber',   growMinutes: 0.783 },   // ~47 secs
  { item: 'Eggplant',   growMinutes: 1 },
  { item: 'Radish',     growMinutes: 2 },
  { item: 'Onion',      growMinutes: 3 },
  { item: 'Hops',       growMinutes: 4 },
  { item: 'Potato',     growMinutes: 5 },
  { item: 'Tomato',     growMinutes: 6 },
  { item: 'Leek',       growMinutes: 12 },
  { item: 'Mushroom',   growMinutes: 18 },
  { item: 'Watermelon', growMinutes: 24 },
  { item: 'Corn',       growMinutes: 38.4 },    // 38m 24s
  { item: 'Sugar Cane', growMinutes: 90 },
  { item: 'Cabbage',    growMinutes: 96 },
  { item: 'Pine Tree',  growMinutes: 96 },
  { item: 'Pumpkin',    growMinutes: 144 },
  { item: 'Wheat',      growMinutes: 288 },     // 4h 48m
  { item: 'Broccoli',   growMinutes: 576 },     // 9h 36m
  { item: 'Cotton',     growMinutes: 1152 },    // 19h 12m
  { item: 'Sunflower',  growMinutes: 1728 },    // 1d 4h 48m
  { item: 'Beet',       growMinutes: 2592 },    // 1d 19h 12m
  { item: 'Rice',       growMinutes: 2880 },    // 2d
];
const knownCrops = new Set(farmSupplyCropTimes.map((c) => c.item));

export const ENRICHED_SOIL_FLOOR = 10;

// Grow times for a tower level: once Enriched Soil (floor 10) is unlocked the
// total reduction goes from 80% to 90% of base time, i.e. every crop grows in
// half the time.
export function cropTimesForTower(towerLevel: number): { item: string; growMinutes: number }[] {
  const factor = towerLevel >= ENRICHED_SOIL_FLOOR ? 0.5 : 1;
  return farmSupplyCropTimes.map((c) => ({ item: c.item, growMinutes: Math.round(c.growMinutes * factor * 10000) / 10000 }));
}

const defaultCropTimes = cropTimesForTower(0);

const defaultPlayer: PlayerProfile = {
  farmingLv: 1,
  fishingLv: 1,
  craftingLv: 1,
  exploringLv: 1,
  cookingLv: 1,
  miningLv: 1,
  npcLevels: {},
};

// Known crops always take their time from the tower level (older saves stored
// whichever default was current at the time); only custom crops are kept as saved.
function mergeCropTimes(
  saved: { item: string; growMinutes: number }[],
  towerLevel: number,
): { item: string; growMinutes: number }[] {
  // Migrate old "Beets" → "Beet" to match quest item names
  const custom = saved
    .map((c) => c.item === 'Beets' ? { ...c, item: 'Beet' } : c)
    .filter((c) => !knownCrops.has(c.item));
  return [...cropTimesForTower(towerLevel), ...custom];
}

export const useStore = create<Store>()((set) => ({
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
      masteryProgress: {},
      borgenShops: {},

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

      toggleNpcLevelingComplete: (npc) =>
        set((s) => {
          const current = s.player.completedNpcLeveling ?? [];
          const next = current.includes(npc)
            ? current.filter((n) => n !== npc)
            : [...current, npc];
          return { player: { ...s.player, completedNpcLeveling: next } };
        }),

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
          masteryProgress: {},
      borgenShops: {},
        }),

      importState: (data) =>
        set((s) => ({
          // Merge questStatuses so importing partial data doesn't wipe active/other quests
          questStatuses: data.questStatuses
            ? { ...s.questStatuses, ...data.questStatuses }
            : s.questStatuses,
          inventory: data.inventory ?? s.inventory,
          player: data.player ?? s.player,
          cropTimes: mergeCropTimes(data.cropTimes ?? s.cropTimes, data.towerLevel ?? s.towerLevel),
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
          masteryProgress: data.masteryProgress
            ? { ...s.masteryProgress, ...data.masteryProgress }
            : s.masteryProgress,
          borgenShops: data.borgenShops ? { ...s.borgenShops, ...data.borgenShops } : s.borgenShops,
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

      setTowerLevel: (towerLevel) =>
        set((s) => ({ towerLevel, cropTimes: mergeCropTimes(s.cropTimes, towerLevel) })),

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

      setMasteryProgress: (item, count) =>
        set((s) => ({
          masteryProgress: { ...s.masteryProgress, [item]: count },
        })),

      mergeMasteryProgress: (data) =>
        set((s) => ({
          masteryProgress: { ...s.masteryProgress, ...data },
        })),

      replaceMasteryProgress: (data) => set({ masteryProgress: data }),
    }));
