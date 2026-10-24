# Design system 2.0

Design system 2.0 (v2) is the shared visual language for screens migrated from the 1.x UI. It covers color, density, and motion tokens, the `app/components/v2/` layout, and the guard that keeps 2.0 code on its own rules.

The 2.0 foundation defines the tokens and rules. Migrated screens and shared components use those rules without changing the 1.x tokens or components that remain in use.

## Naming

- Every 2.0 token uses the `v2-` prefix: `--v2-*` raw variables, `--color-v2-*` theme entries, `--spacing-v2-*`, `--transition-duration-v2-*`, and `--ease-v2-*`.
- Utilities keep the prefix: `bg-v2-canvas`, `text-v2-fg-tertiary`, `ring-v2-focus`, `py-v2-row-y`, `gap-v2-block-gap`, `min-h-v2-row-min`, `duration-v2-base`, `ease-v2-enter`.
- The cleanup step (MLLG-121) removes the prefix and renames the tokens. Until then, do not drop the prefix or reuse these names for 1.x values.

## Color tokens

Color tokens are defined in `app/tailwind.css`. Raw `--v2-*` variables live in `:root` (light) and `.dark` (dark), and `@theme inline` exposes them as `--color-v2-*`. The 1.x pattern is the same.

| Token / utility | Light | Dark | Use |
|---|---|---|---|
| `bg-v2-canvas` | `oklch(0.97 0 0)` | `oklch(0.235 0 0)` | Page background |
| `bg-v2-surface` | `oklch(1 0 0)` | `oklch(0.27 0 0)` | Content blocks |
| `bg-v2-inset` | `oklch(0.955 0 0)` | `oklch(0.33 0 0)` | Secondary areas, attribute badge background, image placeholder |
| `divide-v2-divider`, `bg-v2-divider` | `oklch(0.92 0 0)` | `oklch(0.40 0 0)` | List dividers and timeline lines |
| `bg-v2-scrim` | `oklch(0 0 0 / 70%)` | `oklch(0 0 0 / 70%)` | Label chip on an image |
| `text-v2-fg` | `oklch(0.205 0 0)` | `oklch(0.985 0 0)` | Primary text |
| `text-v2-fg-secondary` | `oklch(0.439 0 0)` | `oklch(0.85 0 0)` | Secondary text, figures |
| `text-v2-fg-tertiary` | `oklch(0.52 0 0)` | `oklch(0.78 0 0)` | Types, labels, remaining time (text that must be read, 4.5:1 or higher) |
| `bg-v2-accent`, `text-v2-on-accent` | `oklch(0.53 0.13 252)` / `oklch(1 0 0)` | `oklch(0.74 0.11 250)` / `oklch(0.205 0 0)` | Accent fill and its foreground |
| `bg-v2-accent-subtle` | `oklch(0.955 0.03 250)` | `oklch(0.32 0.04 250)` | Subtle accent surface |
| `text-v2-link` | `var(--v2-accent)` | `var(--v2-accent)` | Underlined links in news post Markdown |
| `text-v2-on-media` | `oklch(1 0 0)` | `oklch(1 0 0)` | Text on a scrim |
| `bg-v2-favorite-neutral-badge` | `rgb(0 0 0 / 85%)` | same | Count badge on a student image when not personally favorited |
| `text-v2-fg-disabled` | `oklch(0.72 0 0)` | `oklch(0.56 0 0)` | Disabled text and icons (exempt from the 4.5:1 rule) |
| `bg-v2-elevated` | `oklch(1 0 0)` | `oklch(0.36 0 0)` | Floating action bars and dialogs. Brighter than surface in dark mode |
| `bg-v2-popover-surface` | `rgb(255 255 255 / 94%)` | `rgb(24 24 24 / 94%)` | Student quick-view popover surface |
| `ring-v2-popover-divider`, `border-v2-popover-divider` | `rgb(0 0 0 / 18%)` | `rgb(255 255 255 / 22%)` | Quick-view outline and action divider |
| `bg-v2-nav` | `oklch(0.945 0 0)` | `oklch(0.205 0 0)` | Shared navigation shell surface. Tertiary-label contrast: 4.69:1 light, 8.95:1 dark; offset focus-ring contrast: 3.20:1 light, 6.79:1 dark (measured) |
| `bg-v2-nav-active` | `oklch(0.89 0 0)` | `oklch(0.30 0 0)` | Selected navigation row and collapsed active group |
| `bg-v2-unread`, `text-v2-on-unread` | `oklch(0.577 0.245 27.325)` / `oklch(1 0 0)` | `oklch(0.704 0.191 22.216)` / `oklch(0.205 0 0)` | Navigation unread dots and count pills. Pill text contrast: 4.76:1 light, 6.19:1 dark (measured) |
| `bg-v2-banner-red`, `text-v2-banner-red-fg` | `oklch(0.95 0.025 25)` / `oklch(0.39 0.14 25)` | `oklch(0.30 0.06 25)` / `oklch(0.86 0.10 25)` | Red SiteBanner fill and text; contrast 8.83:1 light, 8.45:1 dark (measured) |
| `bg-v2-banner-green`, `text-v2-banner-green-fg` | `oklch(0.95 0.025 150)` / `oklch(0.4 0.11 150)` | `oklch(0.30 0.05 150)` / `oklch(0.86 0.09 150)` | Green SiteBanner fill and text; contrast 7.64:1 light, 9.03:1 dark (measured) |
| `bg-v2-banner-blue`, `text-v2-banner-blue-fg` | `oklch(0.97 0.018 237)` / `oklch(0.48 0.12 240)` | `oklch(0.30 0.05 240)` / `oklch(0.86 0.08 235)` | Blue SiteBanner fill and text; contrast 5.86:1 light, 8.98:1 dark (measured; light values follow the approved mockup) |
| `bg-v2-banner-pink`, `text-v2-banner-pink-fg` | `oklch(0.95 0.025 340)` / `oklch(0.4 0.12 340)` | `oklch(0.30 0.05 340)` / `oklch(0.86 0.08 340)` | Pink SiteBanner fill and text; contrast 8.42:1 light, 8.82:1 dark (measured) |
| `bg-v2-banner-black`, `text-v2-banner-black-fg` | `oklch(0.89 0 0)` / `oklch(0.35 0 0)` | `oklch(0.30 0 0)` / `oklch(0.90 0 0)` | Neutral SiteBanner fill and text; contrast 8.13:1 light, 10.12:1 dark (measured) |
| `bg-v2-backdrop` | `oklch(0 0 0 / 30%)` | `oklch(0 0 0 / 55%)` | Sheet backdrop |
| `bg-v2-highlight` | accent at 16% | accent at 20% | Emphasis overlay for programmatic panel and featured-content targets |
| `text-v2-info` | `var(--v2-accent)` | `var(--v2-accent)` | Information status text; separate semantic token with the link color |
| `bg-v2-ai-gradient` | `linear-gradient(135deg, oklch(0.623 0.214 259.815), oklch(0.606 0.25 292.717))` | `linear-gradient(135deg, oklch(0.707 0.165 254.624), oklch(0.702 0.183 293.541))` | AI mark, input focus glow, and working halo only |
| `shadow-v2-ai-glow` | `0 0 1.25rem oklch(0.606 0.25 292.717 / 16%)` | `0 0 1.25rem oklch(0.702 0.183 293.541 / 24%)` | AI input focus glow |
| `animate-v2-ai-working` | `v2-ai-working 2s ease-in-out infinite` | same | AI working halo; stopped by reduced motion |
| `text-v2-dev-accent`, `bg-v2-dev-accent` | `oklch(0.623 0.214 259.815)` | same | Blue emphasis and illustration accents on the developers introduction. Tint with `/5`, `/10`, or `/25` when the surface needs a lighter treatment |
| `bg-v2-dev-accent-strong` | `oklch(0.515 0.215 263.6)` | same | Developers introduction CTA fill; supports white text in normal and hover states |
| `text-v2-dev-on-accent` | `oklch(0.985 0 0)` | same | Text and icons on a developers introduction accent fill |
| `shadow-v2-dev-shadow` | `oklch(0 0 0)` | same | Developers introduction diagram node shadows only; use `/5` in light mode and `/20` in dark mode to preserve the approved shadow strength |
| `shadow-v2-marker` | `inset 0 0 0 1px var(--v2-marker-shade), 0 0 0 1px var(--v2-marker-light)` (fixed: `oklch(0.2 0 0 / 80%)` and `oklch(1 0 0 / 90%)`) | same | Recognized-cell marker over a game screenshot: a dark inner ring and a light outer ring, so the marker stays visible on any screenshot. The screenshot colors do not follow the theme, so the rings are fixed. Pair with `border-2 border-v2-focus bg-v2-highlight`. |
| `bg-v2-hover` | `oklch(0.205 0 0 / 5%)` | `oklch(1 0 0 / 7%)` | Transparent hover fill for unfilled rows and controls; overlay on filled controls |
| `bg-v2-filled-hover` | `oklch(0.94 0 0)` | `oklch(0.37 0 0)` | Opaque hover fill for inset buttons and rows |
| `border-v2-control-border` | `oklch(0.968 0 0)` | `oklch(0.388 0 0)` | Idle boundary for text inputs, selects, textareas, and grouped inputs. The value is the former 40% border over `bg-v2-surface`, made opaque; do not add an opacity modifier. Not for cards, buttons, or region separation. |
| `border-v2-control-border-strong`, `ring-v2-control-border-strong` | `oklch(0.92 0 0)` | `oklch(0.55 0 0)` | Focused input boundary (paired with the focus ring), hover boundary, popover ring, and the upload drop zone. |
| `bg-v2-switch-off` | `oklch(0.64 0 0)` | `oklch(0.56 0 0)` | Switch off-track fill (3:1 against surface). Not for text or input borders. |
| `ring-v2-focus`, `outline-v2-focus` | `var(--v2-accent)` | `var(--v2-accent)` | Focus ring, 2px with 2px offset (3:1 or higher) |
| `text-v2-success` | `oklch(0.527 0.154 150.069)` | `oklch(0.792 0.209 151.711)` | Confirmed pill text and completed icons |
| `bg-v2-success-subtle` | `oklch(0.982 0.018 155.826)` | `oklch(0.31 0.065 152.934)` | Success pill background |
| `text-v2-danger` | `oklch(0.505 0.213 27.518)` | `oklch(0.704 0.191 22.216)` | Status: label of a danger `PanelAction` on `bg-v2-danger-subtle`. Failure states (upload expired, recognition failed, failed file) also use it (D5). 4.5:1 or higher on subtle, surface, and canvas |
| `bg-v2-danger-subtle` | `oklch(0.971 0.013 17.38)` | `oklch(0.31 0.092 26.042)` | Status: background of a danger `PanelAction`, and of a failed value in a review table. Text on it: 8.4:1 light, 5.2:1 dark (measured) |
| `bg-v2-danger-solid`, `text-v2-on-danger` | `oklch(0.552 0.205 24.53)` / `oklch(1 0 0)` | `oklch(0.586 0.201 26.79)` / `oklch(1 0 0)` | Filled destructive `Button` (`danger`): GitHub Primer `bgColor-danger-emphasis` (#cf222e light / #da3633 dark) with white text. Measured contrast: rest 5.36:1 light and 4.61:1 dark; hover at 90% opacity 4.73:1 on the light surface (#fff) and 5.25:1 on the dark surface (`oklch(0.27 0 0)`), blended in sRGB gamma space |
| `bg-v2-warning-subtle` | `oklch(0.965 0.05 95)` | `oklch(0.33 0.07 75)` | Status: background of a value that needs confirmation (D6). The text on it keeps `text-v2-fg` (16.8:1 light, 18.0:1 dark, measured). The tone is the background only; the label carries the meaning |
| `text-v2-live`, `bg-v2-live` | `oklch(0.505 0.213 27.518)` | `oklch(0.704 0.191 22.216)` | In-progress dot and label (domain) |
| `text-v2-favorite` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Favorite heart (domain). Red, the same hue family as live; the heart shape carries the meaning |
| `text-v2-warning` | `oklch(0.55 0.163 48.998)` | `oklch(0.828 0.189 84.429)` | Ending soon, recruitment-period caution, and a restriction notice. Pair with a clock icon and text, semibold |
| `text-v2-perk` | `oklch(0.52 0.105 223.128)` | `oklch(0.865 0.127 207.078)` | Benefit, such as a free-recruit special case. Pair with a star icon and text, semibold |
| `bg-v2-selected`, `text-v2-on-selected` | `oklch(0.205 0 0)` / `oklch(1 0 0)` | `oklch(0.985 0 0)` / `oklch(0.205 0 0)` | Selected filter chip (interaction state, not a status color). Filled dark in light mode, filled light in dark mode |
| `text-v2-new` | `oklch(0.905 0.182 98.111)` | `oklch(0.905 0.182 98.111)` | "New" label on a scrim (domain) |
| `bg-v2-attr-red` | `oklch(0.637 0.237 25.331)` | `oklch(0.704 0.191 22.216)` | 폭발 (`explosive`), 경장갑 (`light`), 스트라이커 (`striker`) |
| `bg-v2-attr-yellow` | `oklch(0.795 0.184 86.047)` | `oklch(0.852 0.199 91.936)` | 관통 (`piercing`), 중장갑 (`heavy`) |
| `bg-v2-attr-blue` | `oklch(0.623 0.214 259.815)` | `oklch(0.707 0.165 254.624)` | 신비 (`mystic`), 특수장갑 (`special`), 스페셜 (`special`) |
| `bg-v2-attr-purple` | `oklch(0.627 0.265 303.9)` | `oklch(0.714 0.203 305.504)` | 진동 (`sonic`), 탄력장갑 (`elastic`) |
| `bg-v2-attr-green` | `oklch(0.627 0.194 149.214)` | `oklch(0.792 0.209 151.711)` | 분해 (`chemical`), 복합장갑 (`composite`) |
| `bg-v2-attr-grey` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | 일반 (`normal`) |

Surface hierarchy:

- Dark v2 surfaces: canvas is the darkest, then surface, then inset. Each step is brighter.
- The shared desktop NavigationBar uses `bg-sidebar`; its dark surface (0.215) is slightly darker than the v2 canvas (0.235).
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
| `min-h-v2-row-min` / `--spacing-v2-row-min` | 2.25rem | 2.75rem | 2.75rem | Minimum row height. List rows only (futures, home, panels, tabs, switches). Do not use it for controls |
| `min-h-v2-control-min` / `--spacing-v2-control-min` | 2rem | 2.5rem | 2.5rem | Minimum button hit area (`Button`). 32px on desktop, 40px on stacked layouts and coarse pointers. The visible button stays 32px (`size="md"`) or 28px (`size="sm"`) on every layout; an invisible pseudo-element extends the hit area. Render button-styled links with `v2ButtonClassName` instead of copying the classes, and use `size` instead of height overrides |
| `min-h-v2-input-min` / `--spacing-v2-input-min` | 2rem | 2.25rem | 2.25rem | Number and select inputs. 36px on stacked layouts and coarse pointers |

## Button variants

- `text` is a secondary action with a hover background. `link` is an inline add or secondary action aligned to a field edge: it has no horizontal padding or hover background, and hover changes only the text color.

## Numeric and date formats

- Use Tailwind's `tabular-nums` for every number, date, time, count, and remaining duration. Do not add a numeric-only utility.
- Dates and periods: `MM/DD ~ MM/DD`. Period with time: `MM/DD HH:mm ~ MM/DD HH:mm`.
- Past records whose year may differ, such as a news post date: `YYYY/MM/DD`.
- Remaining time: `N일 남음` for a running period, `N일 후 시작` for a future one.
- Counts: thousands separator, for example `1,234`.
- Comparison tables: right-align the date and figure columns so rows compare by digit position.

## Status and domain

- `success` is status. It means confirmed or completed.
- `danger` is status. Use it only to clear or revert an applied filter, selection, or input, or for a destructive action. Always pair it with a verb label, such as "초기화". Show the action only when there is something to clear. `danger` shares values with `live` and `attr-red`, but it is a separate token because the meaning differs.
- The v2 `Button` `danger` variant is for destructive actions that need a strong red fill, such as deleting a key, application, or connection. The `danger-subtle` variant is for reversible reset, cancel, or exclusion actions. Keep `PanelAction` and status notices on `text-v2-danger` and `bg-v2-danger-subtle`.
- `neutral` `PanelAction` is for helper actions that do not clear state, such as "모두 보기". Do not use `danger` for them.
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
- `app/components/v2/layout/navigation/`: the shared 2.0 navigation shell and its menu catalog, icons, tutorial key, and banner.
- `app/components/v2/features/<domain>/`: domain UI reused across screens.
- 2.0 files must not import 1.x components (`~/components/primitives`, `~/components/features`, or the same locations through relative paths).
- Do not modify 1.x components to make them work with 2.0.

## Shared navigation shell

The root shell imports `NavigationBar` and `SiteBanner` from `app/components/v2/layout/navigation/`. The folder contains the expanded sidebar, rail, flyout, menu rows, account and notification popovers, search popup, mobile brand bar and bottom navigation, tutorial, and SiteBanner. The expanded sidebar hides the native scrollbar and overlays a draggable thumb without reserving layout width; the thumb updates on scroll, resize, and content changes and fades instantly for reduced-motion users. `navigation-menu.ts` remains the catalog used by the shell, `/more`, and the search API; moving it does not change its data or behavior.

The sidebar, rail, mobile brand bar, and bottom navigation use `bg-v2-nav`. Active navigation rows use `bg-v2-nav-active`; unread dots and count pills use `bg-v2-unread` with `text-v2-on-unread` for pill text. These navigation surfaces are flat, with no decorative border, shadow, blur, or sidebar width transition. The existing `--mobile-*` values and root content container remain unchanged.

SiteBanner uses a flat preset fill in every slot. Its red, green, blue, pink, and black pairs are the `bg-v2-banner-{preset}` and `text-v2-banner-{preset}-fg` tokens above. Their text contrast was measured in both themes and is at least 5.86:1. The shell uses `SenseiAvatar`, v2 `StudentPortrait`, `Switch`, `Skeleton`, `StatusNotice`, and `FeatureHint`; rail flyouts keep their side placement in the shell and use the v2 popover surface.

Two shell actions intentionally use the existing semantic text colors: account logout uses `text-v2-danger` without a filled background, and notification action links use underlined `text-v2-link`. On the popover surface, logout contrast measures 6.36:1 light and 6.12:1 dark; notification-link contrast measures 5.12:1 light and 9.77:1 dark. Route changes close the shell overlays; Escape closes them and returns focus to the trigger.

## Guard

`test/app/components/design-system-source-guard.test.ts` enforces these rules on:

- every `.ts`, `.tsx`, and `.css` file under `app/components/v2/`;
- every file listed in `migratedRouteFiles` in that test (migrated route files, relative to `app/`).

On those files, the guard rejects:

- imports of 1.x components, resolved by path, including relative paths that reach the same directories;
- Tailwind color utilities that are not `v2-` tokens: palette hues such as `red-500`, `white`, `black`, 1.x semantic colors such as `bg-card` and `text-muted-foreground`, and arbitrary color values;
- `duration-<number>` and arbitrary durations, `ease-linear`, `ease-in`, `ease-out`, `ease-in-out`, and arbitrary easings;
- literal colors in CSS or inline styles (`#hex`, `oklch(`, `rgb(`, `hsl(`), literal millisecond or second durations, and `cubic-bezier(`.
- 1.x color variables, including through `var()` or the `prefix-(--name)` shorthand (for example `bg-[var(--card)]`, `bg-(--card)`, or `color: var(--muted-foreground)`). Only `v2-` tokens and non-color variables are allowed.

`transparent`, `current`, and `inherit` are allowed.

Exceptions go in `v2GuardExceptions` with a file, a pattern, and a reason. The list starts empty. Add an entry only when a violation is intentional and cannot be expressed with a token.

To bring a migrated route under the guard, add its path (relative to `app/`) to `migratedRouteFiles`. The same rules then apply to it.

## Layout

Layout parts live in `app/components/v2/layout/`. A screen composes the regions it needs. Header, Toolbar, Main, and Aside are the regions. `V2Page` is the root.

```tsx
<V2Page width="reading" panelRequest={panelRequest} panelCloseRequest={panelCloseRequest} onPanelCloseRequestHandled={() => setPanelCloseRequest(null)}>
  <PageHeader back={{ title: "미래시", to: "/futures" }} title="하안 바다의 기억 (복각)" meta={<span>진행 중 · 10/08 ~ 10/22</span>} />
  <PageToolbar>
    <ScreenTabs items={tabs} />
  </PageToolbar>
  <PageMain>{/* the screen's content, including its loading, empty, and failure states */}</PageMain>
  <PageAside>{/* omit this element for a screen with no Aside */}</PageAside>
  <MobileActionBar links={links} panels={panels} />
</V2Page>
```

- DOM order is Header, Toolbar, Main, Aside. On side-by-side the Aside sits left of Main, placed by grid areas. The opt-in responsive screen navigation recipe below places Aside before Main so desktop navigation and related links precede the body in keyboard order.
- Omit `PageAside` and there is no Aside column and no reserved space.
- Side-by-side starts at 48rem of the `@container/page-available` content box (root.tsx). The Aside is 16rem below 64rem and 18rem from 64rem. `V2Page` measures its own width with ResizeObserver to know the mode for JavaScript behavior, such as where a panel body mounts.
- Header holds the back link, title, description (max-prose), and meta. It sits above Main with one group-gap of top padding and spans the full width, so the title x matches across recipes with and without an Aside.
- Toolbar is sticky on stacked layouts. Use `stickyOnDesktop` only for data tables.
- `MobileActionBar` is fixed at the bottom on stacked layouts and hidden on side-by-side. It lists link items, then panel entries. A screen that has its own bottom action bar hides it (for example, a review step) by its own state, and the stacked action bar then returns when that step ends.
- `PageHeader` takes an optional `trailing` block (for example, a quota summary). When it is passed, the block sits beside the title on `@min-[60rem]/page-available` and aligns to the top, and below the description otherwise. A page without `trailing` renders exactly as before.

### Width rules

| `width` | Main | Root `data-page-max-width` |
|---|---|---|
| `reading` | At most 48rem (`max-w-3xl`), left aligned | `default` |
| `wide` | Fills the available width | `wide` (root caps the page at `max-w-screen-2xl`) |
| `full` | Fills the available width | `full` (passed through, no cap) |

### Behavior parts

- **ScreenTabs:** link mode (`link`, `linkState`) sets `aria-current="page"`. onClick mode (`onClick`) sets `aria-pressed`. A `disabled` tab does not navigate and shows `disabledReason` as `title` and visually hidden text. `hiddenStacked` hides a tab on stacked layouts. `label` shows a count.
- **Responsive screen navigation:** `ScreenNavigation` renders shared route items as a vertical link list inside Aside. `ScreenNavigationToolbar` adapts the same items to the existing horizontal `ScreenTabs` only while stacked. Both use the same `ScreenTabItem` meaning and item renderer. These are ordinary links with `aria-current`, not a tab widget; keyboard users follow normal Tab and Enter behavior.
- **PanelSheet:** on side-by-side the panel is in the Aside (collapsible, `defaultExpanded`). On stacked it opens a sheet when open. Program requests use `panelRequest={{ panelId, requestId }}`, with a new `requestId` per request. Close with `panelCloseRequest`, a number to increment, and `onPanelCloseRequestHandled`. A desktop request expands the panel, scrolls it fully into view, and highlights it without moving focus. A stacked request opens the sheet. A location change or a switch to side-by-side closes an open sheet. A disabled panel never opens a sheet, and its `MobileActionBar` trigger is disabled.
- **AsideLinks and MobileActionBar links:** `to` starting with `http` opens in a new window (`target="_blank"`, `rel="noopener noreferrer"`). `onClick` without `to` renders a button. `transition` (`forward`, `reverse`, `crossfade`) sets the screen transition for route navigation. `preventScrollReset` is passed to the router link.
- **PanelAction:** a text action in a panel header, beside the title. It does not change the header row height, so showing or hiding it never moves the panel. When an action hides itself after use (for example 초기화 once the filters are reset), move focus to the panel heading or the first control so keyboard focus is not lost.
- **MobileActionBar panels:** each `panelId` must match a `PanelSheet` in the same page's `PageAside`. The bar opens that panel's sheet.

### Responsive screen navigation (opt-in)

Use this recipe when a screen group needs vertical navigation on side-by-side layouts and the existing horizontal tabs on stacked layouts. Pass one `ScreenTabItem[]` to both navigation components.

```tsx
<V2Page width="wide">
  <PageHeader title="몰루로그 API" />
  <ScreenNavigationFocusScope>
    <ScreenNavigationToolbar items={items} />
    <PageAside>
      <ScreenNavigation items={items} />
      <AsideLinks items={historyLinks} />
    </PageAside>
  </ScreenNavigationFocusScope>
  <PageMain>{/* screen content */}</PageMain>
  <MobileActionBar links={mobileHistoryLinks} />
</V2Page>
```

- The page root and `V2Page` keep the existing 48rem page-container breakpoint. The Aside remains in server-rendered markup and the existing layout CSS hides it while stacked. `ScreenNavigationToolbar` keeps the same sticky mobile tabs and mounts `ScreenTabs` only while stacked, so its initial indicator measurement and active-item scroll run after it becomes visible.
- Keep the toolbar and Aside inside `ScreenNavigationFocusScope`. It adds no DOM wrapper; when a focused navigation item is replaced by its responsive counterpart, focus moves to the matching item with scroll prevention. Focus in the body or another control remains there, and initial layout measurement never moves focus.
- At 48rem and wider, `PageToolbar stackedOnly` hides both its toolbar and measurement sentinel. The opt-in page grid removes the toolbar row so Aside and Main start together below the Header. Other `PageToolbar` users retain their existing layout.
- The desktop navigation and history links precede Main in the DOM. On stacked layouts the Aside is hidden, so the existing toolbar tabs, Main, and bottom action bar retain their normal order.
- Server output initially includes both navigation forms because `V2Page` starts in stacked mode. CSS exposes only the form for the current container width before hydration; the first measurement then mounts or unmounts the toolbar tabs to match the same breakpoint. Resizing back to stacked remounts the existing `ScreenTabs` behavior.
- Active desktop links use an inset surface and semibold text; the inset surface remains on hover. Navigation items keep the shared link, disabled, state-button, label, and crossfade behavior. Use the recipe only on screens that need this responsive arrangement.

## Transitions

Route transitions and state transitions go through the helper in `screen-transition.ts`. Screens do not write transition code.

| Kind | Used by | Motion |
|---|---|---|
| `forward` | Entering a detail | New Main slides in from `translateX(3rem)` and fades in (`slow`, `enter`). The previous Main slides out to `translateX(-3rem)` and fades out (`base`, `exit`). |
| `reverse` | Going back | The mirror of forward. |
| `crossfade` | Same-tier tabs (link or onClick) | Main fades (`base`, `enter` in; `fast`, `exit` out). Header and Toolbar stay still. The tab indicator moves (`base`, `standard`). |

- For link tabs, the tab bar moves between routes only when `ScreenTabs` stays mounted across them. Put the tabs in a shared parent layout route. Otherwise the new route renders the bar in place, without the move.
- Browser back (POP) gets no 2.0 transition.
- The Sheet slides up (`slow`, `enter`) with a backdrop fade. It closes with `base`, `exit`.
- A panel body fades in and slides `translateY(-0.25rem)` (`base`, `enter`). Collapsing fades out (`fast`, `exit`). The chevron rotates. Height is not animated, so the blocks below move at once when a panel collapses.
- A panel or featured-content target highlight fades an overlay in and out over `slow` times 4.
- `prefers-reduced-motion: reduce` removes all translation and keeps the fades.
- Only `transform` and `opacity` animate. Animations use the v2 `duration-v2-*` and `ease-v2-*` tokens.

The helper sets `data-v2-transition` (`forward`, `reverse`, `crossfade`) on `<html>` during the transition:

- `getV2LinkTransitionProps(kind, onClick?)` spreads onto a React Router `Link`. Route navigation uses React Router's `viewTransition`. The attribute clears 400ms after the navigation commits, or 30s after arming if it never commits. Arming a newer transition cancels the older one's timers, so a stale timer never clears a newer kind.
- `runV2BackNavigation(navigateBack)` wraps the header back action (`PageHeader` `back.onClick`, for example `() => navigate(-1)`). It arms `reverse` and runs the router navigation. React Router owns that view transition, so the helper never calls `startViewTransition`. A browser POP that the back action did not start carries no kind.
- `runV2StateTransition(kind, update)` wraps an onClick state update (`crossfade`), applied synchronously inside the transition. It is the only direct `startViewTransition` call in the layout.

Without View Transition support or when the document is hidden, each helper updates at once.

## Recipes

Each recipe shows the parts that matter. Omit `PageAside` for a recipe with no Aside. The screen renders its own loading, empty, and failure states in Main (guideline 7).

### Hub and dashboard (wide, Aside on the left)

```tsx
<V2Page width="wide" panelRequest={panelRequest} panelCloseRequest={panelCloseRequest} onPanelCloseRequestHandled={() => setPanelCloseRequest(null)}>
  <PageHeader title="미래시" description="일본 서버를 바탕으로 추정된 일정" />
  <PageToolbar>
    <ScreenTabs
      items={[
        { key: "timeline", text: "타임라인", label: "24", Icon: CalendarDaysIcon, active: true, link: "/futures" },
        { key: "list", text: "목록", label: "24", Icon: ListBulletIcon, link: "/futures/list" },
        { key: "table", text: "일정표", Icon: TableCellsIcon, link: "/futures/table", hiddenStacked: true },
        { key: "past", text: "지난 일정", Icon: ClockIcon, disabled: true, disabledReason: "지난 일정은 준비 중입니다" },
      ]}
    />
  </PageToolbar>
  <PageMain>{/* items link to the detail with transition="forward" */}</PageMain>
  <PageAside>
    <PanelSheet panelId="filter" title="컨텐츠 필터" Icon={FunnelIcon} headerAction={filtersChanged ? <PanelAction variant="danger" onClick={clearFilters}>초기화</PanelAction> : null}>
      {/* filter controls */}
    </PanelSheet>
    <PanelSheet panelId="display" title="표시 설정" Icon={Cog6ToothIcon} collapsible>
      {/* display controls */}
    </PanelSheet>
    <AsideLinks items={[{ key: "calc", title: "픽업 확률 계산기", description: "천장까지 필요한 청휘석", Icon: CalculatorIcon, to: "/tools/calc" }]} />
  </PageAside>
  <MobileActionBar
    links={[{ key: "calc", title: "픽업 확률 계산기", shortTitle: "계산기", Icon: CalculatorIcon, to: "/tools/calc" }]}
    panels={[{ panelId: "filter", title: "컨텐츠 필터", shortTitle: "필터", Icon: FunnelIcon }]}
  />
</V2Page>
```

### Detail (reading, Aside on the left)

```tsx
<V2Page width="reading">
  <PageHeader back={{ title: "미래시", to: "/futures" }} title="하안 바다의 기억 (복각)" meta={<span>진행 중 · 이벤트</span>} />
  <PageToolbar>
    <ScreenTabs
      items={[
        { key: "overview", text: "개요", Icon: ClockIcon, active: true, link: "/events/1" },
        { key: "calc", text: "상성 계산기", Icon: CalculatorIcon, link: "/events/1?tab=calc" },
        { key: "flip", text: "카드 뒤집기", Icon: TableCellsIcon, disabled: true, disabledReason: "준비 중입니다" },
      ]}
    />
  </PageToolbar>
  <PageMain>{/* detail sections */}</PageMain>
  <PageAside>
    <AsideLinks items={[{ key: "notice", title: "이벤트 공지", description: "공지 원문 보기", Icon: BellIcon, to: "https://example.com/event" }]} />
  </PageAside>
</V2Page>
```

### Form (reading, no Aside)

```tsx
<V2Page width="reading">
  <PageHeader back={{ title: "뒤로", onClick: () => navigate(-1) }} title="계산기" description="입력 값을 바탕으로 계산합니다" />
  <PageMain>
    <form className="flex flex-col gap-v2-block-gap rounded-lg bg-v2-surface p-v2-block-p">{/* fields */}</form>
  </PageMain>
</V2Page>
```

### Data table (wide, sticky toolbar on desktop)

```tsx
<V2Page width="wide">
  <PageHeader title="역대 추이" description="시즌별 통계" />
  <PageToolbar stickyOnDesktop>
    <ScreenTabs items={[{ key: "table", text: "표", Icon: TableCellsIcon, active: true, onClick: () => {} }]} />
  </PageToolbar>
  <PageMain>
    <table className="w-full rounded-lg bg-v2-surface text-sm">{/* numeric columns right-aligned with tabular-nums */}</table>
  </PageMain>
</V2Page>
```

## Not added yet

These tokens are not part of 2.0 yet. Add one only when a screen actually uses it:

- Text: inverse text.
- Interaction: primary action state.
- Status: info and neutral.
- Domain: limited and fes recruitment colors, a role-only palette, star-grade colors, and any other domain color.
- Reading density, a data visualization palette, and KPI size.
- Numeric: a numeric-only utility. `tabular-nums` covers it.
- Radius tokens. Keep the 1.x base radius (`rounded-md` to `rounded-lg`).

Do not add a token just because it would be useful later. Add it when a screen needs it.

## Parts added in the scanner migration (MLLG-124)

The scanner screen (`/scanner`) is the first 2.0 screen that uses these parts. Each lives in the folder shown.

- `primitives/ProgressBar`: a native `progress` with a status tone (`default`, `warning`, `danger`). Its visible value text belongs to the parent.
- `primitives/Checkbox`: a labeled native checkbox with the 2.0 focus ring.
- `primitives/NumberInput`: a numeric input at `min-h-v2-input-min`, with a 28px `compact` size for grouped scanner review fields. `warning` sets the subtle warning background, and the text keeps the default color. Flow navigation props from `use-number-input-flow-navigation` spread onto it.
- `primitives/use-number-input-flow-navigation`: a copy of the 1.x hook for 2.0 code. The 1.x hook stays for the screens that still use it.
- `primitives/StatusNotice`: one status line with an icon and text. `danger` is announced as an alert, and `warning` and `neutral` as a status. Color is never the only signal.
- `primitives/Dialog`: a modal on Headless UI with the 2.0 backdrop, for a full-size image or a confirmation.
- `layout/PageActionBar`: a bottom action bar for a step's primary and secondary actions. `placement="sticky"` (the default) stays at the bottom of `PageMain` on desktop. `placement="fixed"` pins it on stacked layouts above the mobile navigation bar (`--mobile-nav-height`, and at the viewport bottom from `lg`), and the screen then adds bottom padding so the bar does not cover the last content. The summary text previews what the primary action will do. `expandActions` makes the actions fill the row on mobile, with the last (primary) action taking the rest.
- `features/scanner/*`: the scanner's presentation parts. `ScannerQuota` (the quota block and its meter, with loading, error, exhausted, low, and normal states), `ScannerStepHeader` (the four-step indicator, its title line, and an optional action), `ScannerFileStatusList`, `ScannerJobList`, `ScannerEndBlock`, `ScannerCompletionSummary`, `ScannerFailureNotice` (a failed file during recognition: a danger icon and secondary text, with a divider above), and `ScannerJobStatusNotice` (a failed job status read: a transient failure offers a retry, a missing job offers only a new upload).
- `features/resources/ResourceThumb`: an item image with a labeled neutral placeholder when there is no image.
- `features/students/StudentThumb`: the portrait with its favorite label. `onOpen` is optional: with it the thumbnail is a button for the quick panel, and without it the thumbnail is a non-interactive element with no button role and no focus. `showCaption={false}` hides the name below it for layouts that show the name beside the portrait.
- Scanner completion lists use v2 `StudentThumb` cards without recruitment labels; clicking a student opens a popover with the detail-page link. Item completion uses v2 `ResourceThumb` with a quantity label and a popover for the full item name and exact quantity.
- `features/students/TierInput`: a growth-tier control. The visible face is "★n" up to 5, and the exclusive weapon icon with its level after 5 (the `GrowthTier` pattern), in a box with the `NumberInput` size, border, and warning background. Its button joins the `use-number-input-flow-navigation` flow and opens a v2 popover for tier selection. Tiers below the initial tier are disabled.
- `features/feedback/FeedbackSheet`: the v2 feedback sheet. It posts the same `/contact` request as the 1.x `FeatureFeedbackButton`. The 1.x button stays for the walkthrough timeline.

### Failure and status rules used by the scanner

- A failure (an expired upload, a failed recognition, a failed file, an unreadable result) uses `text-v2-danger` with an icon and a text label. Do not show an internal error code or a placeholder value for it.
- A value that needs confirmation uses `bg-v2-warning-subtle` as its background. Its text keeps the default color. In the student review, the background and the review-required filter use one predicate (`fieldNeedsReview`): an unconfirmed failure, a low-accuracy read, or a decreased value. Confirmed values matching the saved value use quieter text while retaining the same editable control.
- A step that is waiting shows its status line only. It has no progress bar until work has started.
- A step's live region is the title and status line, so a change is announced once.
- A job shows exactly one step body: the upload, waiting, review, unavailable result, completion, or terminal body. `getScannerStepBody` chooses it from the job state, so no two bodies render together.

### Exception: compact row actions in the student review

The student review's row actions ("인식 화면" and "반영 제외") have a subtle border and background so they read as controls beside the student's static name. The desktop table uses a compact `min-h-6` height; stacked student cards use `min-h-8`. Do not use the compact size for other controls. A single note above the review explains that numbers below inputs are saved values, shown only when the recognized value is lower. Mobile cards place each field-group heading above the values and join each group's 28px inputs in one bordered control, using the full card width. Equipment labels use each student's equipment names, and the ability group follows the game's `능력 개방` / `체력` / `공격력` / `치유력` names.
