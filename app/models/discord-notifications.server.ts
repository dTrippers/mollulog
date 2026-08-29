import { nanoid } from "nanoid/non-secure";
import {
  DiscordOwnershipConflictError,
  withDiscordOwnershipTransaction,
  withDiscordUserTransaction,
} from "~/db/postgres/identity";
import type { DiscordConnectionStatus, DiscordNotificationTimingMode } from "~/db/postgres/schema";
import {
  DISCORD_NOTIFICATION_DEFAULTS,
  type DiscordNotificationSettingsInput,
  DiscordNotificationValidationError,
  validateDiscordNotificationSettings,
} from "~/domain/discord-notifications";
import { type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export { DiscordNotificationValidationError };

export type DiscordConnection = {
  uid: string;
  discordUserId: string;
  status: DiscordConnectionStatus;
  failureReason: string | null;
  verifiedAt: string | null;
  lastVerificationAt: string | null;
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

function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === 1;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

function mapConnection(row: QueryRow | undefined): DiscordConnection | null {
  if (!row || row.uid === null || row.uid === undefined) return null;
  const status = String(row.status);
  if (status !== "pending" && status !== "active" && status !== "failed") return null;
  return {
    uid: String(row.uid),
    discordUserId: String(row.discord_user_id),
    status: status as DiscordConnectionStatus,
    failureReason: row.failure_reason ? String(row.failure_reason) : null,
    verifiedAt: asDate(row.verified_at),
    lastVerificationAt: asDate(row.last_verification_at),
  };
}

function mapSettings(row: QueryRow | undefined, now: Date): DiscordNotificationSettings {
  if (!row) {
    return { ...DISCORD_NOTIFICATION_DEFAULTS, effectiveAt: now.toISOString() };
  }
  return {
    eventStartEnabled: asBoolean(row.event_start_enabled),
    eventEndEnabled: asBoolean(row.event_end_enabled),
    rewardExchangeEndEnabled: asBoolean(row.reward_exchange_end_enabled),
    recruitmentStartEnabled: asBoolean(row.recruitment_start_enabled),
    timingMode: String(row.timing_mode) as DiscordNotificationTimingMode,
    kstHour: Number(row.kst_hour),
    effectiveAt: asDate(row.effective_at) ?? now.toISOString(),
  };
}

function isSameSettings(a: DiscordNotificationSettings, b: DiscordNotificationSettingsInput): boolean {
  return (
    a.eventStartEnabled === b.eventStartEnabled &&
    a.eventEndEnabled === b.eventEndEnabled &&
    a.rewardExchangeEndEnabled === b.rewardExchangeEndEnabled &&
    a.recruitmentStartEnabled === b.recruitmentStartEnabled &&
    a.timingMode === b.timingMode &&
    a.kstHour === b.kstHour
  );
}

export function parseDiscordNotificationSettingsForm(formData: FormData): DiscordNotificationSettingsInput {
  const booleanValue = (name: string) => {
    const value = formData.get(name);
    return value === "true" || value === "on" || value === "1";
  };
  const timingModeValue = formData.get("timingMode");
  const kstHourValue = formData.get("kstHour");
  const input: DiscordNotificationSettingsInput = {
    eventStartEnabled: booleanValue("eventStartEnabled"),
    eventEndEnabled: booleanValue("eventEndEnabled"),
    rewardExchangeEndEnabled: booleanValue("rewardExchangeEndEnabled"),
    recruitmentStartEnabled: booleanValue("recruitmentStartEnabled"),
    timingMode: (typeof timingModeValue === "string" ? timingModeValue : "") as DiscordNotificationTimingMode,
    kstHour: Number(kstHourValue ?? Number.NaN),
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
      const [connectionResult, settingsResult] = await Promise.all([
        client.query(
          `select uid, discord_user_id, status, failure_reason, verified_at, last_verification_at
             from discord_connections where user_id = $1 limit 1`,
          [userId],
        ),
        client.query(
          `select event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
                  recruitment_start_enabled, timing_mode, kst_hour, effective_at
             from discord_notification_settings where user_id = $1 limit 1`,
          [userId],
        ),
      ]);
      return {
        connection: mapConnection(connectionResult.rows[0]),
        settings: mapSettings(settingsResult.rows[0], now),
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
    super("Discord 연동을 완료한 뒤 알림 설정을 저장해주세요.");
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
      const connection = await client.query(`select status from discord_connections where user_id = $1 for update`, [
        userId,
      ]);
      if (connection.rows[0]?.status !== "active") {
        throw new DiscordSettingsUnavailableError();
      }

      const existingResult = await client.query(
        `select event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
                  recruitment_start_enabled, timing_mode, kst_hour, effective_at
             from discord_notification_settings where user_id = $1 for update`,
        [userId],
      );
      const existing = mapSettings(existingResult.rows[0], now);
      const effectiveAt = isSameSettings(existing, validated) ? new Date(existing.effectiveAt) : now;

      await client.query(
        `insert into discord_notification_settings
             (user_id, event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
              recruitment_start_enabled, timing_mode, kst_hour, effective_at, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
           on conflict (user_id) do update set
             event_start_enabled = excluded.event_start_enabled,
             event_end_enabled = excluded.event_end_enabled,
             reward_exchange_end_enabled = excluded.reward_exchange_end_enabled,
             recruitment_start_enabled = excluded.recruitment_start_enabled,
             timing_mode = excluded.timing_mode,
             kst_hour = excluded.kst_hour,
             effective_at = excluded.effective_at,
             updated_at = excluded.updated_at`,
        [
          userId,
          validated.eventStartEnabled,
          validated.eventEndEnabled,
          validated.rewardExchangeEndEnabled,
          validated.recruitmentStartEnabled,
          validated.timingMode,
          validated.kstHour,
          effectiveAt,
          now,
        ],
      );
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
      await client.query(`select id from discord_connections where user_id = $1 for update`, [userId]);
      await client.query(
        `insert into discord_notification_settings
           (user_id, event_start_enabled, event_end_enabled, reward_exchange_end_enabled,
            recruitment_start_enabled, timing_mode, kst_hour, effective_at, created_at, updated_at)
         values ($1, false, false, false, false, 'day-before', 11, $2, $2, $2)
         on conflict (user_id) do update set
           event_start_enabled = false, event_end_enabled = false,
           reward_exchange_end_enabled = false, recruitment_start_enabled = false,
           effective_at = excluded.effective_at, updated_at = excluded.updated_at`,
        [userId, now],
      );
      await client.query(
        `update discord_notification_jobs
            set status = 'cancelled', last_error = 'Discord connection unlinked', updated_at = $2
          where user_id = $1 and status in ('pending', 'materialized', 'publishing', 'queued', 'sending', 'blocked')`,
        [userId, now],
      );
      await client.query(
        `update discord_notification_outbox outbox
            set status = 'cancelled', last_error = 'Discord connection unlinked', updated_at = $2
          where outbox.status in ('pending', 'publishing')
            and exists (
              select 1 from discord_notification_jobs job
               where job.uid = outbox.job_uid and job.user_id = $1
                 and job.status = 'cancelled'
            )`,
        [userId, now],
      );
      await client.query(`delete from discord_connections where user_id = $1`, [userId]);
    },
    options,
  );
}

export async function upsertPendingDiscordConnection(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  discordUserId: string,
  options: DiscordNotificationRepositoryOptions = {},
): Promise<DiscordConnection> {
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
      async (_db, client, ownership) => {
        if (
          !ownership.identities.some(
            (identity) => identity.userId === userId && identity.discordUserId === normalizedDiscordUserId,
          )
        ) {
          throw new DiscordNotificationValidationError("Discord 로그인 계정을 먼저 연결해주세요.");
        }
        const existingUser = await client.query(`select uid from discord_connections where user_id = $1 for update`, [
          userId,
        ]);
        const uid = String(existingUser.rows[0]?.uid ?? nanoid(16));
        await client.query(
          `insert into discord_connections
           (uid, user_id, discord_user_id, status, failure_reason, verified_at, last_verification_at, created_at, updated_at)
         values ($1, $2, $3, 'pending', null, null, null, $4, $4)
         on conflict (user_id) do update set
           uid = excluded.uid, discord_user_id = excluded.discord_user_id, status = 'pending',
           failure_reason = null, verified_at = null, last_verification_at = null, updated_at = excluded.updated_at`,
          [uid, userId, normalizedDiscordUserId, now],
        );
        return {
          uid,
          discordUserId: normalizedDiscordUserId,
          status: "pending" as const,
          failureReason: null,
          verifiedAt: null,
          lastVerificationAt: null,
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
        `update discord_connections set status = 'failed', failure_reason = $2, last_verification_at = $3, updated_at = $3
         where user_id = $1 and status = 'pending'`,
        [userId, reason.slice(0, 500), now],
      );
    },
    options,
  );
}
