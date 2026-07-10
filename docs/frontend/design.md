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

- Do not add unnecessary nested cards, heavy borders, or decorative wrappers.
- Prefer spacing, background contrast, and typography over borders. Use a border only when a control boundary or dense data boundary would otherwise be unclear.
- Cards and section surfaces do not use borders by default. Form controls and data tables may use `border-input` or `border-border` when the boundary is functionally necessary.
- Within a section, keep radius, border, shadow, and spacing uniform.
- Base surface radius stays between `rounded-md` and `rounded-lg`. Do not use `rounded-xl` or larger.
- Card-like surfaces stacking several rows use roughly `p-5 md:p-6` padding by default; only simple single-line items or small auxiliary panels drop to `p-3`–`p-4`.
- For spacing between major blocks inside a card, use `gap-4`–`gap-6`, and keep at least `pt-4` after a divider so it does not feel cramped.
- `rounded-full` is mostly for small elements like pills, chips, and avatars.
- Do not force every control to full width; size to content and context.

### Surface hierarchy

- Page background uses `bg-background`.
- Cards use `bg-card`; elevated popovers and sheets use `bg-popover` with a shadow when separation is needed.
- Supporting areas and hover states use `bg-muted` or a translucent muted value.
- In dark mode the page is the darkest surface, cards are one step lighter, and popovers are separated with shadow or stronger local contrast.
- Do not combine semantic surface tokens with raw `neutral-*` colors in the same file unless the color is an image overlay or a fixed inverse surface.

### Page width

- Default lists and dashboards use `max-w-5xl`.
- Forms and document-like screens use `max-w-3xl`.
- Dense tables and comparison screens opt into `max-w-7xl` through the route layout handle.
- Shared layout owns page width. Routes should not add a second equivalent max-width wrapper.

## Typography and copy

- Titles, labels, descriptions, and actions need a clear hierarchy.
- Page title: `text-2xl md:text-3xl font-bold`.
- Section title: `text-lg font-semibold`.
- Card or subsection title: `text-base font-semibold`.
- Supporting descriptions: `text-sm text-muted-foreground`.
- `text-xs` is reserved for metadata, captions, and compact badges.
- Add description text only when it genuinely helps the user decide.
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
7. Can spacing or background contrast replace this border?
8. Is every radius `rounded-lg` or smaller, except intentional pills and avatars?
