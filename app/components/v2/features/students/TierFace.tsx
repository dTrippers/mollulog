import { StarIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";

/** The accessible meaning of a tier: "3성" for a star tier, "고유무기 2" for an exclusive weapon level. */
export function tierMeaning(tier: number): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

/** A yellow star with the tier up to 5, then the exclusive weapon icon with its level. */
export function TierFace({ tier, iconClassName = "size-3.5" }: { tier: number; iconClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {tier <= 5 ? (
        <StarIcon className={cn(iconClassName, "shrink-0 text-v2-star")} aria-hidden="true" />
      ) : (
        <img src="/icons/exclusive_weapon.png" alt="" className={cn(iconClassName, "shrink-0")} />
      )}
      {tier <= 5 ? tier : tier - 5}
    </span>
  );
}
