import { describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { formatStudentFullName, getStudentWeaponAvailability } from "~/models/student";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

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

describe("student weapon availability", () => {
  it("maps returned students without a weapon to false and keeps omitted requested students absent", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: {
        students: [
          { uid: "with-weapon", catalog: { weapon: { name: "Weapon" } } },
          { uid: "without-weapon", catalog: null },
        ],
      },
      error: undefined,
    } as never);

    const result = await getStudentWeaponAvailability({ DISABLE_CACHE: "true" } as unknown as Env, [
      "with-weapon",
      "without-weapon",
      "omitted",
    ]);

    expect(result).toEqual(
      new Map([
        ["with-weapon", true],
        ["without-weapon", false],
      ]),
    );
    expect(result.has("omitted")).toBe(false);
  });
});
