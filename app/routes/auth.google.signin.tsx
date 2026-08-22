import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const maintenance = await identityMaintenanceActionResult(context.cloudflare.env, {
    operation: "auth.google.signin",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(context.cloudflare.env).authenticate("google", request);
  // Redirected to /auth/google/callback
};
