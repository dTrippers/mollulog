import { describe, expect, it } from "@jest/globals";
import { createAndApplySyncDraft, createSyncDraft, type SyncDraftCreateInput } from "~/models/sync-draft";

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
      sourceRef: "job-1",
      type: "item_inventory",
      toolName: "아이템 스크린샷 인식",
      entries: [{ entryKey: "item-1", value: 12, meta: { confidence: 0.9 } }],
    });

    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("insert into sync_drafts");
    expect(statements[0].params).toEqual(expect.arrayContaining([7, "first_party_ocr", "job-1", "item_inventory"]));
    expect(statements[1].sql).toContain("insert into sync_draft_entries");
    expect(statements[1].params).toEqual(expect.arrayContaining(["item-1", 12, JSON.stringify({ confidence: 0.9 })]));
  });

  it("applies an OCR inventory result once and returns the existing application on retry", async () => {
    const db = new ApplyingD1Database();
    const input: SyncDraftCreateInput & { sourceRef: string } = {
      source: "first_party_ocr" as const,
      sourceRef: "job-1",
      type: "item_inventory" as const,
      toolName: "아이템 스크린샷 인식",
      entries: [{ entryKey: "item-1", value: 12, meta: { confidence: 0.9 } }],
    };

    const first = await createAndApplySyncDraft({ DB: db as unknown as D1Database } as Env, 7, input);
    const retried = await createAndApplySyncDraft({ DB: db as unknown as D1Database } as Env, 7, input);

    expect(first).toMatchObject({ alreadyApplied: false, draft: { status: "applied", sourceRef: "job-1" } });
    expect(retried).toMatchObject({ alreadyApplied: true, draft: { uid: first.draft.uid } });
    expect(db.batchCalls).toBe(1);
    expect(db.statements.some((statement) => statement.sql.includes("growth_resource_inventory"))).toBe(true);
  });

  it("keeps unconfirmed student state columns when applying a partial OCR draft", async () => {
    const db = new ApplyingD1Database();
    const input: SyncDraftCreateInput & { sourceRef: string } = {
      source: "first_party_ocr",
      sourceRef: "student-video-job",
      type: "student_state",
      toolName: "학생 성장도 영상 인식",
      entries: [
        {
          entryKey: "10000",
          value: 7,
          valueJson: JSON.stringify({
            current: {
              tier: 7,
              bond: null,
              level: null,
              weaponLevel: 0,
              skillEx: null,
              skillNormal: null,
              skillEnhanced: null,
              skillSub: null,
              equip1: null,
              equip2: null,
              equip3: null,
              equipSpecial: null,
              abilityHp: 0,
              abilityAtk: 0,
              abilityHeal: 0,
            },
            target: null,
          }),
        },
      ],
    };
    const first = await createAndApplySyncDraft({ DB: db as unknown as D1Database } as Env, 7, input);
    const retried = await createAndApplySyncDraft({ DB: db as unknown as D1Database } as Env, 7, input);

    const statement = db.statements.find((candidate) => candidate.sql.includes("insert into recruited_students"));
    expect(statement?.sql).toContain("level = coalesce(excluded.level, recruited_students.level)");
    expect(statement?.sql).toContain("weaponLevel = coalesce(excluded.weaponLevel, recruited_students.weaponLevel)");
    expect(first.alreadyApplied).toBe(false);
    expect(retried.alreadyApplied).toBe(true);
  });
});

type DraftRow = {
  id: number;
  uid: string;
  userId: number;
  apiKeyUid: null;
  source: string;
  sourceRef: string;
  type: string;
  status: string;
  toolName: string | null;
  toolVersion: string | null;
  catalogVersion: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  expiresAt: null;
};

class ApplyingStatement extends CaptureStatement {
  constructor(
    sql: string,
    private readonly db: ApplyingD1Database,
  ) {
    super(sql);
  }

  async all() {
    if (!this.sql.toLowerCase().includes('from "sync_drafts"')) {
      throw new Error(`Unexpected select: ${this.sql}`);
    }
    const [userId, source, sourceRef] = this.params;
    return {
      results: this.db.drafts.filter(
        (draft) => draft.userId === Number(userId) && draft.source === source && draft.sourceRef === sourceRef,
      ),
    };
  }

  async raw() {
    const { results } = await this.all();
    return results.map((row) => Object.values(row));
  }
}

class ApplyingD1Database {
  readonly drafts: DraftRow[] = [];
  readonly statements: ApplyingStatement[] = [];
  batchCalls = 0;

  prepare(sql: string) {
    const statement = new ApplyingStatement(sql, this);
    this.statements.push(statement);
    return statement;
  }

  async batch(statements: ApplyingStatement[]) {
    this.batchCalls += 1;
    for (const statement of statements) {
      const sql = statement.sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("insert into sync_drafts")) {
        const [uid, userId, source, sourceRef, type, toolName, toolVersion, catalogVersion] = statement.params;
        this.drafts.push({
          id: 1,
          uid: String(uid),
          userId: Number(userId),
          apiKeyUid: null,
          source: String(source),
          sourceRef: String(sourceRef),
          type: String(type),
          status: "pending",
          toolName: toolName == null ? null : String(toolName),
          toolVersion: toolVersion == null ? null : String(toolVersion),
          catalogVersion: catalogVersion == null ? null : String(catalogVersion),
          createdAt: "2026-07-21 00:00:00",
          updatedAt: "2026-07-21 00:00:00",
          appliedAt: null,
          expiresAt: null,
        });
      }
      if (sql.startsWith("update sync_drafts")) {
        const [uid, userId] = statement.params;
        const draft = this.drafts.find((row) => row.uid === uid && row.userId === Number(userId));
        if (draft) {
          draft.status = "applied";
          draft.appliedAt = "2026-07-21 00:00:00";
        }
      }
    }
    return [];
  }
}
