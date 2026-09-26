import { StarIcon } from "@heroicons/react/16/solid";

type StudentTierLabelProps = {
  tier: number;
};

export default function StudentTierLabel({ tier }: StudentTierLabelProps) {
  const accessibleLabel = tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}성`;

  return (
    <span className="inline-flex h-4 items-center gap-1 leading-4">
      {tier <= 5 ? (
        <StarIcon className="block size-3.5 text-yellow-500" aria-hidden="true" />
      ) : (
        <img className="block size-3.5" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
      )}
      <span aria-hidden="true" className="font-medium tabular-nums">
        {tier <= 5 ? tier : tier - 5}
      </span>
      <span className="sr-only">{accessibleLabel}</span>
    </span>
  );
}
