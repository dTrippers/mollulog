// Tag constants for better maintainability
export const STUDENT_GRADING_TAG_CONSTANTS = {
  PERFORMANCE: "performance",
  UNIVERSAL: "universal",
  GROWTH: "growth",
  LOVE: "love",
} as const;

export type StudentGradingTagKey = keyof typeof STUDENT_GRADING_TAG_CONSTANTS;
export type StudentGradingTagValue = (typeof STUDENT_GRADING_TAG_CONSTANTS)[StudentGradingTagKey];

// Tag display mapping
export const STUDENT_GRADING_TAG_DISPLAY: Record<StudentGradingTagValue, string> = {
  [STUDENT_GRADING_TAG_CONSTANTS.PERFORMANCE]: "성능이 강해요",
  [STUDENT_GRADING_TAG_CONSTANTS.UNIVERSAL]: "범용적으로 활약해요",
  [STUDENT_GRADING_TAG_CONSTANTS.GROWTH]: "저성급으로 충분해요",
  [STUDENT_GRADING_TAG_CONSTANTS.LOVE]: "애정해요",
};

export type StudentGradingTag = {
  uid: string;
  gradingUid: string;
  studentUid: string;
  tagValue: StudentGradingTagValue;
};

export const ALL_STUDENT_GRADING_TAG_VALUES: StudentGradingTagValue[] = Object.values(STUDENT_GRADING_TAG_CONSTANTS);

export function sortStudentGradingTags(tags: StudentGradingTagValue[]) {
  return [...tags].sort(
    (a, b) => ALL_STUDENT_GRADING_TAG_VALUES.indexOf(a) - ALL_STUDENT_GRADING_TAG_VALUES.indexOf(b),
  );
}

export type StudentGradingTagCount = {
  tag: StudentGradingTagValue;
  displayName: string;
  count: number;
};
