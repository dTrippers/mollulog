import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect, useLoaderData, useSubmit } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { deletePasskey, getPasskeysBySensei, updatePasskeyMemo } from "~/models/passkey";
import { ButtonForm, FormGroup, InputForm } from "~/components/features/forms";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const sensei = await getAuthenticator(context.cloudflare.env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const { uid } = params;
  const passkeys = await getPasskeysBySensei(context.cloudflare.env, sensei);
  const passkey = passkeys.find((passkey) => passkey.uid === uid);
  if (!passkey) {
    return redirect("/edit/passkey");
  }
  return { passkey };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env } = context.cloudflare;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const { uid } = params;
  if (request.method === "PATCH") {
    const formData = await request.formData();
    const memo = formData.get("memo") as string;
    if (!uid) {
      return redirect("/edit/passkey");
    }

    await updatePasskeyMemo(env, sensei, uid, memo);
    return { success: true };
  }
  if (request.method === "DELETE") {
    if (!uid) {
      return redirect("/edit/passkey");
    }
    await deletePasskey(env, sensei, uid);
    return redirect("/edit/passkey");
  }
  return new Response(null, { status: 405 });
};

export default function EditPasskey() {
  const { passkey } = useLoaderData<typeof loader>();

  const submit = useSubmit();

  return (
    <>
      <FormGroup method="patch" submitOnChange>
        <InputForm label="이름" type="text" name="memo" defaultValue={passkey.memo} />
        <ButtonForm label="이 Passkey 삭제" color="red" onClick={() => {
          if (confirm("정말 삭제할까요? 삭제된 Passkey는 복구할 수 없어요.")) {
            submit(null, { method: "delete" });
          }
        }} />
      </FormGroup>
    </>
  );
}
