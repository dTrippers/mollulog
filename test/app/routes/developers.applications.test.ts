import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("~/routes/developers._components/requireOAuthAppManager", () => ({
  requireOAuthAppManager: jest.fn(),
}));
jest.mock("~/models/mollulog-oauth", () => {
  const actual = jest.requireActual<typeof import("~/models/mollulog-oauth")>("~/models/mollulog-oauth");
  return {
    ...actual,
    createOAuthApplication: jest.fn(),
    getOAuthApplications: jest.fn(),
    getOwnedOAuthApplication: jest.fn(),
    updateOwnedOAuthApplication: jest.fn(),
    regenerateOAuthClientSecret: jest.fn(),
    deleteOwnedOAuthApplication: jest.fn(),
  };
});

import {
  createOAuthApplication,
  deleteOwnedOAuthApplication,
  getOAuthApplications,
  getOwnedOAuthApplication,
  regenerateOAuthClientSecret,
  updateOwnedOAuthApplication,
} from "~/models/mollulog-oauth";
import { requireOAuthAppManager } from "~/routes/developers._components/requireOAuthAppManager";
import { loader as listLoader } from "~/routes/developers.applications._index";
import { action as detailAction, loader as detailLoader } from "~/routes/developers.applications.$uid";
import { action as newApplicationAction } from "~/routes/developers.applications.new";

const app = {
  id: 12,
  uid: "app-uid",
  ownerUserId: 42,
  name: "Roster Tool",
  clientId: "mllg_oc_0123456789abcdef0123456789abcdef",
  clientSecretPrefix: "mllg_os_01234567",
  redirectUris: ["https://tool.example/callback"],
  scopes: ["profile", "students:read"],
  createdAt: new Date("2026-10-20T00:00:00.000Z"),
  updatedAt: new Date("2026-10-21T00:00:00.000Z"),
  clientSecretIssuedAt: new Date("2026-10-20T00:00:00.000Z"),
  deletedAt: null,
};

function createArgs(request: Request, params: Record<string, string> = {}) {
  return {
    request,
    context: { cloudflare: { env: { POSTGRES_URL: "postgres://local" }, ctx: "ctx" } },
    params,
  } as never;
}

function postForm(values: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) form.append(key, entry);
  }
  return new Request("https://mollulog.net/developers/applications", { method: "POST", body: form });
}

function dataValue<T>(result: unknown): T {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return (result as { data: T }).data;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requireOAuthAppManager).mockResolvedValue(42);
});

describe("developer OAuth application routes", () => {
  it("keeps the application list as an index route so create and detail routes are siblings", () => {
    const routesDirectory = join(process.cwd(), "app/routes");

    expect(existsSync(join(routesDirectory, "developers.applications._index.tsx"))).toBe(true);
    expect(existsSync(join(routesDirectory, "developers.applications.tsx"))).toBe(false);
    expect(existsSync(join(routesDirectory, "developers.applications.new.tsx"))).toBe(true);
    expect(existsSync(join(routesDirectory, "developers.applications.$uid.tsx"))).toBe(true);
  });

  it("lists only the owner’s applications and returns only list fields", async () => {
    jest.mocked(getOAuthApplications).mockResolvedValue([app] as never);
    const result = await listLoader(createArgs(new Request("https://mollulog.net/developers/applications")));

    expect(getOAuthApplications).toHaveBeenCalledWith({ POSTGRES_URL: "postgres://local" } as never, 42, { ctx: "ctx" } as never);
    expect(dataValue(result)).toEqual({
      applications: [{ uid: app.uid, name: app.name, scopes: app.scopes }],
      loadError: false,
    });
  });

  it("creates an application and returns its secret only in the creation response", async () => {
    jest.mocked(createOAuthApplication).mockResolvedValue({ application: app as never, clientSecret: "mllg_os_once" });
    const result = await newApplicationAction(
      createArgs(
        postForm({
          name: "Roster Tool",
          redirectUris: ["https://tool.example/callback"],
          scope: ["profile", "students:write"],
        }),
      ),
    );

    expect(createOAuthApplication).toHaveBeenCalledWith(
      { POSTGRES_URL: "postgres://local" } as never,
      42,
      { name: "Roster Tool", redirectUris: ["https://tool.example/callback"], scopes: ["profile", "students:write"] },
      { ctx: "ctx" } as never,
    );
    expect(dataValue(result)).toEqual({
      ok: true,
      uid: app.uid,
      name: app.name,
      clientId: app.clientId,
      clientSecret: "mllg_os_once",
    });
  });

  it("loads only an application owned by the active developer", async () => {
    jest.mocked(getOwnedOAuthApplication).mockResolvedValue(app as never);
    const result = await detailLoader(createArgs(new Request("https://mollulog.net/developers/applications/app-uid"), { uid: app.uid }));

    expect(getOwnedOAuthApplication).toHaveBeenCalledWith({ POSTGRES_URL: "postgres://local" } as never, 42, app.uid, { ctx: "ctx" } as never);
    expect(dataValue(result)).toEqual({
      application: {
        uid: app.uid,
        name: app.name,
        clientId: app.clientId,
        redirectUris: app.redirectUris,
        scopes: app.scopes,
        updatedAt: app.updatedAt.toISOString(),
        clientSecretIssuedAt: app.clientSecretIssuedAt.toISOString(),
      },
    });
  });

  it("saves application settings using the owner checked by the server guard", async () => {
    jest.mocked(updateOwnedOAuthApplication).mockResolvedValue(app as never);
    const result = await detailAction(
      createArgs(postForm({
        intent: "update",
        name: "Roster Tool",
        redirectUris: ["https://tool.example/callback"],
        scope: ["students:read"],
      }), { uid: app.uid }),
    );

    expect(updateOwnedOAuthApplication).toHaveBeenCalledWith(
      { POSTGRES_URL: "postgres://local" } as never,
      42,
      app.uid,
      { name: "Roster Tool", redirectUris: ["https://tool.example/callback"], scopes: ["students:read"] },
      { ctx: "ctx" } as never,
    );
    expect(dataValue(result)).toEqual({ ok: true, intent: "update" });
  });

  it("returns a newly rotated secret once and deletes the app through the model transaction", async () => {
    jest.mocked(regenerateOAuthClientSecret).mockResolvedValue({
      clientSecret: "mllg_os_new-secret",
      issuedAt: new Date("2026-10-22T00:00:00.000Z"),
    });
    const rotated = await detailAction(
      createArgs(postForm({ intent: "rotate" }), { uid: app.uid }),
    );
    expect(dataValue(rotated)).toEqual({
      ok: true,
      intent: "rotate",
      clientSecret: "mllg_os_new-secret",
      issuedAt: "2026-10-22T00:00:00.000Z",
    });

    jest.mocked(deleteOwnedOAuthApplication).mockResolvedValue(true);
    const deleted = await detailAction(createArgs(postForm({ intent: "delete" }), { uid: app.uid }));
    expect(deleteOwnedOAuthApplication).toHaveBeenCalledWith({ POSTGRES_URL: "postgres://local" } as never, 42, app.uid, { ctx: "ctx" } as never);
    expect(deleted).toMatchObject({ status: 302, headers: expect.any(Headers) });
    expect((deleted as Response).headers.get("Location")).toBe("/developers/applications");
  });
});
