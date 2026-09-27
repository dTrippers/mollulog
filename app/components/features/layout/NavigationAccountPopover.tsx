import {
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSubmit } from "react-router";
import { ProfileImage, Toggle } from "~/components/primitives";
import type { NavigationItem } from "./navigation-menu";
import { submitPreference } from "~/routes/api.preference";
import { cn } from "~/lib/utils";

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
  const popoverId = `navigation-account-${useId().replaceAll(":", "")}`;
  const location = useLocation();
  const submit = useSubmit();
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

  const close = useCallback((returnFocus = false) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const width = 224;
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
    submitPreference(submit, { darkMode: next });
    onDarkModeChange(next);
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
          className="flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={onShowSignIn}
          aria-label="로그인"
        >
          <UserCircleIcon className="size-5" aria-hidden="true" />
          <span className="text-[11px] leading-4">로그인</span>
        </button>
        <button
          type="button"
          className="flex min-h-11 w-[60px] flex-col items-center justify-center gap-0.5 rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          onClick={() => toggleDarkMode(!darkMode)}
          aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
        >
          <ModeIcon className="size-5" aria-hidden="true" />
          <span className="text-[11px] leading-4">다크 모드</span>
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-background px-2 py-1.5 text-left text-sm font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
          onClick={onShowSignIn}
        >
          <UserCircleIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">로그인</span>
        </button>
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
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
          "relative flex min-h-10 w-full items-center rounded-md transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          variant === "expanded" ? "gap-2 bg-background px-2 py-1.5 text-left text-sm font-medium" : "flex-col justify-center gap-0.5 px-1 text-foreground/70",
          (isActive || isOpen) && "bg-muted text-foreground",
        )}
        aria-label={`계정 ${username}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        {profileStudentId ? (
          variant === "expanded" ? (
            <ProfileImage studentUid={profileStudentId} imageSize={6} />
          ) : (
            <span className="flex size-7 items-center justify-center [&>img]:!size-7">
              <ProfileImage studentUid={profileStudentId} imageSize={8} />
            </span>
          )
        ) : (
          <UserCircleIcon className={variant === "expanded" ? "size-5 shrink-0" : "size-6"} aria-hidden="true" />
        )}
        {variant === "expanded" ? (
          <>
            <span className="min-w-0 flex-1 truncate">{username}</span>
            <ChevronUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
            "fixed z-layer-navigation-menu w-56 rounded-lg bg-card p-2 text-card-foreground shadow-lg shadow-black/10 dark:shadow-md dark:shadow-black/30",
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
              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {profileStudentId ? <ProfileImage studentUid={profileStudentId} imageSize={8} /> : <UserCircleIcon className="size-8 text-muted-foreground" aria-hidden="true" />}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">@{username}</span>
                <span className="text-xs text-muted-foreground">{profileAction.name}</span>
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
                className="flex min-h-10 items-center gap-3 rounded-md px-2 py-2 text-sm font-normal hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {action.name}
              </Link>
            );
          })}
          <div className="flex min-h-10 items-center gap-3 rounded-md px-2 py-2 text-sm font-normal">
            <ModeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">다크 모드</span>
            <Toggle
              initialState={darkMode}
              aria-label="다크 모드"
              className="my-0"
              onChange={(enabled) => toggleDarkMode(enabled)}
            />
          </div>
          {signOutAction ? (
            <Link
              to={signOutAction.to}
              className="flex min-h-10 items-center rounded-md px-2 py-2 text-sm font-normal hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {signOutAction.name}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
