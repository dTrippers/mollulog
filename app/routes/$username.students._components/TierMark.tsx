import { StarIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";

// The meaning a screen reader announces: "5성" up to ★5, "고유무기 2" after.
export function getTierText(tier: number): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

// What a saved-tier message calls the tier: "★4", or "고유무기 2" once the exclusive weapon is unlocked.
export function formatTierForMessage(tier: number): string {
  return tier <= 5 ? `★${tier}` : `고유무기 ${tier - 5}`;
}

// A current tier: a star and the number up to ★5, the exclusive weapon icon and its level after.
export function TierMark({ tier, className }: { tier: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", className)}>
      {tier <= 5 ? (
        <StarIcon className="size-3.5 shrink-0 text-v2-star" aria-hidden="true" />
      ) : (
        <img src="/icons/exclusive_weapon.png" alt="" className="size-3.5 shrink-0" />
      )}
      <span aria-hidden="true">{tier <= 5 ? tier : tier - 5}</span>
      <span className="sr-only">{getTierText(tier)}</span>
    </span>
  );
}
