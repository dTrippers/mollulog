import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import { getDiscordProfileFeedback } from "~/components/features/auth/discord-profile-feedback";

describe("Discord page responsibility", () => {
  it("keeps Discord management feedback in the profile section", () => {
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_auth=linked"))).toEqual({
      tone: "success",
      text: "Discord 로그인 계정이 연동됐어요.",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_error=identity_in_use"))).toMatchObject({
      tone: "error",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_error=cancelled"))).toEqual({
      tone: "error",
      text: "Discord 로그인을 취소했어요. 다시 시도해주세요.",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_notice=unlinked"))).toMatchObject({
      tone: "success",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_notice=failed"))).toBeNull();

    const editSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    const notificationsSource = readFileSync("app/routes/notifications.tsx", "utf8");
    expect(editSource).toContain('id="discord"');
    expect(editSource).toContain('value="discord-connect"');
    expect(editSource).toContain('value="discord-unlink"');
    expect(editSource).toContain("discordMessage");
    expect(notificationsSource).toContain('to="/edit#discord"');
    expect(notificationsSource).toContain('intent !== "save"');
    expect(notificationsSource).not.toContain("/notifications/discord");
  });

  it("keeps the obsolete notification OAuth routes deleted", () => {
    expect(existsSync("app/routes/notifications.discord.start.tsx")).toBe(false);
    expect(existsSync("app/routes/notifications.discord.callback.tsx")).toBe(false);
  });

  it("keeps callback URL construction in the auth module", () => {
    const oauthSource = readFileSync("app/auth/discord-oauth.server.ts", "utf8");
    const notificationModelSource = readFileSync("app/models/discord-notifications.server.ts", "utf8");
    expect(oauthSource).toContain('new URL("/auth/discord/callback", host)');
    expect(notificationModelSource).not.toContain("getDiscordOAuthCallbackUrl");
  });
});
