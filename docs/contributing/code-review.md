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

### Auth and security

- Do all write actions verify authentication and authorization?
- Does user input enter DB/server logic safely?
- Is the unauthenticated flow clear, and are server-only modules kept out of the
  browser bundle?

### React, accessibility, and rendering

- Are `useEffect` dependencies complete, and is `meta` present when the screen
  needs it?
- Is intent-based action branching verified on the server?
- Is the boundary between route-local and shared UI intact?
- For changed user-visible flows, are the relevant loading, empty, failure,
  retry/control adjacency, focus-recovery, keyboard, and mobile fixed-bar states
  handled? Check the relevant render and interaction evidence; concrete
  accessibility or changed-UX deviations are must-fix findings.

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
