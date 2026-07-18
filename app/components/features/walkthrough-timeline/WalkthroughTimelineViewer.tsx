import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsPointingOutIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "~/components/primitives/Button";
import Toggle from "~/components/primitives/Toggle";
import type { TimelineAction, TimelineStep, WalkthroughParty } from "~/domain/walkthrough-timeline";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";

export type TimelineViewerStudent = { name: string };

export type TimelineViewerItem = {
  partyNumber: number;
  phaseLabel?: string;
  step: TimelineStep;
};

export function flattenTimelineParties(parties: WalkthroughParty[]): TimelineViewerItem[] {
  return [...parties]
    .sort((left, right) => left.order - right.order)
    .flatMap((party, partyIndex) => {
      let phaseLabel: string | undefined;
      return [...party.steps]
        .sort((left, right) => left.order - right.order)
        .map((step) => {
          if (step.kind === "divider" && step.note?.trim()) phaseLabel = step.note.trim();
          return { partyNumber: partyIndex + 1, phaseLabel, step };
        });
    });
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function TimelineStudentImage({ uid, name, className }: { uid: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex size-20 items-center justify-center rounded-full bg-muted text-center text-xs text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={`${name} 이미지 없음`}
      >
        이미지
        <br />
        없음
      </div>
    );
  }

  return (
    <img
      src={studentImageUrl(uid)}
      alt={name}
      className={cn("size-20 rounded-full bg-muted object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

function TimelineActionImage({
  uid,
  name,
  preview = false,
  target = false,
}: {
  uid: string;
  name: string;
  preview?: boolean;
  target?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const sizeClassName = target ? (preview ? "size-5" : "size-8") : preview ? "size-7" : "size-10";

  if (failed) {
    return (
      <div
        className={cn("shrink-0 rounded-full bg-muted", sizeClassName)}
        role="img"
        aria-label={`${name} 이미지 없음`}
      />
    );
  }

  return (
    <img
      src={studentImageUrl(uid)}
      alt={name}
      className={cn("shrink-0 rounded-full bg-muted object-cover", sizeClassName)}
      onError={() => setFailed(true)}
    />
  );
}

function TimelineActionItem({
  action,
  studentsByUid,
  preview = false,
}: {
  action: TimelineAction;
  studentsByUid: Record<string, TimelineViewerStudent>;
  preview?: boolean;
}) {
  const student = action.studentUid ? studentsByUid[action.studentUid] : undefined;
  const target = action.targetStudentUid ? studentsByUid[action.targetStudentUid] : undefined;
  const detail = viewerActionText(action) || (action.copied ? "복제 스킬" : "");

  if (!action.studentUid) {
    return (
      <span
        className={cn(
          "rounded-md bg-muted text-muted-foreground",
          preview ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-1.5 text-sm",
        )}
      >
        {viewerActionText(action) || "실행 내용"}
      </span>
    );
  }

  return (
    <div className={cn("flex shrink-0 items-center", preview ? "gap-0" : "gap-2")}>
      <div className={cn("flex items-center", preview ? "gap-1" : "gap-1.5")}>
        <TimelineActionImage uid={action.studentUid} name={student?.name ?? "학생"} preview={preview} />
        {action.targetStudentUid && (
          <>
            <ArrowRightIcon
              className={cn("shrink-0 text-primary", preview ? "size-3" : "size-3.5")}
              aria-hidden="true"
            />
            <span className="inline-flex rounded-full ring-2 ring-primary">
              <TimelineActionImage
                uid={action.targetStudentUid}
                name={`${target?.name ?? "대상 학생"} 대상`}
                preview={preview}
                target
              />
            </span>
          </>
        )}
      </div>
      {!preview && detail && <span className="max-w-28 break-keep text-sm font-semibold leading-5">{detail}</span>}
    </div>
  );
}

export function TimelineActionSequence({
  actions,
  studentsByUid,
  preview = false,
}: {
  actions: TimelineAction[];
  studentsByUid: Record<string, TimelineViewerStudent>;
  preview?: boolean;
}) {
  const visibleActions = actions.filter((action) => action.studentUid || viewerActionText(action));

  return (
    <div className={cn("flex flex-wrap items-center justify-start", preview ? "gap-x-1 gap-y-1" : "gap-x-2 gap-y-3")}>
      {visibleActions.map((action, index) => {
        return (
          <div
            // Actions are an ordered value list and intentionally do not have individual UIDs.
            // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must render as separate sequence entries.
            key={`action-${index}`}
            className={cn("flex shrink-0 items-center", preview ? "gap-1" : "gap-2")}
          >
            {index > 0 && (
              <ChevronRightIcon
                className={cn("shrink-0 text-muted-foreground", preview ? "size-3.5" : "size-4")}
                aria-hidden="true"
              />
            )}
            <TimelineActionItem action={action} studentsByUid={studentsByUid} preview={preview} />
          </div>
        );
      })}
    </div>
  );
}

function viewerActionText(action: TimelineAction) {
  return (action.text ?? "")
    .trim()
    .replace(/(?:^|\s*\/\s*)[-–—]+\s*$/, "")
    .trim();
}

function StepPreview({
  item,
  studentsByUid,
}: {
  item?: TimelineViewerItem;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  if (!item) return null;

  if (item.step.kind === "divider") {
    return (
      <div className="flex items-center gap-3 px-2 py-4">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">{item.step.note || "설명글"}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
    );
  }

  const marker = markerText(item.step);
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-3">
      {marker && <span className="text-base font-semibold tabular-nums text-muted-foreground">{marker}</span>}
      {item.step.actions.length > 0 && (
        <div className="w-full">
          <TimelineActionSequence actions={item.step.actions} studentsByUid={studentsByUid} preview />
        </div>
      )}
    </div>
  );
}

function markerText(step: TimelineStep) {
  if (!step.marker) return "";
  if (step.marker.kind === "immediate") return step.marker.value || "즉시";
  return step.marker.value || "";
}

export function WalkthroughTimelineViewer({
  items,
  studentsByUid,
  currentIndex,
  onCurrentIndexChange,
  allowFullscreen = false,
  wakeLockControl,
}: {
  items: TimelineViewerItem[];
  studentsByUid: Record<string, TimelineViewerStudent>;
  currentIndex: number;
  onCurrentIndexChange: (index: number) => void;
  allowFullscreen?: boolean;
  wakeLockControl?: { enabled: boolean; active: boolean; unavailable: boolean; onToggle: () => void };
}) {
  const containerRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasPositionedCurrentItem = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const navigableIndices = useMemo(
    () => items.flatMap((timelineItem, index) => (timelineItem.step.kind === "divider" ? [] : [index])),
    [items],
  );
  const currentItemIndex = navigableIndices.includes(currentIndex) ? currentIndex : (navigableIndices[0] ?? 0);
  const navigationPosition = navigableIndices.indexOf(currentItemIndex);
  const item = items[currentItemIndex];
  const goPrevious = useCallback(() => {
    const previousIndex = navigableIndices[Math.max(0, navigationPosition - 1)];
    if (previousIndex !== undefined) onCurrentIndexChange(previousIndex);
  }, [navigableIndices, navigationPosition, onCurrentIndexChange]);
  const goNext = useCallback(() => {
    const nextIndex = navigableIndices[Math.min(navigableIndices.length - 1, navigationPosition + 1)];
    if (nextIndex !== undefined) onCurrentIndexChange(nextIndex);
  }, [navigableIndices, navigationPosition, onCurrentIndexChange]);

  useEffect(() => {
    if (currentItemIndex !== currentIndex) onCurrentIndexChange(currentItemIndex);
  }, [currentIndex, currentItemIndex, onCurrentIndexChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isSpace = event.code === "Space" || event.key === " ";
      if (["ArrowUp", "ArrowLeft"].includes(event.key) || (isSpace && event.shiftKey)) {
        event.preventDefault();
        if (event.target instanceof HTMLButtonElement && event.target.dataset.timelineStep !== undefined) {
          event.target.blur();
        }
        goPrevious();
      } else if (["ArrowDown", "ArrowRight"].includes(event.key) || (isSpace && !event.shiftKey)) {
        event.preventDefault();
        if (event.target instanceof HTMLButtonElement && event.target.dataset.timelineStep !== undefined) {
          event.target.blur();
        }
        goNext();
      }
    };
    const eventWindow = containerRef.current?.ownerDocument.defaultView ?? window;
    eventWindow.addEventListener("keydown", handleKeyDown);
    return () => eventWindow.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  useEffect(() => {
    const currentItem = itemRefs.current[currentItemIndex];
    const scrollContainer = scrollContainerRef.current;
    if (!currentItem || !scrollContainer) return;

    const eventWindow = containerRef.current?.ownerDocument.defaultView ?? window;
    const reduceMotion = eventWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = eventWindow.requestAnimationFrame(() => {
      const itemRect = currentItem.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const targetScrollTop =
        scrollContainer.scrollTop +
        (itemRect.top - containerRect.top) +
        itemRect.height / 2 -
        scrollContainer.clientHeight / 3;
      scrollContainer.scrollTo({
        behavior: hasPositionedCurrentItem.current && !reduceMotion ? "smooth" : "auto",
        top: Math.max(0, Math.min(targetScrollTop, scrollContainer.scrollHeight - scrollContainer.clientHeight)),
      });
      hasPositionedCurrentItem.current = true;
    });

    return () => eventWindow.cancelAnimationFrame(frame);
  }, [currentItemIndex]);

  if (!item) {
    return (
      <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">표시할 단계가 없어요.</div>
    );
  }

  const progress = navigableIndices.length > 0 ? (navigationPosition + 1) / navigableIndices.length : 0;
  const requestFullscreen = async () => {
    const ownerDocument = containerRef.current?.ownerDocument ?? document;
    if (ownerDocument.fullscreenElement) await ownerDocument.exitFullscreen();
    else await ownerDocument.documentElement.requestFullscreen();
  };

  return (
    <section
      ref={containerRef}
      className="relative mx-auto flex h-dvh min-h-dvh w-full max-w-sm flex-col overflow-hidden bg-background"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx > 0) goPrevious();
        else goNext();
      }}
    >
      <header className="z-10 shrink-0 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>
            {item.partyNumber}파티{item.phaseLabel ? ` · ${item.phaseLabel}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <span aria-live="polite">
              {Math.max(0, navigationPosition + 1)} / {navigableIndices.length}
            </span>
            {allowFullscreen && typeof document !== "undefined" && document.fullscreenEnabled && (
              <button
                type="button"
                onClick={requestFullscreen}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="전체 화면 전환"
              >
                <ArrowsPointingOutIcon className="size-5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
        {wakeLockControl && !wakeLockControl.unavailable && (
          <div className="mt-3 flex items-center justify-between gap-3 md:hidden">
            <div>
              <p className="text-sm font-medium">화면 항상 켜기</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {wakeLockControl.active ? "전투 중 화면이 꺼지지 않습니다." : "진행 중 화면 꺼짐을 막습니다."}
              </p>
            </div>
            <Toggle
              initialState={wakeLockControl.enabled}
              className="m-0 shrink-0"
              onChange={wakeLockControl.onToggle}
            />
          </div>
        )}
      </header>

      <main
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto scroll-smooth px-4 pt-[22vh] pb-[65vh]"
      >
        {items.map((timelineItem, index) => {
          const active = index === currentItemIndex;
          const distance = Math.abs(index - currentItemIndex);
          const future = index > currentItemIndex;
          const partyStarts = index > 0 && items[index - 1]?.partyNumber !== timelineItem.partyNumber;
          const partyTransition = partyStarts ? (
            <div
              role="separator"
              aria-label={`${timelineItem.partyNumber}파티 시작`}
              className={cn(
                "flex items-center gap-3 py-4 transition-opacity duration-300",
                future ? "opacity-100" : "opacity-60",
              )}
            >
              <span className="h-px flex-1 bg-primary/50" aria-hidden="true" />
              <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                {timelineItem.partyNumber}파티 시작
              </span>
              <span className="h-px flex-1 bg-primary/50" aria-hidden="true" />
            </div>
          ) : null;

          if (timelineItem.step.kind === "divider") {
            return (
              <Fragment key={`${timelineItem.partyNumber}-${timelineItem.step.uid}`}>
                {partyTransition}
                <div
                  className={cn(
                    "transition-opacity duration-300",
                    future && distance <= 1 && "opacity-95",
                    future && distance > 1 && "opacity-80",
                    !future && distance <= 1 && "opacity-60",
                    !future && distance > 1 && "opacity-40",
                  )}
                >
                  <StepPreview item={timelineItem} studentsByUid={studentsByUid} />
                </div>
              </Fragment>
            );
          }

          const itemNavigationPosition = navigableIndices.indexOf(index);
          return (
            <Fragment key={`${timelineItem.partyNumber}-${timelineItem.step.uid}`}>
              {partyTransition}
              <button
                // Timeline item UIDs are stable within their party document.
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                data-timeline-step
                className={cn(
                  "block w-full origin-left text-left outline-none transition-[opacity,transform] duration-300 focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-primary/50",
                  active && "scale-100 opacity-100",
                  !active && future && distance === 1 && "scale-[0.995] opacity-95 hover:opacity-100",
                  !active && future && distance === 2 && "scale-[0.99] opacity-90 hover:opacity-100",
                  !active && future && distance > 2 && "scale-[0.985] opacity-80 hover:opacity-100",
                  !active && !future && distance === 1 && "scale-[0.99] opacity-55 hover:opacity-80",
                  !active && !future && distance === 2 && "scale-[0.98] opacity-40 hover:opacity-70",
                  !active && !future && distance > 2 && "scale-[0.97] opacity-30 hover:opacity-60",
                )}
                aria-current={active ? "step" : undefined}
                aria-label={`${itemNavigationPosition + 1}번째 단계로 이동`}
                onClick={() => onCurrentIndexChange(index)}
              >
                {active ? (
                  <article className="rounded-xl border border-border bg-card px-5 py-5 shadow-sm">
                    {markerText(timelineItem.step) && (
                      <h2 className="break-keep text-3xl font-bold tabular-nums">{markerText(timelineItem.step)}</h2>
                    )}
                    {timelineItem.step.actions.length > 0 && (
                      <div className={cn(markerText(timelineItem.step) && "mt-5")}>
                        <TimelineActionSequence actions={timelineItem.step.actions} studentsByUid={studentsByUid} />
                      </div>
                    )}
                    {timelineItem.step.note?.trim() && (
                      <p className="mt-5 border-t border-border pt-3 whitespace-pre-wrap break-words text-base leading-6 text-muted-foreground">
                        {timelineItem.step.note}
                      </p>
                    )}
                  </article>
                ) : (
                  <StepPreview item={timelineItem} studentsByUid={studentsByUid} />
                )}
              </button>
            </Fragment>
          );
        })}
      </main>

      <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-sm bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-8">
        <div className="pointer-events-auto p-2">
          <p className="mb-2 hidden text-center text-xs text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:block">
            ↑↓ 또는 Space로 넘기기
          </p>
          <p className="mb-2 text-center text-xs text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hidden">
            버튼 또는 단계를 눌러 이동
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={ArrowUpIcon}
              text="이전"
              fullWidth
              disabled={navigationPosition <= 0}
              onClick={goPrevious}
              className="border-transparent bg-muted/90 py-3 shadow-xl shadow-black/20 backdrop-blur-md hover:bg-muted"
            />
            <Button
              icon={ArrowDownIcon}
              text="다음"
              variant="primary"
              fullWidth
              disabled={navigationPosition >= navigableIndices.length - 1}
              onClick={goNext}
              className="bg-primary/85 py-3 shadow-xl shadow-black/20 backdrop-blur-md hover:bg-primary/95"
            />
          </div>
        </div>
      </footer>
    </section>
  );
}
