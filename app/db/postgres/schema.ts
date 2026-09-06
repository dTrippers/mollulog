import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CacheRefreshJobStatus, CacheRefreshTaskName, CacheRefreshTaskResults } from "~/domain/cache-refresh";
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
import type { AuthProvider } from "~/models/auth-identity";
import type {
  CommunityCommentVisibility,
  CommunityPostBlock,
  CommunityPostOrigin,
  CommunityPostType,
  CommunityVisibility,
} from "~/models/community";
import type { ConnectApiKeyScope } from "~/models/connect-api-key";
import type { EventShopState } from "~/models/event-shop-state";
import type { PickupHistory } from "~/models/pickup-history";
import type { RecruitmentResultStudent } from "~/models/recruitment-result";
import type { ProfileVisibility, SenseiRole } from "~/models/sensei";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Canonical PostgreSQL tables for the authenticated identity domain. */
export const pgSenseisTable = pgTable(
  "senseis",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    username: text().notNull(),
    friendCode: text("friend_code"),
    profileStudentId: text("profile_student_id"),
    googleId: text("google_id"),
    githubId: text("github_id"),
    active: boolean().notNull().default(false),
    bio: text(),
    role: text().$type<SenseiRole>().notNull().default("guest"),
    profileVisibility: text("profile_visibility").$type<ProfileVisibility>().notNull().default("public"),
    growthVisibility: boolean("growth_visibility").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("senseis_uid_uidx").on(table.uid),
    uniqueIndex("senseis_username_uidx").on(table.username),
    uniqueIndex("senseis_google_id_uidx").on(table.googleId),
    uniqueIndex("senseis_github_id_uidx").on(table.githubId),
  ],
);

export const CACHE_REFRESH_ACTIVE_SLOT_INDEX_NAME = "cache_refresh_jobs_active_slot_uidx";

export const pgCacheRefreshJobsTable = pgTable(
  "cache_refresh_jobs",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    requestedBy: integer("requested_by").notNull(),
    status: text().$type<CacheRefreshJobStatus>().notNull(),
    activeSlot: integer("active_slot"),
    currentTask: text("current_task").$type<CacheRefreshTaskName>(),
    completedCount: integer("completed_count").notNull().default(0),
    totalCount: integer("total_count").notNull(),
    taskResults: jsonb("task_results").$type<CacheRefreshTaskResults>().notNull(),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cache_refresh_jobs_uid_uidx").on(table.uid),
    uniqueIndex(CACHE_REFRESH_ACTIVE_SLOT_INDEX_NAME).on(table.activeSlot).where(sql`${table.activeSlot} is not null`),
    index("cache_refresh_jobs_created_at_idx").on(table.createdAt.desc()),
  ],
);

export const pgAuthIdentitiesTable = pgTable(
  "auth_identities",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    senseiId: integer("sensei_id").notNull(),
    provider: text().$type<AuthProvider>().notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_user_uidx").on(table.provider, table.providerUserId),
    index("auth_identities_sensei_id_idx").on(table.senseiId),
  ],
);

export const pgPasskeysTable = pgTable(
  "passkeys",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    memo: text().notNull(),
    keyId: text("key_id").notNull(),
    publicKey: text("public_key").notNull(),
    rawRequest: text("raw_request").notNull(),
    counter: integer().notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("passkeys_uid_uidx").on(table.uid),
    uniqueIndex("passkeys_key_id_uidx").on(table.keyId),
    index("passkeys_user_id_idx").on(table.userId),
  ],
);

export const pgPendingSenseiRegistrationsTable = pgTable(
  "pending_sensei_registrations",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    provider: text().$type<AuthProvider>().notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pending_sensei_registrations_uid_uidx").on(table.uid),
    uniqueIndex("pending_sensei_registrations_provider_user_uidx").on(table.provider, table.providerUserId),
  ],
);

export const pgSenseiPrivaciesTable = pgTable(
  "sensei_privacies",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull(),
    memberCode: text("member_code"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sensei_privacies_user_id_uidx").on(table.userId)],
);

export const pgFollowershipsTable = pgTable(
  "followerships",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    followerId: integer("follower_id").notNull(),
    followeeId: integer("followee_id").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("followerships_follower_followee_uidx").on(table.followerId, table.followeeId),
    index("followerships_follower_id_idx").on(table.followerId),
    index("followerships_followee_id_idx").on(table.followeeId),
  ],
);

