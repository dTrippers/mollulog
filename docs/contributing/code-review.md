# Code Review

This document is a checklist for what to look at first and what to look at later during a PR review. It assumes reviewing against the actual change scope rather than re-reading the whole codebase.

## Principles

- Start the review from the actual `git diff`.
- Resolve `must-fix` items before approval.
- Leave inline comments where possible, and settle the final judgment in one review.
- Leave automatic style fixes to the tooling, and focus the review on behavior, structure, and regression risk.

## Before reviewing

- `pnpm typecheck`
- `pnpm exec biome check .`
- relevant tests when needed

Rather than requiring the full test suite on every PR, check that verification matches the change scope.

## Must fix

### Correctness

- Are prop, state, and query fields actually connected to rendering and behavior?
- Do delete / update actions verify target ownership and permission?
- Does the sort / condition used on screen match the actual data query?

### Data and state

- Do the route and its UI fetch only the data they actually need?
- Does a child avoid re-fetching data the parent already has?
- Are sort / display fields such as `createdAt` and `updatedAt` not missing?

### Auth and security

- Do all write actions verify authentication?
- Does user input enter DB / server logic safely?
- Is the unauthenticated user flow clear?

### React / React Router

- Are `useEffect` dependencies not missing?
- Is `meta` not missing on a screen that needs it?
- Is `intent`-based action branching verified on the server?
- Is the boundary between route-local and shared UI intact?

## Recommended

### UI / UX

- Do async sections have loading, empty, and error states?
- Does a new card / form pattern not diverge too far from existing screens?
- Is feedback for destructive actions sufficient?

### TypeScript / GraphQL

- Are generated GraphQL types used first?
- Are unnecessary `as` casts left behind?
- Is type duplication that codegen could solve being created by hand?

### Structure

- Does the route file not grow beyond screen assembly?
- Is the same utility not duplicated across multiple files?
- Is something shared too early without a reuse rationale?

## Usually not part of the review

- Formatting nits Biome resolves automatically
- Large refactors unrelated to the PR goal
- Taste-level rewrites not connected to regression risk
