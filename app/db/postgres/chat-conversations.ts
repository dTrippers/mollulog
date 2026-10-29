import { and, asc, desc, eq, gte } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { pgChatConversationsTable, pgChatMessagesTable } from "~/db/postgres/schema";
import {
  type ChatConversation,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatMessageOutcome,
  chatConversationTitle,
  isChatMessageInProgress,
  isChatMessageRetryable,
  parseChatAnswer,
  parseChatMessageFailureCode,
  parseChatMessageStatus,
} from "~/domain/chat-conversation";
import { createPostgresClient, type PostgresClientFactory, withPostgresClient } from "~/lib/postgres.server";

export type PostgresChatOptions = {
  ctx?: ExecutionContext;
  createClient?: PostgresClientFactory;
};

export type StartedChatMessage = {
  conversationUid: string;
  messageUid: string;
  question: string;
  // Messages that precede the started message, oldest first.
  previousMessages: ChatMessage[];
};

export type StartChatMessageResult =
  | { ok: true; started: StartedChatMessage }
  | { ok: false; reason: "not_found" | "busy" | "not_retryable" };

type ChatDatabase = NodePgDatabase;
type ChatTransaction = Parameters<Parameters<ChatDatabase["transaction"]>[0]>[0];
type ChatMessageReader = Pick<ChatDatabase, "select">;

async function withChatDatabase<T>(
  env: Pick<Env, "HYPERDRIVE">,
  operationName: string,
  operation: (db: ChatDatabase) => Promise<T>,
  options: PostgresChatOptions = {},
): Promise<T> {
  const { createClient = createPostgresClient, ctx } = options;
  return withPostgresClient(
    env,
    async (client) => {
      const run = () => operation(drizzle(client));
      return ctx ? ctx.tracing.enterSpan(`postgres.chat.${operationName}`, run) : run();
    },
    createClient,
    ctx,
  );
}

