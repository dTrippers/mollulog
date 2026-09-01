import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

describe("feedback ticket metadata migration", () => {
  const migration = readFileSync(
    "db/postgres/migrations/20260901000100_add_feedback_operator_notification_timestamps.sql",
    "utf8",
  );
  const schema = readFileSync("app/db/postgres/schema.ts", "utf8");

  it("adds only nullable tag and Linear issue URL columns", () => {
    expect(migration).toContain("ALTER TABLE feedback_tickets");
    expect(migration).toContain("ADD COLUMN tag text");
    expect(migration).toContain("ADD COLUMN linear_issue_url text");
    expect(migration).not.toMatch(/NOT NULL|DEFAULT|CHECK\s*\(/i);
    expect(schema).toContain("tag: text(),");
    expect(schema).toContain('linearIssueUrl: text("linear_issue_url"),');
    expect(migration).not.toContain("CREATE INDEX feedback_tickets_operator_notification_pending_idx");
    expect(migration).not.toContain("CREATE INDEX feedback_replies_operator_notification_pending_idx");
  });
});
