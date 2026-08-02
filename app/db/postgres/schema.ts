import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CouponReward } from "~/domain/coupon";
import type { FeedbackAdditional } from "~/domain/feedback";
import type { OcrJobKind, OcrTaskMessage } from "~/domain/ocr";
import type { SiteBannerPreset, SiteBannerScreen } from "~/domain/site-banner";
import type { TimelineContentVideo } from "~/domain/timeline-content";
import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";
import type {
  WalkthroughTimelineDefenseType,
  WalkthroughTimelineDifficulty,
  WalkthroughTimelineDocument,
  WalkthroughTimelineTerrain,
  WalkthroughTimelineVisibility,
} from "~/domain/walkthrough-timeline";
import type {
  CommunityCommentVisibility,
  CommunityPostBlock,
  CommunityPostOrigin,
  CommunityPostType,
  CommunityVisibility,
} from "~/models/community";
import type { RecruitmentResultStudent } from "~/models/recruitment-result";

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
    timelineContentUid: text("timeline_content_uid"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("posts_uid_uidx").on(table.uid),
    index("posts_board_created_at_uid_idx").on(table.board, table.createdAt.desc(), table.uid.desc()),
    index("posts_timeline_content_uid_idx").on(table.timelineContentUid),
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

export const pgSiteBannersTable = pgTable(
  "site_banners",
  {
    uid: text().primaryKey(),
    message: text().notNull(),
    colorPreset: text("color_preset").$type<SiteBannerPreset>().notNull(),
    link: text().notNull(),
    screens: jsonb().$type<SiteBannerScreen[]>().notNull().default([]),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("site_banners_active_ends_at_uid_idx").on(table.endsAt, table.uid),
    index("site_banners_starts_at_idx").on(table.startsAt),
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
    description: text().notNull().default(""),
    visibility: text().$type<WalkthroughTimelineVisibility>().notNull(),
    bossUid: text("boss_uid").notNull(),
    terrain: text().$type<WalkthroughTimelineTerrain>().notNull(),
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
    check("raid_walkthroughs_document_object", sql`jsonb_typeof(${table.document}) = 'object'`),
  ],
);

export const pgWalkthroughTimelineLikesTable = pgTable(
  "raid_walkthrough_likes",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    walkthroughUid: text("walkthrough_uid")
      .notNull()
      .references(() => pgWalkthroughTimelinesTable.uid, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("raid_walkthrough_likes_walkthrough_user_uidx").on(table.walkthroughUid, table.userId),
    index("raid_walkthrough_likes_user_walkthrough_idx").on(table.userId, table.walkthroughUid),
  ],
);

export const pgCommunityPostsTable = pgTable(
  "community_posts",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    postType: text("post_type").$type<CommunityPostType>().notNull(),
    origin: text().$type<CommunityPostOrigin>().notNull().default("user"),
    title: text(),
    visibility: text().$type<CommunityVisibility>().notNull().default("public"),
    pinned: boolean().notNull().default(false),
    subjectStudentUid: text("subject_student_uid"),
    subjectContentUid: text("subject_content_uid"),
    subjectRaidType: text("subject_raid_type"),
    subjectSeasonIndex: integer("subject_season_index"),
    blocks: jsonb().$type<CommunityPostBlock[]>().notNull().default([]),
    sourceType: text("source_type"),
    sourceUid: text("source_uid"),
    sourceId: integer("source_id"),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>().notNull().default({}),
    migratedAt: timestamptz("migrated_at"),
    displayAt: timestamptz("display_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("community_posts_uid_uidx").on(table.uid),
    uniqueIndex("community_posts_source_uidx").on(table.sourceType, table.sourceUid),
    index("community_posts_post_type_idx").on(table.postType),
    index("community_posts_user_id_idx").on(table.userId),
    index("community_posts_subject_student_uid_idx").on(table.subjectStudentUid),
    index("community_posts_subject_content_uid_idx").on(table.subjectContentUid),
    index("community_posts_subject_raid_idx").on(table.subjectRaidType, table.subjectSeasonIndex),
    index("community_posts_feed_order_idx").on(sql`coalesce(${table.displayAt}, ${table.createdAt})`, table.id.desc()),
    index("community_posts_updated_at_idx").on(table.updatedAt.desc(), table.createdAt.desc()),
    uniqueIndex("community_posts_student_review_per_user_uidx")
      .on(table.userId, table.subjectStudentUid)
      .where(sql`${table.postType} = 'student_review'`),
    check("community_posts_blocks_array", sql`jsonb_typeof(${table.blocks}) = 'array'`),
    check("community_posts_source_metadata_object", sql`jsonb_typeof(${table.sourceMetadata}) = 'object'`),
  ],
);

export const pgCommunityCommentsTable = pgTable(
  "community_comments",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    postUid: text("post_uid").notNull(),
    userId: integer("user_id").notNull(),
    parentUid: text("parent_uid").notNull(),
    body: text().notNull(),
    visibility: text().$type<CommunityCommentVisibility>().notNull().default("public"),
    sourceType: text("source_type"),
    sourceUid: text("source_uid"),
    sourceId: integer("source_id"),
    migratedAt: timestamptz("migrated_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("community_comments_uid_uidx").on(table.uid),
    uniqueIndex("community_comments_source_uidx").on(table.sourceType, table.sourceUid),
    index("community_comments_post_uid_idx").on(table.postUid),
    index("community_comments_parent_uid_idx").on(table.parentUid),
    index("community_comments_created_at_idx").on(table.postUid, table.createdAt, table.id),
  ],
);

export const pgCommunityPostLikesTable = pgTable(
  "community_post_likes",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    postUid: text("post_uid").notNull(),
    userId: integer("user_id").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("community_post_likes_uid_uidx").on(table.uid),
    uniqueIndex("community_post_likes_post_uid_user_id_uidx").on(table.postUid, table.userId),
    index("community_post_likes_post_uid_idx").on(table.postUid),
  ],
);

