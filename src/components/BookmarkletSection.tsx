import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { BookMarked, RefreshCw, Copy, Check } from 'lucide-react';

export function BookmarkletSection() {
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const href = useMemo(() => {
    const origin = window.location.origin;
    const code = `(function(){var T='${origin}',inv={};document.querySelectorAll('li').forEach(function(li){var n=li.querySelector('.item-title strong'),q=li.querySelector('.item-after');if(!n||!q)return;var name=n.textContent.trim(),qty=parseInt(q.textContent.replace(/,/g,'').trim(),10);if(name&&!isNaN(qty)&&qty>0)inv[name]=qty;});var c=Object.keys(inv).length;if(!c){alert('No items found — make sure you are on the Farm RPG inventory page.');return;}window.open(T+'/#sync-inv='+encodeURIComponent(JSON.stringify(inv)),'_blank');})();`;
    return `javascript:${code}`;
  }, []);

  useEffect(() => {
    anchorRef.current?.setAttribute('href', href);
  }, [href]);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [href]);

  const CopyButton = ({ label }: { label: string }) => (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
      style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
    >
      {copied ? (
        <><Check size={12} style={{ color: 'var(--accent-green)' }} /> Copied!</>
      ) : (
        <><Copy size={12} /> {label}</>
      )}
    </button>
  );

  return (
    <div
      className="rounded-xl p-4 space-y-4"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2">
        <BookMarked size={15} style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Sync from Farm RPG
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            One-click bookmarklet — go to your Farm RPG inventory page and click it to import everything automatically.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Desktop — drag to bookmarks bar
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <a
            ref={anchorRef}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none"
            style={{ background: 'var(--accent-green)', color: '#0f172a', border: '1px solid var(--accent-green-border)' }}
            title="Drag me to your bookmarks bar"
          >
            <RefreshCw size={13} /> Sync Farm RPG Inventory
          </a>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>drag to bookmarks bar</span>
        </div>
        <CopyButton label="Copy Bookmarklet Code" />
      </div>

      <div className="space-y-2" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Mobile — copy URL &amp; save as bookmark
        </p>
        <CopyButton label="Copy Bookmarklet URL" />
        <div className="text-xs space-y-0.5 pl-1" style={{ color: 'var(--text-muted)' }}>
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Safari:</p>
          <p>1. Bookmark any page → Add Bookmark</p>
          <p>2. Open Bookmarks, find it, tap Edit</p>
          <p>3. Replace URL with copied code → Save</p>
          <p className="font-medium pt-1" style={{ color: 'var(--text-secondary)' }}>Chrome:</p>
          <p>1. ⋮ menu → Bookmarks → Add Bookmark</p>
          <p>2. Long-press bookmark → Edit</p>
          <p>3. Replace URL with copied code → Save</p>
        </div>
      </div>

      <div className="space-y-1" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Using it</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Go to <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>farmrpg.com/inventory.php</span> and tap the bookmark. Your tracker opens in a new tab with inventory synced.
        </p>
      </div>
    </div>
  );
}
