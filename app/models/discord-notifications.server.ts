import { nanoid } from "nanoid/non-secure";
import type { Client } from "pg";
import {
  DiscordOwnershipConflictError,
  withDiscordOwnershipTransaction,
  withDiscordUserTransaction,
} from "~/db/postgres/identity";
import type { DiscordConnectionStatus, DiscordNotificationTrigger } from "~/db/postgres/schema";
import {
  DISCORD_NOTIFICATION_DEFAULTS,
  type DiscordNotificationSettingsInput,
  DiscordNotificationValidationError,
  validateDiscordNotificationSettings,
} from "~/domain/discord-notifications";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export { DiscordNotificationValidationError };

type DiscordNotificationSettingsKey =
  | "eventStartEnabled"
  | "eventEndEnabled"
  | "rewardExchangeEndEnabled"
  | "recruitmentStartEnabled"
  | "shopResetEnabled"
  | "feedbackReplyEnabled"
  | "eventOpinionReplyEnabled";

const PREFERENCE_KEYS: ReadonlyArray<{
  type: DiscordNotificationTrigger;
  key: DiscordNotificationSettingsKey;
}> = [
  { type: "event-start", key: "eventStartEnabled" },
  { type: "event-end", key: "eventEndEnabled" },
  { type: "reward-exchange-end", key: "rewardExchangeEndEnabled" },
  { type: "recruitment-start", key: "recruitmentStartEnabled" },
  { type: "shop-reset", key: "shopResetEnabled" },
  { type: "feedback-reply", key: "feedbackReplyEnabled" },
  { type: "event-opinion-reply", key: "eventOpinionReplyEnabled" },
];

export type DiscordConnection = {
  status: DiscordConnectionStatus;
};

export type PendingDiscordConnection = {
  status: "pending";
  connectionUid: string;
  connectionVersion: number;
};

export type DiscordNotificationSettings = DiscordNotificationSettingsInput & {
  effectiveAt: string;
};

export type DiscordNotificationState = {
  connection: DiscordConnection | null;
  settings: DiscordNotificationSettings;
};

export type DiscordNotificationRepositoryOptions = {
  ctx?: ExecutionContext;
  now?: () => Date;
  createClient?: PostgresClientFactory;
};

type QueryRow = Record<string, unknown>;

type StoredPreference = {
  enabled: boolean;
  effectiveAt: Date;
};

type MappedPreferences = {
  settings: DiscordNotificationSettings;
  byType: Map<DiscordNotificationTrigger, StoredPreference>;
};

