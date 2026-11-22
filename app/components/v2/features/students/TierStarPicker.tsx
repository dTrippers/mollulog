import { StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { cn } from "~/lib/utils";

// The meaning a screen reader announces: "5성" for a star tier, "고유무기 2" for an exclusive weapon level.
export function getTierMeaning(tier: number): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

/**
 * One row of growth tiers to pick from: yellow stars up to 5, then the exclusive weapon levels. Tiers up to the value
 * are filled. Tiers below the initial tier cannot be picked. A pick applies at once, so the row has no save button.
 */
export function TierStarPicker({
  value,
  min,
  max,
  initialTier,
  disabled = false,
  onPick,
}: {
  value: number | null;
  min: number;
  max: number;
  initialTier: number;
  disabled?: boolean;
  onPick: (tier: number) => void;
}) {
  return (
    <fieldset className="flex items-center" aria-label="성급 선택">
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((tier) => {
        const Icon = value !== null && tier <= value ? StarIconSolid : StarIconOutline;
        const selectable = tier >= initialTier;
        return (
          <button
            key={tier}
            type="button"
            aria-label={getTierMeaning(tier)}
            aria-pressed={value === tier}
            disabled={disabled || !selectable}
            onClick={() => onPick(tier)}
            className={cn(
              "inline-flex h-7 w-6 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus disabled:cursor-default disabled:opacity-40",
              tier === 5 && "mr-1",
              tier <= 5 ? "text-v2-star" : "text-v2-perk",
              value === null || tier > value ? "opacity-50 hover:opacity-100 v2-interaction-transition" : "",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </button>
        );
      })}
    </fieldset>
  );
}
