import { describe, expect, it } from "@jest/globals";
import { isAuthorizedOcrMachineRequest } from "~/lib/ocr-machine-auth.server";

describe("OCR machine authentication", () => {
  const env = { OCR_WORKER_TOKEN: "machine-secret" } as Env;

  it("accepts only the dedicated bearer credential", async () => {
    await expect(
      isAuthorizedOcrMachineRequest(
        new Request("https://origin.mollulog.net/internal/ocr/v1/tasks/x/claim", {
          headers: { authorization: "Bearer machine-secret" },
        }),
        env,
      ),
    ).resolves.toBe(true);
    await expect(
      isAuthorizedOcrMachineRequest(
        new Request("https://origin.mollulog.net/internal/ocr/v1/tasks/x/claim", {
          headers: { authorization: "Bearer wrong" },
        }),
        env,
      ),
    ).resolves.toBe(false);
  });
});
