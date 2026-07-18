import { useEffect, useState } from "react";

type WakeLockSentinelLike = {
  release(): Promise<void>;
  released: boolean;
  addEventListener(type: "release", listener: () => void): void;
};
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };

export function useWakeLock(enabled: boolean) {
  const [active, setActive] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const request = async () => {
      const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
      if (!wakeLock) {
        setUnavailable(true);
        return;
      }
      try {
        sentinel = await wakeLock.request("screen");
        sentinel.addEventListener("release", () => {
          if (!cancelled) setActive(false);
        });
        if (cancelled) await sentinel.release();
        else setActive(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void request();
    };

    void request();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [enabled]);

  return { active, unavailable };
}
