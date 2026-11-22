export type PopoverPlacement = "below" | "above";
export type PopoverPosition = { top: number; left: number; placement: PopoverPlacement };

// Places a fixed panel against its trigger. It opens below the trigger, flips above when the panel does not fit below
// and fits above, and keeps its left edge inside the viewport. The panel's left edge aligns with the trigger's.
// `insets` is the part of the viewport covered by fixed bars, such as the mobile header and bottom navigation. The panel
// stays between them, so a bar never hides it.
export function getPopoverPosition({
  anchor,
  panel,
  viewport,
  placement: requestedPlacement = "auto",
  insets = { top: 0, bottom: 0 },
  gap = 8,
  margin = 8,
}: {
  anchor: { top: number; bottom: number; left: number };
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  placement?: "auto" | "above";
  insets?: { top: number; bottom: number };
  gap?: number;
  margin?: number;
}): PopoverPosition {
  const minTop = insets.top + margin;
  const maxBottom = viewport.height - insets.bottom - margin;
  const roomBelow = maxBottom - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - minTop;
  let placement: PopoverPlacement = requestedPlacement === "above" ? "above" : "below";
  if (
    requestedPlacement === "auto" &&
    panel.height > roomBelow &&
    (panel.height <= roomAbove || roomAbove > roomBelow)
  ) {
    placement = "above";
  }
  const rawTop = placement === "below" ? anchor.bottom + gap : anchor.top - gap - panel.height;
  const maxTop = Math.max(minTop, maxBottom - panel.height);
  const top = Math.min(Math.max(rawTop, minTop), maxTop);
  const maxLeft = Math.max(margin, viewport.width - margin - panel.width);
  const left = Math.min(Math.max(anchor.left, margin), maxLeft);
  return { top, left, placement };
}

// The tallest the panel may be: the viewport between the fixed bars, less the margin on each side. A taller panel scrolls,
// so its end is never left under a bar.
export function getPopoverMaxHeight({
  viewportHeight,
  insets = { top: 0, bottom: 0 },
  margin = 8,
}: {
  viewportHeight: number;
  insets?: { top: number; bottom: number };
  margin?: number;
}): number {
  return Math.max(0, viewportHeight - insets.top - insets.bottom - margin * 2);
}
