import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type PersonalNavigationState = {
  hasUnconsumedCoupons: boolean;
  hasUnreadFeedbackReplies: boolean;
};

export type PostgresPersonalNavigationOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

type PersonalNavigationRow = {
  has_unconsumed_coupons: boolean;
  has_unread_feedback_replies: boolean;
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
             ) as has_unread_feedback_replies`,
          [userId],
        );
        const row = result.rows[0];
        return {
          hasUnconsumedCoupons: row?.has_unconsumed_coupons ?? false,
          hasUnreadFeedbackReplies: row?.has_unread_feedback_replies ?? false,
        };
      };
      return ctx ? ctx.tracing.enterSpan("postgres.navigation.get_personal_state", execute) : execute();
    },
    createClient,
    ctx,
  );
}
