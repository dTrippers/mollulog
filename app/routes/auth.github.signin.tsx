import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, {
    operation: "auth.github.signin",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(context.cloudflare.env).authenticate("github", request);
  // Redirected to /auth/github/callback
};
