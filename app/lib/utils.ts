import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The 2.0 spacing scale (`--spacing-v2-*` in app/tailwind.css). tailwind-merge reads the spacing theme for min-h, h, and
// size classes, so without these keys `min-h-0` would not replace `min-h-v2-row-min`, and both classes would ship.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "v2-row-y",
        "v2-row-x",
        "v2-media-gap",
        "v2-list-gap",
        "v2-group-gap",
        "v2-block-p",
        "v2-block-gap",
        "v2-column-gap",
        "v2-row-min",
        "v2-control-min",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
