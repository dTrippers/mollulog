import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { createPasskeyCreationOptions, verifyAndCreatePasskey } from "~/models/passkey";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  return await createPasskeyCreationOptions(env, currentUser);
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const creationResponse = await request.json<RegistrationResponseJSON>();
  const passkey = await verifyAndCreatePasskey(env, currentUser, creationResponse, { ctx });
  if (!passkey) {
    return { error: "failed to verify registration response" };
  }
  return passkey;
};
