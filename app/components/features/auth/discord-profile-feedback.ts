export type DiscordProfileFeedback = {
  tone: "success" | "error";
  text: string;
};

/** Maps profile-only Discord action codes to safe user-facing feedback. */
export function getDiscordProfileFeedback(params: URLSearchParams): DiscordProfileFeedback | null {
  if (params.get("discord_auth") === "linked") {
    return { tone: "success", text: "Discord 로그인 계정이 연동됐어요." };
  }
  if (params.get("discord_error") === "identity_in_use") {
    return { tone: "error", text: "이미 다른 선생님 계정에 연결된 Discord 계정이에요." };
  }
  if (params.get("discord_error") === "signin_required") {
    return { tone: "error", text: "로그인 후 다시 시도해주세요." };
  }
  if (params.get("discord_error") === "cancelled") {
    return { tone: "error", text: "Discord 로그인을 취소했어요. 다시 시도해주세요." };
  }
  if (params.get("discord_error") === "failed") {
    return { tone: "error", text: "Discord 계정 연동에 실패했어요. 다시 시도해주세요." };
  }
  if (params.get("discord_notice") === "pending") {
    return { tone: "success", text: "Discord 알림 연결을 확인 중이에요." };
  }
  if (params.get("discord_notice") === "unlinked") {
    return { tone: "success", text: "Discord 알림 연결을 해제했어요." };
  }
  return null;
}
