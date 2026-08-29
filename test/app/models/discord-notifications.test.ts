import { describe, expect, it, jest } from "@jest/globals";
import {
  DiscordIdentityAlreadyLinkedError,
  DiscordNotificationValidationError,
  getDiscordNotificationState,
  parseDiscordNotificationSettingsForm,
  saveDiscordNotificationSettings,
  unlinkDiscordConnection,
  upsertPendingDiscordConnection,
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

  it("frees the Discord identity while cancelling jobs in one transaction", async () => {
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
    expect(statements.some((statement) => statement.startsWith("delete from discord_notification_subscriptions"))).toBe(
      true,
    );
    expect(
      statements.some(
        (statement) => statement.startsWith("update discord_notification_jobs") && statement.includes("'blocked'"),
      ),
    ).toBe(true);
    expect(
      statements.findIndex((statement) => statement.startsWith("delete from discord_notification_subscriptions")),
    ).toBeGreaterThan(statements.findIndex((statement) => statement.startsWith("update discord_notification_jobs")));
  });

  it("preserves effective_at for unchanged settings and advances it for changes", async () => {
    const existingEffectiveAt = new Date("2026-08-01T00:00:00.000Z");
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select status, event_start_enabled")) {
          return {
            rows: [
              {
                status: "active",
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

  it("requires the matching Discord login identity before creating a notification claim", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select sensei_id, provider_user_id")) {
          return { rows: [{ sensei_id: 7, provider_user_id: "1234567890" }], rowCount: 1 };
        }
        if (normalized.startsWith("select uid from discord_notification_subscriptions")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await expect(
      upsertPendingDiscordConnection(env, 7, "1234567890", { now: () => new Date("2026-09-01T00:00:00.000Z") }),
    ).resolves.toMatchObject({ status: "pending", discordUserId: "1234567890" });
    expect(statements.some((statement) => statement.startsWith("insert into discord_notification_subscriptions"))).toBe(
      true,
    );
  });

  it("does not create a notification claim for a notification-only account", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select sensei_id, provider_user_id")) return { rows: [], rowCount: 0 };
        if (normalized.startsWith("select user_id, discord_user_id")) {
          return { rows: [{ user_id: 7, discord_user_id: "1234567890", status: "active" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    await expect(upsertPendingDiscordConnection(env, 7, "1234567890")).rejects.toThrow(
      "Discord 로그인 계정을 먼저 연결해주세요.",
    );
    expect(statements.some((statement) => statement.startsWith("insert into discord_notification_subscriptions"))).toBe(
      false,
    );
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("presents an unsupported legacy connection status as unlinked without persisting it", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select uid, discord_user_id")) {
          return {
            rows: [
              {
                uid: "connection-1",
                discord_user_id: "1234567890",
                status: "unlinked",
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    const { connection } = await getDiscordNotificationState(env, 7, {
      now: () => new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(connection).toBeNull();
  });
});