export const pgTimelineContentsTable = pgTable(
  "timeline_contents",
  {
    id: integer().notNull().generatedByDefaultAsIdentity(),
    uid: text().primaryKey(),
    startAt: timestamptz("start_at").notNull(),
    endAt: timestamptz("end_at"),
    rewardExchangeEndAt: timestamptz("reward_exchange_end_at"),
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
    uniqueIndex("timeline_contents_id_uidx").on(table.id),
    index("timeline_contents_start_at_uid_idx").on(table.startAt, table.uid),
    index("timeline_contents_end_at_idx").on(table.endAt),
    index("timeline_contents_reward_exchange_end_at_idx").on(table.rewardExchangeEndAt),
    index("timeline_contents_recruitment_group_uid_idx")
      .on(table.recruitmentGroupUid)
      .where(sql`${table.recruitmentGroupUid} is not null`),
  ],
);

export type DiscordConnectionStatus = "pending" | "active" | "failed";
export type DiscordNotificationTrigger =
  | "event-start"
  | "event-end"
  | "reward-exchange-end"
  | "recruitment-start"
  | "shop-reset"
  | "feedback-reply"
  | "event-opinion-reply";
export type DiscordNotificationJobTrigger = DiscordNotificationTrigger | "connection-verification";

export type NotificationChannelType = "discord";

export const pgNotificationChannelsTable = pgTable(
  "notification_channels",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    channelType: text("channel_type").$type<NotificationChannelType>().notNull(),
    recipientKey: text("recipient_key").notNull(),
    status: text().$type<DiscordConnectionStatus>().notNull(),
    failureReason: text("failure_reason"),
    verifiedAt: timestamptz("verified_at"),
    lastVerificationAt: timestamptz("last_verification_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_channels_uid_uidx").on(table.uid),
    uniqueIndex("notification_channels_user_channel_type_uidx").on(table.userId, table.channelType),
    uniqueIndex("notification_channels_channel_type_recipient_key_uidx").on(table.channelType, table.recipientKey),
    index("notification_channels_status_idx").on(table.status),
  ],
);

export const pgNotificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull(),
    notificationType: text("notification_type").$type<DiscordNotificationTrigger>().notNull(),
    enabled: boolean().notNull(),
    leadHours: integer("lead_hours").notNull(),
    effectiveAt: timestamptz("effective_at").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_preferences_user_notification_type_uidx").on(table.userId, table.notificationType),
  ],
);

export const pgNotificationJobsTable = pgTable(
  "notification_jobs",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    channelUid: text("channel_uid").notNull(),
    trigger: text().$type<DiscordNotificationJobTrigger>().notNull(),
    sourceUid: text("source_uid").notNull(),
    sourceAnchor: timestamptz("source_anchor").notNull(),
    plannedSendAt: timestamptz("planned_send_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    generation: integer().notNull(),
    status: text().notNull(),
    publishAttempts: integer("publish_attempts").notNull(),
    deliveryAttempts: integer("delivery_attempts").notNull(),
    availableAt: timestamptz("available_at").notNull(),
    publishingAt: timestamptz("publishing_at"),
    publishedAt: timestamptz("published_at"),
    deliveredAt: timestamptz("delivered_at"),
    lastError: text("last_error"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_jobs_uid_uidx").on(table.uid),
    uniqueIndex("notification_jobs_dedup_uidx").on(table.channelUid, table.trigger, table.sourceUid, table.generation),
    index("notification_jobs_due_idx").on(table.status, table.plannedSendAt),
    index("notification_jobs_publish_idx").on(table.status, table.availableAt),
    index("notification_jobs_channel_uid_idx").on(table.channelUid),
    index("notification_jobs_user_id_idx").on(table.userId),
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

export const pgPyroxeneOwnedResourcesTable = pgTable(
  "pyroxene_owned_resources",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    inputAt: timestamptz("input_at").notNull(),
    pyroxene: integer().notNull(),
    oneTimeTicket: integer("one_time_ticket").notNull(),
    tenTimeTicket: integer("ten_time_ticket").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pyroxene_owned_resources_uid_uidx").on(table.uid),
    index("pyroxene_owned_resources_user_input_at_idx").on(table.userId, table.inputAt),
  ],
);

export const pgPyroxeneCollectedSourcesTable = pgTable(
  "pyroxene_collected_sources",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    sourceKey: text("source_key").notNull(),
    collectedAt: timestamptz("collected_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pyroxene_collected_sources_uid_uidx").on(table.uid),
    uniqueIndex("pyroxene_collected_sources_user_source_key_uidx").on(table.userId, table.sourceKey),
  ],
);

export const pgPyroxeneTimelineItemsTable = pgTable(
  "pyroxene_timeline_items",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    eventAt: timestamptz("event_at").notNull(),
    source: text().notNull(),
    repeatType: text("repeat_type"),
    repeatIntervalDays: integer("repeat_interval_days"),
    repeatCount: integer("repeat_count"),
    autoRepurchase: boolean("auto_repurchase").notNull().default(false),
    description: text().notNull(),
    pyroxeneDelta: integer("pyroxene_delta").notNull(),
    oneTimeTicketDelta: integer("one_time_ticket_delta").notNull(),
    tenTimeTicketDelta: integer("ten_time_ticket_delta").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pyroxene_timeline_items_uid_uidx").on(table.uid),
    index("pyroxene_timeline_items_user_event_at_idx").on(table.userId, table.eventAt),
  ],
);

