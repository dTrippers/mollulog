import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import { ProfileEditor } from "~/components/organisms/profile";
import { getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { getSenseiById, updateSensei } from "~/models/sensei";
import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";
import { SubTitle, Title } from "~/components/atoms/typography";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getAllStudents } from "~/models/student";
import { FormGroup } from "~/components/organisms/form";
import { InputForm, LinkForm } from "~/components/molecules/form";
import { getPasskeysBySensei } from "~/models/passkey";

dayjs.extend(utc);
dayjs.extend(timezone);

export const meta: MetaFunction = () => [
  { title: "프로필 관리 | 몰루로그" },
];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const senseiData = (await getSenseiById(env, sensei.id))!;
  const senseiPrivacy = await getSenseiPrivacyByUserId(env, sensei.id);
  return {
    sensei: {
      username: senseiData.username,
      bio: senseiData.bio,
      profileStudentId: senseiData.profileStudentId,
      friendCode: senseiData.friendCode,
      memberCode: senseiPrivacy?.memberCode ?? null,
    },
    allStudents: (await getAllStudents(env, true)).map((student) => ({
      uid: student.uid,
      name: student.name,
      order: student.order,
    })).sort((a, b) => a.order - b.order),
    passkeyCount: (await getPasskeysBySensei(env, sensei)).length,
  };
}

type ActionData = {
  error?: {
    username?: string;
    friendCode?: string;
    bio?: string;
    memberCode?: string;
  };
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const authenticator = getAuthenticator(env);
  const sensei = await authenticator.isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const getOptionalString = (key: string) => {
    if (!formData.has(key)) return undefined;
    const value = formData.get(key);
    if (value === null) return undefined;
    return (value as string).trim();
  };
  const toNullable = (value: string | undefined) => {
    if (value === undefined) return undefined;
    return value === "" ? null : value;
  };

  const username = getOptionalString("username");
  const bio = toNullable(getOptionalString("bio"));
  const profileStudentId = toNullable(getOptionalString("profileStudentId"));
  const friendCodeInput = toNullable(getOptionalString("friendCode"));
  const memberCode = toNullable(getOptionalString("memberCode"));
  const friendCode = typeof friendCodeInput === "string" ? friendCodeInput.toUpperCase() : friendCodeInput;

  if (username !== undefined && !/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
    return { error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." } };
  }
  if (typeof bio === "string" && bio.length > 100) {
    return { error: { bio: "100자 이하로 작성해주세요." } };
  }
  if (typeof friendCode === "string" && !/^[A-Z]{8}$/.test(friendCode)) {
    return { error: { friendCode: "친구 코드는 알파벳 8글자에요." } };
  }

  const result = await updateSensei(env, sensei.id, { username, bio, profileStudentId, friendCode });
  if (result.error) {
    return { error: { username: "오류가 발생했어요. 잠시 후 다시 시도해주세요." } };
  }
  if (memberCode !== undefined) {
    await upsertSenseiPrivacy(env, sensei.id, memberCode);
  }

  const { getSession, commitSession } = sessionStorage(env);
  const session = await getSession(request.headers.get("cookie"));
  if (username !== undefined) sensei.username = username;
  if (bio !== undefined) sensei.bio = bio;
  if (profileStudentId !== undefined) sensei.profileStudentId = profileStudentId;
  if (friendCode !== undefined) sensei.friendCode = friendCode;
  session.set(authenticator.sessionKey, sensei);
  return data(null, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export default function EditProfile() {
  const { sensei, allStudents, passkeyCount } = useLoaderData<typeof loader>();
  return (
    <>
      <Title text="프로필 관리" />

      <SubTitle text="프로필 정보" />
      <ProfileEditor
        method="put"
        students={allStudents}
        initialData={sensei}
        error={useActionData<ActionData>()?.error}
        submitOnChange
      />

      <SubTitle
        text="블루 아카이브 계정 정보"
        description="게임을 켜지 않아도 필요한 정보를 확인할 수 있어요"
      />
      <FormGroup method="put" submitOnChange>
        <InputForm
          label="회원 코드" type="text" name="memberCode"
          description="쿠폰 등록에 사용하는 회원 코드"
          defaultValue={sensei.memberCode ?? undefined}
          placeholder="[메뉴] > [계정] > [고객센터]에서 확인"
          error={useActionData<ActionData>()?.error?.memberCode}
        />
      </FormGroup>

      <SubTitle text="인증 및 보안" />
      <FormGroup>
        <LinkForm label="Passkey 관리" to="/edit/passkey" value={`${passkeyCount}개 등록됨`} />
        <LinkForm label="로그아웃" to="/signout" color="red" />
      </FormGroup>
    </>
  );
}
