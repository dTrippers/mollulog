import { ArrowUturnLeftIcon, ArrowUturnRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useNavigation } from "react-router";
import { Button, PanelBody } from "~/components/primitives";
import { WALKTHROUGH_TIMELINE_LIMITS, type WalkthroughParty } from "~/domain/walkthrough-timeline";
import type { ImportStudent } from "~/domain/walkthrough-timeline-import";
import { cn } from "~/lib/utils";
import { TimelineStudentImage } from "./WalkthroughTimelineViewer";

type Props = {
  mode: "create" | "edit";
  parties: WalkthroughParty[];
  students: ImportStudent[];
  activePartyIndex: number;
  onChange: (index: number) => void;
  onAddParty: () => void;
  onDeleteParty: (index: number) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export default function WalkthroughTimelinePartyPanel({
  mode,
  parties,
  students,
  activePartyIndex,
  onChange,
  onAddParty,
  onDeleteParty,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const navigation = useNavigation();
  const studentsByUid = Object.fromEntries(students.map((student) => [student.uid, student]));

  return (
    <PanelBody>
      <div className="space-y-1">
        {parties.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">등록된 파티가 없어요.</p>
        ) : (
          parties.map((party, index) => (
            <div key={party.uid} className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  activePartyIndex === index
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/60 text-foreground hover:bg-muted",
                )}
                aria-pressed={activePartyIndex === index}
                onClick={() => onChange(index)}
              >
                <span className="shrink-0 text-xs font-semibold">파티 {index + 1}</span>
                <span
                  className="ml-auto flex min-w-0 -space-x-1.5"
                  role="img"
                  aria-label={`파티 ${index + 1} 편성 학생`}
                >
                  {[...party.units]
                    .sort((left, right) => left.slot - right.slot)
                    .flatMap((unit) => (unit.studentUid ? [unit.studentUid] : []))
                    .map((studentUid) => (
                      <TimelineStudentImage
                        key={studentUid}
                        uid={studentUid}
                        name={studentsByUid[studentUid]?.name ?? "학생"}
                        className="size-7 border-2 border-card"
                      />
                    ))}
                  {party.units.every((unit) => !unit.studentUid) && (
                    <span className="text-xs font-normal text-muted-foreground">미편성</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-label={`파티 ${index + 1} 삭제`}
                onClick={() => onDeleteParty(index)}
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
      <Button
        icon={PlusIcon}
        text="파티 추가"
        size="sm"
        fullWidth
        disabled={parties.length >= WALKTHROUGH_TIMELINE_LIMITS.parties}
        onClick={onAddParty}
      />
      <div className="space-y-2 border-t border-border/70 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Button icon={ArrowUturnLeftIcon} text="실행 취소" size="sm" fullWidth disabled={!canUndo} onClick={onUndo} />
          <Button
            icon={ArrowUturnRightIcon}
            text="다시 실행"
            size="sm"
            fullWidth
            disabled={!canRedo}
            onClick={onRedo}
          />
        </div>
        <Button
          text={mode === "create" ? "타임라인 저장" : "변경사항 저장"}
          size="sm"
          variant="primary"
          fullWidth
          disabled={navigation.state !== "idle"}
          onClick={onSave}
        />
      </div>
    </PanelBody>
  );
}
