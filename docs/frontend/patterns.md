# Frontend patterns

This page keeps a small set of verified source anchors for reuse. The anchors
are implementation references, not user-approved gold standards or invented
screenshots. Let the task lead: comparing many students needs scanable grouping
and density, while inspecting one student needs clear hierarchy and detail.
Legacy screens are not blanket approval for a new design.

## Choose a composition

1. Check existing `primitives` and `features/forms` combinations.
2. Compose a route-specific combination when the arrangement belongs to one
   screen or route family.
3. Promote it only after reuse is confirmed, or when a low-level shared
   primitive is clearly needed by more than one domain.

See [components](./components.md) for layer ownership, [design](./design.md)
for visual rules, and [UI quality](./ui-quality.md) for the task brief and
evidence expected for a visible change.

## Page Panel composition

`PagePanel` owns the titled surface and expanded/collapsed state. An expanded
panel keeps consistent space between its heading and body and has no default
divider; add a divider only when the content structure needs a boundary. A
control placed directly in a panel should not create a second default card.
Use a panel-specific composition such as `PanelEventSelector`, or remove a
reusable control's resting border/background while preserving its focus, open,
hover, and selected feedback.

Panel body anatomy is provided by `PanelBody`, `PanelBodySection`, and the
internal `PanelBodyRow`:

- section labels use `text-xs font-semibold text-muted-foreground`;
- repeated row titles use `text-sm font-normal text-foreground/85`;
- supporting text uses `text-xs text-muted-foreground`.

These compact Panel labels and deliberately compact supporting text are the
explicit `text-xs` structural exception in [design](./design.md); do not
generalize them to body copy or primary actions.
Use the purpose-specific compositions rather than rebuilding this anatomy or
adding a large style variant: `PanelActionRow`, `PanelIconToggleRow`,
`PanelSwitchRow`, `PanelFilterButtonRow`, `PanelFilterButtonsSection`, and
`PanelSearchField`. Add a composition only for a genuinely new control type.

Verified references:

- [`PagePanel`](../../app/components/features/layout/PagePanel.tsx#L40-L63)
- [`PanelBody`](../../app/components/primitives/PanelBody.tsx#L18-L38)
- [`PanelBodyControls`](../../app/components/primitives/PanelBodyControls.tsx#L54-L164)
- [`PanelOptionGroup`](../../app/components/primitives/PanelOptionGroup.tsx#L26-L81)

The following is an adapted code excerpt from the current event filter and is a
reuse reference, not an approved visual gold standard:

```tsx
<PanelBody>
  <PanelIconToggleRow
    title="다가오는 이벤트만 보기"
    active={filter.onlyUpcoming}
    emphasis="strong"
    Icon={CheckIcon}
    onChange={(active) => onFilterChange({ ...filter, onlyUpcoming: active })}
  />
  <PanelSearchField
    label="이름으로 찾기"
    value={filter.search}
    placeholder="이벤트 이름"
    onChange={(search) => onFilterChange({ ...filter, search })}
  />
</PanelBody>
```

Compare the excerpt with the [current route implementation](../../app/routes/events._index.tsx#L105-L130)
before adapting it.

## Filter and option composition

`FilterButtons` defaults to the nested Panel treatment (`surface="panel"`),
where inactive buttons use `bg-muted` without a shadow. Direct page placement
may opt into `surface="page"`, which uses a white card control and a small
light-mode shadow. Use `PanelFilterButtonRow` for a dense row and
`PanelFilterButtonsSection` when the group needs a section heading or
description.

Dense filter rows keep the standard `FilterButtons` padding and gap. Short
groups may stay on one line; long labels wrap naturally. Do not compress the
spacing or introduce horizontal scrolling just to force a row to fit. Inactive
buttons use `hover:bg-foreground/10` so hover remains visible on light cards
and dark muted surfaces without adding a border. Colored buttons use the same
full-height left rail as `AttributeBadge`; the pseudo-element preserves the
semantic color without adding another flex item.

Panel option controls use `bg-muted` with a small light-mode shadow when
inactive. Repeated options use a subtle primary tint when active; reserve the
solid `strong` emphasis for a single state that must be immediately recognized.
They should not imitate a stand-alone white page control inside a white Panel.
Keep hover feedback on the actual option button instead of painting a second
hover surface across its non-interactive row.

The [current `FilterButtons` implementation](../../app/components/primitives/FilterButtons.tsx#L17-L145)
and [student filter](../../app/components/features/students/StudentFilter.tsx#L194-L284)
show these combinations in use. The student filter and
[`StudentCards`](../../app/components/features/students/StudentCards.tsx#L44-L136)
are reuse references for a many-student comparison screen; [`StudentInfo`](../../app/components/features/students/StudentInfo.tsx#L43-L169)
is a reuse reference for inspecting one student. Choose only the parts that
serve the current task, content, and state.

## Capture actual references

Do not invent an approved screenshot set. When a task needs visual evidence,
capture the actual render after the current change and record:

- the inspected code state (commit SHA plus the relevant working-tree diff);
- route or full URL and the representative data/state;
- viewport or breakpoint, theme/color scheme, and browser;
- the interaction step when the evidence concerns behavior.

Label each artifact as a code reference, mockup, or actual render/interaction
evidence. A mockup or code reference cannot prove the implementation. After a
later change, recheck affected evidence; missing relevant render or interaction
evidence is `UNVERIFIED`.
