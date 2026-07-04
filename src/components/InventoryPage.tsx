import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Package, Plus, Trash2, Search, X, AlignLeft, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, BookMarked, Copy, Check, Lock } from 'lucide-react';
import questsData from '../data/quests.json';
import type { Quest } from '../types';
import { useStore } from '../store';
import { parseItems, getQuestStatus, compareQuests } from '../utils';

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
  const [showFutureNeeds, setShowFutureNeeds] = useState(false);
  const [lookupItem, setLookupItem] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'qty' | 'deficit'>('deficit');
  const [showBookmarklet, setShowBookmarklet] = useState(false);
  const [copied, setCopied] = useState(false);

  const bookmarkletHref = useMemo(() => {
    const origin = window.location.origin;
    // Opens tracker in a new tab with inventory encoded in the URL hash —
    // avoids CORS and farmrpg.com CSP entirely.
    const code = `(function(){var T='${origin}',inv={};document.querySelectorAll('li').forEach(function(li){var n=li.querySelector('.item-title strong'),q=li.querySelector('.item-after');if(!n||!q)return;var name=n.textContent.trim(),qty=parseInt(q.textContent.replace(/,/g,'').trim(),10);if(name&&!isNaN(qty)&&qty>0)inv[name]=qty;});var c=Object.keys(inv).length;if(!c){alert('No items found — make sure you are on the Farm RPG inventory page.');return;}window.open(T+'/#sync-inv='+encodeURIComponent(JSON.stringify(inv)),'_blank');})();`;
    return `javascript:${code}`;
  }, []);

  const copyBookmarklet = useCallback(() => {
    navigator.clipboard.writeText(bookmarkletHref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [bookmarkletHref]);

  // React 19 blocks javascript: href at render time — set it via the DOM directly
  const bookmarkAnchorRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmarkAnchorRef.current?.setAttribute('href', bookmarkletHref);
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

  // Items needed in the next 5 quests of each active questline
  const futureNeeds = useMemo(() => {
    const questlineMap = new Map<string, Quest[]>();
    for (const q of allQuests) {
      if (!q.questline) continue;
      if (!questlineMap.has(q.questline)) questlineMap.set(q.questline, []);
      questlineMap.get(q.questline)!.push(q);
    }
    for (const [, qs] of questlineMap) qs.sort((a, b) => compareQuests(a.name, b.name));

    const itemMap = new Map<string, { needed: number; entries: { questName: string; stepsAhead: number }[] }>();

    for (const quest of allQuests) {
      if (questStatuses[quest.id] !== 'active') continue;
      if (!quest.questline) continue;
      const line = questlineMap.get(quest.questline) ?? [];
      const idx = line.findIndex((q) => q.id === quest.id);
      if (idx === -1) continue;

      const upcoming = line.slice(idx + 1, idx + 6);
      upcoming.forEach((upq, i) => {
        for (const { item, quantity } of parseItems(upq.itemsRequired)) {
          if (!itemMap.has(item)) itemMap.set(item, { needed: 0, entries: [] });
          const entry = itemMap.get(item)!;
          entry.needed += quantity;
          entry.entries.push({ questName: upq.name, stepsAhead: i + 1 });
        }
      });
    }

    return [...itemMap.entries()]
      .map(([item, { needed, entries }]) => ({
        item,
        needed,
        have: inventory[item] ?? 0,
        entries: entries.sort((a, b) => a.stepsAhead - b.stepsAhead),
        minSteps: Math.min(...entries.map((e) => e.stepsAhead)),
      }))
      .sort((a, b) => a.minSteps - b.minSteps);
  }, [questStatuses, inventory]);

  // All quests that need the looked-up item, sorted by status priority
  const lookupResults = useMemo(() => {
    if (!lookupItem) return null;
    const statusOrder = { active: 0, available: 1, locked: 2, completed: 3 };
    return allQuests
      .flatMap((q) => {
        const match = parseItems(q.itemsRequired).find((i) => i.item === lookupItem);
        if (!match) return [];
        return [{ quest: q, quantity: match.quantity, status: getQuestStatus(q, player, questStatuses) }];
      })
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [lookupItem, player, questStatuses]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-amber-400" />
          <h2 className="text-lg font-bold text-slate-100">Inventory</h2>
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
            {totalItems} item{totalItems !== 1 ? 's' : ''} tracked
          </span>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button
            onClick={() => { setShowBookmarklet(!showBookmarklet); setShowBulk(false); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded border transition-colors ${
              showBookmarklet
                ? 'bg-green-600/30 text-green-300 border-green-600/40'
                : 'text-slate-400 border-slate-600 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <RefreshCw size={12} /> Sync from Game
          </button>
          <button
            onClick={() => { setShowBulk(!showBulk); setShowBookmarklet(false); }}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded border transition-colors ${
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
                Add this as a browser bookmark. On your Farm RPG inventory page, click it once — your tracker opens in a new tab with everything imported automatically.
              </p>
            </div>
          </div>

          {/* Desktop setup */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Desktop — drag to bookmarks bar</p>
            <div className="flex flex-wrap gap-3 items-center">
              <a
                ref={bookmarkAnchorRef}
                onClick={(e) => e.preventDefault()}
                draggable
                className="inline-flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-grab active:cursor-grabbing select-none border border-green-500/40 shadow"
                title="Drag me to your bookmarks bar"
              >
                <RefreshCw size={13} /> Sync Farm RPG Inventory
              </a>
              <span className="text-xs text-slate-500">drag above button to your bookmarks bar</span>
            </div>
            <p className="text-xs text-slate-500">Or create a bookmark manually and paste the code as its URL:</p>
            <button
              onClick={copyBookmarklet}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
            >
              {copied ? <><Check size={12} className="text-green-400" /> Copied!</> : <><Copy size={12} /> Copy Bookmarklet Code</>}
            </button>
          </div>

          {/* Mobile setup */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mobile — copy URL &amp; save as bookmark</p>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={copyBookmarklet}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors"
              >
                {copied ? <><Check size={12} className="text-green-400" /> Copied!</> : <><Copy size={12} /> Copy Bookmarklet URL</>}
              </button>
            </div>
            <div className="text-xs text-slate-400 space-y-0.5 pl-1">
              <p className="font-medium text-slate-300">Safari:</p>
              <p>1. Bookmark any page (Share → Add Bookmark)</p>
              <p>2. Open Bookmarks, find it, tap Edit</p>
              <p>3. Replace the URL field with the copied URL → Save</p>
              <p className="font-medium text-slate-300 pt-1">Chrome:</p>
              <p>1. Tap the ⋮ menu → Bookmarks → Add Bookmark</p>
              <p>2. Open Bookmarks, long-press the new bookmark → Edit</p>
              <p>3. Replace the URL with the copied URL → Save</p>
            </div>
          </div>

          {/* Step 2 — Use it */}
          <div className="space-y-1 border-t border-slate-700/50 pt-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Then — use it</p>
            <p className="text-xs text-slate-400">
              Go to <span className="text-green-300 font-mono">farmrpg.com/inventory.php</span> and tap/click the bookmark.
              Your tracker opens in a new tab with inventory already synced — no alerts, no blocked requests.
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
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setInventoryItem(item, Math.max(0, have - 1))}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 bg-slate-700 rounded text-sm"
                              >−</button>
                              <button
                                onClick={() => setInventoryItem(item, have + 1)}
                                className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-green-400 bg-slate-700 rounded text-sm"
                              >+</button>
                              <button
                                onClick={() => setInventoryItem(item, needed)}
                                className="text-xs text-slate-500 hover:text-green-400 px-2 py-1 bg-slate-700 rounded"
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

              {/* Coming up — future quest needs */}
              {futureNeeds.length > 0 && (
                <div className="bg-slate-800/40 rounded-xl border border-purple-700/30 overflow-hidden">
                  <button
                    onClick={() => setShowFutureNeeds(!showFutureNeeds)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
                  >
                    <Lock size={13} className="text-purple-400" />
                    <span className="text-xs font-semibold text-purple-400 flex-1 text-left">
                      {futureNeeds.length} item{futureNeeds.length !== 1 ? 's' : ''} needed in next 5 quests
                    </span>
                    {showFutureNeeds ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                  </button>
                  {showFutureNeeds && (
                    <div className="divide-y divide-slate-700/40">
                      {futureNeeds.map(({ item, needed, have, entries, minSteps }) => (
                        <div key={item} className="px-4 py-2.5 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Lock size={10} className="text-purple-400 flex-shrink-0" />
                              <p className="text-sm text-slate-200">{item}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 truncate">
                              In {minSteps} quest{minSteps !== 1 ? 's' : ''} — {entries[0].questName}
                              {entries.length > 1 ? ` +${entries.length - 1} more` : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className={`text-sm font-mono ${have >= needed ? 'text-green-400' : 'text-slate-300'}`}>
                              {have}/{needed}
                            </span>
                            {have >= needed && <p className="text-xs text-green-500">✓</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                  const futureNeed = !isMissing && !isFulfilled ? futureNeeds.find((n) => n.item === item) : null;
                  const isLookedUp = lookupItem === item;
                  const statusColor = { active: 'text-yellow-400', available: 'text-slate-300', locked: 'text-slate-600', completed: 'text-green-500' };
                  return (
                    <div key={item} className={`px-3 py-2.5 hover:bg-slate-700/20 ${isMissing ? 'bg-yellow-500/5' : futureNeed ? 'bg-purple-500/5' : isLookedUp ? 'bg-slate-700/30' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm text-slate-200 truncate cursor-pointer hover:text-purple-300 transition-colors"
                            onClick={() => setLookupItem(isLookedUp ? null : item)}
                            title="Click to see which quests need this"
                          >
                            {item}
                          </p>
                          {isMissing && (
                            <p className="text-xs text-yellow-400">need {neededFor!.needed}</p>
                          )}
                          {isFulfilled && (
                            <p className="text-xs text-green-500">✓ stocked</p>
                          )}
                          {futureNeed && (
                            <p className="text-xs text-purple-400 flex items-center gap-1">
                              <Lock size={9} /> needed in {futureNeed.minSteps} quest{futureNeed.minSteps !== 1 ? 's' : ''}
                            </p>
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
                        className={`w-16 sm:w-20 bg-slate-700 border rounded px-2 py-1 text-sm text-right font-mono focus:outline-none ${
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
                      {isLookedUp && lookupResults && (
                        <div className="mt-2 border-t border-slate-700/50 pt-2 space-y-1">
                          {lookupResults.length === 0 ? (
                            <p className="text-xs text-slate-500">No quests need this item.</p>
                          ) : (
                            lookupResults.map(({ quest, quantity, status }) => (
                              <div key={quest.id} className="flex items-center justify-between text-xs gap-2">
                                <span className={`truncate ${statusColor[status]}`}>{quest.name}</span>
                                <span className="text-slate-500 flex-shrink-0 font-mono">×{quantity}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
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
