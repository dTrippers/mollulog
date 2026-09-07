# Local development

MolluLog reads its runtime configuration from the process environment. The
repository does not discover a workstation directory, inspect Git worktrees, or
read `.env`, `.envrc`, or `.dev.vars`. A secret manager or another external
launcher must resolve one environment file and inject its values before running
the commands below.

Each environment file is a complete set of assignments for one target. Keep
local and remote values in separate files, and select exactly one file per
invocation. The file may contain secret-manager references as long as the
launcher resolves them before starting MolluLog; the repository never needs to
know which secret manager supplied a value.

The launcher's process environment may include these operational settings:

- `ALLOWED_HOSTS`: comma-separated additional Vite hostnames.
- `WRANGLER_PERSIST_TO`: Wrangler local state directory. The default is
  `.wrangler/state` inside the checkout.
- `MOLLULOG_AYUMU_CONFIG_PATH`: optional path to an Ayumu Wrangler config. It
  is used only when explicitly set and must point to an existing config file.
- `VITE_BAQL_URL` and `VITE_RANK_API_BASE_URL`: optional public API endpoints.

The Worker receives only the explicit application keys listed in the
environment templates and `workerEnvKeys` in `scripts/local-dev-env.mjs`.
Credentials used by the secret manager, unrelated shell variables, and
PostgreSQL passwords are never copied into Worker bindings. During development,
the Vite configuration declares the allowlisted key names as Worker secrets and
Wrangler resolves their values from inherited `process.env` in memory. It does
not generate environment files. `pnpm start` is an alias of `pnpm dev`.

## Environment validation

`HOST` and `SESSION_SECRET` are required for the development Worker. The
launcher reports missing variable names without printing their values. Leave
`CLOUDFLARE_ENV` unset for local commands, including when using remote resources.
Vite's `development` mode uses the default Wrangler configuration; there is no
Wrangler environment named `development`. Staging and production build/deploy
commands select their own explicit Cloudflare environment.

Vite uses `envDir: false`, and the launcher checks for repository `.env*` and
`.dev.vars*` files before starting the Worker. Because Wrangler gives
`.dev.vars` precedence when it is present, the launcher stops explicitly and
asks you to move or rename any such repository file before starting. Move it
outside the worktree, or give it a name that does not start with `.env.` or
`.dev.vars.`; those files are not deleted or modified, but they are not a
configuration source for MolluLog.

## Local DB access

PostgreSQL settings have one source: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, and `PGSSLMODE`. The launcher validates these variables and
derives `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in memory for
the local Hyperdrive emulator. Do not set the derived variable manually.

```sh
mise exec -- pnpm dev:doctor
mise exec -- pnpm dev:db:status
mise exec -- pnpm dev:db:migrate 20260905000100_example.sql
```

The DB commands accept only a loopback PostgreSQL host, a database and user,
and an `sslmode` value. This guard keeps a local migration command from using a
remote or production database accidentally. A remote environment file may be
used by the development Worker for explicitly configured remote resources, but
it remains a local development invocation and does not select a production
Cloudflare environment. Run only the migration files belonging to the current
task.

The existing database predates the migration ledger. `untracked` means its
application history is unknown, **not** that the SQL is pending. There is no
automatic replay or schema reset. Selected files run in filename order in one
transaction. The runner records checksums in
`_mollulog_local_migrations`; already recorded files are skipped, changed
recorded files fail, and an advisory lock prevents simultaneous runs by other
worktrees. A failed batch rolls back both SQL and history. Files recorded by
another branch but absent from this checkout appear as `other-worktree` in
status.

For local DB or runtime-environment troubleshooting, start with
`mise exec -- pnpm dev:doctor`. A sandbox network denial or timeout is not proof
that PostgreSQL is down. Retry the same read-only check with local network
permission before changing credentials or launching another database.

## Running the app

After the external launcher has injected one complete environment, run:

```sh
mise exec -- pnpm dev
mise exec -- pnpm dev --port 8790
```

The command preserves the existing bind-host behavior and forwards arguments.
It does not start PostgreSQL, apply migrations, or change authentication
settings. The Worker still receives Cloudflare bindings (`HYPERDRIVE`, KV, R2,
queues, and workflows) from Wrangler configuration; environment variables
provide only the values that are not bindings.

For authorized schema work, use `dev:db:migrate` for the task's new SQL and
check `dev:db:status` afterward. Starting or stopping services and production
operations remain separate actions.

## Tests

```sh
mise exec -- pnpm test:local-dev
MOLLULOG_TEST_LOCAL_DB=1 mise exec -- pnpm test:local-dev
```

The second command also tests rollback, duplicate/checksum handling, and
concurrency against the existing local PostgreSQL server. It creates and
removes a uniquely named test schema only; it does not change application
tables or migration history. It needs local network access and permission to
create a schema in the local DB.
