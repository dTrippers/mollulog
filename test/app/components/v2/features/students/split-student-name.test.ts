import { describe, expect, it } from "@jest/globals";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";

describe("splitVisibleStudentName", () => {
  it("reads a name with a variant as the main name and the variant", () => {
    expect(splitVisibleStudentName("시로코*테러")).toEqual({ name: "시로코", variant: "테러" });
    expect(splitVisibleStudentName("키사키(수영복)")).toEqual({ name: "키사키", variant: "수영복" });
  });

  it("keeps a plain name without a variant", () => {
    expect(splitVisibleStudentName("리오")).toEqual({ name: "리오", variant: null });
  });

  it("uses the short visible name from the shared 1.x naming rules", () => {
    expect(splitVisibleStudentName("하츠네 미쿠")).toEqual({ name: "미쿠", variant: null });
  });
});
