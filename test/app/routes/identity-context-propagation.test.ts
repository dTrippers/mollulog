import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const read = (path: string) => readFileSync(path, "utf8");

describe("identity request context propagation contract", () => {
  it("passes the request ExecutionContext through auth, registration, profile, follow, passkey, and username paths", () => {
    const routeContracts: Array<[string, string[]]> = [
      [
        "app/auth/authenticator.server.ts",
        ["getSenseiByAuthIdentity(env, provider, providerUserId, options)", "{ ctx }"],
      ],
      ["app/routes/register.tsx", ["getSenseiByUsername(env, username, { ctx })", "{ ctx }"]],
      [
        "app/routes/edit._index.tsx",
        ["getSenseiById(env, sensei.id, { ctx })", "upsertSenseiPrivacy(env, sensei.id, memberCode ?? null, { ctx })"],
      ],
      [
        "app/routes/api.followerships.tsx",
        [
          "getSenseiByUsername(env, followeeName.toString(), { ctx })",
          "follow(env, follower.id, followee.id, { ctx })",
        ],
      ],
      ["app/routes/auth.passkey.register.tsx", ["verifyAndCreatePasskey(env, currentUser, creationResponse, { ctx })"]],
      [
        "app/routes/$username.friends.tsx",
        [
          "getRouteSensei(env, params, currentUser?.id, { ctx })",
          "getFollowershipLists(env, sensei.id, currentUser?.id, { ctx })",
        ],
      ],
      ["app/routes/timelines._index.tsx", ["getActiveSensei(env, request, ctx)", "sensei?.id,\n    { ctx }"]],
    ];

    for (const [path, snippets] of routeContracts) {
      const source = read(path);
      for (const snippet of snippets) expect(source).toContain(snippet);
    }
  });

  it("gives every identity model an optional repository options parameter", () => {
    for (const name of [
      "sensei.ts",
      "auth-identity.ts",
      "followership.ts",
      "passkey.ts",
      "pending-sensei-registration.ts",
      "sensei-privacy.ts",
    ]) {
      expect(read(`app/models/${name}`)).toContain("IdentityRepositoryOptions");
    }
  });
});
