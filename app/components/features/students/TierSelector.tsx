import { StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";

type TierSelectorProps = {
  initialTier: number;
  currentTier: number | null;
  iconSize?: "sm" | "md";
  disabled?: boolean;
  onTierChange: (tier: number) => void;
};

export default function TierSelector({
  initialTier,
  currentTier,
  iconSize = "md",
  disabled = false,
  onTierChange,
}: TierSelectorProps) {
  const [tier, setTier] = useState(currentTier);
  const iconSizeClass = iconSize === "sm" ? "size-4" : "size-5";

  useEffect(() => {
    setTier(currentTier);
  }, [currentTier]);

  const handleTierChange = (eachTier: number) => {
    if (eachTier < initialTier) {
      return;
    }

    setTier(eachTier);
    onTierChange(eachTier);
  };

  return (
    <fieldset className="flex items-center" aria-label="성급 선택">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((eachTier) => {
        const Icon = tier !== null && eachTier <= tier ? StarIconSolid : StarIconOutline;

        const selectable = eachTier >= initialTier;
        const colorClasses = [];
        if (eachTier <= 5) {
          colorClasses.push("text-yellow-500");
          if (selectable) {
            colorClasses.push("hover:text-yellow-600 hover:scale-110");
          }
        } else {
          colorClasses.push("text-teal-500");
          if (selectable) {
            colorClasses.push("hover:text-teal-600 hover:scale-110");
          }
        }

        if (eachTier === 5) {
          colorClasses.push("mr-1");
        }
        if (tier === null || eachTier > tier) {
          colorClasses.push("opacity-25 hover:opacity-100");
        }

        return (
          <button
            key={eachTier}
            type="button"
            aria-label={eachTier <= 5 ? `${eachTier}성` : `고유무기 ${eachTier - 5}성`}
            aria-pressed={tier === eachTier}
            disabled={disabled || !selectable}
            className="inline-flex cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default"
            onClick={() => handleTierChange(eachTier)}
          >
            <Icon className={`${iconSizeClass} ${colorClasses.join(" ")} transition`} aria-hidden="true" />
          </button>
        );
      })}
    </fieldset>
  );
}
