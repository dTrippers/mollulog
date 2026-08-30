import { describe, expect, it } from "@jest/globals";
import {
  createSecurityCampaignShare,
  getSecurityCampaignVisitCount,
  hashSecurityCampaignVisitorId,
  recordSecurityCampaignVisit,
} from "~/lib/security-campaign-referrals.server";

class FakeCampaignKv {
  readonly values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.values.set(key, value);
  }

  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.values.keys()]
      .filter((key) => key.startsWith(options.prefix ?? ""))
      .sort()
      .map((name) => ({ name }));
    return {
      keys,
      list_complete: true,
      cacheStatus: null,
    };
  }
}

function envWith(kv: FakeCampaignKv) {
  return { KV_CACHE: kv as unknown as KVNamespace };
}

describe("security campaign referrals", () => {
  it("counts each browser once for a share", async () => {
    const kv = new FakeCampaignKv();
    const env = envWith(kv);
    const ownerHash = await hashSecurityCampaignVisitorId("owner");
    const visitorHash = await hashSecurityCampaignVisitorId("visitor");
    const shareToken = await createSecurityCampaignShare(env, ownerHash);

    await recordSecurityCampaignVisit(env, shareToken, visitorHash);
    await recordSecurityCampaignVisit(env, shareToken, visitorHash);

    await expect(getSecurityCampaignVisitCount(env, shareToken)).resolves.toEqual({ count: 1, capped: false });
  });

  it("does not count the owner browser", async () => {
    const kv = new FakeCampaignKv();
    const env = envWith(kv);
    const ownerHash = await hashSecurityCampaignVisitorId("owner");
    const shareToken = await createSecurityCampaignShare(env, ownerHash);

    await recordSecurityCampaignVisit(env, shareToken, ownerHash);

    await expect(getSecurityCampaignVisitCount(env, shareToken)).resolves.toEqual({ count: 0, capped: false });
  });

  it("retains a visit while a new share key is still eventually consistent", async () => {
    const kv = new FakeCampaignKv();
    const env = envWith(kv);
    const shareToken = "a".repeat(32);
    const visitorHash = await hashSecurityCampaignVisitorId("visitor");

    await recordSecurityCampaignVisit(env, shareToken, visitorHash);

    await expect(getSecurityCampaignVisitCount(env, shareToken)).resolves.toEqual({ count: 1, capped: false });
  });

  it("ignores invalid share tokens", async () => {
    const kv = new FakeCampaignKv();
    const env = envWith(kv);

    await recordSecurityCampaignVisit(env, "not-a-token", "visitor");

    await expect(getSecurityCampaignVisitCount(env, "not-a-token")).resolves.toEqual({ count: 0, capped: false });
    expect(kv.values.size).toBe(0);
  });
});
