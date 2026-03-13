import { useFetcher } from "react-router";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleIconSolid } from "@heroicons/react/24/solid";
import dayjs from "dayjs";
import type { Coupon } from "~/models/coupon";
import CopyField from "./CopyField";
import CouponRewardList from "./CouponRewardList";

type CouponCardProps = {
  coupon: Coupon;
  registered: boolean;
  signedIn: boolean;
};

export default function CouponCard({ coupon, registered, signedIn }: CouponCardProps) {
  const fetcher = useFetcher();

  const isExpired = coupon.expiresAt !== null && dayjs(coupon.expiresAt).isBefore(dayjs());
  const optimisticRegistered = fetcher.state !== "idle"
    ? fetcher.formMethod === "POST"
    : registered;

  const handleToggle = () => {
    if (fetcher.state !== "idle") return;
    fetcher.submit(
      { couponId: coupon.id },
      { method: optimisticRegistered ? "DELETE" : "POST" },
    );
  };

  return (
    <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-800 shadow-sm">
      {/* 만료 오버레이 */}
      {isExpired && !optimisticRegistered && (
        <div className="absolute inset-0 z-10 backdrop-blur-sm bg-white/60 dark:bg-neutral-800/60 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <ClockIcon className="size-10 text-red-400" strokeWidth={1.5} />
          <span className="font-bold text-red-500 dark:text-red-400">만료됨</span>
        </div>
      )}

      {/* 등록 완료 오버레이 */}
      {optimisticRegistered && (
        <div className="absolute inset-0 z-10 backdrop-blur-sm bg-white/60 dark:bg-neutral-800/60 flex flex-col items-center justify-center gap-2 pointer-events-none">
          <CheckCircleIconSolid className="size-10 text-green-500" />
          <span className="font-bold text-green-600 dark:text-green-400">이미 등록한 쿠폰이에요</span>
          <button
            type="button"
            onClick={handleToggle}
            disabled={fetcher.state !== "idle"}
            className={`pointer-events-auto text-xs text-neutral-500 dark:text-neutral-400 hover:underline ${fetcher.state !== "idle" ? "opacity-50 cursor-not-allowed hover:no-underline" : ""}`}
          >
            코드 다시 보기
          </button>
        </div>
      )}

      {/* 이미지 */}
      <div className="aspect-video bg-neutral-100 dark:bg-neutral-700 overflow-hidden">
        {coupon.imageUrl ? (
          <img
            src={coupon.imageUrl}
            alt={coupon.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300 dark:text-neutral-600 text-sm">
            이미지 없음
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="p-4 flex flex-col gap-3">
        {/* 이름 + 만료 */}
        <div>
          <p className="font-bold text-neutral-900 dark:text-neutral-100">{coupon.name}</p>
          {coupon.expiresAt && (
            <p className={`text-xs mt-0.5 ${isExpired ? "text-red-500" : "text-neutral-400 dark:text-neutral-500"}`}>
              {isExpired ? "만료됨" : `${dayjs(coupon.expiresAt).format("YYYY-MM-DD HH:mm")} 까지`}
            </p>
          )}
        </div>

        {/* 쿠폰 코드 + 복사 */}
        <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <CopyField text={coupon.code} />
        </div>

        {/* 보상 */}
        <CouponRewardList rewards={coupon.rewards} />

        {/* 관련 링크 */}
        {coupon.linkUrl && (
          <a
            href={coupon.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-500 hover:underline"
          >
            <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0" strokeWidth={2} />
            {coupon.linkLabel ?? "관련 링크"}
          </a>
        )}

        {/* 등록 토글 */}
        {signedIn && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={fetcher.state !== "idle"}
            className={`mt-1 w-full py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
              optimisticRegistered
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                : "bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <CheckCircleIcon className="size-4 shrink-0" strokeWidth={2} />
              등록 완료
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
