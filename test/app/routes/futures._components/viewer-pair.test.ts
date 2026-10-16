import { describe, expect, it } from "@jest/globals";
import { resolveViewerStatus, settleViewerPair, type ViewerLoaded } from "~/routes/futures._components/viewer-state";

describe("settleViewerPair", () => {
  it("settles only after both own-state reads settle, so a revalidation never mixes reads", async () => {
    let resolveFavorites: (value: ViewerLoaded<string[]>) => void = () => undefined;
    const favorites = new Promise<ViewerLoaded<string[]>>((resolve) => {
      resolveFavorites = resolve;
    });
    const results = Promise.resolve<ViewerLoaded<number[]>>({ status: "available", value: [1] });
    let settled = false;
    const pair = settleViewerPair(favorites, results).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveFavorites({ status: "available", value: ["a"] });
    await expect(pair).resolves.toEqual({
      favorites: { status: "available", value: ["a"] },
      results: { status: "available", value: [1] },
    });
  });

  it("keeps each failed read explicit, and one failed read fails the whole own state", async () => {
    const pair = await settleViewerPair(
      Promise.resolve<ViewerLoaded<string[]>>({ status: "unavailable" }),
      Promise.resolve<ViewerLoaded<number[]>>({ status: "available", value: [1] }),
    );

    expect(pair.favorites).toEqual({ status: "unavailable" });
    expect(pair.results).toEqual({ status: "available", value: [1] });
    expect(resolveViewerStatus(pair.favorites, pair.results)).toBe("failed");
  });
});
