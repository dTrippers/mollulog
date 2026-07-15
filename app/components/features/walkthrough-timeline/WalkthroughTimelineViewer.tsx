import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "~/components/primitives/Button";
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

function actionBadge(action: TimelineAction) {
  if (action.kind === "normal_skill") return "1스";
  if (action.kind === "student_ex") return action.copied ? "복제 EX" : "EX";
  if (action.kind === "boss_gimmick") return "기믹";
  return "메모";
}

function StudentAction({
  action,
  studentsByUid,
}: {
  action: TimelineAction;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const student = action.studentUid ? studentsByUid[action.studentUid] : undefined;
  const target = action.targetStudentUid ? studentsByUid[action.targetStudentUid] : undefined;

  if (!action.studentUid) {
    return (
      <div className="w-full rounded-md bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
        {action.text || "실행 내용을 표시할 수 없어요"}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <TimelineStudentImage uid={action.studentUid} name={student?.name ?? "학생"} />
      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
        {actionBadge(action)}
      </span>
      {action.text && <span className="max-w-32 text-center text-xs text-muted-foreground">{action.text}</span>}
      {action.targetStudentUid && (
        <>
          <ArrowDownIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <TimelineStudentImage uid={action.targetStudentUid} name={target?.name ?? "대상 학생"} />
          <span className="text-xs font-medium text-muted-foreground">대상</span>
        </>
      )}
    </div>
  );
}

function markerText(step: TimelineStep) {
  if (!step.marker) return "시점 지정 없음";
  if (step.marker.kind === "immediate") return step.marker.value || "즉시";
  return step.marker.value || "시점 지정 없음";
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
  wakeLockControl?: { enabled: boolean; active: boolean; onToggle: () => void };
}) {
  const containerRef = useRef<HTMLElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const item = items[currentIndex];
  const goPrevious = useCallback(
    () => onCurrentIndexChange(Math.max(0, currentIndex - 1)),
    [currentIndex, onCurrentIndexChange],
  );
  const goNext = useCallback(
    () => onCurrentIndexChange(Math.min(items.length - 1, currentIndex + 1)),
    [currentIndex, items.length, onCurrentIndexChange],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "ArrowLeft" || (event.key === " " && event.shiftKey)) {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "ArrowRight" || (event.key === " " && !event.shiftKey)) {
        event.preventDefault();
        goNext();
      }
    };
    const eventWindow = containerRef.current?.ownerDocument.defaultView ?? window;
    eventWindow.addEventListener("keydown", handleKeyDown);
    return () => eventWindow.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious]);

  if (!item) {
    return (
      <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">표시할 단계가 없어요.</div>
    );
  }

  const progress = (currentIndex + 1) / items.length;
  const requestFullscreen = async () => {
    const ownerDocument = containerRef.current?.ownerDocument ?? document;
    if (ownerDocument.fullscreenElement) await ownerDocument.exitFullscreen();
    else await ownerDocument.documentElement.requestFullscreen();
  };

  return (
    <section
      ref={containerRef}
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col overflow-x-hidden bg-background"
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
      <header className="sticky top-0 z-10 bg-background px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm font-medium">
          <span>
            {item.partyNumber}파티{item.phaseLabel ? ` · ${item.phaseLabel}` : ""}
          </span>
          <div className="flex items-center gap-2">
            <span aria-live="polite">
              {currentIndex + 1} / {items.length}
            </span>
            {wakeLockControl && (
              <button
                type="button"
                onClick={wakeLockControl.onToggle}
                className="rounded-md px-2 py-1 text-xs hover:bg-muted"
                aria-pressed={wakeLockControl.enabled}
              >
                {wakeLockControl.active ? "화면 켜짐" : wakeLockControl.enabled ? "켜짐 요청 중" : "화면 꺼짐 허용"}
              </button>
            )}
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
      </header>

      <div className="flex-1 divide-y divide-border pb-24">
        {item.step.kind !== "divider" && (
          <section className="px-5 py-7 text-center">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">실행 시점</h2>
            <p className="mt-4 break-keep text-3xl font-bold tabular-nums">{markerText(item.step)}</p>
          </section>
        )}

        {item.step.actions.length > 0 && (
          <section className="px-5 py-7">
            <h2 className="text-center text-xs font-semibold tracking-wide text-muted-foreground">실행 내용</h2>
            <div className="mt-5 flex flex-col items-center gap-4">
              {item.step.actions.map((action, index) => (
                <div
                  // Actions are an ordered value list and intentionally do not have individual UIDs.
                  // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must render as separate sequence entries.
                  key={`${item.step.uid}-action-${index}`}
                  className="flex flex-col items-center gap-4"
                >
                  {index > 0 && <ArrowDownIcon className="size-6 text-muted-foreground" aria-hidden="true" />}
                  <StudentAction action={action} studentsByUid={studentsByUid} />
                </div>
              ))}
            </div>
          </section>
        )}

        {item.step.note?.trim() && (
          <section className="px-5 py-7">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">메모 등 특이사항</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{item.step.note}</p>
          </section>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 mx-auto grid w-full max-w-sm grid-cols-2 gap-3 border-t border-border bg-background/95 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur">
        <Button
          icon={ArrowLeftIcon}
          text="이전"
          fullWidth
          disabled={currentIndex === 0}
          onClick={goPrevious}
          className="py-3"
        />
        <Button
          icon={ArrowRightIcon}
          text="다음"
          variant="primary"
          fullWidth
          disabled={currentIndex === items.length - 1}
          onClick={goNext}
          className="py-3"
        />
      </footer>
    </section>
  );
}
