import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  getActiveSensei,
  getAuthenticator,
  getPendingSenseiRegistrationUid,
  pendingSenseiRegistrationSessionKey,
  redirectTo,
  sessionStorage,
} from "~/auth/authenticator.server";
import { ProfileEditor } from "~/components/features/profile";
import { Button, Title } from "~/components/primitives";
import { identityMaintenanceMessage } from "~/domain/identity-cutover";
import { identityMaintenanceActionResult } from "~/lib/identity-cutover.server";
import { createSenseiWithAuthIdentity, getSenseiByAuthIdentity } from "~/models/auth-identity";
import { deletePendingSenseiRegistration, getPendingSenseiRegistration } from "~/models/pending-sensei-registration";
import { getSenseiById, getSenseiByUsername } from "~/models/sensei";
import { getAllStudents } from "~/models/student";

export const meta: MetaFunction = () => [{ title: "선생님 등록 | 몰루로그" }];

type ActionData = {
  message?: string;
  error?: {
    form?: string;
    username?: string;
    friendCode?: string;
    bio?: string;
  };
  values?: {
    username: string;
    profileStudentId: string | null;
    friendCode: string | null;
    bio: string | null;
  };
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (sensei) {
    const latestSensei = await getSenseiById(env, sensei.id, { ctx });
    return redirect(redirectTo(request) ?? `/@${latestSensei?.username ?? sensei.username}`);
  }

  const pendingUid = await getPendingSenseiRegistrationUid(env, request);
  if (!pendingUid || !(await getPendingSenseiRegistration(env, pendingUid, { ctx }))) {
    return redirect("/unauthorized");
  }

  return {
    allStudents: (await getAllStudents(env, true))
      .map((student) => ({
        uid: student.uid,
        name: student.name,
        order: student.order,
      }))
      .sort((a, b) => a.order - b.order),
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const maintenance = await identityMaintenanceActionResult(env, { ctx, operation: "register.action" });
  if (maintenance) return maintenance;
  const authenticator = getAuthenticator(env, ctx);
  const sensei = await getActiveSensei(env, request, ctx);
  if (sensei) {
    const latestSensei = await getSenseiById(env, sensei.id, { ctx });
    return redirect(redirectTo(request) ?? `/@${latestSensei?.username ?? sensei.username}`);
  }

  const pendingUid = await getPendingSenseiRegistrationUid(env, request);
  const pendingRegistration = pendingUid ? await getPendingSenseiRegistration(env, pendingUid, { ctx }) : null;
  if (!pendingRegistration) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const getStringOrNull = (key: string) => formData.get(key) as string | null;
  const username = formData.get("username") as string;
  const bio = getStringOrNull("bio");
  const profileStudentId = getStringOrNull("profileStudentId");
  const friendCode = getStringOrNull("friendCode")?.toUpperCase() ?? null;
  const values = {
    username,
    profileStudentId,
    friendCode,
    bio,
  };

  if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
    return {
      error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." },
      values,
    } satisfies ActionData;
  }

  const existingSensei = await getSenseiByUsername(env, username, { ctx });
  if (existingSensei) {
    return { error: { username: "닉네임이 이미 존재해요." }, values } satisfies ActionData;
  }
  if (bio && bio.length > 100) {
    return { error: { bio: "100자 이하로 작성해주세요." }, values } satisfies ActionData;
  }
  if (friendCode && !/^[A-Z]{8}$/.test(friendCode)) {
    return {
      error: { friendCode: "친구 코드는 알파벳 8글자에요." },
      values,
    } satisfies ActionData;
  }

  const linkedSensei = await getSenseiByAuthIdentity(
    env,
    pendingRegistration.provider,
    pendingRegistration.providerUserId,
    { ctx },
  );
  if (linkedSensei) {
    await deletePendingSenseiRegistration(env, pendingRegistration.uid, { ctx });

    const { getSession, commitSession } = sessionStorage(env);
    const session = await getSession(request.headers.get("cookie"));
    session.set(authenticator.sessionKey, linkedSensei);
    session.unset(pendingSenseiRegistrationSessionKey);
    return redirect(redirectTo(request) ?? `/@${linkedSensei.username}`, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  const createResult = await createSenseiWithAuthIdentity(
    env,
    values,
    pendingRegistration.provider,
    pendingRegistration.providerUserId,
    { ctx },
  );
  if (createResult.error || !createResult.sensei) {
    return { error: createResult.error ?? { form: "선생님 등록에 실패했어요." }, values } satisfies ActionData;
  }

  await deletePendingSenseiRegistration(env, pendingRegistration.uid, { ctx });

  const { getSession, commitSession } = sessionStorage(env);
  const session = await getSession(request.headers.get("cookie"));
  session.set(authenticator.sessionKey, createResult.sensei);
  session.unset(pendingSenseiRegistrationSessionKey);
  return redirect(redirectTo(request) ?? `/@${createResult.sensei.username}`, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};

export default function Register() {
  const { allStudents } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const maintenanceMessage = identityMaintenanceMessage(actionData);

  return (
    <div className="max-w-3xl">
      <Title text="선생님 등록" />
      <section className="rounded-lg bg-card p-5 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        <div className="mb-6 space-y-1">
          <h2 className="text-lg font-semibold">프로필 정보</h2>
          <p className="text-sm text-muted-foreground">프로필 정보는 다른 사람에게 표시돼요</p>
        </div>

        <Form method="post">
          {(maintenanceMessage ?? actionData?.error?.form) ? (
            <p className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {maintenanceMessage ?? actionData?.error?.form}
            </p>
          ) : null}
          <ProfileEditor students={allStudents} initialData={actionData?.values} error={actionData?.error} />

          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
              {isSubmitting ? "등록 중..." : "선생님 등록하기"}
            </Button>
          </div>
        </Form>
      </section>
    </div>
  );
}
