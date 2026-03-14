import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useActionData } from "react-router";
import { useLoaderData } from "react-router";
import { getSenseiByUsername, updateSensei } from "~/models/sensei";
import { getAuthenticator, redirectTo, sessionStorage } from "~/auth/authenticator.server";
import { ProfileEditor } from "~/components/features/profile";
import { Title } from "~/components/primitives";
import { getAllStudents } from "~/models/student";

export const meta: MetaFunction = () => [
  { title: "선생님 등록 | 몰루로그" },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const sensei = await getAuthenticator(context.cloudflare.env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (sensei.active) {
    return redirect(redirectTo(request) ?? `/@${sensei.username}`);
  }

  const env = context.cloudflare.env;
  return {
    allStudents: (await getAllStudents(env, true)).map((student) => ({
      uid: student.uid,
      name: student.name,
      order: student.order,
    })).sort((a, b) => a.order - b.order),
  };
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const authenticator = getAuthenticator(env);
  const sensei = await authenticator.isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (sensei.active) {
    return redirect(redirectTo(request) ?? `/@${sensei?.username}`);
  }

  const formData = await request.formData();
  const getStringOrNull = (key: string) => formData.get(key) as string | null;
  sensei.username = formData.get("username") as string;
  sensei.bio = getStringOrNull("bio");
  sensei.profileStudentId = getStringOrNull("profileStudentId");
  sensei.friendCode = getStringOrNull("friendCode")?.toUpperCase() ?? null;

  if (!/^[a-zA-Z0-9_]{4,20}$/.test(sensei.username)) {
    return { error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." } };
  }

  const existingSensei = await getSenseiByUsername(env, sensei.username);
  if (existingSensei) {
    return { error: { username: "닉네임이 이미 존재해요." } };
  }
  if (sensei.bio && sensei.bio.length > 100) {
    return { error: { bio: "100자 이하로 작성해주세요." } };
  }
  if (sensei.friendCode && !/^[A-Z]{8}$/.test(sensei.friendCode)) {
    return { error: { friendCode: "친구 코드는 알파벳 8글자에요." } };
  }

  sensei.active = true;
  await updateSensei(env, sensei.id, sensei);

  const { getSession, commitSession } = sessionStorage(env);
  const session = await getSession(request.headers.get("cookie"));
  session.set(authenticator.sessionKey, sensei);
  return redirect(redirectTo(request) ?? `/@${sensei.username}`, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export default function Register() {
  const { allStudents } = useLoaderData<typeof loader>();
  return (
    <>
      <Title text="선생님 등록" />
      <ProfileEditor method="post" students={allStudents} error={useActionData<typeof action>()?.error} />
    </>
  );
}
