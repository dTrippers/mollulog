/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

jest.mock("~/contexts/SignInProvider", () => ({ useSignIn: () => ({ showSignIn: jest.fn() }) }));
jest.mock("~/auth/authenticator.server", () => ({ getAuthenticator: jest.fn(), sessionStorage: jest.fn() }));

import OAuthAuthorize from "~/routes/oauth.authorize";

const consent = {
  kind: "consent" as const,
  application: {
    id: 17,
    uid: "app-uid",
    name: "Roster Tool",
    scopes: ["profile" as const],
    ownerUsername: "developer",
  },
  redirectHost: "tool.example",
  redirectUri: "https://tool.example/callback",
  parameters: {
    responseType: "code",
    clientId: "mllg_oc_0123456789abcdef0123456789abcdef",
    redirectUri: "https://tool.example/callback",
    scope: "profile",
    state: "opaque-state",
    codeChallenge: null,
    codeChallengeMethod: null,
    duplicateFields: [],
  },
  scopes: ["profile" as const],
  grantedScopes: [],
  username: "testuser",
  profileStudentId: "arona",
  csrfToken: "csrf-token",
};

describe("OAuth consent form buttons", () => {
  it("submits both consent decisions", () => {
    const RoutesStub = createRoutesStub([
      {
        id: "oauth-authorize",
        path: "/oauth/authorize",
        loader: () => consent,
        Component: OAuthAuthorize,
      },
    ]);

    render(
      <RoutesStub
        initialEntries={["/oauth/authorize"]}
        hydrationData={{ loaderData: { "oauth-authorize": consent } }}
      />,
    );

    expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).type).toBe("submit");
    expect((screen.getByRole("button", { name: "연결" }) as HTMLButtonElement).type).toBe("submit");
  });
});
