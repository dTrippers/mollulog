import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRemoveRelationshipLevel = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertRelationshipLevel = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetStudentStateWriteMode = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRelationshipLevels = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetUserResourceInventoryMap = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudentsFavoriteItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/relationship-level", () => ({
  getStudentStateWriteMode: mockGetStudentStateWriteMode,
  getRelationshipLevels: mockGetRelationshipLevels,
  removeRelationshipLevel: mockRemoveRelationshipLevel,
  upsertRelationshipLevel: mockUpsertRelationshipLevel,
}));
jest.mock("~/models/resource", () => ({ getAllStudentsFavoriteItems: mockGetAllStudentsFavoriteItems }));
jest.mock("~/models/student", () => ({
  formatVisibleName: (name: string) => name,
  getAllStudents: mockGetAllStudents,
}));
jest.mock("~/models/user-resource-inventory", () => ({ getUserResourceInventoryMap: mockGetUserResourceInventoryMap }));
jest.mock("~/lib/observability.server", () => ({ getLogger: () => logger }));

import { STUDENT_STATE_STALE_MESSAGE, StaleStudentStateRequestError } from "~/domain/student-state-errors";
import {
  action,
  buildRelationshipSavePayload,
  hasSavedRelationshipState,
  loader,
  RelationshipActionHeader,
  updateRelationshipStudentState,
} from "~/routes/utils.relationship";

const env = {} as Env;

function post(body: unknown) {
  return action({
    context: { cloudflare: { env, ctx: {} } },
    request: new Request("https://mollulog.test/utils/relationship", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  } as never);
}

describe("utils.relationship action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveSensei.mockResolvedValue({ id: 1 });
    mockUpsertRelationshipLevel.mockResolvedValue(undefined);
  });

  it("treats an unmarked gift-only save as a legacy-format request", async () => {
    await expect(post({ studentId: "student-a", items: { "gift-a": 2 } })).resolves.toMatchObject({
      success: true,
    });

    expect(mockUpsertRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "student-a",
      undefined,
      undefined,
      undefined,
      { "gift-a": 2 },
      "legacy",
    );
  });

  it("rejects an unmarked gift-only request as stale after activation", async () => {
    mockUpsertRelationshipLevel.mockRejectedValueOnce(new StaleStudentStateRequestError());

    await expect(post({ studentId: "student-a", items: { "gift-a": 2 } })).resolves.toMatchObject({
      data: { success: false, code: "STUDENT_STATE_STALE" },
      init: { status: 409 },
    });
    expect(mockUpsertRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "student-a",
      undefined,
      undefined,
      undefined,
      { "gift-a": 2 },
      "legacy",
    );
  });

  it("submits the legacy calculator snapshot through the legacy action and model", async () => {
    const payload = buildRelationshipSavePayload(
      "legacy",
      "student-a",
      { currentLevel: 12, currentExp: 42, targetLevel: 20, items: { "gift-a": 3 } },
      { currentLevel: 12, currentExp: 42, targetLevel: 18, items: { "gift-a": 2 } },
    );

    await expect(post(payload)).resolves.toMatchObject({ success: true });
    expect(payload).toEqual({
      studentId: "student-a",
      currentLevel: 12,
      currentExp: 42,
      targetLevel: 20,
      items: { "gift-a": 3 },
    });
    expect(mockUpsertRelationshipLevel).toHaveBeenCalledWith(
      env,
      1,
      "student-a",
      12,
      42,
      20,
      { "gift-a": 3 },
      "legacy",
    );
  });

  it("rejects a legacy batch with an invalid target before writing any item", async () => {
    const response = await post([
      { studentId: "student-a", currentLevel: 12, currentExp: 0, targetLevel: 20, items: {} },
      { studentId: "student-b", currentLevel: 20, currentExp: 0, targetLevel: 19, items: {} },
    ]);

    expect(response).toMatchObject({
      data: { success: false, code: "INVALID_INPUT", error: "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요" },
      init: { status: 400 },
    });
    expect(mockUpsertRelationshipLevel).not.toHaveBeenCalled();
  });

  it("returns the typed stale response as a 409", async () => {
    mockUpsertRelationshipLevel.mockRejectedValueOnce(new StaleStudentStateRequestError());

    await expect(post({ studentId: "student-a", targetLevel: 10, stateFormat: "nullable" })).resolves.toMatchObject({
      data: { success: false, code: "STUDENT_STATE_STALE" },
      init: { status: 409 },
    });
  });

  it("returns a safe retryable 500 for an ordinary save failure", async () => {
    mockUpsertRelationshipLevel.mockRejectedValueOnce(new Error("database detail; password=secret"));

    const response = await post({ studentId: "student-a", targetLevel: 10, stateFormat: "nullable" });

    expect(response).toMatchObject({
      data: { success: false, code: "SAVE_FAILED", error: "저장하지 못했어요", retryable: true },
      init: { status: 500 },
    });
    expect(JSON.stringify(response)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith("Relationship level save failed", expect.any(Error), { userId: 1 });
  });

  it.each([
    "legacy",
    "nullable",
  ] as const)("preserves existing order for equal current ranks in %s mode", async (mode) => {
    mockGetAllStudents.mockResolvedValue([
      { uid: "student-b", name: "B", order: 2 },
      { uid: "student-a", name: "A", order: 1 },
    ]);
    mockGetStudentStateWriteMode.mockResolvedValue(mode);
    mockGetRelationshipLevels.mockResolvedValue([
      { studentId: "student-b", currentLevel: 10, currentExp: null, targetLevel: 20, items: {} },
      { studentId: "student-a", currentLevel: 10, currentExp: null, targetLevel: 20, items: {} },
    ]);
    mockGetUserResourceInventoryMap.mockResolvedValue({});
    mockGetAllStudentsFavoriteItems.mockResolvedValue([]);

    const result = await loader({
      context: { cloudflare: { env } },
      request: new Request("https://mollulog.test/utils/relationship"),
    } as never);

    expect(result.students.map(({ uid }) => uid)).toEqual(["student-a", "student-b"]);
  });
});

