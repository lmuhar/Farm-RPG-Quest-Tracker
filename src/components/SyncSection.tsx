import { Cloud, CloudOff, RefreshCw, LogOut, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { SyncStatus } from '../hooks/useSync';

interface Props {
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  lastSynced: Date | null;
  signIn: () => void;
  signOut: () => void;
  pullNow: () => void;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SyncSection({ user, authLoading, syncStatus, lastSynced, signIn, signOut, pullNow }: Props) {
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Cloud size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Cloud Sync
        </p>
        {user && (
          <SyncBadge status={syncStatus} lastSynced={lastSynced} />
        )}
      </div>

      {authLoading ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking sign-in…</p>
      ) : user ? (
        <SignedInView user={user} syncStatus={syncStatus} signOut={signOut} pullNow={pullNow} />
      ) : (
        <SignedOutView signIn={signIn} />
      )}
    </div>
  );
}

function SignedOutView({ signIn }: { signIn: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Sign in with Google to sync your quest progress across all your devices automatically.
      </p>
      <button
        onClick={signIn}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: 'var(--accent-blue)', color: '#fff' }}
      >
        <LogIn size={14} />
        Sign in with Google
      </button>
    </div>
  );
}

function SignedInView({
  user,
  syncStatus,
  signOut,
  pullNow,
}: {
  user: User;
  syncStatus: SyncStatus;
  signOut: () => void;
  pullNow: () => void;
}) {
  const avatar = user.user_metadata?.avatar_url as string | undefined;
  const name = (user.user_metadata?.full_name ?? user.email) as string;

  return (
    <div className="space-y-3">
      {/* User info */}
      <div className="flex items-center gap-2.5">
        {avatar ? (
          <img src={avatar} alt="" className="w-7 h-7 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
        ) : (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
            style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)' }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Progress saves automatically every 2 seconds. Switching back to this tab pulls the latest from the cloud.
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={pullNow}
          disabled={syncStatus === 'syncing'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <RefreshCw size={12} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
          Pull latest
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function SyncBadge({ status, lastSynced }: { status: SyncStatus; lastSynced: Date | null }) {
  if (status === 'syncing') {
    return (
      <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
        <RefreshCw size={10} className="animate-spin" /> saving…
      </span>
    );
  }
  if (status === 'synced' && lastSynced) {
    return (
      <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-green)' }}>
        <CheckCircle2 size={10} /> saved {formatTime(lastSynced)}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-orange)' }}>
        <AlertCircle size={10} /> sync error
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
      <CloudOff size={10} /> not syncing
    </span>
  );
}
