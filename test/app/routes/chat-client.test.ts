import { describe, expect, it, jest } from "@jest/globals";
import { ChatActionHttpError, mapChatActionErrorCode, postChatAction } from "~/routes/chat._components/chat-client";

describe("AI chatbot client action", () => {
  it("maps an admin-gate 404 to the existing session-expired state before parsing JSON", async () => {
    const error = await postChatAction(
      { intent: "question", question: "Question" },
      async () => new Response("Not Found", { status: 404 }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChatActionHttpError);
    expect(mapChatActionErrorCode(error)).toBe("session_expired");
  });

  it("parses NDJSON across chunk boundaries and reports started and progress events", async () => {
    const encoder = new TextEncoder();
    const body = `${[
      JSON.stringify({ type: "started", conversationUid: "conversation-1", messageUid: "message-1" }),
      JSON.stringify({
        type: "event",
        event: { type: "tool_started", callId: "call-1", round: 1, toolName: "get_student", target: "미카" },
      }),
      JSON.stringify({
        type: "result",
        intent: "question",
        ok: true,
        conversationUid: "conversation-1",
        messageUid: "message-1",
      }),
    ].join("\n")}\n`;
    const chunks = [body.slice(0, 23), body.slice(23, 91), body.slice(91)];
    const onStarted = jest.fn();
    const onEvent = jest.fn();
    const result = await postChatAction<{ ok: boolean }>(
      { intent: "question", question: "Question" },
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        ),
      { onStarted, onEvent },
    );

    expect(result).toMatchObject({ ok: true, messageUid: "message-1" });
    expect(onStarted).toHaveBeenCalledWith({ conversationUid: "conversation-1", messageUid: "message-1" });
    expect(onEvent).toHaveBeenCalledWith({
      type: "tool_started",
      callId: "call-1",
      round: 1,
      toolName: "get_student",
      target: "미카",
    });
  });

  it("maps a stream that ends before its result line to a network error", async () => {
    const error = await postChatAction(
      { intent: "question", question: "Question" },
      async () =>
        new Response('{"type":"started","conversationUid":"conversation-1","messageUid":"message-1"}\n', {
          headers: { "Content-Type": "application/x-ndjson" },
        }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ChatActionHttpError);
    expect(mapChatActionErrorCode(error)).toBe("network");
  });
});
