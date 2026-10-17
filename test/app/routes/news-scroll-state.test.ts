import { describe, expect, it } from "@jest/globals";
import {
  newsScrollStateKey,
  readNewsScrollPosition,
  saveNewsScrollPosition,
  shouldKeepNewsScrollOnNavigation,
} from "~/routes/news._components/news-scroll-state";

// A plain in-memory session store with the Storage methods the helpers use.
function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("storage blocked");
  },
};

describe("news scroll position", () => {
  it("saves the offset of one history entry and reads it back for that entry only", () => {
    const storage = createStorage();

    saveNewsScrollPosition(storage, "entry-a", 420.4);
    saveNewsScrollPosition(storage, "entry-b", 80);

    expect(readNewsScrollPosition(storage, "entry-a")).toBe(420);
    expect(readNewsScrollPosition(storage, "entry-b")).toBe(80);
    expect(readNewsScrollPosition(storage, "entry-c")).toBeNull();
  });

  it("overwrites the offset of the same entry", () => {
    const storage = createStorage();

    saveNewsScrollPosition(storage, "entry-a", 100);
    saveNewsScrollPosition(storage, "entry-a", 300);

    expect(readNewsScrollPosition(storage, "entry-a")).toBe(300);
  });

  it("ignores a missing entry key and an invalid offset", () => {
    const storage = createStorage();

    saveNewsScrollPosition(storage, "", 100);
    saveNewsScrollPosition(storage, "entry-a", Number.NaN);
    saveNewsScrollPosition(storage, "entry-a", -1);

    expect(storage.values.size).toBe(0);
    expect(readNewsScrollPosition(storage, "")).toBeNull();
  });

  it("keeps only the most recent 16 entries", () => {
    const storage = createStorage();

    for (let index = 0; index < 20; index += 1) {
      saveNewsScrollPosition(storage, `entry-${index}`, index);
    }

    expect(readNewsScrollPosition(storage, "entry-0")).toBeNull();
    expect(readNewsScrollPosition(storage, "entry-3")).toBeNull();
    expect(readNewsScrollPosition(storage, "entry-4")).toBe(4);
    expect(readNewsScrollPosition(storage, "entry-19")).toBe(19);
  });

  it("treats corrupt or foreign stored values as no saved position", () => {
    expect(readNewsScrollPosition(createStorage({ [newsScrollStateKey]: "{not json" }), "entry-a")).toBeNull();
    expect(
      readNewsScrollPosition(createStorage({ [newsScrollStateKey]: '{"entryKey":"entry-a"}' }), "entry-a"),
    ).toBeNull();
    expect(
      readNewsScrollPosition(
        createStorage({
          [newsScrollStateKey]: '[{"entryKey":"entry-a","scrollTop":"12"},{"entryKey":"entry-a","scrollTop":-3}]',
        }),
        "entry-a",
      ),
    ).toBeNull();
  });

  it("does not throw when the session store is unavailable, and reads nothing from it", () => {
    expect(() => saveNewsScrollPosition(throwingStorage, "entry-a", 120)).not.toThrow();
    expect(readNewsScrollPosition(throwingStorage, "entry-a")).toBeNull();
    expect(() => saveNewsScrollPosition(null, "entry-a", 120)).not.toThrow();
    expect(readNewsScrollPosition(null, "entry-a")).toBeNull();
  });
});

describe("root skip condition for the news list", () => {
  it("keeps the offset for a back navigation to /news whose entry has a saved position", () => {
    const storage = createStorage();
    saveNewsScrollPosition(storage, "entry-a", 500);

    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news", navigationType: "POP", entryKey: "entry-a", storage }),
    ).toBe(true);
  });

  it("treats /news/ as the list, and keeps only one trailing slash out of the match", () => {
    const storage = createStorage();
    saveNewsScrollPosition(storage, "entry-a", 500);

    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news/", navigationType: "POP", entryKey: "entry-a", storage }),
    ).toBe(true);
    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news//", navigationType: "POP", entryKey: "entry-a", storage }),
    ).toBe(false);
    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news/", navigationType: "PUSH", entryKey: "entry-a", storage }),
    ).toBe(false);
  });

  it("resets as before for a push, a replace, another route, or an entry without a saved position", () => {
    const storage = createStorage();
    saveNewsScrollPosition(storage, "entry-a", 500);

    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news", navigationType: "PUSH", entryKey: "entry-a", storage }),
    ).toBe(false);
    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news", navigationType: "REPLACE", entryKey: "entry-a", storage }),
    ).toBe(false);
    expect(
      shouldKeepNewsScrollOnNavigation({
        pathname: "/posts/post-1",
        navigationType: "POP",
        entryKey: "entry-a",
        storage,
      }),
    ).toBe(false);
    expect(
      shouldKeepNewsScrollOnNavigation({ pathname: "/news", navigationType: "POP", entryKey: "entry-z", storage }),
    ).toBe(false);
    expect(
      shouldKeepNewsScrollOnNavigation({
        pathname: "/news",
        navigationType: "POP",
        entryKey: "entry-a",
        storage: null,
      }),
    ).toBe(false);
  });
});
