# V3 Ghost Worktree Spine

Ghost worktrees are isolated Git worktrees for V3 agent/edit/proof work.

Core law:

- agents never mutate the live repo directly;
- promotion is explicit;
- promotion writes a patch receipt and rollback pointer;
- destroying a ghost removes only the ghost worktree unless branch deletion is explicitly requested.

Commands:

```powershell
bun orangebox-v3/ghost/create-ghost.ts --task "example"
bun orangebox-v3/ghost/list-ghosts.ts
bun orangebox-v3/ghost/ghost-status.ts --ghost <ghost_id>
bun orangebox-v3/ghost/promote-ghost.ts --ghost <ghost_id>
bun orangebox-v3/ghost/destroy-ghost.ts --ghost <ghost_id>
```
