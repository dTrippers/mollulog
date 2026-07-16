import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { createPostgresFeedbackTicket } from "~/db/postgres/feedback";
import type { FeedbackAdditional } from "~/domain/feedback";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive };

describe("PostgreSQL feedback writes", () => {
  it("stores the versioned additional payload separately from user content", async () => {
    const query = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    const client = {
      connect: jest.fn(async () => undefined),
      end: jest.fn(async () => undefined),
      query,
    } as unknown as Client;
    const additional: FeedbackAdditional = {
      type: "event_shop_bug_report",
      version: 1,
      payload: {
        timestamp: "2026-07-16T00:00:00.000Z",
        eventUid: "event-1",
        target: 0,
      },
    };

    await createPostgresFeedbackTicket(env, 10, "오류 제보", "사용자가 입력한 내용", null, additional, {
      createClient: () => client,
    });

    const [{ text }, values] = query.mock.calls[0] as unknown as [{ text: string }, unknown[]];
    expect(text).toContain('insert into "feedback_tickets"');
    expect(text).toContain('"content"');
    expect(text).toContain('"additional"');
    expect(values).toContain("사용자가 입력한 내용");
    expect(values).toContain(JSON.stringify(additional));
    expect(client.end).toHaveBeenCalledTimes(1);
  });
});
