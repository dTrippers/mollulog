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
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, { operation: "auth.link.signin" });
  if (maintenance) return maintenance;
  return getLinkAuthenticator(context.cloudflare.env).authenticate(strategyName(params.provider), request);
};
