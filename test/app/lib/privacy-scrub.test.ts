import { describe, expect, it, jest } from "@jest/globals";
import { getLogger } from "~/lib/observability.server";
import { sanitizeErrorForLogging, sanitizeLogContext, serializeErrorForLogging } from "~/lib/privacy-scrub";

describe("privacy scrubbing", () => {
  it("removes identifiers and user text from logger context while retaining system object UIDs", () => {
    const output = jest.spyOn(console, "error").mockImplementation(() => {});
    const logger = getLogger({ STAGE: "test" } as unknown as Env, undefined, { route: "routes/contact._index" });

    logger.error("Request failed", new Error("database unavailable"), {
      userId: 123,
      username: "alice",
      email: "alice@example.com",
      ip: "192.0.2.1",
      requestUrl: "https://mollulog.net/contact/private-ticket?token=secret",
      searchTerm: "private search",
      dataKey: "cache::user=123::search=private search",
      cacheKey: "route::private-content::uid=STU_001",
      ticketUid: "ticket_system_uid",
      requestId: "request_system_uid",
    });

    const payload = JSON.stringify(output.mock.calls);
    expect(payload).toContain("ticket_system_uid");
    expect(payload).toContain("request_system_uid");
    for (const value of [
      "123",
      "alice",
      "alice@example.com",
      "192.0.2.1",
      "private-ticket",
      "secret",
      "private search",
      "STU_001",
    ]) {
      expect(payload).not.toContain(value);
    }
    output.mockRestore();
  });

  it("removes Drizzle params from messages and stacks and Postgres detail fields in cause chains", () => {
    const postgresError = new Error("duplicate key value violates unique constraint") as Error & {
      detail: string;
      where: string;
      table: string;
      column: string;
      constraint: string;
    };
    postgresError.detail = "Key (email)=(alice@example.com) already exists";
    postgresError.where = "PL/pgSQL function private_function() line 1";
    postgresError.table = "account";
    postgresError.column = "email";
    postgresError.constraint = "account_email_key";

    const drizzleError = new Error(
      'Failed query: insert into account (email) values ($1)\nparams: ["alice@example.com"]',
      { cause: postgresError },
    );
    drizzleError.name = "DrizzleQueryError";

    const sanitized = sanitizeErrorForLogging(drizzleError) as Error;
    const serialized = JSON.stringify(serializeErrorForLogging(drizzleError));
    const sentrySafe = JSON.stringify(sanitized);

    expect(sanitized.message).toBe("Failed query: insert into account (email) values ($1)");
    expect(sanitized.stack).toContain("insert into account (email) values ($1)");
    for (const value of ["params:", "alice@example.com", "PL/pgSQL", "account_email_key"]) {
      expect(sanitized.stack).not.toContain(value);
      expect(serialized).not.toContain(value);
      expect(sentrySafe).not.toContain(value);
    }
    expect(serialized).toContain("duplicate key value violates unique constraint");
  });

  it("recursively removes sensitive nested fields", () => {
    expect(
      sanitizeLogContext({
        eventUid: "event_system_uid",
        nested: { actorUserId: 7, oauthCode: "oauth-secret", detail: "private row data" },
      }),
    ).toEqual({ eventUid: "event_system_uid", nested: {} });
  });
});
