import { HeartIcon as OutlineHeartIcon, ShieldCheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import { formatFavoriteCount, formatThousands } from "~/domain/futures/futures-view-model";
import { communityLevelLabels, type RecruitVerdict, recruitVerdictLabel } from "~/domain/recruit-recommendation";
import type { RecruitGoal } from "~/domain/recruit-recommendation";
import { cn } from "~/lib/utils";
import { bossImageUrl } from "~/models/assets";
import type { RecruitGrowthTier } from "~/models/recruit-recommendation-contract";
import { v2FocusRing } from "../../layout/styles";
import { Skeleton } from "../../primitives/Skeleton";
import { useImageFailure } from "../../primitives/use-image-failure";
import { TierFace, tierMeaning } from "../students/TierFace";
import type { RecruitPickupFavorite } from "./types";

/** The growth tier on the 1–9 scale of `TierFace`: stars up to 5, then the exclusive weapon levels. */
export function growthTierValue({ tier, weaponTier }: RecruitGrowthTier): number {
  return weaponTier === null ? tier : 5 + weaponTier;
}

export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const bossIconSizeClassName = { sm: "size-5", md: "size-[1.375rem]", lg: "size-7" } as const;

// A boss's round image. A boss without an image, or one that fails to load, shows the raid icon instead.
export function BossIcon({ bossUid, bossName, size }: { bossUid: string; bossName: string; size: "sm" | "md" | "lg" }) {
  const image = useImageFailure(bossImageUrl(bossUid));
  const frameClassName = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-v2-inset text-v2-fg-tertiary",
    bossIconSizeClassName[size],
  );
  if (image.failed) {
    return (
      <span role="img" aria-label={bossName} title={bossName} className={frameClassName}>
        <ShieldCheckIcon className="size-[62%]" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={frameClassName} title={bossName}>
      <img
        ref={image.ref}
        src={bossImageUrl(bossUid)}
        alt={bossName}
        loading="lazy"
        decoding="async"
        onError={image.onError}
        onLoad={image.onLoad}
        className={cn("size-full object-cover object-[50%_30%]", !image.loaded && "opacity-0")}
      />
    </span>
  );
}

const verdictToneClassName: Record<"top" | "high" | "special" | "use", string> = {
  top: "bg-v2-accent-solid text-v2-on-accent-solid",
  high: "bg-v2-accent-subtle text-v2-accent",
  special: "bg-v2-inset text-v2-fg",
  use: "bg-v2-inset text-v2-fg-secondary",
};

function verdictTone(goal: RecruitGoal, verdict: RecruitVerdict): keyof typeof verdictToneClassName {
  if (verdict.kind === "general" && verdict.level === 2) return goal === "top" ? "top" : "high";
  if (verdict.kind === "boss" && verdict.level === 2) return "special";
  return "use";
}

// The verdict's name in a pill: 최우선 stands out, 우선 a step below, the boss picks and 여유 시 stay neutral.
export function VerdictPill({ goal, verdict }: { goal: RecruitGoal; verdict: RecruitVerdict }) {
  const label = recruitVerdictLabel(goal, verdict);
  if (label === null) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded px-2 text-[0.8125rem] font-semibold whitespace-nowrap",
        verdictToneClassName[verdictTone(goal, verdict)],
      )}
    >
      {label}
    </span>
  );
}

// The 미래시 and 모집 추천 mark of a student the goal recommends.
export function AiRecommendedMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap">
      <SparklesIcon className="size-3 shrink-0 text-v2-accent" aria-hidden="true" />
      <span className="bg-v2-ai-gradient bg-clip-text text-transparent">AI 추천</span>
    </span>
  );
}

// The community rating as three neutral dots and its name. Null is a student the community sources do not agree on.
export function CommunityLevel({
  level,
  dotClassName = "w-4",
}: {
  level: 0 | 1 | 2 | null;
  dotClassName?: string;
}) {
  if (level === null) {
    return <span className="text-xs text-v2-fg-tertiary">평가 부족</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex gap-0.5">
        {[0, 1, 2].map((step) => (
          <i
            key={step}
            className={cn("h-1.5 rounded-full", dotClassName, step <= level ? "bg-v2-fg-secondary" : "bg-v2-inset")}
          />
        ))}
      </span>
      <span className="text-[0.8125rem] font-semibold whitespace-nowrap text-v2-fg">{communityLevelLabels[level]}</span>
    </span>
  );
}

// The most common growth tier, a neutral bar of its share, and the share below. The bar grows with a wide tile.
export function GrowthSummary({ modal }: { modal: (RecruitGrowthTier & { share: number }) | null }) {
  if (modal === null) {
    return <span className="text-xs leading-4 text-v2-fg-secondary">표본 부족</span>;
  }
  const tier = growthTierValue(modal);
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-v2-fg" aria-label={tierMeaning(tier)}>
          <TierFace tier={tier} iconClassName="size-4" />
        </span>
        <span
          aria-hidden="true"
          className="relative h-1.5 w-11 rounded-full bg-v2-inset @lg:w-auto @lg:max-w-40 @lg:flex-1"
        >
          <i
            className="absolute inset-y-0 left-0 rounded-full bg-v2-fg-tertiary"
            style={{ width: formatShare(modal.share) }}
          />
        </span>
      </span>
      <span className="mt-1 block text-xs leading-4 font-semibold text-v2-fg tabular-nums">{formatShare(modal.share)}</span>
    </>
  );
}

// The favorite toggle of a tile or a chip: a heart with the public count. The own state is unknown while it loads or
// after it failed, so the heart stays empty and the button is off. A guest's press opens the sign-in prompt.
export function FavoriteToggle({
  favorite,
  studentLabel,
  size = "md",
  className,
}: {
  favorite: RecruitPickupFavorite;
  studentLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const known = favorite.ownState === "ready";
  const favorited = known && favorite.favorited;
  const disabled = favorite.ownState === "pending" || favorite.ownState === "unavailable";
  const countText = favorite.count !== null && favorite.count > 0 ? formatFavoriteCount(favorite.count) : null;
  const countName = favorite.count === null ? "" : `, ${formatThousands(favorite.count)}명 등록`;
  const Heart = favorited ? SolidHeartIcon : OutlineHeartIcon;
  return (
    <button
      type="button"
      aria-pressed={known ? favorited : undefined}
      aria-label={`${studentLabel} ${favorited ? "관심 학생에서 해제" : "관심 학생에 등록"}${countName}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        favorite.onToggle(!favorited);
      }}
      className={cn(
        "relative z-10 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md font-semibold whitespace-nowrap tabular-nums disabled:cursor-not-allowed disabled:opacity-50 v2-interaction-transition",
        size === "md" ? "h-7 px-2 text-xs" : "h-6 px-1.5 text-[0.6875rem]",
        favorited ? "bg-v2-danger-subtle text-v2-fg" : "bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover",
        v2FocusRing,
        className,
      )}
    >
      {favorite.ownState === "pending" ? (
        <Skeleton className={cn("rounded-full bg-v2-divider", size === "md" ? "size-3" : "size-2.5")} />
      ) : (
        <Heart
          className={cn(size === "md" ? "size-4" : "size-3.5", "shrink-0", favorited && "text-v2-favorite")}
          strokeWidth={favorited ? undefined : 2}
          aria-hidden="true"
        />
      )}
      {countText ? <span aria-hidden="true">{countText}</span> : null}
    </button>
  );
}
