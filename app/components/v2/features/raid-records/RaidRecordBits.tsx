import type { RaidRecordDefenseType, RaidRecordRankStatus, RaidRecordServer } from "~/domain/raid-record";
import { cn } from "~/lib/utils";
import { defenseTypeLocale, terrainLocale } from "~/locales/ko";
import type { Terrain } from "~/models/content.d";
import { formatRaidSeasonPeriod, RAID_RECORD_SERVER_SHORT_LABEL } from "./raid-record-format";

// Spelled out so Tailwind sees every class.
const DEFENSE_STRIPE_CLASS: Record<RaidRecordDefenseType, string> = {
  light: "bg-v2-attr-red",
  heavy: "bg-v2-attr-yellow",
  special: "bg-v2-attr-blue",
  elastic: "bg-v2-attr-purple",
  composite: "bg-v2-attr-green",
  normal: "bg-v2-attr-grey",
};

export function DefenseTypeLabel({ defenseType, className }: { defenseType: RaidRecordDefenseType; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span aria-hidden="true" className={cn("h-3 w-0.5 rounded-full", DEFENSE_STRIPE_CLASS[defenseType])} />
      {defenseTypeLocale[defenseType]}
    </span>
  );
}

export function LiveLabel() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-v2-live">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-v2-live" />
      진행 중
    </span>
  );
}

// "#88 예로니무스", and on the Japanese server the matching Korean season: "#94 악몽 열차 · 한국 #91".
export function RaidSeasonTitle({
  server,
  seasonIndex,
  counterpartSeasonIndex,
  bossName,
  ongoing,
  className,
}: {
  server: RaidRecordServer;
  seasonIndex: number;
  counterpartSeasonIndex: number | null;
  bossName: string;
  ongoing: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      <span className="min-w-0 truncate">
        <span className="tabular-nums">#{seasonIndex}</span> {bossName}
      </span>
      {server === "jp" && counterpartSeasonIndex !== null ? (
        <span className="text-xs font-normal whitespace-nowrap text-v2-fg-tertiary tabular-nums">
          {RAID_RECORD_SERVER_SHORT_LABEL.kr} #{counterpartSeasonIndex}
        </span>
      ) : null}
      {ongoing ? <LiveLabel /> : null}
    </span>
  );
}

// "실내 · 경장갑 · 11/17 ~ 11/24"
export function RaidSeasonMeta({
  terrain,
  defenseTypes,
  startAt,
  endAt,
  timeZone,
  className,
}: {
  terrain?: Terrain | null;
  defenseTypes: readonly RaidRecordDefenseType[];
  startAt: string;
  endAt: string | null;
  timeZone: string;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-v2-fg-secondary", className)}>
      {terrain ? <span>{terrainLocale[terrain]}</span> : null}
      {defenseTypes.map((defenseType) => (
        <DefenseTypeLabel key={defenseType} defenseType={defenseType} />
      ))}
      <span className="tabular-nums whitespace-nowrap">{formatRaidSeasonPeriod(startAt, endAt, timeZone)}</span>
    </span>
  );
}

export const RANK_STATUS_LABEL: Record<RaidRecordRankStatus, string> = {
  provisional: "잠정",
  confirmed: "확정",
  missing: "순위 미입력",
};

export function RankStatusPill({ status, className }: { status: RaidRecordRankStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center rounded px-1.5 text-xs font-semibold whitespace-nowrap",
        status === "provisional" && "bg-v2-warning-subtle text-v2-fg",
        status === "confirmed" && "bg-v2-success-subtle text-v2-success",
        status === "missing" && "bg-v2-inset font-medium text-v2-fg-tertiary",
        className,
      )}
    >
      {RANK_STATUS_LABEL[status]}
    </span>
  );
}
