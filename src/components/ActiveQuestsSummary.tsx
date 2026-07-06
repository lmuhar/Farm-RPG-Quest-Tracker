import { useMemo } from 'react';
import { Swords } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems } from '../utils';
import { useStore } from '../store';

interface Props {
  quests: Quest[];
}

export function ActiveQuestsSummary({ quests }: Props) {
  const { inventory, cropTimes } = useStore();

  const stats = useMemo(() => {
    const itemMap = new Map<string, number>();
    for (const quest of quests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        itemMap.set(item, (itemMap.get(item) ?? 0) + quantity);
      }
    }
    let missingItems = 0;
    let cropsNeeded = 0;
    let itemsReady = 0;
    for (const [item, needed] of itemMap) {
      const have = inventory[item] ?? 0;
      if (have >= needed) {
        itemsReady++;
      } else {
        missingItems++;
        if (cropTimes.find((c) => c.item.toLowerCase() === item.toLowerCase())) {
          cropsNeeded++;
        }
      }
    }
    return { missingItems, cropsNeeded, itemsReady, totalItems: itemMap.size };
  }, [quests, inventory, cropTimes]);

  if (quests.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <Swords size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No active quests — mark some as active to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Active quest count */}
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
        style={{
          background: 'var(--accent-yellow-bg)',
          color: 'var(--accent-yellow)',
          border: '1px solid var(--accent-yellow-border)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <Swords size={11} />
        {quests.length} active quest{quests.length !== 1 ? 's' : ''}
      </span>

      {stats.missingItems > 0 ? (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            background: 'var(--accent-orange-bg)',
            color: 'var(--accent-orange)',
            border: '1px solid var(--accent-orange-border)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {stats.missingItems} item{stats.missingItems !== 1 ? 's' : ''} missing
          {stats.cropsNeeded > 0 && ` · ${stats.cropsNeeded} to grow`}
        </span>
      ) : (
        stats.totalItems > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: 'var(--accent-green-bg)',
              color: 'var(--accent-green)',
              border: '1px solid var(--accent-green-border)',
              fontFamily: 'var(--font-body)',
            }}
          >
            ✓ All items stocked
          </span>
        )
      )}
    </div>
  );
}
