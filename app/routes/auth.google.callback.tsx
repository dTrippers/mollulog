import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, {
    operation: "auth.google.callback",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(context.cloudflare.env).authenticate("google", request, {
    successRedirect: "/register",
    failureRedirect: "/",
  });
};
