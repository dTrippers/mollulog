import { itemImageUrl } from "~/models/assets";
import type { CouponReward } from "~/models/coupon";

type CouponRewardListProps = {
  rewards: CouponReward[];
};

export default function CouponRewardList({ rewards }: CouponRewardListProps) {
  if (rewards.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {rewards.map((reward) => (
        <div key={`${reward.itemUid}-${reward.quantity}`} className="flex items-center gap-1">
          <img
            src={itemImageUrl(reward.itemUid)}
            alt={reward.itemUid}
            className="size-8 object-contain"
            loading="lazy"
          />
          <span className="text-sm text-neutral-600 dark:text-neutral-400">×{reward.quantity}</span>
        </div>
      ))}
    </div>
  );
}
