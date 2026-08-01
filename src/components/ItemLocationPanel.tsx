import { Fish, Compass, PawPrint, KeyRound } from 'lucide-react';
import locationData from '../data/item-locations.json';
import petsData from '../data/pets.json';
import locksmithData from '../data/locksmith-items.json';
import { useStore } from '../store';

type LocationEntry = { name: string; type: string };
type LocksmithEntry = { name: string; type: string; key?: string };
const locations = locationData as Record<string, LocationEntry[]>;
const locksmithSources = locksmithData as Record<string, LocksmithEntry[]>;

interface PetEntry { petId: number; petName: string; minLevel: 1 | 3 | 6 }
const petLootMap: Record<string, PetEntry[]> = {};
for (const pet of petsData as { id: number; name: string; loot: Record<string, string[]> }[]) {
  for (const [tier, items] of Object.entries(pet.loot)) {
    const minLevel = Number(tier) as 1 | 3 | 6;
    for (const item of items) {
      if (!petLootMap[item]) petLootMap[item] = [];
      petLootMap[item].push({ petId: pet.id, petName: pet.name, minLevel });
    }
  }
}

// For a set of needed items, group them by location → items at that location
export function getLocationGroups(neededItems: string[]): Map<string, { type: string; items: string[] }> {
  const groups = new Map<string, { type: string; items: string[] }>();
  for (const item of neededItems) {
    const locs = locations[item] ?? [];
    for (const loc of locs) {
      if (!groups.has(loc.name)) groups.set(loc.name, { type: loc.type, items: [] });
      groups.get(loc.name)!.items.push(item);
    }
    const pets = petLootMap[item] ?? [];
    for (const { petName } of pets) {
      const key = `${petName} (pet)`;
      if (!groups.has(key)) groups.set(key, { type: 'pet', items: [] });
      if (!groups.get(key)!.items.includes(item)) groups.get(key)!.items.push(item);
    }
    const chests = locksmithSources[item] ?? [];
    for (const loc of chests) {
      if (!groups.has(loc.name)) groups.set(loc.name, { type: loc.type, items: [] });
      if (!groups.get(loc.name)!.items.includes(item)) groups.get(loc.name)!.items.push(item);
    }
  }
  return groups;
}

interface Props {
  item: string;
  allNeededItems: string[];
}

