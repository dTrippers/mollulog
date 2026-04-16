import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { ProfileEditor } from "~/components/features/profile";
import { getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { getSenseiById, updateSensei } from "~/models/sensei";
import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";
import { Button, Input, Title } from "~/components/primitives";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getAllStudents } from "~/models/student";
import { FormGroup, LinkForm } from "~/components/features/forms";
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

  const senseiData = await getSenseiById(env, sensei.id);
  if (!senseiData) {
    return redirect("/unauthorized");
  }
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
};

type ActionData = {
  intent?: "profile" | "account";
  success?: boolean;
  savedAt?: string;
  error?: {
    form?: string;
    username?: string;
    friendCode?: string;
    bio?: string;
    memberCode?: string;
  };
};

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

  const intent = formData.get("intent");
  if (intent !== "profile" && intent !== "account") {
    return data<ActionData>(
      { error: { form: "잘못된 요청이에요. 다시 시도해주세요." } },
      { status: 400 },
    );
  }

  if (intent === "profile") {
    const username = getOptionalString("username");
    const bio = toNullable(getOptionalString("bio"));
    const profileStudentId = toNullable(getOptionalString("profileStudentId"));
    const friendCodeInput = toNullable(getOptionalString("friendCode"));
    const friendCode = typeof friendCodeInput === "string" ? friendCodeInput.toUpperCase() : friendCodeInput;

    if (!username) {
      return data<ActionData>(
        { intent, error: { username: "닉네임을 입력해주세요." } },
        { status: 400 },
      );
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      return data<ActionData>(
        { intent, error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." } },
        { status: 400 },
      );
    }
    if (typeof bio === "string" && bio.length > 100) {
      return data<ActionData>(
        { intent, error: { bio: "100자 이하로 작성해주세요." } },
        { status: 400 },
      );
    }
    if (typeof friendCode === "string" && !/^[A-Z]{8}$/.test(friendCode)) {
      return data<ActionData>(
        { intent, error: { friendCode: "친구 코드는 알파벳 8글자에요." } },
        { status: 400 },
      );
    }

    const result = await updateSensei(env, sensei.id, { username, bio, profileStudentId, friendCode });
    if (result.error) {
      return data<ActionData>({ intent, error: result.error }, { status: 400 });
    }

    const { getSession, commitSession } = sessionStorage(env);
    const session = await getSession(request.headers.get("cookie"));
    sensei.username = username;
    if (bio !== undefined) sensei.bio = bio;
    if (profileStudentId !== undefined) sensei.profileStudentId = profileStudentId;
    if (friendCode !== undefined) sensei.friendCode = friendCode;
    session.set(authenticator.sessionKey, sensei);

    return data<ActionData>(
      { intent, success: true, savedAt: dayjs().tz("Asia/Seoul").format("HH:mm") },
      { headers: { "Set-Cookie": await commitSession(session) } },
    );
  }

  const memberCode = toNullable(getOptionalString("memberCode"));
  await upsertSenseiPrivacy(env, sensei.id, memberCode ?? null);
  return data<ActionData>({ intent, success: true, savedAt: dayjs().tz("Asia/Seoul").format("HH:mm") });
};

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl bg-neutral-50/80 p-6 shadow-xs shadow-neutral-950/5 ring-1 ring-neutral-950/5 dark:bg-neutral-900/25 dark:shadow-black/10 dark:ring-white/10">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
      {children}
    </section>
  );
}

