import { useMemo, useState } from 'react';
import { PawPrint, Star, ChevronDown, ChevronUp, Plus, Minus, AlertCircle } from 'lucide-react';
import petsData from '../data/pets.json';
import type { Pet, Quest } from '../types';
import { useStore } from '../store';
import { parseItems } from '../utils';

const allPets = petsData as Pet[];
const PET_LEVELS = [1, 3, 6] as const;

function formatCost(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function petLootAtLevel(pet: Pet, level: number): string[] {
  const items: string[] = [];
  for (const tier of PET_LEVELS) {
    if (tier > level) break;
    const tierItems = pet.loot[String(tier)] ?? [];
    items.push(...tierItems);
  }
  return items;
}

function petRequirements(pet: Pet): string[] {
  const reqs: string[] = [];
  if (pet.requiredFarmingLevel > 0) reqs.push(`Farming ${pet.requiredFarmingLevel}`);
  if (pet.requiredFishingLevel > 0) reqs.push(`Fishing ${pet.requiredFishingLevel}`);
  if (pet.requiredCraftingLevel > 0) reqs.push(`Crafting ${pet.requiredCraftingLevel}`);
  if (pet.requiredExploringLevel > 0) reqs.push(`Exploring ${pet.requiredExploringLevel}`);
  if (pet.requiredCookingLevel > 0) reqs.push(`Cooking ${pet.requiredCookingLevel}`);
  return reqs;
}

interface RecommendedPet {
  pet: Pet;
  matchCount: number;
  matchItems: string[];
  targetLevel: number;
  isUpgrade: boolean;
  currentLevel: number;
}

function useQuestNeededItems(activeQuests: Quest[], inventory: Record<string, number>): Set<string> {
  return useMemo(() => {
    const needed = new Set<string>();
    for (const q of activeQuests) {
      const items = parseItems(q.itemsRequired);
      for (const { item, quantity } of items) {
        const have = inventory[item] ?? 0;
        if (have < quantity) needed.add(item);
      }
    }
    return needed;
  }, [activeQuests, inventory]);
}

interface Props {
  activeQuests: Quest[];
}

export function PetsPage({ activeQuests }: Props) {
  const { ownedPets, setOwnedPetLevel, inventory } = useStore();
  const neededItems = useQuestNeededItems(activeQuests, inventory);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [expandedPetId, setExpandedPetId] = useState<number | null>(null);

  const recommendations = useMemo((): RecommendedPet[] => {
    if (neededItems.size === 0) return [];
    const results: RecommendedPet[] = [];

    for (const pet of allPets) {
      const currentLevel = ownedPets[pet.id] ?? 0;

      if (currentLevel === 6) continue;

      const nextLevel = currentLevel === 0 ? 1 : currentLevel === 1 ? 3 : 6;
      const itemsAtNextLevel = petLootAtLevel(pet, nextLevel);
      const itemsAtCurrentLevel = currentLevel > 0 ? petLootAtLevel(pet, currentLevel) : [];
      const newItems = itemsAtNextLevel.filter((item) => !itemsAtCurrentLevel.includes(item));

      const matchItems = newItems.filter((item) => neededItems.has(item));
      if (matchItems.length === 0) continue;

      results.push({
        pet,
        matchCount: matchItems.length,
        matchItems,
        targetLevel: nextLevel,
        isUpgrade: currentLevel > 0,
        currentLevel,
      });
    }

    return results.sort((a, b) => b.matchCount - a.matchCount).slice(0, 5);
  }, [neededItems, ownedPets]);

  const ownedPetList = useMemo(
    () => allPets.filter((p) => ownedPets[p.id] !== undefined),
    [ownedPets]
  );

  return (
    <div className="space-y-4">
      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section
          className="rounded-xl p-4 space-y-3"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Star size={15} style={{ color: 'var(--accent-yellow)', flexShrink: 0 }} />
            <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Recommended for Your Quests
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Pets that produce items your active quests need right now.
          </p>
          <div className="space-y-2">
            {recommendations.map(({ pet, matchItems, targetLevel, isUpgrade, currentLevel }) => (
              <div
                key={pet.id}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--accent-yellow-border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{pet.name}</span>
                    {isUpgrade ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-blue-bg)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue-border)' }}>
                        Lv {currentLevel} → {targetLevel}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}>
                        Buy · {formatCost(pet.cost)} silver
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--accent-yellow)' }}>
                    Produces: {matchItems.join(', ')}
                  </p>
                  {!isUpgrade && petRequirements(pet).length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Requires: {petRequirements(pet).join(', ')}
                    </p>
                  )}
                </div>
                {!isUpgrade && (
                  <button
                    onClick={() => setOwnedPetLevel(pet.id, 1)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent-green)', color: '#0f172a' }}
                  >
                    <Plus size={11} /> Add
                  </button>
                )}
                {isUpgrade && (
                  <button
                    onClick={() => setOwnedPetLevel(pet.id, targetLevel)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: 'var(--accent-blue)', color: '#fff' }}
                  >
                    <Star size={11} /> Level up
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {neededItems.size === 0 && activeQuests.length > 0 && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <Star size={15} style={{ color: 'var(--accent-yellow)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            All quest items are in stock — no pet recommendations right now.
          </p>
        </div>
      )}

      {activeQuests.length === 0 && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
        >
          <AlertCircle size={15} style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Activate some quests to get pet recommendations.
          </p>
        </div>
      )}

      {/* My Pets */}
      <section
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <PawPrint size={15} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
          <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            My Pets
          </p>
          {ownedPetList.length > 0 && (
            <span
              className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}
            >
              {ownedPetList.length}
            </span>
          )}
        </div>

        {ownedPetList.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No pets added yet. Browse the catalog below to add pets you own.
          </p>
        ) : (
          <div className="space-y-2">
            {ownedPetList.map((pet) => {
              const level = ownedPets[pet.id]!;
              const loot = petLootAtLevel(pet, level);
              const isExpanded = expandedPetId === pet.id;
              return (
                <div
                  key={pet.id}
                  className="rounded-lg overflow-hidden"
                  style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
                >
                  <div className="flex items-center gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{pet.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                          Lv {level}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {loot.slice(0, 4).join(' · ')}
                        {loot.length > 4 && ` +${loot.length - 4}`}
                      </p>
                    </div>
                    {/* Level buttons */}
                    <div className="flex gap-1">
                      {PET_LEVELS.map((lv) => (
                        <button
                          key={lv}
                          onClick={() => setOwnedPetLevel(pet.id, lv)}
                          className="text-[10px] w-6 h-6 rounded font-semibold transition-colors flex items-center justify-center"
                          style={
                            level === lv
                              ? { background: 'var(--accent-purple)', color: '#fff' }
                              : { background: 'var(--surface-card)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                          }
                        >
                          {lv}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setExpandedPetId(isExpanded ? null : pet.id)}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                      onClick={() => setOwnedPetLevel(pet.id, 0)}
                      className="p-1 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Remove pet"
                    >
                      <Minus size={14} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {PET_LEVELS.map((lv) => {
                        const tierItems = pet.loot[String(lv)] ?? [];
                        const unlocked = lv <= level;
                        return (
                          <div key={lv}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: unlocked ? 'var(--text-muted)' : 'var(--border-default)' }}>
                              Level {lv} {unlocked ? '' : '(locked)'}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {tierItems.map((item) => (
                                <span
                                  key={item}
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={
                                    unlocked && neededItems.has(item)
                                      ? { background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)', fontWeight: 600 }
                                      : unlocked
                                        ? { background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }
                                        : { background: 'transparent', color: 'var(--border-default)', border: '1px solid var(--border-subtle)' }
                                  }
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pet Catalog */}
      <section
        className="rounded-xl overflow-hidden"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
      >
        <button
          onClick={() => setCatalogExpanded((v) => !v)}
          className="w-full flex items-center gap-2 p-4 text-left transition-colors hover:opacity-80"
        >
          <PawPrint size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
          <p className="text-sm font-semibold flex-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Pet Catalog
          </p>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{allPets.length} pets</span>
          {catalogExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {catalogExpanded && (
          <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {allPets.map((pet) => {
              const owned = ownedPets[pet.id];
              const isOwned = owned !== undefined;
              const reqs = petRequirements(pet);
              return (
                <div
                  key={pet.id}
                  className="rounded-lg p-3 space-y-2"
                  style={{
                    background: 'var(--surface-raised)',
                    border: `1px solid ${isOwned ? 'var(--accent-purple-border)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                      {pet.name}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {formatCost(pet.cost)} silver
                    </span>
                    {isOwned ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }}>
                        Owned · Lv {owned}
                      </span>
                    ) : (
                      <button
                        onClick={() => setOwnedPetLevel(pet.id, 1)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
                        style={{ background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green-border)' }}
                      >
                        <Plus size={10} /> Add
                      </button>
                    )}
                  </div>

                  {reqs.length > 0 && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Requires: {reqs.join(', ')}
                    </p>
                  )}

                  {/* Loot by tier */}
                  <div className="space-y-1">
                    {PET_LEVELS.map((lv) => {
                      const tierItems = pet.loot[String(lv)] ?? [];
                      const unlocked = isOwned && (owned ?? 0) >= lv;
                      return (
                        <div key={lv} className="flex items-start gap-2">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                            style={
                              unlocked
                                ? { background: 'var(--accent-purple-bg)', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple-border)' }
                                : { background: 'var(--surface-card)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }
                            }
                          >
                            Lv{lv}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {tierItems.map((item) => (
                              <span
                                key={item}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={
                                  neededItems.has(item)
                                    ? { background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)', border: '1px solid var(--accent-yellow-border)', fontWeight: 600 }
                                    : { color: 'var(--text-secondary)' }
                                }
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
