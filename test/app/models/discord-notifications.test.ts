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
    form.set("leadHours", "23");
    expect(parseDiscordNotificationSettingsForm(form)).toEqual({
      eventStartEnabled: true,
      eventEndEnabled: false,
      rewardExchangeEndEnabled: true,
      recruitmentStartEnabled: false,
      leadHours: 23,
    });
  });

  it("keeps identity uniqueness as an explicit operational error", () => {
    expect(new DiscordIdentityAlreadyLinkedError().message).toContain("다른 선생님");
  });

  it("rejects a lead time outside the supported range", () => {
    const form = new FormData();
    form.set("leadHours", "25");
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
                lead_hours: 24,
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
        leadHours: 24,
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
        leadHours: 12,
      },
      { now: () => new Date("2026-09-02T00:00:00.000Z") },
    );
    expect(changed.effectiveAt).toBe("2026-09-02T00:00:00.000Z");
    expect(statements.some((statement) => statement.includes("discord_recruitment_schedules"))).toBe(false);
  });

  it("creates the Discord login identity and pending claim in one ownership transaction", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select uid from discord_notification_subscriptions")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await expect(
      upsertPendingDiscordConnection(env, 7, "1234567890", { now: () => new Date("2026-09-01T00:00:00.000Z") }),
    ).resolves.toEqual({
      status: "pending",
      connectionUid: expect.any(String),
      connectionVersion: Date.parse("2026-09-01T00:00:00.000Z"),
    });
    const identityInsertIndex = statements.findIndex((statement) =>
      statement.startsWith("insert into auth_identities"),
    );
    const subscriptionInsertIndex = statements.findIndex((statement) =>
      statement.startsWith("insert into discord_notification_subscriptions"),
    );
    expect(identityInsertIndex).toBeGreaterThan(-1);
    expect(subscriptionInsertIndex).toBeGreaterThan(identityInsertIndex);
    expect(statements.some((statement) => statement.startsWith("insert into discord_notification_subscriptions"))).toBe(
      true,
    );
  });

  it("rejects a Discord identity owned by another user before either write", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select sensei_id, provider_user_id")) {
          return { rows: [{ sensei_id: 8, provider_user_id: "1234567890" }], rowCount: 1 };
        }
        if (normalized.startsWith("select user_id, discord_user_id")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    await expect(upsertPendingDiscordConnection(env, 7, "1234567890")).rejects.toThrow(
      DiscordIdentityAlreadyLinkedError,
    );
    expect(statements.some((statement) => statement.startsWith("insert into auth_identities"))).toBe(false);
    expect(statements.some((statement) => statement.startsWith("insert into discord_notification_subscriptions"))).toBe(
      false,
    );
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("rolls back the identity when pending subscription creation fails", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select uid from discord_notification_subscriptions")) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.startsWith("insert into discord_notification_subscriptions")) {
          throw new Error("subscription insert failed");
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await expect(upsertPendingDiscordConnection(env, 7, "1234567890")).rejects.toThrow("subscription insert failed");
    expect(statements.some((statement) => statement.startsWith("insert into auth_identities"))).toBe(true);
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.includes("COMMIT")).toBe(false);
  });

  it("presents an unsupported legacy connection status as unlinked without persisting it", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select status")) {
          return {
            rows: [
              {
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

  it("does not expose the Discord user ID in notification state", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select status")) {
          return {
            rows: [
              {
                uid: "connection-1",
                discord_user_id: "1234567890",
                status: "active",
                event_start_enabled: false,
                event_end_enabled: false,
                reward_exchange_end_enabled: false,
                recruitment_start_enabled: false,
                lead_hours: 24,
                effective_at: new Date("2026-09-01T00:00:00.000Z"),
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    const { connection } = await getDiscordNotificationState(env, 7);
    expect(connection).toEqual({ status: "active" });
  });
});
