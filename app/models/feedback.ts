import {
  createPostgresFeedbackReply,
  createPostgresFeedbackTicket,
  type FeedbackReply,
  type FeedbackTicket,
  getPostgresFeedbackThreadByUidForUser,
  getPostgresFeedbackTicketByUidForUser,
  getPostgresFeedbackTicketsByUserId,
  hasPostgresUnreadAdminFeedbackReplies,
  markPostgresFeedbackTicketAdminRepliesSeen,
  type PostgresFeedbackOptions,
} from "~/db/postgres/feedback";
import type { FeedbackAdditional } from "~/domain/feedback";

export type { FeedbackReply, FeedbackThread, FeedbackTicket, FeedbackTicketStatus } from "~/db/postgres/feedback";

export function getFeedbackTicketsByUserId(env: Env, userId: number, options: PostgresFeedbackOptions = {}) {
  return getPostgresFeedbackTicketsByUserId(env, userId, options);
}

export function getFeedbackTicketByUidForUser(
  env: Env,
  uid: string,
  userId: number,
  options: PostgresFeedbackOptions = {},
) {
  return getPostgresFeedbackTicketByUidForUser(env, uid, userId, options);
}

export function getFeedbackThreadByUidForUser(
  env: Env,
  uid: string,
  userId: number,
  options: PostgresFeedbackOptions = {},
) {
  return getPostgresFeedbackThreadByUidForUser(env, uid, userId, options);
}

export function hasUnreadAdminFeedbackReplies(env: Env, userId: number, options: PostgresFeedbackOptions = {}) {
  return hasPostgresUnreadAdminFeedbackReplies(env, userId, options);
}

export function getLatestAdminFeedbackReplyId(replies: FeedbackReply[]): number {
  return replies.reduce((latestId, reply) => (reply.isAdmin ? Math.max(latestId, reply.id) : latestId), 0);
}

export function markFeedbackTicketAdminRepliesSeen(
  env: Env,
  ticket: Pick<FeedbackTicket, "id" | "userId" | "lastSeenAdminReplyId">,
  latestAdminReplyId: number,
  options: PostgresFeedbackOptions = {},
) {
  return markPostgresFeedbackTicketAdminRepliesSeen(env, ticket, latestAdminReplyId, options);
}

export function createFeedbackTicket(
  env: Env,
  userId: number,
  title: string,
  content: string,
  replyEmail: string | null,
  additional: FeedbackAdditional | null,
  options: PostgresFeedbackOptions = {},
) {
  return createPostgresFeedbackTicket(env, userId, title, content, replyEmail, additional, options);
}

export function createFeedbackReply(
  env: Env,
  ticketId: number,
  userId: number,
  content: string,
  options: PostgresFeedbackOptions = {},
) {
  return createPostgresFeedbackReply(env, ticketId, userId, content, options);
}

export type { FeedbackAdditional };
