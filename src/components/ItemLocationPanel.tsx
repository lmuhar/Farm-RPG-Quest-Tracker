import { Fish, Compass } from 'lucide-react';
import locationData from '../data/item-locations.json';

type LocationEntry = { name: string; type: string };
const locations = locationData as Record<string, LocationEntry[]>;

// For a set of needed items, group them by location → items at that location
export function getLocationGroups(neededItems: string[]): Map<string, { type: string; items: string[] }> {
  const groups = new Map<string, { type: string; items: string[] }>();
  for (const item of neededItems) {
    const locs = locations[item] ?? [];
    for (const loc of locs) {
      if (!groups.has(loc.name)) groups.set(loc.name, { type: loc.type, items: [] });
      groups.get(loc.name)!.items.push(item);
    }
  }
  return groups;
}

interface Props {
  item: string;
  // All items currently needed (active quest items) so we can show co-located items
  allNeededItems: string[];
}

export function ItemLocationPanel({ item, allNeededItems }: Props) {
  const itemLocs = locations[item];

  if (!itemLocs || itemLocs.length === 0) {
    return (
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No location data available for this item
      </p>
    );
  }

  // For each location this item is at, find other needed items also at that location
  return (
    <div className="mt-1.5 space-y-2">
      {itemLocs.map((loc) => {
        const coLocated = allNeededItems.filter(
          (other) => other !== item && (locations[other] ?? []).some((l) => l.name === loc.name)
        );
        const Icon = loc.type === 'fishing' ? Fish : Compass;
        const color = loc.type === 'fishing' ? 'var(--accent-blue)' : 'var(--accent-green)';
        const bg = loc.type === 'fishing' ? 'var(--accent-blue-bg)' : 'var(--accent-green-bg)';
        const border = loc.type === 'fishing' ? 'var(--accent-blue-border)' : 'var(--accent-green-border)';

        return (
          <div
            key={loc.name}
            className="rounded-lg px-3 py-2"
            style={{ background: bg, border: `1px solid ${border}` }}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={11} style={{ color, flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color }}>
                {loc.name}
              </span>
              <span className="text-[10px] ml-0.5" style={{ color, opacity: 0.7 }}>
                {loc.type}
              </span>
            </div>
            {coLocated.length > 0 && (
              <p className="text-[11px] mt-1" style={{ color }}>
                Also needed here: {coLocated.join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface LocationGroupPanelProps {
  // Show all locations for a set of needed items — used for the "by location" overview
  neededItems: string[];
}

export function LocationGroupPanel({ neededItems }: LocationGroupPanelProps) {
  const groups = getLocationGroups(neededItems);
  if (groups.size === 0) return null;

  const sorted = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length);

  return (
    <div className="space-y-2">
      {sorted.map(([locName, { type, items: locItems }]) => {
        const Icon = type === 'fishing' ? Fish : Compass;
        const color = type === 'fishing' ? 'var(--accent-blue)' : 'var(--accent-green)';
        const bg = type === 'fishing' ? 'var(--accent-blue-bg)' : 'var(--accent-green-bg)';
        const border = type === 'fishing' ? 'var(--accent-blue-border)' : 'var(--accent-green-border)';

        return (
          <div key={locName} className="rounded-lg px-3 py-2" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={11} style={{ color, flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color }}>{locName}</span>
              <span className="text-[10px]" style={{ color, opacity: 0.7 }}>{type}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {locItems.map((it) => (
                <span
                  key={it}
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: 'oklch(0 0 0 / 0.15)', color }}
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
