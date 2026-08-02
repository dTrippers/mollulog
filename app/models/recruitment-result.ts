import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";

export type RecruitmentResultStudent = {
  studentUid: string;
  tier: number;
  pickup: boolean;
};

export type RecruitmentCompletionMeta = {
  tier: number;
  pickup: boolean;
  recruitmentType: RecruitmentTypeEnum;
};

export type RecruitmentResult = {
  uid: string;
  userId: number;
  recruitmentGroupUid: string;
  contentUid: string | null;
  completedAt: UtcIsoString | null;
  recruitedStudents: RecruitmentResultStudent[];
  exchangedStudents: RecruitmentResultStudent[];
  tier3Count?: number | null;
  trial: number | null;
  rawResult: string | null;
  commentPostUid: string | null;
  createdAt: UtcIsoString;
  updatedAt: UtcIsoString;
};

export type UpsertRecruitmentResultInput = {
  uid?: string;
  recruitmentGroupUid: string;
  contentUid?: string | null;
  completedAt?: UtcIsoString | null;
  recruitedStudents?: RecruitmentResultStudent[];
  exchangedStudents?: RecruitmentResultStudent[];
  tier3Count?: number | null;
  trial?: number | null;
  rawResult?: string | null;
  comment?: string | null;
  subjectStudentUid?: string | null;
};

export type AddRecruitedStudentToResultInput = {
  recruitmentGroupUid: string;
  contentUid?: string | null;
  studentUid: string;
  tier?: number | null;
  pickup?: boolean;
};
