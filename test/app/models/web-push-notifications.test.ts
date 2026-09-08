import { describe, expect, it, jest } from "@jest/globals";
import {
  decryptWebPushSecret,
  encryptWebPushSecret,
  fingerprintWebPushEndpoint,
  validateWebPushSubscription,
} from "~/lib/web-push-crypto.server";

const mockWithDiscordUserTransaction = jest.fn();
const mockWithPostgresClient = jest.fn();

jest.mock("~/db/postgres/identity", () => ({
  withDiscordUserTransaction: (...args: unknown[]) => mockWithDiscordUserTransaction(...args),
}));
jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: (...args: unknown[]) => mockWithPostgresClient(...args),
}));

import {
  getWebPushNotificationState,
  isSameOriginMutation,
  recordWebPushDeliveryClick,
  subscribeWebPush,
  unsubscribeWebPush,
} from "~/models/web-push-notifications.server";

const endpoint = "https://push.example.test/send/abc";
const p256dh = "B".repeat(87);
const auth = "A".repeat(22);
const subscription = { endpoint, expirationTime: null, keys: { p256dh, auth } };
const env = {
  HYPERDRIVE: { connectionString: "postgres://unused" },
  WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY: "local-test-encryption-key",
  WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
} as unknown as Env;

describe("Web Push subscription crypto", () => {
  it("accepts same-origin requests and rejects cross-origin or same-site mutations", () => {
    expect(isSameOriginMutation(new Request("https://mollulog.net/api/notifications/web-push"))).toBe(true);
    expect(
      isSameOriginMutation(
        new Request("https://mollulog.net/api/notifications/web-push", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        new Request("https://mollulog.net/api/notifications/web-push", {
          headers: { "Sec-Fetch-Site": "same-site" },
        }),
      ),
    ).toBe(false);
  });

  it("round-trips encrypted values and fingerprints endpoints without exposing plaintext", async () => {
    const encrypted = await encryptWebPushSecret(endpoint, "secret");
    expect(encrypted).not.toContain(endpoint);
    await expect(decryptWebPushSecret(encrypted, "secret")).resolves.toBe(endpoint);
    await expect(fingerprintWebPushEndpoint(endpoint)).resolves.not.toBe(
      await fingerprintWebPushEndpoint(`${endpoint}/other`),
    );
  });

  it("accepts only HTTPS subscriptions with valid client keys", () => {
    expect(validateWebPushSubscription(subscription)).toEqual(subscription);
    expect(() => validateWebPushSubscription({ ...subscription, endpoint: "http://push.example.test/send" })).toThrow();
    expect(() => validateWebPushSubscription({ ...subscription, keys: { p256dh: "short", auth } })).toThrow();
  });
});

describe("Web Push subscription repository", () => {
  it("creates one account channel and stores encrypted browser secrets", async () => {
    const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client = {
      async query(sql: string, values: readonly unknown[] = []) {
        statements.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
        if (sql.includes("select user_id, status from notification_push_subscriptions"))
          return { rows: [], rowCount: 0 };
        if (sql.includes("insert into notification_channels")) return { rows: [{ uid: "channel-1" }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    };
    mockWithDiscordUserTransaction.mockImplementationOnce(async (_env, _name, _userId, operation) =>
      (operation as (...args: unknown[]) => unknown)({}, client),
    );

    const result = await subscribeWebPush(env, 7, subscription);

    expect(result.status).toBe("active");
    expect(result).not.toHaveProperty("endpoint");
    const insert = statements.find(({ sql }) => sql.startsWith("insert into notification_push_subscriptions"));
    expect(insert).toBeDefined();
    expect(insert?.values).not.toContain(endpoint);
    expect(insert?.values).not.toContain(p256dh);
    expect(insert?.values).not.toContain(auth);
  });

  it("disables only the selected fingerprint and records clicks separately from provider acceptance", async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql.replace(/\s+/g, " ").trim());
        return { rows: [], rowCount: 1 };
      },
    };
    mockWithDiscordUserTransaction.mockImplementation(async (_env, _name, _userId, operation) =>
      (operation as (...args: unknown[]) => unknown)({}, client),
    );
    mockWithPostgresClient.mockImplementation(async (_env, operation) =>
      (operation as (...args: unknown[]) => unknown)(client),
    );
    const fingerprint = await fingerprintWebPushEndpoint(endpoint);

    await expect(unsubscribeWebPush(env, 7, fingerprint)).resolves.toEqual({ status: "disabled" });
    await expect(recordWebPushDeliveryClick(env, 7, "delivery-1234567890123456")).resolves.toBe(true);
    expect(queries.some((query) => query.startsWith("update notification_push_subscriptions"))).toBe(true);
    expect(
      queries.some(
        (query) => query.startsWith("update notification_deliveries") && query.includes("status = 'clicked'"),
      ),
    ).toBe(true);
  });

  it("returns platform configuration and current account state without secrets", async () => {
    const client = {
      async query(sql: string) {
        if (sql.includes("notification_channels")) return { rows: [{ status: "active" }], rowCount: 1 };
        return { rows: [{ status: "active" }], rowCount: 1 };
      },
    };
    mockWithPostgresClient.mockImplementation(async (_env, operation) =>
      (operation as (...args: unknown[]) => unknown)(client),
    );
    const state = await getWebPushNotificationState(env, 7, { currentEndpoint: endpoint });
    expect(state).toEqual({
      configured: true,
      vapidPublicKey: "public-key",
      channelStatus: "active",
      currentSubscriptionStatus: "active",
    });
    expect(JSON.stringify(state)).not.toContain(endpoint);
  });
});
