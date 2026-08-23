import type { LoaderFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  return getAuthenticator(env, ctx).authenticate("google", request, {
    successRedirect: "/register",
    failureRedirect: "/",
  });
};
