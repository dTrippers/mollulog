import { describe, expect, it } from "@jest/globals";
import {
  readStudentDirectoryScrollPosition,
  saveStudentDirectoryScrollPosition,
  shouldKeepStudentDirectoryScrollOnNavigation,
  studentDirectoryScrollStateKey,
} from "~/routes/students._components/student-directory-scroll-state";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
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

describe("student directory scroll position", () => {
  it("saves and reads offsets for their history entries only", () => {
    const storage = createStorage();

    saveStudentDirectoryScrollPosition(storage, "entry-a", 420.4);
    saveStudentDirectoryScrollPosition(storage, "entry-b", 80);

    expect(readStudentDirectoryScrollPosition(storage, "entry-a")).toBe(420);
    expect(readStudentDirectoryScrollPosition(storage, "entry-b")).toBe(80);
    expect(readStudentDirectoryScrollPosition(storage, "entry-c")).toBeNull();
  });

  it("overwrites an entry and keeps only the most recent 16 history entries", () => {
    const storage = createStorage();
    saveStudentDirectoryScrollPosition(storage, "entry-a", 100);
    saveStudentDirectoryScrollPosition(storage, "entry-a", 300);
    expect(readStudentDirectoryScrollPosition(storage, "entry-a")).toBe(300);

    for (let index = 0; index < 20; index += 1) {
      saveStudentDirectoryScrollPosition(storage, `entry-${index}`, index);
    }
    expect(readStudentDirectoryScrollPosition(storage, "entry-0")).toBeNull();
    expect(readStudentDirectoryScrollPosition(storage, "entry-3")).toBeNull();
    expect(readStudentDirectoryScrollPosition(storage, "entry-4")).toBe(4);
    expect(readStudentDirectoryScrollPosition(storage, "entry-19")).toBe(19);
  });

  it("ignores missing keys and invalid offsets and tolerates corrupt or unavailable storage", () => {
    const storage = createStorage();
    saveStudentDirectoryScrollPosition(storage, "", 100);
    saveStudentDirectoryScrollPosition(storage, "entry-a", Number.NaN);
    saveStudentDirectoryScrollPosition(storage, "entry-a", -1);
    expect(storage.values.size).toBe(0);
    expect(
      readStudentDirectoryScrollPosition(createStorage({ [studentDirectoryScrollStateKey]: "{not json" }), "entry-a"),
    ).toBeNull();
    expect(
      readStudentDirectoryScrollPosition(
        createStorage({ [studentDirectoryScrollStateKey]: '[{"entryKey":"entry-a","scrollTop":"12"}]' }),
        "entry-a",
      ),
    ).toBeNull();
    expect(() => saveStudentDirectoryScrollPosition(throwingStorage, "entry-a", 120)).not.toThrow();
    expect(readStudentDirectoryScrollPosition(throwingStorage, "entry-a")).toBeNull();
    expect(() => saveStudentDirectoryScrollPosition(null, "entry-a", 120)).not.toThrow();
  });
});

describe("root skip condition for the student directory", () => {
  it("keeps a saved offset only for POP navigation to /students", () => {
    const storage = createStorage();
    saveStudentDirectoryScrollPosition(storage, "entry-a", 500);

    expect(
      shouldKeepStudentDirectoryScrollOnNavigation({
        pathname: "/students",
        navigationType: "POP",
        entryKey: "entry-a",
        storage,
      }),
    ).toBe(true);
    expect(
      shouldKeepStudentDirectoryScrollOnNavigation({
        pathname: "/students/",
        navigationType: "POP",
        entryKey: "entry-a",
        storage,
      }),
    ).toBe(true);
    expect(
      shouldKeepStudentDirectoryScrollOnNavigation({
        pathname: "/students",
        navigationType: "PUSH",
        entryKey: "entry-a",
        storage,
      }),
    ).toBe(false);
    expect(
      shouldKeepStudentDirectoryScrollOnNavigation({
        pathname: "/students/10016",
        navigationType: "POP",
        entryKey: "entry-a",
        storage,
      }),
    ).toBe(false);
    expect(
      shouldKeepStudentDirectoryScrollOnNavigation({
        pathname: "/students",
        navigationType: "POP",
        entryKey: "missing-entry",
        storage,
      }),
    ).toBe(false);
  });
});
