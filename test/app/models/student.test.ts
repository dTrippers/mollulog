import { describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { formatStudentFullName, getAllStudents, syncRawStudents } from "~/models/student";

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

describe("formatStudentFullName", () => {
  it("prefixes a regular student name with familyName", () => {
    expect(formatStudentFullName({ uid: "10064", name: "카요코(새해)", familyName: "오니카타" })).toBe(
      "오니카타 카요코(새해)",
    );
  });

  it("keeps collaboration names that already include familyName", () => {
    expect(formatStudentFullName({ uid: "20007", name: "하츠네 미쿠", familyName: "하츠네" })).toBe("하츠네 미쿠");
    expect(formatStudentFullName({ uid: "10079", name: "미사카 미코토", familyName: "미사카" })).toBe("미사카 미코토");
  });

  it("keeps Shiroko Terror as its usual full name", () => {
    expect(formatStudentFullName({ uid: "10100", name: "시로코*테러", familyName: "스나오오카미" })).toBe(
      "시로코*테러",
    );
  });

  it("falls back to name when familyName is empty", () => {
    expect(formatStudentFullName({ uid: "10135", name: "케이", familyName: "" })).toBe("케이");
  });
});

describe("student catalog source validation", () => {
  const env = { DISABLE_CACHE: "true" } as unknown as Env;

  it("rejects a GraphQL error instead of returning an empty catalog", async () => {
    mockedRunQuery.mockResolvedValue({ data: undefined, error: new Error("GraphQL failure") } as never);

    await expect(syncRawStudents(env)).rejects.toThrow("GraphQL failure");
  });

  it("rejects a response without the required student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: {}, error: undefined } as never);

    await expect(getAllStudents(env)).rejects.toThrow("missing students");
  });

  it("accepts a valid empty student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: { students: [] }, error: undefined } as never);

    await expect(getAllStudents(env)).resolves.toEqual([]);
  });
});
