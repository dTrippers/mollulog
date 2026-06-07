import { getLogger } from "./observability.server";

type FeedbackTicketCreatedEvent = {
  type: "feedback.ticket_created";
  occurredAt: string;
  ticket: {
    uid: string;
    title: string;
    content: string;
    authorId: number;
    authorUsername: string;
  };
};

type FeedbackReplyCreatedEvent = {
  type: "feedback.reply_created";
  occurredAt: string;
  ticket: {
    uid: string;
    title: string;
  };
  reply: {
    content: string;
    authorId: number;
    authorUsername: string;
  };
};

export type FeedbackEvent = FeedbackTicketCreatedEvent | FeedbackReplyCreatedEvent;

export function publishEvent(env: Env, ctx: ExecutionContext, event: FeedbackEvent) {
  try {
    const queue = env.EVENTS;
    if (!queue) {
      return;
    }

    const logger = getLogger(env, ctx, { scope: "events" });
    ctx.waitUntil(
      (async () => {
        try {
          await queue.send(event);
        } catch (error) {
          logger.error("Error publishing event", error, {
            eventType: event.type,
          });
        }
      })(),
    );
  } catch (error) {
    try {
      getLogger(env, ctx, { scope: "events" }).error("Error scheduling event", error, {
        eventType: event.type,
      });
    } catch {
      // Preserve the request flow even if error reporting itself fails.
    }
  }
}