function requiredDate(row: QueryRow, key: string): Date {
  const value = row[key];
  if (value === null || value === undefined) throw new Error(`Missing Discord notification setting: ${key}`);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Discord notification setting: ${key}`);
  return date;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === 1;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function mapConnection(row: QueryRow | undefined): DiscordConnection | null {
  if (!row || row.status === null || row.status === undefined) return null;
  const status = String(row.status);
  if (status !== "pending" && status !== "active" && status !== "failed") return null;
  return { status: status as DiscordConnectionStatus };
}

export class DiscordNotificationSettingsInconsistentError extends Error {
  constructor() {
    super("알림 설정의 공통 알림 시점을 확인할 수 없어요.");
    this.name = "DiscordNotificationSettingsInconsistentError";
  }
}

function isNotificationType(value: unknown): value is DiscordNotificationTrigger {
  return typeof value === "string" && PREFERENCE_KEYS.some(({ type }) => type === value);
}

function mapPreferences(rows: readonly QueryRow[], now: Date): MappedPreferences {
  const byType = new Map<DiscordNotificationTrigger, StoredPreference>();
  let leadHours: number | undefined;
  let effectiveAt: Date | undefined;

  for (const row of rows) {
    if (!isNotificationType(row.notification_type)) continue;
    const rowLeadHours = Number(row.lead_hours);
    if (!Number.isInteger(rowLeadHours) || rowLeadHours < 1 || rowLeadHours > 24) {
      throw new DiscordNotificationSettingsInconsistentError();
    }
    if (leadHours !== undefined && leadHours !== rowLeadHours) {
      throw new DiscordNotificationSettingsInconsistentError();
    }
    leadHours = rowLeadHours;
    const rowEffectiveAt = requiredDate(row, "effective_at");
    effectiveAt = effectiveAt ? new Date(Math.max(effectiveAt.getTime(), rowEffectiveAt.getTime())) : rowEffectiveAt;
    byType.set(row.notification_type, {
      enabled: asBoolean(row.enabled),
      effectiveAt: rowEffectiveAt,
    });
  }

  const resolvedLeadHours = leadHours ?? DISCORD_NOTIFICATION_DEFAULTS.leadHours;
  const settings = {
    eventStartEnabled: byType.get("event-start")?.enabled ?? false,
    eventEndEnabled: byType.get("event-end")?.enabled ?? false,
    rewardExchangeEndEnabled: byType.get("reward-exchange-end")?.enabled ?? false,
    recruitmentStartEnabled: byType.get("recruitment-start")?.enabled ?? false,
    shopResetEnabled: byType.get("shop-reset")?.enabled ?? false,
    feedbackReplyEnabled: byType.get("feedback-reply")?.enabled ?? false,
    eventOpinionReplyEnabled: byType.get("event-opinion-reply")?.enabled ?? false,
    leadHours: resolvedLeadHours,
    effectiveAt: (effectiveAt ?? now).toISOString(),
  };
  return { settings, byType };
}

export function parseDiscordNotificationSettingsForm(formData: FormData): DiscordNotificationSettingsInput {
  const booleanValue = (name: string) => {
    const value = formData.get(name);
    return value === "true" || value === "on" || value === "1";
  };
  const leadHoursValue = formData.get("leadHours");
  const input: DiscordNotificationSettingsInput = {
    eventStartEnabled: booleanValue("eventStartEnabled"),
    eventEndEnabled: booleanValue("eventEndEnabled"),
    rewardExchangeEndEnabled: booleanValue("rewardExchangeEndEnabled"),
    recruitmentStartEnabled: booleanValue("recruitmentStartEnabled"),
    shopResetEnabled: booleanValue("shopResetEnabled"),
    feedbackReplyEnabled: booleanValue("feedbackReplyEnabled"),
    eventOpinionReplyEnabled: booleanValue("eventOpinionReplyEnabled"),
    leadHours: Number(leadHoursValue ?? Number.NaN),
  };
  return validateDiscordNotificationSettings(input);
}

function preferenceTypeListSql(): string {
  return PREFERENCE_KEYS.map(({ type }) => `'${type}'`).join(", ");
}

async function readPreferences(client: Pick<Client, "query">, userId: number): Promise<QueryRow[]> {
  const result = await client.query(
    `select notification_type, enabled, lead_hours, effective_at
       from notification_preferences
      where user_id = $1 and notification_type in (${preferenceTypeListSql()})
      order by notification_type`,
    [userId],
  );
  return result.rows;
}

export async function getDiscordNotificationState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<DiscordNotificationState> {
  const now = options.now?.() ?? new Date();
  return withPostgresClient(
    env,
    async (client) => {
      const channelResult = await client.query(
        `select status
           from notification_channels
          where user_id = $1 and channel_type = 'discord'
          limit 1`,
        [userId],
      );
      const preferences = await readPreferences(client, userId);
      return {
        connection: mapConnection(channelResult.rows[0]),
        settings: mapPreferences(preferences, now).settings,
      };
    },
    options.createClient,
    options.ctx,
  );
}

export class DiscordIdentityAlreadyLinkedError extends Error {
  constructor() {
    super("이미 다른 선생님 계정에 연결된 Discord 계정이에요.");
    this.name = "DiscordIdentityAlreadyLinkedError";
  }
}

export class DiscordSettingsUnavailableError extends Error {
  constructor() {
    super("Discord 연결을 완료한 뒤 알림 설정을 저장해주세요.");
    this.name = "DiscordSettingsUnavailableError";
  }
}

export async function saveDiscordNotificationSettings(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  input: DiscordNotificationSettingsInput,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<DiscordNotificationSettings> {
  const validated = validateDiscordNotificationSettings(input);
  const now = options.now?.() ?? new Date();
  return withDiscordUserTransaction(
    env,
    "save_discord_notification_settings",
    userId,
    async (_db, client) => {
      const channel = await client.query(
        `select status
           from notification_channels
          where user_id = $1 and channel_type = 'discord'
          for update`,
        [userId],
      );
      if (channel.rows[0]?.status !== "active") {
        throw new DiscordSettingsUnavailableError();
      }

      const preferences = await readPreferences(client, userId);
      const existing = mapPreferences(preferences, now);
      const leadHoursChanged = existing.settings.leadHours !== validated.leadHours;
      const effectiveTimes = PREFERENCE_KEYS.map(({ type, key }) => {
        const stored = existing.byType.get(type);
        const enabled = validated[key];
        const preserveEffectiveAt =
          stored &&
          stored.enabled === enabled &&
          (!leadHoursChanged || type === "feedback-reply" || type === "event-opinion-reply");
        return {
          type,
          enabled,
          effectiveAt: preserveEffectiveAt ? stored.effectiveAt : now,
        };
      });

      const values: unknown[] = [];
      const rowsSql = effectiveTimes.map(({ type, enabled, effectiveAt }, index) => {
        const offset = index * 5 + 2;
        values.push(type, enabled, validated.leadHours, effectiveAt, now);
        return `($1, $${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 4})`;
      });
      await client.query(
        `insert into notification_preferences
           (user_id, notification_type, enabled, lead_hours, effective_at, created_at, updated_at)
         values ${rowsSql.join(", ")}
         on conflict (user_id, notification_type) do update set
           enabled = excluded.enabled,
           lead_hours = excluded.lead_hours,
           effective_at = excluded.effective_at,
           updated_at = excluded.updated_at`,
        [userId, ...values],
      );
      const effectiveAt = new Date(Math.max(...effectiveTimes.map(({ effectiveAt: value }) => value.getTime())));
      return { ...validated, effectiveAt: effectiveAt.toISOString() };
    },
    options,
  );
}

export async function unlinkDiscordConnection(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<void> {
  const now = options.now?.() ?? new Date();
  await withDiscordUserTransaction(
    env,
    "unlink_discord_connection",
    userId,
    async (_db, client) => {
      const channelResult = await client.query(
        `select uid
           from notification_channels
          where user_id = $1 and channel_type = 'discord'
          for update`,
        [userId],
      );
      const channelUid = channelResult.rows[0]?.uid;
      if (channelUid === undefined) return;
      await client.query(
        `update notification_jobs
            set status = 'cancelled', last_error = 'Discord connection unlinked', updated_at = $2
          where channel_uid = $1 and status in ('materialized', 'publishing', 'queued', 'sending', 'blocked')`,
        [channelUid, now],
      );
      await client.query(
        `delete from notification_channels
          where uid = $1 and user_id = $2 and channel_type = 'discord'`,
        [channelUid, userId],
      );
    },
    options,
  );
}

/**
 * Creates the Discord login identity and pending notification channel
 * together, or resets the existing channel in the same ownership transaction.
 * The Discord ID remains server-side throughout this operation.
 */
export async function upsertPendingDiscordConnection(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  discordUserId: string,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<PendingDiscordConnection> {
  const normalizedDiscordUserId = discordUserId.trim();
  if (!/^\d{2,32}$/.test(normalizedDiscordUserId)) {
    throw new DiscordNotificationValidationError("Discord 사용자 정보를 확인할 수 없어요.");
  }
  const now = options.now?.() ?? new Date();
  try {
    return await withDiscordOwnershipTransaction(
      env,
      "upsert_pending_discord_connection",
      { userId, discordUserId: normalizedDiscordUserId },
      async (_db, client) => {
        const existingChannel = await client.query(
          `select uid
             from notification_channels
            where user_id = $1 and channel_type = 'discord'
            for update`,
          [userId],
        );
        const uid = String(existingChannel.rows[0]?.uid ?? nanoid(16));
        await client.query(
          `insert into auth_identities (sensei_id, provider, provider_user_id)
           values ($1, 'discord', $2)
           on conflict (provider, provider_user_id) do nothing`,
          [userId, normalizedDiscordUserId],
        );
        await client.query(
          `insert into notification_channels
           (uid, user_id, channel_type, recipient_key, status, failure_reason, verified_at, last_verification_at,
            created_at, updated_at)
         values ($1, $2, 'discord', $3, 'pending', null, null, null, $4, $4)
         on conflict (user_id, channel_type) do update set
           uid = excluded.uid, recipient_key = excluded.recipient_key, status = 'pending',
           failure_reason = null, verified_at = null, last_verification_at = null, updated_at = excluded.updated_at`,
          [uid, userId, normalizedDiscordUserId, now],
        );
        return {
          status: "pending" as const,
          connectionUid: uid,
          connectionVersion: now.getTime(),
        };
      },
      options,
    );
  } catch (error) {
    if (error instanceof DiscordOwnershipConflictError || isUniqueViolation(error)) {
      throw new DiscordIdentityAlreadyLinkedError();
    }
    throw error;
  }
}

export async function markDiscordConnectionFailed(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  reason: string,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<void> {
  const now = options.now?.() ?? new Date();
  await withDiscordUserTransaction(
    env,
    "mark_discord_connection_failed",
    userId,
    async (_db, client) => {
      await client.query(
        `update notification_channels
            set status = 'failed', failure_reason = $2, last_verification_at = $3, updated_at = $3
          where user_id = $1 and channel_type = 'discord' and status = 'pending'`,
        [userId, reason.slice(0, 500), now],
      );
    },
    options,
  );
}
