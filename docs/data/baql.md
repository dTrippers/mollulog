# BAQL API

This document covers how BAQL GraphQL queries are handled inside MolluLog: where
reads live, how generated types are used, and how upstream failures stay distinct
from missing data.

## Basics

- Default endpoint: `https://api.baql.net/graphql`
- Development override: `VITE_BAQL_URL`
- Shared execution function: `runQuery` in [`app/lib/baql/index.ts`](../../app/lib/baql/index.ts)

`runQuery` accepts a `TypedDocumentNode` and its variables and returns urql's
`OperationResult`. A GraphQL operation can return an `error`, and transport or
timeout failures can throw; callers must preserve both failure paths.

## Writing queries

- Define GraphQL queries with `graphql(...)` inside `app/**/*.{ts,tsx}`.
- After adding or changing a query, run `mise exec -- pnpm codegen`.
- Do not edit generated files under `app/graphql/` by hand.

Codegen output collects in:

- `app/graphql/gql.ts`
- `app/graphql/graphql.ts`
- `app/graphql/fragment-masking.ts`

## Types and timestamps

Prefer the type inference codegen produces; do not hand-declare the same result
shape in a route or component. `codegen.ts` maps `ISO8601DateTime` to TypeScript
`Date`, but this is only a static mapping. GraphQL JSON does not parse a wire
timestamp into a `Date` object at runtime, so a response can still contain a
string. Do not silently change that mapping. `ISO8601Date` maps to `string`,
because BAQL sends calendar dates such as `0000-02-05` that are not instants.

Codegen keeps schema enums as native TypeScript enums (`enumType: "native"`),
because app code and tests use them as runtime values such as `Attack.Sonic`.
Codegen only rewrites output whose documents changed, so a codegen upgrade must
be checked by deleting `app/graphql/graphql.ts` and regenerating it.

Normalize source timestamps at the model boundary with `toUtcIso` or
`normalizeInstant`, and expose the UTC ISO string contract described in
[Date and Time](./date-time.md). Do not put `Date` objects in a new cache payload.

## Where reads live

- Models own BAQL reads, source caching, and upstream-to-domain normalization.
- Views may use `fetchRouteCached` to compose multiple model/domain results and
  own route-cache/SWR policy, but do not call BAQL or database infrastructure.
- Routes own authentication, parameter parsing, response and screen assembly.
  A route may call one model for a simple single-source operation. Routes and
  components do not call BAQL, database, or cache infrastructure directly.

The [event model](../../app/models/event-content.ts#L141-L173) shows a source
query with `runQuery` and `fetchSourceCached`. Its current
`getEventContentsList` return includes the generated BAQL date fields, so treat
that raw cache shape as existing implementation, not the normative shape
for new model work. The [event view](../../app/views/events.ts#L118-L190)
combines event and timeline models with `fetchRouteCached`, and the
[event route](../../app/routes/events._index.tsx#L42-L47) consumes the view.

### Model and loader pattern

The following timestamp-free model fragment is illustrative rather than a new
API. It follows the current `runQuery` signature and keeps the query in the
model, not in the route:

```ts
async function readEventNames() {
  const { data, error } = await runQuery(eventContentsListQuery, {});
  if (error || !data) {
    throw error ?? new Error("failed to fetch event contents");
  }
  return data.eventContents.map(({ uid, name }) => ({ uid, name }));
}
```

If a model returns schedule timestamps, normalize each wire value with
`toUtcIso` before returning or caching it. The existing model anchor above is
kept for orientation and should not be copied as a new `Date`-valued cache
contract.

The route consumes a view in the current loader shape:

```ts
export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  return { events: await getEventList(env, nowUtcIso(), false, ctx) };
};
```

The loader delegates to the view used by the current events route. A model may
return `null` for a record that is absent when its domain contract calls for
that, but it must not turn a GraphQL error, transport failure, or timeout into
`null`, a 404, or a fake empty result. An empty list from a successful response
is a data result and should remain distinct from an upstream failure.

## Caching

- `fetchSourceCached` caches BAQL reference data in models; normalize timestamps
  in new payloads as described above.
- `fetchRouteCached` caches a composed screen result (including SWR) in views.
- Cache responsibility belongs to the read or composition layer, not the route.
- Cron and background work that needs a forced refresh uses the `forceRefresh`
  pattern.

## Korean-server raid seasons

BAQL names Korean-server raid schedules `gl`. A `gl` schedule that BAQL forecast
from a JP season links that season through `jpSchedule`, and BAQL can drop such a
forecast. Raid timeline rows therefore carry their own link to the season:
`raid_type`, `jp_raid_season_index`, and `gl_raid_season_index` (the Korean
season number, nullable). Timeline auto sync copies BAQL's `gl` season number into
`gl_raid_season_index` when it creates a row and when it updates a future row.

A row with `raid_type` and `jp_raid_season_index` shows, in this order:

1. the `gl` schedule whose `jpSchedule` is that JP season of that raid type;
2. otherwise the JP schedule of that season, with the row's start and end, the
   row's `gl_raid_season_index` as its season number, the `gl` spelling of the
   boss uid, and the JP schedule's uid;
3. otherwise no schedule data.

The rule lives in `app/domain/raid-season-resolution.ts`, without I/O. A match
that more than one schedule claims resolves to no schedule. Never choose the
schedule of such a row by `content_uid`, and never build or parse a schedule uid;
the `content_uid` lookup is only for rows without those two columns.

A forecast season (rule 2) owns its number only when its row has not ended, no
`gl` schedule of its raid type has that number, and no other unfinished row's
forecast season claims it. The resolver decides this, so a forecast season that
does not own its number reaches every reader with no number, exactly like a row
whose `gl_raid_season_index` is null. A season without a number has no season
page, so screens that link to or print a season number leave it out.

Readers that list or open Korean-server seasons go through
`app/models/raid-season.server.ts`, which joins BAQL's `gl` seasons with the
forecast seasons of unfinished raid rows. A request that needs several of them
reads the rows and BAQL's lists once and passes the result on (`seasons`).
A season is identified across that change by `getRaidSeasonIdentityUid`: the
uid of its JP schedule as BAQL returned it (the schedule's own uid when a `gl`
schedule has no JP schedule). It is the same whether BAQL lists the `gl`
schedule or the season is shown as a forecast.

A raid record is keyed by server, raid type and season number, so the seasons a
record can be saved to are BAQL's own schedules only. A predicted Korean season
number never becomes part of a stored record; record screens may show it only as
a JP season's Korean counterpart.

## Background work

- Worker cron branches in `workers/app.ts`.
- BAQL-based sync work is handled by `app/jobs/scheduled.ts` together with
  models.
- Cron cache warming calls `warm*Cache(env)` functions exported by models and
  views.

## Checklist

1. Is the query defined with `graphql(...)`?
2. Did you run `mise exec -- pnpm codegen` after a query change?
3. Are generated GraphQL types used directly?
4. Are timestamps normalized to the UTC ISO contract at the model boundary?
5. Does the model/view own BAQL and cache work instead of the route?
6. Are upstream errors and absent data represented separately?
