import { describe, expect, it } from "@jest/globals";
import { createR2PresignedUrl } from "~/lib/r2-presign.server";

describe("R2 SigV4 presigning", () => {
  it("scopes a PUT URL to one encoded object with a short expiry", async () => {
    const signed = new URL(
      await createR2PresignedUrl({
        accountId: "account",
        accessKeyId: "access",
        secretAccessKey: "secret",
        bucket: "bucket",
        key: "ocr/local/job/한 글.png",
        method: "PUT",
        expiresSeconds: 900,
        now: new Date("2026-07-20T10:20:30.000Z"),
      }),
    );

    expect(signed.host).toBe("account.r2.cloudflarestorage.com");
    expect(signed.pathname).toBe("/bucket/ocr/local/job/%ED%95%9C%20%EA%B8%80.png");
    expect(signed.searchParams.get("X-Amz-Date")).toBe("20260720T102030Z");
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(signed.searchParams.get("X-Amz-Credential")).toBe("access/20260720/auto/s3/aws4_request");
    expect(signed.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an expiry outside the R2 supported range", async () => {
    await expect(
      createR2PresignedUrl({
        accountId: "a",
        accessKeyId: "a",
        secretAccessKey: "s",
        bucket: "b",
        key: "k",
        method: "GET",
        expiresSeconds: 604801,
      }),
    ).rejects.toThrow("1초부터 7일");
  });
});
