import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileEditor } from "~/components/features/profile";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthenticator = jest.fn<(...args: unknown[]) => unknown>();
const mockGetSession = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCommitSession = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockSessionSet = jest.fn();
const mockGetSenseiById = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateSensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetSenseiPrivacyByUserId = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertSenseiPrivacy = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPasskeysBySensei = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAuthIdentityStatuses = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetDiscordNotificationState = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/auth/authenticator.server", () => ({
  getActiveSensei: (...args: unknown[]) => mockGetActiveSensei(...args),
  getAuthenticator: (...args: unknown[]) => mockGetAuthenticator(...args),
  sessionStorage: (..._args: unknown[]) => ({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    commitSession: (...args: unknown[]) => mockCommitSession(...args),
  }),
}));
jest.mock("~/models/sensei", () => ({
  getSenseiById: (...args: unknown[]) => mockGetSenseiById(...args),
  updateSensei: (...args: unknown[]) => mockUpdateSensei(...args),
}));
jest.mock("~/models/sensei-privacy", () => ({
  getSenseiPrivacyByUserId: (...args: unknown[]) => mockGetSenseiPrivacyByUserId(...args),
  upsertSenseiPrivacy: (...args: unknown[]) => mockUpsertSenseiPrivacy(...args),
}));
jest.mock("~/models/student", () => ({
  getAllStudents: (...args: unknown[]) => mockGetAllStudents(...args),
}));
jest.mock("~/models/passkey", () => ({
  getPasskeysBySensei: (...args: unknown[]) => mockGetPasskeysBySensei(...args),
}));
jest.mock("~/models/auth-identity", () => ({
  getAuthIdentityStatuses: (...args: unknown[]) => mockGetAuthIdentityStatuses(...args),
}));
jest.mock("~/models/discord-notifications.server", () => ({
  getDiscordNotificationState: (...args: unknown[]) => mockGetDiscordNotificationState(...args),
  unlinkDiscordConnection: jest.fn(),
}));

import { action, loader } from "~/routes/edit._index";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } } as unknown as Env;
const activeSensei = {
  id: 7,
  uid: "sensei-7",
  username: "teacher",
  friendCode: null,
  profileStudentId: null,
  bio: null,
  active: true,
  role: "guest",
  profileVisibility: "private",
  growthVisibility: true,
};

function args(request: Request) {
  return {
    request,
    context: { cloudflare: { env, ctx: {} as ExecutionContext } },
    params: {},
  } as never;
}

function profileRequest({ profilePublic, growthVisibility }: { profilePublic?: string; growthVisibility?: string }) {
  const formData = new FormData();
  formData.set("intent", "profile");
  formData.set("username", "teacher");
  formData.set("bio", "hello");
  if (profilePublic !== undefined) formData.set("profilePublic", profilePublic);
  if (growthVisibility !== undefined) formData.set("growthVisibility", growthVisibility);
  return new Request("https://mollulog.test/edit", { method: "PUT", body: formData });
}

function expectDataResult<T>(result: unknown): { data: T; init: ResponseInit | null } {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as { data: T; init: ResponseInit | null };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ ...activeSensei });
  mockGetAuthenticator.mockReturnValue({ sessionKey: "sensei" });
  mockGetSession.mockResolvedValue({ set: mockSessionSet });
  mockCommitSession.mockResolvedValue("session=updated");
  mockGetSenseiById.mockResolvedValue({ ...activeSensei });
  mockUpdateSensei.mockResolvedValue({});
  mockGetSenseiPrivacyByUserId.mockResolvedValue(null);
  mockUpsertSenseiPrivacy.mockResolvedValue(undefined);
  mockGetAllStudents.mockResolvedValue([]);
  mockGetPasskeysBySensei.mockResolvedValue([]);
  mockGetAuthIdentityStatuses.mockResolvedValue({ google: false, github: false, discord: false });
  mockGetDiscordNotificationState.mockResolvedValue({ connection: null });
});

