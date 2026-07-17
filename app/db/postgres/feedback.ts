import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid/non-secure";
import { pgFeedbackRepliesTable, pgFeedbackTicketsTable } from "~/db/postgres/schema";
import type { FeedbackAdditional } from "~/domain/feedback";
import { normalizeInstant, type UtcIsoString } from "~/lib/date-time";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type FeedbackTicketStatus = "waiting" | "in_progress" | "resolved";

export type FeedbackTicket = {
  id: number;
  uid: string;
  userId: number;
  title: string;
  content: string;
  status: FeedbackTicketStatus;
  replyEmail: string | null;
  lastSeenAdminReplyId: number;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
};

export type FeedbackReply = {
  id: number;
  uid: string;
  ticketId: number;
  userId: number;
  isAdmin: boolean;
  content: string;
  createdAt: UtcIsoString;
};

export type FeedbackThread = {
  ticket: FeedbackTicket;
  replies: FeedbackReply[];
};

export type PostgresFeedbackOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

const ticketSelection = {
  id: pgFeedbackTicketsTable.id,
  uid: pgFeedbackTicketsTable.uid,
  userId: pgFeedbackTicketsTable.userId,
  title: pgFeedbackTicketsTable.title,
  content: pgFeedbackTicketsTable.content,
  status: pgFeedbackTicketsTable.status,
  replyEmail: pgFeedbackTicketsTable.replyEmail,
  lastSeenAdminReplyId: pgFeedbackTicketsTable.lastSeenAdminReplyId,
  createdAt: pgFeedbackTicketsTable.createdAt,
  updatedAt: pgFeedbackTicketsTable.updatedAt,
};

type UserFeedbackTicketRow = Omit<typeof pgFeedbackTicketsTable.$inferSelect, "additional">;

function toUtcIso(value: Date | string): UtcIsoString {
  return normalizeInstant(value instanceof Date ? value.toISOString() : value);
}

function toFeedbackTicketStatus(status: string): FeedbackTicketStatus {
  if (status === "in_progress" || status === "resolved" || status === "waiting") {
    return status;
  }
  return "waiting";
}

function toFeedbackTicket(row: UserFeedbackTicketRow): FeedbackTicket {
  return {
    id: row.id,
    uid: row.uid,
    userId: row.userId,
    title: row.title,
    content: row.content,
    status: toFeedbackTicketStatus(row.status),
    replyEmail: row.replyEmail,
    lastSeenAdminReplyId: row.lastSeenAdminReplyId,
    createdAt: toUtcIso(row.createdAt),
    updatedAt: toUtcIso(row.updatedAt),
  };
}

function toFeedbackReply(row: typeof pgFeedbackRepliesTable.$inferSelect): FeedbackReply {
  return {
    id: row.id,
    uid: row.uid,
    ticketId: row.ticketId,
    userId: row.userId,
    isAdmin: row.isAdmin,
    content: row.content,
    createdAt: toUtcIso(row.createdAt),
  };
}

async function withFeedbackDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  queryName: string,
  operation: (db: NodePgDatabase) => Promise<T>,
  options: PostgresFeedbackOptions = {},
): Promise<T> {
  const { ctx, createClient = createPostgresClient } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const execute = async (span?: { setAttribute(name: string, value: string | number | boolean): void }) => {
        span?.setAttribute("db.system.name", "postgresql");
        span?.setAttribute("db.collection.name", "feedback_tickets");
        span?.setAttribute("feedback.query_name", queryName);
        return operation(drizzle(client));
      };
      return ctx ? ctx.tracing.enterSpan(`postgres.feedback.${queryName}`, execute) : execute();
    },
    createClient,
    ctx,
  );
}

export async function getPostgresFeedbackTicketsByUserId(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresFeedbackOptions = {},
): Promise<FeedbackTicket[]> {
  return withFeedbackDatabase(
    env,
    "get_tickets_by_user",
    async (db) => {
      const rows = await db
        .select(ticketSelection)
        .from(pgFeedbackTicketsTable)
        .where(eq(pgFeedbackTicketsTable.userId, userId))
        .orderBy(desc(pgFeedbackTicketsTable.updatedAt), desc(pgFeedbackTicketsTable.id));
      return rows.map(toFeedbackTicket);
    },
    options,
  );
}

export async function getPostgresFeedbackTicketByUidForUser(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  userId: number,
  options: PostgresFeedbackOptions = {},
): Promise<FeedbackTicket | null> {
  return withFeedbackDatabase(
    env,
    "get_ticket_by_uid_for_user",
    async (db) => {
      const [row] = await db
        .select(ticketSelection)
        .from(pgFeedbackTicketsTable)
        .where(and(eq(pgFeedbackTicketsTable.uid, uid), eq(pgFeedbackTicketsTable.userId, userId)))
        .limit(1);
      return row ? toFeedbackTicket(row) : null;
    },
    options,
  );
}

