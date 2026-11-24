import { type SVGProps, useId } from "react";
import { cn } from "~/lib/utils";

// The Arona Intelligence mark: two ribbon loops, a knot and a round head under a level halo, on a 24 grid in one
// color. Its detail follows the size it renders at: "lg" (32px and up) cuts a ring into the right loop, "md" (13 to
// 31px) has no ring, and "xs" (12px and under) draws a thicker halo so it survives the small size.
export type AronaMarkSize = "lg" | "md" | "xs";

const LEAF = "M0-5.1C1.2-3.8 2.2-1.5 2.15.8 2.05 2.9 1.2 4.1 0 4.1S-2.05 2.9-2.15.8C-2.2-1.5-1.2-3.8 0-5.1z";
// The ring is a circle stroke of width 0.5 and radius 0.55 around (0, -2.6), cut out of the leaf by the even-odd rule:
// the circles of radius 0.8 and 0.3 bound it.
const RING = "M-.8-2.6a.8.8 0 1 0 1.6 0a.8.8 0 1 0-1.6 0zM-.3-2.6a.3.3 0 1 0 .6 0a.3.3 0 1 0-.6 0z";
const HEAD =
  "M12 10.9c4.2 0 7.4 2.7 7.4 6.8 0 2.2-.4 4-1.3 5.7-.4-.9-1-1.4-1.7-1.6-1.4.6-2.8.8-4.4.8 s-3-.2-4.4-.8c-.7.2-1.3.7-1.7 1.6-.9-1.7-1.3-3.5-1.3-5.7 0-4.1 3.2-6.8 7.4-6.8z";

function AronaMarkShape({ size }: { size: AronaMarkSize }) {
  return (
    <>
      <g fill="currentColor">
        <path d={LEAF} transform="translate(10.3 9.5) rotate(-8)" />
        <path
          d={size === "lg" ? LEAF + RING : LEAF}
          fillRule={size === "lg" ? "evenodd" : undefined}
          transform="translate(13.9 9.9) rotate(42)"
        />
        <path d={HEAD} />
        <ellipse cx="12" cy="10.2" rx="1.45" ry="1.1" />
      </g>
      <ellipse
        cx="12"
        cy="2.3"
        rx="2.9"
        ry={size === "xs" ? 1.25 : 1}
        fill="none"
        stroke="currentColor"
        strokeWidth={size === "xs" ? 1.5 : 1.1}
      />
    </>
  );
}

type AronaMarkProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & { size?: AronaMarkSize };

// The mark in the current text color.
export function AronaMark({ size = "md", className, ...props }: AronaMarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={cn("shrink-0", className)}>
      <AronaMarkShape size={size} />
    </svg>
  );
}

// The mark filled with the AI gradient. The gradient spans the whole mark, so the shape cuts it out of one square as
// an alpha mask.
export function AronaGradientMark({ size = "md", className, ...props }: AronaMarkProps) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-gradient`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--v2-ai-from)" />
          <stop offset="1" stopColor="var(--v2-ai-to)" />
        </linearGradient>
        <mask
          id={`${id}-shape`}
          maskUnits="userSpaceOnUse"
          x="-2"
          y="-2"
          width="28"
          height="28"
          style={{ maskType: "alpha" }}
        >
          <AronaMarkShape size={size} />
        </mask>
      </defs>
      <rect x="-2" y="-2" width="28" height="28" fill={`url(#${id}-gradient)`} mask={`url(#${id}-shape)`} />
    </svg>
  );
}
