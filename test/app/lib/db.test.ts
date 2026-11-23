import { describe, expect, it } from "@jest/globals";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { postgresUniqueConstraintName } from "~/lib/db";

const pgUniqueViolation = Object.assign(new Error("duplicate key value violates unique constraint"), {
  code: "23505",
  constraint: "raid_records_user_server_raid_season_uidx",
});

describe("postgresUniqueConstraintName", () => {
  it("reads the constraint of a pg unique violation", () => {
    expect(postgresUniqueConstraintName(pgUniqueViolation)).toBe("raid_records_user_server_raid_season_uidx");
  });

  it("reads the constraint of a unique violation drizzle wrapped as the query error's cause", () => {
    const wrapped = new DrizzleQueryError("insert into raid_records ...", [], pgUniqueViolation);
    expect(postgresUniqueConstraintName(wrapped)).toBe("raid_records_user_server_raid_season_uidx");
  });

  it("returns null for other errors", () => {
    expect(
      postgresUniqueConstraintName(
        new DrizzleQueryError("select 1", [], Object.assign(new Error(), { code: "40001" })),
      ),
    ).toBeNull();
    expect(postgresUniqueConstraintName(Object.assign(new Error(), { code: "23505" }))).toBeNull();
    expect(postgresUniqueConstraintName(new Error("boom"))).toBeNull();
    expect(postgresUniqueConstraintName(null)).toBeNull();
  });
});
