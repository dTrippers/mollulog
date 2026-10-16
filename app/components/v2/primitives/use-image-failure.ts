import { type SyntheticEvent, useEffect, useRef, useState } from "react";

// Tracks whether an image failed to load. A failure counts only for the source it belongs to, so a new source starts
// clean in the same commit, and a caller never acts on a failure from the previous source. An image that failed before
// hydration fires no error event, so after mount the element's own state is checked as well.
export function useImageFailure(src: string | null) {
  const ref = useRef<HTMLImageElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const image = ref.current;
    if (image && src && image.complete && image.naturalWidth === 0) {
      setFailedSrc(src);
    }
  }, [src]);

  return {
    ref,
    failed: src !== null && failedSrc === src,
    // The source the element carries, so a late error from an earlier source does not mark the current one.
    onError: (event: SyntheticEvent<HTMLImageElement>) => setFailedSrc(event.currentTarget.getAttribute("src")),
  };
}
