export interface Quest {
  id: string;
  name: string;
  npc: string;
  requiredNpcLevel: number;
  itemsRequired: string;
  rewardItems: string;
  questline: string;
  startDate: string;
  endDate: string;
  farmingLv: number;
  fishingLv: number;
  craftingLv: number;
  exploringLv: number;
  description: string;
}

export interface ParsedItem {
  quantity: number;
  item: string;
}

export interface PlayerProfile {
  farmingLv: number;
  fishingLv: number;
  craftingLv: number;
  exploringLv: number;
  npcLevels: Record<string, number>;
}

export interface CropTime {
  item: string;
  growMinutes: number;
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';

export interface GrowQueueItem {
  item: string;
  grows: number;
}

export interface Pet {
  id: number;
  name: string;
  cost: number;
  order: number;
  requiredFarmingLevel: number;
  requiredFishingLevel: number;
  requiredCraftingLevel: number;
  requiredExploringLevel: number;
  requiredCookingLevel: number;
  loot: Record<string, string[]>;
}

export interface AppState {
  questStatuses: Record<string, QuestStatus>;
  inventory: Record<string, number>;
  player: PlayerProfile;
  cropTimes: CropTime[];
  plotCount: number;
  inventoryMax: number;
  craftingRecipes: Record<string, ParsedItem[]>;
  growQueue: GrowQueueItem[];
  questNotes: Record<string, string>;
  pinnedQuestline: string | null;
  ownedPets: Record<number, number>;
  towerLevel: number;
  trackedQuestline: string;
  mastered: number;
  grandMastered: number;
  megaMastered: number;
  craftworksSlots: number;
  inventoryGoal: number;
  dailyGain: number;
  dailyResetTime: string;
  masteryLevels: Record<string, number>;
}
