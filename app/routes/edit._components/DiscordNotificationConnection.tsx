import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { FaDiscord } from "react-icons/fa6";
import { Form } from "react-router";
import type { DiscordProfileFeedback } from "~/components/features/auth/discord-profile-feedback";
import { Button, SectionCard } from "~/components/primitives";
import type { DiscordConnection } from "~/models/discord-notifications.server";
import { cn } from "~/lib/utils";

type DiscordNotificationConnectionProps = {
  connection: DiscordConnection | null;
  notice?: DiscordProfileFeedback | null;
  error?: string;
  isSubmitting: boolean;
};

function ConnectionStatus({ connection }: { connection: DiscordConnection | null }) {
  const status = connection?.status ?? "none";
  const label =
    status === "pending"
      ? "연결 확인 중"
      : status === "active"
        ? "연결됨"
        : status === "failed"
          ? "연결 실패"
          : "연결되지 않음";

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm",
        status === "active" ? "text-emerald-700 dark:text-emerald-300" : null,
        status === "failed" ? "text-destructive" : null,
        status !== "active" && status !== "failed" ? "text-muted-foreground" : null,
      )}
    >
      {status === "pending" ? <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {status === "active" ? <CheckCircleIcon className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </p>
  );
}

function ConnectionAction({
  connection,
  isSubmitting,
}: Pick<DiscordNotificationConnectionProps, "connection" | "isSubmitting">) {
  if (connection?.status === "pending" || connection?.status === "active") {
    return (
      <Form
        method="post"
        onSubmit={(event) => {
          if (
            connection.status === "active" &&
            !window.confirm("연결을 끊으면 모든 알림을 받을 수 없어요. 정말 연결을 끊을까요?")
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="discord-unlink" />
        <Button
          type="submit"
          size="sm"
          variant={connection.status === "active" ? "danger-subtle" : "secondary"}
          disabled={isSubmitting}
        >
          {connection.status === "pending" ? "연결 취소" : "연결 해제"}
        </Button>
      </Form>
    );
  }

  return (
    <Form method="post" action="/auth/discord/notifications/connect">
      <input type="hidden" name="intent" value="notification-connect" />
      <Button type="submit" size="sm" variant="primary" disabled={isSubmitting}>
        {connection?.status === "failed" ? "다시 시도" : "연결"}
      </Button>
    </Form>
  );
}

export default function DiscordNotificationConnection({
  connection,
  notice,
  error,
  isSubmitting,
}: DiscordNotificationConnectionProps) {
  return (
    <div id="discord-notifications" className="scroll-mt-[var(--mobile-header-height)] lg:scroll-mt-4">
      <SectionCard title="알림 수단">
        <div className="space-y-3">
          {notice?.area === "notification" ? (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                notice.tone === "success"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              {notice.text}
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-3 rounded-md bg-background px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <FaDiscord className="size-5" color="#5865F2" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">Discord</p>
                <ConnectionStatus connection={connection} />
              </div>
            </div>
            <div className="flex shrink-0 sm:justify-end">
              <ConnectionAction connection={connection} isSubmitting={isSubmitting} />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
