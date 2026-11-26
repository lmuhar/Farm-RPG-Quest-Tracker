import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Copy, Check, KeyRound, Trash2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// A read-only key for the iOS (Scriptable) widget. Only a SHA-256 hash is
// saved; the key itself is shown once, right after it's made.

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function WidgetKeySection({ user }: { user: User | null }) {
  const [created, setCreated] = useState<string | null | undefined>(undefined); // undefined = loading
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'script' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('widget_keys').select('created_at').eq('user_id', user.id).maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setCreated((data?.created_at as string | undefined) ?? null);
      });
  }, [user]);

  const makeKey = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    const key = newKey();
    const { error: e } = await supabase
      .from('widget_keys')
      .upsert({ user_id: user.id, key_hash: await sha256Hex(key), created_at: new Date().toISOString() });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setShownKey(key);
    setCreated(new Date().toISOString());
  }, [user]);

  const removeKey = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    const { error: e } = await supabase.from('widget_keys').delete().eq('user_id', user.id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setShownKey(null);
    setCreated(null);
  }, [user]);

  const copy = useCallback((what: 'key' | 'script', value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const copyScript = useCallback(async () => {
    const res = await fetch('/farm-rpg-widget.js');
    if (res.ok) copy('script', await res.text());
    else setError('Could not load the widget script');
  }, [copy]);

  const btn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50';

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2">
        <Smartphone size={15} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>iOS widget</p>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        A home-screen widget (via the free Scriptable app) showing STARMAPS &amp; PAMRATS, items your active quests are short on,
        your grow queue and, on the large size, your closest mastery milestones. It reads your data with a widget key, which can
        only read and can be replaced or removed any time.
      </p>

      {!user ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sign in (Cloud Sync above) to make a widget key.</p>
      ) : (
        <>
          <ol className="text-xs space-y-1 list-decimal pl-4" style={{ color: 'var(--text-secondary)' }}>
            <li>Install <b>Scriptable</b> from the App Store, make a new script and paste the widget script into it.</li>
            <li>Add a Scriptable widget (Medium or Large), long-press it → <b>Edit Widget</b>, choose the script and paste your widget key into <b>Parameter</b>.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyScript} className={btn} style={{ background: 'var(--surface-inset)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
              {copied === 'script' ? <Check size={12} /> : <Copy size={12} />} {copied === 'script' ? 'Copied' : 'Copy widget script'}
            </button>
            <button onClick={makeKey} disabled={busy || created === undefined} className={btn} style={{ background: 'var(--accent-green)', color: '#0f172a' }}>
              <KeyRound size={12} /> {created ? 'Replace widget key' : 'Create widget key'}
            </button>
            {created && (
              <button onClick={removeKey} disabled={busy} className={btn} style={{ background: 'var(--surface-inset)', color: 'var(--accent-red)', border: '1px solid var(--border-default)' }}>
                <Trash2 size={12} /> Remove key
              </button>
            )}
          </div>

          {shownKey && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}>
              <p className="text-xs" style={{ color: 'var(--accent-yellow)' }}>
                Copy this now: it's only shown once. Making a new key stops the old one working.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{shownKey}</code>
                <button onClick={() => copy('key', shownKey)} className={btn} style={{ background: 'var(--accent-purple)', color: '#fff' }}>
                  {copied === 'key' ? <Check size={12} /> : <Copy size={12} />} {copied === 'key' ? 'Copied' : 'Copy key'}
                </button>
              </div>
            </div>
          )}
          {created && !shownKey && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              A widget key is set up (made {new Date(created).toLocaleDateString()}).
            </p>
          )}
        </>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>}
    </div>
  );
}
