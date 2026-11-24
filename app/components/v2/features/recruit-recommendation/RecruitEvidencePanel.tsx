import { type ReactNode, type RefObject, useSyncExternalStore } from "react";
import { Popover } from "../../primitives/Popover";
import { Sheet } from "../../primitives/Sheet";

// The evidence opens as a popover under its student wherever the desktop navigation shows (1024px and up), also when the
// page stacks its Aside beside a wide sidebar, and as a sheet below that.
const POPOVER_EVIDENCE_QUERY = "(min-width: 1024px)";

function subscribePopoverEvidence(onChange: () => void) {
  const query = window.matchMedia(POPOVER_EVIDENCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePopoverEvidence(): boolean {
  return useSyncExternalStore(
    subscribePopoverEvidence,
    () => window.matchMedia(POPOVER_EVIDENCE_QUERY).matches,
    () => true,
  );
}

// One student's full evidence, as a popover anchored to the student or as a sheet. The popover shows the name as the
// detail's own header; the sheet has its title.
export function RecruitEvidencePanel({
  open,
  onClose,
  studentLabel,
  anchorRef,
  triggerRef,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  studentLabel: string;
  anchorRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  detail: (showHeader: boolean) => ReactNode;
}) {
  const popover = usePopoverEvidence();
  return (
    <>
      <Popover
        open={open && popover}
        label={`${studentLabel} 근거`}
        onClose={onClose}
        returnFocusRef={triggerRef}
        anchorRef={anchorRef}
        className="w-[25rem] pb-2"
      >
        {detail(true)}
      </Popover>
      <Sheet open={open && !popover} title={studentLabel} onClose={onClose}>
        {detail(false)}
      </Sheet>
    </>
  );
}
