import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import { FaDiscord } from "react-icons/fa6";
import { Button, SectionCard } from "~/components/primitives";

type DiscordConnection = {
  status: "pending" | "active" | "failed";
} | null;

type NotificationChannelCardProps = {
  connection: DiscordConnection;
};

export default function NotificationChannelCard({ connection }: NotificationChannelCardProps) {
  const status =
    connection?.status === "pending"
      ? "연결 확인 중"
      : connection?.status === "active"
        ? "연결됨"
        : connection?.status === "failed"
          ? "연결 실패"
          : "연결되지 않음";

  return (
    <SectionCard title="등록된 알림 수단" description="프로필 관리 페이지에서 알림 수단을 연결/해제할 수 있어요">
      <div className="flex min-h-12 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
          <FaDiscord className="size-5" color="#5865F2" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Discord</p>
          <p
            className={`flex items-center gap-1.5 text-sm ${
              connection?.status === "active"
                ? "text-emerald-700 dark:text-emerald-300"
                : connection?.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {connection?.status === "pending" ? (
              <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {connection?.status === "active" ? <CheckCircleIcon className="size-3.5" aria-hidden="true" /> : null}
            {status}
          </p>
        </div>
        <Button to="/edit#discord-notifications" size="sm" variant="secondary">
          프로필 관리
        </Button>
      </div>
    </SectionCard>
  );
}
