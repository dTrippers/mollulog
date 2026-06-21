import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid/non-secure";

export type FeedbackTicketStatus = "waiting" | "in_progress" | "resolved";

export const feedbackTicketsTable = sqliteTable(
  "feedback_tickets",
  {
    id: int().primaryKey({ autoIncrement: true }),
    uid: text().notNull(),
    userId: int().notNull(),
    title: text().notNull(),
    content: text().notNull(),
    status: text().notNull().default("waiting"),
    replyEmail: text(),
    lastSeenAdminReplyId: int().notNull().default(0),
    createdAt: text().notNull().default(sql`current_timestamp`),
    updatedAt: text().notNull().default(sql`current_timestamp`),
  },
  (table) => ({
    uidIndex: uniqueIndex("feedback_tickets_uid").on(table.uid),
    userIdIndex: index("feedback_tickets_userId").on(table.userId),
  }),
);

export const feedbackRepliesTable = sqliteTable(
  "feedback_replies",
  {
    id: int().primaryKey({ autoIncrement: true }),
    uid: text().notNull(),
    ticketId: int().notNull().references(() => feedbackTicketsTable.id, { onDelete: "cascade" }),
    userId: int().notNull(),
    isAdmin: int().notNull().default(0),
    content: text().notNull(),
    createdAt: text().notNull().default(sql`current_timestamp`),
  },
  (table) => ({
    uidIndex: uniqueIndex("feedback_replies_uid").on(table.uid),
    ticketIdIndex: index("feedback_replies_ticketId").on(table.ticketId),
  }),
);

export type FeedbackTicket = {
  id: number;
  uid: string;
  userId: number;
  title: string;
  content: string;
  status: FeedbackTicketStatus;
  replyEmail: string | null;
  lastSeenAdminReplyId: number;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackReply = {
  id: number;
  uid: string;
  ticketId: number;
  userId: number;
  isAdmin: boolean;
  content: string;
  createdAt: string;
};

export type FeedbackThread = {
  ticket: FeedbackTicket;
  replies: FeedbackReply[];
};

function toFeedbackTicketStatus(status: string): FeedbackTicketStatus {
  if (status === "in_progress" || status === "resolved" || status === "waiting") {
    return status;
  }

  return "waiting";
}

function toFeedbackTicket(row: typeof feedbackTicketsTable.$inferSelect): FeedbackTicket {
  return {
    id: row.id,
    uid: row.uid,
    userId: row.userId,
    title: row.title,
    content: row.content,
    status: toFeedbackTicketStatus(row.status),
    replyEmail: row.replyEmail,
    lastSeenAdminReplyId: row.lastSeenAdminReplyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toFeedbackReply(row: typeof feedbackRepliesTable.$inferSelect): FeedbackReply {
  return {
    id: row.id,
    uid: row.uid,
    ticketId: row.ticketId,
    userId: row.userId,
    isAdmin: row.isAdmin === 1,
    content: row.content,
    createdAt: row.createdAt,
  };
}

export async function getFeedbackTicketsByUserId(env: Env, userId: number): Promise<FeedbackTicket[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(feedbackTicketsTable)
    .where(eq(feedbackTicketsTable.userId, userId))
    .orderBy(desc(feedbackTicketsTable.updatedAt), desc(feedbackTicketsTable.id));

  return rows.map(toFeedbackTicket);
}

export async function getFeedbackTicketByUidForUser(env: Env, uid: string, userId: number): Promise<FeedbackTicket | null> {
  const db = drizzle(env.DB);
  const row = await db
    .select()
    .from(feedbackTicketsTable)
    .where(and(eq(feedbackTicketsTable.uid, uid), eq(feedbackTicketsTable.userId, userId)))
    .get();

  return row ? toFeedbackTicket(row) : null;
}

export async function getFeedbackRepliesByTicketId(env: Env, ticketId: number): Promise<FeedbackReply[]> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(feedbackRepliesTable)
    .where(eq(feedbackRepliesTable.ticketId, ticketId))
    .orderBy(asc(feedbackRepliesTable.createdAt), asc(feedbackRepliesTable.id));

  return rows.map(toFeedbackReply);
}

export async function getFeedbackThreadByUidForUser(env: Env, uid: string, userId: number): Promise<FeedbackThread | null> {
  const ticket = await getFeedbackTicketByUidForUser(env, uid, userId);
  if (!ticket) {
    return null;
  }

  return {
    ticket,
    replies: await getFeedbackRepliesByTicketId(env, ticket.id),
  };
}

export async function hasUnreadAdminFeedbackReplies(env: Env, userId: number): Promise<boolean> {
  const db = drizzle(env.DB);
  const row = await db
    .select({ exists: sql<number>`1` })
    .from(feedbackTicketsTable)
    .innerJoin(
      feedbackRepliesTable,
      and(
        eq(feedbackRepliesTable.ticketId, feedbackTicketsTable.id),
        eq(feedbackRepliesTable.isAdmin, 1),
        sql`${feedbackRepliesTable.id} > ${feedbackTicketsTable.lastSeenAdminReplyId}`,
      ),
    )
    .where(eq(feedbackTicketsTable.userId, userId))
    .limit(1)
    .get();
  return row !== undefined;
}

export function getLatestAdminFeedbackReplyId(replies: FeedbackReply[]): number {
  return replies.reduce((latestId, reply) => (reply.isAdmin ? Math.max(latestId, reply.id) : latestId), 0);
}

export async function markFeedbackTicketAdminRepliesSeen(
  env: Env,
  ticket: Pick<FeedbackTicket, "id" | "userId" | "lastSeenAdminReplyId">,
  latestAdminReplyId: number,
): Promise<void> {
  if (latestAdminReplyId <= ticket.lastSeenAdminReplyId) {
    return;
  }

  const db = drizzle(env.DB);
  await db
    .update(feedbackTicketsTable)
    .set({ lastSeenAdminReplyId: latestAdminReplyId })
    .where(
      and(
        eq(feedbackTicketsTable.id, ticket.id),
        eq(feedbackTicketsTable.userId, ticket.userId),
        sql`${feedbackTicketsTable.lastSeenAdminReplyId} < ${latestAdminReplyId}`,
      ),
    );
}

export async function createFeedbackTicket(
  env: Env,
  userId: number,
  title: string,
  content: string,
  replyEmail: string | null,
): Promise<string> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);

  await db.insert(feedbackTicketsTable).values({
    uid,
    userId,
    title,
    content,
    replyEmail,
  });

  return uid;
}

export async function createFeedbackReply(env: Env, ticketId: number, userId: number, content: string): Promise<string> {
  const db = drizzle(env.DB);
  const uid = nanoid(8);

  await db.insert(feedbackRepliesTable).values({
    uid,
    ticketId,
    userId,
    content,
    isAdmin: 0,
  });

  await db
    .update(feedbackTicketsTable)
    .set({
      status: "waiting",
      updatedAt: sql`current_timestamp`,
    })
    .where(eq(feedbackTicketsTable.id, ticketId));

  return uid;
}
