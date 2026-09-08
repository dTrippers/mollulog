import { BellAlertIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { FaDiscord } from "react-icons/fa6";
import { Button, SectionCard } from "~/components/primitives";

type DiscordConnection = {
  status: "pending" | "active" | "failed";
} | null;

type WebPushConfig = {
  channelStatus: "active" | "disabled" | "failed" | null;
};

type NotificationChannelCardProps = {
  connection: DiscordConnection;
  webPush: WebPushConfig;
};

function SummaryState({ connected }: { connected: boolean }) {
  return (
    <p
      className={
        connected
          ? "flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"
          : "text-sm text-muted-foreground"
      }
    >
      {connected ? <CheckCircleIcon className="size-3.5" aria-hidden="true" /> : null}
      {connected ? "연결됨" : "연결 안 됨"}
    </p>
  );
}

function DiscordSummaryRow({ connection }: { connection: DiscordConnection }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-md bg-background px-4 py-3">
      <FaDiscord className="size-5 shrink-0" color="#5865F2" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Discord</p>
        <SummaryState connected={connection?.status === "active"} />
      </div>
    </div>
  );
}

function BrowserPushSummaryRow({ channelStatus }: { channelStatus: WebPushConfig["channelStatus"] }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-md bg-background px-4 py-3">
      <BellAlertIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">브라우저 알림</p>
        <SummaryState connected={channelStatus === "active"} />
      </div>
    </div>
  );
}

export default function NotificationChannelCard({ connection, webPush }: NotificationChannelCardProps) {
  return (
    <SectionCard
      title="알림 수단"
      description="프로필 관리 페이지에서 알림 수단을 연결/해제할 수 있어요"
      action={
        <Button to="/edit#notification-channels" size="sm" variant="secondary">
          프로필 관리
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <DiscordSummaryRow connection={connection} />
        <BrowserPushSummaryRow channelStatus={webPush.channelStatus} />
      </div>
    </SectionCard>
  );
}
