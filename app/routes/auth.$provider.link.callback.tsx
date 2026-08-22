import { type LoaderFunctionArgs, redirect } from "react-router";
import { getLinkAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

function strategyName(provider: string | undefined) {
  if (provider === "google" || provider === "github") {
    return `${provider}-link`;
  }
  throw redirect("/edit?auth_error=failed");
}

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, {
    operation: "auth.link.callback",
  });
  if (maintenance) return maintenance;
  return getLinkAuthenticator(context.cloudflare.env).authenticate(strategyName(params.provider), request, {
    successRedirect: "/edit?auth=linked",
    failureRedirect: "/edit?auth_error=failed",
  });
};
