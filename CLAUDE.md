# Farm RPG Quest Tracker — Claude Instructions

## Git Workflow

### After every squash-merge PR

Always reset the feature branch to main immediately after a squash merge, without attempting a normal push first (it will always fail due to diverged history):

```bash
git fetch origin main
git checkout -B claude/confident-einstein-pkxyxv origin/main
git push --force-with-lease origin claude/confident-einstein-pkxyxv
```

Do this as a single step right after `merge_pull_request` succeeds — never attempt `git push` without the force flag after a squash merge.

### Development branch

Always develop on: `claude/confident-einstein-pkxyxv`
Always merge into: `main`
Always use squash merge.

Note: this branch name comes from whatever session/task Claude Code was assigned when it started — it will differ across sessions. Update this file to match the branch actually named in your task assignment rather than assuming the name above is still current.

## Code Quality

### Always run `tsc --noEmit` before committing

The CI build runs `tsc -b` and will fail on any TypeScript error, including unused variables (`TS6133`). Always run `npx tsc --noEmit` locally before committing and fix any errors.

Common mistake: replacing a constant's usage in JSX (e.g. swapping `allQuestlineNames` for `activeQuestlineNames`) without also removing the old declaration at the top of the file. The compiler flags it as declared but never read — the build fails even though the app works.

## Game data

### Syncing from buddy.farm

`npm run sync:buddyfarm` adds any quests missing from `src/data/quests.json` (matched by id and name; existing quests are never modified) and refreshes `item-locations.json` (drop locations + rates) and `item-sources.json` (shop, crafting, NPC rewards, Wishing Well, etc.). Run `-- quests` or `-- items` to do one half. In a cloud sandbox, `buddy.farm` must be allowed by the network policy and the script needs `NODE_USE_ENV_PROXY=1`.
