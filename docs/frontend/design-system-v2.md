# Design system 2.0

Design system 2.0 (v2) is the shared visual language for screens migrated from the 1.x UI. It covers color, density, and motion tokens, the `app/components/v2/` layout, and the guard that keeps 2.0 code on its own rules.

The 2.0 foundation adds tokens and rules only. It does not change any 1.x token, 1.x component, or existing screen. Components and screens that use 2.0 come in later steps.

## Naming

- Every 2.0 token uses the `v2-` prefix: `--v2-*` raw variables, `--color-v2-*` theme entries, `--spacing-v2-*`, `--transition-duration-v2-*`, and `--ease-v2-*`.
- Utilities keep the prefix: `bg-v2-canvas`, `text-v2-fg-tertiary`, `ring-v2-focus`, `py-v2-row-y`, `gap-v2-block-gap`, `min-h-v2-row-min`, `duration-v2-base`, `ease-v2-enter`.
- The cleanup step (MLLG-121) removes the prefix and renames the tokens. Until then, do not drop the prefix or reuse these names for 1.x values.

## Color tokens

Color tokens are defined in `app/tailwind.css`. Raw `--v2-*` variables live in `:root` (light) and `.dark` (dark), and `@theme inline` exposes them as `--color-v2-*`. The 1.x pattern is the same.

| Token / utility | Light | Dark | Use |
|---|---|---|---|
| `bg-v2-canvas` | `oklch(0.97 0 0)` | `oklch(0.17 0 0)` | Page background |
| `bg-v2-surface` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Content blocks |
| `bg-v2-inset` | `oklch(0.955 0 0)` | `oklch(0.25 0 0)` | Secondary areas, attribute badge background, image placeholder |
| `bg-v2-scrim` | `oklch(0 0 0 / 70%)` | `oklch(0 0 0 / 70%)` | Label chip on an image |
| `text-v2-fg` | `oklch(0.205 0 0)` | `oklch(0.96 0 0)` | Primary text |
| `text-v2-fg-secondary` | `oklch(0.439 0 0)` | `oklch(0.78 0 0)` | Secondary text, figures |
| `text-v2-fg-tertiary` | `oklch(0.52 0 0)` | `oklch(0.64 0 0)` | Types, labels, remaining time (text that must be read, 4.5:1 or higher) |
| `text-v2-on-media` | `oklch(1 0 0)` | `oklch(1 0 0)` | Text on a scrim |
| `bg-v2-hover` | `oklch(0.205 0 0 / 5%)` | `oklch(1 0 0 / 6%)` | Row hover overlay |
| `ring-v2-focus`, `outline-v2-focus` | `oklch(0.623 0.214 259.815)` | `oklch(0.623 0.214 259.815)` | Focus ring, 2px with 2px offset (3:1 or higher) |
| `text-v2-success` | `oklch(0.527 0.154 150.069)` | `oklch(0.792 0.209 151.711)` | Confirmed pill text and completed icons |
| `bg-v2-success-subtle` | `oklch(0.982 0.018 155.826)` | `oklch(0.266 0.065 152.934)` | Success pill background |
| `text-v2-live`, `bg-v2-live` | `oklch(0.505 0.213 27.518)` | `oklch(0.704 0.191 22.216)` | In-progress dot and label (domain) |
| `text-v2-favorite` | `oklch(0.645 0.246 16.439)` | `oklch(0.81 0.117 11.638)` | Favorite heart (domain) |
| `text-v2-new` | `oklch(0.905 0.182 98.111)` | `oklch(0.905 0.182 98.111)` | "New" label on a scrim (domain) |
| `bg-v2-attr-red` | `oklch(0.637 0.237 25.331)` | `oklch(0.704 0.191 22.216)` | 폭발 (`explosive`), 경장갑 (`light`), 스트라이커 (`striker`) |
| `bg-v2-attr-yellow` | `oklch(0.795 0.184 86.047)` | `oklch(0.852 0.199 91.936)` | 관통 (`piercing`), 중장갑 (`heavy`) |
| `bg-v2-attr-blue` | `oklch(0.623 0.214 259.815)` | `oklch(0.707 0.165 254.624)` | 신비 (`mystic`), 특수장갑 (`special`), 스페셜 (`special`) |
| `bg-v2-attr-purple` | `oklch(0.627 0.265 303.9)` | `oklch(0.714 0.203 305.504)` | 진동 (`sonic`), 탄력장갑 (`elastic`) |
| `bg-v2-attr-green` | `oklch(0.627 0.194 149.214)` | `oklch(0.792 0.209 151.711)` | 분해 (`chemical`), 복합장갑 (`composite`) |
| `bg-v2-attr-grey` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | 일반 (`normal`) |

Surface hierarchy:

- Dark: canvas is the darkest, then surface, then inset. Each step is brighter.
- Light: surface is the brightest. Canvas (0.97) and inset (0.955) are both light grays, with inset slightly darker than canvas. Light does not simply invert dark.
- Text tiers `fg`, `fg-secondary`, and `fg-tertiary` stay at 4.5:1 or higher on surface, canvas, inset, and hover backgrounds.

## Density tokens

Density tokens are spacing tokens in a plain `@theme` block. Plain `@theme` lets the media overrides reach utilities through `var()`. Do not move them into `@theme inline`.

