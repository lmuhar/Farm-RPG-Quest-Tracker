import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Layers, CheckCircle2, Circle, Gem, ChevronRight, Coins } from 'lucide-react';
import towerLevelsData from '../data/tower-levels.json';
import towerArtifactsData from '../data/tower-artifacts.json';
import { useStore } from '../store';

interface TowerLevelData {
  level: number;
  silverCost: number;
  megaMasteries: number;
  items: { item: string; quantity: number }[];
}

interface Artifact {
  floor: number;
  name: string;
  perkName: string;
  perkType: 'perk_point' | 'gold';
  description: string;
  notes?: string;
}

const allLevels = towerLevelsData as TowerLevelData[];
const artifactByFloor = new Map<number, Artifact>(
  (towerArtifactsData as Artifact[]).map((a) => [a.floor, a])
);

function formatSilver(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function formatQty(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function RewardChip({ item, quantity }: { item: string; quantity: number }) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs"
      style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
    >
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item}</span>
      <span className="font-mono text-[10px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        ×{formatQty(quantity)}
      </span>
    </div>
  );
}

function ArtifactPanel({ artifact }: { artifact: Artifact }) {
  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{ background: 'var(--accent-purple-bg)', border: '1px solid var(--accent-purple-border)' }}
    >
      <div className="flex items-center gap-2">
        <Gem size={13} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
        <span className="text-sm font-bold" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-display)' }}>
          {artifact.name}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {artifact.description}
      </p>
      {artifact.notes && (
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {artifact.notes}
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Perk:</span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={
            artifact.perkType === 'gold'
              ? { background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }
              : { background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }
          }
        >
          {artifact.perkType === 'gold' ? <Coins size={8} /> : <span>★</span>}
          {artifact.perkType === 'gold' ? '1 Gold' : 'Perk point'}
        </span>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          "{artifact.perkName}"
        </span>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Purchase the perk from Farm Supply / perk list to activate
      </p>
    </div>
  );
}

