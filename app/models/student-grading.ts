import type { UtcIsoString } from "~/lib/date-time";
import type { StudentGradingTagValue } from "./student-grading-tag";

export type StudentGrading = {
  uid: string;
  studentUid: string;
  comment: string | null;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
  tags?: StudentGradingTagValue[];
};

export type StudentGradingWithUser = StudentGrading & {
  user: {
    username: string;
    profileStudentId: string | null;
  };
};

export type StudentGradingPageWithUser = {
  items: StudentGradingWithUser[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};
