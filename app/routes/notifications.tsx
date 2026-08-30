import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useActionData, useLoaderData, useNavigation, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Title } from "~/components/primitives";
import {
  DiscordNotificationValidationError,
  DiscordSettingsUnavailableError,
  getDiscordNotificationState,
  parseDiscordNotificationSettingsForm,
  saveDiscordNotificationSettings,
} from "~/models/discord-notifications.server";
import NotificationChannelCard from "./notifications._components/NotificationChannelCard";
import NotificationPreferencesCard from "./notifications._components/NotificationPreferencesCard";

export const meta: MetaFunction = () => [{ title: "알림 설정 | 몰루로그" }];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return redirect("/unauthorized");

  const state = await getDiscordNotificationState(env, sensei.id, { ctx });
  return { state };
};

type ActionIntent = "save";
type ActionData = {
  intent?: ActionIntent;
  success?: boolean;
  savedAt?: string;
  error?: string;
};

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
    return data<ActionData>({ intent, success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    const expectedError =
      error instanceof DiscordSettingsUnavailableError || error instanceof DiscordNotificationValidationError;
    if (!expectedError) {
      console.error("[notifications] failed to save Discord notification settings", error);
    }
    return data<ActionData>(
      { intent, error: expectedError && error instanceof Error ? error.message : "알림 설정을 저장하지 못했어요." },
      { status: expectedError ? 400 : 500 },
    );
  }
};

export default function Notifications() {
  const { state } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submittingIntent = navigation.formData?.get("intent");
  const isSaving = navigation.state === "submitting" && submittingIntent === "save";
  const settingsActionData = actionData?.intent === "save" ? actionData : undefined;
  const globalError = actionData?.intent ? undefined : actionData?.error;
  const connectionStatus = state.connection?.status;

  useEffect(() => {
    if (connectionStatus !== "pending") return;
    const intervalId = window.setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [connectionStatus, revalidator]);

  return (
    <div className="max-w-3xl space-y-6">
      <Title text="알림 설정" />
      {globalError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{globalError}</p>
      ) : null}
      <NotificationChannelCard connection={state.connection} />
      {connectionStatus === "active" ? (
        <NotificationPreferencesCard
          settings={state.settings}
          error={settingsActionData?.error}
          isSaving={isSaving}
          savedAt={settingsActionData?.savedAt}
        />
      ) : null}
    </div>
  );
}
