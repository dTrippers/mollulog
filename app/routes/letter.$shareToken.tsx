import { isbot } from "isbot";
import { type LoaderFunctionArgs, type MetaFunction, redirect } from "react-router";
import { isSecurityCampaignToken } from "~/auth/security-campaign.server";
import { socialMeta } from "~/lib/seo";

const SHARE_PREVIEW_TITLE = "이 편지는 트리니티에서 시작되어...";
const SHARE_PREVIEW_DESCRIPTION = "선생님께 도착한 링크가 있어요.";

export const meta: MetaFunction = ({ location }) => [
  { title: `${SHARE_PREVIEW_TITLE} | 몰루로그` },
  { name: "description", content: SHARE_PREVIEW_DESCRIPTION },
  { name: "robots", content: "noindex,nofollow" },
  ...socialMeta({ title: SHARE_PREVIEW_TITLE, description: SHARE_PREVIEW_DESCRIPTION, pathname: location.pathname }),
  { name: "twitter:card", content: "summary" },
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
