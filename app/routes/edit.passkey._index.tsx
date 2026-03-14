import dayjs from "dayjs";
import { useState } from "react";
import { type LoaderFunctionArgs, redirect, useLoaderData, useRevalidator } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getPasskeysBySensei } from "~/models/passkey";
import { ButtonForm, FormGroup, LinkForm } from "~/components/features/forms";
import { startRegistration } from "@simplewebauthn/browser";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  return { passkeys: await getPasskeysBySensei(env, sensei) };
};

export default function EditPasskeyIndex() {
  const { passkeys } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [error, setError] = useState<string | null>(null);

  const addPasskey = async () => {
    const creationOptions = await fetch("/auth/passkey/register");
    const creationResponse = await startRegistration({ optionsJSON: await creationOptions.json() });

    const creationResult = await fetch("/auth/passkey/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creationResponse),
    });

    if (!creationResult.ok) {
      setError("Passkey를 추가하는 중 오류가 발생했어요.");
      return;
    }

    revalidator.revalidate();
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
