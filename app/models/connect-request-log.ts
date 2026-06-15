import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const connectRequestLogsTable = sqliteTable("connect_request_logs", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  apiKeyUid: text(),
  endpoint: text().notNull(),
  status: int().notNull(),
  createdAt: text().notNull().default(sql`current_timestamp`),
});

export type ConnectRequestLog = typeof connectRequestLogsTable.$inferSelect;
