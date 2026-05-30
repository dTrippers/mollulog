import { describe, expect, it } from "@jest/globals";
import { isStudentNotFoundError } from "../../../app/lib/baql/errors";

describe("BAQL error helpers", () => {
  it("detects a missing student by GraphQL error path", () => {
    expect(
      isStudentNotFoundError({
        graphQLErrors: [
          {
            message: "Cannot return null for non-nullable field Query.student.",
            path: ["student"],
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          },
        ],
      }),
    ).toBe(true);
  });

  it("keeps the legacy BAQL non-null message fallback", () => {
    expect(
      isStudentNotFoundError({
        message: "[GraphQL] Cannot return null for non-nullable field Query.student.",
        graphQLErrors: [],
      }),
    ).toBe(true);
  });

  it("does not classify unrelated BAQL errors as missing students", () => {
    expect(
      isStudentNotFoundError({
        message: "[GraphQL] Cannot return null for non-nullable field Query.raidSchedule.",
        graphQLErrors: [{ path: ["raidSchedule"] }],
      }),
    ).toBe(false);
  });
});
