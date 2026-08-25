import { describe, expect, it, jest } from "@jest/globals";
import {
  DiscordIdentityAlreadyLinkedError,
  DiscordNotificationValidationError,
  parseDiscordNotificationSettingsForm,
  saveDiscordNotificationSettings,
  unlinkDiscordConnection,
} from "~/models/discord-notifications.server";

jest.mock("~/lib/postgres.server", () => ({
  withPostgresClient: async (env: { __pgClient: unknown }, operation: (client: unknown) => Promise<unknown>) =>
    operation(env.__pgClient),
}));

describe("Discord notification settings boundary", () => {
  it("validates explicit settings and all four independent trigger values", () => {
    const form = new FormData();
    form.set("eventStartEnabled", "true");
    form.set("eventEndEnabled", "false");
    form.set("rewardExchangeEndEnabled", "true");
    form.set("recruitmentStartEnabled", "false");
    form.set("timingMode", "same-day");
    form.set("kstHour", "23");
    expect(parseDiscordNotificationSettingsForm(form)).toEqual({
      eventStartEnabled: true,
      eventEndEnabled: false,
      rewardExchangeEndEnabled: true,
      recruitmentStartEnabled: false,
      timingMode: "same-day",
      kstHour: 23,
    });
  });

  it("keeps identity uniqueness as an explicit operational error", () => {
    expect(new DiscordIdentityAlreadyLinkedError().message).toContain("다른 선생님");
  });

  it("rejects tampered timing values instead of silently selecting day-before", () => {
    const form = new FormData();
    form.set("timingMode", "tomorrow");
    form.set("kstHour", "11");
    expect(() => parseDiscordNotificationSettingsForm(form)).toThrow(DiscordNotificationValidationError);
  });

  it("frees the Discord identity while cancelling jobs and outbox rows in one transaction", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        statements.push(text.replace(/\s+/g, " ").trim());
        return { rows: [], rowCount: 1 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await unlinkDiscordConnection(env, 7, { now: () => new Date("2026-09-01T00:00:00.000Z") });

    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some((statement) => statement.startsWith("delete from discord_connections"))).toBe(true);
    expect(statements.some((statement) => statement.startsWith("update discord_notification_outbox"))).toBe(true);
    expect(
      statements.some(
        (statement) => statement.startsWith("update discord_notification_jobs") && statement.includes("'blocked'"),
      ),
    ).toBe(true);
    expect(
      statements.findIndex((statement) => statement.startsWith("delete from discord_connections")),
    ).toBeGreaterThan(statements.findIndex((statement) => statement.startsWith("update discord_notification_jobs")));
  });

  it("preserves effective_at for unchanged settings and advances it for changes", async () => {
    const existingEffectiveAt = new Date("2026-08-01T00:00:00.000Z");
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select status from discord_connections")) {
          return { rows: [{ status: "active" }], rowCount: 1 };
        }
        if (normalized.startsWith("select event_start_enabled")) {
          return {
            rows: [
              {
                event_start_enabled: true,
                event_end_enabled: false,
                reward_exchange_end_enabled: false,
                recruitment_start_enabled: false,
                timing_mode: "day-before",
                kst_hour: 11,
                effective_at: existingEffectiveAt,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    const unchanged = await saveDiscordNotificationSettings(
      env,
      7,
      {
        eventStartEnabled: true,
        eventEndEnabled: false,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        timingMode: "day-before",
        kstHour: 11,
      },
      { now: () => new Date("2026-09-01T00:00:00.000Z") },
    );
    expect(unchanged.effectiveAt).toBe(existingEffectiveAt.toISOString());

    const changed = await saveDiscordNotificationSettings(
      env,
      7,
      {
        eventStartEnabled: true,
        eventEndEnabled: false,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        timingMode: "same-day",
        kstHour: 11,
      },
      { now: () => new Date("2026-09-02T00:00:00.000Z") },
    );
    expect(changed.effectiveAt).toBe("2026-09-02T00:00:00.000Z");
    expect(statements.some((statement) => statement.includes("discord_recruitment_schedules"))).toBe(false);
  });
});
