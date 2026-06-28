# BAQL API

This document covers how BAQL GraphQL queries are handled inside the MolluLog codebase. Rather than keeping a query list, it explains where reads live and the codegen rules.

## Basics

- Default endpoint: `https://api.baql.net/graphql`
- Development override: `VITE_BAQL_URL`
- Shared execution function: `runQuery` in `app/lib/baql/index.ts`

## Writing queries

- Define GraphQL queries with `graphql(...)` inside `app/**/*.{ts,tsx}`.
- After adding or changing a query, always run `pnpm codegen`.
- Do not edit generated files under `app/graphql/` by hand.

Codegen output collects in:

- `app/graphql/gql.ts`
- `app/graphql/graphql.ts`
- `app/graphql/fragment-masking.ts`

## Types

- Prefer the type inference codegen produces.
- Do not hand-declare the result shape again in a route or component.
- In the current scalar mapping, `ISO8601DateTime` is treated as `Date`.

## Where reads live

- Even a simple one-off read used by a single route pushes the BAQL call down to `models` by default.
- Reads shared across screens or carrying a cache policy live in `models`.
- Direct `runQuery` / `graphql()` calls live only in `lib/baql` and `models` — not in routes, views, or components.
- When a screen needs several reads composed together, build a model function and have a `views` function call the model on top of it.

## Loader pattern

```ts
export async function loader({ params }: LoaderFunctionArgs) {
  const { data, error } = await runQuery(query, { uid: params.uid! });

  if (error) {
    throw new Response("Failed to fetch", { status: 503 });
  }

  if (!data?.event) {
    throw new Response("Not Found", { status: 404 });
  }

  return { event: data.event };
}
```

- Handle BAQL errors and missing data separately.
- Do not leave reads the UI uses repeatedly inline in the route.

## Caching

- To reuse a BAQL read result in a model, use `fetchSourceCached` (source cache).
- To cache a screen-level composed result, use `fetchRouteCached` (route cache, SWR) in a view.
- Cache responsibility belongs to the read / composition layer (models / views), not the route.
- Cron and background work that needs a forced refresh uses the `forceRefresh` pattern.

## Background work

- Worker cron branches in `workers/app.ts`.
- BAQL-based sync work is handled by `app/jobs/scheduled.ts` together with `models`.
- Cron cache warming calls the `warm*Cache(env)` functions exported by models and views.
- The scheduled entry point is `app/jobs/scheduled.ts`, which runs the source sync and cache-warming jobs.

## Checklist

1. Is the query defined with `graphql(...)`?
2. Did you run `pnpm codegen`?
3. Are you using the generated types directly?
4. Did you avoid pinning a reused read inside the route?
5. Does cache responsibility sit in the read layer, not the route?
