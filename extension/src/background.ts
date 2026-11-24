// Service worker: signs in to the tracker's Supabase with Google, reads your
// saved tracker data, and writes inventory counts back into it. Only the
// `inventory` part of the saved state is ever changed.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Change, InventorySource, Request, Status } from './messages';
import type { QuestStatus } from '../../src/types';

const storage = {
  getItem: async (key: string) => ((await chrome.storage.local.get(key)) as Record<string, string>)[key] ?? null,
  setItem: (key: string, value: string) => chrome.storage.local.set({ [key]: value }),
  removeItem: (key: string) => chrome.storage.local.remove(key),
};

const supabase: SupabaseClient = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: { storage, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

type SavedState = { questStatuses?: Record<string, QuestStatus>; inventory?: Record<string, number> } & Record<string, unknown>;

// Kept in chrome.storage.session so it survives the worker going to sleep
interface Meta { lastSync: number | null; lastRead: Status['lastRead']; lastChanges: Change[] }
async function getMeta(): Promise<Meta> {
  const { meta } = await chrome.storage.session.get('meta');
  return meta ?? { lastSync: null, lastRead: null, lastChanges: [] };
}
async function setMeta(patch: Partial<Meta>) {
  await chrome.storage.session.set({ meta: { ...(await getMeta()), ...patch } });
}

let cache: { userId: string; state: SavedState; updatedAt: string | null; at: number } | null = null;
const CACHE_MS = 30_000;

async function loadRow(userId: string, fresh: boolean): Promise<{ state: SavedState; updatedAt: string | null }> {
  if (!fresh && cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) return cache;
  const { data, error } = await supabase.from('user_data').select('state, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = { state: (data?.state ?? {}) as SavedState, updatedAt: (data?.updated_at as string | undefined) ?? null };
  cache = { userId, ...row, at: Date.now() };
  await setMeta({ lastSync: Date.now() });
  return row;
}
const loadState = async (userId: string, fresh: boolean) => (await loadRow(userId, fresh)).state;

// Only replace the row if nobody (e.g. the app in another tab) saved it since
// we read it; returns false when it changed underneath us.
async function saveRow(userId: string, state: SavedState, prevUpdatedAt: string | null): Promise<boolean> {
  const updated_at = new Date().toISOString();
  if (prevUpdatedAt === null) {
    const { error } = await supabase.from('user_data').insert({ user_id: userId, state, updated_at });
    if (error) {
      if (error.code === '23505') return false; // the row appeared meanwhile
      throw new Error(error.message);
    }
  } else {
    const { data, error } = await supabase.from('user_data')
      .update({ state, updated_at })
      .eq('user_id', userId)
      .eq('updated_at', prevUpdatedAt)
      .select('user_id');
    if (error) throw new Error(error.message);
    if (!data?.length) return false;
  }
  cache = { userId, state, updatedAt: updated_at, at: Date.now() };
  return true;
}

// An Inventory page read that would drop this many items at once probably
// caught the page half-drawn, so it isn't saved unless you press Sync now.
const MAX_REMOVED = (before: number) => Math.max(10, Math.floor(before * 0.25));

// Counts must look like counts: plain item names and whole numbers in range.
const MAX_ITEMS = 5000;
const MAX_QTY = 1_000_000_000;
const SOURCES: InventorySource[] = ['Inventory page', 'Item page', 'Craftworks'];
function validInventory(inv: unknown): inv is Record<string, number> {
  if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return false;
  const entries = Object.entries(inv as Record<string, unknown>);
  return entries.length <= MAX_ITEMS && entries.every(([name, qty]) =>
    name.length > 0 && name.length <= 100 && !/[<>\n]/.test(name)
    && typeof qty === 'number' && Number.isInteger(qty) && qty >= 0 && qty <= MAX_QTY);
}

async function status(refresh = false, error: string | null = null): Promise<Status> {
  const { data: { session } } = await supabase.auth.getSession();
  const meta = await getMeta();
  if (!session) {
    return { signedIn: false, email: null, questStatuses: {}, inventory: {}, ...meta, error };
  }
  try {
    const state = await loadState(session.user.id, refresh);
    return {
      signedIn: true,
      email: session.user.email ?? null,
      questStatuses: state.questStatuses ?? {},
      inventory: state.inventory ?? {},
      ...(await getMeta()),
      error,
    };
  } catch (e) {
    return { signedIn: true, email: session.user.email ?? null, questStatuses: {}, inventory: {}, ...meta, error: (e as Error).message };
  }
}

async function signIn(): Promise<Status> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return status(false, error?.message ?? 'Could not start sign-in');
  const callback: string | undefined = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  const code = callback ? new URL(callback).searchParams.get('code') : null;
  if (!code) return status(false, 'Sign-in was cancelled');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  cache = null;
  return status(true, exchangeError?.message ?? null);
}

async function push(inventory: Record<string, number>, full: boolean, source: InventorySource, allowRemovals: boolean): Promise<Status> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return status();
  await setMeta({ lastRead: { source, at: Date.now() } });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Always write on top of the latest saved state, never a cached copy
      const { state, updatedAt } = await loadRow(session.user.id, true);
      const before = state.inventory ?? {};
      const after = full ? { ...inventory } : { ...before, ...inventory };
      const changes: Change[] = [];
      for (const item of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const delta = (after[item] ?? 0) - (before[item] ?? 0);
        if (delta !== 0) changes.push({ item, delta });
      }
      if (!changes.length) return status();
      if (full && !allowRemovals) {
        const had = Object.values(before).filter((q) => q > 0).length;
        const removed = Object.keys(before).filter((item) => (before[item] ?? 0) > 0 && !(item in after)).length;
        if (removed > MAX_REMOVED(had)) {
          return status(false, `Inventory read looked incomplete (it would remove ${removed} items), so it wasn't saved. If that's right, press Sync now on the Inventory page.`);
        }
      }
      if (await saveRow(session.user.id, { ...state, inventory: after }, updatedAt)) {
        changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        await setMeta({ lastSync: Date.now(), lastChanges: changes });
        return status();
      }
      // Saved elsewhere since we read it: read again and redo the merge
    }
    return status(false, 'The tracker kept changing while saving; try Sync now.');
  } catch (e) {
    return status(false, (e as Error).message);
  }
}

// Only this extension's own script, running on farmrpg.com, may talk to us
function trustedSender(sender: { id?: string; url?: string }): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const { protocol, hostname } = new URL(sender.url);
    return protocol === 'https:' && (hostname === 'farmrpg.com' || hostname === 'www.farmrpg.com');
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((req: Request, sender: { id?: string; url?: string }, reply: (s: Status) => void) => {
  if (!trustedSender(sender)) return false;
  const run = async (): Promise<Status> => {
    switch (req.type) {
      case 'status': return status(req.refresh === true);
      case 'signIn': return signIn();
      case 'signOut': await supabase.auth.signOut(); cache = null; return status();
      case 'push':
        if (!validInventory(req.inventory) || typeof req.full !== 'boolean' || !SOURCES.includes(req.source)) {
          return status(false, 'Ignored counts that did not look valid.');
        }
        return push(req.inventory, req.full, req.source, req.allowRemovals === true);
      default: return status(false, 'Unknown request');
    }
  };
  run().then(reply, (e) => status(false, (e as Error).message).then(reply));
  return true; // reply comes later
});
