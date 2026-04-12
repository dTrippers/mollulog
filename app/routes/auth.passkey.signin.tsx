import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { AuthorizationError } from "remix-auth";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { createPasskeyAuthenticationOptions } from "~/models/passkey";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  return await createPasskeyAuthenticationOptions(env);
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "auth.passkey.signin",
  });
  try {
    return await getAuthenticator(env, ctx).authenticate("passkey", request, {
      successRedirect: "/register",
      throwOnError: true,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    logger.error("Passkey sign-in failed", error);
    if (error instanceof AuthorizationError) {
      return { error: error.message };
    }
    throw error;
  }
};
