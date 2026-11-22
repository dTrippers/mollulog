import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";

// Walkthroughs moved to the community. The signed-in user's own address opens their walkthroughs.
export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const username = params.username?.replace(/^@/, "");
  return redirect(currentUser && username === currentUser.username ? "/timelines?mine=1" : "/timelines");
};

export default function UserWalkthroughTimelinesRedirect() {
  return null;
}
