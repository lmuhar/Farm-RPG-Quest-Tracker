import { Database, ExternalLink } from 'lucide-react';
import syncMeta from '../data/sync-meta.json';

const WORKFLOW_URL = 'https://github.com/lmuhar/Farm-RPG-Quest-Tracker/actions/workflows/sync-buddyfarm.yml';

// Quest and item data is synced from buddy.farm by a weekly GitHub Action
// (.github/workflows/sync-buddyfarm.yml), which opens a PR when anything changes.
export function GameDataCard() {
  const updated = new Date(syncMeta.lastUpdated);
  const daysAgo = Math.floor((Date.now() - updated.getTime()) / 86_400_000);

  return (
    <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2">
        <Database size={15} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
        <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          Game Data
        </p>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {syncMeta.quests.toLocaleString()} quests · last updated from buddy.farm{' '}
        <span style={{ color: 'var(--text-primary)' }}>
          {updated.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        {daysAgo > 0 && <span style={{ color: 'var(--text-muted)' }}> ({daysAgo} day{daysAgo !== 1 ? 's' : ''} ago)</span>}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Checked weekly for new quests. Run it now from GitHub and merge the PR it opens.
      </p>
      <a
        href={WORKFLOW_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
        style={{ color: 'var(--accent-purple)' }}
      >
        Check for new quests <ExternalLink size={11} />
      </a>
    </div>
  );
}
