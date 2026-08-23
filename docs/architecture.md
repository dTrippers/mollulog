# Architecture

This document focuses on the project's durable structure rather than a listing of current files: where things live, how data flows, and the boundaries between layers. New code follows the structure described here.

## System overview

```text
Browser
  ↕ SSR request / response
Cloudflare Workers
  ├→ BAQL GraphQL API
  ├→ Hyperdrive → PostgreSQL (connection pooling, query cache disabled)
  ├→ Cloudflare KV
  └→ Cloudflare Queues
```

- The web app is a React Router v7 SSR app running on Cloudflare Workers.
- Game source data is read primarily from the BAQL GraphQL API.
- PostgreSQL is the canonical persistence store. Workers connect through Hyperdrive, which provides connection pooling without query caching.
- D1 is not an active runtime store. Historical source tables are retained only through the approved `zzz_` archive operation.
- KV is used for response caching and for precomputed work driven by cron.

The migration boundary is repository-based. Every persistence domain reads and writes PostgreSQL directly without a D1 fallback, comparison mode, or dual-write path. External BAQL data, KV cache/session state, and queues remain separate infrastructure concerns.

## Layers

Data flows in one direction, top to bottom.

```text
Routes  (loader / action · thin)
  → Views   (composition + route cache, SWR)
      → Domain  (pure calculation · no I/O)
      → Models  (PostgreSQL CRUD · BAQL reads · source cache · normalization)
          → lib/cache · lib/baql · lib/postgres.server · db
```

- `app/routes` — Route files with `loader` / `action`, meta, parameter parsing, access control, and top-level screen assembly. A simple single-source read or mutation may call one model directly when no route-cache or composition policy is needed; direct cache / BAQL / database infrastructure calls do not belong here.
- `app/views` — The composition layer for route presentation. A view is required when a route needs multi-source screen composition or route-cache/SWR policy; it combines model and domain results into the shape a screen needs and owns that cache policy.
- `app/domain` — Pure calculation and transformation only. With no I/O or env dependency, it is easy to unit test. Logic such as raid scoring or the recruitment simulator lives here.
- `app/models` — The data access layer. It owns PostgreSQL CRUD, BAQL reads, source caching, and normalization of upstream data into domain types.
- `app/db/postgres` — PostgreSQL schemas and repositories implemented with Drizzle `pg-core` and `drizzle-orm/node-postgres`.
- `app/lib/postgres.server.ts` — Hyperdrive connection lifecycle. It creates and releases a PostgreSQL client for each model operation.
- `app/lib/cache` and `app/lib/baql` — Cache primitives and GraphQL execution.
- `app/components/primitives` — Low-level shared UI built on semantic tokens, plus thin app-wide presentation.
- `app/components/features/<domain>` — Domain UI reused across multiple screens.
- `app/routes/*._components`, `app/routes/*/_components` — Route-local UI and hooks used within a single route family.
- `workers/app.ts` — The Worker entry point and the entry for scheduled jobs.

## Boundary rules

- Lower layers never import upper layers. Data flows one way.
- Routes stay thin: `loader` / `action`, params, auth, meta, and screen assembly. A route may call one model for a simple single-source read or mutation without route cache or composition, but it never calls cache, BAQL, or database infrastructure helpers directly.
- Views are required for multi-source composition or route-cache/SWR policy. They call models and domain and own the composed screen shape and cache policy.
- Models are data access only. They must not import from views.
- Domain is pure: no I/O and no env. Type-only imports from models are allowed; avoid runtime imports from models.
- A route may authenticate and pass the authenticated identity and parsed parameters to a view. If a loader needs multiple sources or route-cache/SWR policy, that work belongs in the view; a simple one-model operation can remain in the route.

Detailed UI structure rules live in the frontend documents:

- [Routing](./frontend/routing.md)
- [Components](./frontend/components.md)
- [Design](./frontend/design.md)

## Runtime and deployment

- Worker entry: `workers/app.ts`
- Cron Worker entry: `workers/cron.ts`
- Routing config: `app/routes.ts` with React Router flat routes
- Deploy config: `wrangler.jsonc`
- Static assets: `build/client`
- Bindings:
  - `HYPERDRIVE`: managed PostgreSQL connection pooling
  - `KV_CACHE`: cache store
  - `KV_SESSION`: session and auth-related transient data
  - `EVENTS`: queue binding

