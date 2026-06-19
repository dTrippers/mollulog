import { describe, expect, it } from "@jest/globals";
import {
  getLatestAdminFeedbackReplyId,
  hasUnreadAdminFeedbackReplies,
  markFeedbackTicketAdminRepliesSeen,
} from "~/models/feedback";

type FeedbackTicketRow = {
  id: number;
  userId: number;
  lastSeenAdminReplyId: number;
};

type FeedbackReplyRow = {
  id: number;
  ticketId: number;
  isAdmin: number;
};

class FakeD1Statement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeFeedbackD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): FakeD1Statement {
    this.params = params;
    return this;
  }

  async all(): Promise<{ results: Record<string, unknown>[] }> {
    return { results: this.db.selectRows(this.sql, this.params) };
  }

  async raw(): Promise<unknown[][]> {
    return this.db.selectRows(this.sql, this.params).map((row) => Object.values(row));
  }

  async get(): Promise<Record<string, unknown> | undefined> {
    return this.db.selectRows(this.sql, this.params)[0];
  }

  async first(): Promise<Record<string, unknown> | undefined> {
    return this.get();
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return { success: true, meta: { changes: this.db.execute(this.sql, this.params) } };
  }
}

class FakeFeedbackD1Database {
  readonly tickets: FeedbackTicketRow[] = [];
  readonly replies: FeedbackReplyRow[] = [];
  readonly executedSql: string[] = [];
  writeCount = 0;

  prepare(sql: string): FakeD1Statement {
    this.executedSql.push(sql);
    return new FakeD1Statement(this, sql);
  }

  selectRows(sql: string, params: unknown[]): Record<string, unknown>[] {
    const normalizedSql = normalizeSql(sql);

    if (normalizedSql.includes("from feedback_tickets") && normalizedSql.includes("join feedback_replies")) {
      const userId = Number(params[1]);
      return this.hasUnreadAdminReply(userId) ? [{ exists: 1 }] : [];
    }

    throw new Error(`Unexpected SELECT SQL: ${sql}\nparams: ${JSON.stringify(params)}`);
  }

  execute(sql: string, params: unknown[]): number {
    const normalizedSql = normalizeSql(sql);
    if (!normalizedSql.startsWith("update feedback_tickets")) {
      throw new Error(`Unexpected write SQL: ${sql}`);
    }

    const ticketId = Number(params[1]);
    const userId = Number(params[2]);
    const latestAdminReplyId = Number(params[0]);
    const ticket = this.tickets.find((candidate) => candidate.id === ticketId && candidate.userId === userId);
    if (!ticket) {
      return 0;
    }

    if (ticket.lastSeenAdminReplyId >= latestAdminReplyId) {
      return 0;
    }

    ticket.lastSeenAdminReplyId = latestAdminReplyId;
    this.writeCount += 1;
    return 1;
  }

  private hasUnreadAdminReply(userId: number): boolean {
    return this.tickets.some(
      (ticket) =>
        ticket.userId === userId &&
        this.replies.some(
          (reply) => reply.ticketId === ticket.id && reply.isAdmin === 1 && reply.id > ticket.lastSeenAdminReplyId,
        ),
    );
  }
}

function createEnv() {
  const db = new FakeFeedbackD1Database();
  return {
    db,
    env: { DB: db } as unknown as Env,
  };
}

function normalizeSql(sql: string): string {
  return sql.replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
}

describe("feedback personal navigation state", () => {
  it("detects unread admin replies only when an admin reply is past the ticket cursor", async () => {
    const { db, env } = createEnv();
    db.tickets.push({ id: 10, userId: 1, lastSeenAdminReplyId: 100 });
    db.replies.push({ id: 101, ticketId: 10, isAdmin: 0 }, { id: 102, ticketId: 10, isAdmin: 1 });

    await expect(hasUnreadAdminFeedbackReplies(env, 1)).resolves.toBe(true);
    await expect(hasUnreadAdminFeedbackReplies(env, 2)).resolves.toBe(false);

    db.tickets[0].lastSeenAdminReplyId = 102;
    await expect(hasUnreadAdminFeedbackReplies(env, 1)).resolves.toBe(false);
  });

  it("finds the latest admin reply id without counting user replies", () => {
    expect(
      getLatestAdminFeedbackReplyId([
        { id: 10, uid: "reply-user", ticketId: 1, userId: 1, isAdmin: false, content: "user", createdAt: "" },
        { id: 11, uid: "reply-admin-a", ticketId: 1, userId: 2, isAdmin: true, content: "admin", createdAt: "" },
        { id: 12, uid: "reply-user-b", ticketId: 1, userId: 1, isAdmin: false, content: "user", createdAt: "" },
      ]),
    ).toBe(11);
  });

  it("advances the ticket cursor once and skips the update statement after the reply is seen", async () => {
    const { db, env } = createEnv();
    const unreadTicket = { id: 10, userId: 1, lastSeenAdminReplyId: 100 };
    const seenTicket = { id: 10, userId: 1, lastSeenAdminReplyId: 105 };
    db.tickets.push({ ...unreadTicket });

    await markFeedbackTicketAdminRepliesSeen(env, unreadTicket, 105);
    await markFeedbackTicketAdminRepliesSeen(env, seenTicket, 105);

    expect(db.tickets[0].lastSeenAdminReplyId).toBe(105);
    expect(db.writeCount).toBe(1);
    expect(db.executedSql.filter((sql) => normalizeSql(sql).startsWith("update feedback_tickets"))).toHaveLength(1);
  });
});
