import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getNotificationHistory, markNotificationHistoryRead } from "~/models/notification-history.server";
import { action, loader } from "~/routes/api.notifications";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/notification-history.server", () => ({
  getNotificationHistory: jest.fn(),
  markNotificationHistoryRead: jest.fn(),
}));

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetNotificationHistory = getNotificationHistory as jest.MockedFunction<typeof getNotificationHistory>;
const mockedMarkNotificationHistoryRead = markNotificationHistoryRead as jest.MockedFunction<
  typeof markNotificationHistoryRead
>;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const env = {} as Env;
const ctx = { waitUntil: jest.fn() } as never;

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function args(method = "GET", body?: unknown) {
  return {
    request: new Request("https://mollulog.net/api/notifications", {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    context: { cloudflare: { env, ctx } },
    params: {},
  } as never;
}

describe("notification history API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger as never);
  });

  it("does not return notification data to a signed-out request", async () => {
    mockedGetActiveSensei.mockResolvedValue(null);

    const response = expectDataResult<{ error: string }>(await loader(args()));

    expect(response.init?.status).toBe(401);
    expect(response.data.error).toBe("로그인이 필요해요");
    expect(mockedGetNotificationHistory).not.toHaveBeenCalled();
  });

  it("returns the authenticated account's snapshot", async () => {
    mockedGetNotificationHistory.mockResolvedValue({
      notifications: [],
      snapshotMaxDeliveredAt: null,
    });

    const response = expectDataResult<{ notifications: unknown[]; snapshotMaxDeliveredAt: string | null }>(
      await loader(args()),
    );

    expect(response.data).toEqual({ notifications: [], snapshotMaxDeliveredAt: null });
    expect(mockedGetNotificationHistory).toHaveBeenCalledWith(env, 7, { ctx });
  });

  it("hides an unexpected history failure behind the public load error", async () => {
    const internalError = new Error("relation notification_jobs does not exist");
    mockedGetNotificationHistory.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(await loader(args()));

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("알림을 불러오지 못했어요");
    expect(JSON.stringify(response.data)).not.toContain("notification_jobs");
    expect(logger.error).toHaveBeenCalledWith("Notification history load failed", internalError, { userId: 7 });
  });

  it("rejects malformed read requests and keeps the read model untouched", async () => {
    const response = expectDataResult<{ error: string }>(
      await action(args("POST", { intent: "mark-read", watermark: "not-a-date" })),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data.error).toBe("잘못된 요청이에요");
    expect(mockedMarkNotificationHistoryRead).not.toHaveBeenCalled();
  });

  it("returns the remaining unread count after a successful snapshot read", async () => {
    mockedMarkNotificationHistoryRead.mockResolvedValue({ unreadCount: 1 });

    const response = expectDataResult<{ ok: true; unreadCount: number }>(
      await action(args("POST", { intent: "mark-read", watermark: "2026-09-07T11:00:00.000Z" })),
    );

    expect(response.data).toEqual({ ok: true, unreadCount: 1 });
    expect(mockedMarkNotificationHistoryRead).toHaveBeenCalledWith(env, 7, "2026-09-07T11:00:00.000Z", { ctx });
  });

  it("does not expose a read persistence failure", async () => {
    const internalError = new Error("permission denied for notification_read_states");
    mockedMarkNotificationHistoryRead.mockRejectedValue(internalError);

    const response = expectDataResult<{ error: string }>(
      await action(args("POST", { intent: "mark-read", watermark: "2026-09-07T11:00:00.000Z" })),
    );

    expect(response.init?.status).toBe(500);
    expect(response.data.error).toBe("알림을 읽음 처리하지 못했어요");
    expect(JSON.stringify(response.data)).not.toContain("notification_read_states");
    expect(logger.error).toHaveBeenCalledWith("Notification read state update failed", internalError, { userId: 7 });
  });
});
