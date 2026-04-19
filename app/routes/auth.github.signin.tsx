import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";

export const action = async ({ context, request }: ActionFunctionArgs) => {
  return getAuthenticator(context.cloudflare.env).authenticate("github", request);
  // Redirected to /auth/github/callback
};