describe("edit profile visibility", () => {
  it("includes growth visibility in the profile loader data", async () => {
    const result = await loader(args(new Request("https://mollulog.test/edit")));

    expect(result).toMatchObject({
      sensei: {
        profileVisibility: "private",
        growthVisibility: true,
      },
    });
  });

  it.each([
    ["public and growth public", "true", "true", "public", true],
    ["private and growth private", "false", "false", "private", false],
  ] as const)("maps %s form booleans to persisted state", async (_name, profilePublic, growth, profileVisibility, expectedGrowth) => {
    const response = expectDataResult<{ intent: string; success: true }>(
      await action(args(profileRequest({ profilePublic, growthVisibility: growth }))),
    );

    expect(response.data).toMatchObject({ intent: "profile", success: true });
    expect(mockUpdateSensei).toHaveBeenCalledWith(
      env,
      7,
      expect.objectContaining({ profileVisibility, growthVisibility: expectedGrowth }),
      expect.objectContaining({ ctx: expect.any(Object) }),
    );
    expect(mockSessionSet).toHaveBeenCalledWith(
      "sensei",
      expect.objectContaining({ profileVisibility, growthVisibility: expectedGrowth }),
    );
  });

  it("does not turn growth visibility off when the field is omitted", async () => {
    const response = expectDataResult<{ intent: string; success: true }>(
      await action(args(profileRequest({ profilePublic: "true" }))),
    );

    expect(response.data).toMatchObject({ intent: "profile", success: true });
    expect(mockUpdateSensei.mock.calls[0]?.[2]).not.toHaveProperty("growthVisibility");
    expect(mockSessionSet).toHaveBeenCalledWith("sensei", expect.objectContaining({ growthVisibility: true }));
  });

  it("rejects malformed visibility booleans before writing", async () => {
    const response = expectDataResult<{ intent: string; error: { form: string } }>(
      await action(args(profileRequest({ profilePublic: "invalid", growthVisibility: "true" }))),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data).toEqual({ intent: "profile", error: { form: "공개 설정이 올바르지 않아요." } });
    expect(mockUpdateSensei).not.toHaveBeenCalled();
    expect(mockSessionSet).not.toHaveBeenCalled();
  });

  it("returns profile update errors for the profile form", async () => {
    mockUpdateSensei.mockResolvedValueOnce({ error: { form: "닉네임을 사용할 수 없어요." } });

    const response = expectDataResult<{ intent: string; error: { form: string } }>(
      await action(args(profileRequest({ profilePublic: "true", growthVisibility: "false" }))),
    );

    expect(response.init?.status).toBe(400);
    expect(response.data).toEqual({ intent: "profile", error: { form: "닉네임을 사용할 수 없어요." } });
    expect(mockSessionSet).not.toHaveBeenCalled();
  });

  it("renders profile-level errors in the profile form", () => {
    const markup = renderToStaticMarkup(
      createElement(ProfileEditor, {
        students: [],
        profileVisibilityField: createElement("div", null, "profile"),
        growthVisibilityField: createElement("div", null, "growth"),
        error: { form: "닉네임을 사용할 수 없어요." },
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("닉네임을 사용할 수 없어요.");
  });

  it("keeps the visibility controls in the profile form with the requested labels and order", () => {
    const profileSource = readFileSync("app/components/features/profile/ProfileEditor.tsx", "utf8");
    const routeSource = readFileSync("app/routes/edit._index.tsx", "utf8");

    expect(routeSource).toContain('name="profilePublic"');
    expect(routeSource).toContain('label="프로필 공개"');
    expect(routeSource).toContain('name="growthVisibility"');
    expect(routeSource).toContain('label="학생 성장도 공개"');
    expect(routeSource).toContain("내 모집한 학생의 성장도를 다른 사람에게 공개해요");
    expect(profileSource.indexOf("profileVisibilityField")).toBeLessThan(
      profileSource.indexOf("growthVisibilityField"),
    );
    expect(profileSource).toContain("{profileStudentField}");
    expect(profileSource).toContain("{friendCodeField}");
  });
});
