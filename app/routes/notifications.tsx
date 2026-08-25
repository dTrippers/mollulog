import { ArrowPathIcon, BellAlertIcon, CheckCircleIcon, LinkIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, SectionCard, Title, Toggle } from "~/components/primitives";
import {
  DiscordIdentityAlreadyLinkedError,
  DiscordNotificationValidationError,
  DiscordSettingsUnavailableError,
  getDiscordNotificationState,
  parseDiscordNotificationSettingsForm,
  saveDiscordNotificationSettings,
  unlinkDiscordConnection,
} from "~/models/discord-notifications.server";

export const meta: MetaFunction = () => [{ title: "알림 설정 | 몰루로그" }];

const KST_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");
  const url = new URL(request.url);
  return {
    state: await getDiscordNotificationState(env, sensei.id, { ctx }),
    notice: notificationNotice(url.searchParams),
  };
};

function notificationNotice(params: URLSearchParams): { tone: "success" | "error"; text: string } | null {
  if (params.get("unlinked") === "1") return { tone: "success", text: "Discord 연동을 해제했어요." };
  if (params.get("saved") === "1") return { tone: "success", text: "알림 설정을 저장했어요." };
  if (params.get("discord") === "pending") return { tone: "success", text: "Discord 계정을 확인 중이에요." };
  if (params.get("discord") === "identity_in_use") {
    return { tone: "error", text: "이미 다른 선생님 계정에 연결된 Discord 계정이에요." };
  }
  if (params.get("discord") === "failed")
    return { tone: "error", text: "Discord 연동에 실패했어요. 다시 시도해주세요." };
  return null;
}

type ActionData = { error?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "unlink") {
    try {
      await unlinkDiscordConnection(env, sensei.id, { ctx });
      return redirect("/notifications?unlinked=1");
    } catch (error) {
      console.error("[notifications] failed to unlink Discord connection", error);
      return data<ActionData>({ error: "Discord 연동을 해제하지 못했어요." }, { status: 500 });
    }
  }
  if (intent !== "save") {
    return data<ActionData>({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  try {
    const settings = parseDiscordNotificationSettingsForm(formData);
    await saveDiscordNotificationSettings(env, sensei.id, settings, { ctx });
    return redirect("/notifications?saved=1");
  } catch (error) {
    const expectedError =
      error instanceof DiscordSettingsUnavailableError ||
      error instanceof DiscordIdentityAlreadyLinkedError ||
      error instanceof DiscordNotificationValidationError;
    const message = expectedError ? error.message : "알림 설정을 저장하지 못했어요.";
    if (!expectedError) {
      console.error("[notifications] failed to save Discord notification settings", error);
    }
    return data<ActionData>({ error: message }, { status: expectedError ? 400 : 500 });
  }
};

function ConnectionSection({
  connection,
}: {
  connection: Awaited<ReturnType<typeof getDiscordNotificationState>>["connection"];
}) {
  if (!connection || connection.status === "unlinked") {
    return (
      <div className="flex flex-col gap-4 rounded-md bg-background p-4 sm:flex-row sm:items-center">
        <LinkIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Discord 계정이 연동되지 않았어요</p>
          <p className="text-sm text-muted-foreground">알림을 받으려면 Discord 계정을 연동해주세요.</p>
        </div>
        <Button to="/notifications/discord/start" variant="primary" size="sm">
          연동하기
        </Button>
      </div>
    );
  }

  if (connection.status === "pending") {
    return (
      <div className="flex flex-col gap-4 rounded-md bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200 sm:flex-row sm:items-center">
        <ArrowPathIcon className="size-5 shrink-0 animate-spin" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Discord 계정을 확인하고 있어요</p>
          <p className="text-sm opacity-80">확인이 끝나면 알림 설정을 저장할 수 있어요.</p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="unlink" />
          <Button type="submit" variant="danger-subtle" size="sm">
            연동 취소
          </Button>
        </Form>
      </div>
    );
  }

  if (connection.status === "failed") {
    return (
      <div className="flex flex-col gap-4 rounded-md bg-destructive/10 p-4 text-destructive sm:flex-row sm:items-center">
        <XCircleIcon className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Discord 연동을 확인하지 못했어요</p>
          <p className="text-sm opacity-80">다시 연동하거나 잠시 후 시도해주세요.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button to="/notifications/discord/start" size="sm">
            다시 연동
          </Button>
          <Form method="post">
            <input type="hidden" name="intent" value="unlink" />
            <Button type="submit" variant="danger-subtle" size="sm">
              연동 해제
            </Button>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md bg-background p-4 sm:flex-row sm:items-center">
      <CheckCircleIcon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Discord 연동됨</p>
        <p className="text-sm text-muted-foreground">연동된 Discord로 알림을 보내요.</p>
      </div>
      <Form method="post">
        <input type="hidden" name="intent" value="unlink" />
        <Button type="submit" variant="danger-subtle" size="sm">
          연동 해제
        </Button>
      </Form>
    </div>
  );
}

export default function Notifications() {
  const { state, notice } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save";
  const isActive = state.connection?.status === "active";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-6 md:px-6">
      <Title text="알림 설정" />
      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
      {actionData?.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionData.error}
        </div>
      ) : null}

      <SectionCard title="Discord 계정 연동" description="알림을 받을 Discord 계정을 연결해주세요.">
        <ConnectionSection connection={state.connection} />
      </SectionCard>

      <Form method="post" className="space-y-6">
        <SectionCard
          title="알림 설정"
          description={isActive ? "받고 싶은 알림과 시간을 선택해주세요." : "Discord 연동을 완료하면 설정할 수 있어요."}
        >
          <fieldset
            disabled={!isActive}
            className={`space-y-5 ${isActive ? "" : "rounded-md bg-muted/40 p-4 text-muted-foreground"}`}
          >
            <div className="grid gap-1 sm:grid-cols-2">
              <Toggle name="eventStartEnabled" label="이벤트 시작" initialState={state.settings.eventStartEnabled} />
              <Toggle name="eventEndEnabled" label="이벤트 종료" initialState={state.settings.eventEndEnabled} />
              <Toggle
                name="rewardExchangeEndEnabled"
                label="보상 교환 종료"
                initialState={state.settings.rewardExchangeEndEnabled}
              />
              <Toggle
                name="recruitmentStartEnabled"
                label="학생 모집 시작"
                initialState={state.settings.recruitmentStartEnabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                <span>알림 시점</span>
                <select
                  name="timingMode"
                  defaultValue={state.settings.timingMode}
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="day-before">하루 전</option>
                  <option value="same-day">당일</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>알림 시간 (KST)</span>
                <select
                  name="kstHour"
                  defaultValue={state.settings.kstHour}
                  className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {KST_HOURS.map((hour) => (
                    <option key={`kst-hour-${hour}`} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="submit" name="intent" value="save" variant="primary" disabled={!isActive || isSaving}>
            <BellAlertIcon className="size-4" />
            {isSaving ? "저장 중..." : "알림 설정 저장"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
