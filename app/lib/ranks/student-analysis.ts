import type { Defense } from "~/graphql/graphql";
import type { RaidType } from "~/models/content.d";
import { RANK_API_BASE_URL, createProtobufRootCache, fetchProtobuf } from "./base";

const STUDENT_ANALYSIS_PROTO_SCHEMA = `
syntax = "proto3";

package student_analysis;

option go_package = "github.com/dTrippers/mollulog-rank/api";

message StudentAnalysisResponse {
  repeated ScopeBands scopes = 1;
  repeated SynergyPartner synergy = 2;
  int64 total_entries = 3;
}

message ScopeBands {
  string raid_type = 1;
  int32 season = 2;
  string defense_type = 3;
  bool loaded = 4;
  repeated UsageBand bands = 5;
}

message UsageBand {
  int64 lo = 1;
  int64 hi = 2;
  int64 own_count = 3;
  int64 assist_count = 4;
  int64 sample_size = 5;
}

message SynergyPartner {
  string partner_uid = 1;
  int64 co_count = 2;
  double co_rate = 3;
}
`;

const getStudentAnalysisProtobufRoot = createProtobufRootCache();

export type StudentAnalysisRequest = {
  studentUid: string;
  topSynergy?: number;
};

type ServerUsageBand = {
  lo: string | number;
  hi: string | number;
  ownCount: string | number;
  assistCount: string | number;
  sampleSize: string | number;
};

type ServerScopeBands = {
  raidType: string;
  season: number;
  defenseType: string;
  loaded: boolean;
  bands: ServerUsageBand[];
};

type ServerSynergyPartner = {
  partnerUid: string;
  coCount: string | number;
  coRate: number;
};

type ServerStudentAnalysisResponse = {
  scopes: ServerScopeBands[];
  synergy: ServerSynergyPartner[];
  totalEntries: string | number;
};

export type StudentAnalysisUsageBand = {
  lo: number;
  hi: number;
  ownCount: number;
  assistCount: number;
  sampleSize: number;
};

export type StudentAnalysisScopeBands = {
  raid: { raidType: RaidType; season: number; defenseType: Defense };
  loaded: boolean;
  bands: StudentAnalysisUsageBand[];
};

export type StudentAnalysisSynergyPartner = {
  partnerUid: string;
  coCount: number;
  coRate: number;
};

export type StudentAnalysisResponse = {
  scopes: StudentAnalysisScopeBands[];
  synergy: StudentAnalysisSynergyPartner[];
  totalEntries: number;
};

export async function fetchStudentAnalysis(request: StudentAnalysisRequest): Promise<StudentAnalysisResponse> {
  const searchParams = new URLSearchParams({ studentUid: request.studentUid });
  if (request.topSynergy !== undefined) {
    searchParams.set("topSynergy", String(request.topSynergy));
  }

  const response = await fetchProtobuf<ServerStudentAnalysisResponse>({
    url: `${RANK_API_BASE_URL}/v1/student-analysis?${searchParams.toString()}`,
    method: "GET",
    schema: STUDENT_ANALYSIS_PROTO_SCHEMA,
    messageType: "student_analysis.StudentAnalysisResponse",
    getRoot: getStudentAnalysisProtobufRoot,
  });

  return convertStudentAnalysisResponse(response);
}

export function convertStudentAnalysisResponse(response: ServerStudentAnalysisResponse): StudentAnalysisResponse {
  return {
    scopes: response.scopes.map((scope) => ({
      raid: {
        raidType: scope.raidType as RaidType,
        season: Number(scope.season),
        defenseType: scope.defenseType as Defense,
      },
      loaded: Boolean(scope.loaded),
      bands: scope.bands.map((band) => ({
        lo: Number(band.lo),
        hi: Number(band.hi),
        ownCount: Number(band.ownCount),
        assistCount: Number(band.assistCount),
        sampleSize: Number(band.sampleSize),
      })),
    })),
    synergy: response.synergy.map((partner) => ({
      partnerUid: partner.partnerUid,
      coCount: Number(partner.coCount),
      coRate: Number(partner.coRate),
    })),
    totalEntries: Number(response.totalEntries),
  };
}
