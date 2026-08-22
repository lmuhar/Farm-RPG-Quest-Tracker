import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Trophy, RefreshCw, Copy, Check } from 'lucide-react';

export function MasterySyncSection() {
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const href = useMemo(() => {
    const origin = window.location.origin;
    // Parses farmrpg.com/mastery.php via innerText (no CSS class dependency).
    // Checks main document and any iframes (Framework7 hash nav loads pages in iframes).
    // Uses name-follows-name to capture items even when accordion rows are collapsed
    // and their progress text is hidden (not in innerText).
    const code = `(function(){`
      // levels: item→tier (1=completed 10k, 2=completed 100k, 3=completed 1M)
      // progress: item→current count (for items working toward 10k or 100k)
      + `var T='${origin}',m={},p={},lv=-1,pn=null;`
      + `function sv(){if(pn!==null&&lv>=1)m[pn]=lv;pn=null;}`
      + `function proc(text){`
      + `lv=-1;pn=null;`
      + `var lines=text.split('\\n').map(function(l){return l.trim();}).filter(Boolean);`
      + `for(var i=0;i<lines.length;i++){`
      + `var l=lines[i];`
      + `if(l.indexOf('Tier V (MM)')===0){sv();lv=2;continue;}`
      + `if(l.indexOf('Tier IV (GM)')===0){sv();lv=1;continue;}`
      + `if(l.indexOf('Mega Mastered')===0){sv();lv=3;continue;}`
      + `if(l.indexOf('Tier III (M)')===0){sv();lv=0;continue;}`
      + `if(l.indexOf('Tier II')===0||l.indexOf('Tier I')===0||l.indexOf('No Tier')===0){sv();lv=-1;continue;}`
      + `if(lv<0)continue;`
      + `if(l==='Track'||l==='Stop'||l==='Complete!'||l==='chevron_down'||l==='chevron_right'`
      + `||l.indexOf('%')!==-1||l.indexOf('Stop Tracking')===0`
      + `||l.indexOf('Nothing ready')===0||l.indexOf('Ready to Claim')===0)continue;`
      // Parse "9,121 / 10,000 Progress" to capture the count
      + `var pm=l.match(/^([\\d,]+)\\s*\\/.*Progress/);`
      + `if(pm){var cnt=parseInt(pm[1].replace(/,/g,''),10);if(pn!==null&&lv>=0&&lv<=2)p[pn]=cnt;sv();continue;}`
      + `sv();pn=l;`
      + `}`
      + `sv();`
      + `}`
      + `proc(document.body.innerText);`
      + `document.querySelectorAll('iframe').forEach(function(f){`
      + `try{var d=f.contentDocument||f.contentWindow.document;if(d&&d.body)proc(d.body.innerText);}catch(e){}`
      + `});`
      + `var c=Object.keys(m).length+Object.keys(p).length;`
      + `if(!c){alert('No mastery data found — make sure you\\'re on farmrpg.com/mastery.php');return;}`
      + `window.open(T+'/#sync-masteries='+encodeURIComponent(JSON.stringify({levels:m,progress:p})),'_blank');`
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
          Tier levels for all completed milestones, plus exact progress counts for items working toward 10k, 100k, or 1M — used to surface ascension point opportunities.
        </p>
        <p>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>What doesn't: </span>
          Items you've mastered but aren't currently tracking toward the next tier — add those manually.
        </p>
      </div>
    </div>
  );
}
