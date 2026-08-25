import { describe, expect, it } from "@jest/globals";
import {
  pgDiscordConnectionsTable,
  pgDiscordNotificationJobsTable,
  pgDiscordNotificationOutboxTable,
  pgDiscordNotificationSettingsTable,
  pgDiscordRecruitmentSchedulesTable,
  pgTimelineContentsTable,
} from "~/db/postgres/schema";

describe("Discord notification PostgreSQL schema", () => {
  it("keeps the manual reward exchange end and immutable job fields in the canonical schema", () => {
    expect(pgTimelineContentsTable.rewardExchangeEndAt).toBeDefined();
    expect(pgDiscordConnectionsTable.discordUserId).toBeDefined();
    expect(pgDiscordNotificationSettingsTable.effectiveAt).toBeDefined();
    expect(pgDiscordRecruitmentSchedulesTable.recruitmentUid).toBeDefined();
    expect(pgDiscordNotificationJobsTable.plannedSendAt).toBeDefined();
    expect(pgDiscordNotificationJobsTable.payload).toBeDefined();
    expect(pgDiscordNotificationOutboxTable.jobUid).toBeDefined();
  });
});
