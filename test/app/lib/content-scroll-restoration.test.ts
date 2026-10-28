import { describe, expect, it } from "@jest/globals";
import {
  getContentScrollEntryKey,
  readContentScrollPosition,
  saveContentScrollPosition,
} from "~/lib/content-scroll-restoration";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("content scroll restoration", () => {
  it("keys router-created entries by key and the landing entry by path", () => {
    expect(getContentScrollEntryKey({ key: "abc123", pathname: "/students", search: "" })).toBe("abc123");
    expect(getContentScrollEntryKey({ key: "default", pathname: "/students", search: "?q=1" })).toBe(
      "default:/students?q=1",
    );
  });

  it("saves and reads the offset of each entry", () => {
    const storage = memoryStorage();
    saveContentScrollPosition(storage, "a", 120.4);
    saveContentScrollPosition(storage, "b", 300);
    saveContentScrollPosition(storage, "a", 80);

    expect(readContentScrollPosition(storage, "a")).toBe(80);
    expect(readContentScrollPosition(storage, "b")).toBe(300);
    expect(readContentScrollPosition(storage, "missing")).toBeNull();
  });

  it("keeps only the most recent 50 entries", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 55; index += 1) {
      saveContentScrollPosition(storage, `entry-${index}`, index);
    }

    expect(readContentScrollPosition(storage, "entry-4")).toBeNull();
    expect(readContentScrollPosition(storage, "entry-5")).toBe(5);
    expect(readContentScrollPosition(storage, "entry-54")).toBe(54);
  });

  it("ignores corrupt storage and unavailable storage", () => {
    const storage = memoryStorage();
    storage.setItem("mllg:content-scroll-positions", "{not json");
    expect(readContentScrollPosition(storage, "a")).toBeNull();
    expect(readContentScrollPosition(null, "a")).toBeNull();
    expect(() => saveContentScrollPosition(null, "a", 10)).not.toThrow();
  });
});
