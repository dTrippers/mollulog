import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import { getDiscordProfileFeedback } from "~/components/features/auth/discord-profile-feedback";

describe("Discord page responsibility", () => {
  it("keeps Discord identity feedback in the profile section", () => {
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_auth=linked"))).toEqual({
      area: "identity",
      tone: "success",
      text: "Discord 로그인 계정이 연결됐어요.",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_error=identity_in_use"))).toMatchObject({
      tone: "error",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_error=cancelled"))).toEqual({
      area: "identity",
      tone: "error",
      text: "Discord 로그인을 취소했어요. 다시 시도해주세요.",
    });
  });

  it("maps notification failures to the notification section", () => {
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_notice=failed"))).toMatchObject({
      area: "notification",
      tone: "error",
    });
    expect(getDiscordProfileFeedback(new URLSearchParams("discord_notice=cancelled"))).toMatchObject({
      area: "notification",
      tone: "error",
    });
  });

  it("keeps notification connection management in Profile Management", () => {
    const editSource = readFileSync("app/routes/edit._index.tsx", "utf8");
    const notificationsSource = readFileSync("app/routes/notifications.tsx", "utf8");
    const profileConnectionSource = readFileSync(
      "app/routes/edit._components/DiscordNotificationConnection.tsx",
      "utf8",
    );
    const notificationChannelSource = readFileSync(
      "app/routes/notifications._components/NotificationChannelCard.tsx",
      "utf8",
    );
    const notificationPreferencesSource = readFileSync(
      "app/routes/notifications._components/NotificationPreferencesCard.tsx",
      "utf8",
    );
    expect(editSource).toContain('title="연결된 서비스"');
    expect(editSource).toContain('id="connected-services"');
    expect(editSource).toContain("DiscordNotificationConnection");
    expect(editSource).toContain('location.hash !== "#discord-notifications"');
    expect(editSource).toContain("scrollIntoView");
    expect(profileConnectionSource).toContain('id="discord-notifications"');
    expect(profileConnectionSource).toContain("연결을 끊으면 모든 알림을 받을 수 없어요. 정말 연결을 끊을까요?");
    expect(profileConnectionSource).toContain('action="/auth/discord/notifications/connect"');
    expect(profileConnectionSource).toContain('value="discord-unlink"');
    expect(profileConnectionSource).toContain("연결을 끊으면 모든 알림을 받을 수 없어요");
    expect(editSource).toContain("discordMessage");
    expect(notificationsSource).not.toContain('intent !== "discord-connect"');
    expect(notificationsSource).not.toContain('intent !== "discord-unlink"');
    expect(notificationsSource).not.toContain("upsertPendingDiscordConnection");
    expect(notificationsSource).not.toContain("unlinkDiscordConnection");
    expect(notificationsSource).toContain("NotificationChannelCard");
    expect(notificationsSource).toContain('connectionStatus === "active"');
    expect(editSource).toContain('status !== "pending"');
    expect(notificationChannelSource).toContain("/edit#discord-notifications");
    expect(notificationsSource).toContain('isAvailable={connectionStatus === "active"}');
    expect(notificationsSource).toContain("NotificationPreferencesCard");
    expect(notificationPreferencesSource).toContain("하나 이상의 알림 수단을 등록해주세요");
    expect(notificationPreferencesSource).toContain("disabled={!isAvailable}");
    expect(notificationPreferencesSource).toContain('!isAvailable && "opacity-40"');
    expect(notificationChannelSource).not.toContain("<Form");
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

  it("uses the live Profile Management anchor for ordinary Discord linking", () => {
    const oauthSource = readFileSync("app/auth/discord-oauth.server.ts", "utf8");
    const linkSource = readFileSync("app/routes/auth.discord.link.tsx", "utf8");
    expect(oauthSource).toContain("#connected-services");
    expect(oauthSource).not.toMatch(/#discord(?=["'`])/);
    expect(linkSource).toContain("#connected-services");
    expect(linkSource).not.toContain("#discord");
  });

  it("keeps User Install OAuth isolated to the notification intent", () => {
    const oauthSource = readFileSync("app/auth/discord-oauth.server.ts", "utf8");
    const notificationStartSource = readFileSync("app/routes/auth.discord.notifications.connect.tsx", "utf8");
    expect(notificationStartSource).toContain('"notification-connect"');
    expect(oauthSource).toContain('"identify applications.commands"');
    expect(oauthSource).toContain('"integration_type", "1"');
    expect(oauthSource).toContain('intent === "notification-connect"');
  });

  it("binds immediate verification queues in staging and production deploys", () => {
    const wranglerSource = readFileSync("wrangler.jsonc", "utf8");
    const packageSource = readFileSync("package.json", "utf8");
    const productionDeploySource = readFileSync("scripts/production-deploy.sh", "utf8");
    expect(wranglerSource).toContain('"mollulog-discord-notifications-staging"');
    expect(wranglerSource).toContain('"mollulog-discord-notifications"');
    expect(packageSource).toContain("wrangler deploy --config build/server/wrangler.json");
    expect(productionDeploySource).toContain("--config build/server/wrangler.json");
  });
});
