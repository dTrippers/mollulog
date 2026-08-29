export type DiscordSignInFeedback = {
  tone: "error";
  text: string;
};

/** Maps only known, safe callback codes to user-facing sign-in feedback. */
export function getDiscordSignInFeedback(params: URLSearchParams): DiscordSignInFeedback | null {
  switch (params.get("auth_error")) {
    case "identity_in_use":
      return { tone: "error", text: "이미 연결된 Discord 계정이에요. 다른 계정으로 다시 시도해주세요." };
    case "cancelled":
      return { tone: "error", text: "Discord 로그인을 취소했어요. 다시 시도해주세요." };
    case "failed":
      return { tone: "error", text: "Discord 로그인에 실패했어요. 다시 시도해주세요." };
    default:
      return null;
  }
}