export const pgPyroxenePlannerOptionsTable = pgTable(
  "pyroxene_planner_options",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull(),
    options: text().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("pyroxene_planner_options_user_id_uidx").on(table.userId)],
);

export const pgPyroxeneEventDataTable = pgTable(
  "pyroxene_event_data",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    eventUid: text("event_uid").notNull(),
    completed: boolean().notNull().default(false),
    expectedTrials: integer("expected_trials"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pyroxene_event_data_uid_uidx").on(table.uid),
    uniqueIndex("pyroxene_event_data_user_event_uid_uidx").on(table.userId, table.eventUid),
  ],
);

export const pgPyroxeneGuestImportItemsTable = pgTable(
  "pyroxene_guest_import_items",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull(),
    datasetId: text("dataset_id").notNull(),
    itemType: text("item_type").notNull(),
    itemKey: text("item_key").notNull(),
    importedAt: timestamptz("imported_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pyroxene_guest_import_items_user_dataset_item_uidx").on(
      table.userId,
      table.datasetId,
      table.itemType,
      table.itemKey,
    ),
  ],
);

export const pgPickupHistoriesTable = pgTable(
  "pickup_histories",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    eventId: text("event_id").notNull(),
    result: jsonb().$type<PickupHistory["result"]>().notNull(),
    rawResult: text("raw_result"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pickup_histories_uid_uidx").on(table.uid),
    index("pickup_histories_user_id_idx").on(table.userId),
  ],
);

export const pgEventShopStatesTable = pgTable(
  "event_shop_states",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    eventUid: text("event_uid").notNull(),
    itemQuantities: jsonb("item_quantities").$type<EventShopState["itemQuantities"]>().notNull().default({}),
    itemPurchaseDays: jsonb("item_purchase_days").$type<EventShopState["itemPurchaseDays"]>().notNull().default({}),
    selectedBonusStudentUids: jsonb("selected_bonus_student_uids")
      .$type<EventShopState["selectedBonusStudentUids"]>()
      .notNull()
      .default([]),
    bonusStudentSelectionMode: text("bonus_student_selection_mode")
      .$type<EventShopState["bonusStudentSelectionMode"]>()
      .notNull()
      .default("shared"),
    selectedBonusStudentUidsByItem: jsonb("selected_bonus_student_uids_by_item")
      .$type<EventShopState["selectedBonusStudentUidsByItem"]>()
      .notNull()
      .default({}),
    enabledStages: jsonb("enabled_stages").$type<EventShopState["enabledStages"]>().notNull().default({}),
    includeRecruitedStudents: boolean("include_recruited_students").notNull().default(false),
    existingPaymentItemQuantities: jsonb("existing_payment_item_quantities")
      .$type<EventShopState["existingPaymentItemQuantities"]>()
      .notNull()
      .default({}),
    includeFirstClear: boolean("include_first_clear").notNull().default(false),
    extraStageRuns: jsonb("extra_stage_runs").$type<EventShopState["extraStageRuns"]>().notNull().default({}),
    minigameStartRound: integer("minigame_start_round").notNull().default(1),
    minigamePlayCount: integer("minigame_play_count").notNull().default(0),
    minigamePaymentQuantityMode: text("minigame_payment_quantity_mode")
      .$type<EventShopState["minigamePaymentQuantityMode"]>()
      .notNull()
      .default("expected"),
    overriddenRequiredQuantities: jsonb("overridden_required_quantities")
      .$type<EventShopState["overriddenRequiredQuantities"]>()
      .notNull()
      .default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_shop_states_uid_uidx").on(table.uid),
    uniqueIndex("event_shop_states_user_event_uidx").on(table.userId, table.eventUid),
    index("event_shop_states_user_id_idx").on(table.userId),
  ],
);

