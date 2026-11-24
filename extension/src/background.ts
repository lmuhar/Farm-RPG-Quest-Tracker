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

let cache: { userId: string; state: SavedState; at: number } | null = null;
const CACHE_MS = 30_000;

async function loadState(userId: string, fresh: boolean): Promise<SavedState> {
  if (!fresh && cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) return cache.state;
  const { data, error } = await supabase.from('user_data').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  const state = (data?.state ?? {}) as SavedState;
  cache = { userId, state, at: Date.now() };
  await setMeta({ lastSync: Date.now() });
  return state;
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

async function push(inventory: Record<string, number>, full: boolean, source: InventorySource): Promise<Status> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return status();
  await setMeta({ lastRead: { source, at: Date.now() } });
  try {
    // Always write on top of the latest saved state, never a cached copy
    const state = await loadState(session.user.id, true);
    const before = state.inventory ?? {};
    const after = full ? { ...inventory } : { ...before, ...inventory };
    const changes: Change[] = [];
    for (const item of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const delta = (after[item] ?? 0) - (before[item] ?? 0);
      if (delta !== 0) changes.push({ item, delta });
    }
    if (changes.length) {
      const next = { ...state, inventory: after };
      const { error } = await supabase
        .from('user_data')
        .upsert({ user_id: session.user.id, state: next, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      cache = { userId: session.user.id, state: next, at: Date.now() };
      changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      await setMeta({ lastSync: Date.now(), lastChanges: changes });
    }
    return status();
  } catch (e) {
    return status(false, (e as Error).message);
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender: unknown, reply: (s: Status) => void) => {
  const run = async (): Promise<Status> => {
    switch (req.type) {
      case 'status': return status(req.refresh);
      case 'signIn': return signIn();
      case 'signOut': await supabase.auth.signOut(); cache = null; return status();
      case 'push': return push(req.inventory, req.full, req.source);
    }
  };
  run().then(reply, (e) => status(false, (e as Error).message).then(reply));
  return true; // reply comes later
});
