import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { identityMaintenancePageResult } from "~/lib/identity-cutover.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const maintenance = await identityMaintenancePageResult(env, {
    ctx,
    operation: "auth.github.callback",
  });
  if (maintenance) return maintenance;
  return getAuthenticator(env, ctx).authenticate("github", request, {
    successRedirect: "/register",
    failureRedirect: "/",
  });
};
