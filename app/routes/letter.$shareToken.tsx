import { isbot } from "isbot";
import { type LoaderFunctionArgs, type MetaFunction, redirect } from "react-router";
import { isSecurityCampaignToken } from "~/auth/security-campaign.server";

const SHARE_PREVIEW_TITLE = "이 편지는 트리니티에서 시작되어...";
const SHARE_PREVIEW_DESCRIPTION = "선생님께 도착한 링크가 있어요.";

export const meta: MetaFunction = () => [
  { title: `${SHARE_PREVIEW_TITLE} | 몰루로그` },
  { name: "description", content: SHARE_PREVIEW_DESCRIPTION },
  { name: "robots", content: "noindex,nofollow" },
  { property: "og:title", content: SHARE_PREVIEW_TITLE },
  { property: "og:description", content: SHARE_PREVIEW_DESCRIPTION },
  { name: "twitter:card", content: "summary" },
  { name: "twitter:title", content: SHARE_PREVIEW_TITLE },
  { name: "twitter:description", content: SHARE_PREVIEW_DESCRIPTION },
];

export function loader({ params, request }: LoaderFunctionArgs) {
  const shareToken = params.shareToken;
  if (!isSecurityCampaignToken(shareToken)) return redirect("/security-campaign");

  if (isbot(request.headers.get("user-agent"))) return null;

  const searchParams = new URLSearchParams({ ref: shareToken });
  return redirect(`/security-campaign?${searchParams.toString()}`);
}

export default function LetterSharePreview() {
  return null;
}
