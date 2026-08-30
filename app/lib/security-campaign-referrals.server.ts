import { createSecurityCampaignToken, isSecurityCampaignToken } from "~/auth/security-campaign.server";
import { RUNTIME_TIMEOUTS } from "~/lib/runtime-timeouts";
import { withTimeout } from "~/lib/with-timeout";

const SECURITY_CAMPAIGN_KEY_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_COUNT_PAGES = 100;
const KEYS_PER_PAGE = 1_000;
const KV_TIMEOUT_MS = RUNTIME_TIMEOUTS.kv.operation;

type CampaignKvEnv = Pick<Env, "KV_CACHE">;

export type SecurityCampaignVisitCount = {
  count: number;
  capped: boolean;
};

export async function hashSecurityCampaignVisitorId(visitorId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(visitorId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSecurityCampaignShare(env: CampaignKvEnv, ownerVisitorHash: string): Promise<string> {
  const shareToken = createSecurityCampaignToken();
  await withTimeout(
    env.KV_CACHE.put(shareKey(shareToken), ownerVisitorHash, {
      expirationTtl: SECURITY_CAMPAIGN_KEY_TTL_SECONDS,
    }),
    KV_TIMEOUT_MS,
    "security-campaign.share.put",
  );
  return shareToken;
}

export async function recordSecurityCampaignVisit(
  env: CampaignKvEnv,
  shareToken: string,
  visitorHash: string,
): Promise<void> {
  if (!isSecurityCampaignToken(shareToken)) return;

  const ownerVisitorHash = await withTimeout(
    env.KV_CACHE.get(shareKey(shareToken)),
    KV_TIMEOUT_MS,
    "security-campaign.share.get",
  );
  if (ownerVisitorHash === visitorHash) return;

  // A freshly-created share key may not be visible in another region yet.
  // The opaque token is sufficient to safely retain the idempotent visit until KV converges.
  await withTimeout(
    env.KV_CACHE.put(visitKey(shareToken, visitorHash), "", {
      expirationTtl: SECURITY_CAMPAIGN_KEY_TTL_SECONDS,
    }),
    KV_TIMEOUT_MS,
    "security-campaign.visit.put",
  );
}

export async function getSecurityCampaignVisitCount(
  env: CampaignKvEnv,
  shareToken: string,
): Promise<SecurityCampaignVisitCount> {
  if (!isSecurityCampaignToken(shareToken)) return { count: 0, capped: false };

  const prefix = visitPrefix(shareToken);
  let cursor: string | undefined;
  let count = 0;

  for (let page = 0; page < MAX_COUNT_PAGES; page += 1) {
    const result = await withTimeout(
      env.KV_CACHE.list({ prefix, cursor, limit: KEYS_PER_PAGE }),
      KV_TIMEOUT_MS,
      "security-campaign.visit.list",
    );
    count += result.keys.length;
    if (result.list_complete) return { count, capped: false };
    cursor = result.cursor;
  }

  return { count, capped: true };
}

function shareKey(shareToken: string): string {
  return `security-campaign:share:${shareToken}`;
}

function visitPrefix(shareToken: string): string {
  return `security-campaign:visit:${shareToken}:`;
}

function visitKey(shareToken: string, visitorHash: string): string {
  return `${visitPrefix(shareToken)}${visitorHash}`;
}
