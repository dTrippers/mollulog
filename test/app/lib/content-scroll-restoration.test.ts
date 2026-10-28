/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  getContentScrollEntryKey,
  readContentScrollPosition,
  restoreContentScrollPosition,
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

// A scroll container whose content height can change, clamping scrollTop the way a browser does.
function scrollContainer(contentHeight: number, clientHeight = 600) {
  const element = document.createElement("div");
  let height = contentHeight;
  let top = 0;
  Object.defineProperty(element, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = Math.max(0, Math.min(value, height - clientHeight));
    },
  });
  return { element, grow: (next: number) => (height = next) };
}

describe("restoring the content offset", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("restores at once when the content is already tall enough", () => {
    const { element } = scrollContainer(2400);
    restoreContentScrollPosition(element, 800);
    expect(element.scrollTop).toBe(800);
  });

  it("keeps applying the offset until content that renders later is tall enough", () => {
    const { element, grow } = scrollContainer(700);
    restoreContentScrollPosition(element, 800);
    expect(element.scrollTop).toBe(100);

    grow(2400);
    jest.advanceTimersByTime(50);
    expect(element.scrollTop).toBe(800);
  });

  it("stops when the visitor scrolls first", () => {
    const { element, grow } = scrollContainer(700);
    restoreContentScrollPosition(element, 800);
    element.dispatchEvent(new Event("wheel"));
    element.scrollTop = 40;

    grow(2400);
    jest.advanceTimersByTime(50);
    expect(element.scrollTop).toBe(40);
  });

  it("gives up after a short time", () => {
    const { element, grow } = scrollContainer(700);
    restoreContentScrollPosition(element, 800);
    jest.advanceTimersByTime(2500);

    grow(2400);
    jest.advanceTimersByTime(50);
    expect(element.scrollTop).toBe(100);
  });
});
