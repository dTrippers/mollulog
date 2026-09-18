import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { parseStudentStateDraftValue } from "~/domain/student-state";
import { getAllStudentsMap } from "~/models/student";
import { createSyncDraft } from "~/models/sync-draft";
import { action } from "~/routes/connect.import._index";
import { FakePostgresClient } from "../../helpers/fake-postgres";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => mockLogger) }));
jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: (...args: unknown[]) => mockWithPostgresClient(...args),
}));
jest.mock("~/models/sync-draft", () => {
  const actual = jest.requireActual<typeof import("~/models/sync-draft")>("~/models/sync-draft");
  return { ...actual, createSyncDraft: jest.fn() };
});

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockWithPostgresClient = jest.fn<(...args: unknown[]) => Promise<unknown>>();

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetAllStudentsMap = getAllStudentsMap as jest.MockedFunction<typeof getAllStudentsMap>;
const mockedCreateSyncDraft = createSyncDraft as jest.MockedFunction<typeof createSyncDraft>;
const actualCreateSyncDraft =
  jest.requireActual<typeof import("~/models/sync-draft")>("~/models/sync-draft").createSyncDraft;

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

const env = {} as Env;

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function importRequest(payload: string): Request {
  const formData = new FormData();
  formData.set("payload", payload);
  return new Request("http://127.0.0.1:8787/connect/import", { method: "POST", body: formData });
}

function schaleDbPayload(count: number): string {
  return JSON.stringify(
    Object.fromEntries(Array.from({ length: count }, (_, index) => [String(900000 + index), { s: 3 }])),
  );
}

const schaleDbTwoStudents = JSON.stringify({ "1001": { s: 5, l: 80 }, "1002": { s: 3 } });

const justin163Payload = JSON.stringify({
  exportVersion: 2,
  characters: [
    {
      id: "1001",
      name: "테스트",
      current: {
        star: 5,
        ue: 0,
        ue_level: "0",
        level: "80",
        book_hp: "0",
        book_atk: "0",
        book_heal: "0",
        ex: "3",
        basic: "5",
        passive: "5",
        sub: "5",
        gear1: "5",
        gear2: "5",
        gear3: "5",
        bond_gear: "0",
        bond: "50",
      },
      target: {
        star: 5,
        ue: 1,
        ue_level: "1",
        level: "90",
        book_hp: "0",
        book_atk: "0",
        book_heal: "0",
        ex: "5",
        basic: "10",
        passive: "10",
        sub: "10",
        gear1: "10",
        gear2: "10",
        gear3: "10",
        bond_gear: "0",
        bond: "100",
      },
      enabled: true,
    },
  ],
  language: "Kr",
  level_cap: 90,
  server: "Global",
  site_version: "1.4.21",
});

