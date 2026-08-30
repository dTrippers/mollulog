import { nanoid } from "nanoid/non-secure";
import {
  DiscordOwnershipConflictError,
  withDiscordOwnershipTransaction,
  withDiscordUserTransaction,
} from "~/db/postgres/identity";
import type { DiscordConnectionStatus } from "~/db/postgres/schema";
import {
  DISCORD_NOTIFICATION_DEFAULTS,
  type DiscordNotificationSettingsInput,
  DiscordNotificationValidationError,
  validateDiscordNotificationSettings,
} from "~/domain/discord-notifications";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export { DiscordNotificationValidationError };

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

type DiscordNotificationEffectiveTimes = {
  eventStartEffectiveAt: Date;
  eventEndEffectiveAt: Date;
  rewardExchangeEndEffectiveAt: Date;
  recruitmentStartEffectiveAt: Date;
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

function mapSettings(row: QueryRow | undefined, now: Date): DiscordNotificationSettings {
  if (!row) {
    return { ...DISCORD_NOTIFICATION_DEFAULTS, effectiveAt: now.toISOString() };
  }
  const effectiveTimes = mapEffectiveTimes(row);
  return {
    eventStartEnabled: asBoolean(row.event_start_enabled),
    eventEndEnabled: asBoolean(row.event_end_enabled),
    rewardExchangeEndEnabled: asBoolean(row.reward_exchange_end_enabled),
    recruitmentStartEnabled: asBoolean(row.recruitment_start_enabled),
    leadHours: Number(row.lead_hours),
    effectiveAt: new Date(Math.max(...Object.values(effectiveTimes).map((value) => value.getTime()))).toISOString(),
  };
}

function mapEffectiveTimes(row: QueryRow): DiscordNotificationEffectiveTimes {
  return {
    eventStartEffectiveAt: requiredDate(row, "event_start_effective_at"),
    eventEndEffectiveAt: requiredDate(row, "event_end_effective_at"),
    rewardExchangeEndEffectiveAt: requiredDate(row, "reward_exchange_end_effective_at"),
    recruitmentStartEffectiveAt: requiredDate(row, "recruitment_start_effective_at"),
  };
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
    leadHours: Number(leadHoursValue ?? Number.NaN),
  };
  return validateDiscordNotificationSettings(input);
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
      const connectionResult = await client.query(
        `select status,
                event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
                recruitment_start_enabled, lead_hours,
                event_start_effective_at, event_end_effective_at,
                reward_exchange_end_effective_at, recruitment_start_effective_at
           from discord_notification_subscriptions where user_id = $1 limit 1`,
        [userId],
      );
      const row = connectionResult.rows[0];
      return {
        connection: mapConnection(row),
        settings: mapSettings(row, now),
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
      const subscription = await client.query(
        `select status, event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
                recruitment_start_enabled, lead_hours,
                event_start_effective_at, event_end_effective_at,
                reward_exchange_end_effective_at, recruitment_start_effective_at
           from discord_notification_subscriptions where user_id = $1 for update`,
        [userId],
      );
      if (subscription.rows[0]?.status !== "active") {
        throw new DiscordSettingsUnavailableError();
      }

      const existing = mapSettings(subscription.rows[0], now);
      const existingEffectiveTimes = mapEffectiveTimes(subscription.rows[0]);
      const leadHoursChanged = existing.leadHours !== validated.leadHours;
      const effectiveAtWhenChanged = (changed: boolean, current: Date) => (changed || leadHoursChanged ? now : current);
      const effectiveTimes: DiscordNotificationEffectiveTimes = {
        eventStartEffectiveAt: effectiveAtWhenChanged(
          existing.eventStartEnabled !== validated.eventStartEnabled,
          existingEffectiveTimes.eventStartEffectiveAt,
        ),
        eventEndEffectiveAt: effectiveAtWhenChanged(
          existing.eventEndEnabled !== validated.eventEndEnabled,
          existingEffectiveTimes.eventEndEffectiveAt,
        ),
        rewardExchangeEndEffectiveAt: effectiveAtWhenChanged(
          existing.rewardExchangeEndEnabled !== validated.rewardExchangeEndEnabled,
          existingEffectiveTimes.rewardExchangeEndEffectiveAt,
        ),
        recruitmentStartEffectiveAt: effectiveAtWhenChanged(
          existing.recruitmentStartEnabled !== validated.recruitmentStartEnabled,
          existingEffectiveTimes.recruitmentStartEffectiveAt,
        ),
      };

      await client.query(
        `update discord_notification_subscriptions
            set event_start_enabled = $2,
                event_end_enabled = $3,
                reward_exchange_end_enabled = $4,
                recruitment_start_enabled = $5,
                lead_hours = $6,
                event_start_effective_at = $7,
                event_end_effective_at = $8,
                reward_exchange_end_effective_at = $9,
                recruitment_start_effective_at = $10,
                updated_at = $11
          where user_id = $1`,
        [
          userId,
          validated.eventStartEnabled,
          validated.eventEndEnabled,
          validated.rewardExchangeEndEnabled,
          validated.recruitmentStartEnabled,
          validated.leadHours,
          effectiveTimes.eventStartEffectiveAt,
          effectiveTimes.eventEndEffectiveAt,
          effectiveTimes.rewardExchangeEndEffectiveAt,
          effectiveTimes.recruitmentStartEffectiveAt,
          now,
        ],
      );
      const effectiveAt = new Date(Math.max(...Object.values(effectiveTimes).map((value) => value.getTime())));
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
      await client.query(`select id from discord_notification_subscriptions where user_id = $1 for update`, [userId]);
      await client.query(
        `update discord_notification_jobs
            set status = 'cancelled', last_error = 'Discord connection unlinked', updated_at = $2
          where user_id = $1 and status in ('materialized', 'publishing', 'queued', 'sending', 'blocked')`,
        [userId, now],
      );
      await client.query(`delete from discord_notification_subscriptions where user_id = $1`, [userId]);
    },
    options,
  );
}

/**
 * Creates the Discord login identity and pending notification subscription
 * together, or resets the existing subscription in the same ownership
 * transaction. The Discord ID remains server-side throughout this operation.
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
        const existingUser = await client.query(
          `select uid from discord_notification_subscriptions where user_id = $1 for update`,
          [userId],
        );
        const uid = String(existingUser.rows[0]?.uid ?? nanoid(16));
        await client.query(
          `insert into auth_identities (sensei_id, provider, provider_user_id)
           values ($1, 'discord', $2)
           on conflict (provider, provider_user_id) do nothing`,
          [userId, normalizedDiscordUserId],
        );
        await client.query(
          `insert into discord_notification_subscriptions
           (uid, user_id, discord_user_id, status, failure_reason, verified_at, last_verification_at,
            event_start_enabled, event_end_enabled, reward_exchange_end_enabled, recruitment_start_enabled,
            lead_hours, event_start_effective_at, event_end_effective_at,
            reward_exchange_end_effective_at, recruitment_start_effective_at, created_at, updated_at)
         values ($1, $2, $3, 'pending', null, null, null, false, false, false, false, 24,
                 $4, $4, $4, $4, $4, $4)
         on conflict (user_id) do update set
           uid = excluded.uid, discord_user_id = excluded.discord_user_id, status = 'pending',
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
        `update discord_notification_subscriptions set status = 'failed', failure_reason = $2, last_verification_at = $3, updated_at = $3
         where user_id = $1 and status = 'pending'`,
        [userId, reason.slice(0, 500), now],
      );
    },
    options,
  );
}
