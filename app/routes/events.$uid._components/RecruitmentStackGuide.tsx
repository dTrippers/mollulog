import { ArrowRightIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useId, useState } from "react";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { RangeSlider } from "~/components/v2/primitives/RangeSlider";
import { Switch } from "~/components/v2/primitives/Switch";
import { RECRUITMENT_STACK_GUIDE_ANCHOR } from "~/domain/recruitment-notice";
import { cn } from "~/lib/utils";

// The copy follows the official notices for this event only. See RECRUITMENT_STACK_GUIDE_EVENT_UID.

const FREE_PULLS = 200;
const FREE_PULL_STEP = 10; // Free pulls can only be spent as 10-pulls.
const STAR3_PULL = 100;
const PICKUP_PULL = 200;
const DEFAULT_USED = 150;

const FAQ = [
  {
    question: "무료 모집에서 쌓인 특별 스택도 페스 모집으로 이어지나요?",
    answer:
      "네. 무료 모집이든 청휘석 모집이든 특별 스택은 똑같이 쌓이고, 11/17 페스 모집으로 이어져요. 11/17 11:00에 사라지는 건 남은 무료 모집 횟수뿐이에요.",
  },
  {
    question: "특별 스택이 190인데 무료 모집 기간이 끝나면 어떻게 되나요?",
    answer:
      "특별 스택 190은 페스 모집으로 그대로 이어져요. 페스 모집에서 10회 더 모집해 특별 스택이 200이 되면 픽업 학생을 확정으로 뽑아요.",
  },
  {
    question: "무료 모집 횟수는 언제 얼마나 받나요?",
    answer:
      "11/10에 110회, 11/11~11/13에는 매일 10회, 11/14~11/16에는 매일 20회를 받아 모두 200회예요. 늦게 접속해도 지나간 날 분까지 모두 받아요.",
  },
] as const;

// The example starts from 0 stacks. Without the stack-100 pickup it assumes no pickup until the guaranteed stack 200.
function stackAfter(used: number, pickedAtStar3: boolean): number {
  if (pickedAtStar3 && used >= STAR3_PULL) return used - STAR3_PULL;
  return used >= PICKUP_PULL ? 0 : used;
}

