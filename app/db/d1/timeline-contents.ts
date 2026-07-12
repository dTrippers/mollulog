import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const timelineContentsTable = sqliteTable("timeline_contents", {
  id: int().primaryKey({ autoIncrement: true }),
  uid: text().notNull(),
  nameI18n: text("name_i18n").notNull().default("{}"),
  startAt: text("start_at").notNull(),
  endAt: text("end_at"),
  endless: int().notNull().default(0),
  imageUrl: text("image_url"),
  videos: text().notNull().default("[]"),
  contentType: text("content_type").notNull(),
  runType: text("run_type").notNull().default("first"),
  occurrence: int(),
  contentUid: text("content_uid"),
  shopContentUid: text("shop_content_uid"),
  recruitmentGroupUid: text("recruitment_group_uid"),
  recruitmentStudentUids: text("recruitment_student_uids"),
  confirmed: int().notNull().default(0),
  isSpoiler: int("is_spoiler").notNull().default(0),
  tags: text().notNull().default("[]"),
  earnablePyroxene: int("earnable_pyroxene"),
  createdAt: text("created_at").notNull().default(sql`current_timestamp`),
  updatedAt: text("updated_at").notNull().default(sql`current_timestamp`),
  syncedAt: text("synced_at"),
});

export type TimelineContentD1Row = typeof timelineContentsTable.$inferSelect;
