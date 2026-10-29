import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Client } from "pg";
import {
  completePostgresChatMessage,
  retryPostgresChatMessage,
  startPostgresChatMessage,
} from "~/db/postgres/chat-conversations";
import { CHAT_PENDING_STALE_MS } from "~/domain/chat-conversation";

const describeDatabase = process.env.MOLLULOG_CHAT_POSTGRES === "1" ? describe : describe.skip;
const schema = `chat_test_${randomUUID().replaceAll("-", "")}`;
const migration = readFileSync(resolve("db/postgres/migrations/20261029000100_create_chat_conversations.sql"), "utf8");
const env = {} as Env;
const options = {
  createClient: () => new Client({ options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 }),
};
const answer = {
  text: "Answer",
  sources: [{ sourceId: "s1", kind: "student" as const, label: "미카" }],
  limitations: [],
};
let admin: Client;

function at(seconds: number) {
  return new Date(Date.UTC(2026, 9, 29, 3, 0, seconds));
}

async function start(conversationUid: string | null, question: string, now: Date, senseiId = 1) {
  return startPostgresChatMessage(env, { senseiId, conversationUid, question, personalMode: false, now }, options);
}

describeDatabase("chat conversations on PostgreSQL", () => {
  beforeAll(async () => {
    admin = new Client({ connectionTimeoutMillis: 5000 });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(migration);
  });

  afterAll(async () => {
    if (admin) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });

  it("creates a conversation, appends messages in order, and returns stored history", async () => {
    const first = await start(null, "  이번   총력전에\n미카 써도 돼?  ", at(0));
    if (!first.ok) throw new Error("first message should start");
    expect(first.started.previousMessages).toEqual([]);

    const busy = await start(first.started.conversationUid, "Second", at(1));
    expect(busy).toEqual({ ok: false, reason: "busy" });

    await completePostgresChatMessage(
      env,
      { messageUid: first.started.messageUid, outcome: { status: "answered", answer, runId: "run-1" }, now: at(2) },
      options,
    );
    const second = await start(first.started.conversationUid, "Second", at(3));
    if (!second.ok) throw new Error("second message should start");
    expect(second.started.previousMessages).toMatchObject([
      { uid: first.started.messageUid, seq: 1, status: "answered", answer, failureCode: null },
    ]);

    const { rows: conversations } = await admin.query(
      "SELECT title, last_message_at FROM chat_conversations WHERE uid = $1",
      [first.started.conversationUid],
    );
    expect(conversations).toEqual([{ title: "이번 총력전에 미카 써도 돼?", last_message_at: at(3) }]);
    const { rows: messages } = await admin.query("SELECT seq, status, run_id FROM chat_messages ORDER BY seq");
    expect(messages).toEqual([
      { seq: 1, status: "answered", run_id: "run-1" },
      { seq: 2, status: "pending", run_id: null },
    ]);
  });

  it("hides another sensei's conversation", async () => {
    const own = await start(null, "Mine", at(0), 2);
    if (!own.ok) throw new Error("message should start");
    expect(await start(own.started.conversationUid, "Other", at(1), 3)).toEqual({ ok: false, reason: "not_found" });
    expect(
      await retryPostgresChatMessage(
        env,
        {
          senseiId: 3,
          conversationUid: own.started.conversationUid,
          messageUid: own.started.messageUid,
          personalMode: false,
          now: at(1),
        },
        options,
      ),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("retries failed and interrupted messages in place, but not answered or in-progress ones", async () => {
    const first = await start(null, "First", at(0), 4);
    if (!first.ok) throw new Error("message should start");
    const { conversationUid, messageUid } = first.started;
    const retry = (now: Date, uid = messageUid) =>
      retryPostgresChatMessage(
        env,
        { senseiId: 4, conversationUid, messageUid: uid, personalMode: true, now },
        options,
      );

    expect(await retry(at(1))).toEqual({ ok: false, reason: "busy" });

    const interruptedAt = new Date(at(0).getTime() + CHAT_PENDING_STALE_MS + 1000);
    const interrupted = await retry(interruptedAt);
    expect(interrupted).toMatchObject({ ok: true, started: { messageUid, question: "First", previousMessages: [] } });

    await completePostgresChatMessage(
      env,
      {
        messageUid,
        outcome: { status: "failed", failureCode: "timeout", runId: "run-2" },
        now: new Date(interruptedAt.getTime() + 1000),
      },
      options,
    );
    const failedRetry = await retry(new Date(interruptedAt.getTime() + 2000));
    expect(failedRetry).toMatchObject({ ok: true });
    const { rows } = await admin.query(
      "SELECT status, personal_mode, failure_code, run_id, completed_at FROM chat_messages WHERE uid = $1",
      [messageUid],
    );
    expect(rows).toEqual([
      { status: "pending", personal_mode: true, failure_code: null, run_id: null, completed_at: null },
    ]);

    await completePostgresChatMessage(
      env,
      {
        messageUid,
        outcome: { status: "answered", answer, runId: "run-3" },
        now: new Date(interruptedAt.getTime() + 3000),
      },
      options,
    );
    expect(await retry(new Date(interruptedAt.getTime() + 4000))).toEqual({ ok: false, reason: "not_retryable" });
  });

  it("does not overwrite a message that is no longer pending", async () => {
    const first = await start(null, "Only", at(0), 5);
    if (!first.ok) throw new Error("message should start");
    const { messageUid } = first.started;
    await completePostgresChatMessage(
      env,
      { messageUid, outcome: { status: "answered", answer, runId: "run-a" }, now: at(1) },
      options,
    );
    await completePostgresChatMessage(
      env,
      { messageUid, outcome: { status: "failed", failureCode: "timeout", runId: "run-b" }, now: at(2) },
      options,
    );
    const { rows } = await admin.query("SELECT status, run_id FROM chat_messages WHERE uid = $1", [messageUid]);
    expect(rows).toEqual([{ status: "answered", run_id: "run-a" }]);
  });
});
