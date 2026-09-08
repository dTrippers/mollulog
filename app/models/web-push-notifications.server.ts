import type { Client } from "pg";
import { type IdentityRepositoryOptions, withDiscordUserTransaction } from "~/db/postgres/identity";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";
import {
  encryptWebPushSecret,
  fingerprintWebPushEndpoint,
  validateWebPushSubscription,
  WebPushConfigurationError,
  type WebPushSubscriptionInput,
  WebPushSubscriptionValidationError,
} from "~/lib/web-push-crypto.server";

export { WebPushConfigurationError, WebPushSubscriptionValidationError };

export type WebPushSubscriptionStatus = "active" | "disabled" | "expired" | "failed";
export type WebPushChannelStatus = "active" | "disabled" | "failed";

export type WebPushNotificationState = {
  configured: boolean;
  vapidPublicKey: string | null;
  channelStatus: WebPushChannelStatus | null;
  currentSubscriptionStatus: WebPushSubscriptionStatus | null;
};

export type WebPushNotificationRepositoryOptions = IdentityRepositoryOptions & {
  now?: () => Date;
  createClient?: PostgresClientFactory;
  currentEndpoint?: string;
};

type QueryRow = Record<string, unknown>;

function requiredEncryptionSecret(env: Pick<Env, "WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY">): string {
  const secret = env.WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY;
  if (!secret) throw new WebPushConfigurationError();
  return secret;
}

function randomUid(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

function channelRecipientKey(userId: number): string {
  return `user:${userId}`;
}

function mapSubscriptionStatus(value: unknown): WebPushSubscriptionStatus | null {
  if (value === "active" || value === "disabled" || value === "expired" || value === "failed") return value;
  return null;
}

function mapChannelStatus(value: unknown): WebPushChannelStatus | null {
  if (value === "active" || value === "disabled" || value === "failed") return value;
  return null;
}

export function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return false;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return fetchSite === null || fetchSite === "same-origin";
}

