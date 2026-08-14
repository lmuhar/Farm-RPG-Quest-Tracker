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
