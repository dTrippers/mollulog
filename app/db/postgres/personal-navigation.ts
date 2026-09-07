import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type PersonalNavigationState = {
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
  unreadNotificationCount: number;
};

export type PostgresPersonalNavigationOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

type PersonalNavigationRow = {
  has_unconsumed_coupons: boolean;
  has_unread_feedback_replies: boolean;
  unread_notification_count: string | number;
};

export async function getPostgresPersonalNavigationState(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresPersonalNavigationOptions = {},
): Promise<PersonalNavigationState> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.operation.name", "select");
        span?.setAttribute("navigation.query_name", "get_personal_state");
        const result = await client.query<PersonalNavigationRow>(
          `select
             exists (
               select 1
               from coupons c
               where (c.expires_at is null or c.expires_at > now())
                 and not exists (
                   select 1
                   from coupon_registrations cr
                   where cr.user_id = $1
                     and cr.coupon_id = c.id
                 )
             ) as has_unconsumed_coupons,
             exists (
               select 1
               from feedback_tickets ft
               join feedback_replies fr
                 on fr.ticket_id = ft.id
                and fr.is_admin = true
                and fr.id > ft.last_seen_admin_reply_id
               where ft.user_id = $1
             ) as has_unread_feedback_replies,
             (
               select count(*)::text
               from notification_jobs nj
               left join notification_read_states nrs
                 on nrs.user_id = nj.user_id
               where nj.user_id = $1
                 and nj.status = 'sent'
                 and nj.delivered_at is not null
                 and nj.trigger <> 'connection-verification'
                 and (nrs.last_read_delivered_at is null or nj.delivered_at > nrs.last_read_delivered_at)
             ) as unread_notification_count`,
          [userId],
        );
        const row = result.rows[0];
        const unreadNotificationCount = Number(row?.unread_notification_count ?? 0);
        if (!Number.isSafeInteger(unreadNotificationCount) || unreadNotificationCount < 0) {
          throw new Error("Invalid notification unread count");
        }
        return {
          hasUnconsumedCoupons: row?.has_unconsumed_coupons ?? false,
          hasUnreadFeedbackReplies: row?.has_unread_feedback_replies ?? false,
          unreadNotificationCount,
        };
      };
      return ctx ? ctx.tracing.enterSpan("postgres.navigation.get_personal_state", execute) : execute();
    },
    createClient,
    ctx,
  );
}
