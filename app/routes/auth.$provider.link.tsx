import { redirect, type ActionFunctionArgs } from "react-router";
import { getLinkAuthenticator } from "~/auth/authenticator.server";

function strategyName(provider: string | undefined) {
  if (provider === "google" || provider === "github") {
    return `${provider}-link`;
  }
  throw redirect("/edit?auth_error=failed");
}

export const action = async ({ context, params, request }: ActionFunctionArgs) => {
  return getLinkAuthenticator(context.cloudflare.env).authenticate(strategyName(params.provider), request);
};
