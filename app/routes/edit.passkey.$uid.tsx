import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, Input } from "~/components/primitives";
import { identityMaintenanceMessage } from "~/domain/identity-cutover";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";
import { deletePasskey, getPasskeysBySensei, updatePasskeyMemo } from "~/models/passkey";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const sensei = await getActiveSensei(context.cloudflare.env, request);
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
  const maintenance = await identityMaintenanceActionResult(env, { operation: "edit.passkey.action" });
  if (maintenance) return maintenance;
  const sensei = await getActiveSensei(env, request);
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
  const actionData = useActionData<typeof action>();
  const maintenanceMessage = identityMaintenanceMessage(actionData);
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";
  const isSaving = isSubmitting && navigation.formMethod?.toLowerCase() === "patch";
  const isDeleting = isSubmitting && navigation.formMethod?.toLowerCase() === "delete";

  return (
    <Form
      method="patch"
      className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20"
    >
      <Input
        label="이름"
        type="text"
        name="memo"
        defaultValue={passkey.memo}
        className="max-w-none"
        containerClassName="mt-0 mb-0"
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div className="text-sm">
          {maintenanceMessage ? <p className="text-red-700 dark:text-red-300">{maintenanceMessage}</p> : null}
          {actionData && "success" in actionData && actionData.success ? (
            <p className="text-green-600 dark:text-green-400">Passkey 이름을 저장했어요.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            text={isSaving ? "저장 중..." : "이름 저장"}
            disabled={isSubmitting}
          />
          <Button
            type="button"
            variant="danger"
            text={isDeleting ? "삭제 중..." : "이 Passkey 삭제"}
            disabled={isSubmitting}
            onClick={() => {
              if (confirm("정말 삭제할까요? 삭제된 Passkey는 복구할 수 없어요.")) {
                submit(null, { method: "delete" });
              }
            }}
          />
        </div>
      </div>
    </Form>
  );
}
