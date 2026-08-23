import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const maintenance = await identityMaintenanceActionResult(env, {
    ctx,
    operation: "auth.google.signin",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(env, ctx).authenticate("google", request);
  // Redirected to /auth/google/callback
};
