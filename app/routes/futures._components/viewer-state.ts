import { useEffect, useState } from "react";

// Viewer-only data (favorites, recruitment results) and comment summaries load after the page renders. A failed read is
// an explicit unavailable state, never an empty list.
export type ViewerLoaded<T> = { status: "available"; value: T } | { status: "unavailable" };

// Settles one deferred read into an explicit state. The failure is reported and the page keeps its other content.
export function settleViewerState<T>(
  promise: Promise<T>,
  operation: string,
  reportFailure: (error: unknown, operation: string) => void,
): Promise<ViewerLoaded<T>> {
  return promise.then(
    (value): ViewerLoaded<T> => ({ status: "available", value }),
    (error: unknown): ViewerLoaded<T> => {
      reportFailure(error, operation);
      return { status: "unavailable" };
    },
  );
}

// Both own-state reads of one load, settled as one pair. The pair applies together, so a revalidation never mixes a fresh
// read with the previous one. A failed read stays a failed read of its own, as settleViewerState leaves it.
export function settleViewerPair<Favorites, Results>(
  favorites: Promise<ViewerLoaded<Favorites>>,
  results: Promise<ViewerLoaded<Results>>,
): Promise<{ favorites: ViewerLoaded<Favorites>; results: ViewerLoaded<Results> }> {
  return Promise.all([favorites, results]).then(([favoritesValue, resultsValue]) => ({
    favorites: favoritesValue,
    results: resultsValue,
  }));
}

export type ViewerStatus = "pending" | "ready" | "failed";

// The viewer's own state is ready only when both reads succeed. One failed read fails the whole own state, so no
// personal mark is shown as if it were known.
export function resolveViewerStatus<Favorites, Results>(
  favorites: ViewerLoaded<Favorites> | undefined,
  results: ViewerLoaded<Results> | undefined,
): ViewerStatus {
  if (favorites?.status === "unavailable" || results?.status === "unavailable") {
    return "failed";
  }
  if (favorites === undefined || results === undefined) {
    return "pending";
  }
  return "ready";
}

// Copies a deferred loader value into state once it settles. Undefined until then. A rejected value settles to the fallback.
export function useSettledValue<T>(promise: Promise<T>, fallback: T): T | undefined {
  const [settled, setSettled] = useState<T | undefined>(undefined);

  useEffect(() => {
    let active = true;
    promise.then(
      (value) => {
        if (active) setSettled(value);
      },
      () => {
        if (active) setSettled(fallback);
      },
    );
    return () => {
      active = false;
    };
  }, [promise, fallback]);

  return settled;
}
