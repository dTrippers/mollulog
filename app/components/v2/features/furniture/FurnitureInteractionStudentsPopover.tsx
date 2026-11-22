import {
  createContext,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";
import { splitVisibleStudentName } from "../students/split-student-name";
import { StudentThumb } from "../students/StudentThumb";

export type FurnitureInteractionStudent = {
  uid: string;
  name: string;
};

type OpenReason = "hover" | "focus" | "click" | null;

type FurnitureInteractionStudentsPopoverProps = {
  furnitureName: string;
  students: FurnitureInteractionStudent[];
  children: ReactNode;
};

const HOVER_CLOSE_DELAY_MS = 140;

type PopoverGroupContextValue = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
};

const PopoverGroupContext = createContext<PopoverGroupContextValue | null>(null);

export function shouldOpenPopoverFromFocus({
  closing,
  pointerOrClickInteraction,
  focusVisible,
}: {
  closing: boolean;
  pointerOrClickInteraction: boolean;
  focusVisible: boolean;
}): boolean {
  return focusVisible && !closing && !pointerOrClickInteraction;
}

export function FurnitureInteractionStudentsPopoverGroup({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const value = useMemo(() => ({ activeId, setActiveId }), [activeId]);
  return <PopoverGroupContext.Provider value={value}>{children}</PopoverGroupContext.Provider>;
}

export default function FurnitureInteractionStudentsPopover({
  furnitureName,
  students,
  children,
}: FurnitureInteractionStudentsPopoverProps) {
  const id = useId();
  const group = useContext(PopoverGroupContext);
  const [localOpen, setLocalOpen] = useState(false);
  const [reason, setReason] = useState<OpenReason>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<OpenReason>(null);
  const closingRef = useRef(false);
  const pointerOrClickInteractionRef = useRef(false);
  const pointerInteractionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = group ? group.activeId === id : localOpen;

  const setOpenState = useCallback(
    (nextOpen: boolean, nextReason: OpenReason) => {
      reasonRef.current = nextOpen ? nextReason : null;
      setReason(reasonRef.current);
      if (group) {
        if (nextOpen) {
          group.setActiveId(id);
        } else if (group.activeId === id) {
          group.setActiveId(null);
        }
      } else {
        setLocalOpen(nextOpen);
      }
    },
    [group, id],
  );

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearPointerInteractionReset = useCallback(() => {
    if (pointerInteractionResetTimerRef.current !== null) {
      clearTimeout(pointerInteractionResetTimerRef.current);
      pointerInteractionResetTimerRef.current = null;
    }
  }, []);

  const schedulePointerInteractionReset = useCallback(() => {
    clearPointerInteractionReset();
    pointerInteractionResetTimerRef.current = setTimeout(() => {
      pointerOrClickInteractionRef.current = false;
      pointerInteractionResetTimerRef.current = null;
    }, 0);
  }, [clearPointerInteractionReset]);

  useEffect(() => {
    if (!open) {
      clearCloseTimer();
      reasonRef.current = null;
      setReason(null);
    }
  }, [clearCloseTimer, open]);

  useEffect(
    () => () => {
      clearCloseTimer();
      clearPointerInteractionReset();
    },
    [clearCloseTimer, clearPointerInteractionReset],
  );

  const scheduleHoverClose = useCallback(() => {
    if (reasonRef.current !== "hover") return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (reasonRef.current !== "hover") return;
      setOpenState(false, null);
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer, setOpenState]);

  const handleClose = useCallback(() => {
    clearCloseTimer();
    setOpenState(false, null);
    closingRef.current = true;
    queueMicrotask(() => {
      closingRef.current = false;
    });
  }, [clearCloseTimer, setOpenState]);

  const handleTriggerPointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    clearCloseTimer();
    if (!open) {
      setOpenState(true, "hover");
    }
  };

  const handleTriggerPointerLeave = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") {
      scheduleHoverClose();
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      pointerOrClickInteractionRef.current = true;
      schedulePointerInteractionReset();
    }
    clearCloseTimer();
    if (!open) {
      setOpenState(true, "click");
      return;
    }
    if (reasonRef.current === "hover" || reasonRef.current === "focus") {
      setOpenState(true, "click");
    } else {
      setOpenState(false, null);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${furnitureName} 상호작용 학생 ${students.length}명 보기`}
        className={cn(
          "block cursor-pointer rounded-md [@media(hover:hover)_and_(pointer:fine)]:hover:opacity-80 v2-interaction-transition",
          v2FocusRing,
        )}
        onPointerDown={() => {
          clearPointerInteractionReset();
          pointerOrClickInteractionRef.current = true;
        }}
        onPointerUp={schedulePointerInteractionReset}
        onPointerCancel={() => {
          clearPointerInteractionReset();
          pointerOrClickInteractionRef.current = false;
        }}
        onPointerEnter={handleTriggerPointerEnter}
        onPointerLeave={handleTriggerPointerLeave}
        onFocus={(event) => {
          if (
            !shouldOpenPopoverFromFocus({
              closing: closingRef.current,
              pointerOrClickInteraction: pointerOrClickInteractionRef.current,
              focusVisible: event.currentTarget.matches(":focus-visible"),
            })
          ) {
            return;
          }
          clearCloseTimer();
          if (!open) {
            setOpenState(true, "focus");
          }
        }}
        onBlur={() => {
          if (reasonRef.current === "focus") {
            setOpenState(false, null);
          }
        }}
        onClick={handleClick}
      >
        {children}
      </button>
      <Popover
        open={open}
        label="상호작용 학생"
        onClose={handleClose}
        returnFocusRef={buttonRef}
        autoFocus={reason === "click"}
        onPanelPointerEnter={(event) => {
          if (event.pointerType === "mouse") clearCloseTimer();
        }}
        onPanelPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleHoverClose();
        }}
        className="w-max max-w-[calc(100vw-1rem)] px-3 pt-2.5 pb-3"
      >
        <p className="mb-2 text-xs font-medium text-v2-fg-secondary">상호작용 학생</p>
        <div className="flex flex-wrap gap-2">
          {students.map((student) => {
            const { name, variant } = splitVisibleStudentName(student.name);
            return (
              <StudentThumb
                key={student.uid}
                studentUid={student.uid}
                name={name}
                variant={variant}
                headerPortrait
                captionPlacement="overlay"
                showRecruitmentLabel={false}
                linkTo={`/students/${student.uid}`}
              />
            );
          })}
        </div>
      </Popover>
    </>
  );
}
