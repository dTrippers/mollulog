import { describe, expect, it } from "@jest/globals";
import { shouldCloseNotificationPopoverOnFocusOut } from "~/components/features/layout/NotificationHistoryPopover";

describe("notification history focus boundary", () => {
  it("keeps focus within the trigger/panel root and closes for outside focus", () => {
    const internalTarget = {};
    const outsideTarget = {};
    const root = {
      contains: (target: unknown) => target === internalTarget,
    } as unknown as Node;

    expect(shouldCloseNotificationPopoverOnFocusOut(root, internalTarget as unknown as EventTarget)).toBe(false);
    expect(shouldCloseNotificationPopoverOnFocusOut(root, outsideTarget as unknown as EventTarget)).toBe(true);
    expect(shouldCloseNotificationPopoverOnFocusOut(root, null)).toBe(true);
  });
});
