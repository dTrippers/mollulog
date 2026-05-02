import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { ArrowRightStartOnRectangleIcon, KeyIcon, LinkIcon } from "@heroicons/react/24/outline";
import { type ElementType, type ReactNode, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei, getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { ProfileEditor } from "~/components/features/profile";
import { Button, Input, Title } from "~/components/primitives";
import { nowUtcIso } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { type AuthProvider, getAuthIdentityStatuses } from "~/models/auth-identity";
import { getPasskeysBySensei } from "~/models/passkey";
import { getSenseiById, updateSensei } from "~/models/sensei";
import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";
import { getAllStudents } from "~/models/student";

export const meta: MetaFunction = () => [{ title: "프로필 관리 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const sensei = await getActiveSensei(env, request);
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
    authIdentities: await getAuthIdentityStatuses(env, sensei.id),
    authMessage: authMessageFromSearchParams(url.searchParams),
  };
};

function authMessageFromSearchParams(params: URLSearchParams): { tone: "success" | "error"; text: string } | null {
  if (params.get("auth") === "linked") {
    return { tone: "success", text: "로그인 계정이 연동됐어요." };
  }
  if (params.get("auth_error") === "identity_in_use") {
    return { tone: "error", text: "이미 다른 선생님 계정에 연결된 로그인 계정이에요." };
  }
  if (params.get("auth_error") === "signin_required") {
    return { tone: "error", text: "로그인 후 다시 시도해주세요." };
  }
  if (params.get("auth_error") === "failed") {
    return { tone: "error", text: "로그인 계정 연동에 실패했어요. 다시 시도해주세요." };
  }
  return null;
}

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
  const sensei = await getActiveSensei(env, request);
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
      { intent, success: true, savedAt: nowUtcIso() },
      { headers: { "Set-Cookie": await commitSession(session) } },
    );
  }

  const memberCode = toNullable(getOptionalString("memberCode"));
  await upsertSenseiPrivacy(env, sensei.id, memberCode ?? null);
  return data<ActionData>({ intent, success: true, savedAt: nowUtcIso() });
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
      {isSubmitting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
      {isSaved && !isSubmitting ? <CheckCircleIcon className="size-4" /> : null}
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
        "flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-foreground transition-colors hover:bg-muted/60",
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

function AuthIdentityLinkForm({
  provider,
  label,
  linked,
}: {
  provider: AuthProvider;
  label: string;
  linked: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
      <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{linked ? "로그인에 사용할 수 있어요" : "연동되지 않음"}</p>
      </div>
      {linked ? (
        <span className="inline-flex w-fit items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-muted/60 px-3 py-1.5 text-center text-sm font-medium text-muted-foreground shadow-xs">
          연동됨
        </span>
      ) : (
        <Form method="post" action={`/auth/${provider}/link`}>
          <Button type="submit" size="sm" variant="tint-blue">
            연동하기
          </Button>
        </Form>
      )}
    </div>
  );
}

export default function EditProfile() {
  const { sensei, allStudents, passkeyCount, authIdentities, authMessage } = useLoaderData<typeof loader>();
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
          {authMessage ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                authMessage.tone === "success"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              {authMessage.text}
            </p>
          ) : null}
          <AuthIdentityLinkForm provider="google" label="Google" linked={authIdentities.google} />
          <AuthIdentityLinkForm provider="github" label="GitHub" linked={authIdentities.github} />
          <SettingsLink
            to="/edit/passkey"
            title="Passkey 관리"
            description={`${passkeyCount}개 등록됨`}
            Icon={KeyIcon}
          />
          <SettingsLink to="/signout" title="로그아웃" Icon={ArrowRightStartOnRectangleIcon} tone="destructive" />
        </div>
      </EditSection>
    </div>
  );
}
