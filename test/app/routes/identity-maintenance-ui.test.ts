import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const uiContracts = [
  "app/components/features/auth/SignInBottomSheet.tsx",
  "app/routes/register.tsx",
  "app/routes/edit._index.tsx",
  "app/routes/edit.passkey._index.tsx",
  "app/routes/edit.passkey.$uid.tsx",
  "app/routes/$username._index.tsx",
] as const;

const oauthCallbackRoutes = [
  "app/routes/auth.google.callback.tsx",
  "app/routes/auth.github.callback.tsx",
  "app/routes/auth.$provider.link.callback.tsx",
] as const;

describe("identity maintenance UI contract", () => {
  it.each(uiContracts)("maps the typed maintenance response in %s", (path) => {
    expect(readFileSync(path, "utf8")).toContain("identityMaintenanceMessage");
  });

  it("does not replace the shared notice with raw server errors", () => {
    const source = readFileSync("app/components/features/auth/SignInBottomSheet.tsx", "utf8");
    expect(source).not.toContain("error.stack");
    expect(source).toContain("Passkey 조회에 실패했어요");
  });

  it.each(oauthCallbackRoutes)("uses a browser maintenance page for %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("identityMaintenancePageResult");
    expect(source).not.toContain("identityMaintenanceActionResult");
  });
});