export async function getPostgresFeedbackThreadByUidForUser(
  env: Pick<Env, "HYPERDRIVE">,
  uid: string,
  userId: number,
  options: PostgresFeedbackOptions = {},
): Promise<FeedbackThread | null> {
  return withFeedbackDatabase(
    env,
    "get_thread_by_uid_for_user",
    async (db) => {
      const [ticketRow] = await db
        .select(ticketSelection)
        .from(pgFeedbackTicketsTable)
        .where(and(eq(pgFeedbackTicketsTable.uid, uid), eq(pgFeedbackTicketsTable.userId, userId)))
        .limit(1);
      if (!ticketRow) {
        return null;
      }

      const replyRows = await db
        .select()
        .from(pgFeedbackRepliesTable)
        .where(eq(pgFeedbackRepliesTable.ticketId, ticketRow.id))
        .orderBy(asc(pgFeedbackRepliesTable.createdAt), asc(pgFeedbackRepliesTable.id));
      return {
        ticket: toFeedbackTicket(ticketRow),
        replies: replyRows.map(toFeedbackReply),
      };
    },
    options,
  );
}

export async function hasPostgresUnreadAdminFeedbackReplies(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  options: PostgresFeedbackOptions = {},
): Promise<boolean> {
  return withFeedbackDatabase(
    env,
    "has_unread_admin_replies",
    async (db) => {
      const rows = await db
        .select({ id: pgFeedbackRepliesTable.id })
        .from(pgFeedbackTicketsTable)
        .innerJoin(
          pgFeedbackRepliesTable,
          and(
            eq(pgFeedbackRepliesTable.ticketId, pgFeedbackTicketsTable.id),
            eq(pgFeedbackRepliesTable.isAdmin, true),
            gt(pgFeedbackRepliesTable.id, pgFeedbackTicketsTable.lastSeenAdminReplyId),
          ),
        )
        .where(eq(pgFeedbackTicketsTable.userId, userId))
        .limit(1);
      return rows.length > 0;
    },
    options,
  );
}

export async function markPostgresFeedbackTicketAdminRepliesSeen(
  env: Pick<Env, "HYPERDRIVE">,
  ticket: Pick<FeedbackTicket, "id" | "userId" | "lastSeenAdminReplyId">,
  latestAdminReplyId: number,
  options: PostgresFeedbackOptions = {},
): Promise<void> {
  if (latestAdminReplyId <= ticket.lastSeenAdminReplyId) {
    return;
  }

  await withFeedbackDatabase(
    env,
    "mark_admin_replies_seen",
    async (db) => {
      await db
        .update(pgFeedbackTicketsTable)
        .set({ lastSeenAdminReplyId: latestAdminReplyId })
        .where(
          and(
            eq(pgFeedbackTicketsTable.id, ticket.id),
            eq(pgFeedbackTicketsTable.userId, ticket.userId),
            sql`${pgFeedbackTicketsTable.lastSeenAdminReplyId} < ${latestAdminReplyId}`,
          ),
        );
    },
    options,
  );
}

export async function createPostgresFeedbackTicket(
  env: Pick<Env, "HYPERDRIVE">,
  userId: number,
  title: string,
  content: string,
  replyEmail: string | null,
  additional: FeedbackAdditional | null,
  options: PostgresFeedbackOptions = {},
): Promise<string> {
  return withFeedbackDatabase(
    env,
    "create_ticket",
    async (db) => {
      const uid = nanoid(8);
      const now = new Date();
      await db.insert(pgFeedbackTicketsTable).values({
        uid,
        userId,
        title,
        content,
        additional,
        replyEmail,
        createdAt: now,
        updatedAt: now,
      });
      return uid;
    },
    options,
  );
}

export async function createPostgresFeedbackReply(
  env: Pick<Env, "HYPERDRIVE">,
  ticketId: number,
  userId: number,
  content: string,
  options: PostgresFeedbackOptions = {},
): Promise<string> {
  return withFeedbackDatabase(
    env,
    "create_reply",
    async (db) => {
      const uid = nanoid(8);
      await db.transaction(async (tx) => {
        await tx.insert(pgFeedbackRepliesTable).values({
          uid,
          ticketId,
          userId,
          content,
          isAdmin: false,
          createdAt: new Date(),
        });
        await tx
          .update(pgFeedbackTicketsTable)
          .set({
            status: "waiting",
            updatedAt: new Date(),
          })
          .where(eq(pgFeedbackTicketsTable.id, ticketId));
      });
      return uid;
    },
    options,
  );
}
