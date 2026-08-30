export type DiscordProfileFeedback = {
  area: "identity" | "notification";
  tone: "success" | "error";
  text: string;
};

/** Maps profile-only Discord action codes to safe user-facing feedback. */
export function getDiscordProfileFeedback(params: URLSearchParams): DiscordProfileFeedback | null {
  if (params.get("discord_auth") === "linked") {
    return { area: "identity", tone: "success", text: "Discord 로그인 계정이 연결됐어요." };
  }
  if (params.get("discord_error") === "identity_in_use") {
    return { area: "identity", tone: "error", text: "이미 다른 선생님 계정에 연결된 Discord 계정이에요." };
  }
  if (params.get("discord_error") === "signin_required") {
    return { area: "identity", tone: "error", text: "로그인 후 다시 시도해주세요." };
  }
  if (params.get("discord_error") === "cancelled") {
    return { area: "identity", tone: "error", text: "Discord 로그인을 취소했어요. 다시 시도해주세요." };
  }
  if (params.get("discord_error") === "failed") {
    return { area: "identity", tone: "error", text: "Discord 계정 연결에 실패했어요. 다시 시도해주세요." };
  }
  if (params.get("discord_notice") === "pending") {
    return { area: "notification", tone: "success", text: "Discord 알림 연결을 확인 중이에요." };
  }
  if (params.get("discord_notice") === "unlinked") {
    return { area: "notification", tone: "success", text: "Discord 알림 연결을 해제했어요." };
  }
  if (params.get("discord_notice") === "identity_in_use") {
    return { area: "notification", tone: "error", text: "이미 다른 선생님 계정에 연결된 Discord 계정이에요." };
  }
  if (params.get("discord_notice") === "signin_required") {
    return { area: "notification", tone: "error", text: "로그인 후 다시 시도해주세요." };
  }
  if (params.get("discord_notice") === "cancelled") {
    return { area: "notification", tone: "error", text: "Discord 알림 연결을 취소했어요. 다시 시도해주세요." };
  }
  if (params.get("discord_notice") === "failed") {
    return { area: "notification", tone: "error", text: "Discord 알림 연결에 실패했어요. 다시 시도해주세요." };
  }
  return null;
}