export const pgConnectApiKeysTable = pgTable(
  "connect_api_keys",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    name: text().notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb().$type<ConnectApiKeyScope[]>().notNull().default(["catalog:read", "draft:write"]),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at"),
    lastUsedAt: timestamptz("last_used_at"),
    revokedAt: timestamptz("revoked_at"),
  },
  (table) => [
    uniqueIndex("connect_api_keys_uid_uidx").on(table.uid),
    index("connect_api_keys_key_prefix_idx").on(table.keyPrefix),
    index("connect_api_keys_user_id_idx").on(table.userId),
  ],
);

export const pgConnectRequestLogsTable = pgTable(
  "connect_request_logs",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    apiKeyUid: text("api_key_uid"),
    endpoint: text().notNull(),
    status: integer().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connect_request_logs_uid_uidx").on(table.uid),
    index("connect_request_logs_api_key_created_at_idx").on(table.apiKeyUid, table.createdAt),
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
    id: integer().notNull().generatedByDefaultAsIdentity(),
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
    uniqueIndex("site_banners_id_uidx").on(table.id),
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
    tag: text(),
    linearIssueUrl: text("linear_issue_url"),
    replyEmail: text("reply_email"),
    lastSeenAdminReplyId: integer("last_seen_admin_reply_id").notNull().default(0),
    operatorNotificationSentAt: timestamptz("operator_notification_sent_at"),
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
    operatorNotificationSentAt: timestamptz("operator_notification_sent_at"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
    id: integer().notNull().generatedByDefaultAsIdentity(),
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
    uniqueIndex("raid_walkthroughs_id_uidx").on(table.id),
    index("raid_walkthroughs_user_updated_at_idx").on(table.userId, table.updatedAt.desc()),
    index("raid_walkthroughs_boss_visibility_updated_at_idx").on(
      table.bossUid,
      table.visibility,
      table.updatedAt.desc(),
    ),
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("raid_walkthrough_likes_walkthrough_user_uidx").on(table.walkthroughUid, table.userId),
    index("raid_walkthrough_likes_user_walkthrough_idx").on(table.userId, table.walkthroughUid),
  ],
);

export const pgCommunityAuthorMutesTable = pgTable(
  "community_author_mutes",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id").notNull(),
    mutedAt: timestamptz("muted_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("community_author_mutes_user_id_uidx").on(table.userId),
    index("community_author_mutes_muted_at_idx").on(table.mutedAt),
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
  ],
);

/** Canonical PostgreSQL tables for authenticated student state and imports. */
export const pgRecruitedStudentsTable = pgTable(
  "recruited_students",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    studentUid: text("student_uid").notNull(),
    tier: integer().notNull(),
    level: integer(),
    skillEx: integer("skill_ex"),
    skillNormal: integer("skill_normal"),
    skillEnhanced: integer("skill_enhanced"),
    skillSub: integer("skill_sub"),
    equip1: integer(),
    equip2: integer(),
    equip3: integer(),
    equip1Level: integer("equip1_level"),
    equip2Level: integer("equip2_level"),
    equip3Level: integer("equip3_level"),
    equipSpecial: integer("equip_special"),
    weaponLevel: integer("weapon_level"),
    abilityHp: integer("ability_hp"),
    abilityAtk: integer("ability_atk"),
    abilityHeal: integer("ability_heal"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recruited_students_uid_uidx").on(table.uid),
    uniqueIndex("recruited_students_user_student_uidx").on(table.userId, table.studentUid),
    index("recruited_students_user_id_idx").on(table.userId),
    index("recruited_students_student_uid_idx").on(table.studentUid),
  ],
);

export const pgStudentGrowthTable = pgTable(
  "student_growth",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    studentUid: text("student_uid").notNull(),
    level: integer(),
    skillEx: integer("skill_ex"),
    skillNormal: integer("skill_normal"),
    skillEnhanced: integer("skill_enhanced"),
    skillSub: integer("skill_sub"),
    equip1: integer(),
    equip2: integer(),
    equip3: integer(),
    equipSpecial: integer("equip_special"),
    targetLevel: integer("target_level"),
    targetSkillEx: integer("target_skill_ex"),
    targetSkillNormal: integer("target_skill_normal"),
    targetSkillEnhanced: integer("target_skill_enhanced"),
    targetSkillSub: integer("target_skill_sub"),
    targetEquip1: integer("target_equip1"),
    targetEquip2: integer("target_equip2"),
    targetEquip3: integer("target_equip3"),
    targetEquipSpecial: integer("target_equip_special"),
    targetTier: integer("target_tier"),
    targetWeaponLevel: integer("target_weapon_level"),
    targetAbilityHp: integer("target_ability_hp"),
    targetAbilityAtk: integer("target_ability_atk"),
    targetAbilityHeal: integer("target_ability_heal"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("student_growth_uid_uidx").on(table.uid),
    uniqueIndex("student_growth_user_student_uidx").on(table.userId, table.studentUid),
    index("student_growth_user_id_idx").on(table.userId),
  ],
);

