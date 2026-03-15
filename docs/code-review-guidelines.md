# Code Review Guidelines

Rules and checklist for reviewing pull requests in this project.

---

## Process

- Run `pnpm run typecheck` and `pnpm exec biome check` locally before approving.
- Leave inline comments where possible. Use a single review submission (not multiple rounds of individual comments).
- Approve only after all **must-fix** items are resolved.

---

## Must-Fix Checklist

### Correctness

- [ ] No duplicate utility functions with diverging behavior.
- [ ] Props added to a component are actually wired into the rendered output. Dead props signal incomplete implementation.
- [ ] Delete operations verify ownership before executing (e.g. `senseiId` check before deleting a grading).

### Data & State

- [ ] Timestamps (`createdAt`, `updatedAt`) are included in queries when used for display or sorting.
- [ ] Sorting is done at the DB level (`.orderBy(desc(...))`) when possible; JS-level sort only when the query doesn't support it.
- [ ] Loader data is not over-fetched — only what the route and its children actually need.

### Auth & Security

- [ ] All mutation actions (POST, DELETE) verify the current user is authenticated before proceeding.
- [ ] Redirect to sign-in (or show sign-in sheet) for unauthenticated access to write surfaces.
- [ ] No user-controlled data passed directly into SQL without Drizzle parameterization.

### React / React Router

- [ ] `useEffect` dependencies are complete and correct — no missing deps causing stale closures.
- [ ] `useRef` is used (not `useState`) for values that should not trigger re-renders (e.g. tracking whether an action has started).
- [ ] Parent route loaders are not duplicated in child routes — use `useOutletContext` for shared data.
- [ ] `meta` exports exist on all navigable routes so page titles update correctly on navigation.
- [ ] `Form` `intent` fields are checked server-side before branching action logic.

---

## Should-Fix Checklist

### UI / UX

- [ ] Empty strings are not passed for required-looking props (e.g. `description=""`). Either provide a value or confirm the prop is optional.
- [ ] Tag display order is consistent across all surfaces (declaration order, not alphabetical).
- [ ] `EmptyView`, `LoadingSkeleton`, and error states are present for async-loaded sections.
- [ ] `confirm()` dialogs are acceptable for low-frequency destructive actions.
- [ ] Newly added card styles match the nearest established surface pattern (border, radius, background, shadow) per `ui-ux-guidelines.md`.

### TypeScript

- [ ] Prefer generated GraphQL types over inline type annotations for query result shapes.
- [ ] `as` casts are avoided unless there is no safer alternative — prefer type guards or proper typing upstream.
- [ ] `typeof CONSTANTS` indexed types use `(typeof CONSTANTS)[Key]` syntax (not `typeof CONSTANTS[Key]`).

### Code Quality

- [ ] No logic branching on `undefined` that is actually impossible at runtime — trust TypeScript and framework guarantees.
- [ ] `forEach` is replaced with `for...of` for iteration with side effects (Biome enforces this).
- [ ] Shared utility functions are extracted to a common location rather than duplicated per-file.
- [ ] Route-local components stay in `_components/` subdirectories; reusable UI goes in `features/` per `component-development-guide.md`.

---

## Won't Fix / Out of Scope

- Reformatting code that Biome handles automatically.
- Refactoring working logic that is not related to the PR's stated goal.
- Adding tests unless the PR introduces a bug that a test would have caught.
