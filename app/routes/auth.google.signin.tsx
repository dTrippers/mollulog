import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  return getAuthenticator(env, ctx).authenticate("google", request);
  // Redirected to /auth/google/callback
};
