# UI quality

UI review starts from the user's task and the actual changed screen. Existing
references help with reuse, but they are not automatic approval for a redesign.

## Short task brief

Before a visible change, record the smallest useful brief:

- the user task and the main action or information hierarchy;
- grouping and density, including how repeated content should scan;
- representative content and states, such as long labels, large values, empty,
  loading, or failure states when they apply;
- what remains semantically unchanged;
- existing controls and compositions that should be reused.

For a small change following a settled pattern, a sentence in the task is
enough; a separate brief document or mockup is not required by this guide.

When introducing a new pattern, verify one representative end-to-end slice
before copying it broadly. A mockup is a design aid; an actual render is
implementation evidence.

## Evidence and acceptance

The primary should perform basic actual visual QA before presenting an
implemented result for the user to judge. Check the relevant density, hierarchy,
alignment, redundant text or nested boxes, long labels and large values, and
empty/failure states.
Visual changes need actual render evidence. Behavior changes need actual
interaction evidence; a screenshot alone cannot prove a state transition. A
description records evidence that was actually obtained and does not replace
the check. Check the relevant breakpoint(s) and theme(s), including mobile and
desktop when both are affected; do not require an exhaustive Cartesian matrix.

For changed flows, check the applicable error draft retention, retry/control
adjacency, focus recovery, mobile fixed bars, and keyboard behavior. Missing
relevant visual or interaction evidence is `UNVERIFIED` and cannot be declared
UI acceptance.

If the required browser or environment is unavailable, follow the existing
[development](../development.md) and server-authorization rules. Continue
independent authorized work, but report the specific unverified checks instead
of claiming UI completion.

Track these conclusions separately:

- functional acceptance: the behavior and data contract work;
- design acceptance: the approved visual and interaction criteria are met with
  actual evidence and any applicable user confirmation; evidence alone is not
  approval;
- deferred design: the user explicitly chose to polish later, which is not
  design success.

Briefing approval, result confirmation, and permission for delivery are
different checkpoints. Require only the checkpoints the task or active workflow
needs; do not impose a complete plan-and-subagent process on ordinary work.
Record which earlier decision a later explicit user decision replaces; an
agent's new suggestion is not a replacement approval. Evidence is tied to its
exact code state and comparison baseline. Carry forward unaffected evidence only
with a reason; recheck affected evidence after a change.

User-led redesign is not automatically an agent defect. A concrete current
bug, accessibility failure, or regression cannot be waived as taste. A tiny copy
fix may follow an established pattern without new design approval. A change to
product or UX meaning needs the user's choice, while an accepted in-scope fix
can proceed under the existing authorization.

Do not impose a universal column count or component size across the product.
Choose density and dimensions from the task, content, and established
composition.
