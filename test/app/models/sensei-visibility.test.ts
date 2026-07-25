import { describe, expect, it } from "@jest/globals";
import { isSenseiProfileVisibleTo, type Sensei } from "~/models/sensei";

function sensei(profileVisibility: Sensei["profileVisibility"]): Sensei {
  return {
    id: 7,
    uid: "sensei-uid",
    username: "sensei",
    friendCode: null,
    profileStudentId: null,
    bio: null,
    active: true,
    role: "guest",
    profileVisibility,
  };
}

describe("sensei profile visibility", () => {
  it("shows public profiles to everyone", () => {
    expect(isSenseiProfileVisibleTo(sensei("public"))).toBe(true);
    expect(isSenseiProfileVisibleTo(sensei("public"), 9)).toBe(true);
  });

  it("shows private profiles only to their owner", () => {
    expect(isSenseiProfileVisibleTo(sensei("private"))).toBe(false);
    expect(isSenseiProfileVisibleTo(sensei("private"), 9)).toBe(false);
    expect(isSenseiProfileVisibleTo(sensei("private"), 7)).toBe(true);
  });
});
