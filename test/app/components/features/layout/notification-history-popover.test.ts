import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const popoverSource = readFileSync("app/components/features/layout/NotificationHistoryPopover.tsx", "utf8");
const navigationSource = readFileSync("app/components/features/layout/NavigationBar.tsx", "utf8");

describe("notification history popover composition", () => {
  it("keeps the trigger account-gated and exposes the real unread count accessibly", () => {
    expect(navigationSource).toContain("{currentUsername ? (");
    expect(popoverSource).toContain("aria-label={triggerLabel}");
    expect(popoverSource).toContain('unreadCount > 99 ? "99+" : unreadCount');
    expect(popoverSource).toContain("읽지 않은 알림 $" + "{unreadCount}개");
    expect(popoverSource).toContain("key={notification.uid}");
    expect(popoverSource).toContain('"size-9"');
    expect(popoverSource).toContain("Math.min(420");
  });

  it("keeps loading, empty, error, retry, scroll, and header settings states", () => {
    expect(popoverSource).toContain("NotificationHistoryLoading");
    expect(popoverSource).toContain("도착한 알림이 없어요");
    expect(popoverSource).toContain('role="alert"');
    expect(popoverSource).toContain("다시 시도");
    expect(popoverSource).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(popoverSource).toContain("no-scrollbar min-h-0 flex-1 overflow-y-auto");
    expect(popoverSource).not.toContain('overflow-y-auto px-2 pb-2" aria-live=');
    expect(popoverSource).toContain('role="status" aria-live="polite"');
    expect(popoverSource).toMatch(/최근 알림 \$\{notifications\.length\}개를 불러왔어요/);
    expect(popoverSource).toContain("Cog6ToothIcon");
    expect(popoverSource).toContain('aria-label="알림 설정"');
    expect(popoverSource).toContain("flex shrink-0 items-center justify-between");
    expect(popoverSource).not.toContain("border-t border-border/60");
    expect(popoverSource).toContain("bg-popover text-popover-foreground");
    expect(popoverSource).not.toContain("border border-border/70");
  });

  it("keeps unread semantics and safe action rendering in each row", () => {
    expect(popoverSource).toContain("읽지 않음");
    expect(popoverSource).toContain("bg-primary/10");
    expect(popoverSource).toContain("dateTime={notification.deliveredAt}");
    expect(popoverSource).toContain("text-foreground/75");
    expect(popoverSource).toContain("truncate text-foreground");
    expect(popoverSource).toContain('notification.action?.state === "available"');
    expect(popoverSource).toContain('size="sm"');
    expect(popoverSource).toContain("bg-primary/10");
    expect(popoverSource).toContain("notification.action.text");
  });

  it("closes on outside click, Escape, route changes, and actions", () => {
    expect(popoverSource).toContain("closeOnOutsideClick");
    expect(popoverSource).toContain('event.key !== "Escape"');
    expect(popoverSource).toContain("previousLocationKeyRef");
    expect(popoverSource).toContain("onAction={() => setIsOpen(false)}");
    expect(popoverSource).toContain("triggerRef.current?.focus()");
    expect(popoverSource).toContain("response.unreadCount >= 0");
    expect(navigationSource).not.toMatch(/<MobileBrandHeader\s+darkMode=/);
  });
});
