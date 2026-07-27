import { useMemo } from 'react';
import { ShoppingCart, Fish, Compass, Leaf, Hammer, PawPrint, CheckCircle2 } from 'lucide-react';
import type { Quest, Pet } from '../types';
import { useStore } from '../store';
import { parseItems } from '../utils';
import itemLocationsData from '../data/item-locations.json';
import petsData from '../data/pets.json';

const itemLocations = itemLocationsData as Record<string, { name: string; type: string }[]>;
const allPets = petsData as Pet[];

const SOURCE_ICON: Record<string, React.ReactNode> = {
  fishing: <Fish size={10} />,
  explore: <Compass size={10} />,
  farming: <Leaf size={10} />,
  crafting: <Hammer size={10} />,
  pet: <PawPrint size={10} />,
};

const SOURCE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  fishing: { bg: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: 'var(--accent-blue-border)' },
  explore: { bg: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: 'var(--accent-orange-border)' },
  farming: { bg: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: 'var(--accent-green-border)' },
  crafting: { bg: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: 'var(--accent-purple-border)' },
  pet: { bg: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: 'var(--accent-yellow-border)' },
};

interface ItemRow {
  item: string;
  need: number;
  have: number;
  deficit: number;
  quests: string[];
  sources: { type: string; label: string }[];
}

interface Props {
  activeQuests: Quest[];
}

export function NeedsTab({ activeQuests }: Props) {
  const { inventory, cropTimes, ownedPets } = useStore();

  // Build set of items owned pets produce (at current level)
  const petItemMap = useMemo(() => {
    const map = new Map<string, string[]>(); // item → [pet names]
    for (const pet of allPets) {
      const level = ownedPets[pet.id];
      if (!level) continue;
      const tiers = [1, 3, 6] as const;
      for (const tier of tiers) {
        if (tier > level) break;
        for (const item of pet.loot[String(tier)] ?? []) {
          if (!map.has(item)) map.set(item, []);
          map.get(item)!.push(pet.name);
        }
      }
    }
    return map;
  }, [ownedPets]);

  const cropSet = useMemo(() => new Set(cropTimes.map((c) => c.item.toLowerCase())), [cropTimes]);

  const rows = useMemo((): ItemRow[] => {
    const itemMap = new Map<string, { need: number; quests: string[] }>();
    for (const quest of activeQuests) {
      for (const { item, quantity } of parseItems(quest.itemsRequired)) {
        const existing = itemMap.get(item) ?? { need: 0, quests: [] };
        existing.need += quantity;
        if (!existing.quests.includes(quest.name)) existing.quests.push(quest.name);
        itemMap.set(item, existing);
      }
    }

    return [...itemMap.entries()].map(([item, { need, quests }]) => {
      const have = inventory[item] ?? 0;
      const deficit = Math.max(0, need - have);

      // Build sources
      const sources: { type: string; label: string }[] = [];
      const locs = itemLocations[item] ?? [];
      const seenTypes = new Set<string>();
      for (const loc of locs) {
        if (!seenTypes.has(loc.type)) {
          sources.push({ type: loc.type, label: loc.name });
          seenTypes.add(loc.type);
        }
      }
      if (cropSet.has(item.toLowerCase())) {
        sources.push({ type: 'farming', label: 'Farm' });
      }
      const petNames = petItemMap.get(item);
      if (petNames) {
        sources.push({ type: 'pet', label: petNames.join(', ') });
      }

      return { item, need, have, deficit, quests, sources };
    });
  }, [activeQuests, inventory, cropSet, petItemMap]);

  const deficitRows = useMemo(() => rows.filter((r) => r.deficit > 0).sort((a, b) => b.deficit - a.deficit), [rows]);
  const readyRows = useMemo(() => rows.filter((r) => r.deficit === 0).sort((a, b) => a.item.localeCompare(b.item)), [rows]);

  if (activeQuests.length === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <ShoppingCart size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active quests — activate some to see what you need.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Still need */}
      {deficitRows.length > 0 && (
        <section
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <ShoppingCart size={14} style={{ color: 'var(--accent-orange)', flexShrink: 0 }} />
            <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Still Need
            </p>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }}
            >
              {deficitRows.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {deficitRows.map((row) => (
              <ItemRow key={row.item} row={row} />
            ))}
          </div>
        </section>
      )}

      {/* Ready */}
      {readyRows.length > 0 && (
        <section
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
            <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Ready
            </p>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
            >
              {readyRows.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {readyRows.map((row) => (
              <ItemRow key={row.item} row={row} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ItemRow({ row }: { row: ItemRow }) {
  const isReady = row.deficit === 0;
  return (
    <div className="px-4 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: isReady ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            {row.item}
          </span>
          <span
            className="text-[10px] font-mono font-semibold"
            style={{ color: isReady ? 'var(--accent-green)' : 'var(--accent-orange)' }}
          >
            {row.have}/{row.need}
          </span>
          {!isReady && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent-orange-bg)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange-border)' }}
            >
              need {row.deficit}
            </span>
          )}
        </div>
        {row.sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.sources.map((src, i) => {
              const style = SOURCE_COLOR[src.type] ?? SOURCE_COLOR.explore;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                >
                  {SOURCE_ICON[src.type]}
                  {src.label}
                </span>
              );
            })}
            {row.sources.length === 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No sources found</span>
            )}
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {row.quests.length === 1 ? row.quests[0] : `${row.quests.length} quests`}
        </p>
      </div>
    </div>
  );
}
