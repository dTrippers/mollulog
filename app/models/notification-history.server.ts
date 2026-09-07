import type { Client } from "pg";
import {
  isValidNotificationWatermark,
  NOTIFICATION_HISTORY_LIMIT,
  type NotificationHistoryItem,
  toNotificationHistoryItem,
} from "~/domain/notification-history";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type NotificationHistoryRepositoryOptions = {
  ctx?: ExecutionContext;
  now?: () => Date;
  createClient?: PostgresClientFactory;
};

export type NotificationHistorySnapshot = {
  notifications: NotificationHistoryItem[];
  snapshotMaxDeliveredAt: string | null;
};

export type NotificationHistoryReadResult = {
  unreadCount: number;
};

type NotificationHistoryRow = {
  uid: unknown;
  trigger: unknown;
  payload: unknown;
  delivered_at: Date | string | null;
  delivered_at_text: unknown;
  is_unread: unknown;
};

function toValidDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toValidTimestampText(value: unknown): string | null {
  return isValidNotificationWatermark(value) ? value : null;
}

function toCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid notification unread count");
  }
  return count;
}

async function withNotificationDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (client: Pick<Client, "query">) => Promise<T>,
  options: NotificationHistoryRepositoryOptions,
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "notification_jobs");
        span?.setAttribute("notification.query_name", queryName);
        return operation(client);
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.notification.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getNotificationHistory(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: NotificationHistoryRepositoryOptions = {},
): Promise<NotificationHistorySnapshot> {
  const now = options.now?.() ?? new Date();
  return withNotificationDatabase(
    env,
    "get_history",
    async (client) => {
      const result = await client.query<NotificationHistoryRow>(
        `select j.uid, j.trigger, j.payload, j.delivered_at, j.delivered_at::text as delivered_at_text,
                (s.last_read_delivered_at is null or j.delivered_at > s.last_read_delivered_at) as is_unread
           from notification_jobs j
           left join notification_read_states s
             on s.user_id = j.user_id
          where j.user_id = $1
            and j.status = 'sent'
            and j.delivered_at is not null
            and j.trigger <> 'connection-verification'
          order by j.delivered_at desc, j.id desc
          limit ${NOTIFICATION_HISTORY_LIMIT}`,
        [userId],
      );

      let snapshotMaxDeliveredAt: string | null = null;
      const notifications: NotificationHistoryItem[] = [];
      for (const row of result.rows) {
        const deliveredAt = toValidDate(row.delivered_at);
        const deliveredAtText = toValidTimestampText(row.delivered_at_text);
        if (!deliveredAt || !deliveredAtText) {
          continue;
        }

        const notification = toNotificationHistoryItem({
          uid: row.uid,
          trigger: row.trigger,
          payload: row.payload,
          deliveredAt,
          isUnread: row.is_unread,
          now,
        });
        if (!notification) {
          continue;
        }

        if (snapshotMaxDeliveredAt === null) {
          snapshotMaxDeliveredAt = deliveredAtText;
        }
        notifications.push(notification);
      }

      return {
        notifications,
        snapshotMaxDeliveredAt,
      };
    },
    options,
  );
}

export async function markNotificationHistoryRead(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  watermark: unknown,
  options: NotificationHistoryRepositoryOptions = {},
): Promise<NotificationHistoryReadResult> {
  if (!isValidNotificationWatermark(watermark)) {
    throw new Error("Invalid notification read watermark");
  }

  const now = options.now?.() ?? new Date();
  return withNotificationDatabase(
    env,
    "mark_read",
    async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `insert into notification_read_states
             (user_id, last_read_delivered_at, created_at, updated_at)
           select $1, max(j.delivered_at), $3, $3
             from notification_jobs j
            where j.user_id = $1
              and j.status = 'sent'
              and j.delivered_at is not null
              and j.delivered_at <= $2
              and j.trigger <> 'connection-verification'
           having max(j.delivered_at) is not null
           on conflict (user_id) do update set
             last_read_delivered_at = case
               when notification_read_states.last_read_delivered_at is null
                 or notification_read_states.last_read_delivered_at < excluded.last_read_delivered_at
               then excluded.last_read_delivered_at
               else notification_read_states.last_read_delivered_at
             end,
             updated_at = excluded.updated_at`,
          [userId, watermark, now],
        );

        const unreadResult = await client.query<{ unread_count: string | number }>(
          `select count(*)::text as unread_count
             from notification_jobs j
             left join notification_read_states s
               on s.user_id = j.user_id
            where j.user_id = $1
              and j.status = 'sent'
              and j.delivered_at is not null
              and j.trigger <> 'connection-verification'
              and (s.last_read_delivered_at is null or j.delivered_at > s.last_read_delivered_at)`,
          [userId],
        );
        await client.query("COMMIT");

        return { unreadCount: toCount(unreadResult.rows[0]?.unread_count ?? 0) };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original database failure.
        }
        throw error;
      }
    },
    options,
  );
}