export const pgCommunityPostTagsTable = pgTable(
  "community_post_tags",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    postUid: text("post_uid").notNull(),
    studentUid: text("student_uid").notNull(),
    tagValue: text("tag_value").notNull(),
    createdAt: timestamptz("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("community_post_tags_uid_uidx").on(table.uid),
    index("community_post_tags_post_uid_idx").on(table.postUid),
    index("community_post_tags_student_uid_idx").on(table.studentUid),
    index("community_post_tags_tag_value_idx").on(table.tagValue),
  ],
);

export const pgRecruitmentResultsTable = pgTable(
  "recruitment_results",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    recruitmentGroupUid: text("recruitment_group_uid").notNull(),
    contentUid: text("content_uid"),
    completedAt: timestamptz("completed_at"),
    recruitedStudents: jsonb("recruited_students").$type<RecruitmentResultStudent[]>().notNull().default([]),
    exchangedStudents: jsonb("exchanged_students").$type<RecruitmentResultStudent[]>().notNull().default([]),
    tier3Count: integer("tier3_count"),
    trial: integer(),
    rawResult: text("raw_result"),
    commentPostUid: text("comment_post_uid"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recruitment_results_uid_uidx").on(table.uid),
    uniqueIndex("recruitment_results_user_group_uidx").on(table.userId, table.recruitmentGroupUid),
    index("recruitment_results_user_id_idx").on(table.userId),
    index("recruitment_results_content_uid_idx").on(table.contentUid),
    index("recruitment_results_comment_post_uid_idx").on(table.commentPostUid),
    check("recruitment_results_recruited_students_array", sql`jsonb_typeof(${table.recruitedStudents}) = 'array'`),
    check("recruitment_results_exchanged_students_array", sql`jsonb_typeof(${table.exchangedStudents}) = 'array'`),
  ],
);

export const pgOcrJobsTable = pgTable(
  "ocr_jobs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    userId: integer("user_id").notNull(),
    jobKind: text("job_kind").$type<OcrJobKind>().notNull().default("item_inventory_images_v1"),
    status: text().notNull().default("uploading"),
    generation: integer().notNull().default(1),
    totalImages: integer("total_images").notNull(),
    completedImages: integer("completed_images").notNull().default(0),
    failedImages: integer("failed_images").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    submittedAt: timestamptz("submitted_at"),
    completedAt: timestamptz("completed_at"),
    expiresAt: timestamptz("expires_at").notNull(),
    purgeAfter: timestamptz("purge_after").notNull(),
    trainingConsentAt: timestamptz("training_consent_at"),
    trainingConsentVersion: text("training_consent_version"),
  },
  (table) => [
    index("ocr_jobs_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("ocr_jobs_user_kind_created_idx").on(table.userId, table.jobKind, table.createdAt.desc()),
    index("ocr_jobs_status_updated_idx").on(table.status, table.updatedAt),
    index("ocr_jobs_purge_after_idx").on(table.purgeAfter),
  ],
);

