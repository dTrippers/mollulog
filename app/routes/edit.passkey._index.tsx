import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/server";
import dayjs from "dayjs";
import { useState } from "react";
import { type LoaderFunctionArgs, redirect, useLoaderData, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ButtonForm, FormGroup, LinkForm } from "~/components/features/forms";
import { identityMaintenanceMessage } from "~/domain/identity-cutover";
import { getPasskeysBySensei } from "~/models/passkey";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  return { passkeys: await getPasskeysBySensei(env, sensei, { ctx }) };
};

export default function EditPasskeyIndex() {
  const { passkeys } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [error, setError] = useState<string | null>(null);

  const addPasskey = async () => {
    setError(null);
    try {
      const creationOptions = await fetch("/auth/passkey/register");
      const creationOptionsBody = await creationOptions.json<unknown>();
      if (!creationOptions.ok) {
        setError(identityMaintenanceMessage(creationOptionsBody) ?? "Passkey를 추가하는 중 오류가 발생했어요.");
        return;
      }
      const creationResponse = await startRegistration({
        optionsJSON: creationOptionsBody as PublicKeyCredentialCreationOptionsJSON,
      });

      const creationResult = await fetch("/auth/passkey/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creationResponse),
      });

      if (!creationResult.ok) {
        const resultBody = await creationResult.json<unknown>().catch(() => null);
        setError(identityMaintenanceMessage(resultBody) ?? "Passkey를 추가하는 중 오류가 발생했어요.");
        return;
      }

      revalidator.revalidate();
    } catch {
      setError("Passkey를 추가하는 중 오류가 발생했어요.");
    }
  };

  return (
    <>
      <FormGroup>
        {passkeys.map((passkey) => {
          const daysDiff = dayjs().diff(dayjs(passkey.createdAt), "day");
          return (
            <LinkForm
              key={passkey.uid}
              label={passkey.memo}
              value={daysDiff === 0 ? "오늘" : `${daysDiff}일 전`}
              to={`/edit/passkey/${passkey.uid}`}
            />
          );
        })}
        <ButtonForm label="Passkey 추가" color="blue" onClick={addPasskey} />
      </FormGroup>
      {error && <p className="-mt-4 px-2 text-sm text-red-500">{error}</p>}
    </>
  );
}
