# Local development

All worktrees use one existing local PostgreSQL database. Authentication behavior
and OAuth configuration are unchanged by this setup.

## Shared configuration

Run once on the workstation:

```sh
mise exec -- pnpm dev:setup
```

The command finds the primary checkout through Git's common directory. By default,
the shared directory is `.mollulog-dev` next to that checkout (a sibling of `main`
in the worktree workspace). `MOLLULOG_DEV_CONFIG_DIR` can select another directory.
It contains:

- `local.env`: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`,
  optionally `WRANGLER_PERSIST_TO` and `ALLOWED_HOSTS`.
- `.dev.vars`: existing development Worker variables and secrets.

On this workstation, setup imports only the three listed process variables from
the workspace `.envrc` and copies the primary checkout's `.dev.vars`. It does not
execute shell code, copy unrelated variables, overwrite existing shared files,
or change the original files. Shared files are private (0600) in a private directory.
On a new workstation, provision those two files in the shared directory first.
Use dotenv assignments; shell expressions are not evaluated. Do not commit secrets.

After setup, edit the shared files to change common settings. Shared process
settings take precedence over inherited shell variables, so an old direnv session
cannot select a different DB. This workflow does not require direnv hooks.

In any worktree containing these scripts:

```sh
mise exec -- pnpm install
mise exec -- pnpm dev:doctor
mise exec -- pnpm dev --port 8790
```

`dev`, `start`, `dev:setup`, and `dev:doctor` create the worktree's `.dev.vars`
symlink if absent. An existing file or link is preserved and reported; it remains
the source for that worktree. Review it before replacing it with the shared link.
The development commands preserve the existing bind-host behavior and forward
arguments. They do not start PostgreSQL, apply migrations, or change auth settings.
The existing `WRANGLER_PERSIST_TO` value is preserved when configured; it is not
used as PostgreSQL storage. Production and staging commands do not load this config.

## Local DB access

```sh
mise exec -- pnpm dev:db:status
mise exec -- pnpm dev:db:migrate 20260905000100_example.sql
# A repository-relative db/postgres/migrations/... path is also accepted.
```

DB commands use the same shared connection as the dev server. They accept only a
loopback PostgreSQL URL with a database and user, without URL query parameters.
No production credentials or 1Password access are needed.

The existing DB predates the migration ledger. `untracked` means its application
history is unknown, **not** that the SQL is pending. There is intentionally no
automatic replay or schema reset. Inspect the relevant existing schema and specify
only the new migration file(s) belonging to the task. Do not mark historical files
as applied merely because a table exists.

Selected files run in filename order in one transaction. The runner records their
checksums in `_mollulog_local_migrations`; already recorded files are skipped,
changed recorded files fail, and an advisory lock prevents simultaneous runs by
other worktrees. A failed batch rolls back both SQL and history. Files recorded by
another branch but absent from this checkout appear as `other-worktree` in status.
One outer `BEGIN`/`COMMIT` pair is supported; other transaction control is rejected.
Use transactional SQL; operations such as `CREATE INDEX CONCURRENTLY` need a separate,
explicitly planned procedure. Never reset the shared DB to fix a branch mismatch.

## Agent execution

Start with `mise exec -- pnpm dev:doctor`. A sandbox network denial or timeout does
not prove PostgreSQL is down. Retry the same command with the tool's local network
permission/escalation mechanism before asking the user to repair settings. Do not
change credentials or launch another DB on a sandbox-only failure. If permission
is denied, report that precise limitation. The script cannot grant sandbox access.

For authorized schema work, use `dev:db:migrate` for the task's new SQL and check
`dev:db:status` afterward. Do not ask the user to manually inject environment values.
Starting/stopping services and production operations remain separate actions.

## Tests

```sh
mise exec -- pnpm test:local-dev
MOLLULOG_TEST_LOCAL_DB=1 mise exec -- pnpm test:local-dev
```

The second command also tests rollback, duplicate/checksum handling, and concurrency
against the existing local PostgreSQL server. It creates and removes a uniquely
named test schema only; it does not change application tables or migration history.
It needs local network access and permission to create a schema in the local DB.
