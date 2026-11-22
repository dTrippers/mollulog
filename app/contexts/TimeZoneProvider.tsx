import { createContext, useContext } from "react";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, type TimeZoneId } from "~/lib/date-time";

const TimeZoneContext = createContext<TimeZoneId>(DEFAULT_TIME_ZONE);
const TimeZoneResolvedContext = createContext(false);

export function TimeZoneProvider({
  timeZone,
  resolved = true,
  children,
}: {
  timeZone: string | null | undefined;
  resolved?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TimeZoneContext.Provider value={normalizeTimeZone(timeZone)}>
      <TimeZoneResolvedContext.Provider value={resolved}>{children}</TimeZoneResolvedContext.Provider>
    </TimeZoneContext.Provider>
  );
}

export function useDisplayTimeZone(): TimeZoneId {
  return useContext(TimeZoneContext);
}

export function useIsDisplayTimeZoneResolved(): boolean {
  return useContext(TimeZoneResolvedContext);
}
