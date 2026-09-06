# MolluLog

MolluLog helps Sensei browse Blue Archive student and event data, record game
activities, and plan events.

## Task router

- System boundaries and data flow: [architecture](docs/architecture.md).
- Local setup, the shared PostgreSQL database, and environment diagnosis:
  [development](docs/development.md).
- PostgreSQL models, schemas, and migrations: [database](docs/data/database.md).
- BAQL queries, codegen, and timestamps: [BAQL](docs/data/baql.md) and
  [date and time](docs/data/date-time.md).
- User-visible UI: read only the relevant [design](docs/frontend/design.md),
  [components](docs/frontend/components.md), [patterns](docs/frontend/patterns.md),
  and [UI quality](docs/frontend/ui-quality.md) guidance. For route restructuring,
  also read [routing](docs/frontend/routing.md).
- Review and scope-proportional checks: [code review](docs/contributing/code-review.md)
  and [verification](docs/contributing/verification.md).

## Non-negotiable rules

- Preserve the distinction between a real failure and absent data. Never hide a
  required failure as fake data or a successful empty result, or expose a raw
  internal error. Use the appropriate explicit error or empty state; do not
  invent fallback content.
- Keep boundaries clear: routes own auth, parameter parsing, meta, and screen
  assembly; views own multi-source composition and route-cache/SWR policy; models
  own PostgreSQL, BAQL, source cache, and normalization; domain code is pure.
  A route may call one model for a simple single-source operation. See
  [architecture](docs/architecture.md) and [routing](docs/frontend/routing.md).
- Use `.server.ts` only for modules that must stay out of the browser bundle
  because they use secrets, Node runtimes, PostgreSQL clients, or other
  server-only dependencies; never import them into browser-reachable code.
- Create and release PostgreSQL clients per model operation with
  `withPostgresClient`; never keep a client in module or request-global state.
- Define BAQL queries with `graphql(...)`, run `mise exec -- pnpm codegen` after
  query changes, and never edit generated files under `app/graphql/` by hand.
- Treat the local PostgreSQL database as shared. `untracked` migration history is
  unknown, not permission to replay old files; never reset the database or mark
  historical migrations applied merely because a table exists.
- For local DB or runtime-environment troubleshooting, start with
  `mise exec -- pnpm dev:doctor`. A sandbox denial or timeout is not proof that
  PostgreSQL is unavailable: retry the same read-only check with the execution
  tool's local network permission, then report the exact limitation. Do not change
  credentials or launch another database to mask the failure.
- Do not start or stop a development server without explicit authorization.
  Before stopping any server or long-running process, identify its exact PID,
  working directory, and command, then ask for confirmation; never infer
  ownership from a port or process name.
- Each applicable outcome needs current evidence. Missing required visual or
  interaction evidence remains `UNVERIFIED`; do not impose a universal
  result-approval workflow on ordinary work.
- Keep repository edits, commits, pushes, deploys, and other external mutations
  within the authorization actually given. Do not invent approval gates or
  model-specific assumptions. Use `mise exec` for runtime commands.
