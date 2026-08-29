import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const migration = readFileSync("db/postgres/migrations/20260826000100_create_discord_notifications.sql", "utf8");
const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

describe("Discord notification migration contract", () => {
  it("keeps MolluLog as the DDL owner for the complete notification ledger", () => {
    for (const table of ["discord_notification_subscriptions", "discord_notification_jobs"]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(schema).toContain(`"${table}"`);
    }
    for (const removedTable of [
      "discord_connections",
      "discord_notification_settings",
      "discord_recruitment_schedules",
      "discord_notification_outbox",
    ]) {
      expect(migration).not.toContain(`CREATE TABLE ${removedTable}`);
      expect(schema).not.toContain(`"${removedTable}"`);
    }
    expect(migration).toContain("reward_exchange_end_at timestamptz");
    expect(migration).toContain("discord_notification_subscriptions_discord_user_id_uidx");
    expect(migration).toContain("planned_send_at);");
    expect(migration).toContain("publish_attempts integer");
    expect(migration).toContain("delivery_attempts integer");
  });

  it("does not add a Discord access or refresh token column", () => {
    expect(migration).not.toMatch(/access[_ ]token|refresh[_ ]token/i);
  });
});
