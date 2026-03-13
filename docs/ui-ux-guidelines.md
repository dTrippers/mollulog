# UI/UX Guidelines

This document defines the default UI and UX rules for MolluLog.
When creating or modifying UI, follow these rules before introducing a new component pattern.

## Goals
- Keep the product visually modern, simple, and easy to scan.
- Prefer consistency over one-off styling.
- Reduce repeated UI implementations by consolidating shared patterns.
- Make route-level screens lighter and easier to reason about.

## Component Structure

Use this structure as the default rule:

### 1. `components/primitives`
- Small reusable building blocks with shared styling rules.
- Examples: `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Panel`, `Section`, `BottomSheet`, `Tabs`.
- These components own visual variants such as `size`, `tone`, `variant`, and `disabled`.
- Do not create multiple components for the same role if variants can solve it.

### 2. `components/features/<domain>`
- Domain-specific reusable UI composed from primitives.
- Examples: `features/students`, `features/raids`, `features/events`, `features/profile`.
- Feature components may contain domain logic and domain-specific layout.
- Feature components should not redefine base button, field, or panel styling.

### 3. `routes/<route>/_components`
- Route-local UI that is not reused elsewhere.
- If a component is only used in one route, keep it near that route instead of promoting it too early.
- Promote it to `features` only after clear reuse appears.

## Naming Rules
- Name components by role, not by size alone.
- Good: `Button`, `IconButton`, `Panel`, `StudentPicker`.
- Avoid parallel names for the same responsibility such as `Button`, `SmallButton`, `MiniButton`, `ButtonForm`.
- If two components share the same responsibility, merge them and express differences through props.
- Avoid identical names for different behaviors across domains.

## Reuse Rules
- Before adding a new component, search for an existing primitive or feature component.
- If only styling differs, extend the existing component with variants.
- If behavior differs but the visual frame is shared, extract a shared primitive and keep behavior outside.
- Do not create a shared component for a single screen unless reuse is already likely.

## Styling Rules
- Use Tailwind utilities consistently, but centralize repeated class sets inside primitives.
- Prefer neutral, readable defaults with clear accent colors.
- Keep spacing, radius, border, and shadow behavior consistent across similar components.
- Avoid mixing multiple competing visual idioms in the same area.
- Preserve existing product identity unless a broader redesign is intentional.

## Layout Rules
- Use a clear page shell with predictable width, spacing, and section rhythm.
- Standardize page sections around shared container components instead of bespoke wrappers.
- Avoid overlapping abstractions with similar responsibilities.
- Prefer one canonical section container and one canonical panel container.

## Form Rules
- Inputs, textareas, selects, toggles, and submit actions should come from shared primitives.
- Labels, descriptions, error messages, and disabled states should follow the same structure everywhere.
- Avoid creating route-specific button or field wrappers unless they add real behavior.

## Interaction Rules
- Use motion sparingly and consistently.
- Prefer CSS transitions for simple state changes.
- Load expensive interactive UI only when needed.
- Avoid globally mounting heavy client-side UI if only a subset of routes uses it.

## Performance Rules
- Keep root-level UI lightweight.
- Do not put route-specific heavy logic into the global layout without a strong reason.
- Lazy-load heavy client-only features when possible.
- Prefer route-local composition over globally imported UI for infrequently used features.
- Consolidate repeated UI code to reduce maintenance cost, but do not over-centralize route-only code.

## Content and Accessibility Rules
- Preserve clear hierarchy with visible titles, descriptions, and actionable controls.
- Interactive elements must use semantic buttons or links.
- Decorative-only wrappers should not handle critical interaction.
- Provide accessible labels for controls that do not expose visible text.

## Default Decision Checklist
Before adding or changing UI, check the following:

1. Does a primitive already exist for this role?
2. Can this difference be represented with variants instead of a new component?
3. Is this component really reusable, or should it stay route-local?
4. Does this introduce a second pattern for the same interaction?
5. Does this make the root layout or common bundle heavier than necessary?

## Current Cleanup Direction
- Consolidate button-like components into a single primitive button API.
- Consolidate panel and section containers into a small shared set.
- Move one-off route UI closer to routes.
- Keep domain-specific composition inside feature folders.
- Avoid reviving broad `atoms / molecules / organisms` separation unless there is a strict, enforced rule set.
