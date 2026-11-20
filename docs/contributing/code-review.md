# Code Review

Review the actual change scope and current code state. This checklist identifies
concrete defects that block approval; [verification](./verification.md) is the
single owner for commands and claim-to-evidence mapping.

## Principles

- Start with the relevant `git diff`, baseline, and runtime state when the change
  depends on one.
- Resolve concrete `must-fix` findings before approval.
- Leave inline comments where possible and settle the final judgment in one
  review.
- Leave automatic style fixes to tooling; focus on behavior, structure,
  accessibility, and regression risk.
- A user-led redesign is not automatically an agent defect, but a concrete
  current bug or regression cannot be waived as taste.

## Must fix

### Requirements and correctness

- Does the implementation satisfy the approved task and preserve the latest
  decision's meaning?
- For a changed user-visible screen, does it meet the approved hierarchy,
  grouping/density, representative-state, and existing-control criteria? A
  concrete deviation from approved criteria is must-fix; an unrelated taste
  preference is not a defect.
- Are prop, state, and query fields connected to rendering and behavior?
- Does the sort or condition used on screen match the actual data query?
- Are real failures distinct from absent data, with no fake successful state or
  raw internal error exposed to users?

### Data and state

- Do the route and its UI fetch only the data they need?
- Does a child avoid re-fetching data the parent already has?
- Are sort/display fields such as `createdAt` and `updatedAt` present where the
  behavior requires them?
- Are retry, draft, and save states preserved according to the changed flow?
- Can a save overwrite a newer value? A screen that saves values it read earlier
  checks that the record has not changed since, not only that it still exists.
  An autosave compares a new value with the newest one already sent or waiting,
  not with the last saved one, and keeps a waiting save, its status, and its
  retry per target, so no input is dropped and one target's success does not
  hide another's failure. Its state lives in a component that a loading state
  does not unmount.
- Does code that handles a PostgreSQL error, such as a unique violation, read it
  through `postgresUniqueConstraintName` (`app/lib/db.ts`)? Drizzle wraps driver
  errors in `DrizzleQueryError`, so the code and constraint are on its `cause`,
  and a check on the thrown error itself never matches.
- Does one user action that saves several parts write them in one update or
  transaction, so a failure cannot keep some parts and drop the others?
- Does a save write only what the user changed? A combined save, such as a
  dialog that edits two things, must not refresh a timestamp or baseline (an
  input time, for example) of the part the user left untouched.

### Auth and security

- Do all write actions verify authentication and authorization?
- Does user input enter DB/server logic safely?
- Is the unauthenticated flow clear, and are server-only modules kept out of the
  browser bundle?

### React, accessibility, and rendering

- Are `useEffect` dependencies complete and stable, and is `meta` present when
  the screen needs it? An effect that sets state must not depend on a value
  created anew on each render, such as a default `[]` or `{}` prop or an inline
  object, or it re-renders without end. A page anonymous visitors can open
  needs `socialMeta` card tags in every `meta` branch that renders with 200,
  including empty and fallback states. A child route's `meta` replaces its
  parent's, so a fallback branch cannot rely on the parent's tags.
- Is intent-based action branching verified on the server?
- Is the boundary between route-local and shared UI intact?
- Is an image that fills a frame sized only by `aspect-ratio` pinned to the
  frame (`absolute inset-0`) instead of relying on `height: 100%`? Inside a
  table cell, WebKit resolves that percentage to the image's natural height, and
  `object-cover` then shows a magnified crop.
- For changed user-visible flows, are the relevant loading, empty, failure,
  retry/control adjacency, keyboard, and mobile fixed-bar states handled? Check
  the relevant render and interaction evidence; a concrete changed-UX deviation
  is a must-fix finding.
- Accessibility must-fix findings are a control that cannot be operated with the
  keyboard, an interactive control without an accessible name, information
  conveyed only by an image or color, and body text too low in contrast to read.
  Live-region announcements, `aria-busy`, focus placement after closing an
  element, and tooltip Escape handling are not must-fix unless they block a flow.

## Recommended

- Prefer generated GraphQL types and avoid unnecessary casts or duplicated
  result shapes.
- Keep route files focused on request handling and screen assembly.
- Promote shared UI only after reuse or a clear low-level need is established.

## Usually not part of the review

- Formatting nits handled automatically by Biome.
- Large refactors unrelated to the PR goal.
- Taste-level rewrites unrelated to task behavior, accessibility, or regression
  risk.
