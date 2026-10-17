import { describe, expect, it } from "@jest/globals";
import { buildItemCompletionSummary, buildStudentCompletionSummary } from "~/domain/scanner-completion";

describe("buildItemCompletionSummary", () => {
  const catalog = { "100": { uid: "100", type: "item", name: "기존 아이템" } };
  const cells = [
    { imageIndex: 0, position: 0 },
    { imageIndex: 0, position: 1 },
  ];

  it("uses the catalog image key and counts the cells no entry covers", () => {
    const summary = buildItemCompletionSummary(
      [{ entryKey: "100", value: 5, meta: JSON.stringify({ cells: [{ imageIndex: 0, position: 0 }] }) }],
      cells,
      catalog,
    );
    expect(summary).toEqual({
      appliedCount: 1,
      unappliedCellCount: 1,
      items: [{ uid: "100", assetUid: "100", resourceType: "item", name: "기존 아이템", quantity: 5 }],
    });
  });

  it("keeps a resource the catalog no longer has, without a guessed image", () => {
    const summary = buildItemCompletionSummary([{ entryKey: "equipment:9", value: 1, meta: null }], cells, catalog);
    expect(summary?.items).toEqual([
      { uid: "equipment:9", assetUid: null, resourceType: null, name: null, quantity: 1 },
    ]);
  });

  it("returns null when a saved cell list cannot be read", () => {
    expect(buildItemCompletionSummary([{ entryKey: "100", value: 5, meta: "{" }], cells, catalog)).toBeNull();
    expect(
      buildItemCompletionSummary(
        [{ entryKey: "100", value: 5, meta: '{"cells":[{"imageIndex":"x"}]}' }],
        cells,
        catalog,
      ),
    ).toBeNull();
  });
});

describe("buildStudentCompletionSummary", () => {
  it("lists the result students without a saved entry as excluded", () => {
    expect(
      buildStudentCompletionSummary(
        [{ entryKey: "a" }],
        [{ studentUid: "a" }, { studentUid: "b" }, { studentUid: "b" }],
        { a: { name: "케이" } },
      ),
    ).toEqual({
      appliedCount: 1,
      excludedCount: 1,
      applied: [{ uid: "a", name: "케이" }],
      excluded: [{ uid: "b", name: null }],
    });
  });
});
