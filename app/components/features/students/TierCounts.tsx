import { Progress } from "~/components/primitives";

type TierCountsProps = {
  tierCounts: { [key: number]: number };
  totalCount?: number;
  visibleTiers: number[];
  reducePaddings?: boolean;
};

const colors: { [tier: number]: "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "fuchsia" | "pink" } = {
  1: "red",
  2: "orange",
  3: "yellow",
  4: "green",
  5: "cyan",
  6: "blue",
  7: "purple",
  8: "fuchsia",
  9: "pink",
};

export default function TierCounts({ tierCounts, visibleTiers, reducePaddings, totalCount: providedTotalCount }: TierCountsProps) {
  const totalCount = providedTotalCount ?? Object.values(tierCounts).reduce((acc, count) => acc + count, 0);
  return (
    <div className="flex">
      <div className="flex flex-col mr-4">
        {visibleTiers.map((tier) => (
          <div key={`tier-${tier}`} className={`${reducePaddings ? "py-0" : "py-1"} flex-1 flex items-center`}>
            {(tier <= 5) ?
              <span className="w-4 mr-1 inline-block text-yellow-500">★</span> :
              <img className="size-4 mr-1 inline-block" src="/icons/exclusive_weapon.png" alt="고유 장비" />}
            <span className="mr-1">{tier <= 5 ? tier : tier - 5}</span>
            <span>- {tierCounts[tier] ?? 0}명</span>
          </div>
        ))}
      </div>
      <div className="grow flex flex-col">
        {visibleTiers.map((tier) => (
          <div key={`tier-ratio-${tier}`} className={`${reducePaddings ? "py-0" : "py-1"} flex-1`}>
            <Progress ratio={totalCount > 0 ? Math.min(1, (tierCounts[tier] ?? 0) / totalCount) : 0} color={colors[tier]} />
          </div>
        ))}
      </div>
    </div>
  );
}
