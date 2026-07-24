import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ListTodo, GitBranch, Search, X, Wand2, Sprout as SproutIcon, BarChart2, Package, Settings, Hammer, RefreshCw, BookMarked, Copy, Check, Menu, MapPin } from 'lucide-react';
import questsData from './data/quests.json';
import type { Quest } from './types';
import { getQuestStatus, compareQuests, isLimitedTime, isCompletable } from './utils';
import { useStore } from './store';
import { SkillsPanel } from './components/SkillsPanel';
import { CropTimerPanel } from './components/CropTimerPanel';
import { QuestCard } from './components/QuestCard';
import { QuestLineView } from './components/QuestLineView';
import { ActiveQuestsSummary } from './components/ActiveQuestsSummary';
import { ActiveQuestLine } from './components/ActiveQuestLine';
import { SyncSection } from './components/SyncSection';
import { useSync } from './hooks/useSync';
import { ImportExport } from './components/ImportExport';
import { RecipesPanel } from './components/RecipesPanel';
import { SetupWizard } from './components/SetupWizard';
import { GrowPlanner } from './components/GrowPlanner';
import { StatsTab } from './components/StatsTab';
import { InventoryPage } from './components/InventoryPage';
import { RecipesPage } from './components/RecipesPage';
import { LocationsTab } from './components/LocationsTab';

const allQuests = questsData as Quest[];

type Tab = 'active' | 'locations' | 'inventory' | 'quests' | 'questlines' | 'grow' | 'recipes' | 'stats' | 'settings';
type FilterStatus = 'all' | 'available' | 'locked' | 'completed' | 'completable' | 'limited';

