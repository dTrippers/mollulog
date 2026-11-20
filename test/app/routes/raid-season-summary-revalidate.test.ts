import { describe, expect, it, jest } from "@jest/globals";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

import { shouldRevalidate } from "~/routes/raids.$raidType.$seasonIndex._index";

function args(current: string, next: string, formMethod?: "POST") {
  return {
    currentUrl: new URL(current, "https://mollulog.net"),
    nextUrl: new URL(next, "https://mollulog.net"),
    formMethod,
    defaultShouldRevalidate: true,
  } as Parameters<typeof shouldRevalidate>[0];
}

describe("season summary revalidation", () => {
  it("keeps the loaded record when only the defense type changes", () => {
    expect(
      shouldRevalidate(
        args("/raids/total-assault/35?defenseType=heavy", "/raids/total-assault/35?defenseType=elastic"),
      ),
    ).toBe(false);
  });

  it("reloads for another season or after a form submission", () => {
    expect(shouldRevalidate(args("/raids/total-assault/35", "/raids/total-assault/36"))).toBe(true);
    expect(shouldRevalidate(args("/raids/total-assault/35", "/raids/total-assault/35", "POST"))).toBe(true);
  });
});
