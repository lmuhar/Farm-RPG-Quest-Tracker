import { useMemo, useState, useCallback } from 'react';
import { Package, Plus, Trash2, Search, X, AlignLeft, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, BookMarked, Copy, Check } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { useStore } from '../store';
import { parseItems, getQuestStatus } from '../utils';

const allQuests = questsData as Quest[];

function parseBulkLine(line: string): { item: string; quantity: number } | null {
  const s = line.trim();
  if (!s) return null;
  let m = s.match(/^(\d+)[xX]\s+(.+)$/);
  if (m) return { quantity: parseInt(m[1]), item: m[2].trim() };
  m = s.match(/^(.+?)\s+[xX](\d+)$/);
  if (m) return { quantity: parseInt(m[2]), item: m[1].trim() };
  m = s.match(/^(.+?):\s*(\d+)$/);
  if (m) return { quantity: parseInt(m[2]), item: m[1].trim() };
  m = s.match(/^(\d+)\s+(.+)$/);
  if (m) return { quantity: parseInt(m[1]), item: m[2].trim() };
  return null;
}

export function InventoryPage() {
  const { player, questStatuses, inventory, setInventoryItem } = useStore();
  const [search, setSearch] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [showFulfilledNeeds, setShowFulfilledNeeds] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'qty' | 'deficit'>('deficit');
  const [showBookmarklet, setShowBookmarklet] = useState(false);
  const [copied, setCopied] = useState(false);

  const bookmarkletHref = useMemo(() => {
    const origin = window.location.origin;
    const code = `(function(){var T='${origin}',inv={};document.querySelectorAll('li').forEach(function(li){var n=li.querySelector('.item-title strong'),q=li.querySelector('.item-after');if(!n||!q)return;var name=n.textContent.trim(),qty=parseInt(q.textContent.replace(/,/g,'').trim(),10);if(name&&!isNaN(qty)&&qty>0)inv[name]=qty;});var c=Object.keys(inv).length;if(!c){alert('No items found — make sure you are on the Farm RPG inventory page.');return;}fetch(T+'/api/sync-inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inventory:inv})}).then(function(r){return r.json();}).then(function(d){if(d.ok)alert('Synced '+c+' items to Farm RPG Tracker!');else alert('Error: '+d.error);}).catch(function(e){alert('Failed: '+e.message);});})();`;
    return `javascript:${code}`;
  }, []);

  const copyBookmarklet = useCallback(() => {
    navigator.clipboard.writeText(bookmarkletHref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [bookmarkletHref]);

  // Aggregate items needed from all active quests
  const activeNeeds = useMemo(() => {
    const map = new Map<string, { needed: number; quests: string[] }>();
    for (const quest of allQuests) {
      const status = getQuestStatus(quest, player, questStatuses);
      if (status !== 'active') continue;
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const entry = map.get(item) ?? { needed: 0, quests: [] };
        entry.needed += quantity;
        if (!entry.quests.includes(quest.name)) entry.quests.push(quest.name);
        map.set(item, entry);
      }
    }
    return [...map.entries()].map(([item, { needed, quests }]) => {
      const have = inventory[item] ?? 0;
      const deficit = Math.max(0, needed - have);
      return { item, needed, have, deficit, quests };
    });
  }, [player, questStatuses, inventory]);

  const pendingNeeds = activeNeeds.filter((n) => n.deficit > 0);
  const fulfilledNeeds = activeNeeds.filter((n) => n.deficit === 0);

  // Full inventory list
  const inventoryItems = useMemo(() => {
    const s = search.toLowerCase();
    const entries = Object.entries(inventory)
      .filter(([item, qty]) => qty > 0 && (!s || item.toLowerCase().includes(s)))
      .map(([item, qty]) => {
        const neededFor = activeNeeds.find((n) => n.item === item);
        return { item, qty, neededFor };
      });

    return entries.sort((a, b) => {
      if (sortBy === 'name') return a.item.localeCompare(b.item);
      if (sortBy === 'qty') return b.qty - a.qty;
      // deficit: items needed by active quests first, then by name
      const aHasNeed = a.neededFor ? 1 : 0;
      const bHasNeed = b.neededFor ? 1 : 0;
      if (aHasNeed !== bHasNeed) return bHasNeed - aHasNeed;
      return a.item.localeCompare(b.item);
    });
  }, [inventory, search, sortBy, activeNeeds]);

  const parsedBulk = useMemo(
    () => bulkText.split('\n').map(parseBulkLine).filter(Boolean) as { item: string; quantity: number }[],
    [bulkText]
  );

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    const qty = parseInt(newQty) || 1;
    setInventoryItem(trimmed, (inventory[trimmed] ?? 0) + qty);
    setNewItem('');
    setNewQty('');
  };

  const commitBulk = () => {
    for (const { item, quantity } of parsedBulk) {
      setInventoryItem(item, (inventory[item] ?? 0) + quantity);
    }
    setBulkText('');
    setShowBulk(false);
  };

  const totalItems = Object.values(inventory).filter((q) => q > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-amber-400" />
          <h2 className="text-lg font-bold text-slate-100">Inventory</h2>
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
            {totalItems} item{totalItems !== 1 ? 's' : ''} tracked
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => { setShowBookmarklet(!showBookmarklet); setShowBulk(false); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
              showBookmarklet
                ? 'bg-green-600/30 text-green-300 border-green-600/40'
                : 'text-slate-400 border-slate-600 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <RefreshCw size={12} /> Sync from Game
          </button>
          <button
            onClick={() => { setShowBulk(!showBulk); setShowBookmarklet(false); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${
              showBulk
                ? 'bg-amber-600/30 text-amber-300 border-amber-600/40'
                : 'text-slate-400 border-slate-600 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <AlignLeft size={12} /> Bulk Add
          </button>
        </div>
      </div>

      {/* Sync from game panel */}
      {showBookmarklet && (
        <div className="bg-slate-800/60 rounded-xl border border-green-600/30 p-4 space-y-4">
          <div className="flex items-start gap-2">
            <BookMarked size={15} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-slate-200">One-click sync — one-time setup</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Add this as a browser bookmark. Then on your Farm RPG inventory page, click it once to import everything.
              </p>
            </div>
          </div>

          {/* Step 1 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Step 1 — Add the bookmark</p>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Drag target */}
              {/* eslint-disable-next-line react/jsx-no-script-url */}
              <a
                href={bookmarkletHref}
                onClick={(e) => e.preventDefault()}
                draggable
                className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none border border-green-500/40 shadow"
                title="Drag me to your bookmarks bar"
              >
                <RefreshCw size={13} /> Sync Farm RPG Inventory
              </a>
              <span className="text-xs text-slate-500">drag to bookmarks bar</span>
              <span className="text-xs text-slate-600">or</span>
              <button
                onClick={copyBookmarklet}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
              >
                {copied ? <><Check size={12} className="text-green-400" /> Copied!</> : <><Copy size={12} /> Copy URL</>}
              </button>
              <span className="text-xs text-slate-500">then right-click bookmarks bar → Add bookmark → paste as URL</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Step 2 — Use it</p>
            <p className="text-xs text-slate-400">
              Go to <span className="text-green-300 font-mono">farmrpg.com/inventory.php</span> and click the bookmark.
              You'll get a confirmation alert and your inventory here updates instantly.
            </p>
          </div>

          <p className="text-xs text-slate-600 border-t border-slate-700 pt-3">
            Your login session stays entirely in your browser — nothing is stored on this server.
          </p>
        </div>
      )}

      {/* Bulk add panel */}
      {showBulk && (
        <div className="bg-slate-800/60 rounded-xl border border-amber-600/30 p-4 space-y-3">
          <p className="text-xs text-slate-400">One item per line. Supported formats: <code className="text-amber-300">50x Carrot</code>, <code className="text-amber-300">Carrot: 50</code>, <code className="text-amber-300">50 Carrot</code>, <code className="text-amber-300">Carrot x50</code></p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={"50x Carrot\nCarrot: 50\n50 Carrot\nCarrot x50"}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 resize-none font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {parsedBulk.length > 0 ? `${parsedBulk.length} item${parsedBulk.length !== 1 ? 's' : ''} ready to add` : 'Paste your items above'}
            </span>
            <div className="flex gap-2">
              <button onClick={() => { setShowBulk(false); setBulkText(''); }} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={commitBulk}
                disabled={parsedBulk.length === 0}
                className="text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded px-4 py-1.5"
              >
                Add {parsedBulk.length > 0 ? parsedBulk.length : ''} Items
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: Active Quest Needs */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle size={14} className="text-yellow-400" />
            Active Quest Needs
            {pendingNeeds.length > 0 && (
              <span className="text-xs font-normal text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-1.5 py-0.5">
                {pendingNeeds.length} missing
              </span>
            )}
          </h3>

          {activeNeeds.length === 0 ? (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-6 text-center">
              <p className="text-slate-500 text-sm">No active quests with item requirements.</p>
              <p className="text-slate-600 text-xs mt-1">Mark quests as active to see what you need here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Pending items */}
              {pendingNeeds.length > 0 && (
                <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-700/50 bg-yellow-500/5">
                    <span className="text-xs font-semibold text-yellow-400">Still needed</span>
                  </div>
                  <div className="divide-y divide-slate-700/40">
                    {pendingNeeds.sort((a, b) => (b.have / b.needed) - (a.have / a.needed)).map(({ item, needed, have, deficit, quests }) => {
                      const pct = Math.round((have / needed) * 100);
                      return (
                        <div key={item} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-200">{item}</p>
                              <p className="text-xs text-slate-500 truncate" title={quests.join(', ')}>
                                {quests.slice(0, 2).join(', ')}{quests.length > 2 ? ` +${quests.length - 2} more` : ''}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className="text-sm font-mono text-red-400">{have}/{needed}</span>
                              <p className="text-xs text-slate-500">need {deficit} more</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setInventoryItem(item, Math.max(0, have - 1))}
                                className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-300 bg-slate-700 rounded text-xs"
                              >−</button>
                              <button
                                onClick={() => setInventoryItem(item, have + 1)}
                                className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-green-400 bg-slate-700 rounded text-xs"
                              >+</button>
                              <button
                                onClick={() => setInventoryItem(item, needed)}
                                className="text-xs text-slate-600 hover:text-green-400 px-1"
                                title="Mark as fully stocked"
                              >Fill</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fulfilled items (collapsible) */}
              {fulfilledNeeds.length > 0 && (
                <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
                  <button
                    onClick={() => setShowFulfilledNeeds(!showFulfilledNeeds)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/50 bg-green-500/5 hover:bg-green-500/10 transition-colors"
                  >
                    <CheckCircle2 size={13} className="text-green-400" />
                    <span className="text-xs font-semibold text-green-400 flex-1 text-left">
                      {fulfilledNeeds.length} item{fulfilledNeeds.length !== 1 ? 's' : ''} fully stocked
                    </span>
                    {showFulfilledNeeds ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                  </button>
                  {showFulfilledNeeds && (
                    <div className="divide-y divide-slate-700/40">
                      {fulfilledNeeds.map(({ item, needed, have }) => (
                        <div key={item} className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-sm text-slate-400">{item}</span>
                          <span className="text-sm font-mono text-green-400">{have}/{needed} ✓</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Full Inventory */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Package size={14} className="text-amber-400" />
            Your Items
          </h3>

          {/* Add single item */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Item name…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <input
              type="number"
              min={0}
              placeholder="qty"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={addItem}
              className="bg-amber-600 hover:bg-amber-500 text-white rounded-lg px-3 py-2"
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Search + sort */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-8 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X size={12} />
                </button>
              )}
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="deficit">Quest needs first</option>
              <option value="name">Name A–Z</option>
              <option value="qty">Qty high–low</option>
            </select>
          </div>

          {/* Inventory list */}
          {inventoryItems.length === 0 ? (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-6 text-center">
              {search ? (
                <p className="text-slate-500 text-sm">No items match "{search}"</p>
              ) : (
                <>
                  <p className="text-slate-500 text-sm">No items tracked yet.</p>
                  <p className="text-slate-600 text-xs mt-1">Add items above or use Bulk Add.</p>
                </>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-hidden">
              <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-700/40">
                {inventoryItems.map(({ item, qty, neededFor }) => {
                  const isMissing = neededFor && neededFor.deficit > 0;
                  const isFulfilled = neededFor && neededFor.deficit === 0;
                  return (
                    <div key={item} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700/20 ${isMissing ? 'bg-yellow-500/5' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-200">{item}</span>
                        {isMissing && (
                          <span className="ml-2 text-xs text-yellow-400">
                            need {neededFor!.needed}
                          </span>
                        )}
                        {isFulfilled && (
                          <span className="ml-2 text-xs text-green-500">✓ stocked</span>
                        )}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={qty || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : parseInt(e.target.value);
                          if (!isNaN(v)) setInventoryItem(item, v);
                        }}
                        className={`w-20 bg-slate-700 border rounded px-2 py-1 text-sm text-right font-mono focus:outline-none ${
                          isMissing
                            ? 'border-yellow-600/40 text-yellow-300 focus:border-yellow-500'
                            : isFulfilled
                            ? 'border-green-700/40 text-green-400 focus:border-green-500'
                            : 'border-slate-600 text-slate-100 focus:border-amber-500'
                        }`}
                      />
                      <button
                        onClick={() => setInventoryItem(item, 0)}
                        className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                        title="Remove item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {inventoryItems.length > 0 && (
                <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-700/50">
                  <span className="text-xs text-slate-500">{inventoryItems.length} item{inventoryItems.length !== 1 ? 's' : ''}{search ? ' matching search' : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
