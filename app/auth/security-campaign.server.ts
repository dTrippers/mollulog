import { type Cookie, createCookie } from "react-router";

const SECURITY_CAMPAIGN_COOKIE_NAME = "security_campaign";
const SECURITY_CAMPAIGN_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

let securityCampaignCookie: Cookie;

export type SecurityCampaignIdentity = {
  visitorId: string;
  shareToken?: string;
};

export function createSecurityCampaignToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function isSecurityCampaignToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export async function getSecurityCampaignIdentity(
  env: Pick<Env, "SESSION_SECRET">,
  request: Request,
): Promise<SecurityCampaignIdentity> {
  const parsed = await getSecurityCampaignCookie(env).parse(request.headers.get("Cookie"));
  const value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};

  return {
    visitorId: isSecurityCampaignToken(value.visitorId) ? value.visitorId : createSecurityCampaignToken(),
    shareToken: isSecurityCampaignToken(value.shareToken) ? value.shareToken : undefined,
  };
}

export function serializeSecurityCampaignIdentity(
  env: Pick<Env, "SESSION_SECRET">,
  identity: SecurityCampaignIdentity,
): Promise<string> {
  return getSecurityCampaignCookie(env).serialize(identity);
}

function getSecurityCampaignCookie(env: Pick<Env, "SESSION_SECRET">) {
  if (securityCampaignCookie) return securityCampaignCookie;

  securityCampaignCookie = createCookie(SECURITY_CAMPAIGN_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: true,
    secrets: [env.SESSION_SECRET],
    sameSite: "lax",
    maxAge: SECURITY_CAMPAIGN_COOKIE_MAX_AGE,
  });
  return securityCampaignCookie;
}
