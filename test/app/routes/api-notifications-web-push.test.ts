import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import {
  getWebPushNotificationState,
  recordWebPushDeliveryClick,
  subscribeWebPush,
  unsubscribeWebPush,
} from "~/models/web-push-notifications.server";
import { action, loader } from "~/routes/api.notifications.web-push";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/web-push-notifications.server", () => ({
  getWebPushNotificationState: jest.fn(),
  isSameOriginMutation: (request: Request) => {
    const origin = request.headers.get("Origin");
    return !origin || origin === new URL(request.url).origin;
  },
  recordWebPushDeliveryClick: jest.fn(),
  subscribeWebPush: jest.fn(),
  unsubscribeWebPush: jest.fn(),
}));

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedState = getWebPushNotificationState as jest.MockedFunction<typeof getWebPushNotificationState>;
const mockedSubscribe = subscribeWebPush as jest.MockedFunction<typeof subscribeWebPush>;
const mockedUnsubscribe = unsubscribeWebPush as jest.MockedFunction<typeof unsubscribeWebPush>;
const mockedClick = recordWebPushDeliveryClick as jest.MockedFunction<typeof recordWebPushDeliveryClick>;
const logger = { error: jest.fn(), info: jest.fn() };
const env = { WEB_PUSH_VAPID_PUBLIC_KEY: "public" } as unknown as Env;
const ctx = {} as never;

function args(request: Request) {
  return { request, context: { cloudflare: { env, ctx } }, params: {} } as never;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://mollulog.net/api/notifications/web-push", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Web Push notification API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger as never);
  });

  it("returns only the public VAPID key from the authenticated loader", async () => {
    const result = (await loader(
      args(new Request("https://mollulog.net/api/notifications/web-push")),
    )) as unknown as Response;
    expect(result).toMatchObject({ data: { vapidPublicKey: "public" } });
  });

  it("rejects cross-origin mutations before reading subscription data", async () => {
    const result = (await action(
      args(request({ intent: "click", deliveryUid: "delivery-1234567890123456" }, { Origin: "https://evil.example" })),
    )) as unknown as Response;
    expect(result).toMatchObject({ init: { status: 403 } });
    expect(mockedClick).not.toHaveBeenCalled();
  });

  it("does not return subscription secrets after registration", async () => {
    mockedSubscribe.mockResolvedValue({ fingerprint: "A".repeat(43), status: "active" });
    const result = (await action(
      args(
        request({
          intent: "subscribe",
          subscription: {
            endpoint: "https://push.example.test/send/abc",
            expirationTime: null,
            keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
          },
        }),
      ),
    )) as { data: unknown };
    expect(JSON.stringify(result.data)).not.toContain("push.example.test");
    expect(result.data).toMatchObject({ ok: true, status: "active" });
  });

  it("records click independently and returns a safe response", async () => {
    mockedClick.mockResolvedValue(true);
    const result = (await action(args(request({ intent: "click", deliveryUid: "delivery-1234567890123456" })))) as {
      data: unknown;
    };
    expect(result.data).toEqual({ ok: true });
    expect(mockedClick).toHaveBeenCalledWith(env, 7, "delivery-1234567890123456", { ctx });
  });

  it("accepts current-browser unsubscribe and clears its browser marker", async () => {
    mockedUnsubscribe.mockResolvedValue({ status: "disabled" });
    const result = await action(args(request({ intent: "unsubscribe", fingerprint: "A".repeat(43) })));
    expect(result).toMatchObject({ data: { ok: true, status: "disabled" } });
    expect((result as { init?: { headers?: Headers } }).init?.headers).toBeDefined();
  });

  it("returns server state for a browser subscription without exposing its endpoint", async () => {
    mockedState.mockResolvedValue({
      configured: true,
      vapidPublicKey: "public",
      channelStatus: "active",
      currentSubscriptionStatus: "active",
    });
    const result = (await action(
      args(
        request({
          intent: "status",
          subscription: {
            endpoint: "https://push.example.test/send/abc",
            expirationTime: null,
            keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
          },
        }),
      ),
    )) as { data: unknown };
    expect(result.data).toEqual({
      ok: true,
      state: {
        configured: true,
        vapidPublicKey: "public",
        channelStatus: "active",
        currentSubscriptionStatus: "active",
      },
    });
    expect(JSON.stringify(result.data)).not.toContain("push.example.test");
  });
});
