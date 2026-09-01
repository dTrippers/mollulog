import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import { Form } from "react-router";
import { Button, Dropdown, Field, SectionCard, Toggle } from "~/components/primitives";
import type { DiscordNotificationSettingsInput } from "~/domain/discord-notifications";
import { cn } from "~/lib/utils";

const LEAD_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1}시간 전`,
}));

type NotificationPreferencesCardProps = {
  settings: DiscordNotificationSettingsInput;
  error?: string;
  isSaving: boolean;
  isAvailable: boolean;
  savedAt?: string;
};

export default function NotificationPreferencesCard({
  settings,
  error,
  isSaving,
  isAvailable,
  savedAt,
}: NotificationPreferencesCardProps) {
  const [leadHours, setLeadHours] = useState(String(settings.leadHours));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLeadHours(String(settings.leadHours));
  }, [settings.leadHours]);

  useEffect(() => {
    if (!savedAt) return;
    setIsDirty(false);
    setIsSaved(true);
    const timeoutId = window.setTimeout(() => setIsSaved(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [savedAt]);

  const markDirty = () => {
    setIsDirty(true);
    setIsSaved(false);
  };

  return (
    <SectionCard title="받을 알림" description="알림은 수 분 정도 지연이 발생할 수 있어요">
      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <Form method="post" onChange={markDirty}>
        <input type="hidden" name="intent" value="save" />
        <div className="relative">
          {!isAvailable ? (
            <div className="absolute inset-0 z-10 grid place-items-center" role="status">
              <p className="rounded-md bg-card/95 px-4 py-3 text-center text-sm font-medium shadow-sm">
                하나 이상의 알림 수단을 등록해주세요
              </p>
            </div>
          ) : null}
          <fieldset disabled={!isAvailable} className={cn("min-w-0 space-y-6", !isAvailable && "opacity-40")}>
            <div>
              <div className="flex min-h-14 items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-sm">이벤트 시작</p>
                  <p className="text-xs text-muted-foreground">새로운 이벤트 시작 알림</p>
                </div>
                <Toggle
                  name="eventStartEnabled"
                  initialState={settings.eventStartEnabled}
                  className="my-0 shrink-0"
                  onChange={markDirty}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-sm">이벤트 종료</p>
                  <p className="text-xs text-muted-foreground">이벤트 플레이 종료 시점 알림</p>
                </div>
                <Toggle
                  name="eventEndEnabled"
                  initialState={settings.eventEndEnabled}
                  className="my-0 shrink-0"
                  onChange={markDirty}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-sm">이벤트 보상 교환 종료</p>
                  <p className="text-xs text-muted-foreground">상점, 미션 등 이벤트 보상 획득 종료 시점 알림</p>
                </div>
                <Toggle
                  name="rewardExchangeEndEnabled"
                  initialState={settings.rewardExchangeEndEnabled}
                  className="my-0 shrink-0"
                  onChange={markDirty}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-sm">학생 모집 시작</p>
                  <p className="text-xs text-muted-foreground">관심 학생의 모집 시작 시점 알림</p>
                </div>
                <Toggle
                  name="recruitmentStartEnabled"
                  initialState={settings.recruitmentStartEnabled}
                  className="my-0 shrink-0"
                  onChange={markDirty}
                />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-4 py-1">
                <div className="min-w-0">
                  <p className="text-sm">상점 초기화 알림</p>
                  <p className="text-xs text-muted-foreground">매월 1일 상점 초기화 알림</p>
                </div>
                <Toggle
                  name="shopResetEnabled"
                  initialState={settings.shopResetEnabled}
                  className="my-0 shrink-0"
                  onChange={markDirty}
                />
              </div>
            </div>

            <Field label="알림 시점" containerClassName="space-y-3">
              <Dropdown
                value={leadHours}
                options={LEAD_HOUR_OPTIONS}
                size="md"
                fullWidth
                onChange={(value) => {
                  setLeadHours(value);
                  markDirty();
                }}
              />
            </Field>
            <input type="hidden" name="leadHours" value={leadHours} />

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!isAvailable || !isDirty || isSaving}
                className="min-w-24"
              >
                {isSaving ? <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" /> : null}
                {isSaved && !isDirty && !isSaving ? <CheckCircleIcon className="size-4" aria-hidden="true" /> : null}
                {isSaving ? "저장 중..." : isSaved && !isDirty ? "저장 완료" : "저장"}
              </Button>
            </div>
          </fieldset>
        </div>
      </Form>
    </SectionCard>
  );
}