export default function App() {
  const { player, questStatuses, inventory, cropTimes, plotCount, craftingRecipes, growQueue, questNotes, importState } = useStore();
  const sync = useSync();
  const [tab, setTab] = useState<Tab>('active');
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [filterNpc, setFilterNpc] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [questlineSearch, setQuestlineSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [showCompletedLines, setShowCompletedLines] = useState(true);
  const [copied, setCopied] = useState(false);

  const bookmarkletHref = useMemo(() => {
    const origin = window.location.origin;
    const code = `(function(){var T='${origin}',inv={};document.querySelectorAll('li').forEach(function(li){var n=li.querySelector('.item-title strong'),q=li.querySelector('.item-after');if(!n||!q)return;var name=n.textContent.trim(),qty=parseInt(q.textContent.replace(/,/g,'').trim(),10);if(name&&!isNaN(qty)&&qty>0)inv[name]=qty;});var c=Object.keys(inv).length;if(!c){alert('No items found — make sure you are on the Farm RPG inventory page.');return;}window.open(T+'/#sync-inv='+encodeURIComponent(JSON.stringify(inv)),'_blank');})();`;
    return `javascript:${code}`;
  }, []);

  const copyBookmarklet = useCallback(() => {
    navigator.clipboard.writeText(bookmarkletHref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [bookmarkletHref]);

  const bookmarkAnchorRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    bookmarkAnchorRef.current?.setAttribute('href', bookmarkletHref);
  }, [bookmarkletHref]);

  // Load state from server on mount; apply any bookmarklet hash-sync after server state loads
  useEffect(() => {
    const hash = window.location.hash;
    let hashInv: Record<string, number> | null = null;
    if (hash.startsWith('#sync-inv=')) {
      try {
        const parsed = JSON.parse(decodeURIComponent(hash.slice('#sync-inv='.length)));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          hashInv = parsed as Record<string, number>;
        }
      } catch { /* ignore malformed hash */ }
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setTab('inventory');
    }

    const applyHashInv = () => {
      if (!hashInv) return;
      // Replace the entire inventory so items that dropped to 0 (absent from
      // the bookmarklet payload) are cleared rather than left at their old value.
      importState({ inventory: hashInv });
    };

    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) importState(data); applyHashInv(); })
      .catch(() => { applyHashInv(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to server on every state change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questStatuses, inventory, player, cropTimes, plotCount, craftingRecipes, growQueue, questNotes }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [questStatuses, inventory, player, cropTimes, plotCount, craftingRecipes, growQueue, questNotes]);

  const npcs = useMemo(() => [...new Set(allQuests.map((q) => q.npc))].sort(), []);

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const activeQuests = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'active').map((q) => q.quest),
    [questsWithStatus]
  );

  const activeQuestIds = useMemo(() => new Set(activeQuests.map((q) => q.id)), [activeQuests]);

  const completedCount = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'completed').length,
    [questsWithStatus]
  );

  const filteredQuests = useMemo(() => {
    return questsWithStatus.filter(({ quest, status }) => {
      if (filterStatus === 'limited') {
        if (!isLimitedTime(quest)) return false;
      } else if (filterStatus === 'completable') {
        if (status === 'completed' || status === 'locked') return false;
        if (!isCompletable(quest, inventory)) return false;
      } else if (filterStatus !== 'all' && status !== filterStatus) {
        return false;
      }
      if (filterNpc && quest.npc !== filterNpc) return false;
      const s = globalSearch.toLowerCase();
      if (s) {
        return (
          quest.name.toLowerCase().includes(s) ||
          quest.npc.toLowerCase().includes(s) ||
          quest.questline.toLowerCase().includes(s) ||
          quest.description.toLowerCase().includes(s) ||
          quest.itemsRequired.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [questsWithStatus, filterStatus, filterNpc, globalSearch, inventory]);

  const questlineGroups = useMemo(() => {
    const groups = new Map<string, Quest[]>();
    for (const q of allQuests) {
      if (!q.questline) continue;
      if (!groups.has(q.questline)) groups.set(q.questline, []);
      groups.get(q.questline)!.push(q);
    }
    return [...groups.entries()]
      .map(([name, quests]) => ({
        name,
        quests: [...quests].sort((a, b) => compareQuests(a.name, b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const nextUpQuests = useMemo(() => {
    return questlineGroups
      .filter(({ quests }) => quests.some((q) => activeQuestIds.has(q.id)))
      .flatMap(({ quests }) => {
        const sorted = [...quests].sort((a, b) => compareQuests(a.name, b.name));
        const statuses = sorted.map((q) => getQuestStatus(q, player, questStatuses));
        const lastActiveIdx = statuses.reduce((max, s, i) => (s === 'active' ? i : max), -1);
        if (lastActiveIdx < 0) return [];
        const remaining = sorted.slice(lastActiveIdx + 1);
        const nextIdx = remaining.findIndex((_, i) => {
          const st = statuses[lastActiveIdx + 1 + i];
          return st !== 'completed' && st !== 'active';
        });
        if (nextIdx < 0) return [];
        return [remaining[nextIdx]];
      });
  }, [questlineGroups, activeQuestIds, player, questStatuses]);

  const filteredQuestlines = useMemo(() => {
    if (!questlineSearch) return questlineGroups;
    const s = questlineSearch.toLowerCase();
    return questlineGroups.filter(
      ({ name, quests }) =>
        name.toLowerCase().includes(s) ||
        quests.some(
          (q) =>
            q.name.toLowerCase().includes(s) ||
            q.itemsRequired.toLowerCase().includes(s) ||
            q.npc.toLowerCase().includes(s)
        )
    );
  }, [questlineGroups, questlineSearch]);

  const visibleQuestlines = useMemo(() => {
    if (showCompletedLines) return filteredQuestlines;
    return filteredQuestlines.filter(({ quests }) => {
      const completedInLine = quests.filter((q) => questStatuses[q.id] === 'completed').length;
      return completedInLine < quests.length;
    });
  }, [filteredQuestlines, showCompletedLines, questStatuses]);

  const stats = useMemo(() => {
    const available = questsWithStatus.filter((q) => q.status === 'available').length;
    return { completed: completedCount, available, active: activeQuests.length, total: allQuests.length };
  }, [questsWithStatus, activeQuests, completedCount]);

  const isSearching = globalSearch.trim().length > 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      <header
        className="sticky top-0 z-10 backdrop-blur-sm"
        style={{ background: 'oklch(0.25 0.022 258 / 0.85)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Logo — home button */}
          <button
            onClick={() => { setTab('active'); setMenuOpen(false); }}
            className="flex items-center gap-2 flex-shrink-0 rounded-lg transition-opacity hover:opacity-80"
            aria-label="Home"
          >
            <img src="/favicon.svg" alt="" style={{ width: 26, height: 26, flexShrink: 0 }} />
            <h1
              className="text-base font-bold hidden sm:block"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Farm RPG Tracker
            </h1>
          </button>

          {/* Global search */}
          <div className="relative flex-1 max-w-md mx-2 sm:mx-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search quests, items, NPCs…"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                if (e.target.value) setTab('quests');
              }}
              className="w-full rounded-lg pl-8 pr-8 py-1.5 text-sm focus:outline-none"
              style={{
                background: 'var(--surface-inset)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {completedCount < 10 && (
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium flex-shrink-0 transition-colors"
              style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
            >
              <Wand2 size={13} />
              <span className="hidden sm:inline">Quick Setup</span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-3 text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{stats.active} active</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{stats.completed} done</span>
            <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{stats.available} available</span>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile side drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-20 md:hidden"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed top-0 left-0 bottom-0 z-30 w-64 flex flex-col md:hidden"
            style={{ background: 'var(--surface-card)', borderRight: '1px solid var(--border-subtle)' }}
          >
            {/* Drawer header */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <img src="/favicon.svg" alt="" style={{ width: 24, height: 24 }} />
              <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Farm RPG Tracker</span>
            </div>
            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {([
                { id: 'active', label: 'Active', icon: <ListTodo size={16} /> },
                { id: 'locations', label: 'Locations', icon: <MapPin size={16} /> },
                { id: 'inventory', label: 'Inventory', icon: <Package size={16} /> },
                { id: 'quests', label: 'All Quests', icon: <Search size={16} /> },
                { id: 'questlines', label: 'Quest Lines', icon: <GitBranch size={16} /> },
                { id: 'grow', label: 'Grow Planner', icon: <SproutIcon size={16} /> },
                { id: 'recipes', label: 'Recipes', icon: <Hammer size={16} /> },
                { id: 'stats', label: 'Stats', icon: <BarChart2 size={16} /> },
                { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
              ] as const).map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
                  style={
                    tab === id
                      ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                      : { color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }
                  }
                >
                  {icon}
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <main className="space-y-4">
          {/* Tab bar — desktop only */}
          <div
            className="hidden md:flex gap-0.5 rounded-xl p-1"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            {([
              { id: 'active', label: 'Active', icon: <ListTodo size={14} /> },
              { id: 'locations', label: 'Locations', icon: <MapPin size={14} /> },
              { id: 'inventory', label: 'Inventory', icon: <Package size={14} /> },
              { id: 'quests', label: 'All Quests', icon: <Search size={14} /> },
              { id: 'questlines', label: 'Quest Lines', icon: <GitBranch size={14} /> },
              { id: 'grow', label: 'Grow Planner', icon: <SproutIcon size={14} /> },
              { id: 'recipes', label: 'Recipes', icon: <Hammer size={14} /> },
              { id: 'stats', label: 'Stats', icon: <BarChart2 size={14} /> },
              { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
            ] as const).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex-shrink-0 flex items-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                style={
                  tab === id
                    ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                    : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
                }
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {tab === 'active' && (
            <div className="space-y-3">
              <ActiveQuestsSummary quests={activeQuests} nextUpQuests={nextUpQuests} />

              {/* Questlines that have at least one active quest */}
              {questlineGroups
                .filter(({ quests }) => quests.some((q) => activeQuestIds.has(q.id)))
                .map(({ name, quests }) => (
                  <ActiveQuestLine key={name} questline={name} quests={quests} />
                ))}

              {/* Standalone active quests (not part of any questline) */}
              {activeQuests.filter((q) => !q.questline).map((quest) => (
                <QuestCard key={quest.id} quest={quest} status="active" />
              ))}
            </div>
          )}

          {tab === 'locations' && (
            <LocationsTab activeQuests={activeQuests} nextUpQuests={nextUpQuests} />
          )}

          {tab === 'inventory' && (
            <InventoryPage />
          )}

          {tab === 'quests' && (
            <div className="space-y-3">

              <div className="space-y-2">
                {/* Search — full width */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filter by quest, item, NPC…"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                {/* Filters row */}
                <div className="flex gap-2 flex-wrap items-center">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                  >
                    <option value="all">All statuses</option>
                    <option value="completable">Completable now</option>
                    <option value="available">Available</option>
                    <option value="locked">Locked</option>
                    <option value="completed">Completed</option>
                    <option value="limited">Limited time</option>
                  </select>
                  <select
                    value={filterNpc}
                    onChange={(e) => setFilterNpc(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">All NPCs</option>
                    {npcs.map((npc) => (
                      <option key={npc} value={npc}>{npc}</option>
                    ))}
                  </select>
                  {(globalSearch || filterNpc || filterStatus !== 'all') && (
                    <button
                      onClick={() => { setGlobalSearch(''); setFilterNpc(''); setFilterStatus('all'); }}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-2"
                    >
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {isSearching || filterNpc || filterStatus !== 'all'
                  ? `${filteredQuests.length} results`
                  : `${filteredQuests.length} quests`}
              </p>

              <div className="space-y-2">
                {filteredQuests.slice(0, 200).map(({ quest, status }) => (
                  <QuestCard key={quest.id} quest={quest} status={status} />
                ))}
                {filteredQuests.length > 200 && (
                  <p className="text-xs text-slate-500 text-center py-2">
                    Showing first 200 — use search/filters to narrow results
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'questlines' && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search quest lines by name, NPC, or item…"
                  value={questlineSearch}
                  onChange={(e) => setQuestlineSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                {questlineSearch && (
                  <button
                    onClick={() => setQuestlineSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{visibleQuestlines.length} quest lines</p>
                <button
                  onClick={() => setShowCompletedLines(!showCompletedLines)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    showCompletedLines
                      ? 'bg-slate-700/50 text-slate-300 border-slate-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {showCompletedLines ? 'Hide completed lines' : 'Show completed lines'}
                </button>
              </div>
              {visibleQuestlines.map(({ name, quests }) => (
                <QuestLineView key={name} questline={name} quests={quests} />
              ))}
            </div>
          )}

          {tab === 'grow' && (
            <GrowPlanner questlineGroups={questlineGroups} />
          )}

          {tab === 'recipes' && (
            <RecipesPage />
          )}

          {tab === 'stats' && (
            <StatsTab questlineGroups={questlineGroups} />
          )}

          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-4">
                <SyncSection
                  user={sync.user}
                  authLoading={sync.authLoading}
                  syncStatus={sync.syncStatus}
                  lastSynced={sync.lastSynced}
                  signIn={sync.signIn}
                  signOut={sync.signOut}
                  pullNow={sync.pullNow}
                />
                <SkillsPanel />
                {/* Sync from Game */}
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
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Desktop — drag to bookmarks bar</p>
                    <div className="flex flex-wrap gap-3 items-center">
                      <a
                        ref={bookmarkAnchorRef}
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
                    <button
                      onClick={copyBookmarklet}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors"
                      style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                    >
                      {copied ? <><Check size={12} style={{ color: 'var(--accent-green)' }} /> Copied!</> : <><Copy size={12} /> Copy Bookmarklet Code</>}
                    </button>
                  </div>
                  <div className="space-y-2" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Mobile — copy URL &amp; save as bookmark</p>
                    <button
                      onClick={copyBookmarklet}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors"
                      style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                    >
                      {copied ? <><Check size={12} style={{ color: 'var(--accent-green)' }} /> Copied!</> : <><Copy size={12} /> Copy Bookmarklet URL</>}
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
                  <div className="space-y-1" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Using it</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Go to <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>farmrpg.com/inventory.php</span> and tap the bookmark. Your tracker opens in a new tab with inventory synced.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <ImportExport />
                <CropTimerPanel />
                <RecipesPanel />
              </div>
            </div>
          )}
        </main>
      </div>

      {showWizard && <SetupWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
