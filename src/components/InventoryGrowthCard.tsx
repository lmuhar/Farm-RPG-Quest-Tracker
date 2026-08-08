import { useState } from 'react';
import { TrendingUp, Target, Calendar } from 'lucide-react';
import { useStore } from '../store';

function computeGoalDate(inventoryMax: number, inventoryGoal: number, dailyGain: number, dailyResetTime: string): {
  daysNeeded: number;
  targetDate: Date | null;
  alreadyReached: boolean;
} {
  if (inventoryMax >= inventoryGoal) return { daysNeeded: 0, targetDate: null, alreadyReached: true };
  if (dailyGain <= 0) return { daysNeeded: Infinity, targetDate: null, alreadyReached: false };

  const deficit = inventoryGoal - inventoryMax;
  const resetsNeeded = Math.ceil(deficit / dailyGain);

  const now = new Date();
  const [hStr, mStr] = dailyResetTime.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);

  const todayReset = new Date(now);
  todayReset.setHours(h, m, 0, 0);

  // If today's reset has already passed, next reset is tomorrow
  const nextReset = now >= todayReset
    ? new Date(todayReset.getTime() + 24 * 60 * 60 * 1000)
    : todayReset;

  // The goal date is the reset at which we'll hit the target:
  // nextReset = +1 gain, nextReset+1d = +2 gains, ..., nextReset+(N-1)d = +N gains
  const targetDate = new Date(nextReset.getTime() + (resetsNeeded - 1) * 24 * 60 * 60 * 1000);

  return { daysNeeded: resetsNeeded, targetDate, alreadyReached: false };
}

export function InventoryGrowthCard() {
  const {
    inventoryMax, inventoryGoal, dailyGain, dailyResetTime,
    setInventoryGoal, setDailyGain, setDailyResetTime,
  } = useStore();

  const [goalInput, setGoalInput] = useState(String(inventoryGoal));
  const [gainInput, setGainInput] = useState(String(dailyGain));
  const [resetTimeInput, setResetTimeInput] = useState(dailyResetTime);

  const { daysNeeded, targetDate, alreadyReached } = computeGoalDate(inventoryMax, inventoryGoal, dailyGain, dailyResetTime);

  const formatTargetDate = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatResetTimeDisplay = (time: string) => {
    const [hStr, mStr] = time.split(':');
    const h = parseInt(hStr ?? '0', 10);
    const m = parseInt(mStr ?? '0', 10);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2">
        <TrendingUp size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Inventory Growth Tracker
        </p>
      </div>

      {/* Current + goal */}
      <div className="flex items-end gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Current slots</p>
          <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {inventoryMax.toLocaleString()}
          </p>
        </div>
        <div className="text-xl mb-1" style={{ color: 'var(--text-muted)' }}>→</div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-muted)' }}>Goal</p>
          <input
            type="number"
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(goalInput, 10);
              if (!isNaN(val) && val > 0) setInventoryGoal(val);
              else setGoalInput(String(inventoryGoal));
            }}
            className="w-24 text-xl font-bold rounded-lg px-2 py-0.5 focus:outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-blue)',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-default)',
            }}
          />
        </div>
      </div>

      {/* Progress bar */}
      {!alreadyReached && (
        <div>
          <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'var(--border-default)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((inventoryMax / inventoryGoal) * 100))}%`,
                background: 'var(--accent-blue)',
              }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {inventoryMax.toLocaleString()} / {inventoryGoal.toLocaleString()} · {inventoryGoal - inventoryMax} slots to go
          </p>
        </div>
      )}

      {/* Config row */}
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Slots/day</p>
          <input
            type="number"
            value={gainInput}
            onChange={e => setGainInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(gainInput, 10);
              if (!isNaN(val) && val > 0) setDailyGain(val);
              else setGainInput(String(dailyGain));
            }}
            className="w-16 text-sm font-semibold rounded-lg px-2 py-1 focus:outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-default)',
            }}
          />
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>Daily reset time</p>
          <input
            type="time"
            value={resetTimeInput}
            onChange={e => {
              setResetTimeInput(e.target.value);
              setDailyResetTime(e.target.value);
            }}
            className="text-sm font-semibold rounded-lg px-2 py-1 focus:outline-none"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-default)',
            }}
          />
        </div>
      </div>

      {/* Result */}
      <div
        className="rounded-lg px-4 py-3"
        style={{
          background: alreadyReached ? 'var(--accent-green-bg)' : 'var(--surface-inset)',
          border: `1px solid ${alreadyReached ? 'var(--accent-green-border)' : 'var(--border-default)'}`,
        }}
      >
        {alreadyReached ? (
          <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
            Goal already reached!
          </p>
        ) : daysNeeded === Infinity ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Set a daily gain above 0 to calculate.
          </p>
        ) : (
          <div className="flex items-start gap-3">
            <Calendar size={14} style={{ color: 'var(--accent-purple)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {daysNeeded} reset{daysNeeded !== 1 ? 's' : ''} away
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {targetDate && (
                  <>
                    <span style={{ color: 'var(--accent-purple)' }}>{formatTargetDate(targetDate)}</span>
                    {' '}at {formatResetTimeDisplay(dailyResetTime)}
                  </>
                )}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                +{dailyGain}/day · {daysNeeded} × {dailyGain} = +{daysNeeded * dailyGain} slots
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Goal achieved info when reached */}
      {alreadyReached && (
        <div className="flex items-center gap-2">
          <Target size={13} style={{ color: 'var(--accent-green)' }} />
          <p className="text-xs" style={{ color: 'var(--accent-green)' }}>
            {inventoryMax.toLocaleString()} ≥ {inventoryGoal.toLocaleString()} — set a new goal to keep tracking
          </p>
        </div>
      )}
    </div>
  );
}
