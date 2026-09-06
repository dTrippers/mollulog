# Verification

Choose checks from the change scope and the scripts in [`package.json`](../../package.json).
Run runtime commands through `mise exec --`.

## Scope

For documentation-only changes, inspect changed links, headings, cross-document
references, and content consistency, then run `git diff --check`. Application
lint, typecheck, and tests are not mandatory for docs-only work.

During UI iteration, run only the preview or diagnostic checks needed to inspect
the direction. After the direction is settled, run the appropriate final checks
and rerun affected checks after concrete fixes; do not run broad checks after
every small visual adjustment.

The package scripts currently include `typecheck`, `lint`, and `test`:

```sh
mise exec -- pnpm typecheck
mise exec -- pnpm lint
mise exec -- pnpm test
```

Use `mise exec -- pnpm lint` for its package-scoped migration and app/test checks.
When a full-tree check is specifically relevant, run
`mise exec -- pnpm exec biome check .`; it is separate, generated-inclusive,
and optional rather than a default extra check. Distinguish a pre-existing
baseline failure from a failure introduced by the current diff; do not globally
fix an unrelated baseline. Query changes also need `mise exec -- pnpm codegen`,
followed by checks appropriate to the affected code.

## Smallest evidence for a claim

| Claim | Smallest evidence |
| --- | --- |
| Cookie persistence across navigation | An actual browser flow covering the route and its `.data` request path, including navigation and reload. |
| Database transaction or persistence behavior | For an actual persistence, transaction, or constraint guarantee, check the actual database and boundary. Mocks remain valid for app wiring and unit behavior; a new real-DB fixture is not required for every CRUD or UI edit. |
| Input error, draft retention, or retry | A real interaction that enters the failure, checks retained input and adjacent retry/control state, and retries. |
| CI runtime or timezone behavior | A fresh CI result or an executed local check matching CI's runtime/timezone; fixture presence alone is insufficient. If successful CI is part of delivery, verify a fresh CI run. |
| Authentication or privacy | Exercise relevant loader/action access cases and inspect serialized responses for unauthorized data; hiding content in the DOM alone is insufficient. |
| Cross-repository contract | The shared representative fixture passing through both sides; do not infer it from one repository alone. |
| AOI dataset behavior | Only when the adjacent AOI project is explicitly in scope: verify the valid development/calibration/test split, dataset/model provenance, and applicable no-regression conditions with AOI evaluation evidence. MolluLog `main` does not require dataset checks by default. |
| Identity, labels, or calculations | Verify canonical identity and source semantics, including UID scope, type, or category where relevant, before mapping labels or calculations. A display filter must not implicitly change calculation input, and current-only save must not mutate goals or planner membership. |
| Bug regression | A test or interaction that reproduces the real failure and has assertions that execute; an empty artifact or progress message is not completion. |

For cross-repository work, identify the relevant repositories, worktrees,
branches, and current changes. When recovering unfinished work, also check the
relevant stashes and divergence rather than assuming one visible branch is the
whole feature. Report implementation, schema/contract, migration, and deploy
status separately for each repository. Do not expand authorization or mutate an
adjacent repository as a side effect.

A command's exit status proves only what that command exercises. For an external
review, report the process exit, a complete substantive review report, and the
matching inspected code state. Record missing required evidence as `UNVERIFIED`,
never as success. When a configured workflow such as plan-and-subagent applies,
follow that active workflow's validation contract for review counters, evidence
ledgers, and freshness; ordinary docs or code tasks do not require an installed
workflow. This document owns the project's commands and claim-to-evidence
mapping.
