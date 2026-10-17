---
name: ds2-migration
description: Plan the Design System 2.0 migration of one MolluLog page. Takes the target page, its purpose, and a direction; interviews the user, runs external case research, settles the direction, records it as a Linear sub-issue of MLLG-115, then hands off to plan-and-subagent.
argument-hint: "<target page or route> — <purpose and usage> — <direction>"
disable-model-invocation: true
---

# DS 2.0 page migration

Migrate one page to Design System 2.0 (Linear project "디자인 시스템 2.0",
parent issue MLLG-115) through a fixed sequence. Each stage ends at a user gate;
do not skip ahead.

1. Intake
2. Grounding (code and Linear)
3. Interview and external research, in parallel
4. Direction draft and decisions
5. Linear sub-issue
6. Hand off to plan-and-subagent

Talk to the user in Korean. Write the Linear issue in Korean, matching the
existing MLLG-115 sub-issues. Repository files stay in English.

## Sources of truth

Read these before proposing anything. When they conflict, the order below wins.

1. Explicit decisions from the user in this session.
2. Linear document "디자인 시스템 2.0 작업 지침"
   (`get_document` id `4309c83b0488`): goals, page roles, migration method,
   motion, layout, state representation, verification.
3. `docs/frontend/design-system-v2.md`: tokens, layout parts, recipes, guard.
4. Sibling sub-issues of MLLG-115, for decisions already made on other pages.
   MLLG-124 is the reference for issue structure.
5. 1.x guidance in `docs/frontend/*.md`, only for pages not yet migrated.

## 1. Intake

The invocation arguments should give three things. Restate them in one short
block and confirm before continuing:

- **Target**: page name and route (`app/routes/...`).
- **Purpose and usage**: who opens this page, why, and how often.
- **Direction**: what should change and what must stay.

If any item is missing or vague, ask for it now. Do not infer the page's
purpose from its current implementation; the current UI is what is being
reconsidered.

## 2. Grounding

Do this directly; it is bounded read-only work.

- **Linear**: list MLLG-115 sub-issues. If one already covers the target (for
  example a Backlog issue such as MLLG-119 or MLLG-120), this run refines that
  issue instead of creating a new one. Note ordering and dependencies stated in
  the guideline document's "단계" section and in sibling issues.
- **Page role**: if the guideline document's "화면 역할" table already defines
  this page, carry that role forward and flag any conflict with the user's
  direction as a decision to resolve, not something to silently override.
- **Code inventory** for the target:
  - route files, route-local `_components/`, and the views and models they call;
  - 1.x components used, and which existing `app/components/v2/` parts can be
    reused;
  - current behaviors that must survive migration (saved view or filter state,
    scroll restoration, keyboard flows, auth-dependent state, query params);
  - states the page can be in: loading, empty, no data, failure, logged-out,
    partially failed;
  - whether the route is already listed in `migratedRouteFiles` of
    `test/app/components/design-system-source-guard.test.ts`.
- **Current problems**: list concrete, code-backed issues (duplicated
  information, inconsistent grammar between sections, unclear state). These
  become the issue's "현재 문제" section.

Summarize the grounding in a few bullets for the user before the interview.

## 3. Interview and external research

Start the research subagent first, in the background, then run the interview
while it works.

### External research (Haiku)

Launch one `Agent` with `model: "haiku"` and `subagent_type: "general-purpose"`,
`run_in_background: true`. Build the prompt from
[references/research-brief.md](references/research-brief.md), filling in the
target page, its purpose, and the questions most worth answering. The prompt
must tell the agent not to spawn further subagents.

When it returns, treat its output as leads, not facts. Open the two or three
claims the draft will rely on and confirm them yourself before citing them.
Drop claims without a source URL.

### Interview

Use `AskUserQuestion`, at most four questions per round, and only for choices
the code and guideline cannot settle. Prioritize:

- the primary task on this page and the one piece of information that must be
  visible first;
- information priority and what can move to a detail screen, Aside, or be
  dropped;
- mobile role for this page (viewer by default per the guideline; tables are
  decided per information type);
- logged-in versus guest, and owner versus visitor where relevant;
- behaviors or features to remove, move, or defer, and explicit out-of-scope
  items;
- dependencies on other migrations, and rollout timing.

Offer concrete options with trade-offs, recommended option first. Do not ask
about tokens, spacing, or motion values that the guideline or the v2 document
already fix.

## 4. Direction draft and decisions

Combine grounding, interview answers, and verified research into a draft:

- **Page role** in one sentence, in the style of the guideline's role table.
- **Layout**: which recipe from `design-system-v2.md` (hub, detail, form, data
  table), `width`, which regions (Header, Toolbar, Main, Aside), tabs, panels,
  and the `MobileActionBar` contents.
- **Information structure**: sections in priority order, and what each shows.
- **State representation**: every state from grounding, each distinct.
- **Mobile treatment** per information type.
- **Reuse and new parts**: existing v2 parts to reuse, and new v2 parts with
  their proposed location (`primitives/`, `layout/`, `features/<domain>/`).
  Call out any new token; the guideline only allows tokens with a confirmed use.
- **Behaviors preserved** from the inventory, and any proposed removal or move,
  each needing explicit approval.
- **Research takeaways**: what to adopt and what to avoid, with sources.
- **Open decisions**: material choices still unresolved, each with options.

Iterate until every open decision is settled. Product, UX, and domain-semantic
choices belong to the user; resolve only minor implementation details yourself.

If a decision applies beyond this page (a new shared rule, a change to a page
role, a new cross-page component), say so. Ask whether it should also go into
the guideline document; never edit that document without approval.

## 5. Linear sub-issue

Write the issue with [references/issue-template.md](references/issue-template.md).
Show the full title and body to the user and get approval before any write.

- New issue: `save_issue` with team MLLG, project "디자인 시스템 2.0", parent
  MLLG-115, state Backlog, title `[DS 2.0] <page name> 화면 이관`.
- Existing issue from grounding: update its description; keep its identifier.
- Add `blockedBy` relations for migrations that must merge first.
- Add the issue to the guideline document's "단계" list only with approval.

Report the issue identifier and URL.

## 6. Hand off to plan-and-subagent

Ask whether to start implementation now. On approval, invoke the
`plan-and-subagent` skill with the issue identifier as the linked requirement.
The issue is the requirement source; the plan's brief must trace its
completion conditions to the issue's "완료 기준". Baseline capture, mockups,
implementation, review, and delivery follow that skill and its profile, not
this one.

If implementation changes a decision recorded in the issue, update the issue
(with approval) so it stays the source of truth.
