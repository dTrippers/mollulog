import { describe, expect, it } from "@jest/globals";
import { getDiscordSignInFeedback } from "~/components/features/auth/discord-signin-feedback";

describe("Discord sign-in feedback", () => {
  it.each([
    ["identity_in_use", "이미 연결된 Discord 계정이에요. 다른 계정으로 다시 시도해주세요."],
    ["cancelled", "Discord 로그인을 취소했어요. 다시 시도해주세요."],
    ["failed", "Discord 로그인에 실패했어요. 다시 시도해주세요."],
  ])("maps %s to safe retryable copy", (code, text) => {
    expect(getDiscordSignInFeedback(new URLSearchParams(`auth_error=${code}`))).toEqual({ tone: "error", text });
  });

  it("does not expose unknown callback values", () => {
    expect(getDiscordSignInFeedback(new URLSearchParams("auth_error=provider_internal_error"))).toBeNull();
  });
});
