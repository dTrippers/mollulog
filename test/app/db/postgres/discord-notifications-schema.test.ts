import { describe, expect, it } from "@jest/globals";
import {
  pgNotificationChannelsTable,
  pgNotificationDeliveriesTable,
  pgNotificationJobDedupKeysTable,
  pgNotificationJobsTable,
  pgNotificationPreferencesTable,
  pgNotificationPushSubscriptionsTable,
  pgTimelineContentsTable,
} from "~/db/postgres/schema";

describe("Notification PostgreSQL schema", () => {
  it("keeps channel state, row-shaped preferences, and channel-scoped job fields", () => {
    expect(pgTimelineContentsTable.rewardExchangeEndAt).toBeDefined();
    expect(pgNotificationChannelsTable.channelType).toBeDefined();
    expect(pgNotificationChannelsTable.recipientKey).toBeDefined();
    expect(pgNotificationChannelsTable.status).toBeDefined();
    expect(pgNotificationChannelsTable.activatedAt).toBeDefined();
    expect(pgNotificationPreferencesTable.notificationType).toBeDefined();
    expect(pgNotificationPreferencesTable.enabled).toBeDefined();
    expect(pgNotificationPreferencesTable.leadHours).toBeDefined();
    expect(pgNotificationPreferencesTable.effectiveAt).toBeDefined();
    expect(pgNotificationJobsTable.channelUid).toBeDefined();
    expect(pgNotificationJobsTable.logicalUid).toBeDefined();
    expect(pgNotificationJobsTable.deliverySnapshotAt).toBeDefined();
    expect(pgNotificationJobDedupKeysTable.userId).toBeDefined();
    expect(pgNotificationJobDedupKeysTable.ownerChannelUid).toBeDefined();
    expect(pgNotificationJobsTable.plannedSendAt).toBeDefined();
    expect(pgNotificationJobsTable.payload).toBeDefined();
    expect(pgNotificationJobsTable.publishAttempts).toBeDefined();
    expect(pgNotificationJobsTable.deliveryAttempts).toBeDefined();
    expect(pgNotificationJobsTable.availableAt).toBeDefined();
    expect(pgNotificationJobsTable.publishingAt).toBeDefined();
    expect(pgNotificationPushSubscriptionsTable.endpointCiphertext).toBeDefined();
    expect(pgNotificationPushSubscriptionsTable.endpointFingerprint).toBeDefined();
    expect(pgNotificationPushSubscriptionsTable.activatedAt).toBeDefined();
    expect(pgNotificationDeliveriesTable.notificationJobUid).toBeDefined();
    expect(pgNotificationDeliveriesTable.targetType).toBeDefined();
    expect(pgNotificationDeliveriesTable.status).toBeDefined();
  });
});
