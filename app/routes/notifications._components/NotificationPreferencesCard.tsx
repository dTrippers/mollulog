import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";
import { Form } from "react-router";
import { Button, Dropdown, Field, SectionCard, Toggle } from "~/components/primitives";
import type { DiscordNotificationSettingsInput } from "~/domain/discord-notifications";

const TIMING_MODE_OPTIONS = [
  { value: "day-before" as const, label: "하루 전" },
  { value: "same-day" as const, label: "당일" },
];
const KST_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, "0")}:00`,
}));

type NotificationPreferencesCardProps = {
  settings: DiscordNotificationSettingsInput;
  error?: string;
  isSaving: boolean;
  savedAt?: string;
};

export default function NotificationPreferencesCard({
  settings,
  error,
  isSaving,
  savedAt,
}: NotificationPreferencesCardProps) {
  const [timingMode, setTimingMode] = useState(settings.timingMode);
  const [kstHour, setKstHour] = useState(String(settings.kstHour));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setTimingMode(settings.timingMode);
    setKstHour(String(settings.kstHour));
  }, [settings.kstHour, settings.timingMode]);

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
    <SectionCard title="받을 알림">
      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <Form method="post" className="space-y-6" onChange={markDirty}>
        <input type="hidden" name="intent" value="save" />
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
        </div>

        <div className="space-y-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="알림 시점" containerClassName="space-y-3">
              <Dropdown
                value={timingMode}
                options={TIMING_MODE_OPTIONS}
                size="md"
                fullWidth
                onChange={(value) => {
                  setTimingMode(value);
                  markDirty();
                }}
              />
            </Field>
            <input type="hidden" name="timingMode" value={timingMode} />
            <Field label="시간" containerClassName="space-y-3">
              <Dropdown
                value={kstHour}
                options={KST_HOUR_OPTIONS}
                size="md"
                fullWidth
                onChange={(value) => {
                  setKstHour(value);
                  markDirty();
                }}
              />
            </Field>
            <input type="hidden" name="kstHour" value={kstHour} />
          </div>
          {timingMode === "same-day" ? (
            <p className="text-xs text-muted-foreground">
              설정 시간이 실제 일정 시각보다 늦으면 당일 알림이 전송되지 않습니다.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="primary" disabled={!isDirty || isSaving} className="min-w-24">
            {isSaving ? <ArrowPathIcon className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSaved && !isDirty && !isSaving ? <CheckCircleIcon className="size-4" aria-hidden="true" /> : null}
            {isSaving ? "저장 중..." : isSaved && !isDirty ? "저장 완료" : "저장"}
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
