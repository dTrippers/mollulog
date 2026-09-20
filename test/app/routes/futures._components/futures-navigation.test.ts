import { afterEach, describe, expect, it } from "@jest/globals";
import {
  canUseFutureViewTransition,
  clearNavigationDirection,
  consumeNavigationDirection,
  createFutureDetailNavigationState,
  type FuturesVisitState,
  getFutureAnchorNeighborUids,
  getFutureHistoryReturnDelta,
  getFutureVisitStateForSurface,
  getMobileFallbackView,
  isVerifiedFutureDetailReturn,
  readFutureDetailNavigationState,
  readFutureVisitState,
  readStoredContentFilter,
  readStoredContentView,
  resolveInitialFutureView,
  saveFutureVisitState,
  setNavigationDirection,
} from "~/routes/futures._components/futures-navigation";
import { subscribeToMediaQueryChanges } from "~/routes/futures._components/use-futures-view-state";

afterEach(() => {
  clearNavigationDirection();
});

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("futures navigation state", () => {
  it("keeps desktop table settings out of the mobile view", () => {
    expect(getMobileFallbackView("table")).toBe("timeline");
    expect(readStoredContentView(createStorage({ view: JSON.stringify("table") }), "view", true)).toBeNull();
  });

  it("falls back safely for malformed storage values", () => {
    const storage = createStorage({ filter: "not-json", view: "not-json" });

    expect(readStoredContentFilter(storage)).toEqual({ types: [], onlyPickups: false });
    expect(readStoredContentView(storage, "view")).toBeNull();
  });

  it("restores a recent visit by history entry and bounds stored visits", () => {
    const storage = createStorage();
    const baseState: FuturesVisitState = {
      version: 2,
      entryKey: "entry-1",
      surface: "mobile",
      view: "compact",
      filter: { types: ["event"], onlyPickups: true },
      contentUid: "content-1",
      neighborContentUids: ["content-0", "content-2"],
      relativeOffset: 48,
      savedAt: Date.now(),
    };

    saveFutureVisitState(storage, baseState);
    expect(readFutureVisitState(storage, "entry-1")).toEqual(baseState);
    expect(readFutureVisitState(storage, "missing-entry")).toBeNull();

    for (let index = 0; index < 10; index += 1) {
      saveFutureVisitState(storage, { ...baseState, entryKey: `entry-${index + 2}` });
    }
    expect(readFutureVisitState(storage, "entry-1")).toBeNull();
  });

  it("accepts only an explicit futures detail marker", () => {
    const state = createFutureDetailNavigationState("entry-1", "content-1");

    expect(readFutureDetailNavigationState(state)).toEqual(state.__mllg);
    expect(readFutureDetailNavigationState(null)).toBeNull();
    expect(readFutureDetailNavigationState({ __mllg: { source: "other" } })).toBeNull();
  });

  it("requires the current content and a matching recent visit for history return", () => {
    const state = createFutureDetailNavigationState("entry-1", "content-1");
    const visit: FuturesVisitState = {
      version: 2,
      entryKey: "entry-1",
      surface: "mobile",
      view: "timeline",
      filter: { types: [], onlyPickups: false },
      contentUid: "other-visible-content",
      neighborContentUids: ["content-0", "content-2"],
      relativeOffset: 12,
      savedAt: Date.now(),
    };

    expect(isVerifiedFutureDetailReturn(state.__mllg, "content-1", visit)).toBe(true);
    expect(isVerifiedFutureDetailReturn(state.__mllg, "content-2", visit)).toBe(false);
    expect(isVerifiedFutureDetailReturn(state.__mllg, "content-1", null)).toBe(false);
  });

  it("resolves the initial view by matching surface, then visit, stored, and default priority", () => {
    const mobileVisit: FuturesVisitState = {
      version: 2,
      entryKey: "entry-1",
      surface: "mobile",
      view: "compact",
      filter: { types: [], onlyPickups: false },
      contentUid: null,
      neighborContentUids: [],
      relativeOffset: 0,
      savedAt: Date.now(),
    };

    expect(
      resolveInitialFutureView({
        surface: "mobile",
        visitState: mobileVisit,
        storedView: "timeline",
      }),
    ).toBe("compact");
    expect(
      resolveInitialFutureView({
        surface: "desktop",
        visitState: mobileVisit,
        storedView: "table",
      }),
    ).toBe("table");
    expect(
      resolveInitialFutureView({
        surface: "mobile",
        visitState: null,
        storedView: "table",
      }),
    ).toBe("timeline");
    expect(
      resolveInitialFutureView({
        surface: "desktop",
        visitState: null,
        storedView: null,
      }),
    ).toBe("timeline");
  });

  it("only exposes a persisted anchor to its source surface", () => {
    const visit: FuturesVisitState = {
      version: 2,
      entryKey: "entry-1",
      surface: "mobile",
      view: "compact",
      filter: { types: [], onlyPickups: false },
      contentUid: "content-1",
      neighborContentUids: ["content-0", "content-2"],
      relativeOffset: 0,
      savedAt: Date.now(),
    };

    expect(getFutureVisitStateForSurface(visit, "mobile")).toBe(visit);
    expect(getFutureVisitStateForSurface(visit, "desktop")).toBeNull();
  });

  it("keeps a bounded nearest-neighbor order around a scroll anchor", () => {
    expect(getFutureAnchorNeighborUids(["content-0", "content-1", "content-2", "content-3", "content-4"], 2)).toEqual([
      "content-1",
      "content-3",
      "content-0",
      "content-4",
    ]);
    expect(getFutureAnchorNeighborUids(["content-0", null, "content-2"], 1)).toEqual(["content-0", "content-2"]);
  });

  it("ignores visit entries that exceed the bounded neighbor state", () => {
    const storage = createStorage({
      "futures::visit-state": JSON.stringify([
        {
          version: 2,
          entryKey: "entry-too-large",
          surface: "mobile",
          view: "timeline",
          filter: { types: [], onlyPickups: false },
          contentUid: "content-1",
          neighborContentUids: ["a", "b", "c", "d", "e"],
          relativeOffset: 0,
          savedAt: Date.now(),
        },
      ]),
    });

    expect(readFutureVisitState(storage, "entry-too-large")).toBeNull();
  });

  it("consumes explicit transition direction only once", () => {
    setNavigationDirection("forward");

    expect(consumeNavigationDirection()).toBe("forward");
    expect(consumeNavigationDirection()).toBeNull();
  });

  it("uses custom view transitions only for visible documents that support them", () => {
    const startViewTransition = () => ({ finished: Promise.resolve() }) as ViewTransition;

    expect(canUseFutureViewTransition({ visibilityState: "visible", startViewTransition })).toBe(true);
    expect(canUseFutureViewTransition({ visibilityState: "hidden", startViewTransition })).toBe(false);
    expect(canUseFutureViewTransition({ visibilityState: "visible" })).toBe(false);
  });

  it("returns the source history delta only when it points backward", () => {
    expect(getFutureHistoryReturnDelta(4, 7)).toBe(-3);
    expect(getFutureHistoryReturnDelta(4, 4)).toBeNull();
    expect(getFutureHistoryReturnDelta(8, 7)).toBeNull();
    expect(getFutureHistoryReturnDelta(undefined, 7)).toBeNull();
  });

  it("supports legacy media-query listeners without throwing during hydration", () => {
    let addedListener: ((event: MediaQueryListEvent) => void) | undefined;
    let removedListener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        addedListener = listener;
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        removedListener = listener;
      },
    } as unknown as MediaQueryList;
    const listener = () => undefined;

    const unsubscribe = subscribeToMediaQueryChanges(media, listener);

    expect(addedListener).toBe(listener);
    unsubscribe();
    expect(removedListener).toBe(listener);
  });
});
