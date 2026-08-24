import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei, getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { Button, Callout, Input, SectionCard, Title } from "~/components/primitives";
import { getLogger } from "~/lib/observability.server";
import { leaveAccount } from "~/models/account-security";
import { getSenseiById } from "~/models/sensei";

export const meta: MetaFunction = () => [{ title: "회원 탈퇴 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const latestSensei = await getSenseiById(env, sensei.id, { ctx });
  if (!latestSensei?.active) return redirect("/unauthorized");

  return { username: latestSensei.username };
};

type ActionData = {
  error?: {
    form?: string;
    username?: string;
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const formData = await request.formData();
  const username = formData.get("username");
  if (typeof username !== "string" || username.length === 0) {
    return data<ActionData>({ error: { username: "현재 username을 입력해주세요." } }, { status: 400 });
  }

  const logger = getLogger(env, ctx, { route: "edit.leave.action" });
  let result: Awaited<ReturnType<typeof leaveAccount>>;
  try {
    result = await leaveAccount(env, { userId: sensei.id, username }, { ctx });
  } catch (error) {
    logger.error("Account leave failed", error, { userId: sensei.id });
    return data<ActionData>({ error: { form: "탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요." } }, { status: 500 });
  }

  if (result.status === "username_mismatch") {
    return data<ActionData>({ error: { username: "현재 username과 일치하지 않아요." } }, { status: 400 });
  }
  if (result.status === "inactive" || result.status === "not_found") {
    return redirect("/unauthorized");
  }

  try {
    return await getAuthenticator(env, ctx).logout(request, { redirectTo: "/" });
  } catch (error) {
    logger.error("Account leave logout failed", error, { userId: sensei.id });
    try {
      const storage = sessionStorage(env);
      const session = await storage.getSession(request.headers.get("Cookie"));
      return redirect("/", { headers: { "Set-Cookie": await storage.destroySession(session) } });
    } catch (cleanupError) {
      logger.error("Account leave session cleanup failed", cleanupError, { userId: sensei.id });
      return new Response(null, {
        status: 302,
        headers: {
          "Cache-Control": "no-store",
          Location: "/",
          "Set-Cookie": "__session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }
  }
};

export default function LeaveAccount() {
  const { username } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [confirmation, setConfirmation] = useState("");
  const isSubmitting = navigation.state === "submitting";
  const canSubmit = confirmation === username;

  return (
    <div className="space-y-8">
      <Title text="회원 탈퇴" parentPath="/edit" />
      <SectionCard title="회원 탈퇴" description="탈퇴하면 계정을 다시 사용할 수 없어요.">
        <div className="space-y-6">
          <Callout
            Icon={ExclamationTriangleIcon}
            tone="destructive"
            description="탈퇴하면 모든 데이터에 접근할 수 없고 복구할 수 없어요. 정말 진행할까요?"
          />
          <Form method="post" className="space-y-6">
            {actionData?.error?.form ? <Callout tone="destructive" description={actionData.error.form} /> : null}
            <Input
              label="현재 username"
              name="username"
              value={confirmation}
              onChange={setConfirmation}
              error={actionData?.error?.username}
              autoComplete="off"
              className="max-w-none md:max-w-md"
              containerClassName="mt-0 mb-0"
            />
            <p className="text-sm text-muted-foreground">
              탈퇴하려면 <span className="font-medium text-foreground">{username}</span>을(를) 입력해주세요.
            </p>
            <div className="flex justify-end">
              <Button type="submit" variant="danger" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? "탈퇴 처리 중..." : "회원 탈퇴"}
              </Button>
            </div>
          </Form>
        </div>
      </SectionCard>
    </div>
  );
}
