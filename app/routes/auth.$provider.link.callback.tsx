import { redirect, type LoaderFunctionArgs } from "react-router";
import { getLinkAuthenticator } from "~/auth/authenticator.server";

function strategyName(provider: string | undefined) {
  if (provider === "google" || provider === "github") {
    return `${provider}-link`;
  }
  throw redirect("/edit?auth_error=failed");
}

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  return getLinkAuthenticator(context.cloudflare.env).authenticate(strategyName(params.provider), request, {
    successRedirect: "/edit?auth=linked",
    failureRedirect: "/edit?auth_error=failed",
  });
};