describe("RelationshipActionHeader stale state", () => {
  it("shows the shared stale alert even when the calculator has no local save error", () => {
    const markup = renderToStaticMarkup(
      createElement(RelationshipActionHeader, {
        student: { uid: "student-a", name: "Student A" },
        saveState: "idle",
        saveError: null,
        saveSuccess: false,
        staleWriteBlocked: true,
        onRetry: null,
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain(STUDENT_STATE_STALE_MESSAGE);
    expect(markup).toContain("새로고침");
  });
});

describe("relationship student list membership", () => {
  const student = {
    uid: "student-a",
    name: "Student A",
    order: 1,
    hasSavedState: false,
    currentLevel: null,
    currentExp: null,
    targetLevel: null,
    items: {},
  };

  it("includes a target-only student after a calculator save", () => {
    expect(updateRelationshipStudentState(student, { targetLevel: 25 }).hasSavedState).toBe(true);
  });

  it("removes a student after reset clears all saved relationship values", () => {
    const savedStudent = updateRelationshipStudentState(student, { targetLevel: 25 });

    expect(
      updateRelationshipStudentState(savedStudent, {
        currentLevel: null,
        currentExp: null,
        targetLevel: null,
        items: {},
      }).hasSavedState,
    ).toBe(false);
  });

  it("updates membership when a gift plan is added or cleared", () => {
    const giftOnlyStudent = updateRelationshipStudentState(student, { items: { "gift-a": 2 } });

    expect(giftOnlyStudent.hasSavedState).toBe(true);
    expect(updateRelationshipStudentState(giftOnlyStudent, { items: {} }).hasSavedState).toBe(false);
  });

  it("counts only positive gift quantities as saved state", () => {
    expect(hasSavedRelationshipState({ currentLevel: null, targetLevel: null, items: { "gift-a": 0 } })).toBe(false);
  });
});
