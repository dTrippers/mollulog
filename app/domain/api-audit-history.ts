export const API_AUDIT_HISTORY_DIRECT_SOURCES = [
  "recruited_student",
  "recruited_student_batch",
  "student_growth",
  "student_growth_form",
  "relationship_level",
  "student_basic_info",
] as const;

export const API_AUDIT_HISTORY_FILTERS = ["all", "direct", "data", "recruitment", "api"] as const;
export type ApiAuditHistoryFilter = (typeof API_AUDIT_HISTORY_FILTERS)[number];
