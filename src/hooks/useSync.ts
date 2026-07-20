import { useEffect, useRef, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useStore } from '../store';
import type { AppState } from '../types';

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
  };
}

export function useSync() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);
  const initializedRef = useRef(false);

  const saveToCloud = useCallback(async (userId: string, state: AppState) => {
    setSyncStatus('syncing');
    const { error } = await supabase
      .from('user_data')
      .upsert({ user_id: userId, state, updated_at: new Date().toISOString() });
    if (error) {
      console.error('[sync] save error:', error.message);
      setSyncStatus('error');
    } else {
      setSyncStatus('synced');
      setLastSynced(new Date());
    }
  }, []);

  const loadAndApply = useCallback(async (userId: string, migrateIfEmpty: boolean) => {
    const { data, error } = await supabase
      .from('user_data')
      .select('state')
      .eq('user_id', userId)
      .single();

    if (!error && data?.state) {
      useStore.getState().importState(data.state as AppState);
      setSyncStatus('synced');
      setLastSynced(new Date());
    } else if (migrateIfEmpty) {
      // First sign-in: migrate existing localStorage data to cloud
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
    if (initializedRef.current && userRef.current?.id === signedInUser.id) return;
    initializedRef.current = true;
    userRef.current = signedInUser;
    setUser(signedInUser);
    await loadAndApply(signedInUser.id, true);
  }, [loadAndApply]);

  // Auth state listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) initUser(session.user);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        initUser(session.user);
      } else {
        setUser(null);
        userRef.current = null;
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
        if (userRef.current) saveToCloud(userRef.current.id, snapshotState());
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
    const onVisible = () => {
      if (document.visibilityState === 'visible' && userRef.current) {
        loadAndApply(userRef.current.id, false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, loadAndApply]);

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
    initializedRef.current = false;
    setSyncStatus('idle');
  }, []);

  const pullNow = useCallback(() => {
    if (userRef.current) loadAndApply(userRef.current.id, false);
  }, [loadAndApply]);

  return { user, authLoading, syncStatus, lastSynced, signIn, signOut, pullNow };
}
