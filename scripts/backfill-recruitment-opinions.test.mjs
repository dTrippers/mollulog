import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillRecruitmentOpinions,
  MODEL,
  PROMPT_VERSION,
} from "./backfill-recruitment-opinions.mjs";

const periodStart = "2026-09-01T00:00:00.000Z";

function createFixturePool() {
  const rows = new Map([
    [
      "failed-opinion",
      {
        uid: "failed-opinion",
        subject_content_uid: "content-1",
        blocks: [{ type: "plaintext", text: "첫 번째 분류 시도" }],
        created_at: "2026-09-02T00:00:00.000Z",
        recruitment_period_start_at: null,
        recruitment_opinion_classification_status: null,
        recruitment_opinion_classification: null,
        recruitment_opinion_classification_revision: 0,
      },
    ],
    [
      "completed-opinion",
      {
        uid: "completed-opinion",
        subject_content_uid: "content-1",
        blocks: [{ type: "plaintext", text: "이미 보존된 결과" }],
        created_at: "2026-09-02T00:00:00.000Z",
        recruitment_period_start_at: periodStart,
        recruitment_opinion_classification_status: "completed",
        recruitment_opinion_classification: "OTHER",
        recruitment_opinion_classification_revision: 7,
      },
    ],
  ]);

  const pool = {
    async query(text, values = []) {
      const normalized = text.replace(/\s+/g, " ").trim().toUpperCase();
      if (normalized.startsWith("SELECT UID")) {
        return { rows: [...rows.values()].map((row) => ({ ...row })) };
      }

      if (normalized.includes("SET RECRUITMENT_PERIOD_START_AT = $1")) {
        rows.get(values[1]).recruitment_period_start_at = values[0].toISOString();
        return { rowCount: 1, rows: [] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'PENDING'")) {
        const row = rows.get(values[3]);
        if (!row || row.recruitment_opinion_classification_status === "completed") {
          return { rowCount: 0, rows: [] };
        }
        row.recruitment_opinion_classification_status = "pending";
        row.recruitment_opinion_classification = null;
        row.recruitment_opinion_classification_revision = values[0];
        return { rowCount: 1, rows: [{ blocks: row.blocks }] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'COMPLETED'")) {
        const row = rows.get(values[1]);
        if (row?.recruitment_opinion_classification_status === "pending" && row.recruitment_opinion_classification_revision === values[2]) {
          row.recruitment_opinion_classification_status = "completed";
          row.recruitment_opinion_classification = values[0];
        }
        return { rowCount: 1, rows: [] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'FAILED'")) {
        const row = rows.get(values[0]);
        if (row?.recruitment_opinion_classification_status === "pending" && row.recruitment_opinion_classification_revision === values[1]) {
          row.recruitment_opinion_classification_status = "failed";
          row.recruitment_opinion_classification = null;
        }
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`Unexpected fake query: ${text}`);
    },
  };

  return { pool, rows };
}

test("backfill retries failures and preserves completed rows across repeat runs", async () => {
  const { pool, rows } = createFixturePool();
  const bodies = [];
  let attempts = 0;
  const classifyOpinion = async (body) => {
    bodies.push(body);
    attempts += 1;
    if (attempts === 1) throw new Error("simulated model failure");
    return "OTHER";
  };
  const periods = { "content-1": periodStart };

  const first = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(first, { processed: 1, skipped: 1, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification_status, "failed");
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification_revision, 1);
  assert.equal(rows.get("completed-opinion").recruitment_opinion_classification_revision, 7);

  const second = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(second, { processed: 1, skipped: 1, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification_status, "completed");
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification, "OTHER");
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification_revision, 2);
  assert.equal(rows.get("completed-opinion").recruitment_opinion_classification, "OTHER");
  assert.deepEqual(bodies, ["첫 번째 분류 시도", "첫 번째 분류 시도"]);

  const completedRevision = rows.get("failed-opinion").recruitment_opinion_classification_revision;
  const third = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(third, { processed: 0, skipped: 2, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(rows.get("failed-opinion").recruitment_opinion_classification_revision, completedRevision);
  assert.equal(attempts, 2);
});
