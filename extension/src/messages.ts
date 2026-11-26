import type { QuestStatus } from '../../src/types';

export type InventorySource = 'Inventory page' | 'Item page' | 'Craftworks' | 'Mastery page';

export type Request =
  | { type: 'status'; refresh?: boolean }
  | { type: 'signIn' }
  | { type: 'signOut' }
  | { type: 'push'; inventory: Record<string, number>; full: boolean; source: InventorySource; allowRemovals?: boolean }
  | { type: 'pushMastery'; levels: Record<string, number>; progress: Record<string, number> };

export interface Change { item: string; delta: number; label?: string }   // label replaces "item ±delta"

export interface Status {
  signedIn: boolean;
  email: string | null;
  questStatuses: Record<string, QuestStatus>;
  inventory: Record<string, number>;
  lastSync: number | null;          // when the tracker was last read or written
  lastRead: { source: InventorySource; at: number } | null;
  lastChanges: Change[];            // what the last push changed
  error: string | null;
  update: UpdateInfo;
}

export interface UpdateInfo {
  current: string;          // this build's id
  latest: string | null;    // the id the tracker app is serving, if it could be read
  available: boolean;
  url: string;              // where to download the latest zip
}

export function send<T = Status>(req: Request): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(req, (res: T & { error?: string }) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(res);
    });
  });
}
