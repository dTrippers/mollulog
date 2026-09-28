import { useCallback, useEffect, useState } from "react";
import type { GuestPlannerEnvelope } from "~/domain/guest-planner";
import {
  type GuestPlannerSnapshot,
  readGuestPlanner,
  resetGuestPlanner,
  subscribeGuestPlanner,
  updateGuestPlanner,
} from "~/lib/guest-planner.client";

export function useGuestPlanner() {
  const [snapshot, setSnapshot] = useState<GuestPlannerSnapshot | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readGuestPlanner());
    refresh();
    return subscribeGuestPlanner(refresh);
  }, []);

  const update = useCallback(async (updater: (current: GuestPlannerEnvelope) => GuestPlannerEnvelope) => {
    const next = await updateGuestPlanner(updater);
    setSnapshot(next);
    return next;
  }, []);

  const reset = useCallback(async () => {
    const next = await resetGuestPlanner();
    setSnapshot(next);
    return next;
  }, []);

  return { snapshot, update, reset };
}
