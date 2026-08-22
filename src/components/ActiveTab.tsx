import { useState, useMemo } from 'react';
import { ListTodo, GitBranch } from 'lucide-react';
import type { Quest } from '../types';
import { parseItems } from '../utils';
import { useStore } from '../store';
import { ActiveQuestsSummary } from './ActiveQuestsSummary';
import { ActiveQuestLine } from './ActiveQuestLine';
import { NpcGatesCard } from './NpcGatesCard';
import { QuestCard } from './QuestCard';

type SubTab = 'plan' | 'questlines';

interface Props {
  activeQuests: Quest[];
  nextUpQuests: Quest[];
  questlineGroups: { name: string; quests: Quest[] }[];
}

export function ActiveTab({ activeQuests, nextUpQuests, questlineGroups }: Props) {
  const { inventory, pinnedQuestline } = useStore();
  const [subTab, setSubTab] = useState<SubTab>('plan');

  const activeQuestIds = useMemo(() => new Set(activeQuests.map((q) => q.id)), [activeQuests]);

  const sortedActiveQuestlines = useMemo(() => {
    const active = questlineGroups.filter(({ quests }) => quests.some((q) => activeQuestIds.has(q.id)));
    const coverageScore = (quests: Quest[]) => {
      const inLine = quests.filter((q) => activeQuestIds.has(q.id));
      if (inLine.length === 0) return 0;
      const scores = inLine.map((quest) => {
        const items = parseItems(quest.itemsRequired);
        if (items.length === 0) return 1;
        const total = items.reduce(
          (sum, { item, quantity }) => sum + Math.min(inventory[item] ?? 0, quantity) / quantity,
          0
        );
        return total / items.length;
      });
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };
    return [...active].sort((a, b) => {
      if (a.name === pinnedQuestline) return -1;
      if (b.name === pinnedQuestline) return 1;
      return coverageScore(b.quests) - coverageScore(a.quests);
    });
  }, [questlineGroups, activeQuestIds, inventory, pinnedQuestline]);

  const { readyQuestlines, blockedQuestlines } = useMemo(() => {
    const isCovered = (quests: Quest[]) =>
      quests
        .filter((q) => activeQuestIds.has(q.id))
        .every((quest) => {
          const items = parseItems(quest.itemsRequired);
          return items.length === 0 || items.every(({ item, quantity }) => (inventory[item] ?? 0) >= quantity);
        });
    return {
      readyQuestlines: sortedActiveQuestlines.filter(({ quests }) => isCovered(quests)),
      blockedQuestlines: sortedActiveQuestlines.filter(({ quests }) => !isCovered(quests)),
    };
  }, [sortedActiveQuestlines, activeQuestIds, inventory]);

  const activeLineCount = questlineGroups.filter(({ quests }) =>
    quests.some((q) => activeQuestIds.has(q.id))
  ).length;

  return (
    <div className="space-y-3">
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}
      >
        {([
          { id: 'plan', label: 'Action Plan', Icon: ListTodo },
          { id: 'questlines', label: 'Questlines', Icon: GitBranch },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
            style={
              subTab === id
                ? { background: 'var(--accent-purple)', color: '#fff', fontFamily: 'var(--font-body)' }
                : { color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }
            }
          >
            <Icon size={13} />
            {label}
            {id === 'questlines' && (
              <span
                className="ml-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={
                  subTab === 'questlines'
                    ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
                    : { background: 'var(--accent-yellow-bg)', color: 'var(--accent-yellow)' }
                }
              >
                {activeLineCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'plan' && (
        <>
          <NpcGatesCard activeQuests={activeQuests} questlineGroups={questlineGroups} />
          <ActiveQuestsSummary quests={activeQuests} nextUpQuests={nextUpQuests} />
        </>
      )}

      {subTab === 'questlines' && (
        <>
          {readyQuestlines.map(({ name, quests }) => (
            <ActiveQuestLine key={name} questline={name} quests={quests} />
          ))}
          {activeQuests.filter((q) => !q.questline).map((quest) => (
            <QuestCard key={quest.id} quest={quest} status="active" />
          ))}

          {blockedQuestlines.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-1">
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                <span
                  className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Not able to be completed
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              </div>
              {blockedQuestlines.map(({ name, quests }) => (
                <ActiveQuestLine key={name} questline={name} quests={quests} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
