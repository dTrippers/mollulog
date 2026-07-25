import { describe, expect, it, jest } from "@jest/globals";
import { getSenseiByUsername, type Sensei } from "~/models/sensei";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/components/features/layout", () => ({
  ErrorPage: jest.fn(() => null),
  Page: jest.fn(({ children }: { children?: unknown }) => children ?? null),
  ServerErrorPage: jest.fn(() => null),
}));
jest.mock("~/models/sensei", () => ({
  ...jest.requireActual<typeof import("~/models/sensei")>("~/models/sensei"),
  getSenseiByUsername: jest.fn(),
}));

import { getRouteSensei } from "../../../app/routes/$username";

const mockedGetSenseiByUsername = getSenseiByUsername as jest.MockedFunction<typeof getSenseiByUsername>;

function sensei(profileVisibility: Sensei["profileVisibility"]): Sensei {
  return {
    id: 7,
    uid: "sensei-uid",
    username: "private-sensei",
    friendCode: null,
    profileStudentId: null,
    bio: null,
    active: true,
    role: "guest",
    profileVisibility,
  };
}

describe("@username profile privacy", () => {
  it("returns a friendly 403 route response for another user's private profile", async () => {
    mockedGetSenseiByUsername.mockResolvedValue(sensei("private"));

    await expect(getRouteSensei({} as Env, { username: "@private-sensei" }, 9)).rejects.toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 403 },
      data: {
        error: {
          code: "sensei.profile_private",
          details: { username: "private-sensei" },
        },
      },
    });
  });

  it("allows the owner to access their private profile", async () => {
    const privateSensei = sensei("private");
    mockedGetSenseiByUsername.mockResolvedValue(privateSensei);

    await expect(getRouteSensei({} as Env, { username: "@private-sensei" }, 7)).resolves.toBe(privateSensei);
  });
});
