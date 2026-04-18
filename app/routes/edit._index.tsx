import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getAuthenticator, sessionStorage } from "~/auth/authenticator.server";
import { getSenseiById, updateSensei } from "~/models/sensei";
import { getSenseiPrivacyByUserId, upsertSenseiPrivacy } from "~/models/sensei-privacy";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getAllStudents } from "~/models/student";
import { getPasskeysBySensei } from "~/models/passkey";
import { cn } from "~/lib/utils";
import { ProfileEditor } from "~/components/features/profile";
import { Title } from "~/components/primitives";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogOutIcon,
} from "lucide-react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "~/components/ui/item";

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

function EditSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children}
    </Card>
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
  const state = isSubmitting ? "submitting" : isSaved ? "saved" : "idle";

  return (
    <Button
      type="submit"
      size="lg"
      disabled={isSubmitting}
      className={cn(
        "self-start min-w-32 transition-colors",
        isSaved &&
          "border-green-600 bg-green-600 text-white hover:bg-green-600 dark:border-green-500 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-500",
      )}
    >
      <span
        key={state}
        aria-live="polite"
        className="flex items-center gap-1.5 animate-in fade-in-0 zoom-in-95 duration-200"
      >
        {isSubmitting ? (
          <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
        ) : null}
        {isSaved ? <CheckCircle2Icon data-icon="inline-start" /> : null}
        {isSubmitting ? "저장 중..." : isSaved ? "저장됨" : idleLabel}
      </span>
    </Button>
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

      <EditSection
        title="프로필 정보"
        description="프로필 정보는 다른 사람에게 표시돼요"
      >
        <Form
          method="put"
          className="contents"
          onChange={() => {
            setIsProfileDirty(true);
            setIsProfileSaved(false);
          }}
        >
          <input type="hidden" name="intent" value="profile" />
          <CardContent>
            <ProfileEditor
              students={allStudents}
              initialData={sensei}
              error={profileActionData?.error}
            />
          </CardContent>
          <CardFooter className="justify-end border-0 bg-transparent">
            <SaveSubmitButton
              idleLabel="프로필 저장"
              isSubmitting={isProfileSubmitting}
              isSaved={isProfileSaved && !isProfileDirty}
            />
          </CardFooter>
        </Form>
      </EditSection>

      <EditSection
        title="블루 아카이브 계정 정보"
        description="계정 정보는 다른 사람이 확인할 수 없어요"
      >
        <Form
          method="put"
          className="contents"
          onChange={() => {
            setIsAccountDirty(true);
            setIsAccountSaved(false);
          }}
        >
          <input type="hidden" name="intent" value="account" />
          <CardContent>
            <FieldGroup>
              <Field
                className="max-w-sm"
                data-invalid={Boolean(accountActionData?.error?.memberCode) || undefined}
              >
                <FieldLabel htmlFor="edit-member-code">회원 코드</FieldLabel>
                <FieldContent>
                  <Input
                    id="edit-member-code"
                    type="text"
                    name="memberCode"
                    defaultValue={sensei.memberCode ?? undefined}
                    placeholder="[메뉴] > [계정] > [고객센터]에서 확인"
                    aria-invalid={Boolean(accountActionData?.error?.memberCode) || undefined}
                  />
                  <FieldDescription>
                    게임 쿠폰 등록에 사용할 수 있어요
                  </FieldDescription>
                  <FieldError>{accountActionData?.error?.memberCode}</FieldError>
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end border-0 bg-transparent">
            <SaveSubmitButton
              idleLabel="계정 정보 저장"
              isSubmitting={isAccountSubmitting}
              isSaved={isAccountSaved && !isAccountDirty}
            />
          </CardFooter>
        </Form>
      </EditSection>

      <EditSection title="인증 및 보안">
        <CardContent>
          <ItemGroup>
            <Item asChild variant="muted" className="rounded-xl">
              <Link to="/edit/passkey">
                <ItemMedia variant="icon">
                  <KeyRoundIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Passkey 관리</ItemTitle>
                  <ItemDescription>{`${passkeyCount}개 등록됨`}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon />
                </ItemActions>
              </Link>
            </Item>
            <Item asChild variant="muted" className="rounded-xl text-destructive">
              <Link to="/signout">
                <ItemMedia variant="icon">
                  <LogOutIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>로그아웃</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon />
                </ItemActions>
              </Link>
            </Item>
          </ItemGroup>
        </CardContent>
      </EditSection>
    </div>
  );
}
