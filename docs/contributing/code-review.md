# Code Review

Review the actual change scope and current code state. This checklist identifies
concrete defects that block approval; [verification](./verification.md) is the
single owner for commands and claim-to-evidence mapping.

## Principles

- Start with the relevant `git diff`, baseline, and runtime state when the change
  depends on one.
- Resolve concrete `must-fix` findings before approval.
- Leave inline comments where possible and settle the final judgment in one
  review.
- Leave automatic style fixes to tooling; focus on behavior, structure,
  accessibility, and regression risk.
- A user-led redesign is not automatically an agent defect, but a concrete
  current bug or regression cannot be waived as taste.

## Must fix

### Requirements and correctness

- Does the implementation satisfy the approved task and preserve the latest
  decision's meaning?
- For a changed user-visible screen, does it meet the approved hierarchy,
  grouping/density, representative-state, and existing-control criteria? A
  concrete deviation from approved criteria is must-fix; an unrelated taste
  preference is not a defect.
- Are prop, state, and query fields connected to rendering and behavior?
- Does the sort or condition used on screen match the actual data query?
- Are real failures distinct from absent data, with no fake successful state or
  raw internal error exposed to users?
- Does a student search match `altNames` as well as the name, through
  `filterStudentByName` in `app/filters/student.ts`, and does its loader or
  view pass `altNames` to the screen? Sensei search students by their common
  nicknames.

### Data and state

- Do the route and its UI fetch only the data they need?
- Does a child avoid re-fetching data the parent already has?
- Are sort/display fields such as `createdAt` and `updatedAt` present where the
  behavior requires them?
- Are retry, draft, and save states preserved according to the changed flow?
  A failed save keeps the draft it started from. A draft keeps every value the
  editor can hold, including what the save still refuses (an unfinished step, a
  text over its limit), so reading it back never drops the whole draft. The
  server validator accepts every structure the editor can produce.
- Does text cut to a length, such as a preview, cut by code point
  (`Array.from`), not by UTF-16 index? An emoji split at the cut leaves a lone
  surrogate, which PostgreSQL's `jsonb` rejects.
- Can a save overwrite a newer value? A screen that saves values it read earlier
  checks that the record has not changed since, not only that it still exists.
  An autosave compares a new value with the newest one already sent or waiting,
  not with the last saved one, and keeps a waiting save, its status, and its
  retry per target, so no input is dropped and one target's success does not
  hide another's failure. Its state lives in a component that a loading state
  does not unmount. Saves that share one fetcher, such as an order and a
  sort choice, are sent one at a time, with the latest waiting change of each
  kind: a new submit cancels the request in flight only in the browser, so the
  server can still apply the earlier one after the later one, and the earlier
  one's failure is never seen. A save sent later than the input, such as after a delay,
  names its route action explicitly. Without one, React Router posts it to
  whichever page is current when it is sent, so a Sensei who leaves the page
  first loses the edit.
- Does a screen that shows records saved on another screen, such as
  relationship targets or favorited pickups, resolve them through the same
  source as that screen, so no saved record loses its name or image? The
  relationship calculator lists unreleased students too, so a summary of its
  targets reads the student list with them. A pickup student's image comes
  from its `imageUid`, with the `unlisted` image when it is null, never from
  its favorite key.
- Does a component that copies loader data into state still show revalidated
  data? Copy only what the screen edits locally, and refresh the copy whenever
  the loader data changes, not only when its list of keys does.
- When a screen changes a selection locally before the server answers, such as
  adding a planner target, does the loader data its calculation joins with that
  selection cover the new item too? A loader that reads only what the saved
  selection names, such as account data for current favorites only, makes the
  screen calculate the new item from missing data until revalidation.
- Does data the site sends to another service about a screen's state, such as
  the chat member snapshot, come from the same merged sources as the screen, and
  keep "not entered" apart from a calculation's default? A planner plan read
  from stored event data alone misses targets set by favoriting and completions
  stored as recruitment results, and eleph the calculation counts as 0 is not
  0 held.
- Does a migration drop a table or column? Unused tables are renamed with the
  `zzz_` prefix instead, unless a preceding step kept all of the data
  ([database](../data/database.md)).
- Does code that handles a PostgreSQL error, such as a unique violation, read it
  through `postgresUniqueConstraintName` (`app/lib/db.ts`)? Drizzle wraps driver
  errors in `DrizzleQueryError`, so the code and constraint are on its `cause`,
  and a check on the thrown error itself never matches.
- Does a screen's own validation use the same rules as the save, through the
  domain parse functions rather than restated bounds? A value the screen accepts
  but the save rejects fails with an error the screen may not show, such as on
  a field that is hidden.
- Does a screen or save reject a user's value by comparing it with catalog data
  that can be wrong, such as a season's difficulty list from BAQL? Validation
  against inaccurate data blocks real records. Check only what the value itself
  rules out, such as its range.
