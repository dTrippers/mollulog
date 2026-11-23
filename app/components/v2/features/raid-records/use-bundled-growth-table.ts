import { useEffect, useRef, useState } from "react";
import { useV2Page } from "../../layout/V2Page";

// Every growth value in one row needs about this much width; a narrower box shows one bundle at a time instead of a
// table that scrolls sideways.
const FULL_TABLE_MIN_WIDTH = 800;

export function useBundledGrowthTable() {
  const { stacked } = useV2Page();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, bundled: stacked || (width !== null && width < FULL_TABLE_MIN_WIDTH) };
}
