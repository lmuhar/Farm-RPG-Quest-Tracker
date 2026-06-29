import { useState, useMemo, useEffect } from 'react';
import { Sprout, ListTodo, GitBranch, Search, X, Wand2, Sprout as SproutIcon, BarChart2, Menu, Package } from 'lucide-react';
import questsData from './data/quests.json';
import type { Quest } from './types';
import { getQuestStatus, compareQuests, isLimitedTime, isCompletable } from './utils';
import { useStore } from './store';
import { SkillsPanel } from './components/SkillsPanel';
import { InventoryPanel } from './components/InventoryPanel';
import { CropTimerPanel } from './components/CropTimerPanel';
import { QuestCard } from './components/QuestCard';
import { QuestLineView } from './components/QuestLineView';
import { ActiveQuestsSummary } from './components/ActiveQuestsSummary';
import { ImportExport } from './components/ImportExport';
import { RecipesPanel } from './components/RecipesPanel';
import { SetupWizard } from './components/SetupWizard';
import { GrowPlanner } from './components/GrowPlanner';
import { StatsTab } from './components/StatsTab';
import { InventoryPage } from './components/InventoryPage';

const allQuests = questsData as Quest[];

type Tab = 'active' | 'inventory' | 'quests' | 'questlines' | 'grow' | 'stats';
type FilterStatus = 'all' | 'available' | 'locked' | 'completed' | 'completable' | 'limited';

export default function App() {
  const { player, questStatuses, inventory, cropTimes, plotCount, craftingRecipes, growQueue, questNotes, importState } = useStore();
  const [tab, setTab] = useState<Tab>('active');
  const [globalSearch, setGlobalSearch] = useState('');
  const [filterNpc, setFilterNpc] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [questlineSearch, setQuestlineSearch] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [showCompletedLines, setShowCompletedLines] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load state from server on mount (server wins over localStorage)
  useEffect(() => {
    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) importState(data); })
      .catch(() => {});
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
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="bg-slate-800/80 border-b border-slate-700 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Sprout size={22} className="text-green-400 flex-shrink-0" />
          <h1 className="text-lg font-bold text-white flex-shrink-0 hidden sm:block">Farm RPG</h1>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-slate-400 hover:text-slate-200 flex-shrink-0"
            title="Open sidebar"
          >
            <Menu size={18} />
          </button>

          {/* Global search */}
          <div className="relative flex-1 max-w-md mx-2 sm:mx-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search quests, items, NPCs…"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                if (e.target.value) setTab('quests');
              }}
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg pl-8 pr-8 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:bg-slate-700"
            />
            {globalSearch && (
              <button
                onClick={() => setGlobalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {completedCount < 10 && (
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 bg-purple-700/50 hover:bg-purple-700/70 text-purple-300 border border-purple-600/50 rounded-lg px-2.5 py-1.5 text-xs font-medium flex-shrink-0"
            >
              <Wand2 size={13} />
              <span className="hidden sm:inline">Quick Setup</span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-4 text-xs text-slate-400 flex-shrink-0">
            <span className="text-yellow-400 font-medium">{stats.active} active</span>
            <span className="text-green-400 font-medium">{stats.completed} done</span>
            <span className="hidden sm:inline">{stats.available} available</span>
            <span className="text-slate-600 hidden sm:inline">{stats.total} total</span>
          </div>
        </div>
      </header>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-slate-900 border-r border-slate-700 overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Sprout size={18} className="text-green-400" />
                <span className="font-bold text-white">Farm RPG</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <SkillsPanel />
              <InventoryPanel />
              <CropTimerPanel />
              <ImportExport />
              <RecipesPanel />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        <aside className="w-72 flex-shrink-0 space-y-4 hidden lg:block">
          <SkillsPanel />
          <InventoryPanel />
          <CropTimerPanel />
          <ImportExport />
          <RecipesPanel />
        </aside>

        <main className="flex-1 min-w-0 space-y-4">
          <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700 overflow-x-auto">
            {([
              { id: 'active', label: 'Active', icon: <ListTodo size={14} /> },
              { id: 'inventory', label: 'Inventory', icon: <Package size={14} /> },
              { id: 'quests', label: 'All Quests', icon: <Search size={14} /> },
              { id: 'questlines', label: 'Quest Lines', icon: <GitBranch size={14} /> },
              { id: 'grow', label: 'Grow Planner', icon: <SproutIcon size={14} /> },
              { id: 'stats', label: 'Stats', icon: <BarChart2 size={14} /> },
            ] as const).map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded text-xs sm:text-sm transition-colors whitespace-nowrap ${
                  tab === id
                    ? 'bg-purple-600 text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {icon} <span className="hidden xs:inline sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {tab === 'active' && (
            <div className="space-y-3">
              <ActiveQuestsSummary quests={activeQuests} questStatuses={questStatuses} questlineGroups={questlineGroups} />
              {activeQuests.length > 0 && (
                <div className="space-y-2">
                  {activeQuests.map((quest) => (
                    <QuestCard key={quest.id} quest={quest} status="active" />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'inventory' && (
            <InventoryPage />
          )}

          {tab === 'quests' && (
            <div className="space-y-3">

              <div className="flex gap-2 flex-wrap">
                {/* Per-tab search (mirrors global) */}
                <div className="relative flex-1 min-w-48">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filter by quest, item, NPC…"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
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
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="">All NPCs</option>
                  {npcs.map((npc) => (
                    <option key={npc} value={npc}>{npc}</option>
                  ))}
                </select>
                {(globalSearch || filterNpc || filterStatus !== 'all') && (
                  <button
                    onClick={() => { setGlobalSearch(''); setFilterNpc(''); setFilterStatus('all'); }}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
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

          {tab === 'stats' && (
            <StatsTab questlineGroups={questlineGroups} />
          )}
        </main>
      </div>

      {showWizard && <SetupWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
