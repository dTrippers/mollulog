import { type ActionFunctionArgs, redirect } from "react-router";
import { getLinkAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

function strategyName(provider: string | undefined) {
  if (provider === "google" || provider === "github") {
    return `${provider}-link`;
  }
  throw redirect("/edit?auth_error=failed");
}

export const action = async ({ context, params, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const maintenance = await identityMaintenanceActionResult(env, { ctx, operation: "auth.link.signin" });
  if (maintenance) return maintenance;
  return getLinkAuthenticator(env, ctx).authenticate(strategyName(params.provider), request);
};