function SaveFeedback({
  isSubmitting,
  success,
  savedAt,
  error,
}: {
  isSubmitting: boolean;
  success?: boolean;
  savedAt?: string;
  error?: string;
}) {
  if (!isSubmitting && !success && !error) {
    return null;
  }

  const toneClass = isSubmitting
    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
    : error
      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  const Icon = isSubmitting ? ArrowPathIcon : error ? ExclamationCircleIcon : success ? CheckCircleIcon : null;
  const title = isSubmitting ? "변경 내용을 저장하고 있어요." : error ? error : "저장이 완료됐어요.";
  const description = success && savedAt ? `오늘 ${savedAt}에 반영했어요.` : isSubmitting ? "저장이 끝나면 바로 이 화면에서 확인할 수 있어요." : null;

  return (
    <div aria-live="polite" className={`flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-sm ${toneClass}`}>
      {Icon && <Icon className={`size-5 shrink-0 ${isSubmitting ? "animate-spin" : ""}`} />}
      <div className="space-y-0.5">
        <p className="font-medium">{title}</p>
        {description && <p className="text-xs opacity-80">{description}</p>}
      </div>
    </div>
  );
}

export default function EditProfile() {
  const { sensei, allStudents, passkeyCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submittingIntent = navigation.formData?.get("intent");
  const isProfileSubmitting = navigation.state === "submitting" && submittingIntent === "profile";
  const isAccountSubmitting = navigation.state === "submitting" && submittingIntent === "account";
  const profileActionData = actionData?.intent === "profile" ? actionData : undefined;
  const accountActionData = actionData?.intent === "account" ? actionData : undefined;

  return (
    <div className="space-y-8">
      <Title text="프로필 관리" />

      <EditSection title="프로필 정보">
        <Form method="put" className="space-y-6">
          <input type="hidden" name="intent" value="profile" />
          <ProfileEditor students={allStudents} initialData={sensei} error={profileActionData?.error} />

          <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
            <div className="md:max-w-xl">
              <SaveFeedback
                isSubmitting={isProfileSubmitting}
                success={profileActionData?.success}
                savedAt={profileActionData?.savedAt}
                error={profileActionData?.error?.form ?? (profileActionData?.error ? "입력한 값을 다시 확인해주세요." : undefined)}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isProfileSubmitting}
              className="min-w-32 self-start"
            >
              <span className="inline-flex items-center gap-2">
                {isProfileSubmitting ? (
                  <ArrowPathIcon className="size-4 animate-spin" />
                ) : profileActionData?.success ? (
                  <CheckCircleIcon className="size-4" />
                ) : null}
                <span>{isProfileSubmitting ? "저장 중..." : profileActionData?.success ? "저장 완료" : "프로필 저장"}</span>
              </span>
            </Button>
          </div>
        </Form>
      </EditSection>

      <EditSection title="블루 아카이브 계정 정보">
        <Form method="put" className="space-y-6">
          <input type="hidden" name="intent" value="account" />
          <Input
            label="회원 코드"
            type="text"
            name="memberCode"
            description="쿠폰 등록에 사용하는 회원 코드"
            defaultValue={sensei.memberCode ?? undefined}
            placeholder="[메뉴] > [계정] > [고객센터]에서 확인"
            error={accountActionData?.error?.memberCode}
            containerClassName="mt-0 mb-0"
          />
          <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
            <div className="md:max-w-xl">
              <SaveFeedback
                isSubmitting={isAccountSubmitting}
                success={accountActionData?.success}
                savedAt={accountActionData?.savedAt}
                error={accountActionData?.error?.form ?? (accountActionData?.error ? "입력한 값을 다시 확인해주세요." : undefined)}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isAccountSubmitting}
              className="min-w-32 self-start"
            >
              <span className="inline-flex items-center gap-2">
                {isAccountSubmitting ? (
                  <ArrowPathIcon className="size-4 animate-spin" />
                ) : accountActionData?.success ? (
                  <CheckCircleIcon className="size-4" />
                ) : null}
                <span>{isAccountSubmitting ? "저장 중..." : accountActionData?.success ? "저장 완료" : "회원 코드 저장"}</span>
              </span>
            </Button>
          </div>
        </Form>
      </EditSection>

      <EditSection title="인증 및 보안">
        <FormGroup>
          <LinkForm label="Passkey 관리" to="/edit/passkey" value={`${passkeyCount}개 등록됨`} />
          <LinkForm label="로그아웃" to="/signout" color="red" />
        </FormGroup>
      </EditSection>
    </div>
  );
}
