import { BellAlertIcon, CheckCircleIcon, LinkIcon, XCircleIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Button, SectionCard, Title, Toggle } from "~/components/primitives";
import {
  DiscordNotificationValidationError,
  DiscordSettingsUnavailableError,
  getDiscordNotificationState,
  parseDiscordNotificationSettingsForm,
  saveDiscordNotificationSettings,
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
  if (params.get("saved") === "1") return { tone: "success", text: "알림 설정을 저장했어요." };
  return null;
}

type ActionData = { error?: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "save") {
    return data<ActionData>({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  try {
    const settings = parseDiscordNotificationSettingsForm(formData);
    await saveDiscordNotificationSettings(env, sensei.id, settings, { ctx });
    return redirect("/notifications?saved=1");
  } catch (error) {
    const expectedError =
      error instanceof DiscordSettingsUnavailableError || error instanceof DiscordNotificationValidationError;
    const message = expectedError && error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요.";
    if (!expectedError) {
      console.error("[notifications] failed to save Discord notification settings", error);
    }
    return data<ActionData>({ error: message }, { status: expectedError ? 400 : 500 });
  }
};

function ConnectionSummary({
  connection,
}: {
  connection: Awaited<ReturnType<typeof getDiscordNotificationState>>["connection"];
}) {
  const status = connection?.status;
  const statusLabel =
    status === "pending" ? "확인 중" : status === "active" ? "활성" : status === "failed" ? "실패" : "미연결";
  const StatusIcon = status === "active" ? CheckCircleIcon : status === "failed" ? XCircleIcon : LinkIcon;
  const iconClassName =
    status === "active"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-4 rounded-md bg-background p-4 sm:flex-row sm:items-center">
      <StatusIcon className={`size-5 shrink-0 ${iconClassName}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Discord DM 알림 연결: {statusLabel}</p>
        <p className="text-sm text-muted-foreground">
          {status === "active"
            ? "설정한 조건에 따라 Discord DM을 받아요."
            : "연결과 상태는 프로필 관리에서 확인할 수 있어요."}
        </p>
      </div>
      <Button to="/edit#discord" size="sm" variant="secondary">
        연결·관리
      </Button>
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

      <SectionCard title="Discord 연결" description="Discord 연결과 계정 관리는 프로필에서 할 수 있어요.">
        <ConnectionSummary connection={state.connection} />
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
