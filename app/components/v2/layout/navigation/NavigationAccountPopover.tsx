import { ChevronDownIcon, ChevronUpIcon, MoonIcon, SunIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { HaloModeIcon } from "~/components/media/HaloModeIcon";
import { SenseiAvatar } from "~/components/v2/features/comments/SenseiAvatar";
import { Switch } from "~/components/v2/primitives/Switch";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { submitPreference } from "~/lib/preference-submission.client";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../styles";
import type { NavigationItem } from "./navigation-menu";

type NavigationAccountPopoverProps = {
  variant: "expanded" | "rail";
  username: string | null;
  profileStudentId: string | null;
  darkMode: boolean;
  isActive: boolean;
  actions: NavigationItem[];
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onDarkModeChange: (darkMode: boolean) => void;
  onShowSignIn: () => void;
};

type PopoverPosition = { top: number; left: number };

export function NavigationAccountPopover({
  variant,
  username,
  profileStudentId,
  darkMode,
  isActive,
  isOpen: controlledIsOpen,
  onOpenChange,
  actions,
  onDarkModeChange,
  onShowSignIn,
}: NavigationAccountPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen;
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const idPrefix = useId().replaceAll(":", "");
  const popoverId = `navigation-account-${idPrefix}`;
  const darkModeSwitchId = `navigation-dark-mode-${idPrefix}`;
  const haloModeSwitchId = `navigation-halo-mode-${idPrefix}`;
  const location = useLocation();
  const { haloMode, setHaloMode } = useHaloMode();
  const locationKey = `${location.pathname}\n${location.search}\n${location.hash}`;
  const previousLocationKeyRef = useRef(locationKey);

  const setIsOpen = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) setPosition(null);
      if (controlledIsOpen === undefined) setUncontrolledIsOpen(nextIsOpen);
      onOpenChange?.(nextIsOpen);
    },
    [controlledIsOpen, onOpenChange],
  );

  const close = useCallback(
    (returnFocus = false) => {
      setIsOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setIsOpen],
  );

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const width = 264;
      const height = Math.min(popoverRef.current?.offsetHeight ?? 240, window.innerHeight - viewportPadding * 2);
      const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
      const maxTop = Math.max(viewportPadding, window.innerHeight - height - viewportPadding);
      const left = variant === "rail" ? rect.right + 8 : rect.left;
      setPosition({
        top: Math.min(maxTop, Math.max(viewportPadding, rect.top - height - 8)),
        left: Math.min(maxLeft, Math.max(viewportPadding, left)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, variant]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    const closeOnFocusOut = (event: FocusEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) return;
      if (event.relatedTarget && root.contains(event.relatedTarget as Node)) return;
      close();
    };
    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("focusout", closeOnFocusOut);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("focusout", closeOnFocusOut);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (previousLocationKeyRef.current === locationKey) return;
    previousLocationKeyRef.current = locationKey;
    close();
  }, [close, locationKey]);

  const toggleDarkMode = (next: boolean) => {
    void submitPreference({ darkMode: next }).catch(() => undefined);
    onDarkModeChange(next);
  };
  const toggleHaloMode = (next: boolean) => {
    void submitPreference({ haloMode: next }).catch(() => undefined);
    setHaloMode(next);
  };
  const ModeIcon = darkMode ? SunIcon : MoonIcon;
  const profileAction = actions.find((action) => action.group === "account" && action.to.startsWith("/@"));
  const settingsActions = actions.filter((action) => action.group === "settings");
  const signOutAction = actions.find((action) => action.group === "account" && action.to === "/signout");

  if (!username) {
    return variant === "rail" ? (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          className={cn(
            "flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
            v2FocusRing,
          )}
          onClick={onShowSignIn}
          aria-label="로그인"
        >
          <UserCircleIcon className="size-5" aria-hidden="true" />
          <span className="text-[11px] leading-4">로그인</span>
        </button>
        <HaloModeButton variant="rail" haloMode={haloMode} onToggle={() => toggleHaloMode(!haloMode)} />
        <button
          type="button"
          className={cn(
            "flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
            v2FocusRing,
          )}
          onClick={() => toggleDarkMode(!darkMode)}
          aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
        >
          <ModeIcon className="size-5" aria-hidden="true" />
          <span className="text-[11px] leading-4">{darkMode ? "라이트 모드" : "다크 모드"}</span>
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
            v2FocusRing,
          )}
          onClick={onShowSignIn}
        >
          <UserCircleIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">로그인</span>
        </button>
        <HaloModeButton variant="expanded" haloMode={haloMode} onToggle={() => toggleHaloMode(!haloMode)} />
        <button
          type="button"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
            v2FocusRing,
          )}
          onClick={() => toggleDarkMode(!darkMode)}
          aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          title={darkMode ? "라이트 모드" : "다크 모드"}
        >
          <ModeIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} data-account-variant={variant} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "relative flex min-h-10 w-full items-center rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
          variant === "expanded"
            ? "gap-2 px-2 py-1.5 text-left text-sm font-medium"
            : "flex-col justify-center gap-0.5 px-1",
          (isActive || isOpen) && "bg-v2-nav-active text-v2-fg",
          v2FocusRing,
        )}
        aria-label={`계정 ${username}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        {profileStudentId ? (
          <SenseiAvatar profileStudentId={profileStudentId} size={variant === "expanded" ? "compact" : "default"} />
        ) : (
          <UserCircleIcon className={variant === "expanded" ? "size-5 shrink-0" : "size-6"} aria-hidden="true" />
        )}
        {variant === "expanded" ? (
          <>
            <span className="min-w-0 flex-1 truncate">{username}</span>
            {isOpen ? (
              <ChevronUpIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            )}
          </>
        ) : (
          <span className="max-w-full truncate text-[11px] leading-4">계정</span>
        )}
      </button>

      {isOpen ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label="계정 메뉴"
          aria-hidden={!position}
          className={cn(
            "fixed z-layer-navigation-menu w-66 overflow-y-auto rounded-lg bg-v2-popover-surface p-1.5 shadow-md ring-1 ring-v2-popover-divider backdrop-blur-sm",
            !position && "pointer-events-none invisible opacity-0",
          )}
          style={{
            ...(position ? { top: position.top, left: position.left } : {}),
            maxHeight: "calc(100dvh - 1.5rem)",
            overflowY: "auto",
          }}
        >
          {profileAction ? (
            <Link
              to={profileAction.to}
              aria-current={profileAction.isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-v2-fg transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover",
                v2FocusRing,
              )}
            >
              <SenseiAvatar profileStudentId={profileStudentId} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">@{username}</span>
                <span className="text-xs text-v2-fg-tertiary">{profileAction.name}</span>
              </span>
            </Link>
          ) : null}
          {settingsActions.map((action) => {
            const Icon = action.OutlineIcon;
            return (
              <Link
                key={action.to}
                to={action.to}
                aria-current={action.isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-2 py-2 text-sm font-normal text-v2-fg transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover",
                  v2FocusRing,
                )}
              >
                <Icon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
                {action.name}
              </Link>
            );
          })}
          <div className="flex min-h-10 items-center gap-3 rounded-md px-2 py-2">
            <ModeIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Switch
                id={darkModeSwitchId}
                checked={darkMode}
                onCheckedChange={toggleDarkMode}
                label="다크 모드"
                size="sm"
              />
            </div>
          </div>
          <div className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2">
            <HaloModeIcon className="size-4 shrink-0 text-v2-fg-tertiary" />
            <div className="min-w-0 flex-1">
              <Switch
                id={haloModeSwitchId}
                checked={haloMode}
                onCheckedChange={toggleHaloMode}
                label="헤일로 모드"
                description="학생·이벤트 썸네일을 가려요"
                size="sm"
              />
            </div>
          </div>
          {signOutAction ? (
            <Link
              to={signOutAction.to}
              className={cn(
                "flex min-h-10 items-center rounded-md px-2 py-2 text-sm font-normal text-v2-danger transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover",
                v2FocusRing,
              )}
            >
              {signOutAction.name}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HaloModeButton({
  variant,
  haloMode,
  onToggle,
}: {
  variant: "expanded" | "rail";
  haloMode: boolean;
  onToggle: () => void;
}) {
  const descriptionId = `halo-button-description-${useId().replaceAll(":", "")}`;
  return (
    <>
      <button
        type="button"
        className={
          variant === "rail"
            ? cn(
                "flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
                v2FocusRing,
              )
            : cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-v2-fg-secondary transition-colors duration-v2-fast ease-v2-standard hover:bg-v2-hover hover:text-v2-fg",
                v2FocusRing,
              )
        }
        onClick={onToggle}
        aria-label="헤일로 모드"
        aria-pressed={haloMode}
        aria-describedby={descriptionId}
        title="학생·이벤트 썸네일을 가려요"
      >
        <HaloModeIcon solid={haloMode} className={variant === "rail" ? "size-5" : "size-4"} />
        {variant === "rail" ? <span className="text-[11px] leading-4">헤일로 모드</span> : null}
      </button>
      <span id={descriptionId} className="sr-only">
        학생·이벤트 썸네일을 가려요
      </span>
    </>
  );
}
