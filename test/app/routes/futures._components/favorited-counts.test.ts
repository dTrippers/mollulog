import { describe, expect, it } from "@jest/globals";
import {
  applyFavoriteCountChange,
  type FavoriteCountsSync,
  type FavoritedCountEntry,
  syncFavoriteCounts,
} from "~/routes/futures._components/favorited-counts";

const student = { contentUid: "content-1", studentUid: "student-1" };
const loaded = (count: number): FavoritedCountEntry[] => [{ ...student, count }];

// Each loader result is a new array, as a revalidation returns. The counts in it are what the route shows.
function result(counts: FavoritedCountEntry[]): FavoriteCountsSync {
  return { source: [], counts };
}

describe("syncFavoriteCounts", () => {
  it("replaces the counts with a fresh load when no favorite call is in flight", () => {
    // A failed load left no counts. The retry loads 42, and the page must show 42.
    const current = result([]);
    const fresh = result(loaded(42));

    expect(syncFavoriteCounts(current, fresh, "idle")).toBe(fresh);
  });

  it("keeps the optimistic counts while a favorite submission is in flight", () => {
    // The optimistic +1 is already shown. An overlapping revalidation may already include the write, so it must not replace.
    const optimistic = result(loaded(42));
    const overlapping = result(loaded(42));

    expect(syncFavoriteCounts(optimistic, overlapping, "submitting")).toBe(optimistic);
  });

  it("keeps the optimistic counts while the action's own revalidation is still loading", () => {
    const optimistic = result(loaded(42));
    const afterAction = result(loaded(42));

    expect(syncFavoriteCounts(optimistic, afterAction, "loading")).toBe(optimistic);
  });

  it("replaces the counts with the latest load once the fetcher is idle again", () => {
    const optimistic = result(loaded(42));
    const latest = result(loaded(42));

    // The first load after idle is applied, and it is the authoritative one.
    const applied = syncFavoriteCounts(optimistic, latest, "idle");
    expect(applied).toBe(latest);
    expect(applied.counts).toEqual(loaded(42));
  });

  it("returns the same state when the loader result has not changed", () => {
    const current = result(loaded(7));

    expect(syncFavoriteCounts(current, current, "idle")).toBe(current);
  });
});

describe("applyFavoriteCountChange", () => {
  it("increments the matching student and leaves the others alone", () => {
    const other = { contentUid: "content-2", studentUid: "student-2", count: 5 };
    expect(applyFavoriteCountChange([...loaded(3), other], { ...student, favorited: true })).toEqual([
      { ...student, count: 4 },
      other,
    ]);
  });

  it("adds a student the counts do not list yet", () => {
    const other = { contentUid: "content-2", studentUid: "student-2" };
    expect(applyFavoriteCountChange([], { ...other, favorited: true })).toEqual([{ ...other, count: 1 }]);
  });

  it("drops a student whose count reaches zero", () => {
    expect(applyFavoriteCountChange(loaded(1), { ...student, favorited: false })).toEqual([]);
  });
});
