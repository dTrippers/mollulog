# Date and Time

This document defines the shared rules MolluLog follows when storing, caching, passing, and displaying date and time values.

## Core rules

- A timestamp instant is handled as a `UTC ISO string`. Example: `2026-05-01T15:30:00.000Z`
- A date-only value is handled as a `YYYY-MM-DD` string. Example: `2026-05-02`
- The `Date` object is not used as the contract of a loader, cache, or model return value.
- A legacy value without a timezone, such as D1 `current_timestamp`, is normalized to a UTC instant at the model read boundary.
- The user's display timezone is not fixed to KST; it uses the browser timezone stored in a preference cookie.

## Implementation

- Perform date / time conversion through `app/lib/date-time.ts`.
- New timestamp writes use `nowUtcIso()` or `toUtcIso()`.
- Display formatting uses `formatInstant(instant, { timeZone, format })`.
- Do not add view code that depends on the runtime timezone, such as `dayjs(value).format(...)` or `new Date(value).toLocaleDateString(...)`.
- Do not put `Date` objects in a new cache payload. The `Date` revive / replacer in `fetchCached()` remains for legacy compatibility only.

## SSR and hydration

- When the timezone cookie is absent, the server falls back to `UTC`.
- After mount, the client detects the browser timezone with `Intl.DateTimeFormat().resolvedOptions().timeZone` and stores it in the preference cookie.
- Display components explicitly use the display timezone provided from root.
- This stabilizes the first SSR and initial hydration, then updates the display with the detected browser timezone.

## D1 sorting

- A query that may mix legacy timestamps and ISO timestamps does not rely on string sorting.
- In D1, sort by `unixepoch(...)`.
- A table where all data is already canonical ISO UTC may use ISO string sorting.
