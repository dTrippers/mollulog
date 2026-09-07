import { BellAlertIcon, Cog6ToothIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { Button } from "~/components/primitives";
import type { NotificationHistoryItem, NotificationHistoryResponse } from "~/domain/notification-history";
import { cn } from "~/lib/utils";

type NotificationHistoryPopoverProps = {
  placement: "desktop" | "mobile";
  unreadCount: number;
  onUnreadCountChange?: (count: number) => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

type PopoverPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type ReadResponse = {
  ok: true;
  unreadCount: number;
};

const LOAD_ERROR_MESSAGE = "알림을 불러오지 못했어요";
const READ_ERROR_MESSAGE = "읽음 처리하지 못했어요. 새 알림 표시를 유지하고 있어요.";

export function shouldCloseNotificationPopoverOnFocusOut(
  root: Pick<Node, "contains">,
  relatedTarget: EventTarget | null,
): boolean {
  return relatedTarget === null || !root.contains(relatedTarget as Node);
}

export default function NotificationHistoryPopover({
  placement,
  unreadCount,
  onUnreadCountChange,
  isOpen: controlledIsOpen,
  onOpenChange,
}: NotificationHistoryPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestIdRef = useRef(0);
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [notifications, setNotifications] = useState<NotificationHistoryItem[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const location = useLocation();
  const popoverId = `notification-history-${useId().replaceAll(":", "")}`;
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen;
  const locationKey = `${location.pathname}\n${location.search}\n${location.hash}`;
  const previousLocationKeyRef = useRef(locationKey);

  const setIsOpen = useCallback(
    (nextIsOpen: boolean) => {
      if (controlledIsOpen === undefined) {
        setUncontrolledIsOpen(nextIsOpen);
      }
      onOpenChange?.(nextIsOpen);
    },
    [controlledIsOpen, onOpenChange],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(352, Math.max(0, window.innerWidth - viewportPadding * 2));
    const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
    const left = placement === "mobile" ? maxLeft : Math.min(maxLeft, Math.max(viewportPadding, rect.left));
    const top = Math.max(viewportPadding, rect.bottom + 8);

    setPosition({
      top,
      left,
      width,
      maxHeight: Math.min(420, Math.max(0, window.innerHeight - top - viewportPadding)),
    });
  }, [placement]);

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    const closeOnFocusOut = (event: FocusEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) {
        return;
      }
      if (shouldCloseNotificationPopoverOnFocusOut(root, event.relatedTarget)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("focusout", closeOnFocusOut);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("focusout", closeOnFocusOut);
    };
  }, [isOpen, setIsOpen]);

  const markSnapshotRead = useCallback(
    async (watermark: string, requestId: number) => {
      try {
        const response = await fetch("/api/notifications", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "mark-read", watermark }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isReadResponse(body)) {
          throw new Error(READ_ERROR_MESSAGE);
        }

        if (requestIdRef.current === requestId) {
          onUnreadCountChange?.(body.unreadCount);
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setReadError(READ_ERROR_MESSAGE);
        }
      }
    },
    [onUnreadCountChange],
  );

  const loadNotifications = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadState("loading");
    setLoadError(null);
    setReadError(null);
    setNotifications([]);

    try {
      const response = await fetch("/api/notifications", { credentials: "same-origin" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isNotificationHistoryResponse(body)) {
        throw new Error(LOAD_ERROR_MESSAGE);
      }

      if (requestIdRef.current !== requestId) {
        return;
      }
      setNotifications(body.notifications);
      setLoadState("loaded");

      if (body.snapshotMaxDeliveredAt) {
        void markSnapshotRead(body.snapshotMaxDeliveredAt, requestId);
      }
    } catch {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setLoadState("error");
      setLoadError(LOAD_ERROR_MESSAGE);
    }
  }, [markSnapshotRead]);

  useEffect(() => {
    if (isOpen) {
      void loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    if (previousLocationKeyRef.current !== locationKey) {
      previousLocationKeyRef.current = locationKey;
      setIsOpen(false);
    }
  }, [locationKey, setIsOpen]);

  const unreadLabel = unreadCount === 1 ? "읽지 않은 알림 1개" : `읽지 않은 알림 ${unreadCount}개`;
  const triggerLabel = `알림, ${unreadLabel}, ${isOpen ? "닫기" : "열기"}`;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "relative inline-flex items-center justify-center rounded-md bg-background text-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          "size-9",
        )}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={triggerLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
      >
        <BellAlertIcon className="size-5" strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="알림"
          className={cn(
            "fixed z-layer-navigation-menu flex flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20",
            position ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={
            position
              ? {
                  top: position.top,
                  left: position.left,
                  width: position.width,
                  maxHeight: position.maxHeight,
                }
              : undefined
          }
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <h2 className="text-base font-semibold text-foreground">알림</h2>
            <Link
              to="/notifications"
              aria-label="알림 설정"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              onClick={() => setIsOpen(false)}
            >
              <Cog6ToothIcon className="size-5" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loadState === "loading" ? <NotificationHistoryLoading /> : null}
            {loadState === "error" ? (
              <div className="px-2 py-6 text-center" role="alert">
                <ExclamationTriangleIcon className="mx-auto size-6 text-destructive" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-foreground">{loadError ?? LOAD_ERROR_MESSAGE}</p>
                <button
                  type="button"
                  className="mt-3 min-h-10 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={() => void loadNotifications()}
                >
                  다시 시도
                </button>
              </div>
            ) : null}
            {loadState === "loaded" && notifications.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">도착한 알림이 없어요</p>
            ) : null}
            {loadState === "loaded" && notifications.length > 0 ? (
              <ul className="space-y-1" aria-label="최근 알림">
                {notifications.map((notification) => (
                  <NotificationHistoryRow
                    key={notification.uid}
                    notification={notification}
                    onAction={() => setIsOpen(false)}
                  />
                ))}
              </ul>
            ) : null}
            {readError ? (
              <p className="px-2 py-2 text-xs text-destructive" role="status">
                {readError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {loadState === "loaded" ? `최근 알림 ${notifications.length}개를 불러왔어요` : ""}
      </span>
    </div>
  );
}

function NotificationHistoryLoading() {
  return (
    <div className="space-y-1" role="status" aria-label="알림 불러오는 중">
      {["first", "second", "third", "fourth"].map((key) => (
        <div key={key} className="animate-pulse rounded-lg px-3 py-3" aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-12 rounded bg-muted" />
          </div>
          <div className="mt-2 h-3 w-full rounded bg-muted" />
          <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function NotificationHistoryRow({
  notification,
  onAction,
}: {
  notification: NotificationHistoryItem;
  onAction: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg px-3 py-3 text-sm transition-colors",
        notification.isUnread ? "bg-primary/10 text-foreground" : "text-foreground/85",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {notification.isUnread ? (
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
          <span className={cn("truncate text-foreground", notification.isUnread ? "font-semibold" : "font-medium")}>
            {notification.typeLabel}
          </span>
          {notification.isUnread ? <span className="sr-only">읽지 않음</span> : null}
        </div>
        <time
          dateTime={notification.deliveredAt}
          className="shrink-0 text-xs text-muted-foreground"
          title={notification.deliveredAt}
        >
          {notification.relativeTime}
        </time>
      </div>

      {notification.message.state === "available" ? (
        <p className="mt-2 whitespace-pre-line break-words text-foreground/75 leading-relaxed">
          {notification.message.text}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{notification.message.text}</p>
      )}

      {notification.action?.state === "available" ? (
        <Button
          to={notification.action.to}
          size="sm"
          className="mt-2 border-transparent bg-transparent text-primary shadow-none hover:bg-primary/10 hover:text-primary"
          onClick={onAction}
        >
          {notification.action.label}
        </Button>
      ) : notification.action?.state === "unavailable" ? (
        <p className="mt-2 text-xs text-muted-foreground">{notification.action.text}</p>
      ) : null}
    </li>
  );
}

function isNotificationHistoryResponse(value: unknown): value is NotificationHistoryResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const response = value as Partial<NotificationHistoryResponse>;
  return (
    Array.isArray(response.notifications) &&
    (response.snapshotMaxDeliveredAt === null || typeof response.snapshotMaxDeliveredAt === "string")
  );
}

function isReadResponse(value: unknown): value is ReadResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const response = value as Partial<ReadResponse>;
  return (
    response.ok === true &&
    typeof response.unreadCount === "number" &&
    Number.isSafeInteger(response.unreadCount) &&
    response.unreadCount >= 0
  );
}