export function RecruitmentStackGuide() {
  const [open, setOpen] = useState(true);
  const [used, setUsed] = useState(DEFAULT_USED);
  const [pickedAtStar3, setPickedAtStar3] = useState(false);
  const bodyId = useId();
  const switchId = useId();
  const freeLeft = FREE_PULLS - used;
  const stack = stackAfter(used, pickedAtStar3);
  const reachedStar3 = used >= STAR3_PULL;
  const resetAtStar3 = pickedAtStar3 && reachedStar3;
  // After a stack-100 pickup the stack restarts, so it cannot reach 200 within the free pulls.
  const reachedPickup = used >= PICKUP_PULL && !pickedAtStar3;

  return (
    <section
      id={RECRUITMENT_STACK_GUIDE_ANCHOR}
      data-region="recruit-stack-guide"
      aria-labelledby="stack-guide-toggle"
      className="mt-2 flex w-full scroll-mt-20 flex-col rounded-lg bg-v2-inset break-keep"
    >
      <h3>
        <button
          id="stack-guide-toggle"
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-v2-fg hover:bg-v2-hover",
            v2FocusRing,
          )}
        >
          무료 모집 횟수와 특별 스택 안내
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-v2-fg-tertiary motion-safe:transition-transform duration-v2-base ease-v2-standard",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h3>

      {open ? (
        <div id={bodyId} className="grid gap-6 px-3 pt-1 pb-4 md:grid-cols-2 md:gap-8">
          <div className="flex min-w-0 flex-col">
            <p className="text-[0.9375rem] leading-snug font-bold tracking-[-0.2px] text-v2-fg">
              남은 무료 모집 횟수는 사라져도
              <br />
              <span className="text-v2-accent">특별 스택은 페스 모집으로 이어져요</span>
            </p>

            <RangeSlider
              label="사용한 무료 모집 횟수"
              value={used}
              min={0}
              max={FREE_PULLS}
              step={FREE_PULL_STEP}
              valueSuffix="회"
              layout="stacked"
              className="[--v2-range-track:var(--v2-switch-off)]"
              onChange={setUsed}
            />
            <div className="mt-2">
              <Switch
                id={switchId}
                layout="inline"
                checked={pickedAtStar3}
                onCheckedChange={setPickedAtStar3}
                label="특별 스택 100에서 픽업 학생이 나온 경우"
              />
            </div>

            <p className="sr-only" aria-live="polite">
              {`11/17 10:59까지 남은 무료 모집 횟수 ${freeLeft}회, 특별 스택 ${stack}이에요. 11/17 11:00부터 남은 무료 모집 횟수는 사라지고, 특별 스택 ${stack}은 페스 모집으로 이어져요.`}
            </p>
            <div aria-hidden="true" className="mt-3 grid grid-cols-2">
              <PeriodHeader title="특별 픽업 모집" detail="11/17 10:59까지" />
              <PeriodHeader title="페스 모집" detail="11/17 11:00부터" className="pl-4" />

              <RowCaption>남은 무료 모집 횟수</RowCaption>
              <Band tone="danger">
                <Amount value={freeLeft} unit="회" tone="neutral" />
                <Amount value={0} unit="회" note="사라져요" tone="danger" />
              </Band>

              <RowCaption>특별 스택</RowCaption>
              <Band tone="accent">
                <Amount value={stack} tone="accent" />
                <Amount value={stack} note="이어져요" tone="accent" />
              </Band>
              <p className="col-span-2 min-h-4.5 px-2 pt-1 text-[0.6875rem] text-v2-fg-tertiary tabular-nums">
                {reachedPickup
                  ? "특별 스택 200에서 픽업 학생을 뽑아 0이 됐어요."
                  : resetAtStar3
                    ? "특별 스택 100에서 픽업 학생을 뽑아 0부터 다시 쌓였어요."
                    : "도중에 픽업 학생을 뽑으면 0부터 다시 쌓여요."}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <h4 className="text-xs font-semibold text-v2-fg-secondary">특별 스택 규칙</h4>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-xs text-v2-fg-secondary">
                <Rule label="+1">픽업 학생이 나오지 않은 모집 1회마다 1씩 쌓여요.</Rule>
                <Rule label="0">픽업 학생을 뽑으면 0부터 다시 쌓여요.</Rule>
                <Rule label="100" reached={reachedStar3}>
                  100이 되면 ★3 확정, 그중 픽업 확률 50%예요.
                </Rule>
                <Rule label="200" reached={reachedPickup}>
                  200이 되면 픽업 학생을 확정으로 뽑아요.
                </Rule>
              </dl>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-v2-fg-secondary">자주 묻는 질문</h4>
              <div className="mt-1 -mx-2 flex flex-col">
                {FAQ.map(({ question, answer }) => (
                  <details key={question} className="group">
                    <summary
                      className={cn(
                        "flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-2 text-[0.8125rem] font-medium text-v2-fg hover:bg-v2-hover [&::-webkit-details-marker]:hidden",
                        v2FocusRing,
                      )}
                    >
                      {question}
                      <ChevronDownIcon
                        className="size-4 shrink-0 text-v2-fg-tertiary motion-safe:transition-transform duration-v2-base ease-v2-standard group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="px-2 pt-0.5 pb-2.5 text-[0.8125rem] leading-relaxed text-v2-fg-secondary">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PeriodHeader({ title, detail, className }: { title: string; detail: string; className?: string }) {
  return (
    <span className={cn("flex flex-col px-2 pb-2 text-[0.78125rem] leading-tight font-semibold text-v2-fg", className)}>
      {title}
      <span className="mt-0.5 text-[0.6875rem] font-normal text-v2-fg-tertiary tabular-nums">{detail}</span>
    </span>
  );
}

function RowCaption({ children }: { children: string }) {
  return <span className="col-span-2 px-2 pt-2.5 pb-1 text-xs font-semibold text-v2-fg-secondary">{children}</span>;
}

// One band across both periods, so the row reads as the same value before and after 11/17.
function Band({ tone, children }: { tone: "accent" | "danger"; children: [ReactNode, ReactNode] }) {
  return (
    <div
      className={cn(
        "relative col-span-2 grid grid-cols-2 rounded-lg",
        tone === "accent" ? "bg-v2-accent-subtle" : "bg-v2-surface",
      )}
    >
      <div className="flex min-h-12 items-center p-2">{children[0]}</div>
      <div
        className={cn(
          "flex min-h-12 items-center rounded-r-lg py-2 pr-2 pl-4",
          // Only the after-11/17 side is red: the count is lost there, not before.
          tone === "danger" && "bg-v2-danger/10",
        )}
      >
        {children[1]}
      </div>
      <span
        className={cn(
          "absolute top-1/2 left-1/2 flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-v2-surface",
          tone === "accent" ? "text-v2-accent" : "text-v2-fg-tertiary",
        )}
      >
        <ArrowRightIcon className="size-2.5" />
      </span>
    </div>
  );
}

function Amount({
  value,
  unit,
  note,
  tone,
}: {
  value: number;
  unit?: string;
  note?: string;
  tone: "accent" | "danger" | "neutral";
}) {
  return (
    <span
      className={cn(
        "flex items-baseline gap-1.5 text-xl leading-none font-bold tabular-nums",
        tone === "accent" ? "text-v2-accent" : tone === "danger" ? "text-v2-danger/80" : "text-v2-fg",
      )}
    >
      <span>
        {value}
        {unit ? <span className="ml-0.5 text-xs font-semibold">{unit}</span> : null}
      </span>
      {note ? <span className="text-xs font-semibold">{note}</span> : null}
    </span>
  );
}

// Milestone rules stay dimmed until the slider reaches them.
function Rule({ label, reached = true, children }: { label: string; reached?: boolean; children: string }) {
  return (
    <>
      <dt
        className={cn(
          "rounded bg-v2-surface px-1.5 py-px text-center text-[0.71875rem] font-bold text-v2-fg tabular-nums transition-opacity",
          !reached && "opacity-40",
        )}
      >
        {label}
      </dt>
      <dd className={cn("transition-opacity", !reached && "opacity-40")}>{children}</dd>
    </>
  );
}
