import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { StudentStateMergeConflictError } from "~/domain/student-state-errors";
import {
  applySyncDraft,
  discardSyncDraft,
  getSyncDraft,
  SyncDraftAlreadyProcessedError,
  SyncDraftNotFoundError,
  SyncDraftSelectionError,
} from "~/models/sync-draft";
import { action } from "~/routes/connect.import.$draftUid";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn(() => mockLogger) }));
jest.mock("~/models/sync-draft", () => {
  const actual = jest.requireActual<typeof import("~/models/sync-draft")>("~/models/sync-draft");
  return { ...actual, applySyncDraft: jest.fn(), discardSyncDraft: jest.fn(), getSyncDraft: jest.fn() };
});

const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetSyncDraft = getSyncDraft as jest.MockedFunction<typeof getSyncDraft>;
const mockedApplySyncDraft = applySyncDraft as jest.MockedFunction<typeof applySyncDraft>;
const mockedDiscardSyncDraft = discardSyncDraft as jest.MockedFunction<typeof discardSyncDraft>;

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

const itemDraft = {
  uid: "draft-1",
  type: "item_inventory",
  status: "pending",
  entries: [
    { uid: "entry-1", entryKey: "item-a", value: 1, valueJson: null, meta: null },
    { uid: "entry-2", entryKey: "item-b", value: 2, valueJson: null, meta: null },
  ],
} as never;

function call(fields: Array<[string, string]>, draftUid: string | undefined = "draft-1") {
  const formData = new FormData();
  for (const [name, value] of fields) formData.append(name, value);
  return action({
    context: { cloudflare: { env: {}, ctx: {} } },
    request: new Request("http://127.0.0.1:8787/connect/import/draft-1", { method: "POST", body: formData }),
    params: draftUid ? { draftUid } : {},
  } as never);
}

function expectData(result: unknown) {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  const { data, init } = result as DataResult<Record<string, unknown>>;
  return { data, status: init?.status };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveSensei.mockResolvedValue({ id: 5 } as never);
  mockedGetSyncDraft.mockResolvedValue(itemDraft);
  mockedApplySyncDraft.mockResolvedValue(undefined as never);
  mockedDiscardSyncDraft.mockResolvedValue(undefined as never);
});

describe("connect import draft action", () => {
  it("applies only the selected entries and redirects to the pending list", async () => {
    const result = await call([
      ["intent", "apply"],
      ["selected", "item-b"],
      ["value:item-a", "10"],
      ["value:item-b", "20"],
    ]);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/connect/import");
    expect(mockedApplySyncDraft).toHaveBeenCalledWith(
      expect.anything(),
      5,
      "draft-1",
      expect.objectContaining({
        selectedEntryKeys: ["item-b"],
        entryUpdates: [{ entryKey: "item-b", value: 20 }],
      }),
    );
  });

  it("validates only the selected entries, so an invalid unselected value does not block the apply", async () => {
    const result = await call([
      ["intent", "apply"],
      ["selected", "item-b"],
      ["value:item-a", "not a number"],
      ["value:item-b", "20"],
    ]);

    expect((result as Response).headers.get("Location")).toBe("/connect/import");
    expect(mockedApplySyncDraft).toHaveBeenCalledTimes(1);
  });

  it("returns field errors for an invalid selected value without applying", async () => {
    const result = await call([
      ["intent", "apply"],
      ["selected", "item-a"],
      ["value:item-a", "not a number"],
    ]);

    const { data, status } = expectData(result);
    expect(status).toBe(400);
    expect(data).toMatchObject({ intent: "apply", code: "invalid_input" });
    expect(Object.keys(data.fieldErrors as object)).toEqual(["item-a"]);
    expect(mockedApplySyncDraft).not.toHaveBeenCalled();
  });

  it("maps a rejected selection to a coded, user-worded result", async () => {
    mockedApplySyncDraft.mockRejectedValueOnce(new SyncDraftSelectionError("반영할 항목을 선택해주세요"));

    const { data, status } = expectData(
      await call([
        ["intent", "apply"],
        ["value:item-a", "1"],
      ]),
    );

    expect(status).toBe(400);
    expect(data).toEqual({ intent: "apply", code: "invalid_selection", error: "반영할 항목을 선택해주세요" });
  });

  it("reports a draft that was already processed or no longer exists", async () => {
    mockedGetSyncDraft.mockResolvedValueOnce({ ...(itemDraft as object), status: "applied" } as never);
    expect(expectData(await call([["intent", "apply"]]))).toMatchObject({
      status: 409,
      data: { code: "already_processed" },
    });

    mockedGetSyncDraft.mockResolvedValueOnce(null);
    expect(expectData(await call([["intent", "apply"]]))).toMatchObject({ status: 404, data: { code: "not_found" } });

    mockedApplySyncDraft.mockRejectedValueOnce(new SyncDraftAlreadyProcessedError());
    expect(
      expectData(
        await call([
          ["intent", "apply"],
          ["selected", "item-a"],
          ["value:item-a", "1"],
        ]),
      ),
    ).toMatchObject({
      status: 409,
      data: { code: "already_processed" },
    });

    mockedDiscardSyncDraft.mockRejectedValueOnce(new SyncDraftNotFoundError());
    expect(expectData(await call([["intent", "discard"]]))).toMatchObject({ status: 404, data: { code: "not_found" } });
  });

  it("maps a merge conflict to a conflict result with its safe message", async () => {
    mockedApplySyncDraft.mockRejectedValueOnce(new StudentStateMergeConflictError());

    const { data, status } = expectData(
      await call([
        ["intent", "apply"],
        ["selected", "item-a"],
        ["value:item-a", "1"],
      ]),
    );

    expect(status).toBe(409);
    expect(data).toEqual({ intent: "apply", code: "conflict", error: new StudentStateMergeConflictError().message });
  });

  it("logs an unexpected failure and returns a code without the raw error", async () => {
    mockedApplySyncDraft.mockRejectedValueOnce(new Error("connection reset by peer 10.0.0.7"));
    const applied = expectData(
      await call([
        ["intent", "apply"],
        ["selected", "item-a"],
        ["value:item-a", "1"],
      ]),
    );
    expect(applied.status).toBe(500);
    expect(applied.data).toEqual({ intent: "apply", code: "apply_failed" });

    mockedDiscardSyncDraft.mockRejectedValueOnce(new Error("connection reset by peer 10.0.0.7"));
    const discarded = expectData(await call([["intent", "discard"]]));
    expect(discarded.status).toBe(500);
    expect(discarded.data).toEqual({ intent: "discard", code: "discard_failed" });

    expect(mockLogger.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([applied, discarded])).not.toContain("10.0.0.7");
  });

  it("rejects unauthenticated requests and unknown intents", async () => {
    mockedGetActiveSensei.mockResolvedValueOnce(null as never);
    expect(expectData(await call([["intent", "apply"]]))).toMatchObject({
      status: 401,
      data: { code: "unauthorized" },
    });

    expect(expectData(await call([["intent", "delete"]]))).toMatchObject({
      status: 400,
      data: { code: "unsupported" },
    });
    expect(mockedApplySyncDraft).not.toHaveBeenCalled();
    expect(mockedDiscardSyncDraft).not.toHaveBeenCalled();
  });
});
