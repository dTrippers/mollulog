import { StarIcon } from "@heroicons/react/16/solid";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { StudentThumbList } from "~/components/v2/features/students/StudentThumbList";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { getTierMeaning } from "~/components/v2/features/students/TierInput";
import { HintChip } from "~/components/v2/primitives/HintChip";
import { RECRUIT_TICKET_KIND_COPY, type RecruitTicketCard as RecruitTicketCardData } from "~/domain/recruit-tickets";
import type { UtcIsoString } from "~/lib/date-time";
import { formatRecruitTicketPeriod, formatRecruitTicketUsableUntil } from "./recruit-ticket-format";

// A long list shows this many cells, the last one being the "+n" tile: two rows of five on a phone.
const VISIBLE_CELLS = 10;
const UNRECRUITED_LABEL = "미모집";
const TARGETS_NOTICE = "대상 학생이 바뀔 수 있어요.";
const metaLabelClassName =
  "inline-flex h-5 shrink-0 items-center rounded-sm bg-v2-inset px-1.5 text-xs font-semibold text-v2-fg-secondary";

type RecruitTicketCardProps = {
  card: RecruitTicketCardData;
  timeZone: string;
  now: UtcIsoString;
};

export function RecruitTicketCard({ card, timeZone, now }: RecruitTicketCardProps) {
  const [expanded, setExpanded] = useState(false);
  const kind = RECRUIT_TICKET_KIND_COPY[card.kind];
  const period = formatRecruitTicketPeriod(card.periodStartAt, card.periodEndAt, timeZone, now);
  const usableUntil = card.usableUntil ? formatRecruitTicketUsableUntil(card.usableUntil, timeZone, now) : null;
  const hiddenCount =
    expanded || card.students.length <= VISIBLE_CELLS ? 0 : card.students.length - (VISIBLE_CELLS - 1);
  const visible = hiddenCount > 0 ? card.students.slice(0, VISIBLE_CELLS - 1) : card.students;

  return (
    <section aria-label={card.title} className="rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex items-start gap-3">
        <ResourceThumb itemUid={card.iconItemUid} imageUrl={card.iconUrl ?? undefined} size="card" />
        <div className="min-w-0 flex-1">
          {/* The type chip follows the title, and wraps with it on a narrow card. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em] break-keep text-v2-fg">
              {card.title}
            </h3>
            <HintChip variant="chip" label={kind.label} description={kind.description} />
          </div>
          {/* The product and the period each take their own line; a card outside products shows how long it is usable. */}
          <dl className="mt-1 space-y-1 text-[0.8125rem] leading-5 text-v2-fg-secondary empty:hidden">
            {card.product ? (
              <div className="flex items-start gap-2">
                <dt className={metaLabelClassName}>상품</dt>
                <dd className="min-w-0 break-keep">{card.product.name}</dd>
              </div>
            ) : null}
            {period ? (
              <div className="flex items-start gap-2">
                <dt className={metaLabelClassName}>기간</dt>
                <dd className="tabular-nums">{period}</dd>
              </div>
            ) : null}
            {usableUntil ? (
              <div className="flex items-start gap-2">
                <dt className={metaLabelClassName}>사용 기한</dt>
                <dd className="tabular-nums">{usableUntil}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
      <StudentThumbList className="mt-3">
        {visible.map((student) => {
          const { name, variant } = splitVisibleStudentName(student.name);
          return (
            <li key={student.uid}>
              <StudentThumb
                studentUid={student.uid}
                name={name}
                variant={variant}
                recruitmentLabel={student.unrecruited ? UNRECRUITED_LABEL : undefined}
                scrimLabel={student.tier !== null ? <TierLabel tier={student.tier} /> : undefined}
                captionPlacement="overlay"
                overlayOnMobile
              />
              {student.unrecruited ? <span className="sr-only">, {UNRECRUITED_LABEL}</span> : null}
              {student.tier !== null ? <span className="sr-only">, {getTierMeaning(student.tier)}</span> : null}
            </li>
          );
        })}
        {hiddenCount > 0 ? (
          <li>
            <button
              type="button"
              aria-label={`외 ${hiddenCount}명 보기`}
              onClick={() => setExpanded(true)}
              className="flex aspect-[5/6] w-14 cursor-pointer items-center justify-center rounded-md bg-v2-inset text-sm font-medium text-v2-fg-secondary tabular-nums hover:bg-v2-filled-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus sm:w-16"
            >
              +{hiddenCount}
            </button>
          </li>
        ) : null}
      </StudentThumbList>
      {card.targetsChangeAt ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-[1.125rem] text-v2-fg-secondary">
          <ClockIcon className="mt-px size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          <span>{TARGETS_NOTICE}</span>
        </p>
      ) : null}
    </section>
  );
}

// A recruited student's tier: a star and the number up to ★5, then the exclusive weapon icon and its level.
function TierLabel({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-px tabular-nums">
      {tier <= 5 ? (
        <StarIcon className="size-2.5 shrink-0 text-v2-star" aria-hidden="true" />
      ) : (
        <img src="/icons/exclusive_weapon.png" alt="" className="size-3 shrink-0" />
      )}
      {tier <= 5 ? tier : tier - 5}
    </span>
  );
}
