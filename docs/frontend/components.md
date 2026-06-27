# Components

This document is the basis for deciding where new UI code lives. Instead of keeping a component list, it captures the durable layer rules and promotion criteria.

## Source of truth

The UI is organized into these layers:

1. `app/components/primitives`
2. `app/components/features/<domain>`
3. `app/routes/*._components`, `app/routes/*/_components`

New work reinforces this structure.

## Layer responsibilities

### `app/components/primitives`

- Thin, app-wide UI that does not belong to a domain.
- Low-level interaction and presentation: buttons, inputs, fields, callouts, shared surfaces.
- Display patterns repeated across multiple domains.

This layer owns:

- semantic-token-based base colors and surface roles
- shared variants
- consistent base spacing
- the project's common field / input density

Examples:

- page titles
- buttons, inputs, textareas, fields
- empty states
- profile images
- shared section / panel wrappers

Notes:

- Do not build two generic controls with the same responsibility.
- When domain vocabulary appears, `features` is usually the better fit.

### `app/components/features/<domain>`

- Domain UI reused across multiple routes.
- May contain domain vocabulary, copy, and state flow.
- The default choice when sharing part of a screen composition.

Examples:

- profile editing UI
- raid selector
- community feed
- event info card

### Route-local components

- UI used within a single screen or route family.
- Separated to keep route files short.
- Screen-only hooks and helper utilities can live alongside them.

The default stance is "route-local first, promote once reuse is confirmed."

## Promotion criteria

When building new UI, decide in this order:

1. Can existing `primitives` or `features/forms` solve it?
2. Can a low-level shared variant solve it?
3. Is it reused across multiple screens of the same domain?
4. If so, put it in `features/<domain>`.
5. If not, keep it route-local.

Prefer promoting after reuse is confirmed over premature sharing.

## Import rules

- Low-level UI and app-wide presentation: `~/components/primitives`
- Domain shared UI: `~/components/features/<domain>`
- Route-local code: relative imports

Do not force route-local code up into `features`. Conversely, do not keep copy-pasting reused UI as route-local.

## Naming

- Express responsibility in the name, not size.
- Reflect role differences rather than style differences.
- Prefixes like `Small`, `Mini`, `New`, `Custom` are a last resort.
- When the same role can be a variant, keep a single component.

Good examples:

- `StudentCard`
- `RaidSelector`
- `ProfileEditor`

## Component API

- Low-level components keep a small, predictable prop API.
- Domain components prefer props expressing domain intent over layout props.
- Encapsulate route `action` and hidden form serialization in the component closest to the screen.
- When one-off boolean combinations make intent ambiguous, prefer splitting the component again.

## Styling

- The base visual language comes from `primitives` and the semantic tokens in `app/tailwind.css`.
- `features` compose base controls rather than re-skinning them.
- Avoid two visual patterns for the same interaction.
- Do not tighten form density ad hoc at the route level; use an explicit variant when needed.

See [Design](./design.md) for detailed visual rules.

## Checklist

Before adding new UI code:

1. Is it in the correct layer?
2. Can existing `primitives` / `features/forms` reuse solve it?
3. Does the name explain its responsibility?
4. Are semantic elements used?
5. Is it being shared too early without a reuse rationale?
