import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillRecruitmentOpinions,
  MODEL,
  PROMPT_VERSION,
} from "./backfill-recruitment-opinions.mjs";

const periodStart = "2026-09-01T00:00:00.000Z";

function createFixturePool({ posts, opinions }) {
  const normalize = (text) => text.replace(/\s+/g, " ").trim().toUpperCase();

  const pool = {
    async query(text, values = []) {
      const normalized = normalize(text);

      if (normalized.startsWith("SELECT P.UID")) {
        return {
          rows: [...posts.values()].map((post) => {
            const opinion = opinions.get(post.uid);
            return {
              uid: post.uid,
              subject_content_uid: post.subject_content_uid,
              blocks: post.blocks,
              created_at: post.created_at,
              recruitment_period_start_at: opinion?.recruitment_period_start_at ?? null,
              recruitment_opinion_classification_status: opinion?.recruitment_opinion_classification_status ?? null,
              recruitment_opinion_classification_revision:
                opinion?.recruitment_opinion_classification_revision ?? 0,
            };
          }),
        };
      }

      if (normalized.startsWith("INSERT INTO COMMUNITY_POST_RECRUITMENT_OPINIONS")) {
        const [startAt, uid] = values;
        const existing = opinions.get(uid);
        if (!existing) {
          opinions.set(uid, {
            recruitment_period_start_at: startAt.toISOString(),
            recruitment_opinion_classification_status: null,
            recruitment_opinion_classification: null,
            recruitment_opinion_classification_revision: 0,
          });
          return { rowCount: 1, rows: [] };
        }
        if (existing.recruitment_period_start_at !== startAt.toISOString()) {
          existing.recruitment_period_start_at = startAt.toISOString();
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'PENDING'")) {
        const [revision, , , uid] = values;
        const opinion = opinions.get(uid);
        if (!opinion || opinion.recruitment_opinion_classification_status === "completed") {
          return { rowCount: 0, rows: [] };
        }
        opinion.recruitment_opinion_classification_status = "pending";
        opinion.recruitment_opinion_classification = null;
        opinion.recruitment_opinion_classification_revision = revision;
        return { rowCount: 1, rows: [{ blocks: posts.get(uid).blocks }] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'COMPLETED'")) {
        const [classification, uid, revision] = values;
        const opinion = opinions.get(uid);
        if (
          opinion?.recruitment_opinion_classification_status === "pending" &&
          opinion.recruitment_opinion_classification_revision === revision
        ) {
          opinion.recruitment_opinion_classification_status = "completed";
          opinion.recruitment_opinion_classification = classification;
        }
        return { rowCount: 1, rows: [] };
      }

      if (normalized.includes("SET RECRUITMENT_OPINION_CLASSIFICATION_STATUS = 'FAILED'")) {
        const [uid, revision] = values;
        const opinion = opinions.get(uid);
        if (
          opinion?.recruitment_opinion_classification_status === "pending" &&
          opinion.recruitment_opinion_classification_revision === revision
        ) {
          opinion.recruitment_opinion_classification_status = "failed";
          opinion.recruitment_opinion_classification = null;
        }
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`Unexpected fake query: ${text}`);
    },
  };

  return { pool, posts, opinions };
}

function createDefaultFixture() {
  return createFixturePool({
    posts: new Map([
      [
        "failed-opinion",
        {
          uid: "failed-opinion",
          subject_content_uid: "content-1",
          blocks: [{ type: "plaintext", text: "첫 번째 분류 시도" }],
          created_at: "2026-09-02T00:00:00.000Z",
        },
      ],
      [
        "completed-opinion",
        {
          uid: "completed-opinion",
          subject_content_uid: "content-1",
          blocks: [{ type: "plaintext", text: "이미 보존된 결과" }],
          created_at: "2026-09-02T00:00:00.000Z",
        },
      ],
    ]),
    opinions: new Map([
      [
        "failed-opinion",
        {
          recruitment_period_start_at: null,
          recruitment_opinion_classification_status: null,
          recruitment_opinion_classification: null,
          recruitment_opinion_classification_revision: 0,
        },
      ],
      [
        "completed-opinion",
        {
          recruitment_period_start_at: periodStart,
          recruitment_opinion_classification_status: "completed",
          recruitment_opinion_classification: "OTHER",
          recruitment_opinion_classification_revision: 7,
        },
      ],
    ]),
  });
}

test("backfill retries failures and preserves completed rows across repeat runs", async () => {
  const { pool, opinions } = createDefaultFixture();
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
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification_status, "failed");
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification_revision, 1);
  assert.equal(opinions.get("completed-opinion").recruitment_opinion_classification_revision, 7);

  const second = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(second, { processed: 1, skipped: 1, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification_status, "completed");
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification, "OTHER");
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification_revision, 2);
  assert.equal(opinions.get("completed-opinion").recruitment_opinion_classification, "OTHER");
  assert.deepEqual(bodies, ["첫 번째 분류 시도", "첫 번째 분류 시도"]);

  const completedRevision = opinions.get("failed-opinion").recruitment_opinion_classification_revision;
  const third = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(third, { processed: 0, skipped: 2, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(opinions.get("failed-opinion").recruitment_opinion_classification_revision, completedRevision);
  assert.equal(attempts, 2);
});

test("backfill creates the missing extension row for a legacy opinion and classifies it", async () => {
  const { pool, opinions } = createFixturePool({
    posts: new Map([
      [
        "legacy-opinion",
        {
          uid: "legacy-opinion",
          subject_content_uid: "content-1",
          blocks: [{ type: "plaintext", text: "마이그레이션 이전 의견" }],
          created_at: "2026-09-02T00:00:00.000Z",
        },
      ],
    ]),
    opinions: new Map(),
  });
  const classifyOpinion = async () => "RESULT_RELATED";
  const periods = { "content-1": periodStart };

  const first = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(first, { processed: 1, skipped: 0, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.deepEqual(opinions.get("legacy-opinion"), {
    recruitment_period_start_at: periodStart,
    recruitment_opinion_classification_status: "completed",
    recruitment_opinion_classification: "RESULT_RELATED",
    recruitment_opinion_classification_revision: 1,
  });

  const second = await backfillRecruitmentOpinions({ pool, periods, classifyOpinion });
  assert.deepEqual(second, { processed: 0, skipped: 1, model: MODEL, promptVersion: PROMPT_VERSION });
  assert.equal(opinions.get("legacy-opinion").recruitment_opinion_classification_revision, 1);
});
