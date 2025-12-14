import { sqliteTable, text, int } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { nanoid } from "nanoid/non-secure";

export const feedbackSubmissionsTable = sqliteTable("feedback_submissions", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  userId: int().notNull(),
  title: text().notNull(),
  content: text().notNull(),
  replyEmail: text(),
  createdAt: text().notNull().default(sql`current_timestamp`),
  updatedAt: text().notNull().default(sql`current_timestamp`),
});

export interface FeedbackSubmission {
  id: number;
  uid: string;
  userId: number;
  title: string;
  content: string;
  replyEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createFeedbackSubmission(env: Env, userId: number, title: string, content: string, replyEmail: string | null) {
  const uid = nanoid(8);
  const db = drizzle(env.DB);
  await db.insert(feedbackSubmissionsTable).values({ uid, userId, title, content, replyEmail });
}
