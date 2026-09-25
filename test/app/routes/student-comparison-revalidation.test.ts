import { describe, expect, it, jest } from "@jest/globals";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { shouldRevalidate } from "~/routes/students.compare";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));

function createArgs(
  currentHref: string,
  nextHref: string,
  overrides: Partial<ShouldRevalidateFunctionArgs> = {},
): ShouldRevalidateFunctionArgs {
  return {
    currentUrl: new URL(currentHref),
    currentParams: {},
    nextUrl: new URL(nextHref),
    nextParams: {},
    defaultShouldRevalidate: true,
    ...overrides,
  };
}

describe("student comparison route revalidation", () => {
  it("skips a read-only import POST revalidation at the same pathname and query", () => {
    const href = "https://mollulog.test/students/compare?left=100&right=200";

    expect(shouldRevalidate(createArgs(href, href, { formMethod: "POST" }))).toBe(false);
  });

  it("keeps selection changes revalidating and skips growth-only query changes", () => {
    const currentHref = "https://mollulog.test/students/compare?left=100&right=200";

    expect(shouldRevalidate(createArgs(currentHref, "https://mollulog.test/students/compare?left=101&right=200"))).toBe(
      true,
    );
    expect(
      shouldRevalidate(
        createArgs(currentHref, "https://mollulog.test/students/compare?left=100&right=200&left.level=80"),
      ),
    ).toBe(false);
  });
});