| Token / utility | Desktop | 767px or narrower | `pointer: coarse` | Use |
|---|---|---|---|---|
| `py-v2-row-y` / `--spacing-v2-row-y` | 0.375rem | same | same | Row vertical padding |
| `px-v2-row-x` / `--spacing-v2-row-x` | 0.5rem | same | same | Row horizontal padding |
| `gap-v2-media-gap` / `--spacing-v2-media-gap` | 0.75rem | same | same | Thumbnail to text |
| `gap-v2-list-gap` / `--spacing-v2-list-gap` | 0.125rem | same | same | Between items |
| `gap-v2-group-gap` / `--spacing-v2-group-gap` | 1rem | same | same | Between groups inside a block |
| `p-v2-block-p` / `--spacing-v2-block-p` | 1.25rem | 1rem | same | Block padding |
| `gap-v2-block-gap` / `--spacing-v2-block-gap` | 0.75rem | 0.5rem | same | Between blocks |
| `gap-x-v2-column-gap` / `--spacing-v2-column-gap` | 2rem | same | same | Between columns (narrow layouts stack vertically) |
| `min-h-v2-row-min` / `--spacing-v2-row-min` | 2.25rem | 2.75rem | 2.75rem | Minimum row height |

## Numeric and date formats

- Use Tailwind's `tabular-nums` for every number, date, time, count, and remaining duration. Do not add a numeric-only utility.
- Dates and periods: `MM/DD ~ MM/DD`. Period with time: `MM/DD HH:mm ~ MM/DD HH:mm`.
- Remaining time: `N일 남음` for a running period, `N일 후 시작` for a future one.
- Counts: thousands separator, for example `1,234`.
- Comparison tables: right-align the date and figure columns so rows compare by digit position.

## Status and domain

- `success` is status. It means confirmed or completed.
- `live`, `favorite`, `new`, and `attr-*` are domain colors. They describe content, not state.
- Do not use color alone to convey meaning. Pair color with a text label or a distinct icon shape; an icon-only element (for example the favorite heart or the completed check) needs an accessible name.
- `attr-*` and `live` always carry a text label.
- Among recruitment labels, only `new` (신규) is colored. Other labels such as 한정 복각, 복각, and 배포 stay as `text-v2-on-media` text on the scrim.
- In dark mode, `live` and `attr-red` share the same value. Always show them with their labels.
- The light `attr-yellow` stripe has low contrast (about 1.68:1). The text label carries the meaning, so the stripe stays.

## Motion

- Duration and easing tokens are defined in a plain `@theme` block:
  - `duration-v2-fast` (120ms): press, hover, toggle.
  - `duration-v2-base` (200ms): popover, expand and collapse.
  - `duration-v2-slow` (300ms): screen transition, sheet.
  - `ease-v2-enter` `cubic-bezier(0, 0, 0, 1)`: entering (decelerate).
  - `ease-v2-exit` `cubic-bezier(0.3, 0, 1, 1)`: leaving (accelerate).
  - `ease-v2-standard` `cubic-bezier(0.2, 0, 0, 1)`: movement within the screen.
- Exit is one step shorter than enter. For example, a popover enters with `base` and `enter`, and exits with `fast` and `exit`.
- Animate only `transform` and `opacity`.
- Put `transform` animation inside `motion-safe:`.
- Under `prefers-reduced-motion: reduce`, the v2 base and slow durations become 120ms, and only fades remain. The 1.x `mllg-*` keyframes and view transitions are unchanged and are not overridden.
- Motion belongs to the 2.0 components, not to pages.

## Directory rules

- `app/components/v2/primitives/`: shared low-level pieces.
- `app/components/v2/layout/`: shared layout pieces.
- `app/components/v2/features/<domain>/`: domain UI reused across screens.
- 2.0 files must not import 1.x components (`~/components/primitives`, `~/components/features`, or the same locations through relative paths).
- Do not modify 1.x components to make them work with 2.0.

## Guard

`test/app/components/design-system-source-guard.test.ts` enforces these rules on:

- every `.ts`, `.tsx`, and `.css` file under `app/components/v2/`;
- every file listed in `migratedRouteFiles` in that test (migrated route files, relative to `app/`).

On those files, the guard rejects:

- imports of 1.x components, resolved by path, including relative paths that reach the same directories;
- Tailwind color utilities that are not `v2-` tokens: palette hues such as `red-500`, `white`, `black`, 1.x semantic colors such as `bg-card` and `text-muted-foreground`, and arbitrary color values;
- `duration-<number>` and arbitrary durations, `ease-linear`, `ease-in`, `ease-out`, `ease-in-out`, and arbitrary easings;
- literal colors in CSS or inline styles (`#hex`, `oklch(`, `rgb(`, `hsl(`), literal millisecond or second durations, and `cubic-bezier(`.
- 1.x color variables, including through `var()` (for example `bg-[var(--card)]` or `color: var(--muted-foreground)`). Only `v2-` tokens and non-color variables are allowed.

`transparent`, `current`, and `inherit` are allowed.

Exceptions go in `v2GuardExceptions` with a file, a pattern, and a reason. The list starts empty. Add an entry only when a violation is intentional and cannot be expressed with a token.

To bring a migrated route under the guard, add its path (relative to `app/`) to `migratedRouteFiles`. The same rules then apply to it.

## Not added yet

These tokens are not part of 2.0 yet. Add one only when a screen actually uses it:

- Surface: elevated or overlay surfaces.
- Text: disabled and inverse text.
- Interaction: primary action, selected, and disabled states.
- Status: info, warning, danger, and neutral.
- Domain: limited and fes recruitment colors, a role-only palette, star-grade colors, and any other domain color.
- Reading density, a data visualization palette, KPI size, and control height.
- Numeric: a numeric-only utility. `tabular-nums` covers it.
- Border and radius tokens. Keep the 1.x base radius (`rounded-md` to `rounded-lg`).

Do not add a token just because it would be useful later. Add it when a screen needs it.
