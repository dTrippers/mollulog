import { describe, expect, it } from "@jest/globals";
import {
  pgNotificationChannelsTable,
  pgNotificationJobsTable,
  pgNotificationPreferencesTable,
  pgTimelineContentsTable,
} from "~/db/postgres/schema";

describe("Notification PostgreSQL schema", () => {
  it("keeps channel state, row-shaped preferences, and channel-scoped job fields", () => {
    expect(pgTimelineContentsTable.rewardExchangeEndAt).toBeDefined();
    expect(pgNotificationChannelsTable.channelType).toBeDefined();
    expect(pgNotificationChannelsTable.recipientKey).toBeDefined();
    expect(pgNotificationChannelsTable.status).toBeDefined();
    expect(pgNotificationPreferencesTable.notificationType).toBeDefined();
    expect(pgNotificationPreferencesTable.enabled).toBeDefined();
    expect(pgNotificationPreferencesTable.leadHours).toBeDefined();
    expect(pgNotificationPreferencesTable.effectiveAt).toBeDefined();
    expect(pgNotificationJobsTable.channelUid).toBeDefined();
    expect(pgNotificationJobsTable.plannedSendAt).toBeDefined();
    expect(pgNotificationJobsTable.payload).toBeDefined();
    expect(pgNotificationJobsTable.publishAttempts).toBeDefined();
    expect(pgNotificationJobsTable.deliveryAttempts).toBeDefined();
    expect(pgNotificationJobsTable.availableAt).toBeDefined();
    expect(pgNotificationJobsTable.publishingAt).toBeDefined();
  });
});
