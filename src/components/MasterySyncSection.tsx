import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Trophy, RefreshCw, Copy, Check, ClipboardPaste, ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import masteriesData from '../data/masteries.json';

// Whitelist of known mastery item names — anything not in this set is page chrome
// (item descriptions, category headers, stats text) and must be ignored.
const MASTERY_NAMES = new Set((masteriesData as { name: string }[]).map((m) => m.name));
const MASTERY_NAMES_JSON = JSON.stringify([...MASTERY_NAMES]);

function parseMasteryText(text: string): { levels: Record<string, number>; progress: Record<string, number> } {
  const levels: Record<string, number> = {};
  const progress: Record<string, number> = {};
  let lv = -1;
  let pn: string | null = null;

  const save = () => { if (pn !== null && lv >= 1) levels[pn] = lv; pn = null; };

  // Browser clipboard adds "* " bullet prefix to list items — strip it before parsing
  const lines = text.split('\n').map((l) => l.trim().replace(/^\*\s+/, '')).filter(Boolean);
  for (const l of lines) {
    if (l.startsWith('Tier V (MM)')) { save(); lv = 2; continue; }
    if (l.startsWith('Tier IV (GM)')) { save(); lv = 1; continue; }
    if (l.startsWith('Mega Mastered')) { save(); lv = 3; continue; }
    if (l.startsWith('Tier III (M)')) { save(); lv = 0; continue; }
    if (l.startsWith('Tier II') || l.startsWith('Tier I') || l.startsWith('No Tier')) { save(); lv = -1; continue; }
    if (lv < 0) continue;
    if (['Track', 'Stop', 'Complete!', 'chevron_down', 'chevron_right', 'Mastery In-Progress'].includes(l)
      || l.includes('%') || l.startsWith('Stop Tracking') || l.startsWith('Nothing ready')
      || l.startsWith('Ready to Claim') || l.startsWith('[')) continue;
    const pm = l.match(/^([\d,]+)\s*\/.*Progress/);
    if (pm) {
      const cnt = parseInt(pm[1].replace(/,/g, ''), 10);
      if (/\/\s*∞/.test(l) && pn !== null) { levels[pn] = 3; pn = null; continue; }
      if (pn !== null && lv >= 0 && lv <= 2) progress[pn] = cnt;
      save(); continue;
    }
    save();
    // Only accept known mastery item names; drop descriptions, headers, stats, etc.
    if (MASTERY_NAMES.has(l)) pn = l;
  }
  save();
  return { levels, progress };
}

export function MasterySyncSection() {
  const [copied, setCopied] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const { importState, replaceMasteryProgress } = useStore();
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
      // N: whitelist of known mastery item names — drops descriptions, headers, stats
      + `var N=new Set(${MASTERY_NAMES_JSON}),T='${origin}',m={},p={},lv=-1,pn=null;`
      + `function sv(){if(pn!==null&&lv>=1)m[pn]=lv;pn=null;}`
      + `function proc(text){`
      + `lv=-1;pn=null;`
      + `var lines=text.split('\\n').map(function(l){return l.trim().replace(/^\\*\\s+/,'');}).filter(Boolean);`
      + `for(var i=0;i<lines.length;i++){`
      + `var l=lines[i];`
      + `if(l.indexOf('Tier V (MM)')===0){sv();lv=2;continue;}`
      + `if(l.indexOf('Tier IV (GM)')===0){sv();lv=1;continue;}`
      + `if(l.indexOf('Mega Mastered')===0){sv();lv=3;continue;}`
      + `if(l.indexOf('Tier III (M)')===0){sv();lv=0;continue;}`
      + `if(l.indexOf('Tier II')===0||l.indexOf('Tier I')===0||l.indexOf('No Tier')===0){sv();lv=-1;continue;}`
      + `if(lv<0)continue;`
      + `if(l==='Track'||l==='Stop'||l==='Complete!'||l==='chevron_down'||l==='chevron_right'||l==='Mastery In-Progress'`
      + `||l.indexOf('%')!==-1||l.indexOf('Stop Tracking')===0`
      + `||l.indexOf('Nothing ready')===0||l.indexOf('Ready to Claim')===0||l.charAt(0)==='[')continue;`
      // Parse "9,121 / 10,000 Progress"; "/ ∞ Progress" means mega mastered
      + `var pm=l.match(/^([\\d,]+)\\s*\\/.*Progress/);`
      + `if(pm){var cnt=parseInt(pm[1].replace(/,/g,''),10);`
      + `if(/\\/\\s*∞/.test(l)&&pn!==null){m[pn]=3;pn=null;continue;}`
      + `if(pn!==null&&lv>=0&&lv<=2)p[pn]=cnt;sv();continue;}`
      + `sv();if(N.has(l))pn=l;`
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

  const applyPaste = useCallback(() => {
    try {
      const { levels, progress } = parseMasteryText(pasteText);
      const count = Object.keys(levels).length + Object.keys(progress).length;
      if (count === 0) { setPasteStatus('error'); setTimeout(() => setPasteStatus('idle'), 2500); return; }
      // Paste is a full-page sync: replace both masteryLevels and masteryProgress entirely
      // so stale keys from previous broken imports (e.g. '* Radish' from old clipboard bug) are cleared.
      importState({ masteryLevels: levels });
      replaceMasteryProgress(progress);
      setPasteStatus('ok');
      setPasteText('');
      setTimeout(() => setPasteStatus('idle'), 2500);
    } catch {
      setPasteStatus('error');
      setTimeout(() => setPasteStatus('idle'), 2500);
    }
  }, [pasteText, importState, replaceMasteryProgress]);

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
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Desktop — drag to bookmarks bar
        </p>
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
            : <><Copy size={12} /> Copy Bookmarklet Code</>}
        </button>
      </div>

      <div className="space-y-2" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Mobile — copy URL &amp; save as bookmark
        </p>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
          style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
        >
          {copied
            ? <><Check size={12} style={{ color: 'var(--accent-green)' }} /> Copied!</>
            : <><Copy size={12} /> Copy Bookmarklet URL</>}
        </button>
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

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <button
          onClick={() => setPasteOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs w-full text-left"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ClipboardPaste size={12} style={{ color: 'var(--accent-purple)' }} />
          <span style={{ fontWeight: 600 }}>Paste mastery page text instead</span>
          <ChevronDown size={12} style={{ marginLeft: 'auto', transform: pasteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {pasteOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Go to <span style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>farmrpg.com/mastery.php</span>, select all text on the page (Ctrl+A), copy, and paste below.
            </p>
            <textarea
              rows={5}
              placeholder="Paste mastery page text here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none"
              style={{
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={applyPaste}
                disabled={!pasteText.trim()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: 'var(--accent-purple)', color: '#fff', border: '1px solid var(--accent-purple-border)' }}
              >
                <ClipboardPaste size={11} /> Import
              </button>
              {pasteStatus === 'ok' && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-green)' }}>
                  <Check size={11} /> Imported!
                </span>
              )}
              {pasteStatus === 'error' && (
                <span className="text-xs" style={{ color: 'var(--accent-orange, #f97316)' }}>
                  No mastery data found — make sure you pasted from farmrpg.com/mastery.php
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
