import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { TimelineContentVideo } from "~/domain/timeline-content";
import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const pgTimelineContentsTable = pgTable(
  "timeline_contents",
  {
    uid: text().primaryKey(),
    startAt: timestamptz("start_at").notNull(),
    endAt: timestamptz("end_at"),
    endless: boolean().notNull().default(false),
    imageUrl: text("image_url"),
    videos: jsonb().$type<TimelineContentVideo[]>().notNull().default([]),
    contentType: text("content_type").notNull(),
    runType: text("run_type").notNull().default("first"),
    contentUid: text("content_uid"),
    recruitmentGroupUid: text("recruitment_group_uid"),
    confirmed: boolean().notNull().default(false),
    tags: jsonb().$type<string[]>().notNull().default([]),
    occurrence: integer(),
    syncedAt: timestamptz("synced_at"),
    isSpoiler: boolean("is_spoiler").notNull().default(false),
    earnablePyroxene: integer("earnable_pyroxene"),
    shopContentUid: text("shop_content_uid"),
    nameI18n: jsonb("name_i18n").$type<TimelineContentNameI18n>().notNull().default({}),
    recruitmentStudentUids: text("recruitment_student_uids").array(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    index("timeline_contents_start_at_uid_idx").on(table.startAt, table.uid),
    index("timeline_contents_end_at_idx").on(table.endAt),
    index("timeline_contents_recruitment_group_uid_idx")
      .on(table.recruitmentGroupUid)
      .where(sql`${table.recruitmentGroupUid} is not null`),
    check("timeline_contents_videos_array", sql`jsonb_typeof(${table.videos}) = 'array'`),
    check("timeline_contents_tags_array", sql`jsonb_typeof(${table.tags}) = 'array'`),
    check("timeline_contents_name_i18n_object", sql`jsonb_typeof(${table.nameI18n}) = 'object'`),
    check("timeline_contents_occurrence_positive", sql`${table.occurrence} is null or ${table.occurrence} > 0`),
  ],
);

export const pgPostsTable = pgTable(
  "posts",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    title: text().notNull(),
    content: text().notNull(),
    board: text().notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("posts_uid_uidx").on(table.uid),
    index("posts_board_created_at_uid_idx").on(table.board, table.createdAt.desc(), table.uid.desc()),
  ],
);
