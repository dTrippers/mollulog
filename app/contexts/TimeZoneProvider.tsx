import { createContext, useContext } from "react";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, type TimeZoneId } from "~/lib/date-time";

const TimeZoneContext = createContext<TimeZoneId>(DEFAULT_TIME_ZONE);

export function TimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <TimeZoneContext.Provider value={normalizeTimeZone(timeZone)}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useDisplayTimeZone(): TimeZoneId {
  return useContext(TimeZoneContext);
}
