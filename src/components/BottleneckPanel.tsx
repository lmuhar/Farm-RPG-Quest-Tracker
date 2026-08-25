import { AlertTriangle } from 'lucide-react';
import { WISHING_WELL_SOURCES } from '../data/bottlenecks';

export interface BottleneckEntry {
  item: string;
  have: number;
  need: number;
  location: string;
  towerLv?: { level: number; levelsAway: number };
  /** How many active quests need this item (Dashboard) */
  activeCount?: number;
  /** How many next-up quests need this item (Dashboard) */
  nextupCount?: number;
  /** How many quests in the questline need this item (QuestFocus) */
  questCount?: number;
}

interface Props {
  entries: BottleneckEntry[];
  hint?: string;
}

export function BottleneckPanel({ entries, hint = '— no easy source' }: Props) {
  if (entries.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface-card)', border: '1px solid var(--accent-orange-border)' }}
    >
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ background: 'var(--accent-orange-bg)', borderBottom: '1px solid var(--accent-orange-border)' }}
      >
        <AlertTriangle size={13} style={{ color: 'var(--accent-orange)' }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent-orange)' }}>
          Bottlenecks
        </span>
        <span className="text-xs ml-1" style={{ color: 'var(--accent-orange)', opacity: 0.7 }}>{hint}</span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {entries.map(({ item, have, need, location, towerLv, activeCount, nextupCount, questCount }) => {
          const wellSources = WISHING_WELL_SOURCES.get(item);
          return (
            <div key={item} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item}</span>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{location}</span>
                    {towerLv && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}
                      >
                        Tower Lv {towerLv.level} ({towerLv.levelsAway} away)
                      </span>
                    )}
                    {activeCount != null && activeCount > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)' }}
                      >
                        {activeCount} active
                      </span>
                    )}
                    {nextupCount != null && nextupCount > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
                      >
                        {nextupCount} next up
                      </span>
                    )}
                    {questCount != null && questCount > 1 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }}
                      >
                        {questCount} quests
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="text-sm font-semibold flex-shrink-0"
                  style={{ fontFamily: 'var(--font-mono)', color: have >= need ? 'var(--accent-green)' : 'var(--accent-orange)' }}
                >
                  {have}/{need}
                </span>
              </div>
              {wellSources && (
                <div className="mt-1 text-[10px] flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>throw in:</span>
                  {wellSources.map(({ item: src, pct }) => (
                    <span key={src}>{src} <span style={{ opacity: 0.6 }}>{pct}%</span></span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
