# Component Development Guide

This document defines the final component and route composition structure for ongoing development.
Use it as the default rule when adding, moving, or refactoring UI code.

## Source Of Truth

The project should be treated as having three application layers plus one reserved base layer:

1. `app/components/ui`
2. `app/components/primitives`
3. `app/components/features/<domain>`
4. `app/routes/*._components` or `app/routes/*/_components`

Use these layers directly. Do not recreate `atoms`, `molecules`, `organisms`, or `navigation`.
`app/components/ui` is reserved for `shadcn/ui` source and low-level shared UI building blocks. Do not create another parallel generic UI layer.

### `components/ui`
- Reserved for `shadcn/ui` source files and low-level design-system components.
- Use this layer when adopting, extending, or composing `shadcn/ui` primitives.
- Keep this layer generic and domain-agnostic.
- Do not move route-specific or domain-specific UI into this layer.

## Layer Rules

### `components/primitives`
- Thin app-level abstractions built on top of `components/ui` when the project needs shared presentation or behavior that is still generic.
- Must remain domain-agnostic, but should not duplicate `shadcn/ui` base controls without a clear project-specific reason.
- Typical examples:
  - `Title`
  - `ProfileImage`
  - `ClickableSurface`
  - `EmptyView`
  - `Section`

Use `primitives` when:
- the component is reused across multiple domains
- the project needs a shared abstraction above `shadcn/ui`
- the component expresses MolluLog-specific presentation or interaction rules that should stay consistent across screens

Do not put into `primitives`:
- direct reimplementations of `shadcn/ui` controls such as generic `Button`, `Input`, `Textarea`, `Field`, or `Card`
- student-specific, raid-specific, or event-specific rendering
- route-only composition
- business logic tied to one domain

### `components/features/<domain>`
- Reusable domain UI composed from primitives and domain models.
- Own domain-specific layout, wording, state flow, and transformations.
- Should be the default location for reusable screen sections within a domain.

Current domains should continue to grow here:
- `auth`
- `contents`
- `coupons`
- `editor`
- `events`
- `forms`
- `futures`
- `layout`
- `profile`
- `raids`
- `relationship`
- `students`

Use `features` when:
- the component is reused in multiple routes within the same domain
- the UI needs domain terms or domain state
- the component is bigger than a primitive but still not route-specific

Do not put into `features`:
- new base button, field, panel, sheet, tab, or generic card styles
- one-off route orchestration that is only used once

### `routes/*._components` or `routes/*/_components`
- Route-local composition only.
- Use this for screen-only helpers, view-specific hooks, and presentation split out of a route file.
- The route should stay responsible for loader/action wiring, while route-local components handle screen composition.

Use route-local components when:
- a component is only used by one route or route family
- the component exists mainly to keep a route file readable
- the component combines feature components in a way that is unique to one screen

Promote route-local code to `features` only after reuse is real.

## Import Rules

- Prefer importing from `~/components/ui` when you need existing `shadcn/ui` building blocks.
- Prefer importing from `~/components/primitives`.
- Prefer importing from `~/components/features/<domain>`.
- Prefer importing route-local components with relative imports from the route directory.
- Do not introduce new imports from removed legacy layers such as:
  - `~/components/atoms`
  - `~/components/molecules`
  - `~/components/organisms`
  - `~/components/navigation`
- Inside `features`, prefer importing sibling domain code through that domain's public entrypoint when it keeps imports clear.
- Inside a route family, prefer relative imports for route-local files and feature imports for shared domain UI.

## Naming Rules

- Name by responsibility, not by size.
- Prefer `StudentCard`, `StudentFilter`, `RelationshipStudentPicker`.
- Avoid parallel names that describe style drift instead of responsibility.
- Examples to avoid:
  - `SmallButton`
  - `MiniButton`
  - `ButtonForm`
- If variants solve the difference, keep one component.
- If two components share a name but do different jobs, rename them until their role is obvious.

## API Rules

- Prefer `components/ui` directly for low-level controls.
- Primitive APIs should be small and predictable.
- Prefer props like `variant`, `size`, `tone`, `disabled`, `loading`, `fullWidth`.
- Feature APIs should express domain intent clearly.
- Avoid leaking layout-only wrapper props through many layers.
- Avoid one-off booleans that create unclear combinations.
- Keep hidden form field serialization and route action wiring inside form-oriented feature components instead of scattering it through routes.

When a component is getting complex:
- split internal rendering helpers first
- extract route-local composition second
- promote to a shared feature only if reuse is confirmed

## Styling Rules

- Shared base styling belongs in `components/ui`.
- `primitives` should compose `components/ui` instead of redefining base controls.
- Feature components should compose `components/ui` and `primitives` instead of redefining base look-and-feel.
- Keep spacing, radius, border, and surface treatment consistent.
- Do not create a second visual pattern for the same interaction without a strong reason.

## Interaction Rules

- Interactive UI must use semantic `button` or `Link`.
- Do not rely on clickable `div` or `span` for core actions.
- Reuse shared interaction surfaces such as `ClickableSurface`, `Button`, `BottomSheet`, and shared toggle patterns.
- Keep modal, sheet, card-click, and selection behavior consistent across screens.
- Prefer route-local hooks for screen-specific async UI state such as infinite scroll feeds or temporary comparison state.

## Promotion Rules

Use this decision order before creating a component:

1. Can an existing primitive solve this?
2. If not, can a primitive be extended with variants?
3. If not, is this reusable within one domain?
4. If yes, place it in `features/<domain>`.
5. If not, keep it route-local.

This project should bias toward route-local first, then promote upward only when reuse becomes clear.

## Route File Rules

- Keep route files focused on loader, action, params, and high-level screen assembly.
- Move bulky view sections into route-local components.
- Move route-only client hooks into the same route-local area when they are not shared elsewhere.
- Do not move route-only orchestration into `features` just to avoid a local file.
- If a route-family shares a screen section, route-local components under that family are acceptable.
- Route-local directory naming should follow the route family:
  - `app/routes/students.$id._components`
  - `app/routes/events.$uid._components`
  - `app/routes/raids.$id._components`

## Legacy Rules

- The old `atoms / molecules / organisms / navigation` layers are no longer part of the active architecture.
- `app/components/ui` is the active `shadcn/ui` base layer and is the explicit exception.
- Do not recreate those directories.
- If an external reference or old branch reintroduces them, migrate that code immediately into `primitives`, `features`, or route-local components instead of extending the legacy shape.

## Practical Checklist

Before adding new UI code, verify:

1. The file is going into the correct layer.
2. The import path points to the new structure, not a legacy wrapper.
3. The component name describes responsibility clearly.
4. The interaction uses semantic elements.
5. The visual pattern matches an existing primitive where possible.
6. The code is not being promoted too early out of a route.

## Current Architectural Baseline

The following should be treated as the intended final state:

- shared low-level `shadcn/ui` building blocks live in `app/components/ui`
- thin app-level shared abstractions live in `app/components/primitives`
- reusable domain UI lives in `app/components/features/<domain>`
- route-only composition lives next to routes
- route-only hooks and screen helpers also live next to routes when they are not shared
- form orchestration components live in `app/components/features/forms`
- new development should reinforce this structure instead of bypassing it
