import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Store, RefreshCw, Copy, Check, ClipboardPaste, ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import { parseBorgenShop, BORGEN_SHOP_NAMES, lastCampRestock, shortDate, toStock } from '../borgenShop';

// Captures what Borgen Mercantile / Borgen's Camp are selling, so the item
// panel can say "Borgen Mercantile · 25 Bucks" instead of a hand-kept note.
export function BorgenSyncSection() {
  const { borgenShops, importState } = useStore();
  const [copied, setCopied] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const anchorRef = useRef<HTMLAnchorElement>(null);

  const href = useMemo(() => {
    const origin = window.location.origin;
    // Reads the shop page text (and any iframes Framework7 loads pages into),
    // parses it with the same parser the paste box uses, and opens the tracker.
    const code = `(function(){`
      + `var P=${parseBorgenShop.toString()};`
      + `var t=document.body.innerText;`
      + `document.querySelectorAll('iframe').forEach(function(f){try{var d=f.contentDocument||f.contentWindow.document;if(d&&d.body)t+='\\n'+d.body.innerText;}catch(e){}});`
      + `var r=P(t);`
      + `if(!r){alert('No Borgen shop items found — open Borgen Mercantile or Borgen\\'s Camp first.');return;}`
      + `window.open('${origin}/#sync-borgen='+encodeURIComponent(JSON.stringify(r)),'_blank');`
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
    const capture = parseBorgenShop(pasteText);
    if (!capture) { setPasteStatus('error'); setTimeout(() => setPasteStatus('idle'), 2500); return; }
    importState({ borgenShops: { [capture.shop]: toStock(capture) } });
    setPasteStatus('ok');
    setPasteText('');
    setTimeout(() => setPasteStatus('idle'), 2500);
  }, [pasteText, importState]);

  const captured = (['mercantile', 'camp'] as const).filter((k) => borgenShops[k]);

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start gap-2">
        <Store size={15} style={{ color: 'var(--accent-yellow)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Sync Borgen's Shops
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Open <span style={{ color: 'var(--accent-yellow)', fontFamily: 'var(--font-mono)' }}>Borgen Mercantile</span> or{' '}
            <span style={{ color: 'var(--accent-yellow)', fontFamily: 'var(--font-mono)' }}>Borgen's Camp</span> (Wednesdays) in Farm RPG and tap the bookmarklet.
            Item panels then show what Borgen is selling and for how much.
          </p>
        </div>
      </div>

      {captured.length > 0 && (
        <div className="space-y-2">
          {captured.map((k) => {
            const stock = borgenShops[k]!;
            const outdated = k === 'camp' && new Date(stock.capturedAt) < lastCampRestock();
            return (
              <div key={k} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--accent-yellow)' }}>
                  {BORGEN_SHOP_NAMES[k]}
                  <span className="font-normal" style={{ color: outdated ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
                    {' '}· checked {shortDate(stock.capturedAt)}{outdated && ' · restocked since, sync again'}
                    {stock.balance !== undefined && ` · you had ${stock.balance} Bucks`}
                  </span>
                </p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {stock.items.map((i) => `${i.item} (${i.price})`).join(' · ')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-center">
          <a
            ref={anchorRef}
            onClick={(e) => e.preventDefault()}
            draggable
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none"
            style={{ background: 'var(--accent-yellow)', color: '#1a1a1a', border: '1px solid var(--accent-yellow-border)' }}
            title="Drag me to your bookmarks bar"
          >
            <RefreshCw size={13} /> Sync Borgen Shop
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
            : <><Copy size={12} /> Copy bookmarklet URL (for mobile bookmarks)</>}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
        <button
          onClick={() => setPasteOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs w-full text-left"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ClipboardPaste size={12} style={{ color: 'var(--accent-yellow)' }} />
          <span style={{ fontWeight: 600 }}>Paste shop page text instead</span>
          <ChevronDown size={12} style={{ marginLeft: 'auto', transform: pasteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {pasteOpen && (
          <div className="mt-2 space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              On the Borgen shop page, select all text (Ctrl+A), copy, and paste below.
            </p>
            <textarea
              rows={5}
              placeholder="Paste Borgen shop page text here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none"
              style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={applyPaste}
                disabled={!pasteText.trim()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: 'var(--accent-yellow)', color: '#1a1a1a', border: '1px solid var(--accent-yellow-border)' }}
              >
                <ClipboardPaste size={11} /> Import
              </button>
              {pasteStatus === 'ok' && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-green)' }}>
                  <Check size={11} /> Imported!
                </span>
              )}
              {pasteStatus === 'error' && (
                <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>
                  No shop items found — copy the whole Borgen shop page
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
