import type { RecruitmentTypeEnum } from "~/graphql/graphql";

export type RecruitmentFeedStats = {
  totalTrial: number | null;
  tier3Count: number;
  pickupCount: number;
};

export type CommunityFeedStatsStudentMap = Record<string, { uid: string; name: string; initialTier: number }>;

export type CommunityFeedStatsRecruitmentGroup = {
  uid: string;
  recruitmentType: RecruitmentTypeEnum;
  recruitments: {
    pickup: boolean;
    recruitmentType: RecruitmentTypeEnum;
    studentName: string;
    student: { uid: string; name: string; initialTier: number } | null;
  }[];
};

export type CommunityFeedStatsTimelineContent = {
  uid: string;
  name: string;
  recruitmentGroupUid: string | null;
  recruitmentStudentUids: string[] | null;
};
