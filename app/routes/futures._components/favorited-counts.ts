export type FavoritedStudentKey = { contentUid: string; studentUid: string };
export type FavoritedCountEntry = FavoritedStudentKey & { count: number };
export type FavoriteChange = FavoritedStudentKey & { favorited: boolean };

export function equalFavorites(a: FavoritedStudentKey, b: FavoritedStudentKey): boolean {
  return a.contentUid === b.contentUid && a.studentUid === b.studentUid;
}

// One optimistic favorite change on the counts. A count that reaches zero drops out, as the loader omits zero counts.
export function applyFavoriteCountChange(counts: FavoritedCountEntry[], change: FavoriteChange): FavoritedCountEntry[] {
  let found = false;
  const next = counts.map((entry): FavoritedCountEntry => {
    if (equalFavorites(entry, change)) {
      found = true;
      return { ...entry, count: entry.count + (change.favorited ? 1 : -1) };
    }
    return entry;
  });
  if (!found && change.favorited) {
    next.push({ contentUid: change.contentUid, studentUid: change.studentUid, count: 1 });
  }
  return next.filter((entry) => entry.count > 0);
}

// The counts that the route shows, and the loader result they were taken from. The identity of the result is the marker.
export type FavoriteCountsSync = { source: object; counts: FavoritedCountEntry[] };

// A new loader result replaces the counts only while no favorite fetcher call is in flight. While one is, the optimistic
// counts stay. An overlapping revalidation can already include the write whose response has not arrived yet, so applying
// it would count that favorite twice. Once the fetcher is idle, the latest loader result replaces the counts. React Router
// revalidates after the action, so that result already includes the write.
export function syncFavoriteCounts(
  current: FavoriteCountsSync,
  loaded: FavoriteCountsSync,
  fetcherState: string,
): FavoriteCountsSync {
  if (current.source === loaded.source || fetcherState !== "idle") {
    return current;
  }
  return loaded;
}
