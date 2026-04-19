# UI/UX Guidelines

This document defines the default UI direction for MolluLog.
When creating or changing UI, follow these rules before introducing a new pattern.

## Design Direction

- Prefer `shadcn/ui` as the default design system for new UI work.
- Before writing custom markup, first check whether an existing `shadcn/ui` component or composition can solve the problem.
- Treat `shadcn/ui` as the default base layer for buttons, fields, inputs, cards, dialogs, popovers, and similar low-level controls.
- Reuse existing project patterns before introducing a new one.
- Keep one visual language per screen. Do not mix competing card, button, field, or list styles in the same area.
- Preserve MolluLog's product tone, but use `shadcn/ui` as the default interaction and layout baseline.

## Component Strategy

- Build new UI from shared components, not route-specific ad hoc markup.
- Do not create new generic primitives when `shadcn/ui` already provides the same responsibility.
- Keep app-specific abstractions thin. If a wrapper only renames a `shadcn/ui` component without adding real project value, prefer using the `shadcn/ui` component directly.
- If the same UI appears in more than one route, promote it to a shared component.
- Remove obsolete components after migration to avoid parallel implementations.
- Do not create a second generic design system beside the existing `shadcn/ui` base.

## Surface And Layout Rules

- Use one clear section surface pattern per screen.
- Avoid unnecessary nested borders, stacked wrappers, and decorative containers.
- Keep spacing, radius, border, and shadow treatment consistent within the same section.
- Default surfaces and containers should usually stay within `rounded-md` to `rounded-lg`.
- Avoid using `rounded-xl`, `rounded-2xl`, or larger on standard cards, panels, and inline containers unless there is a deliberate visual reason.
- `rounded-full` is acceptable for pills, chips, avatars, and similarly compact UI, but should not become the default shape language for large surfaces.
- Match component width to content intent. Do not make every control full width by default.

## Typography And Copy

- Keep text hierarchy obvious: title, label, description, action.
- Labels should be visually stronger than descriptions.
- Use helper text only when it reduces uncertainty.
- Avoid decorative English labels or filler copy that do not help task completion.

## Form Rules

- Use explicit submit flows for settings and account forms by default.
- Do not auto-save on change unless the interaction clearly benefits from it.
- Save feedback must be immediate and obvious in idle, submitting, and saved states.
- Saved state must reset as soon as the user changes the form again.
- Keep validation, descriptions, and error placement structurally consistent across forms.
- `shadcn/ui` form controls should default to a comfortable density. Prefer the base spacing from `components/ui` over route-level tightening.
- Do not compress form layouts with ad hoc `gap-0`, `pt-0`, `pt-1`, smaller control heights, or reduced padding unless the screen intentionally uses a compact variant.
- Prefer `size="sm"` or another explicit compact variant only when density is a real requirement, not as a default styling shortcut.

## Interactive Controls

- Controls with visual identity should preserve that identity in both closed and open states.
- Dropdowns, popovers, and selectors should align with their trigger width unless there is a strong reason not to.
- Adjacent controls in the same row should align in height and rhythm.
- Avoid interactions that block navigation or make the UI feel unresponsive.

## Agent Checklist

Before adding UI, check:

1. Can this be built with existing `shadcn/ui` components?
2. Does this match an existing screen pattern in the project?
3. Is this shared UI or only route-local composition?
4. Is the visual hierarchy clear without extra decoration?
5. Does the interaction give clear feedback without extra noise?
