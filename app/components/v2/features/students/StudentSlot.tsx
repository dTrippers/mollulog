import { useRef } from "react";
import { getFavoriteLabelState, isNewRecruitment } from "~/domain/futures/futures-view-model";
import { useV2Page } from "../../layout/V2Page";
import { Popover } from "../../primitives/Popover";
import { Sheet } from "../../primitives/Sheet";
import { AttributeStripes } from "./AttributeStripes";
import { StudentQuickPanelBody } from "./StudentQuickPanel";
import { StudentThumb } from "./StudentThumb";
import { splitVisibleStudentName } from "./split-student-name";
import type { FutureStudentEntry } from "./types";

// One student thumbnail with its quick panel. On side-by-side it opens a popover anchored to the thumbnail. On stacked
// it opens a sheet.
export function StudentSlot({
  entry,
  signedIn,
  open,
  onOpenChange,
}: {
  entry: FutureStudentEntry;
  signedIn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { stacked } = useV2Page();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The whole slot, thumbnail and name, is the popover's anchor. The trigger alone is kept for focus return.
  const slotRef = useRef<HTMLDivElement>(null);
  // Set when a sheet closes for the sign-in prompt, so its exit leaves focus with the prompt.
  const skipSheetFocusReturnRef = useRef(false);
  const { name, variant } = splitVisibleStudentName(entry.studentName);
  // Own state is not read while it is pending, so the label shows the public count alone.
  const ownStateKnown = signedIn && !entry.viewerPending && !entry.viewerUnavailable;
  const favorite = getFavoriteLabelState({
    count: entry.favoritedCount,
    favorited: entry.favorited && ownStateKnown,
    completed: entry.completed && ownStateKnown,
    signedIn: ownStateKnown,
  });
  const panelOpen = open && !stacked;
  const sheetOpen = open && stacked;
  const detailHref = entry.studentUid ? `/students/${entry.studentUid}` : null;
  // The sheet shows the attributes under its title, so they stay outside the scrolling body.
  const hasAttributes = Boolean(entry.attackType || entry.defenseType || entry.role);
  // A guest's favorite or completion opens the sign-in prompt. The panel closes first, so the prompt is not shown beside an
  // open panel. A popover does not return focus on a plain close, and a sheet's exit skips the focus return to the thumbnail.
  const closeForSignIn = () => {
    if (stacked) {
      skipSheetFocusReturnRef.current = true;
    }
    onOpenChange(false);
  };
  const panelEntry: FutureStudentEntry = signedIn
    ? entry
    : {
        ...entry,
        onToggleFavorite: (favorited) => {
          closeForSignIn();
          entry.onToggleFavorite(favorited);
        },
        onToggleComplete: (completed) => {
          closeForSignIn();
          entry.onToggleComplete(completed);
        },
      };

  return (
    <div ref={slotRef} className="relative">
      <StudentThumb
        ref={triggerRef}
        studentUid={entry.studentUid}
        name={name}
        variant={variant}
        recruitmentLabel={entry.recruitmentLabel}
        isNew={isNewRecruitment({ recruitmentType: entry.recruitmentType, rerun: entry.rerun })}
        favorite={favorite}
        personalStatePending={entry.viewerPending}
        expanded={panelOpen}
        onOpen={() => onOpenChange(true)}
      />
      <Popover
        open={panelOpen}
        label={`${name} 빠른 보기`}
        onClose={() => onOpenChange(false)}
        returnFocusRef={triggerRef}
        anchorRef={slotRef}
        className="w-72"
      >
        <StudentQuickPanelBody
          entry={panelEntry}
          name={name}
          variant={variant}
          signedIn={signedIn}
          detailHref={detailHref}
          showHeader
        />
      </Popover>
      <Sheet
        open={sheetOpen}
        title={variant ? `${name}(${variant})` : name}
        description={
          hasAttributes ? (
            <AttributeStripes
              className="mt-1"
              attackType={entry.attackType}
              defenseType={entry.defenseType}
              role={entry.role}
            />
          ) : undefined
        }
        onClose={() => onOpenChange(false)}
        onExited={() => {
          const trigger = triggerRef.current;
          if (!skipSheetFocusReturnRef.current) {
            trigger?.focus({ preventScroll: true });
            return;
          }
          skipSheetFocusReturnRef.current = false;
          // The dialog restores focus to the thumbnail while it unmounts. Blur it after that, so the prompt keeps focus.
          setTimeout(() => {
            if (trigger && document.activeElement === trigger) {
              trigger.blur();
            }
          }, 0);
        }}
      >
        <StudentQuickPanelBody
          entry={panelEntry}
          name={name}
          variant={variant}
          signedIn={signedIn}
          detailHref={detailHref}
          showHeader={false}
        />
      </Sheet>
    </div>
  );
}
