import { describe, expect, it } from "@jest/globals";
import {
  pgDiscordNotificationJobsTable,
  pgDiscordNotificationSubscriptionsTable,
  pgTimelineContentsTable,
} from "~/db/postgres/schema";

describe("Discord notification PostgreSQL schema", () => {
  it("keeps subscription settings and immutable job fields in the canonical schema", () => {
    expect(pgTimelineContentsTable.rewardExchangeEndAt).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.discordUserId).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.status).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.eventStartEffectiveAt).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.eventEndEffectiveAt).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.rewardExchangeEndEffectiveAt).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.recruitmentStartEffectiveAt).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.eventStartEnabled).toBeDefined();
    expect(pgDiscordNotificationSubscriptionsTable.recruitmentStartEnabled).toBeDefined();
    expect(pgDiscordNotificationJobsTable.plannedSendAt).toBeDefined();
    expect(pgDiscordNotificationJobsTable.payload).toBeDefined();
    expect(pgDiscordNotificationJobsTable.publishAttempts).toBeDefined();
    expect(pgDiscordNotificationJobsTable.deliveryAttempts).toBeDefined();
    expect(pgDiscordNotificationJobsTable.availableAt).toBeDefined();
    expect(pgDiscordNotificationJobsTable.publishingAt).toBeDefined();
  });
});