export const pgRelationshipLevelsTable = pgTable(
  "user_relationship_levels",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    studentId: text("student_id").notNull(),
    currentLevel: integer("current_level").notNull(),
    currentExp: integer("current_exp"),
    targetLevel: integer("target_level").notNull(),
    items: jsonb().$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_relationship_levels_uid_uidx").on(table.uid),
    uniqueIndex("user_relationship_levels_user_student_uidx").on(table.userId, table.studentId),
    index("user_relationship_levels_user_id_idx").on(table.userId),
  ],
);

export const pgGrowthResourceInventoryTable = pgTable(
  "growth_resource_inventory",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    itemUid: text("item_uid").notNull(),
    quantity: integer().notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("growth_resource_inventory_uid_uidx").on(table.uid),
    uniqueIndex("growth_resource_inventory_user_item_uidx").on(table.userId, table.itemUid),
    index("growth_resource_inventory_user_id_idx").on(table.userId),
  ],
);

export const pgSyncDraftsTable = pgTable(
  "sync_drafts",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    apiKeyUid: text("api_key_uid"),
    source: text().notNull().default("connect"),
    sourceRef: text("source_ref"),
    type: text().notNull(),
    status: text().notNull().default("pending"),
    toolName: text("tool_name"),
    toolVersion: text("tool_version"),
    catalogVersion: text("catalog_version"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    appliedAt: timestamptz("applied_at"),
    expiresAt: timestamptz("expires_at"),
  },
  (table) => [
    uniqueIndex("sync_drafts_uid_uidx").on(table.uid),
    uniqueIndex("sync_drafts_user_source_ref_uidx")
      .on(table.userId, table.source, table.sourceRef)
      .where(sql`${table.sourceRef} is not null`),
    index("sync_drafts_user_status_idx").on(table.userId, table.status),
  ],
);

export const pgSyncDraftEntriesTable = pgTable(
  "sync_draft_entries",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    draftUid: text("draft_uid").notNull(),
    entryKey: text("entry_key").notNull(),
    value: integer().notNull(),
    valueJson: text("value_json"),
    meta: text(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sync_draft_entries_uid_uidx").on(table.uid),
    uniqueIndex("sync_draft_entries_draft_entry_uidx").on(table.draftUid, table.entryKey),
    index("sync_draft_entries_draft_uid_idx").on(table.draftUid, table.id),
  ],
);

export const pgUserResourceInventoryDraftsTable = pgTable(
  "user_resource_inventory_drafts",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    userId: integer("user_id").notNull(),
    status: text().notNull().default("pending"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    appliedAt: timestamptz("applied_at"),
  },
  (table) => [
    uniqueIndex("user_resource_inventory_drafts_uid_uidx").on(table.uid),
    index("user_resource_inventory_drafts_user_status_idx").on(table.userId, table.status),
  ],
);

export const pgUserResourceInventoryDraftItemsTable = pgTable(
  "user_resource_inventory_draft_items",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    uid: text().notNull(),
    draftUid: text("draft_uid").notNull(),
    itemUid: text("item_uid").notNull(),
    quantity: integer().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_resource_inventory_draft_items_uid_uidx").on(table.uid),
    uniqueIndex("user_resource_inventory_draft_items_draft_item_uidx").on(table.draftUid, table.itemUid),
    index("user_resource_inventory_draft_items_draft_uid_idx").on(table.draftUid),
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
    storagePurgedAt: timestamptz("storage_purged_at"),
    trainingConsentAt: timestamptz("training_consent_at"),
    trainingConsentVersion: text("training_consent_version"),
  },
  (table) => [
    index("ocr_jobs_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("ocr_jobs_user_kind_created_idx").on(table.userId, table.jobKind, table.createdAt.desc()),
    index("ocr_jobs_status_updated_idx").on(table.status, table.updatedAt),
    index("ocr_jobs_purge_after_idx").on(table.purgeAfter),
    index("ocr_jobs_pending_storage_purge_idx").on(table.purgeAfter).where(sql`${table.storagePurgedAt} is null`),
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
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
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