### Production deploy safety

Apply and verify every required PostgreSQL migration before running a deployment. `pnpm prod:deploy` then blocks the
deploy unless all of the following repository conditions are satisfied:

- the current branch is `main`;
- the working tree, including untracked files, is clean before and after the build;
- `HEAD` remains on the same commit throughout the build.

The app Worker and Cron Worker versions record the full Git commit SHA in their deployment message. To run the checks
without building or deploying, use `pnpm prod:deploy:preflight`.

The deploy command intentionally does not apply PostgreSQL migrations automatically because a migration may require a
separate maintenance or cutover decision. Apply and verify the required migration before deploying code that uses the
new schema.

Cron runs on a single schedule:

- `*/10 * * * *` — Runs `app/jobs/scheduled.ts`, which synchronizes external source data and refreshes or warms source and KV caches.

## Data flow

### Read

1. The browser requests a route.
2. The route `loader` runs and either calls one model for a simple single-source read or delegates to a view when composition or route-cache/SWR policy is needed.
3. A view calls the models and domain it needs, composes the screen shape, and applies a route cache when appropriate.
4. Models check the source cache when applicable and query BAQL or PostgreSQL through Hyperdrive.
5. The screen renders from `useLoaderData()`.

### Write

1. The user submits through a `Form` or a fetcher.
2. The route `action` runs.
3. The owning store is updated: PostgreSQL through Hyperdrive, or KV/cookies for auth and session state.
4. Caches are invalidated when needed.
5. A response or redirect is returned.

## PostgreSQL and Hyperdrive

- Hyperdrive is a connection-pooling data path, not an application cache. Query caching is disabled; explicit cache policy remains in the existing KV cache layer.
- PostgreSQL clients are operation-scoped. Create and release them through `app/lib/postgres.server.ts` inside each model operation; never keep a client in module or request-global state, and never share one client across independent operations. A transaction may span the statements of one operation only.
- `withPostgresClient` connects once, runs the repository operation, and releases the client in `finally`. Repositories may attach query spans through the current `ExecutionContext`.
- PostgreSQL schemas use Drizzle `pg-core` and live in `app/db/postgres/schema.ts`. SQL migrations live under `db/postgres/migrations`; `db/migrations` is historical source/archive material only.
- PostgreSQL uses native types such as `timestamptz`, `boolean`, arrays, JSONB, and identity columns. Domain types normalize database values at the repository boundary.
- PostgreSQL failures surface through the normal route error or explicit degraded-state handling instead of returning fake empty values, stale data, or internal errors as user-facing content.

### Server-only modules

- Files that must stay out of the browser bundle because they import Node-only runtimes, secrets, the PostgreSQL client, or another server-only dependency use the `.server.ts` suffix (for example, `app/lib/postgres.server.ts`). A function being called only from a loader/action is not, by itself, a reason to add the suffix.
- `.server.ts` modules are server-only implementation details. Do not import them from client components, shared client utilities, or other modules that are reachable from the browser bundle.
- A route can call server-side model/view functions from its loader or action; the route still owns only request validation and response assembly, while the server-only implementation remains below the route boundary.

## Caching

- Cache primitives live in `app/lib/cache` (`fetchCached`, `fetchSourceCached`, `fetchRouteCached`, and related helpers).
- There are two kinds of cache:
  - Source cache (`fetchSourceCached`): raw BAQL reference data. Applied in models only.
  - Route cache (`fetchRouteCached`, SWR): composed view-models. Applied in views only.
- Cache keys are stored under the `cache::` prefix.
- Routes and screens do not invent cache policy; the owning layer (models or views) decides it.
- Use the `forceRefresh` pattern when a forced refresh is needed, such as in cron and background work.

## Authentication

- The authentication entry point is `app/auth/authenticator.server.ts`.
- Supported login methods are Google OAuth and Passkey.
- Routes that require authentication check it directly in `loader` / `action`.
- Sessions use cookie sessions; transient data such as Passkey challenges uses `KV_SESSION`.

## Domain rules

### Community

- The canonical store for user-generated content is the `community_*` layer.
- Student reviews, event opinions, and guide posts are distinguished by type within this layer rather than by adding separate stores.
- Legacy tables may still exist, but new features target the canonical store.
