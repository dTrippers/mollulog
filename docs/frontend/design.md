# Design

MolluLog's UI prioritizes keeping the established visual language consistent over inventing new patterns.

## Direction

- New low-level UI uses `primitives` and the proven `features/forms` combinations as the base layer.
- Color and surface roles follow the semantic tokens in `app/tailwind.css`.
- A single screen keeps one visual language.
- Information structure and task flow come before decoration.
- The same kind of interaction looks the same wherever possible.

## Shared component strategy

- First check whether existing `primitives`, `features/forms`, and current project patterns can solve it.
- Do not build two generic components with the same responsibility.
- Keep route-specific combinations route-local, and promote to a shared component once reuse is confirmed.

## Surfaces and layout

- Borders and dividers are opt-in, never a default decoration. Every border or divider must mark a functionally necessary control boundary or dense data boundary; if removing it does not reduce task comprehension or control affordance, remove it.
- Do not use borders or dividers merely to separate sections, cards, list items, popovers, or other content areas. Use spacing, background contrast, and typography instead.
- Do not add unnecessary nested cards or decorative wrappers.
- Cards and section surfaces do not use borders by default. Form controls and data tables may use `border-input` or `border-border` when the boundary is functionally necessary.
- Large cards and navigation surfaces use a wide, subdued shadow in light mode (`shadow-lg shadow-black/5`) and a tighter shadow in dark mode (`dark:shadow-md dark:shadow-black/20`) when background contrast alone does not create enough separation. Do not apply shadows to every nested row or small card.
- Within a section, keep radius, border, shadow, and spacing uniform.
- Base surface radius stays between `rounded-md` and `rounded-lg`. Do not use `rounded-xl` or larger.
- Card-like surfaces stacking several rows use roughly `p-5 md:p-6` padding by default; only simple single-line items or small auxiliary panels drop to `p-3`–`p-4`.
- For spacing between major blocks inside a card, use `gap-4`–`gap-6`. If a functionally necessary divider is unavoidable, keep at least `pt-4` after it so the content does not feel cramped.
- `rounded-full` is mostly for small elements like pills, chips, and avatars.
- Do not force every control to full width; size to content and context.

### Surface hierarchy

- Page background uses `bg-background`: neutral-50 in light mode and neutral-800 in dark mode.
- Cards use `bg-card`: white in light mode and a tone between neutral-800 and neutral-900 in dark mode. Light cards sit softly above the canvas; dark cards act as inset content surfaces.
- Navigation uses the card surface and a subtle edge shadow so it remains distinct from the page. Utility controls inside it keep a persistent contrasting fill instead of relying on hover alone.
- Elevated popovers and sheets use `bg-popover` with a shadow when separation is needed.
- Supporting areas and hover states use `bg-muted` or a translucent muted value.
- `bg-muted` is not the default surface for a stand-alone inactive control on the light page canvas. Use a white `bg-card` control with a small subdued shadow in light mode, and switch back to `bg-muted` in dark mode.
- `FilterButtons` defaults to the nested Panel/Container treatment (`surface="panel"`): inactive buttons use `bg-muted` without a shadow. Only direct page placement opts into `surface="page"`, which uses a white control and a small light-mode shadow.
- In light mode, white cards sit subtly above the neutral-50 canvas. In dark mode, cards are moderately darker than the neutral-800 page without reaching neutral-900.
- New shared primitives and structural surfaces use semantic tokens. Existing feature-specific `neutral-*` colors are migrated file by file in the separate token-migration track; image overlays, fixed inverse surfaces, status colors, and data visualizations may keep explicit colors.

### Page width