export async function getWebPushNotificationState(
  env: Pick<Env, "HYPERDRIVE" | "WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY" | "WEB_PUSH_VAPID_PUBLIC_KEY">,
  userId: number,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<WebPushNotificationState> {
  const endpoint = options.currentEndpoint;
  let fingerprint: string | null = null;
  if (endpoint) fingerprint = await fingerprintWebPushEndpoint(endpoint);
  return withPostgresClient(
    env,
    async (client) => {
      const channelResult = await client.query<QueryRow>(
        `select status from notification_channels where user_id = $1 and channel_type = 'web-push' limit 1`,
        [userId],
      );
      let currentSubscriptionStatus: WebPushSubscriptionStatus | null = null;
      if (fingerprint) {
        const subscriptionResult = await client.query<QueryRow>(
          `select status from notification_push_subscriptions where user_id = $1 and endpoint_fingerprint = $2 limit 1`,
          [userId, fingerprint],
        );
        currentSubscriptionStatus = mapSubscriptionStatus(subscriptionResult.rows[0]?.status);
      }
      return {
        configured: Boolean(env.WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY),
        vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
        channelStatus: mapChannelStatus(channelResult.rows[0]?.status),
        currentSubscriptionStatus,
      };
    },
    options.createClient,
    options.ctx,
  );
}

export async function subscribeWebPush(
  env: Pick<Env, "HYPERDRIVE" | "WEB_PUSH_SUBSCRIPTION_ENCRYPTION_KEY">,
  userId: number,
  rawInput: WebPushSubscriptionInput,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<{ fingerprint: string; status: "active" }> {
  const input = validateWebPushSubscription(rawInput);
  const encryptionSecret = requiredEncryptionSecret(env);
  const fingerprint = await fingerprintWebPushEndpoint(input.endpoint);
  const [endpointCiphertext, p256dhCiphertext, authCiphertext] = await Promise.all([
    encryptWebPushSecret(input.endpoint, encryptionSecret),
    encryptWebPushSecret(input.keys.p256dh, encryptionSecret),
    encryptWebPushSecret(input.keys.auth, encryptionSecret),
  ]);
  const now = options.now?.() ?? new Date();
  const expiresAt = input.expirationTime ? new Date(input.expirationTime) : null;

  await withDiscordUserTransaction(
    env,
    "subscribe_web_push",
    userId,
    async (_db, client: Client) => {
      const existing = await client.query<QueryRow>(
        `select user_id, status from notification_push_subscriptions where endpoint_fingerprint = $1 for update`,
        [fingerprint],
      );
      const ownerId = existing.rows[0]?.user_id;
      if (ownerId !== undefined && Number(ownerId) !== userId && existing.rows[0]?.status !== "disabled") {
        throw new WebPushSubscriptionValidationError("이 브라우저 알림은 다른 계정에 연결되어 있어요.");
      }

      const channelResult = await client.query<{ uid: string }>(
        `insert into notification_channels
           (uid, user_id, channel_type, recipient_key, status, activated_at, created_at, updated_at)
         values ($1, $2, 'web-push', $3, 'active', $4, $4, $4)
         on conflict (user_id, channel_type) do update set status = 'active', failure_reason = null, activated_at = excluded.activated_at, updated_at = excluded.updated_at
         returning uid`,
        [randomUid(), userId, channelRecipientKey(userId), now],
      );
      const channelUid = channelResult.rows[0]?.uid;
      if (!channelUid) throw new Error("Web Push channel could not be persisted");

      await client.query(
        `insert into notification_push_subscriptions
          (uid, channel_uid, user_id, endpoint_ciphertext, p256dh_ciphertext, auth_ciphertext,
            endpoint_fingerprint, status, activated_at, expires_at, last_error, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, null, $10, $10)
         on conflict (endpoint_fingerprint) do update set
           channel_uid = excluded.channel_uid,
           user_id = excluded.user_id,
           endpoint_ciphertext = excluded.endpoint_ciphertext,
           p256dh_ciphertext = excluded.p256dh_ciphertext,
           auth_ciphertext = excluded.auth_ciphertext,
           status = 'active', activated_at = excluded.activated_at, expires_at = excluded.expires_at,
           last_error = null, updated_at = excluded.updated_at`,
        [
          randomUid(),
          channelUid,
          userId,
          endpointCiphertext,
          p256dhCiphertext,
          authCiphertext,
          fingerprint,
          now,
          expiresAt,
          now,
        ],
      );
    },
    options,
  );
  return { fingerprint, status: "active" };
}

export async function unsubscribeWebPush(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  fingerprint: string,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<{ status: "disabled" | "not-found" }> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(fingerprint)) return { status: "not-found" };
  const now = options.now?.() ?? new Date();
  return withDiscordUserTransaction(
    env,
    "unsubscribe_web_push",
    userId,
    async (_db, client: Client) => {
      const result = await client.query(
        `update notification_push_subscriptions
            set status = 'disabled', updated_at = $3
          where user_id = $1 and endpoint_fingerprint = $2 and status <> 'disabled'`,
        [userId, fingerprint, now],
      );
      await client.query(
        `update notification_channels c set status = case when exists (
             select 1 from notification_push_subscriptions s where s.channel_uid = c.uid and s.status = 'active'
           ) then 'active' else 'disabled' end, updated_at = $2
         where c.user_id = $1 and c.channel_type = 'web-push'`,
        [userId, now],
      );
      return { status: (result.rowCount ?? 0) > 0 ? "disabled" : "not-found" };
    },
    options,
  );
}

export async function deactivateWebPushSubscription(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  fingerprint: string,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(fingerprint)) return;
  await unsubscribeWebPush(env, userId, fingerprint, options);
}

export async function recordWebPushDeliveryClick(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  deliveryUid: string,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(deliveryUid)) return false;
  const now = options.now?.() ?? new Date();
  return withPostgresClient(
    env,
    async (client) => {
      const result = await client.query(
        `update notification_deliveries
            set status = 'clicked', clicked_at = coalesce(clicked_at, $3), updated_at = $3
          where uid = $1 and user_id = $2 and target_type = 'web-push' and status in ('accepted', 'clicked')`,
        [deliveryUid, userId, now],
      );
      return (result.rowCount ?? 0) === 1;
    },
    options.createClient,
    options.ctx,
  );
}

export async function deactivateSubscriptionFromCookie(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  fingerprint: string | null,
  options: WebPushNotificationRepositoryOptions = {},
): Promise<void> {
  if (fingerprint) await deactivateWebPushSubscription(env, userId, fingerprint, options);
}
