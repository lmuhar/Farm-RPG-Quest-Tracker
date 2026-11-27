import { useEffect, useRef, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import type { AppState } from '../types';
import { mergeStates, same, type Json } from '../syncMerge';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

function snapshotState(): AppState {
  const s = useStore.getState();
  return {
    questStatuses: s.questStatuses,
    inventory: s.inventory,
    player: s.player,
    cropTimes: s.cropTimes,
    plotCount: s.plotCount,
    inventoryMax: s.inventoryMax,
    craftingRecipes: s.craftingRecipes,
    growQueue: s.growQueue,
    questNotes: s.questNotes,
    pinnedQuestline: s.pinnedQuestline,
    towerLevel: s.towerLevel,
    trackedQuestline: s.trackedQuestline,
    mastered: s.mastered,
    grandMastered: s.grandMastered,
    megaMastered: s.megaMastered,
    craftworksSlots: s.craftworksSlots,
    inventoryGoal: s.inventoryGoal,
    dailyGain: s.dailyGain,
    dailyResetTime: s.dailyResetTime,
    masteryLevels: s.masteryLevels,
    masteryProgress: s.masteryProgress,
    borgenShops: s.borgenShops,
  };
}

export function useSync() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // True once the initial session check (and, for a signed-in user, the initial
  // Supabase data load) has finished — the only signal App.tsx should gate on.
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);
  const initializedRef = useRef(false);
  const initUserPromiseRef = useRef<Promise<void> | null>(null);
  // The saved row as this tab last read or wrote it: its content and timestamp.
  // Saves only go through if the row still has that timestamp.
  const baseRef = useRef<{ state: Json; updatedAt: string } | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);

  const saveToCloud = useCallback(async (userId: string, state: AppState) => {
    setSyncStatus('syncing');
    let next = state as unknown as Json;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const updated_at = new Date().toISOString();
        const base = baseRef.current;
        if (!base) {
          // Nothing read yet (first save for a new user)
          const { error } = await supabase.from('user_data').upsert({ user_id: userId, state: next, updated_at });
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase
            .from('user_data')
            .update({ state: next, updated_at })
            .eq('user_id', userId)
            .eq('updated_at', base.updatedAt)
            .select('user_id');
          if (error) throw new Error(error.message);
          if (!data?.length) {
            // Saved elsewhere since we read it: merge their changes in and retry
            const { data: row, error: readError } = await supabase
              .from('user_data').select('state, updated_at').eq('user_id', userId).single();
            if (readError || !row) throw new Error(readError?.message ?? 'Could not re-read saved data');
            const remote = row.state as Json;
            next = mergeStates(base.state, next, remote);
            baseRef.current = { state: remote, updatedAt: row.updated_at as string };
            useStore.getState().importState(next as unknown as AppState);
            continue;
          }
        }
        baseRef.current = { state: next, updatedAt: updated_at };
        setSyncStatus('synced');
        setLastSynced(new Date());
        return;
      }
      throw new Error('Saved data kept changing while saving');
    } catch (e) {
      console.error('[sync] save error:', (e as Error).message);
      setSyncStatus('error');
    }
  }, []);

  const loadAndApply = useCallback(async (userId: string, migrateIfEmpty: boolean) => {
    const { data, error } = await supabase
      .from('user_data')
      .select('state, updated_at')
      .eq('user_id', userId)
      .single();

    if (!error && data?.state) {
      baseRef.current = { state: data.state as Json, updatedAt: data.updated_at as string };
      useStore.getState().importState(data.state as AppState);
      setSyncStatus('synced');
      setLastSynced(new Date());
    } else if (migrateIfEmpty) {
      // First sign-in with no existing cloud row yet: seed it from whatever is
      // currently in the in-memory store (this session only — never a browser
      // storage read). Only runs when Supabase has nothing for this user, so
      // it can't clobber real cloud data.
      const local = snapshotState();
      const hasData =
        Object.keys(local.questStatuses).length > 0 ||
        Object.keys(local.inventory).length > 0;
      if (hasData) {
        await saveToCloud(userId, local);
      }
    }
  }, [saveToCloud]);

  const initUser = useCallback(async (signedInUser: User) => {
    // getSession() and onAuthStateChange's initial firing both call this on
    // load; the second caller must await the same in-flight load rather than
    // returning early, or initialLoadDone can flip true before the real
    // cloud data has finished applying.
    if (initializedRef.current && userRef.current?.id === signedInUser.id) {
      if (initUserPromiseRef.current) await initUserPromiseRef.current;
      return;
    }
    initializedRef.current = true;
    userRef.current = signedInUser;
    setUser(signedInUser);
    const p = loadAndApply(signedInUser.id, true);
    initUserPromiseRef.current = p;
    await p;
  }, [loadAndApply]);

  // Auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await initUser(session.user);
      setAuthLoading(false);
      setInitialLoadDone(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        initUser(session.user);
      } else {
        setUser(null);
        userRef.current = null;
        baseRef.current = null;
        initializedRef.current = false;
        setSyncStatus('idle');
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [initUser]);

  // Debounced auto-save on every store change
  useEffect(() => {
    if (!user) return;
    const unsub = useStore.subscribe(() => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        if (!userRef.current) return;
        const snap = snapshotState();
        // Nothing changed since the last read or save: don't write
        if (baseRef.current && same(snap, baseRef.current.state)) return;
        savingRef.current = saveToCloud(userRef.current.id, snap);
      }, 2000);
    });
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [user, saveToCloud]);

  // Pull latest when switching back to this tab (handles switching devices)
  useEffect(() => {
    if (!user) return;
    const onVisible = async () => {
      if (!userRef.current) return;
      const userId = userRef.current.id;
      // An edit still waiting for its 2s save goes out now, before anything is
      // reloaded over it (the save merges with whatever changed elsewhere).
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const snap = snapshotState();
        if (!baseRef.current || !same(snap, baseRef.current.state)) savingRef.current = saveToCloud(userId, snap);
      }
      // Let a save that's under way finish first, or the reload could put the
      // old counts back in the app and the next save would write them out again
      if (savingRef.current) await savingRef.current;
      if (document.visibilityState === 'visible') loadAndApply(userId, false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, loadAndApply, saveToCloud]);

  const signIn = useCallback(
    () => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    }),
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    userRef.current = null;
    baseRef.current = null;
    initializedRef.current = false;
    setSyncStatus('idle');
  }, []);

  const pullNow = useCallback(() => {
    if (userRef.current) loadAndApply(userRef.current.id, false);
  }, [loadAndApply]);

  return { user, authLoading, initialLoadDone, syncStatus, lastSynced, signIn, signOut, pullNow };
}
