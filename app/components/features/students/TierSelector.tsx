import { useEffect, useState } from "react";
import { StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

type TierSelectorProps = {
  initialTier: number;
  currentTier: number;
  onTierChange: (tier: number) => void;
};

export default function TierSelector({ initialTier, currentTier, onTierChange }: TierSelectorProps) {
  const [tier, setTier] = useState(currentTier);

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
    <div className="flex items-center">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((eachTier) => {
        const Icon = eachTier <= tier ? StarIconSolid : StarIconOutline;

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
        if (eachTier > tier) {
          colorClasses.push("opacity-25 hover:opacity-100");
        }

        return (
          <Icon
            key={eachTier}
            className={`size-5 ${colorClasses.join(" ")} transition`}
            onClick={() => handleTierChange(eachTier)}
          />
        );
      })}
    </div>
  );
}
