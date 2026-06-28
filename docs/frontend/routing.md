# Routing

This document does not enumerate route files. Routes change often, so it focuses on the durable file-naming rules and responsibility boundaries.

## File naming

MolluLog uses React Router flat routes.

- `.` maps to `/` in the URL.
  - Example: `students.$id.grade.tsx` → `/students/:id/grade`
- `_index.tsx` is the index route of its parent path.
  - Example: `students._index.tsx` → `/students`
- `$param` is a URL parameter.
  - Example: `events.$uid.tsx` → `/events/:uid`
- A parent layout route is the file sharing the same prefix.
  - Example: `raids.$raidType.$seasonIndex.tsx` is the layout, with `...statistics.tsx` and `...videos.tsx` as its child routes.

For the exact current route list, read the `app/routes/` directory. The documentation does not keep a full list.

## Route responsibilities

A route file is expected to handle only the following:

- `loader`
- `action`
- parameter parsing
- access control
- `meta`
- top-level screen assembly

The following do not belong in a route file for long:

- large screen fragments
- client hooks used by a single screen
- repeated render blocks
- reusable domain UI
- composition of multiple data sources and cache policy (→ `app/views`)

Data composition belongs to `app/views` functions, not the route. Keep the loader thin — ideally it just calls one view function.

## Route-local composition

Code used only within one route or route family lives next to the route.

- `app/routes/<route>._components/*`
- `app/routes/<route>/_components/*`

Criteria:

- A UI fragment used by a single screen is route-local.
- A hook specific to that route is route-local.
- UI reused across multiple routes is promoted to `app/components/features/<domain>`.

## Authentication pattern

Routes that require authentication check it directly in both `loader` and `action`.

```ts
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
}
```

- Pages with read restrictions are blocked in the `loader`.
- Write actions re-check in the `action`.
- Conditional rendering on the client never substitutes for authorization.

## Parent/child route data sharing

- Design so that children do not re-fetch data the parent already read.
- When a parent layout holds shared data, use `Outlet context` or restructure the routes.
- Use `shouldRevalidate` explicitly only on screens that need that optimization.

## Meta tags

- Navigable screens have `meta` by default.
- Title and description are computed from route data.
- Title strings prioritize the Korean user experience.

```ts
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.title ? `${data.title} | 몰루로그` : "몰루로그" },
];
```

## API routes

- Internal API routes use the `api.` prefix.
- Keep route-level work to thin input validation and response assembly, and push real logic down to `views` or `models`.
- Endpoints tied directly to browser interactions — cache flush, likes, comments, settings — belong here.

## Naming

- Name files so the URL structure is visible first.
- Prefer descriptive parameter names over abbreviations.
  - Example: `$raidType`, `$seasonIndex`, `$uid`
- A route-local directory name follows its route prefix exactly.

## Checklist

Before adding a new route:

1. Does this need a new route, or is route-local separation enough?
2. Is the auth check needed in both `loader` and `action`?
3. Does this screen need meta tags?
4. Should a large screen fragment be split into route-local components?
5. Does a child route avoid re-fetching parent data?
