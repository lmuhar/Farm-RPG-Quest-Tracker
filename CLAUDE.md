# Farm RPG Quest Tracker — Claude Instructions

## Git Workflow

### After every squash-merge PR

Always reset the feature branch to main immediately after a squash merge, without attempting a normal push first (it will always fail due to diverged history):

```bash
git fetch origin main
git checkout -B claude/fly-io-deployment-hmegwg origin/main
git push --force-with-lease origin claude/fly-io-deployment-hmegwg
```

Do this as a single step right after `merge_pull_request` succeeds — never attempt `git push` without the force flag after a squash merge.

### Development branch

Always develop on: `claude/fly-io-deployment-hmegwg`
Always merge into: `main`
Always use squash merge.

## Code Quality

### Always run `tsc --noEmit` before committing

The CI build runs `tsc -b` and will fail on any TypeScript error, including unused variables (`TS6133`). Always run `npx tsc --noEmit` locally before committing and fix any errors.

Common mistake: replacing a constant's usage in JSX (e.g. swapping `allQuestlineNames` for `activeQuestlineNames`) without also removing the old declaration at the top of the file. The compiler flags it as declared but never read — the build fails even though the app works.
