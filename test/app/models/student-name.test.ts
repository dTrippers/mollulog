import { describe, expect, it } from "@jest/globals";
import { formatStudentFullName } from "~/models/student-name";

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
