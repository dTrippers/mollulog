export type PopoverPlacement = "below" | "above";
export type PopoverPosition = { top: number; left: number; placement: PopoverPlacement };

// Places a fixed panel against its trigger. It opens below the trigger, flips above when the panel does not fit below
// and fits above, and keeps its left edge inside the viewport. The panel's left edge aligns with the trigger's.
export function getPopoverPosition({
  anchor,
  panel,
  viewport,
  placement: requestedPlacement = "auto",
  gap = 8,
  margin = 8,
}: {
  anchor: { top: number; bottom: number; left: number };
  panel: { width: number; height: number };
  viewport: { width: number; height: number };
  placement?: "auto" | "above";
  gap?: number;
  margin?: number;
}): PopoverPosition {
  const roomBelow = viewport.height - margin - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - margin;
  let placement: PopoverPlacement = requestedPlacement === "above" ? "above" : "below";
  if (
    requestedPlacement === "auto" &&
    panel.height > roomBelow &&
    (panel.height <= roomAbove || roomAbove > roomBelow)
  ) {
    placement = "above";
  }
  const rawTop = placement === "below" ? anchor.bottom + gap : anchor.top - gap - panel.height;
  const maxTop = Math.max(margin, viewport.height - margin - panel.height);
  const top = Math.min(Math.max(rawTop, margin), maxTop);
  const maxLeft = Math.max(margin, viewport.width - margin - panel.width);
  const left = Math.min(Math.max(anchor.left, margin), maxLeft);
  return { top, left, placement };
}
