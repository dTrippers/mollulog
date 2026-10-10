import { Popover, PopoverButton, PopoverGroup, PopoverPanel } from "@headlessui/react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router";
import { ProfileImage } from "~/components/primitives";

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

type BooleanRef = { current: boolean };

type PopoverFocusInput = {
  activating: boolean;
  syntheticClick: boolean;
  pointerOrClickInteraction: boolean;
  focusVisible: boolean;
};

export function shouldOpenPopoverFromFocus({
  activating,
  syntheticClick,
  pointerOrClickInteraction,
  focusVisible,
}: PopoverFocusInput) {
  return focusVisible && !activating && !syntheticClick && !pointerOrClickInteraction;
}

export function clickPopoverButtonProgrammatically(
  button: Pick<HTMLButtonElement, "click">,
  syntheticClickRef: BooleanRef,
  activatingRef: BooleanRef,
) {
  syntheticClickRef.current = true;
  activatingRef.current = true;
  try {
    button.click();
  } finally {
    syntheticClickRef.current = false;
    activatingRef.current = false;
  }
}

export function FurnitureInteractionStudentsPopoverGroup({ children }: { children: ReactNode }) {
  return (
    <PopoverGroup as="div" className="contents">
      {children}
    </PopoverGroup>
  );
}

export default function FurnitureInteractionStudentsPopover({
  furnitureName,
  students,
  children,
}: FurnitureInteractionStudentsPopoverProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<OpenReason>(null);
  const syntheticClickRef = useRef(false);
  const activatingRef = useRef(false);
  const reopenAfterClickRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const activate = useCallback((reason: Exclude<OpenReason, null>) => {
    const button = buttonRef.current;
    if (!button) return;
    reasonRef.current = reason;
    clickPopoverButtonProgrammatically(button, syntheticClickRef, activatingRef);
  }, []);

  return (
    <Popover>
      {({ open, close }) => (
        <FurnitureInteractionPopoverContents
          buttonRef={buttonRef}
          reasonRef={reasonRef}
          syntheticClickRef={syntheticClickRef}
          activatingRef={activatingRef}
          reopenAfterClickRef={reopenAfterClickRef}
          closeTimerRef={closeTimerRef}
          clearCloseTimer={clearCloseTimer}
          activate={activate}
          open={open}
          close={close}
          furnitureName={furnitureName}
          students={students}
        >
          {children}
        </FurnitureInteractionPopoverContents>
      )}
    </Popover>
  );
}

type FurnitureInteractionPopoverContentsProps = {
  buttonRef: { current: HTMLButtonElement | null };
  reasonRef: { current: OpenReason };
  syntheticClickRef: { current: boolean };
  activatingRef: { current: boolean };
  reopenAfterClickRef: { current: boolean };
  closeTimerRef: { current: ReturnType<typeof setTimeout> | null };
  clearCloseTimer: () => void;
  activate: (reason: Exclude<OpenReason, null>) => void;
  open: boolean;
  close: () => void;
  furnitureName: string;
  students: FurnitureInteractionStudent[];
  children: ReactNode;
};

function FurnitureInteractionPopoverContents({
  buttonRef,
  reasonRef,
  syntheticClickRef,
  activatingRef,
  reopenAfterClickRef,
  closeTimerRef,
  clearCloseTimer,
  activate,
  open,
  close,
  furnitureName,
  students,
  children,
}: FurnitureInteractionPopoverContentsProps) {
  // Pointer and click focus must not be interpreted as keyboard focus.
  const pointerOrClickInteractionRef = useRef(false);
  const pointerInteractionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => clearPointerInteractionReset, [clearPointerInteractionReset]);

  useEffect(() => {
    if (open) {
      reopenAfterClickRef.current = false;
      return;
    }
    clearCloseTimer();
    if (reopenAfterClickRef.current) {
      reopenAfterClickRef.current = false;
      reasonRef.current = "click";
      activate("click");
      return;
    }
    reasonRef.current = null;
  }, [activate, clearCloseTimer, open, reasonRef, reopenAfterClickRef]);

  const scheduleHoverClose = () => {
    if (reasonRef.current !== "hover") return;
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (reasonRef.current !== "hover") return;
      reasonRef.current = null;
      close();
    }, HOVER_CLOSE_DELAY_MS);
  };

  return (
    <>
      <PopoverButton
        ref={buttonRef}
        aria-label={`${furnitureName} 상호작용 학생 ${students.length}명 보기`}
        className="block cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onPointerDown={() => {
          clearPointerInteractionReset();
          pointerOrClickInteractionRef.current = true;
        }}
        onPointerUp={schedulePointerInteractionReset}
        onPointerCancel={() => {
          clearPointerInteractionReset();
          pointerOrClickInteractionRef.current = false;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          clearCloseTimer();
          if (!open && reasonRef.current !== "click") activate("hover");
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleHoverClose();
        }}
        onFocus={(event) => {
          if (
            !shouldOpenPopoverFromFocus({
              activating: activatingRef.current,
              syntheticClick: syntheticClickRef.current,
              pointerOrClickInteraction: pointerOrClickInteractionRef.current,
              focusVisible: event.currentTarget.matches(":focus-visible"),
            })
          )
            return;
          clearCloseTimer();
          if (!open) activate("focus");
        }}
        onClick={() => {
          pointerOrClickInteractionRef.current = true;
          schedulePointerInteractionReset();
          if (syntheticClickRef.current) {
            syntheticClickRef.current = false;
            return;
          }
          if (!open) {
            reasonRef.current = "click";
            return;
          }
          if (reasonRef.current === "hover" || reasonRef.current === "focus") {
            reasonRef.current = "click";
            reopenAfterClickRef.current = true;
          } else {
            reasonRef.current = null;
          }
        }}
      >
        {children}
      </PopoverButton>
      <PopoverPanel
        anchor="top"
        className="popover-surface p-2.5 z-layer-navigation-menu w-max max-w-[min(15rem,calc(100vw-1.5rem))] [--anchor-gap:0.375rem]"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") clearCloseTimer();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleHoverClose();
        }}
      >
        <p className="text-xs text-muted-foreground">상호작용 학생</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {students.map((student) => (
            <Link
              key={student.uid}
              to={`/students/${student.uid}`}
              aria-label={student.name}
              title={student.name}
              onClick={() => close()}
              className="rounded-full ring-offset-background transition hover:ring-2 hover:ring-primary/40 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ProfileImage studentUid={student.uid} imageSize={10} />
            </Link>
          ))}
        </div>
      </PopoverPanel>
    </>
  );
}
