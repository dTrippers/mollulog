import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useNavigation } from "react-router";
import {
  getActiveSensei,
  getAuthenticator,
  sessionStorage,
  sessionValidationStorage,
} from "~/auth/authenticator.server";
import { Button, Callout, SectionCard, Title } from "~/components/primitives";
import { getLogger } from "~/lib/observability.server";
import { leaveAccount } from "~/models/account-security";
import { getSenseiById } from "~/models/sensei";
import AccountLeaveNotice from "./edit.leave._components/AccountLeaveNotice";

export const meta: MetaFunction = () => [{ title: "회원 탈퇴 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const latestSensei = await getSenseiById(env, sensei.id, { ctx });
  if (!latestSensei?.active) return redirect("/unauthorized");

  return null;
};

type ActionData = {
  error?: {
    form?: string;
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const logger = getLogger(env, ctx, { route: "edit.leave.action" });
  let result: Awaited<ReturnType<typeof leaveAccount>>;
  try {
    result = await leaveAccount(env, { userId: sensei.id }, { ctx });
  } catch (error) {
    logger.error("Account leave failed", error, { userId: sensei.id });
    return data<ActionData>({ error: { form: "탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요." } }, { status: 500 });
  }

  if (result.status === "inactive" || result.status === "not_found") {
    return redirect("/unauthorized");
  }

  try {
    const leaseStorage = sessionValidationStorage(env);
    const leaseSession = await leaseStorage.getSession(request.headers.get("Cookie"));
    const headers = new Headers();
    headers.append("Set-Cookie", await leaseStorage.destroySession(leaseSession));
    return await getAuthenticator(env, ctx).logout(request, { redirectTo: "/?account=left", headers });
  } catch (error) {
    if (error instanceof Response) return error;
    logger.error("Account leave logout failed", error, { userId: sensei.id });
    try {
      const authStorage = sessionStorage(env);
      const leaseStorage = sessionValidationStorage(env);
      const cookie = request.headers.get("Cookie");
      const [session, leaseSession] = await Promise.all([
        authStorage.getSession(cookie),
        leaseStorage.getSession(cookie),
      ]);
      const headers = new Headers();
      headers.append("Set-Cookie", await authStorage.destroySession(session));
      headers.append("Set-Cookie", await leaseStorage.destroySession(leaseSession));
      return redirect("/?account=left", { headers });
    } catch (cleanupError) {
      logger.error("Account leave session cleanup failed", cleanupError, { userId: sensei.id });
      const headers = new Headers({
        "Cache-Control": "no-store",
        Location: "/?account=left",
      });
      headers.append("Set-Cookie", "__session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
      headers.append("Set-Cookie", "__session_validation=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax");
      return new Response(null, {
        status: 302,
        headers,
      });
    }
  }
};

export default function LeaveAccount() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-8">
      <Title text="회원 탈퇴" parentPath="/edit" />
      <SectionCard>
        <div className="space-y-6">
          <AccountLeaveNotice />
          <Form method="post" className="space-y-6">
            {actionData?.error?.form ? <Callout tone="destructive" description={actionData.error.form} /> : null}
            <div className="flex justify-end">
              <Button type="submit" variant="danger" disabled={isSubmitting}>
                {isSubmitting ? "탈퇴 처리 중..." : "회원 탈퇴"}
              </Button>
            </div>
          </Form>
        </div>
      </SectionCard>
    </div>
  );
}
