import { describe, expect, it, jest } from "@jest/globals";
import { createAndApplySyncDraft, createSyncDraft, type SyncDraftCreateInput } from "~/models/sync-draft";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

describe("first-party OCR sync draft creation", () => {
  it("creates a reviewable item inventory draft with provenance metadata", async () => {
    const db = new FakePostgresClient();

    await createSyncDraft(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      7,
      {
        source: "first_party_ocr",
        sourceRef: "job-1",
        type: "item_inventory",
        toolName: "아이템 스크린샷 인식",
        entries: [{ entryKey: "item-1", value: 12, meta: { confidence: 0.9 } }],
      },
    );

    expect(db.statements.some((sql) => sql.includes('insert into "sync_drafts"'))).toBe(true);
    expect(db.statements.some((sql) => sql.includes('insert into "sync_draft_entries"'))).toBe(true);
    expect(db.parameters.flat()).toEqual(
      expect.arrayContaining([
        7,
        "first_party_ocr",
        "job-1",
        "item_inventory",
        "item-1",
        12,
        JSON.stringify({ confidence: 0.9 }),
      ]),
    );
  });

  it("applies an OCR inventory result once and returns the existing application on retry", async () => {
    const db = new FakePostgresClient();
    const input: SyncDraftCreateInput & { sourceRef: string } = {
      source: "first_party_ocr" as const,
      sourceRef: "job-1",
      type: "item_inventory" as const,
      toolName: "아이템 스크린샷 인식",
      entries: [{ entryKey: "item-1", value: 12, meta: { confidence: 0.9 } }],
    };

    const env = { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env;
    const first = await createAndApplySyncDraft(env, 7, input);
    const retried = await createAndApplySyncDraft(env, 7, input);

    expect(first).toMatchObject({ alreadyApplied: false, draft: { status: "applied", sourceRef: "job-1" } });
    expect(retried).toMatchObject({ alreadyApplied: true, draft: { uid: first.draft.uid } });
    expect(db.statements.some((statement) => statement.includes('"growth_resource_inventory"'))).toBe(true);
  });

  it("keeps unconfirmed student state columns when applying a partial OCR draft", async () => {
    const db = new FakePostgresClient();
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
    const env = { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env;
    const first = await createAndApplySyncDraft(env, 7, input);
    const retried = await createAndApplySyncDraft(env, 7, input);

    const statement = db.statements.find((candidate) => candidate.includes('insert into "recruited_students"'));
    expect(statement).toContain('"level" = coalesce(excluded.level, recruited_students.level)');
    expect(statement).toContain('"weapon_level" = coalesce(excluded.weapon_level, recruited_students.weapon_level)');
    expect(first.alreadyApplied).toBe(false);
    expect(retried.alreadyApplied).toBe(true);
  });

  it("keeps overwrite semantics for non-OCR student state drafts", async () => {
    const db = new FakePostgresClient();
    const input: SyncDraftCreateInput & { sourceRef: string } = {
      source: "connect",
      sourceRef: "connect-import",
      type: "student_state",
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

    await createAndApplySyncDraft(
      { HYPERDRIVE: { connectionString: "fake://student-state" }, __pgClient: db } as unknown as Env,
      7,
      input,
    );

    const statement = db.statements.find((candidate) => candidate.includes('insert into "recruited_students"'));
    expect(statement).toContain('"level" = excluded.level');
    expect(statement).not.toContain('"level" = coalesce');
  });
});