export function ItemLocationPanel({ item, allNeededItems }: Props) {
  const inventory = useStore(s => s.inventory);
  const ownedPets = useStore(s => s.ownedPets);
  const itemLocs = locations[item] ?? [];
  const itemPets = petLootMap[item] ?? [];
  const itemChests = locksmithSources[item] ?? [];

  if (itemLocs.length === 0 && itemPets.length === 0 && itemChests.length === 0) {
    return (
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No location data available for this item
      </p>
    );
  }

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
          <div key={loc.name} className="rounded-lg px-3 py-2" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-1.5">
              <Icon size={11} style={{ color, flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color }}>{loc.name}</span>
              <span className="text-[10px] ml-0.5" style={{ color, opacity: 0.7 }}>{loc.type}</span>
            </div>
            {coLocated.length > 0 && (
              <p className="text-[11px] mt-1" style={{ color }}>
                Also needed here: {coLocated.join(', ')}
              </p>
            )}
          </div>
        );
      })}

      {(() => {
        // Pets not yet covering this item (not owned at the required level)
        const neededPets = itemPets.filter(({ petId, minLevel }) => (ownedPets[petId] ?? 0) < minLevel);
        if (neededPets.length === 0) return null;
        return (
          <div
            className="rounded-lg px-3 py-2"
            style={{ background: 'var(--accent-orange-bg)', border: '1px solid var(--accent-orange-border)' }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <PawPrint size={11} style={{ color: 'var(--accent-orange)', flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--accent-orange)' }}>Pet loot</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {neededPets.map(({ petId, petName, minLevel }) => {
                const currentLevel = ownedPets[petId] ?? 0;
                return (
                  <span key={petName} className="text-[11px]" style={{ color: 'var(--accent-orange)' }}>
                    {petName}
                    {currentLevel > 0
                      ? <span style={{ opacity: 0.7 }}> (upgrade to lv {minLevel})</span>
                      : <span style={{ opacity: 0.7 }}> (lv {minLevel}+)</span>
                    }
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {itemChests.length > 0 && (
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: 'var(--accent-purple-bg)', border: '1px solid var(--accent-purple-border)' }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <KeyRound size={11} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-purple)' }}>Locksmith</span>
          </div>
          <div className="space-y-1.5">
            {itemChests.map(({ name, type, key: keyName }) => {
              const haveContainer = inventory[name] ?? 0;
              const haveKey = keyName ? (inventory[keyName] ?? 0) : null;
              const canOpen = haveContainer > 0 && (haveKey === null || haveKey > 0);

              // Sources for the key if player has none
              const keySources: string[] = [];
              if (keyName && haveKey === 0) {
                for (const src of locksmithSources[keyName] ?? []) keySources.push(src.name);
                for (const src of locations[keyName] ?? []) keySources.push(src.name);
              }

              return (
                <div key={name}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--accent-purple)' }}>
                      {name}
                      {type === 'grab_bag' && <span style={{ opacity: 0.6 }}> (grab bag)</span>}
                    </span>
                    <span
                      className="text-[11px] font-medium shrink-0"
                      style={{ color: haveContainer > 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}
                    >
                      have {haveContainer}
                    </span>
                  </div>
                  {keyName && (
                    <div className="text-[10px] mt-0.5 pl-2" style={{ color: haveKey! > 0 ? 'var(--accent-purple)' : 'var(--accent-yellow)', opacity: 0.85 }}>
                      {keyName}: {haveKey ?? 0}
                      {haveKey === 0 && keySources.length > 0 && (
                        <span style={{ opacity: 0.75 }}> · find from {keySources.slice(0, 3).join(', ')}</span>
                      )}
                    </div>
                  )}
                  {canOpen && (
                    <div className="text-[10px] mt-0.5 pl-2 font-medium" style={{ color: 'var(--accent-green)' }}>
                      ready to open!
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface LocationGroupPanelProps {
  neededItems: string[];
}

export function LocationGroupPanel({ neededItems }: LocationGroupPanelProps) {
  const groups = getLocationGroups(neededItems);
  if (groups.size === 0) return null;

  const sorted = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length);

  return (
    <div className="space-y-2">
      {sorted.map(([locName, { type, items: locItems }]) => {
        const isLocksmith = type === 'locksmith' || type === 'grab_bag';
        const Icon = type === 'fishing' ? Fish : type === 'pet' ? PawPrint : isLocksmith ? KeyRound : Compass;
        const color = type === 'fishing' ? 'var(--accent-blue)' : type === 'pet' ? 'var(--accent-orange)' : isLocksmith ? 'var(--accent-purple)' : 'var(--accent-green)';
        const bg = type === 'fishing' ? 'var(--accent-blue-bg)' : type === 'pet' ? 'var(--accent-orange-bg)' : isLocksmith ? 'var(--accent-purple-bg)' : 'var(--accent-green-bg)';
        const border = type === 'fishing' ? 'var(--accent-blue-border)' : type === 'pet' ? 'var(--accent-orange-border)' : isLocksmith ? 'var(--accent-purple-border)' : 'var(--accent-green-border)';

        return (
          <div key={locName} className="rounded-lg px-3 py-2" style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={11} style={{ color, flexShrink: 0 }} />
              <span className="text-xs font-semibold" style={{ color }}>{locName}</span>
              <span className="text-[10px]" style={{ color, opacity: 0.7 }}>
                {type === 'grab_bag' ? 'grab bag' : type === 'locksmith' ? 'locksmith' : type}
              </span>
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