describe("connect import action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetAllStudentsMap.mockResolvedValue({
      "1001": { uid: "1001" },
      "1002": { uid: "1002" },
    } as never);
    mockedCreateSyncDraft.mockResolvedValue("draft-abc-123");
  });

  it("creates a draft directly from a valid SchaleDB payload without any HTTP call", async () => {
    const before = Date.now();
    const result = await action({
      request: importRequest(schaleDbTwoStudents),
      context: { cloudflare: { env } },
      params: {},
    } as never);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/connect/import/draft-abc-123");

    expect(mockedCreateSyncDraft).toHaveBeenCalledTimes(1);
    const [calledEnv, calledUserId, input] = mockedCreateSyncDraft.mock.calls[0];
    expect(calledEnv).toBe(env);
    expect(calledUserId).toBe(7);
    expect(input.source).toBe("web");
    expect(input.type).toBe("student_state");
    expect(input.toolName).toBe("SchaleDB 데이터 가져오기");
    expect(input.entries).toHaveLength(2);
    expect(input.entries[0]).toMatchObject({ entryKey: "1001", value: 5 });
    expect(JSON.parse(input.entries[0].valueJson as string).current).toMatchObject({ tier: 5, level: 80 });
    expect(input.entries[1]).toMatchObject({ entryKey: "1002", value: 3 });

    const expiresAt = new Date(input.expiresAt as string).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 29 * 24 * 60 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 31 * 24 * 60 * 60 * 1000);
  });

  it("labels Justin163 imports with the Justin163 tool name", async () => {
    const result = await action({
      request: importRequest(justin163Payload),
      context: { cloudflare: { env } },
      params: {},
    } as never);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(mockedCreateSyncDraft).toHaveBeenCalledTimes(1);
    const [, , input] = mockedCreateSyncDraft.mock.calls[0];
    expect(input.toolName).toBe("Justin163 데이터 가져오기");
    expect(JSON.parse(input.entries[0].valueJson as string).target).toMatchObject({
      targetTier: 6,
      targetLevel: 90,
      targetBond: 100,
    });
  });

  it("rejects payloads above the 5,000 entry cap without creating a draft", async () => {
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(schaleDbPayload(5001)),
        context: { cloudflare: { env } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toContain("5,000");
    expect(mockedCreateSyncDraft).not.toHaveBeenCalled();
  });

  it("rejects unknown student UIDs with the full list and no draft", async () => {
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(JSON.stringify({ "1001": { s: 5 }, "999999": { s: 3 }, "888888": { s: 4 } })),
        context: { cloudflare: { env } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toContain("999999");
    expect(result.data.error).toContain("888888");
    expect(result.data.error).not.toContain("1001");
    expect(mockedCreateSyncDraft).not.toHaveBeenCalled();
  });

  it("passes domain validation errors through verbatim without logging them", async () => {
    mockedCreateSyncDraft.mockRejectedValueOnce(new Error("학생 등급은 1부터 9까지의 정수만 입력해주세요"));
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(schaleDbTwoStudents),
        context: { cloudflare: { env } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe("학생 등급은 1부터 9까지의 정수만 입력해주세요");
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("shows the generic message and logs when the student catalog lookup fails", async () => {
    mockedGetAllStudentsMap.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(schaleDbTwoStudents),
        context: { cloudflare: { env } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe("데이터를 가져오지 못했어요.");
    expect(result.data.error).not.toContain("ECONNREFUSED");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

describe("connect import action with the real sync draft model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetAllStudentsMap.mockResolvedValue({
      "1001": { uid: "1001" },
      "1002": { uid: "1002" },
    } as never);
    mockedCreateSyncDraft.mockImplementation(actualCreateSyncDraft);
    mockWithPostgresClient.mockImplementation(async (env: unknown, operation: unknown) =>
      (operation as (client: unknown) => Promise<unknown>)((env as { __pgClient: unknown }).__pgClient),
    );
  });

  function realModelEnv(db: FakePostgresClient): Env {
    return { HYPERDRIVE: { connectionString: "fake://connect-import" }, __pgClient: db } as unknown as Env;
  }

  function expectStoredEntriesAreReviewable(db: FakePostgresClient, expectedCount: number) {
    expect(db.drafts).toHaveLength(1);
    const draft = db.drafts[0];
    expect(draft?.source).toBe("web");
    expect(draft?.type).toBe("student_state");
    expect(draft?.status).toBe("pending");
    expect(draft?.userId).toBe(7);
    expect(draft?.expiresAt).toBeTruthy();

    const storedEntries = db.entries.filter((entry) => entry.draftUid === draft?.uid);
    expect(storedEntries).toHaveLength(expectedCount);
    for (const entry of storedEntries) {
      const valueJson = entry.valueJson as string;
      expect(Object.keys(JSON.parse(valueJson)).sort()).toEqual(["current", "target"]);
      const parsedValue = parseStudentStateDraftValue({ value: entry.value as number, valueJson });
      const expectedValue = parsedValue.current?.tier ?? parsedValue.target?.targetTier ?? 1;
      expect(entry.value).toBe(expectedValue);
    }
    return { draft, storedEntries };
  }

  it("stores reviewable draft rows for a real SchaleDB payload end to end", async () => {
    const db = new FakePostgresClient();
    const result = await action({
      request: importRequest(schaleDbTwoStudents),
      context: { cloudflare: { env: realModelEnv(db) } },
      params: {},
    } as never);

    expect(result).toBeInstanceOf(Response);
    const { draft, storedEntries } = expectStoredEntriesAreReviewable(db, 2);
    expect((result as Response).headers.get("Location")).toBe(`/connect/import/${draft?.uid}`);
    expect(draft?.toolName).toBe("SchaleDB 데이터 가져오기");

    const byEntryKey = new Map(storedEntries.map((entry) => [entry.entryKey, entry]));
    expect(byEntryKey.get("1001")?.value).toBe(5);
    expect(JSON.parse(byEntryKey.get("1001")?.valueJson as string).current).toMatchObject({ tier: 5, level: 80 });
    expect(byEntryKey.get("1002")?.value).toBe(3);
  });

  it("stores reviewable draft rows for a real Justin163 payload end to end", async () => {
    const db = new FakePostgresClient();
    const result = await action({
      request: importRequest(justin163Payload),
      context: { cloudflare: { env: realModelEnv(db) } },
      params: {},
    } as never);

    expect(result).toBeInstanceOf(Response);
    const { draft, storedEntries } = expectStoredEntriesAreReviewable(db, 1);
    expect((result as Response).headers.get("Location")).toBe(`/connect/import/${draft?.uid}`);
    expect(draft?.toolName).toBe("Justin163 데이터 가져오기");

    const value = JSON.parse(storedEntries[0]?.valueJson as string);
    expect(value.current).toMatchObject({ tier: 5, level: 80, bond: 50 });
    expect(value.target).toMatchObject({ targetTier: 6, targetLevel: 90, targetBond: 100 });
  });

  it("surfaces real model validation failures verbatim without logging them", async () => {
    const db = new FakePostgresClient();
    // Tier 3 caps the weapon level at 0, so "wl": 1 is rejected by the real model.
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(JSON.stringify({ "1001": { s: 3, wl: 1 } })),
        context: { cloudflare: { env: realModelEnv(db) } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe("고유무기 레벨은(는) 현재 성급 기준 0부터 0 사이만 입력할 수 있어요");
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(db.drafts).toHaveLength(0);
    expect(db.entries).toHaveLength(0);
  });

  it("shows the generic message and logs raw persistence failures from the real model", async () => {
    const db = new FakePostgresClient();
    mockWithPostgresClient.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const result = expectDataResult<{ error: string }>(
      await action({
        request: importRequest(schaleDbTwoStudents),
        context: { cloudflare: { env: realModelEnv(db) } },
        params: {},
      } as never),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.error).toBe("데이터를 가져오지 못했어요.");
    expect(result.data.error).not.toContain("ECONNREFUSED");
    expect(mockLogger.error).toHaveBeenCalled();
    expect(db.drafts).toHaveLength(0);
  });
});
