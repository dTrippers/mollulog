import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CouponReward } from "~/domain/coupon";
import type { FeedbackAdditional } from "~/domain/feedback";
import type { TimelineContentVideo } from "~/domain/timeline-content";
import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";
import type {
  WalkthroughTimelineDefenseType,
  WalkthroughTimelineDifficulty,
  WalkthroughTimelineDocument,
  WalkthroughTimelineVisibility,
} from "~/domain/walkthrough-timeline";

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

export const pgFavoriteStudentsTable = pgTable(
  "content_favorite_students",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    studentUid: text("student_uid").notNull(),
    timelineContentUid: text("timeline_content_uid").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("content_favorite_students_uid_uidx").on(table.uid),
    uniqueIndex("content_favorite_students_user_timeline_content_student_uidx").on(
      table.userId,
      table.timelineContentUid,
      table.studentUid,
    ),
    index("content_favorite_students_student_timeline_content_idx").on(table.studentUid, table.timelineContentUid),
    index("content_favorite_students_user_timeline_content_idx").on(table.userId, table.timelineContentUid),
  ],
);

export const pgCouponsTable = pgTable(
  "coupons",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    name: text().notNull(),
    code: text().notNull(),
    imageUrl: text("image_url"),
    rewards: jsonb().$type<CouponReward[]>().notNull().default([]),
    linkUrl: text("link_url"),
    linkLabel: text("link_label"),
    expiresAt: timestamptz("expires_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("coupons_uid_uidx").on(table.uid),
    uniqueIndex("coupons_code_uidx").on(table.code),
    index("coupons_expires_at_idx").on(table.expiresAt),
  ],
);

export const pgCouponRegistrationsTable = pgTable(
  "coupon_registrations",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => pgCouponsTable.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("coupon_registrations_user_coupon_uidx").on(table.userId, table.couponId),
    index("coupon_registrations_user_id_idx").on(table.userId),
  ],
);

export const pgFeedbackTicketsTable = pgTable(
  "feedback_tickets",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    title: text().notNull(),
    content: text().notNull(),
    additional: jsonb().$type<FeedbackAdditional>(),
    status: text().notNull().default("waiting"),
    replyEmail: text("reply_email"),
    lastSeenAdminReplyId: integer("last_seen_admin_reply_id").notNull().default(0),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("feedback_tickets_uid_uidx").on(table.uid),
    index("feedback_tickets_user_updated_at_idx").on(table.userId, table.updatedAt.desc(), table.id.desc()),
  ],
);

export const pgFeedbackRepliesTable = pgTable(
  "feedback_replies",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => pgFeedbackTicketsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    content: text().notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("feedback_replies_uid_uidx").on(table.uid),
    index("feedback_replies_ticket_created_at_idx").on(table.ticketId, table.createdAt, table.id),
    index("feedback_replies_ticket_admin_id_idx").on(table.ticketId, table.isAdmin, table.id),
  ],
);

export const pgWalkthroughTimelinesTable = pgTable(
  "raid_walkthroughs",
  {
    uid: text().primaryKey(),
    userId: integer("user_id").notNull(),
    title: text().notNull(),
    visibility: text().$type<WalkthroughTimelineVisibility>().notNull(),
    bossUid: text("boss_uid").notNull(),
    defenseType: text("defense_type").$type<WalkthroughTimelineDefenseType>().notNull(),
    maxDifficulty: text("max_difficulty").$type<WalkthroughTimelineDifficulty>().notNull(),
    document: jsonb().$type<WalkthroughTimelineDocument>().notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    index("raid_walkthroughs_user_updated_at_idx").on(table.userId, table.updatedAt.desc()),
    index("raid_walkthroughs_boss_visibility_updated_at_idx").on(
      table.bossUid,
      table.visibility,
      table.updatedAt.desc(),
    ),
    check("raid_walkthroughs_visibility", sql`${table.visibility} in ('public', 'private')`),
    check("raid_walkthroughs_defense_type", sql`${table.defenseType} in ('light', 'heavy', 'special', 'elastic')`),
    check(
      "raid_walkthroughs_max_difficulty",
      sql`${table.maxDifficulty} in ('extreme', 'insane', 'torment', 'lunatic')`,
    ),
    check("raid_walkthroughs_document_object", sql`jsonb_typeof(${table.document}) = 'object'`),
  ],
);