- Does a value derived from what the user entered claim only what the input
  tells? Where a formula stops changing, such as a time score that bottoms out
  at zero, one score stands for many clear times, so the screen omits the
  derived value rather than showing the boundary as exact.
- Does one user action that saves several parts write them in one update or
  transaction, so a failure cannot keep some parts and drop the others?
- Does a save write only what the user changed? A combined save, such as a
  dialog that edits two things, must not refresh a timestamp or baseline (an
  input time, for example) of the part the user left untouched.

### Auth and security

- Do all write actions verify authentication and authorization?
- Does user input enter DB/server logic safely?
- Is the unauthenticated flow clear, and are server-only modules kept out of the
  browser bundle?

### React, accessibility, and rendering

- Are `useEffect` dependencies complete and stable, and is `meta` present when
  the screen needs it? An effect that sets state must not depend on a value
  created anew on each render, such as a default `[]` or `{}` prop or an inline
  object, or it re-renders without end. A page anonymous visitors can open
  needs `socialMeta` card tags in every `meta` branch that renders with 200,
  including empty and fallback states. A child route's `meta` replaces its
  parent's, so a fallback branch cannot rely on the parent's tags.
- Is intent-based action branching verified on the server?
- Is the boundary between route-local and shared UI intact? A shared component
  that takes a `className` sets what a caller may override through classes, not
  an inline `style`: an inline value beats every class, so a caller's own size
  or cap stops working.
- Does a shared component look the same whether it renders an item as a link or
  as a button? A `<button>` centers its text and keeps other browser defaults
  that an `<a>` does not have, so a screen that is the first to pass
  state-only items sees a different layout.
- Does state seeded from a prop (`useState(prop)`) follow the prop when it can
  change after mount? A panel that started disabled stayed collapsed after a
  failed list loaded on retry, because its open state was read only once.
- Is an option that every caller must turn on for correct behavior the default
  instead, with an opt-out for the exception? A caller that forgets an opt-in
  silently gets the wrong result, such as a name hidden on mobile.
- Is an image that fills a frame sized only by `aspect-ratio` pinned to the
  frame (`absolute inset-0`) instead of relying on `height: 100%`? Inside a
  table cell, WebKit resolves that percentage to the image's natural height, and
  `object-cover` then shows a magnified crop.
- Does a control that opens content appear only once that content can be
  shown? An expand button offered while its illustration was still loading
  opened an empty dialog, and a later load failure removed the open dialog
  with the button.
- Is a viewer for images of different shapes sized to the image, and checked
  with both a portrait and a wide one? A dialog sized for portrait
  illustrations drew a wide one at a fraction of the screen.
- Is a visually hidden table, such as a chart's text equivalent, hidden by
  `sr-only` on a wrapping element instead of on the `<table>`? Firefox applies a
  table's `overflow` and `clip-path` to the table box, which does not contain
  the caption, so the caption showed under the chart.
- Does input kept in browser storage stay correct across a save and a second
  tab? Each tab writes only the entries it changed, a save forgets the saved
  entries before the page moves on, and an action that discards kept input
  discards only the entries it names. A saved row that stayed in storage came
  back after its record was deleted.
- For changed user-visible flows, are the relevant loading, empty, failure,
  retry/control adjacency, keyboard, and mobile fixed-bar states handled? Check
  the relevant render and interaction evidence; a concrete changed-UX deviation
  is a must-fix finding.
- Does a text field's Enter or arrow-key handler return early while
  `event.nativeEvent.isComposing` is true, without calling `preventDefault`? A
  Korean IME takes that key to commit the syllable and the browser sends the
  key again after the commit; preventing the composing key left Enter
  unanswered on macOS.
- Does arrow-key movement follow the layout of the options: a grid moves with
  all four arrow keys, not only up and down? Do modified arrows (Shift, Alt,
  Ctrl, Meta) keep their text editing meaning? Does the active option scroll
  into view clear of fixed bars, and does only a pointer that moves take it
  over? Content scrolled under a resting pointer fires `mouseenter`.
- Does each grid column fit its content at the narrowest content width that
  uses that column count? `sm:` and other breakpoints follow the viewport, not
  the content area beside the sidebar, and `min-w-0` lets fixed-size content
  overflow instead of shrinking it.
- Accessibility must-fix findings are a control that cannot be operated with the
  keyboard, an interactive control without an accessible name, information
  conveyed only by an image or color, and body text too low in contrast to read.
  Live-region announcements, `aria-busy`, focus placement after closing an
  element, and tooltip Escape handling are not must-fix unless they block a flow.

## Recommended

- Prefer generated GraphQL types and avoid unnecessary casts or duplicated
  result shapes.
- Keep route files focused on request handling and screen assembly.
- Promote shared UI only after reuse or a clear low-level need is established.

## Usually not part of the review

- Formatting nits handled automatically by Biome.
- Large refactors unrelated to the PR goal.
- Taste-level rewrites unrelated to task behavior, accessibility, or regression
  risk.
