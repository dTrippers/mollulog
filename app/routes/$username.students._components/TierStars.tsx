import { StarIcon as SolidStarIcon } from "@heroicons/react/24/solid";

type TierStarsProps = {
  tier: number | null;
  size?: "sm" | "md";
};

const starKeys = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;

export default function TierStars({ tier, size = "sm" }: TierStarsProps) {
  if (tier == null || tier < 1) {
    return <span className="text-xs text-muted-foreground">미등록</span>;
  }

  const uniqueWeapon = tier > 5;
  const starCount = uniqueWeapon ? tier - 5 : tier;
  const label = uniqueWeapon ? `고유무기 ${starCount}성` : `${starCount}성`;

  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label} title={label}>
      {uniqueWeapon ? <img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="고유무기" /> : null}
      {starKeys.slice(0, starCount).map((starKey) => (
        <SolidStarIcon
          key={`${tier}-${starKey}`}
          className={`${size === "md" ? "size-4" : "size-3.5"} shrink-0 ${uniqueWeapon ? "text-teal-500" : "text-yellow-500"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export type { TierStarsProps };
