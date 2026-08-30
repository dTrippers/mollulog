import type { ActionFunctionArgs } from "react-router";
import {
  getSecurityCampaignIdentity,
  isSecurityCampaignToken,
  serializeSecurityCampaignIdentity,
} from "~/auth/security-campaign.server";
import {
  createSecurityCampaignShare,
  getSecurityCampaignVisitCount,
  hashSecurityCampaignVisitorId,
  recordSecurityCampaignVisit,
} from "~/lib/security-campaign-referrals.server";

type SecurityCampaignActionResult =
  | { ok: true; shareToken: string; visitCount: number; countCapped: boolean }
  | { ok: true; recorded: true }
  | { ok: false; error: string };

export async function action({ context, request }: ActionFunctionArgs) {
  const { env } = context.cloudflare;
  const identity = await getSecurityCampaignIdentity(env, request);
  let submitted: unknown;
  try {
    submitted = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." } satisfies SecurityCampaignActionResult, {
      status: 400,
    });
  }

  const intent =
    submitted && typeof submitted === "object" && "intent" in submitted
      ? (submitted as { intent?: unknown }).intent
      : undefined;
  if (intent !== "create-share" && intent !== "refresh-count" && intent !== "record-visit") {
    return Response.json({ ok: false, error: "지원하지 않는 요청입니다." } satisfies SecurityCampaignActionResult, {
      status: 400,
    });
  }

  try {
    const visitorHash = await hashSecurityCampaignVisitorId(identity.visitorId);
    if (intent === "record-visit") {
      const shareToken =
        submitted && typeof submitted === "object" && "shareToken" in submitted
          ? (submitted as { shareToken?: unknown }).shareToken
          : undefined;
      if (!isSecurityCampaignToken(shareToken)) {
        return Response.json({ ok: false, error: "잘못된 공유 링크입니다." } satisfies SecurityCampaignActionResult, {
          status: 400,
        });
      }

      await recordSecurityCampaignVisit(env, shareToken, visitorHash);
      return Response.json({ ok: true, recorded: true } satisfies SecurityCampaignActionResult, {
        headers: { "Set-Cookie": await serializeSecurityCampaignIdentity(env, identity) },
      });
    }

    if (intent === "create-share" && !identity.shareToken) {
      identity.shareToken = await createSecurityCampaignShare(env, visitorHash);
    }
    if (!identity.shareToken) {
      return Response.json(
        { ok: false, error: "공유 링크를 먼저 만들어 주세요." } satisfies SecurityCampaignActionResult,
        {
          status: 400,
          headers: { "Set-Cookie": await serializeSecurityCampaignIdentity(env, identity) },
        },
      );
    }

    const summary = await getSecurityCampaignVisitCount(env, identity.shareToken);
    return Response.json(
      {
        ok: true,
        shareToken: identity.shareToken,
        visitCount: summary.count,
        countCapped: summary.capped,
      } satisfies SecurityCampaignActionResult,
      {
        headers: { "Set-Cookie": await serializeSecurityCampaignIdentity(env, identity) },
      },
    );
  } catch (error) {
    console.error("Failed to update security campaign share", error);
    return Response.json(
      { ok: false, error: "공유 정보를 저장하지 못했습니다." } satisfies SecurityCampaignActionResult,
      {
        status: 503,
        headers: { "Set-Cookie": await serializeSecurityCampaignIdentity(env, identity) },
      },
    );
  }
}
