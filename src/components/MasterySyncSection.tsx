import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Trophy, RefreshCw, Copy, Check } from 'lucide-react';

export function MasterySyncSection() {
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const href = useMemo(() => {
    const origin = window.location.origin;
    // Scrapes farmrpg.com/mastery.php — maps in-progress tier sections to tracker levels:
    //   Tier V (MM) in-progress  → level 2 (item is Grand Mastered)
    //   Tier IV (GM) in-progress → level 1 (item is Mastered)
    //   Mega Mastered section    → level 3
    // Only items currently tracked toward a higher tier appear; merges with existing data.
    const code = `(function(){`
      + `var T='${origin}',m={},lv=-1;`
      + `var H={'Tier V (MM)':2,'Tier IV (GM)':1,'Mega Mastered':3};`
      + `var S=new Set(['Tier III (M)','Tier II','Tier I','No Tier','Ready to Claim','Nothing ready yet','Mastery In-Progress','Stop Tracking All']);`
      + `document.querySelectorAll('.item-title').forEach(function(el){`
      + `var n=el.textContent.trim();if(!n)return;`
      + `if(H.hasOwnProperty(n)){lv=H[n];return;}`
      + `if(S.has(n)){lv=-1;return;}`
      + `if(lv>=0){var li=el.closest('li');if(!li)return;`
      + `var a=li.querySelector('.item-after');`
      + `if(a&&(a.textContent.includes('/')||a.textContent.includes('Complete'))){m[n]=lv;}}`
      + `});`
      + `var c=Object.keys(m).length;`
      + `if(!c){alert('No mastery data found. Make sure you\\'re on farmrpg.com/mastery.php');return;}`
      + `window.open(T+'/#sync-masteries='+encodeURIComponent(JSON.stringify(m)),'_blank');`
      + `})();`;
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

  return (
    <div
      className="rounded-xl p-4 space-y-4"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2">
        <Trophy size={15} style={{ color: 'var(--accent-purple)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Sync Masteries from Farm RPG
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Go to <span style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>farmrpg.com/mastery.php</span> and click the bookmarklet to import your mastery progress. Merges with existing data.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <a
            ref={anchorRef}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none"
            style={{ background: 'var(--accent-purple)', color: '#fff', border: '1px solid var(--accent-purple-border)' }}
            title="Drag me to your bookmarks bar"
          >
            <RefreshCw size={13} /> Sync Mastery Progress
          </a>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>drag to bookmarks bar</span>
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          {copied
            ? <><Check size={12} style={{ color: 'var(--accent-green)' }} /> Copied!</>
            : <><Copy size={12} /> Copy Bookmarklet</>}
        </button>
      </div>

      <div className="text-xs space-y-1" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, color: 'var(--text-muted)' }}>
        <p>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>What syncs: </span>
          Items in Tier IV→V progress (sets Grand Master), Tier III→IV progress (sets Mastered), and Mega Mastered items.
        </p>
        <p>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>What doesn't: </span>
          Items you've mastered but aren't currently tracking toward the next tier — add those manually.
        </p>
      </div>
    </div>
  );
}