- Default lists and dashboards use `max-w-5xl`.
- Forms and document-like screens use `max-w-3xl`.
- Dense tables and comparison screens opt into `max-w-7xl` through the route layout handle.
- Shared layout owns page width. Routes should not add a second equivalent max-width wrapper.
- Default and wide pages share the same `max-w-7xl` outer canvas. Route-specific widths are applied to an inner wrapper anchored to the left, so titles and primary panels do not move horizontally when navigating between page widths.
- Page side rails distinguish navigation roles: the active screen selector uses a full subtle primary tint, while destination links use a neutral card with a tinted icon and directional arrow. Both use the same small light-mode shadow and occupy the full rail width.
- Consecutive Page Panels use a consistent `space-y-3` gap. Link groups add extra separation only when a Panel group actually precedes them.
- Expanded Page Panels use consistent spacing between the icon/title header and body without a default divider. Add a divider only when the content structure requires an explicit boundary.
- Controls embedded directly in a Page Panel should not create a second default card. Use a Panel-specific composition such as `PanelEventSelector`, or remove the reusable form control's resting border/background while keeping focus, open-popover, hover, and selected-state feedback.
- Panel body anatomy is composed from `PanelBody`, `PanelBodySection`, and the internal `PanelBodyRow`: section labels are `text-xs font-semibold text-muted-foreground`; repeated row titles are `text-sm font-normal text-foreground/85`; supporting text is `text-xs text-muted-foreground`.
- Routes use purpose-specific compositions instead of constructing anatomy or selecting a large style variant directly: `PanelActionRow`, `PanelIconToggleRow`, `PanelSwitchRow`, `PanelFilterButtonRow`, `PanelFilterButtonsSection`, and `PanelSearchField`. Add a new composition when a genuinely new control type appears.
- Dense filter rows use `PanelFilterButtonRow` with the standard `FilterButtons` padding and gap. Keep short groups on one line and allow long labels such as defense types to wrap naturally rather than compressing spacing or introducing horizontal scrolling.
- Inactive `FilterButtons` use `hover:bg-foreground/10` so hover remains recognizable on both light card and dark muted surfaces without adding a border.
- Colored `FilterButtons` use the same full-height left color rail as `AttributeBadge` in raid selectors. The rail is painted as a pseudo-element instead of a separate flex item, preserving the semantic color while reducing horizontal pressure in dense one-line filter rows.
- Panel option controls use `bg-muted` with a small light-mode shadow when inactive. Repeated options default to a subtle primary tint when active; reserve the solid `strong` emphasis for a single state that must remain immediately recognizable. They should not mimic a stand-alone white page control inside a white Panel.
- Do not paint a second hover surface across a non-interactive row around a Panel option. Keep hover feedback on the actual button so its boundary does not merge into its parent.

## Typography and copy

- Titles, labels, descriptions, and actions need a clear hierarchy.
- Page title: `text-2xl md:text-3xl font-bold`.
- Section title: `text-lg font-semibold`.
- Card or subsection title: `text-base font-semibold`.
- Supporting descriptions: `text-sm text-muted-foreground`.
- `text-xs` is reserved for metadata, captions, and compact badges.
- Description text is opt-in, not a default part of a title or control. Add it only when the user needs information that is not already clear from the title, label, value, or surrounding context to make a decision.
- Do not restate the title, label, current state, interaction source, or obvious behavior in a description. Remove redundant descriptions instead of filling empty space with explanatory copy.
- Do not add decorative English phrases or meaningless filler text.
- Prefer natural, short sentences written for Korean users.

## Forms

- Settings and account screens use explicit save by default.
- Use auto-save only when the benefit is clearly large.
- Save state must clearly show `idle`, `saving`, and `saved`.
- When the user edits again, the `saved` state resets immediately.
- Keep the placement of error, description, and help text consistent across the whole form.
- Base form density follows the shared `primitives` and the canonical picker; do not compress it ad hoc per screen.

## Interaction

- Use a semantic `button` or `Link` for primary clickable elements.
- Shared button variants express roles rather than colors: `default`, `primary`, `secondary`, `danger`, `danger-subtle`, and `inverse`.
- Focusable controls use `ring-ring/30`; do not introduce route-specific blue or neutral focus rings.
- Dropdowns, popovers, and pickers must connect visually to their trigger.
- Controls in the same row align in height and rhythm.
- Avoid interactions that feel slow or leave their state ambiguous.

## Loading states

- Skeleton UI should resemble the final loaded UI, not a generic placeholder block.
- Preserve the loaded screen's main sections, row density, columns, and visual rhythm while data is loading.
- Use skeletons to reduce layout shift and help users predict what content is coming.
- Do not put a tiny skeleton inside an unrelated container if the loaded content will become multiple sections or cards.
- For example, raid platinum statistics should load as skeleton versions of the party count, student usage, and often-used party sections, not as one generic loading box.

## Checklist

Before building new UI:

1. Can existing `primitives` and `features/forms` combinations solve it?
2. Is a route-local wrapper enough?
3. Is it clear whether this UI is shared or route-local?
4. Is the information hierarchy visible without unnecessary decoration?
5. Does the result of save / submit appear immediately?
6. Are you creating a second visual language different from existing screens?
7. Does every border or divider mark a functionally necessary boundary? If spacing, alignment, typography, or background contrast can replace it, remove it.
8. Is every radius `rounded-lg` or smaller, except intentional pills and avatars?
