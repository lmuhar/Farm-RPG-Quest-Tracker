import { useState, useMemo, useEffect } from 'react';
import {
  ListTodo, GitBranch, Search, X, Wand2, Sprout as SproutIcon, BarChart2, Package,
  Settings, Hammer, RefreshCw, Menu, MapPin, Building2, PawPrint, Users, Layers,
  LayoutDashboard, Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import questsData from './data/quests.json';
import type { Quest } from './types';
import { getQuestStatus, compareQuests } from './utils';
import { useStore } from './store';
import { useSync } from './hooks/useSync';
import { SkillsPanel } from './components/SkillsPanel';
import { CropTimerPanel } from './components/CropTimerPanel';
import { SyncSection } from './components/SyncSection';
import { ImportExport } from './components/ImportExport';
import { RecipesPanel } from './components/RecipesPanel';
import { SetupWizard } from './components/SetupWizard';
import { GrowPlanner } from './components/GrowPlanner';
import { StatsTab } from './components/StatsTab';
import { InventoryPage } from './components/InventoryPage';
import { RecipesPage } from './components/RecipesPage';
import { LocationsTab } from './components/LocationsTab';
import { ToweringInvestmentPage } from './components/ToweringInvestmentPage';
import { TheTowerPage } from './components/TheTowerPage';
import { PetsPage } from './components/PetsPage';
import { NpcPage } from './components/NpcPage';
import { CraftworksSuggestions } from './components/CraftworksSuggestions';
import { Dashboard } from './components/Dashboard';
import { InventoryGrowthCard } from './components/InventoryGrowthCard';
import { MasteriesPage } from './components/MasteriesPage';
import { ActiveTab } from './components/ActiveTab';
import { QuestsTab } from './components/QuestsTab';
import { QuestlinesTab } from './components/QuestlinesTab';
import { BookmarkletSection } from './components/BookmarkletSection';

const allQuests = questsData as Quest[];

type Tab =
  | 'dashboard' | 'active' | 'locations' | 'tower' | 'the-tower' | 'inventory'
  | 'pets' | 'npcs' | 'quests' | 'questlines' | 'grow' | 'craftworks' | 'recipes'
  | 'masteries' | 'stats' | 'settings';

interface NavItem { id: Tab; label: string; Icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',   Icon: LayoutDashboard },
  { id: 'active',     label: 'Active',       Icon: ListTodo },
  { id: 'locations',  label: 'Locations',    Icon: MapPin },
  { id: 'tower',      label: 'Quest Focus',  Icon: Building2 },
  { id: 'the-tower',  label: 'The Tower',    Icon: Layers },
  { id: 'inventory',  label: 'Inventory',    Icon: Package },
  { id: 'pets',       label: 'Pets',         Icon: PawPrint },
  { id: 'npcs',       label: 'NPCs',         Icon: Users },
  { id: 'quests',     label: 'All Quests',   Icon: Search },
  { id: 'questlines', label: 'Quest Lines',  Icon: GitBranch },
  { id: 'grow',       label: 'Grow Planner', Icon: SproutIcon },
  { id: 'craftworks', label: 'Craftworks',   Icon: Hammer },
  { id: 'recipes',    label: 'Recipes',      Icon: Hammer },
  { id: 'masteries',  label: 'Masteries',    Icon: Trophy },
];

const META_ITEMS: NavItem[] = [
  { id: 'stats',    label: 'Stats',    Icon: BarChart2 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function App() {
  const { player, questStatuses, inventory, cropTimes, plotCount, craftingRecipes, growQueue, questNotes, importState } = useStore();
  const sync = useSync();
  const [tab, setTab] = useState<Tab>('tower');
  const [menuOpen, setMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);

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

    const applyHashInv = () => { if (hashInv) importState({ inventory: hashInv }); };

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

  const questsWithStatus = useMemo(
    () => allQuests.map((q) => ({ quest: q, status: getQuestStatus(q, player, questStatuses) })),
    [player, questStatuses]
  );

  const activeQuests = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'active').map((q) => q.quest),
    [questsWithStatus]
  );

  const completedCount = useMemo(
    () => questsWithStatus.filter((q) => q.status === 'completed').length,
    [questsWithStatus]
  );

  const stats = useMemo(() => ({
    active: activeQuests.length,
    completed: completedCount,
    available: questsWithStatus.filter((q) => q.status === 'available').length,
  }), [questsWithStatus, activeQuests, completedCount]);

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

  const activeQuestIds = useMemo(() => new Set(activeQuests.map((q) => q.id)), [activeQuests]);

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

  // Shared nav button style helper
  const navStyle = (isActive: boolean) =>
    isActive
      ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
      : { color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' };

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-app)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
      <header
        className="sticky top-0 z-10 backdrop-blur-sm"
        style={{ background: 'oklch(0.25 0.022 258 / 0.85)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            className="md:hidden flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <button
            onClick={() => { setTab('active'); setMenuOpen(false); }}
            className="flex items-center gap-2 flex-1 md:flex-none justify-center md:justify-start rounded-lg transition-opacity hover:opacity-80"
            aria-label="Home"
          >
            <img src="/favicon.svg" alt="" style={{ width: 26, height: 26, flexShrink: 0 }} />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Farm RPG Tracker
            </h1>
          </button>

          <div className="relative hidden md:block flex-1 max-w-md mx-4">
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
              className="hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium flex-shrink-0 transition-colors"
              style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
            >
              <Wand2 size={13} />
              Quick Setup
            </button>
          )}

          <div className="hidden md:flex ml-auto items-center gap-3 text-xs flex-shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>{stats.active} active</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{stats.completed} done</span>
            <span style={{ color: 'var(--text-muted)' }}>{stats.available} available</span>
          </div>

          <button
            onClick={() => sync.pullNow()}
            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
            style={{ color: sync.syncStatus === 'syncing' ? 'var(--accent-green)' : 'var(--text-muted)' }}
            aria-label="Sync data"
            title={sync.user ? 'Sync from cloud' : 'Sign in to sync'}
          >
            <RefreshCw size={16} className={sync.syncStatus === 'syncing' ? 'animate-spin' : ''} />
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
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <img src="/favicon.svg" alt="" style={{ width: 24, height: 24 }} />
              <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                Farm RPG Tracker
              </span>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {[...NAV_ITEMS, ...META_ITEMS].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTab(id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
                  style={navStyle(tab === id)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="max-w-7xl mx-auto flex">
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex w-52 flex-shrink-0 flex-col sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto"
          style={{ borderRight: '1px solid var(--border-subtle)' }}
        >
          <nav className="flex flex-col gap-0.5 px-2 py-4">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
                style={navStyle(tab === id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
            <div className="h-px my-2 mx-1" style={{ background: 'var(--border-subtle)' }} />
            {META_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left"
                style={navStyle(tab === id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 md:px-6 py-6">
          <main className="space-y-4">
            {tab === 'dashboard' && (
              <Dashboard activeQuests={activeQuests} nextUpQuests={nextUpQuests} onTabChange={(t) => setTab(t as Tab)} />
            )}
            {tab === 'active' && (
              <ActiveTab activeQuests={activeQuests} nextUpQuests={nextUpQuests} questlineGroups={questlineGroups} />
            )}
            {tab === 'locations' && (
              <LocationsTab activeQuests={activeQuests} nextUpQuests={nextUpQuests} />
            )}
            {tab === 'tower' && <ToweringInvestmentPage />}
            {tab === 'the-tower' && <TheTowerPage />}
            {tab === 'inventory' && <InventoryPage />}
            {tab === 'pets' && <PetsPage activeQuests={activeQuests} />}
            {tab === 'npcs' && <NpcPage />}
            {tab === 'quests' && (
              <QuestsTab globalSearch={globalSearch} setGlobalSearch={setGlobalSearch} />
            )}
            {tab === 'questlines' && (
              <QuestlinesTab questlineGroups={questlineGroups} />
            )}
            {tab === 'grow' && <GrowPlanner questlineGroups={questlineGroups} />}
            {tab === 'craftworks' && (
              <CraftworksSuggestions quests={activeQuests} nextUpQuests={nextUpQuests} />
            )}
            {tab === 'recipes' && <RecipesPage />}
            {tab === 'masteries' && <MasteriesPage />}
            {tab === 'stats' && <StatsTab questlineGroups={questlineGroups} />}
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
                  <BookmarkletSection />
                </div>
                <div className="space-y-4">
                  <InventoryGrowthCard />
                  <ImportExport />
                  <CropTimerPanel />
                  <RecipesPanel />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {showWizard && <SetupWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
