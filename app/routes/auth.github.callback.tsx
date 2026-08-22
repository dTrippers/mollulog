import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, {
    operation: "auth.github.callback",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(context.cloudflare.env).authenticate("github", request, {
    successRedirect: "/register",
    failureRedirect: "/",
  });
};
