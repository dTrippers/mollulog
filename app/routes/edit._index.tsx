import { useEffect, useState, type ElementType, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { CheckCircle2Icon, ChevronRightIcon, KeyRoundIcon, LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { ProfileEditor } from "~/components/features/profile";
import { Button, Input, Title } from "~/components/primitives";
import { cn } from "~/lib/utils";
import { getPasskeysBySensei } from "~/models/passkey";
import { getSenseiById, updateSensei } from "~/models/sensei";
import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";
import { getAllStudents } from "~/models/student";

dayjs.extend(utc);
dayjs.extend(timezone);

export const meta: MetaFunction = () => [{ title: "프로필 관리 | 몰루로그" }];

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
    allStudents: (await getAllStudents(env, true))
      .map((student) => ({
        uid: student.uid,
        name: student.name,
        order: student.order,
      }))
      .sort((a, b) => a.order - b.order),
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
    return data<ActionData>({ error: { form: "잘못된 요청이에요. 다시 시도해주세요." } }, { status: 400 });
  }

  if (intent === "profile") {
    const username = getOptionalString("username");
    const bio = toNullable(getOptionalString("bio"));
    const profileStudentId = toNullable(getOptionalString("profileStudentId"));
    const friendCodeInput = toNullable(getOptionalString("friendCode"));
    const friendCode = typeof friendCodeInput === "string" ? friendCodeInput.toUpperCase() : friendCodeInput;

    if (!username) {
      return data<ActionData>({ intent, error: { username: "닉네임을 입력해주세요." } }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      return data<ActionData>(
        { intent, error: { username: "4~20글자의 영숫자 및 _ 기호만 사용할 수 있어요." } },
        { status: 400 },
      );
    }
    if (typeof bio === "string" && bio.length > 100) {
      return data<ActionData>({ intent, error: { bio: "100자 이하로 작성해주세요." } }, { status: 400 });
    }
    if (typeof friendCode === "string" && !/^[A-Z]{8}$/.test(friendCode)) {
      return data<ActionData>({ intent, error: { friendCode: "친구 코드는 알파벳 8글자에요." } }, { status: 400 });
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

function EditSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SaveSubmitButton({
  idleLabel,
  isSubmitting,
  isSaved,
}: {
  idleLabel: string;
  isSubmitting: boolean;
  isSaved: boolean;
}) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="sm"
      disabled={isSubmitting}
      className={cn(
        "min-w-32 self-start transition-colors",
        isSaved &&
          "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950",
      )}
    >
      {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
      {isSaved && !isSubmitting ? <CheckCircle2Icon className="size-4" /> : null}
      {isSubmitting ? "저장 중..." : isSaved ? "저장됨" : idleLabel}
    </Button>
  );
}

function SettingsLink({
  to,
  title,
  description,
  Icon,
  tone = "default",
}: {
  to: string;
  title: string;
  description?: string;
  Icon: ElementType;
  tone?: "default" | "destructive";
}) {
  const destructive = tone === "destructive";

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-foreground transition-colors hover:bg-muted/60",
        destructive && "text-destructive",
      )}
    >
      <Icon className={cn("size-4 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <ChevronRightIcon className={cn("size-4 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} />
    </Link>
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
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [isAccountDirty, setIsAccountDirty] = useState(false);
  const [isProfileSaved, setIsProfileSaved] = useState(false);
  const [isAccountSaved, setIsAccountSaved] = useState(false);

  useEffect(() => {
    if (!profileActionData?.success) {
      return;
    }

    setIsProfileDirty(false);
    setIsProfileSaved(true);
    const timeoutId = window.setTimeout(() => setIsProfileSaved(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [profileActionData]);

  useEffect(() => {
    if (!accountActionData?.success) {
      return;
    }

    setIsAccountDirty(false);
    setIsAccountSaved(true);
    const timeoutId = window.setTimeout(() => setIsAccountSaved(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [accountActionData]);

  return (
    <div className="space-y-8">
      <Title text="프로필 관리" />

      <EditSection title="프로필 정보" description="프로필 정보는 다른 사람에게 표시돼요">
        <Form
          method="put"
          className="space-y-6"
          onChange={() => {
            setIsProfileDirty(true);
            setIsProfileSaved(false);
          }}
        >
          <input type="hidden" name="intent" value="profile" />
          <ProfileEditor students={allStudents} initialData={sensei} error={profileActionData?.error} />
          <div className="flex justify-end">
            <SaveSubmitButton
              idleLabel="프로필 저장"
              isSubmitting={isProfileSubmitting}
              isSaved={isProfileSaved && !isProfileDirty}
            />
          </div>
        </Form>
      </EditSection>

      <EditSection title="블루 아카이브 계정 정보" description="계정 정보는 다른 사람이 확인할 수 없어요">
        <Form
          method="put"
          className="space-y-6"
          onChange={() => {
            setIsAccountDirty(true);
            setIsAccountSaved(false);
          }}
        >
          <input type="hidden" name="intent" value="account" />
          <Input
            label="회원 코드"
            type="text"
            name="memberCode"
            description="게임 쿠폰 등록에 사용할 수 있어요"
            defaultValue={sensei.memberCode ?? undefined}
            placeholder="[메뉴] > [계정] > [고객센터]에서 확인"
            error={accountActionData?.error?.memberCode}
            className="max-w-none md:max-w-md"
            containerClassName="mt-0 mb-0"
          />
          <div className="flex justify-end">
            <SaveSubmitButton
              idleLabel="계정 정보 저장"
              isSubmitting={isAccountSubmitting}
              isSaved={isAccountSaved && !isAccountDirty}
            />
          </div>
        </Form>
      </EditSection>

      <EditSection title="인증 및 보안">
        <div className="space-y-3">
          <SettingsLink
            to="/edit/passkey"
            title="Passkey 관리"
            description={`${passkeyCount}개 등록됨`}
            Icon={KeyRoundIcon}
          />
          <SettingsLink to="/signout" title="로그아웃" Icon={LogOutIcon} tone="destructive" />
        </div>
      </EditSection>
    </div>
  );
}
