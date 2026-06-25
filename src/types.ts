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

export interface AppState {
  questStatuses: Record<string, QuestStatus>;
  inventory: Record<string, number>;
  player: PlayerProfile;
  cropTimes: CropTime[];
  plotCount: number;
  craftingRecipes: Record<string, ParsedItem[]>;
  growQueue: GrowQueueItem[];
  questNotes: Record<string, string>;
}
