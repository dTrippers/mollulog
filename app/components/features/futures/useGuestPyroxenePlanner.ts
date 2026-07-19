import { useCallback, useEffect, useState } from "react";
import type { GuestPyroxenePlannerData } from "~/domain/guest-pyroxene-planner";
import {
  type GuestPyroxeneSnapshot,
  readGuestPyroxenePlanner,
  resetGuestPyroxenePlanner,
  subscribeGuestPyroxenePlanner,
  updateGuestPyroxenePlanner,
} from "~/lib/guest-pyroxene-planner.client";

export function useGuestPyroxenePlanner() {
  const [snapshot, setSnapshot] = useState<GuestPyroxeneSnapshot | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readGuestPyroxenePlanner());
    refresh();
    return subscribeGuestPyroxenePlanner(refresh);
  }, []);

  const update = useCallback(async (updater: (data: GuestPyroxenePlannerData) => GuestPyroxenePlannerData) => {
    const next = await updateGuestPyroxenePlanner(updater);
    setSnapshot(next);
    return next;
  }, []);

  const reset = useCallback(() => {
    const next = resetGuestPyroxenePlanner();
    setSnapshot(next);
    return next;
  }, []);

  return { snapshot, update, reset };
}
