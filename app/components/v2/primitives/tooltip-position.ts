export type TooltipPlacement = "above" | "below";
export type TooltipPosition = { top: number; left: number; placement: TooltipPlacement; arrowLeft: number };

// The arrow keeps this far from the tooltip's left and right edges, so it never sits on a rounded corner.
const ARROW_EDGE_INSET = 8;

// Places a fixed tooltip against its trigger, as the 1.x HoverTooltip does. It is centered above the trigger with a gap,
// flips below when it does not fit above, and keeps its edges inside the viewport. With `prefer: "below"` it sits below
// the trigger instead, for a trigger at the top of the screen, and flips above when it does not fit below. `arrowLeft`
// is the arrow's x offset inside the tooltip, so the arrow points at the trigger's center even when the tooltip is
// pushed in from an edge.
export function getTooltipPosition({
  anchor,
  tooltip,
  viewport,
  gap = 8,
  margin = 8,
  prefer = "above",
}: {
  anchor: { top: number; bottom: number; left: number; width: number };
  tooltip: { width: number; height: number };
  // The height is needed only with `prefer: "below"`.
  viewport: { width: number; height?: number };
  gap?: number;
  margin?: number;
  prefer?: TooltipPlacement;
}): TooltipPosition {
  const fitsAbove = anchor.top - gap - tooltip.height >= margin;
  const fitsBelow = viewport.height === undefined || anchor.bottom + gap + tooltip.height <= viewport.height - margin;
  const placement: TooltipPlacement =
    prefer === "below" ? (fitsBelow || !fitsAbove ? "below" : "above") : fitsAbove ? "above" : "below";
  const top = placement === "above" ? anchor.top - gap - tooltip.height : anchor.bottom + gap;
  const center = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - tooltip.width);
  const left = Math.min(Math.max(center - tooltip.width / 2, margin), maxLeft);
  const arrowLeft = Math.min(
    Math.max(center - left, ARROW_EDGE_INSET),
    Math.max(ARROW_EDGE_INSET, tooltip.width - ARROW_EDGE_INSET),
  );
  return { top, left, placement, arrowLeft };
}
