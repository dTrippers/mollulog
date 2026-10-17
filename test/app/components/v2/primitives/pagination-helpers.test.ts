import { describe, expect, it } from "@jest/globals";
import { getPageItems, parseJumpPage } from "~/components/v2/primitives/Pagination";

describe("getPageItems", () => {
  it("shows every page when there are five or fewer", () => {
    expect(getPageItems(2, 3)).toEqual([
      { kind: "page", page: 1, neighbor: false },
      { kind: "page", page: 2, neighbor: false },
      { kind: "page", page: 3, neighbor: false },
    ]);
  });

  it("marks neighbors beside the current page, and collapses the middle with ellipses", () => {
    const items = getPageItems(5, 10);
    expect(items).toEqual([
      { kind: "page", page: 1, neighbor: false },
      { kind: "ellipsis", key: "start" },
      { kind: "page", page: 4, neighbor: true },
      { kind: "page", page: 5, neighbor: false },
      { kind: "page", page: 6, neighbor: true },
      { kind: "ellipsis", key: "end" },
      { kind: "page", page: 10, neighbor: false },
    ]);
  });
});

// The page numbers of the items as text, with ellipses as "…".
function labels(currentPage: number, totalPages: number): string[] {
  return getPageItems(currentPage, totalPages).map((item) => (item.kind === "ellipsis" ? "…" : String(item.page)));
}

describe("getPageItems at the ends", () => {
  it.each([
    [6, 1, ["1", "2", "3", "4", "…", "6"]],
    [6, 3, ["1", "2", "3", "4", "…", "6"]],
    [6, 4, ["1", "…", "3", "4", "5", "…", "6"]],
    [6, 5, ["1", "…", "4", "5", "6"]],
    [6, 6, ["1", "…", "4", "5", "6"]],
    [7, 1, ["1", "2", "3", "4", "…", "7"]],
    [7, 3, ["1", "2", "3", "4", "…", "7"]],
    [7, 4, ["1", "…", "3", "4", "5", "…", "7"]],
    [7, 6, ["1", "…", "5", "6", "7"]],
    [7, 7, ["1", "…", "5", "6", "7"]],
  ])("lists %i pages at current page %i once each, in order", (totalPages, currentPage, expected) => {
    expect(labels(currentPage, totalPages)).toEqual(expected);
    const pages = getPageItems(currentPage, totalPages).flatMap((item) => (item.kind === "page" ? [item.page] : []));
    expect(new Set(pages).size).toBe(pages.length);
    expect(pages).toEqual([...pages].sort((a, b) => a - b));
    expect(pages.at(-1)).toBe(totalPages);
  });
});

describe("parseJumpPage", () => {
  it("accepts an integer from 1 through the last page", () => {
    expect(parseJumpPage("1", 3)).toBe(1);
    expect(parseJumpPage(" 3 ", 3)).toBe(3);
  });

  it.each(["", "0", "4", "1.5", "abc", "-1"])("rejects %j", (value) => {
    expect(parseJumpPage(value, 3)).toBeNull();
  });
});
