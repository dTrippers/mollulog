import { ArrowTopRightOnSquareIcon, CheckIcon, ClockIcon } from "@heroicons/react/16/solid";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { type CouponDeadline, getCouponDeadline, isCouponExpired } from "~/domain/coupon-view";
import { cn } from "~/lib/utils";
import { uploadedImageProps } from "~/models/assets";
import type { CouponView } from "~/views/coupons.server";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Dialog } from "../../primitives/Dialog";
import { ResourceThumb } from "../resources/ResourceThumb";
import { CouponCodeField } from "./CouponCodeField";

export type CouponCardRecord =
  // Guests see no record controls.
  { kind: "hidden" } | { kind: "editable"; recorded: boolean; pending: boolean; onToggle: () => void };

type CouponCardProps = {
  coupon: CouponView;
  // Decides 만료됨 (expired when the screen opened) apart from a deadline that passed while it was open.
  loadedAt: string;
  now: string;
  record: CouponCardRecord;
  highlighted?: boolean;
};

export function CouponCard({ coupon, loadedAt, now, record, highlighted = false }: CouponCardProps) {
  const [imageOpen, setImageOpen] = useState(false);
  const expiredAtLoad = isCouponExpired(coupon, loadedAt);
  const expiredNow = isCouponExpired(coupon, now);
  // Once past, the deadline is read as of loading: 만료됨 when it had already passed, and the open-page
  // "사용 기한이 지났어요" line with the short date when it passed while the page was open.
  const deadline = getCouponDeadline(coupon, expiredNow ? loadedAt : now);

  return (
    <article
      data-coupon-uid={coupon.uid}
      className="relative flex h-full scroll-mt-4 flex-col overflow-hidden rounded-lg bg-v2-surface"
    >
      <div className="relative aspect-video w-full bg-v2-inset">
        {coupon.imageUrl ? (
          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className={cn("block size-full cursor-zoom-in", v2FocusRing)}
          >
            <img
              {...uploadedImageProps(coupon.imageUrl, "(min-width: 640px) 360px, 100vw")}
              alt={coupon.name}
              className="size-full object-cover"
              loading="lazy"
            />
          </button>
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-v2-fg-tertiary">이미지 없음</div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-3 pb-3.5">
        <div>
          <h3 className="text-[0.9375rem] leading-[1.45] font-semibold break-keep text-v2-fg [overflow-wrap:anywhere]">
            {coupon.name}
          </h3>
          <CouponDeadlineLine deadline={deadline} passedWhileOpen={!expiredAtLoad && expiredNow} />
        </div>

        <CouponCodeField code={coupon.code} codeType="coupon" />

        {coupon.rewards.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {coupon.rewards.map((reward) => (
              <li key={`${reward.itemUid}-${reward.quantity}`}>
                <ResourceThumb
                  itemUid={reward.itemUid}
                  name={reward.name}
                  rarity={reward.rarity}
                  quantity={reward.quantity}
                  labelPlacement="inset"
                  tooltip
                  nameTooltip
                />
              </li>
            ))}
          </ul>
        ) : null}

        {coupon.linkUrl ? (
          <a
            href={coupon.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1 self-start rounded-sm text-[0.8125rem] text-v2-fg-secondary underline decoration-v2-divider underline-offset-[3px] hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            {coupon.linkLabel ?? "관련 링크"}
            <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">새 창에서 열림</span>
          </a>
        ) : null}

        <CouponRecordControls record={record} expiredAtLoad={expiredAtLoad} expiredNow={expiredNow} />
      </div>

      {highlighted ? (
        <span
          aria-hidden="true"
          className="v2-panel-highlight pointer-events-none absolute inset-0 rounded-[inherit] bg-v2-highlight opacity-0"
        />
      ) : null}

      {coupon.imageUrl ? (
        <Dialog open={imageOpen} onClose={() => setImageOpen(false)} title={coupon.name}>
          <img
            {...uploadedImageProps(coupon.imageUrl, "(min-width: 896px) 896px, 100vw")}
            alt={coupon.name}
            className="max-h-[75vh] w-full rounded-md object-contain"
          />
        </Dialog>
      ) : null}
    </article>
  );
}

function CouponDeadlineLine({ deadline, passedWhileOpen }: { deadline: CouponDeadline; passedWhileOpen: boolean }) {
  if (deadline.kind === "none") {
    return <p className="mt-0.5 text-[0.8125rem] text-v2-fg-tertiary">사용 기한 없음</p>;
  }
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-v2-fg-tertiary">
      <span className="tabular-nums">{deadline.dateText}까지</span>
      <span aria-hidden="true" className="size-[3px] rounded-full bg-v2-fg-tertiary opacity-70" />
      {deadline.kind === "expired" ? (
        <span className="font-semibold text-v2-fg-secondary">만료됨</span>
      ) : passedWhileOpen ? (
        <span className="inline-flex items-center gap-1 font-semibold text-v2-warning">
          <ClockIcon className="size-3.5" aria-hidden="true" />
          사용 기한이 지났어요
        </span>
      ) : deadline.remaining.unit === "days" ? (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <ClockIcon className="size-3.5" aria-hidden="true" />
          {deadline.remaining.value}일 남음
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-v2-warning tabular-nums">
          <ClockIcon className="size-3.5" aria-hidden="true" />
          {deadline.remaining.value}시간 남음
        </span>
      )}
    </p>
  );
}

// Sits at the bottom of the card, so the buttons of one row line up whatever is above them.
function CouponRecordControls({
  record,
  expiredAtLoad,
  expiredNow,
}: {
  record: CouponCardRecord;
  expiredAtLoad: boolean;
  expiredNow: boolean;
}) {
  if (record.kind === "hidden") return null;
  if (record.recorded) {
    return (
      <div className="mt-auto flex gap-2 pt-1">
        <span className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-v2-success-subtle text-sm font-medium text-v2-success">
          <CheckIcon className="size-4" aria-hidden="true" />
          사용 완료로 기록함
        </span>
        {/* Nothing can be recorded or cancelled once a coupon has expired. */}
        {expiredNow ? null : (
          <Button onClick={record.onToggle} disabled={record.pending}>
            기록 취소
          </Button>
        )}
      </div>
    );
  }
  if (expiredAtLoad) return null;
  return (
    <div className="mt-auto pt-1">
      <Button onClick={record.onToggle} disabled={record.pending || expiredNow} className="w-full">
        <CheckCircleIcon className="size-4" aria-hidden="true" />
        사용 완료로 기록
      </Button>
    </div>
  );
}
