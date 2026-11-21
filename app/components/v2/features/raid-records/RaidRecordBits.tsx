import {
  RAID_RANK_TIERS,
  type RaidRankTier,
  type RaidRankTierCounts,
  type RaidRecordDefenseType,
  type RaidRecordRaidType,
  type RaidRecordRankStatus,
  type RaidRecordServer,
  raidRankTier,
} from "~/domain/raid-record";
import { useImageFailure } from "~/components/v2/primitives/use-image-failure";
import { cn } from "~/lib/utils";
import { defenseTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
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

const RAID_RANK_TIER_LABEL: Record<RaidRankTier, string> = {
  platinum: "플래티넘",
  gold: "골드",
  silver: "실버",
  bronze: "브론즈",
};

// The in-game badge of the reward tier the rank falls in, shown beside the rank. Nothing for a rank without a tier.
export function RaidRankTierBadge({
  server,
  raidType,
  seasonIndex,
  rank,
  className,
}: {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  rank: number | null;
  className?: string;
}) {
  const tier = rank === null ? null : raidRankTier(server, raidType, seasonIndex, rank);
  if (!tier) return null;
  return (
    <img
      src={`/icons/raid-tier-${tier}.png`}
      alt={RAID_RANK_TIER_LABEL[tier]}
      title={RAID_RANK_TIER_LABEL[tier]}
      width={96}
      height={73}
      className={cn("h-5 w-auto shrink-0", className)}
    />
  );
}

// How many of the shown records reached each tier, with the in-game badges. A tier no record reached stays in place,
// dimmed, so the four tiers always line up.
export function RaidRankTierSummary({ counts, provisionalCount }: RaidRankTierCounts) {
  return (
    <section aria-labelledby="raid-rank-tier-summary-title" className="rounded-lg bg-v2-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 id="raid-rank-tier-summary-title" className="text-sm font-semibold text-v2-fg">
          트로피
        </h3>
        {provisionalCount > 0 ? (
          <p className="text-xs text-v2-fg-tertiary tabular-nums">
            잠정 순위 {provisionalCount.toLocaleString("ko-KR")}개 포함
          </p>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-2">
        {RAID_RANK_TIERS.map((tier) => (
          <div key={tier} className="flex flex-col items-center text-center">
            <dt className="flex flex-col items-center gap-1 text-xs text-v2-fg-secondary">
              <img
                src={`/icons/raid-tier-${tier}.png`}
                alt=""
                aria-hidden="true"
                width={96}
                height={73}
                className={cn("h-8 w-auto", counts[tier] === 0 && "opacity-40")}
              />
              {RAID_RANK_TIER_LABEL[tier]}
            </dt>
            <dd
              className={cn(
                "text-base font-bold tabular-nums",
                counts[tier] === 0 ? "text-v2-fg-tertiary" : "text-v2-fg",
              )}
            >
              {counts[tier].toLocaleString("ko-KR")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The boss image as a full-height background on the right that fades out toward the text on the left, like the
// season list of the raid pages. The image fades by its own mask rather than a gradient over it, so it sits on any
// background, such as a row that tints while one of its inputs has focus. The parent is `relative overflow-hidden`, and
// its content sits above this with `relative`.
export function RaidBossBackdrop({ bossUid, className }: { bossUid: string; className?: string }) {
  const src = bossImageUrl(bossUid);
  // A new boss can have no image yet; the row then goes without a backdrop rather than a broken image frame.
  const image = useImageFailure(src);
  if (image.failed) return null;
  return (
    <img
      ref={image.ref}
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={image.onError}
      className={cn(
        "pointer-events-none absolute top-0 right-0 h-full w-3/5 object-cover object-[50%_35%] opacity-55 raid-boss-backdrop-mask",
        className,
      )}
    />
  );
}
