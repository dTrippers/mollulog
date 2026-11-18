/**
 * Whether a student is released at `now`, by the rule BAQL's `released` field uses: the GL release time is known
 * and already past. Source caches keep `releaseAt` and decide this on every read, so a student released after the
 * cache was written shows up without a cache refresh.
 */
export function isStudentReleased(releaseAt: string | null, now: number): boolean {
  return releaseAt !== null && Date.parse(releaseAt) < now;
}