function LevelCard({
  levelData,
  isCurrent,
}: {
  levelData: TowerLevelData;
  isCurrent: boolean;
}) {
  const artifact = artifactByFloor.get(levelData.level);
  const isMilestone = levelData.level % 10 === 0;
  const [showArtifact, setShowArtifact] = useState(false);

  return (
    <div
      className="rounded-xl p-3 space-y-2.5"
      style={{
        background: 'var(--surface-card)',
        border: `1px solid ${isCurrent ? 'var(--accent-yellow-border)' : artifact ? 'var(--accent-purple-border)' : 'var(--border-subtle)'}`,
      }}
    >
      {/* Level header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Circle size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span
            className="text-sm font-bold"
            style={{ fontFamily: 'var(--font-display)', color: isCurrent ? 'var(--accent-yellow)' : 'var(--text-primary)' }}
          >
            Level {levelData.level}
          </span>
          {isCurrent && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}
            >
              Next
            </span>
          )}
          {isMilestone && !artifact && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
              style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
            >
              Milestone
            </span>
          )}
        </div>
        {artifact && (
          <button
            onClick={() => setShowArtifact((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'var(--accent-purple-bg)', border: '1px solid var(--accent-purple-border)', color: 'var(--accent-purple)' }}
          >
            <Gem size={11} />
            <span className="text-[10px] font-semibold">{artifact.name}</span>
            <ChevronRight
              size={10}
              style={{ transform: showArtifact ? 'rotate(90deg)' : 'none', transition: 'var(--transition-fast)' }}
            />
          </button>
        )}
      </div>

      {/* Artifact panel */}
      {artifact && showArtifact && <ArtifactPanel artifact={artifact} />}

      {/* Cost row */}
      <div className="flex flex-wrap gap-1.5">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
          style={{ background: 'var(--accent-blue-bg)', border: '1px solid var(--accent-blue-border)', color: 'var(--accent-blue)' }}
        >
          <span className="text-[10px] uppercase tracking-wide opacity-70">Silver</span>
          <span className="font-mono">{formatSilver(levelData.silverCost)}</span>
        </div>
        {levelData.megaMasteries > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ background: 'var(--accent-orange-bg)', border: '1px solid var(--accent-orange-border)', color: 'var(--accent-orange)' }}
          >
            <span className="text-[10px] uppercase tracking-wide opacity-70">Mega Masteries</span>
            <span className="font-mono">{levelData.megaMasteries}</span>
          </div>
        )}
      </div>

      {/* Rewards */}
      {levelData.items.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Rewards</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {levelData.items.map(({ item, quantity }) => (
              <RewardChip key={item} item={item} quantity={quantity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SHOW_AHEAD = 10;

export function TheTowerPage() {
  const { towerLevel, setTowerLevel, mastered, setMastered, grandMastered, setGrandMastered, megaMastered, setMegaMastered } = useStore();
  const [showAll, setShowAll] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [editingField, setEditingField] = useState<'mastered' | 'grandMastered' | 'megaMastered' | null>(null);
  const [masteryInputValue, setMasteryInputValue] = useState('');

  const maxLevel = allLevels[allLevels.length - 1]?.level ?? 340;

  const upcomingLevels = useMemo(() => {
    return allLevels.filter((l) => l.level > towerLevel);
  }, [towerLevel]);

  const displayedLevels = showAll ? upcomingLevels : upcomingLevels.slice(0, SHOW_AHEAD);

  const completedCount = towerLevel;
  const totalSilverAhead = useMemo(
    () => upcomingLevels.reduce((sum, l) => sum + l.silverCost, 0),
    [upcomingLevels]
  );
  const totalMegaMasteriesAhead = useMemo(
    () => upcomingLevels.reduce((sum, l) => sum + l.megaMasteries, 0),
    [upcomingLevels]
  );

  function commitLevel(raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0 && n <= maxLevel) setTowerLevel(n);
    setEditing(false);
    setInputValue('');
  }

  function commitMastery(raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      if (editingField === 'mastered') setMastered(n);
      else if (editingField === 'grandMastered') setGrandMastered(n);
      else if (editingField === 'megaMastered') setMegaMastered(n);
    }
    setEditingField(null);
    setMasteryInputValue('');
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-start gap-3">
          <Layers size={18} style={{ color: 'var(--accent-purple)', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-bold"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              The Tower
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Contribute items to climb The Tower. Track your current level and what's coming up.
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex flex-wrap gap-3">
          <div
            className="flex flex-col px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Current Level</span>
            {editing ? (
              <input
                autoFocus
                type="number"
                min={0}
                max={maxLevel}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={() => commitLevel(inputValue)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitLevel(inputValue); if (e.key === 'Escape') { setEditing(false); setInputValue(''); } }}
                className="text-lg font-bold w-20 bg-transparent focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-yellow)' }}
              />
            ) : (
              <button
                onClick={() => { setEditing(true); setInputValue(String(towerLevel)); }}
                className="text-lg font-bold text-left hover:opacity-70 transition-opacity"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-yellow)' }}
                title="Click to edit"
              >
                {towerLevel} / {maxLevel}
              </button>
            )}
          </div>

          <div
            className="flex flex-col px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Levels Remaining</span>
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {upcomingLevels.length}
            </span>
          </div>

          <div
            className="flex flex-col px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Silver Remaining</span>
            <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)' }}>
              {formatSilver(totalSilverAhead)}
            </span>
          </div>

          {(
            [
              { field: 'mastered', label: 'Mastered', value: mastered },
              { field: 'grandMastered', label: 'Grand Mastered', value: grandMastered },
              { field: 'megaMastered', label: 'Mega Mastered', value: megaMastered },
            ] as const
          ).map(({ field, label, value }) => (
            <div
              key={field}
              className="flex flex-col px-3 py-2 rounded-lg"
              style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
            >
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
              {editingField === field ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={masteryInputValue}
                  onChange={(e) => setMasteryInputValue(e.target.value)}
                  onBlur={() => commitMastery(masteryInputValue)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitMastery(masteryInputValue); if (e.key === 'Escape') { setEditingField(null); setMasteryInputValue(''); } }}
                  className="text-lg font-bold w-20 bg-transparent focus:outline-none"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}
                />
              ) : (
                <button
                  onClick={() => { setEditingField(field); setMasteryInputValue(String(value)); }}
                  className="text-lg font-bold text-left hover:opacity-70 transition-opacity"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}
                  title="Click to edit"
                >
                  {value}
                </button>
              )}
            </div>
          ))}

          <div
            className="flex flex-col px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Mega Mastered Needed</span>
            <span
              className="text-lg font-bold"
              style={{ fontFamily: 'var(--font-mono)', color: totalMegaMasteriesAhead > megaMastered ? 'var(--accent-yellow)' : 'var(--accent-green)' }}
            >
              {Math.max(0, totalMegaMasteriesAhead - megaMastered)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-inset)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((completedCount / maxLevel) * 100)}%`,
                background: 'var(--accent-purple)',
              }}
            />
          </div>
          <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {Math.round((completedCount / maxLevel) * 100)}% complete
          </p>
        </div>

        {/* Level stepper */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Adjust level:</span>
          <button
            onClick={() => setTowerLevel(Math.max(0, towerLevel - 1))}
            disabled={towerLevel <= 0}
            className="p-1 rounded-lg transition-colors disabled:opacity-30"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => setTowerLevel(Math.min(maxLevel, towerLevel + 1))}
            disabled={towerLevel >= maxLevel}
            className="p-1 rounded-lg transition-colors disabled:opacity-30"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <ChevronUp size={14} />
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or click the level number to type it</span>
        </div>
      </div>

      {/* Upcoming levels */}
      {upcomingLevels.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <CheckCircle2 size={32} className="mx-auto mb-2" style={{ color: 'var(--accent-green)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tower Complete!</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>You've reached the max level.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {showAll ? `All ${upcomingLevels.length} remaining levels` : `Next ${Math.min(SHOW_AHEAD, upcomingLevels.length)} levels`}
            </p>
          </div>

          {displayedLevels.map((levelData, idx) => (
            <LevelCard
              key={levelData.level}
              levelData={levelData}
              isCurrent={idx === 0}
            />
          ))}

          {upcomingLevels.length > SHOW_AHEAD && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {showAll ? 'Show fewer levels' : `Show all ${upcomingLevels.length} remaining levels`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
