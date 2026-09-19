import type { UtcIsoString } from "~/lib/date-time";

/** One reviewed student summary published from the AL-1S admin workflow. */
export type StudentSummary = {
  summary: string;
  publishedAt: UtcIsoString;
};
