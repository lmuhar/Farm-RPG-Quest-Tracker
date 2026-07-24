import { useMemo, useState } from 'react';
import { Fish, Compass, MapPin } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems } from '../utils';
import { useStore } from '../store';
import locationData from '../data/item-locations.json';

const locations = locationData as Record<string, { name: string; type: string }[]>;

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
}

type TypeFilter = 'all' | 'fishing' | 'explore';

export function LocationsTab({ activeQuests, nextUpQuests }: Props) {
  const { inventory } = useStore();
  const [includeNextUp, setIncludeNextUp] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const itemData = useMemo(() => {
    const map = new Map<string, { totalNeeded: number; have: number }>();
    const quests = includeNextUp ? [...activeQuests, ...nextUpQuests] : activeQuests;
    for (const quest of quests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const prev = map.get(item);
        if (prev) prev.totalNeeded += quantity;
        else map.set(item, { totalNeeded: quantity, have: inventory[item] ?? 0 });
      }
    }
    return map;
  }, [activeQuests, nextUpQuests, includeNextUp, inventory]);

  const neededItems = useMemo(
    () => [...itemData.entries()].filter(([, d]) => d.have < d.totalNeeded).map(([item]) => item),
    [itemData]
  );

  const locationGroups = useMemo(() => {
    const groups = new Map<string, { type: string; items: string[] }>();
    for (const item of neededItems) {
      for (const loc of locations[item] ?? []) {
        if (!groups.has(loc.name)) groups.set(loc.name, { type: loc.type, items: [] });
        groups.get(loc.name)!.items.push(item);
      }
    }
    return [...groups.entries()]
      .filter(([, { type }]) => typeFilter === 'all' || type === typeFilter)
      .sort((a, b) => b[1].items.length - a[1].items.length);
  }, [neededItems, typeFilter]);

  const multiItemLocations = locationGroups.filter(([, { items }]) => items.length > 1);
  const singleItemLocations = locationGroups.filter(([, { items }]) => items.length === 1);

  if (activeQuests.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <MapPin size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No active quests — mark some as active to see location suggestions
        </p>
      </div>
    );
  }

  const renderCard = ([locName, { type, items: locItems }]: [string, { type: string; items: string[] }]) => {
    const isFishing = type === 'fishing';
    const Icon = isFishing ? Fish : Compass;
    const color = isFishing ? 'var(--accent-blue)' : 'var(--accent-green)';
    const bg = isFishing ? 'var(--accent-blue-bg)' : 'var(--accent-green-bg)';
    const border = isFishing ? 'var(--accent-blue-border)' : 'var(--accent-green-border)';

    return (
      <div
        key={locName}
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="px-4 py-2.5 flex items-center gap-2"
          style={{ background: bg, borderBottom: `1px solid ${border}` }}
        >
          <Icon size={13} style={{ color, flexShrink: 0 }} />
          <span className="text-sm font-semibold" style={{ color }}>{locName}</span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: 'oklch(0 0 0 / 0.15)', color }}
          >
            {type}
          </span>
          <span className="text-xs font-semibold ml-auto flex-shrink-0" style={{ color, opacity: 0.8 }}>
            {locItems.length} item{locItems.length !== 1 ? 's' : ''}
          </span>
        </div>
        {locItems.map((item) => {
          const data = itemData.get(item);
          if (!data) return null;
          const { totalNeeded, have } = data;
          const pct = Math.min(1, totalNeeded > 0 ? have / totalNeeded : 1);
          const done = have >= totalNeeded;
          return (
            <div key={item} className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span
                  className="text-sm"
                  style={{ color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : undefined }}
                >
                  {item}
                </span>
                <span
                  className="text-xs font-semibold flex-shrink-0"
                  style={{ fontFamily: 'var(--font-mono)', color: done ? 'var(--accent-green)' : color }}
                >
                  {have}/{totalNeeded}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(pct * 100)}%`, background: done ? 'var(--accent-green)' : color, transition: 'var(--transition-default)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div
        className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Type:</span>
          {(['all', 'fishing', 'explore'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
              style={
                typeFilter === t
                  ? { background: 'var(--accent-purple)', color: '#fff' }
                  : { background: 'var(--surface-inset)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }
              }
            >
              {t === 'all' ? 'All' : t === 'fishing' ? 'Fishing' : 'Explore'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Include next up</span>
          <input
            type="checkbox"
            checked={includeNextUp}
            onChange={(e) => setIncludeNextUp(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-purple-500"
          />
        </label>
      </div>

      {locationGroups.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <MapPin size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {neededItems.length === 0
              ? 'All items collected — nothing left to farm!'
              : 'No location data for remaining items'}
          </p>
        </div>
      ) : (
        <>
          {multiItemLocations.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
                Best spots — multiple items
              </p>
              {multiItemLocations.map(renderCard)}
            </div>
          )}
          {singleItemLocations.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: 'var(--text-muted)' }}>
                Single item locations
              </p>
              {singleItemLocations.map(renderCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
