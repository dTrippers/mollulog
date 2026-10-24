import { type SyntheticEvent, useEffect, useRef, useState } from "react";

type ImageStatus = "loading" | "loaded" | "failed";

export function useSourceImageState(src: string | null) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<{ src: string | null; status: ImageStatus }>(() => ({
    src,
    status: "loading",
  }));

  if (state.src !== src) {
    setState({ src, status: "loading" });
  }

  useEffect(() => {
    const image = ref.current;
    if (!src || !image?.complete) return;
    setState((current) =>
      current.src === src ? { src, status: image.naturalWidth > 0 ? "loaded" : "failed" } : current,
    );
  }, [src]);

  const setStatus = (event: SyntheticEvent<HTMLImageElement>, status: Exclude<ImageStatus, "loading">) => {
    if (!src || event.currentTarget.getAttribute("src") !== src) return;
    setState((current) => (current.src === src ? { src, status } : current));
  };

  return {
    ref,
    loaded: src !== null && state.src === src && state.status === "loaded",
    failed: src !== null && state.src === src && state.status === "failed",
    onLoad: (event: SyntheticEvent<HTMLImageElement>) => setStatus(event, "loaded"),
    onError: (event: SyntheticEvent<HTMLImageElement>) => setStatus(event, "failed"),
  };
}
