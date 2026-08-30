import { describe, expect, it, jest } from "@jest/globals";
import {
  DiscordIdentityAlreadyLinkedError,
  DiscordNotificationSettingsInconsistentError,
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

const existingEffectiveAt = new Date("2026-08-01T00:00:00.000Z");
const laterEffectiveAt = new Date("2026-09-02T00:00:00.000Z");

function preferenceRows(leadHours = 24, effectiveAt = existingEffectiveAt) {
  return [
    { notification_type: "event-start", enabled: true, lead_hours: leadHours, effective_at: effectiveAt },
    { notification_type: "event-end", enabled: false, lead_hours: leadHours, effective_at: effectiveAt },
    { notification_type: "reward-exchange-end", enabled: false, lead_hours: leadHours, effective_at: effectiveAt },
    { notification_type: "recruitment-start", enabled: false, lead_hours: leadHours, effective_at: effectiveAt },
  ];
}

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

  it("frees only the Discord channel while cancelling that channel's unfinished jobs", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select uid from notification_channels")) {
          return { rows: [{ uid: "channel-1" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await unlinkDiscordConnection(env, 7, { now: () => new Date("2026-09-01T00:00:00.000Z") });

    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some((statement) => statement.startsWith("delete from notification_channels"))).toBe(true);
    expect(
      statements.some(
        (statement) => statement.startsWith("update notification_jobs") && statement.includes("'blocked'"),
      ),
    ).toBe(true);
    expect(statements.some((statement) => statement.startsWith("delete from notification_preferences"))).toBe(false);
  });

  it("writes the shared lead time to all four preference rows transactionally", async () => {
    const statements: string[] = [];
    const insertValues: unknown[][] = [];
    const client = {
      async query(text: string, values: readonly unknown[] = []) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select status from notification_channels")) {
          return { rows: [{ status: "active" }], rowCount: 1 };
        }
        if (normalized.startsWith("select notification_type")) {
          return { rows: preferenceRows(), rowCount: 4 };
        }
        if (normalized.startsWith("insert into notification_preferences")) {
          insertValues.push([...values]);
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    const saved = await saveDiscordNotificationSettings(
      env,
      7,
      {
        eventStartEnabled: true,
        eventEndEnabled: true,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        leadHours: 12,
      },
      { now: () => laterEffectiveAt },
    );

    expect(saved.effectiveAt).toBe(laterEffectiveAt.toISOString());
    expect(insertValues).toHaveLength(1);
    expect(statements.filter((statement) => statement.startsWith("insert into notification_preferences"))).toHaveLength(
      1,
    );
    expect(insertValues[0]).toEqual(
      expect.arrayContaining(["event-start", "event-end", "reward-exchange-end", "recruitment-start", 12]),
    );
  });

  it("fails explicitly when stored preference lead times disagree", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select status from notification_channels")) {
          return { rows: [{ status: "active" }], rowCount: 1 };
        }
        if (normalized.startsWith("select notification_type")) {
          return { rows: [preferenceRows(24)[0], { ...preferenceRows(24)[1], lead_hours: 12 }], rowCount: 2 };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await expect(
      saveDiscordNotificationSettings(env, 7, {
        eventStartEnabled: true,
        eventEndEnabled: false,
        rewardExchangeEndEnabled: false,
        recruitmentStartEnabled: false,
        leadHours: 24,
      }),
    ).rejects.toThrow(DiscordNotificationSettingsInconsistentError);
  });

  it("creates the Discord login identity and pending channel in one ownership transaction", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("select uid from notification_channels")) {
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
    const channelInsertIndex = statements.findIndex((statement) =>
      statement.startsWith("insert into notification_channels"),
    );
    expect(identityInsertIndex).toBeGreaterThan(-1);
    expect(channelInsertIndex).toBeGreaterThan(identityInsertIndex);
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
        if (normalized.startsWith("select user_id, channel_type")) {
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
    expect(statements.some((statement) => statement.startsWith("insert into notification_channels"))).toBe(false);
    expect(statements.at(-1)).toBe("ROLLBACK");
  });

  it("rolls back the identity when pending channel creation fails", async () => {
    const statements: string[] = [];
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        statements.push(normalized);
        if (normalized.startsWith("insert into notification_channels")) throw new Error("channel insert failed");
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;

    await expect(upsertPendingDiscordConnection(env, 7, "1234567890")).rejects.toThrow("channel insert failed");
    expect(statements.some((statement) => statement.startsWith("insert into auth_identities"))).toBe(true);
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements.includes("COMMIT")).toBe(false);
  });

  it("treats an unsupported channel status as unlinked without persisting it", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select status from notification_channels")) {
          return { rows: [{ status: "unlinked" }], rowCount: 1 };
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

  it("does not expose the Discord recipient key in notification state", async () => {
    const client = {
      async query(text: string) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (normalized.startsWith("select status from notification_channels")) {
          return { rows: [{ status: "active", recipient_key: "1234567890" }], rowCount: 1 };
        }
        if (normalized.startsWith("select notification_type")) {
          return { rows: preferenceRows(), rowCount: 4 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const env = { __pgClient: client } as unknown as Env;
    const state = await getDiscordNotificationState(env, 7);
    expect(state.connection).toEqual({ status: "active" });
    expect(state).not.toHaveProperty("recipientKey");
  });
});
