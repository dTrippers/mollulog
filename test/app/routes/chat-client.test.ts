import { describe, expect, it } from "@jest/globals";
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
});
