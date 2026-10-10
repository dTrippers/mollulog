import { describe, expect, it } from "@jest/globals";
import { normalizeNullableStudentBasicInfoField } from "~/routes/students.$id._components/StudentBasicInfo";

describe("nullable student basic-info payload", () => {
  it("serializes a lowered special equipment level of T0 as an explicit clear", () => {
    expect(normalizeNullableStudentBasicInfoField("equipSpecial", 0)).toBeNull();
    expect(normalizeNullableStudentBasicInfoField("equipSpecial", 1)).toBe(1);
  });
});
