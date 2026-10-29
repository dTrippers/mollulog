import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { Client } from "pg";
import {
  completePostgresChatMessage,
  listPostgresChatConversations,
  readPostgresChatConversation,
  retryPostgresChatMessage,
  startPostgresChatMessage,
} from "~/db/postgres/chat-conversations";
import { CHAT_CONVERSATION_LIST_DAYS, CHAT_PENDING_STALE_MS } from "~/domain/chat-conversation";

const describeDatabase = process.env.MOLLULOG_CHAT_POSTGRES === "1" ? describe : describe.skip;
const schema = `chat_test_${randomUUID().replaceAll("-", "")}`;
const migration = readFileSync(resolve("db/postgres/migrations/20261029000100_create_chat_conversations.sql"), "utf8");
const progressMigration = readFileSync(
  resolve("db/postgres/migrations/20261029000200_add_chat_message_progress.sql"),
  "utf8",
);
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
    await admin.query(progressMigration);
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
      {
        messageUid: first.started.messageUid,
        outcome: {
          status: "answered",
          answer,
          runId: "run-1",
          progress: [
            {
              callId: "call-1",
              round: 1,
              toolName: "get_student",
              target: "미카",
              subject: { type: "student", uid: "101" },
              ok: true,
              sourceCount: 1,
            },
          ],
        },
        now: at(2),
      },
      options,
    );
    const second = await start(first.started.conversationUid, "Second", at(3));
    if (!second.ok) throw new Error("second message should start");
    expect(second.started.previousMessages).toMatchObject([
      {
        uid: first.started.messageUid,
        seq: 1,
        status: "answered",
        answer,
        failureCode: null,
        progress: [
          {
            callId: "call-1",
            round: 1,
            toolName: "get_student",
            target: "미카",
            subject: { type: "student", uid: "101" },
            ok: true,
            sourceCount: 1,
          },
        ],
      },
    ]);
    const failedProgress = [
      {
        callId: "call-2",
        round: 1,
        toolName: "search_knowledge",
        target: "총력전 공략",
        ok: false,
        sourceCount: 0,
      },
    ];
    await completePostgresChatMessage(
      env,
      {
        messageUid: second.started.messageUid,
        outcome: { status: "failed", failureCode: "timeout", runId: "run-2", progress: failedProgress },
        now: at(4),
      },
      options,
    );
    const stored = await readPostgresChatConversation(
      env,
      { senseiId: 1, conversationUid: first.started.conversationUid },
      options,
    );
    expect(stored?.messages[1]).toMatchObject({ status: "failed", progress: failedProgress });

    const { rows: conversations } = await admin.query(
      "SELECT title, last_message_at FROM chat_conversations WHERE uid = $1",
      [first.started.conversationUid],
    );
    expect(conversations).toEqual([{ title: "이번 총력전에 미카 써도 돼?", last_message_at: at(3) }]);
    const { rows: messages } = await admin.query("SELECT seq, status, run_id FROM chat_messages ORDER BY seq");
    expect(messages).toEqual([
      { seq: 1, status: "answered", run_id: "run-1" },
      { seq: 2, status: "failed", run_id: "run-2" },
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

  it("lists only the owner's conversations at the 30-day boundary with ordered messages and latest status", async () => {
    const now = at(0);
    const cutoff = new Date(now.getTime() - CHAT_CONVERSATION_LIST_DAYS * 24 * 60 * 60 * 1000);

    const recent = await start(null, "Recent", new Date(now.getTime() - 5_000), 21);
    if (!recent.ok) throw new Error("recent message should start");
    await completePostgresChatMessage(
      env,
      {
        messageUid: recent.started.messageUid,
        outcome: { status: "answered", answer, runId: "recent-1" },
        now: new Date(now.getTime() - 4_000),
      },
      options,
    );
    const second = await start(recent.started.conversationUid, "Latest", new Date(now.getTime() - 3_000), 21);
    if (!second.ok) throw new Error("second message should start");
    await completePostgresChatMessage(
      env,
      {
        messageUid: second.started.messageUid,
        outcome: { status: "failed", failureCode: "timeout", runId: "recent-2" },
        now: new Date(now.getTime() - 2_000),
      },
      options,
    );

    const boundary = await start(null, "Boundary", cutoff, 21);
    if (!boundary.ok) throw new Error("boundary message should start");
    await completePostgresChatMessage(
      env,
      {
        messageUid: boundary.started.messageUid,
        outcome: { status: "answered", answer, runId: "boundary" },
        now: cutoff,
      },
      options,
    );
    const older = await start(null, "Older", new Date(cutoff.getTime() - 1), 21);
    if (!older.ok) throw new Error("older message should start");
    const anotherSensei = await start(null, "Private", now, 22);
    if (!anotherSensei.ok) throw new Error("other sensei message should start");

    const listed = await listPostgresChatConversations(
      env,
      { senseiId: 21, now, listDays: CHAT_CONVERSATION_LIST_DAYS },
      options,
    );
    expect(listed).toEqual([
      {
        uid: recent.started.conversationUid,
        title: "Recent",
        lastMessageAt: new Date(now.getTime() - 3_000),
        questionCount: 2,
        latestMessage: { status: "failed", updatedAt: new Date(now.getTime() - 2_000) },
      },
      {
        uid: boundary.started.conversationUid,
        title: "Boundary",
        lastMessageAt: cutoff,
        questionCount: 1,
        latestMessage: { status: "answered", updatedAt: cutoff },
      },
    ]);
    const read = await readPostgresChatConversation(
      env,
      { senseiId: 21, conversationUid: recent.started.conversationUid },
      options,
    );
    expect(read?.messages.map(({ seq, question, status }) => ({ seq, question, status }))).toEqual([
      { seq: 1, question: "Recent", status: "answered" },
      { seq: 2, question: "Latest", status: "failed" },
    ]);
    await expect(
      readPostgresChatConversation(env, { senseiId: 22, conversationUid: recent.started.conversationUid }, options),
    ).resolves.toBeNull();
    await expect(
      readPostgresChatConversation(
        env,
        { senseiId: 21, conversationUid: anotherSensei.started.conversationUid },
        options,
      ),
    ).resolves.toBeNull();
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
      "SELECT status, personal_mode, failure_code, run_id, completed_at, progress FROM chat_messages WHERE uid = $1",
      [messageUid],
    );
    expect(rows).toEqual([
      { status: "pending", personal_mode: true, failure_code: null, run_id: null, completed_at: null, progress: null },
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
