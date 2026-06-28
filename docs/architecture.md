# Architecture

This document focuses on the project's durable structure rather than a listing of current files: where things live, how data flows, and the boundaries between layers. New code follows the structure described here.

## System overview

```text
Browser
  ↕ SSR request / response
Cloudflare Workers
  ↕
BAQL GraphQL API
  ↕
Cloudflare D1 / KV
```

- The web app is a React Router v7 SSR app running on Cloudflare Workers.
- Game source data is read primarily from the BAQL GraphQL API, while user data and app state are stored in D1.
- KV is used for response caching and for precomputed work driven by cron.

## Layers

Data flows in one direction, top to bottom.

```text
Routes  (loader / action · thin)
  → Views   (composition + route cache, SWR)
      → Domain  (pure calculation · no I/O)
      → Models  (D1 CRUD · BAQL reads · source cache · normalization)
          → lib/cache · lib/baql · db
```

- `app/routes` — Route files with `loader` / `action`, meta, parameter parsing, access control, and top-level screen assembly. Data composition and direct cache / BAQL / D1 calls do not belong here; they are delegated to views.
- `app/views` — The composition layer for route presentation. It combines model and domain results into the shape a screen needs and applies the route cache (SWR).
- `app/domain` — Pure calculation and transformation only. With no I/O or env dependency, it is easy to unit test. Logic such as raid scoring or the recruitment simulator lives here.
- `app/models` — The data access layer. It handles D1 CRUD, BAQL reads, source caching, and normalization of upstream data into domain types.
- `app/lib/cache`, `app/lib/baql`, `app/lib/db` — Infrastructure such as cache primitives, GraphQL execution, and D1 helpers.
- `app/components/primitives` — Low-level shared UI built on semantic tokens, plus thin app-wide presentation.
- `app/components/features/<domain>` — Domain UI reused across multiple screens.
- `app/routes/*._components`, `app/routes/*/_components` — Route-local UI and hooks used within a single route family.
- `workers/app.ts` — The Worker entry point and the entry for scheduled jobs.

## Boundary rules

- Lower layers never import upper layers. Data flows one way.
- Routes stay thin: `loader` / `action`, params, auth, meta, and screen assembly. Routes do not call cache, BAQL, or D1 directly — they delegate to a view function.
- Views own composition and the route cache (SWR). They call models and domain.
- Models are data access only. They must not import from views.
- Domain is pure: no I/O and no env. Type-only imports from models are allowed; avoid runtime imports from models.

Detailed UI structure rules live in the frontend documents:

- [Routing](./frontend/routing.md)
- [Components](./frontend/components.md)
- [Design](./frontend/design.md)

## Runtime and deployment

- Worker entry: `workers/app.ts`
- Routing config: `app/routes.ts` with React Router flat routes
- Deploy config: `wrangler.jsonc`
- Static assets: `build/client`
- Bindings:
  - `DB`: Cloudflare D1
  - `KV_CACHE`: cache store
  - `KV_SESSION`: session and auth-related transient data
  - `EVENTS`: queue binding

Cron runs on a single schedule:

- `*/10 * * * *` — Runs `app/jobs/scheduled.ts`, which synchronizes source data (students, timeline contents, event contents, community posts) and warms caches.

## Data flow

### Read

1. The browser requests a route.
2. The route `loader` runs and calls a single view function.
3. The view calls the models and domain it needs, composes the screen shape, and applies a route cache when appropriate.
4. Models check the source cache first and query BAQL or D1 on a miss.
5. The screen renders from `useLoaderData()`.

### Write

1. The user submits through a `Form` or a fetcher.
2. The route `action` runs.
3. D1 or auth / session state is updated.
4. Caches are invalidated when needed.
5. A response or redirect is returned.

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
