import { describe, expect, it } from "@jest/globals";
import { createConcurrencyGate } from "~/lib/concurrency";

describe("createConcurrencyGate", () => {
  it("shares one concurrency budget across independent callers", async () => {
    const run = createConcurrencyGate(4);
    let activeCount = 0;
    let maxActiveCount = 0;

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        run(async () => {
          activeCount += 1;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 2));
          activeCount -= 1;
          return index;
        }),
      ),
    );

    expect(maxActiveCount).toBe(4);
  });

  it("releases a slot when a task rejects", async () => {
    const run = createConcurrencyGate(1);
    await expect(run(async () => Promise.reject(new Error("failed")))).rejects.toThrow("failed");
    await expect(run(async () => "next")).resolves.toBe("next");
  });
});
