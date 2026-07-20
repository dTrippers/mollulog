import { describe, expect, it } from "@jest/globals";
import { createSyncDraft } from "~/models/sync-draft";

class CaptureStatement {
  params: unknown[] = [];
  constructor(readonly sql: string) {}
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
}

describe("first-party OCR sync draft creation", () => {
  it("creates a reviewable item inventory draft with provenance metadata", async () => {
    const statements: CaptureStatement[] = [];
    const db = {
      prepare(sql: string) {
        const statement = new CaptureStatement(sql);
        statements.push(statement);
        return statement;
      },
      batch: async () => [],
    } as unknown as D1Database;

    await createSyncDraft({ DB: db } as Env, 7, {
      source: "first_party_ocr",
      type: "item_inventory",
      toolName: "몰루로그 스크린샷 인식",
      entries: [{ entryKey: "item-1", value: 12, meta: { confidence: 0.9 } }],
    });

    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("insert into sync_drafts");
    expect(statements[0].params).toEqual(expect.arrayContaining([7, "first_party_ocr", "item_inventory"]));
    expect(statements[1].sql).toContain("insert into sync_draft_entries");
    expect(statements[1].params).toEqual(expect.arrayContaining(["item-1", 12, JSON.stringify({ confidence: 0.9 })]));
  });
});
