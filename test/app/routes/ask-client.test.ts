import { describe, expect, it } from "@jest/globals";
import { AskActionHttpError, mapAskActionErrorCode, postAskAction } from "~/routes/ask._components/ask-client";

describe("AI question client action", () => {
  it("maps an admin-gate 404 to the existing session-expired state before parsing JSON", async () => {
    const error = await postAskAction(
      { intent: "question", question: "Question" },
      async () => new Response("Not Found", { status: 404 }),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AskActionHttpError);
    expect(mapAskActionErrorCode(error)).toBe("session_expired");
  });
});
