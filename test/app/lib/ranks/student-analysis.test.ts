import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fetchProtobuf } from "~/lib/ranks/base";
import { fetchStudentAnalysis } from "~/lib/ranks/student-analysis";

jest.mock("~/lib/ranks/base", () => ({
  RANK_API_BASE_URL: "http://localhost:8080",
  createProtobufRootCache: jest.fn(() => jest.fn()),
  fetchProtobuf: jest.fn(),
}));

const mockedFetchProtobuf = fetchProtobuf as jest.MockedFunction<typeof fetchProtobuf>;

describe("fetchStudentAnalysis", () => {
  beforeEach(() => {
    mockedFetchProtobuf.mockResolvedValue({
      scopes: [],
      synergy: [],
      totalEntries: 0,
    } as never);
  });

  it("requests student analysis with GET query parameters only", async () => {
    await fetchStudentAnalysis({ studentUid: "20008", topSynergy: 5 });

    expect(mockedFetchProtobuf).toHaveBeenCalledTimes(1);
    const [params] = mockedFetchProtobuf.mock.calls[0];
    expect(params).toMatchObject({
      url: "http://localhost:8080/v1/student-analysis?studentUid=20008&topSynergy=5",
      method: "GET",
      messageType: "student_analysis.StudentAnalysisResponse",
    });
    expect(params).not.toHaveProperty("headers");
    expect(params).not.toHaveProperty("body");
  });
});
