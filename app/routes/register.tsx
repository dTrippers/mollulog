import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getSenseiById, getSenseiByUsername, updateSensei } from "~/models/sensei";
import { getAuthenticator, redirectTo, sessionStorage } from "~/auth/authenticator.server";
import { ProfileEditor } from "~/components/features/profile";
import { Title } from "~/components/primitives";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { getAllStudents } from "~/models/student";
import { LoaderCircleIcon } from "lucide-react";

export const meta: MetaFunction = () => [
  { title: "선생님 등록 | 몰루로그" },
];

type ActionData = {
  error?: {
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
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (sensei.active) {
    const latestSensei = await getSenseiById(env, sensei.id);
    return redirect(redirectTo(request) ?? `/@${latestSensei?.username ?? sensei.username}`);
  }

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
    const latestSensei = await getSenseiById(env, sensei.id);
    return redirect(redirectTo(request) ?? `/@${latestSensei?.username ?? sensei.username}`);
  }

  const formData = await request.formData();
  const getStringOrNull = (key: string) => formData.get(key) as string | null;
  sensei.username = formData.get("username") as string;
  sensei.bio = getStringOrNull("bio");
  sensei.profileStudentId = getStringOrNull("profileStudentId");
  sensei.friendCode = getStringOrNull("friendCode")?.toUpperCase() ?? null;
  const values = {
    username: sensei.username,
    profileStudentId: sensei.profileStudentId,
    friendCode: sensei.friendCode,
    bio: sensei.bio,
  };

  if (!/^[a-zA-Z0-9_]{4,20}$/.test(sensei.username)) {
    return {
      error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." },
      values,
    } satisfies ActionData;
  }

  const existingSensei = await getSenseiByUsername(env, sensei.username);
  if (existingSensei && existingSensei.id !== sensei.id) {
    return { error: { username: "닉네임이 이미 존재해요." }, values } satisfies ActionData;
  }
  if (sensei.bio && sensei.bio.length > 100) {
    return { error: { bio: "100자 이하로 작성해주세요." }, values } satisfies ActionData;
  }
  if (sensei.friendCode && !/^[A-Z]{8}$/.test(sensei.friendCode)) {
    return {
      error: { friendCode: "친구 코드는 알파벳 8글자에요." },
      values,
    } satisfies ActionData;
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
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="max-w-3xl">
      <Title text="선생님 등록" />
      <Card>
        <CardHeader>
          <CardTitle>프로필 정보</CardTitle>
          <CardDescription>프로필 정보는 다른 사람에게 표시돼요</CardDescription>
        </CardHeader>
        <Form method="post" className="contents">
          <CardContent>
            <ProfileEditor
              students={allStudents}
              initialData={actionData?.values}
              error={actionData?.error}
            />
          </CardContent>
          <CardFooter className="justify-end border-0 bg-transparent">
            <Button type="submit" size="lg" disabled={isSubmitting} className="self-start">
              {isSubmitting ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : null}
              {isSubmitting ? "등록 중..." : "선생님 등록하기"}
            </Button>
          </CardFooter>
        </Form>
      </Card>
    </div>
  );
}
