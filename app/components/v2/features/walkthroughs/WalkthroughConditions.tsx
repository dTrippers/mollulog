import { BoltIcon } from "@heroicons/react/16/solid";
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import { cn } from "~/lib/utils";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";

const stripeColorClassName = {
  red: "bg-v2-attr-red",
  yellow: "bg-v2-attr-yellow",
  green: "bg-v2-attr-green",
  blue: "bg-v2-attr-blue",
  purple: "bg-v2-attr-purple",
  grey: "bg-v2-attr-grey",
} as const;

function Stripe({ color, text }: { color: keyof typeof stripeColorClassName; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden="true" className={cn("h-3 w-0.5 shrink-0 rounded-full", stripeColorClassName[color])} />
      <span>{text}</span>
    </span>
  );
}

export function WalkthroughAutoBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-v2-success-subtle px-1.5 py-0.5 text-xs font-semibold text-v2-success">
      <BoltIcon className="size-3.5" aria-hidden="true" />
      오토
    </span>
  );
}

// The battle conditions of a guide: terrain, defense type, difficulty, and the 오토 mark.
export function WalkthroughConditions({
  timeline,
  className,
}: {
  timeline: Pick<WalkthroughTimelineRecord, "terrain" | "defenseType" | "maxDifficulty" | "isAuto">;
  className?: string;
}) {
  const defenseColor = defenseTypeColor[timeline.defenseType] as keyof typeof stripeColorClassName;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-v2-fg-secondary", className)}>
      {timeline.isAuto ? <WalkthroughAutoBadge /> : null}
      <Stripe color="grey" text={terrainLocale[timeline.terrain]} />
      <Stripe
        color={defenseColor in stripeColorClassName ? defenseColor : "grey"}
        text={defenseTypeLocale[timeline.defenseType]}
      />
      <Stripe color="grey" text={difficultyLocale[timeline.maxDifficulty]} />
    </p>
  );
}

// The boss name on its image, faded in from the right.
export function WalkthroughBossBanner({ bossUid, bossName }: { bossUid: string; bossName: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-md bg-v2-inset px-3 py-4">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat opacity-70"
        style={{ backgroundImage: `url(${bossImageUrl(bossUid)})` }}
      />
      <p className="relative text-sm font-semibold text-v2-fg">{bossName ?? "보스 정보 확인 불가"}</p>
    </div>
  );
}
