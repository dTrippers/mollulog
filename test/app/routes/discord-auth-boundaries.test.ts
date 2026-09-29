import { readFileSync } from "node:fs";
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
