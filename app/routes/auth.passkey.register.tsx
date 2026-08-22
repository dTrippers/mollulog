import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";
import { createPasskeyCreationOptions, verifyAndCreatePasskey } from "~/models/passkey";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const maintenance = await identityMaintenanceActionResult(env, { operation: "auth.passkey.register.options" });
  if (maintenance) return maintenance;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return await createPasskeyCreationOptions(env, currentUser);
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const maintenance = await identityMaintenanceActionResult(env, { operation: "auth.passkey.register" });
  if (maintenance) return maintenance;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const creationResponse = await request.json<RegistrationResponseJSON>();
  const passkey = await verifyAndCreatePasskey(env, currentUser, creationResponse);
  if (!passkey) {
    return { error: "failed to verify registration response" };
  }
  return passkey;
};
