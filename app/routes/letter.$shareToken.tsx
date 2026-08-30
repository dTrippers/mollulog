import { type LoaderFunctionArgs, redirect } from "react-router";
import { isSecurityCampaignToken } from "~/auth/security-campaign.server";

export function loader({ params }: LoaderFunctionArgs) {
  const shareToken = params.shareToken;
  if (!isSecurityCampaignToken(shareToken)) return redirect("/security-campaign");

  const searchParams = new URLSearchParams({ ref: shareToken });
  return redirect(`/security-campaign?${searchParams.toString()}`);
}