function toChatMessage(row: typeof pgChatMessagesTable.$inferSelect): ChatMessage {
  const message: ChatMessage = {
    uid: row.uid,
    seq: row.seq,
    question: row.question,
    personalMode: row.personalMode,
    status: parseChatMessageStatus(row.status),
    answer: parseChatAnswer(row.answer ?? null),
    failureCode: parseChatMessageFailureCode(row.failureCode),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  validateChatMessageState(message.status, message.answer, message.failureCode);
  return message;
}

function validateChatMessageState(
  status: ChatMessage["status"],
  answer: ChatMessage["answer"],
  failureCode: ChatMessage["failureCode"],
): void {
  if (
    (status === "failed" && failureCode === null) ||
    (status !== "failed" && failureCode !== null) ||
    (status !== "pending" && status !== "failed" && answer === null) ||
    (status === "pending" && answer !== null)
  ) {
    throw new Error("Stored chat message state is invalid.");
  }
}

async function selectMessages(tx: ChatMessageReader, conversationId: number): Promise<ChatMessage[]> {
  const rows = await tx
    .select()
    .from(pgChatMessagesTable)
    .where(eq(pgChatMessagesTable.conversationId, conversationId))
    .orderBy(asc(pgChatMessagesTable.seq));
  return rows.map(toChatMessage);
}

export async function listPostgresChatConversations(
  env: Pick<Env, "HYPERDRIVE">,
  input: { senseiId: number; now: Date; listDays: number },
  options: PostgresChatOptions = {},
): Promise<ChatConversationSummary[]> {
  const cutoff = new Date(input.now.getTime() - input.listDays * 24 * 60 * 60 * 1000);
  return withChatDatabase(
    env,
    "list_conversations",
    async (db) => {
      const rows = await db
        .select({
          uid: pgChatConversationsTable.uid,
          title: pgChatConversationsTable.title,
          lastMessageAt: pgChatConversationsTable.lastMessageAt,
          seq: pgChatMessagesTable.seq,
          status: pgChatMessagesTable.status,
          updatedAt: pgChatMessagesTable.updatedAt,
          failureCode: pgChatMessagesTable.failureCode,
        })
        .from(pgChatConversationsTable)
        .innerJoin(pgChatMessagesTable, eq(pgChatMessagesTable.conversationId, pgChatConversationsTable.id))
        .where(
          and(
            eq(pgChatConversationsTable.senseiId, input.senseiId),
            gte(pgChatConversationsTable.lastMessageAt, cutoff),
          ),
        )
        .orderBy(desc(pgChatConversationsTable.lastMessageAt), desc(pgChatMessagesTable.seq));

      const summaries = new Map<string, ChatConversationSummary>();
      for (const row of rows) {
        const messageStatus = parseChatMessageStatus(row.status);
        const message: Pick<ChatMessage, "status" | "updatedAt"> = {
          status: messageStatus,
          updatedAt: row.updatedAt,
        };
        const current = summaries.get(row.uid);
        if (current) {
          current.questionCount += 1;
        } else {
          // The first joined row has the greatest message sequence for this conversation.
          if (messageStatus === "failed" && parseChatMessageFailureCode(row.failureCode) === null) {
            throw new Error("Stored failed chat message is missing its failure code.");
          }
          summaries.set(row.uid, {
            uid: row.uid,
            title: row.title,
            lastMessageAt: row.lastMessageAt,
            questionCount: 1,
            latestMessage: message,
          });
        }
      }
      return [...summaries.values()];
    },
    options,
  );
}

export async function readPostgresChatConversation(
  env: Pick<Env, "HYPERDRIVE">,
  input: { senseiId: number; conversationUid: string },
  options: PostgresChatOptions = {},
): Promise<ChatConversation | null> {
  return withChatDatabase(
    env,
    "read_conversation",
    async (db) => {
      const [row] = await db
        .select({
          id: pgChatConversationsTable.id,
          uid: pgChatConversationsTable.uid,
          title: pgChatConversationsTable.title,
          lastMessageAt: pgChatConversationsTable.lastMessageAt,
        })
        .from(pgChatConversationsTable)
        .where(
          and(
            eq(pgChatConversationsTable.uid, input.conversationUid),
            eq(pgChatConversationsTable.senseiId, input.senseiId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        uid: row.uid,
        title: row.title,
        lastMessageAt: row.lastMessageAt,
        messages: await selectMessages(db, row.id),
      };
    },
    options,
  );
}

// Locks the conversation row so that messages of one conversation start one at a time.
async function lockConversation(tx: ChatTransaction, senseiId: number, conversationUid: string) {
  const [conversation] = await tx
    .select({ id: pgChatConversationsTable.id, uid: pgChatConversationsTable.uid })
    .from(pgChatConversationsTable)
    .where(and(eq(pgChatConversationsTable.uid, conversationUid), eq(pgChatConversationsTable.senseiId, senseiId)))
    .limit(1)
    .for("update");
  return conversation ?? null;
}

async function touchConversation(tx: ChatTransaction, conversationId: number, now: Date) {
  await tx
    .update(pgChatConversationsTable)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(pgChatConversationsTable.id, conversationId));
}

// Appends a pending message to the sensei's conversation, or creates a conversation titled by the question.
export async function startPostgresChatMessage(
  env: Pick<Env, "HYPERDRIVE">,
  input: { senseiId: number; conversationUid: string | null; question: string; personalMode: boolean; now: Date },
  options: PostgresChatOptions = {},
): Promise<StartChatMessageResult> {
  return withChatDatabase(
    env,
    "start_message",
    (db) =>
      db.transaction(async (tx): Promise<StartChatMessageResult> => {
        const { senseiId, question, personalMode, now } = input;
        let conversation: { id: number; uid: string } | null;
        let previousMessages: ChatMessage[] = [];
        if (input.conversationUid === null) {
          [conversation] = await tx
            .insert(pgChatConversationsTable)
            .values({
              uid: crypto.randomUUID(),
              senseiId,
              title: chatConversationTitle(question),
              lastMessageAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: pgChatConversationsTable.id, uid: pgChatConversationsTable.uid });
        } else {
          conversation = await lockConversation(tx, senseiId, input.conversationUid);
          if (!conversation) return { ok: false, reason: "not_found" };
          previousMessages = await selectMessages(tx, conversation.id);
          if (previousMessages.some((message) => isChatMessageInProgress(message, now))) {
            return { ok: false, reason: "busy" };
          }
          await touchConversation(tx, conversation.id, now);
        }
        const messageUid = crypto.randomUUID();
        await tx.insert(pgChatMessagesTable).values({
          uid: messageUid,
          conversationId: conversation.id,
          seq: (previousMessages.at(-1)?.seq ?? 0) + 1,
          question,
          personalMode,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
        return {
          ok: true,
          started: { conversationUid: conversation.uid, messageUid, question, previousMessages },
        };
      }),
    options,
  );
}

// Returns a failed or interrupted message to pending so that its stored question is asked again in place.
export async function retryPostgresChatMessage(
  env: Pick<Env, "HYPERDRIVE">,
  input: { senseiId: number; conversationUid: string; messageUid: string; personalMode: boolean; now: Date },
  options: PostgresChatOptions = {},
): Promise<StartChatMessageResult> {
  return withChatDatabase(
    env,
    "retry_message",
    (db) =>
      db.transaction(async (tx): Promise<StartChatMessageResult> => {
        const { senseiId, conversationUid, messageUid, personalMode, now } = input;
        const conversation = await lockConversation(tx, senseiId, conversationUid);
        if (!conversation) return { ok: false, reason: "not_found" };
        const messages = await selectMessages(tx, conversation.id);
        const target = messages.find((message) => message.uid === messageUid);
        if (!target) return { ok: false, reason: "not_found" };
        if (messages.some((message) => message.uid !== messageUid && isChatMessageInProgress(message, now))) {
          return { ok: false, reason: "busy" };
        }
        if (!isChatMessageRetryable(target, now)) {
          return { ok: false, reason: isChatMessageInProgress(target, now) ? "busy" : "not_retryable" };
        }
        await tx
          .update(pgChatMessagesTable)
          .set({
            status: "pending",
            personalMode,
            answer: null,
            failureCode: null,
            runId: null,
            updatedAt: now,
            completedAt: null,
          })
          .where(eq(pgChatMessagesTable.uid, messageUid));
        await touchConversation(tx, conversation.id, now);
        return {
          ok: true,
          started: {
            conversationUid,
            messageUid,
            question: target.question,
            previousMessages: messages.filter((message) => message.seq < target.seq),
          },
        };
      }),
    options,
  );
}

// Records the outcome of a pending message. A message that is no longer pending keeps its stored state.
export async function completePostgresChatMessage(
  env: Pick<Env, "HYPERDRIVE">,
  input: { messageUid: string; outcome: ChatMessageOutcome; now: Date },
  options: PostgresChatOptions = {},
): Promise<void> {
  const { messageUid, outcome, now } = input;
  await withChatDatabase(
    env,
    "complete_message",
    (db) =>
      db
        .update(pgChatMessagesTable)
        .set({
          status: outcome.status,
          answer: outcome.status === "failed" ? null : outcome.answer,
          failureCode: outcome.status === "failed" ? outcome.failureCode : null,
          runId: outcome.runId,
          updatedAt: now,
          completedAt: now,
        })
        .where(and(eq(pgChatMessagesTable.uid, messageUid), eq(pgChatMessagesTable.status, "pending"))),
    options,
  );
}
