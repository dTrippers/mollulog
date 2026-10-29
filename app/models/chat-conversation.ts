import {
  completePostgresChatMessage,
  type PostgresChatOptions,
  retryPostgresChatMessage,
  type StartChatMessageResult,
  startPostgresChatMessage,
} from "~/db/postgres/chat-conversations";
import type { ChatMessageOutcome } from "~/domain/chat-conversation";

export type { StartChatMessageResult, StartedChatMessage } from "~/db/postgres/chat-conversations";

export function startChatMessage(
  env: Env,
  input: { senseiId: number; conversationUid: string | null; question: string; personalMode: boolean; now: Date },
  options: PostgresChatOptions = {},
): Promise<StartChatMessageResult> {
  return startPostgresChatMessage(env, input, options);
}

export function retryChatMessage(
  env: Env,
  input: { senseiId: number; conversationUid: string; messageUid: string; personalMode: boolean; now: Date },
  options: PostgresChatOptions = {},
): Promise<StartChatMessageResult> {
  return retryPostgresChatMessage(env, input, options);
}

export function completeChatMessage(
  env: Env,
  input: { messageUid: string; outcome: ChatMessageOutcome; now: Date },
  options: PostgresChatOptions = {},
): Promise<void> {
  return completePostgresChatMessage(env, input, options);
}
