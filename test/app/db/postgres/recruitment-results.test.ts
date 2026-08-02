import { expect, it, jest } from "@jest/globals";
import type { Client } from "pg";

const projection = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("~/models/recruited-student", () => ({
  upsertRecruitedStudentFromRecruitmentResult: projection,
}));

import { upsertPostgresRecruitmentResult } from "~/db/postgres/recruitment-results";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as unknown as Env;

it("commits the result and linked post before awaiting the D1 projection", async () => {
  const events: string[] = [];
  let resultSelectCount = 0;
  const savedResultRow = [
    1,
    "result-1",
    10,
    "group-1",
    "content-1",
    new Date("2026-08-01T00:00:00.000Z"),
    [{ studentUid: "student-1", tier: 3, pickup: true }],
    [],
    null,
    null,
    null,
    "post-1",
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-01T00:00:00.000Z"),
  ];
  const query = jest.fn(async (config: { text: string } | string) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (text.includes('from "recruitment_results"')) {
      resultSelectCount += 1;
      return resultSelectCount === 1 ? { rows: [], rowCount: 0 } : { rows: [savedResultRow], rowCount: 1 };
    }
    if (text.includes('insert into "community_posts"')) return { rows: [["post-1"]], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => {
      events.push("client.end");
    }),
    query,
  } as unknown as Client;
  projection.mockImplementation(async () => {
    events.push("projection");
  });

  await expect(
    upsertPostgresRecruitmentResult(
      env,
      10,
      {
        recruitmentGroupUid: "group-1",
        contentUid: "content-1",
        comment: "result comment",
        recruitedStudents: [{ studentUid: "student-1", tier: 3, pickup: true }],
      },
      { createClient: () => client },
    ),
  ).resolves.toMatchObject({ uid: "result-1", commentPostUid: "post-1" });

  const commitIndex = events.findIndex((event) => event.toLowerCase() === "commit");
  const endIndex = events.indexOf("client.end");
  const projectionIndex = events.indexOf("projection");
  expect(commitIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(commitIndex);
  expect(projectionIndex).toBeGreaterThan(endIndex);
  expect(projection).toHaveBeenCalledWith(env, 10, "student-1", 3);
  expect(events.some((event) => event.includes('insert into "community_posts"'))).toBe(true);
});

it("surfaces projection failure after commit and retries the same linked result without a new post", async () => {
  const events: string[] = [];
  const existingResultRow = [
    1,
    "result-1",
    10,
    "group-1",
    "content-1",
    new Date("2026-08-01T00:00:00.000Z"),
    [{ studentUid: "student-1", tier: 3, pickup: true }],
    [],
    null,
    null,
    null,
    "post-1",
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-01T00:00:00.000Z"),
  ];
  const query = jest.fn(async (config: { text: string } | string) => {
    const text = typeof config === "string" ? config : config.text;
    events.push(text);
    if (text.includes('from "recruitment_results"')) return { rows: [existingResultRow], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => events.push("client.end")),
    query,
  } as unknown as Client;
  projection.mockImplementationOnce(async () => {
    events.push("projection-failure");
    throw new Error("projection failed");
  });
  projection.mockResolvedValue(undefined);

  const input = { recruitmentGroupUid: "group-1", contentUid: "content-1" };
  await expect(upsertPostgresRecruitmentResult(env, 10, input, { createClient: () => client })).rejects.toThrow(
    "projection failed",
  );
  const firstCommit = events.findIndex((event) => event.toLowerCase() === "commit");
  const firstFailure = events.indexOf("projection-failure");
  expect(firstFailure).toBeGreaterThan(firstCommit);

  await expect(upsertPostgresRecruitmentResult(env, 10, input, { createClient: () => client })).resolves.toMatchObject({
    uid: "result-1",
    commentPostUid: "post-1",
  });
  expect(events.filter((event) => event.includes('insert into "community_posts"'))).toHaveLength(0);
});