export const pgOcrImagesTable = pgTable(
  "ocr_images",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    jobUid: text("job_uid")
      .notNull()
      .references(() => pgOcrJobsTable.uid, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    inputSha256: text("input_sha256").notNull(),
    status: text().notNull().default("pending_upload"),
    generation: integer().notNull().default(1),
    currentAttemptUid: text("current_attempt_uid"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [index("ocr_images_job_status_idx").on(table.jobUid, table.status)],
);

export const pgOcrVideoInputsTable = pgTable(
  "ocr_video_inputs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    jobUid: text("job_uid").notNull().unique(),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    inputSha256: text("input_sha256").notNull(),
    status: text().notNull().default("pending_upload"),
    generation: integer().notNull().default(1),
    currentAttemptUid: text("current_attempt_uid"),
    durationMs: integer("duration_ms"),
    width: integer(),
    height: integer(),
    codec: text(),
    container: text(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    rawInputPurgeAfter: timestamptz("raw_input_purge_after").notNull(),
    rawInputDeletedAt: timestamptz("raw_input_deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
  },
  (table) => [index("ocr_video_inputs_status_purge_idx").on(table.status, table.rawInputPurgeAfter)],
);

export const pgOcrAttemptsTable = pgTable(
  "ocr_attempts",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    taskType: text("task_type").notNull(),
    taskUid: text("task_uid").notNull(),
    generation: integer().notNull(),
    workerId: text("worker_id").notNull(),
    status: text().notNull().default("processing"),
    queueAttempts: integer("queue_attempts").notNull().default(1),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
  },
  (table) => [index("ocr_attempts_task_idx").on(table.taskType, table.taskUid, table.generation)],
);

export const pgOcrImageResultsTable = pgTable(
  "ocr_image_results",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    imageUid: text("image_uid")
      .notNull()
      .references(() => pgOcrImagesTable.uid, { onDelete: "cascade" }),
    generation: integer().notNull(),
    attemptUid: text("attempt_uid")
      .notNull()
      .references(() => pgOcrAttemptsTable.uid),
    resultJson: jsonb("result_json").notNull(),
    modelVersion: text("model_version").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ocr_image_results_image_generation_uidx").on(table.imageUid, table.generation)],
);

export const pgOcrJobResultsTable = pgTable(
  "ocr_job_results",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    jobUid: text("job_uid")
      .notNull()
      .references(() => pgOcrJobsTable.uid, { onDelete: "cascade" }),
    generation: integer().notNull(),
    attemptUid: text("attempt_uid")
      .notNull()
      .references(() => pgOcrAttemptsTable.uid),
    resultJson: jsonb("result_json").notNull(),
    modelVersion: text("model_version").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ocr_job_results_job_generation_uidx").on(table.jobUid, table.generation)],
);

export const pgOcrResultArtifactsTable = pgTable(
  "ocr_result_artifacts",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    jobUid: text("job_uid").notNull(),
    attemptUid: text("attempt_uid").notNull(),
    taskUid: text("task_uid").notNull(),
    generation: integer().notNull(),
    studentUid: text("student_uid").notNull(),
    sourceFrame: integer("source_frame").notNull(),
    timestampMs: integer("timestamp_ms").notNull(),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    status: text().notNull().default("pending"),
    purgeAfter: timestamptz("purge_after").notNull(),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ocr_result_artifacts_attempt_student_uidx").on(table.attemptUid, table.studentUid),
    index("ocr_result_artifacts_job_generation_status_idx").on(table.jobUid, table.generation, table.status),
    index("ocr_result_artifacts_status_purge_idx").on(table.status, table.purgeAfter),
  ],
);

export const pgOcrOutboxTable = pgTable(
  "ocr_outbox",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull().unique(),
    eventType: text("event_type").notNull(),
    aggregateUid: text("aggregate_uid").notNull(),
    generation: integer().notNull(),
    payload: jsonb().$type<OcrTaskMessage>().notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    availableAt: timestamptz("available_at").notNull().defaultNow(),
    publishedAt: timestamptz("published_at"),
    lastError: text("last_error"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ocr_outbox_event_aggregate_generation_uidx").on(table.eventType, table.aggregateUid, table.generation),
    index("ocr_outbox_dispatch_idx").on(table.status, table.availableAt, table.id),
  ],
);
