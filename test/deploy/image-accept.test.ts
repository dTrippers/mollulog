import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

type AcceptHeader = { value: string; multiValue?: { value: string }[] };
type ViewerRequest = { headers: { accept?: AcceptHeader } };

const source = readFileSync(join(__dirname, "../../deploy/cdn/functions/image-accept.js"), "utf8");
const handler = new Function(`${source}\nreturn handler;`)() as (event: { request: ViewerRequest }) => ViewerRequest;

function normalize(accept?: AcceptHeader): string | undefined {
  return handler({ request: { headers: accept ? { accept } : {} } }).headers.accept?.value;
}

describe("image-accept CloudFront Function", () => {
  it.each([
    ["Chrome", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "image/webp"],
    ["Safari", "image/webp,image/avif,image/jxl,image/heic,video/*;q=0.8,image/png,*/*;q=0.5", "image/webp"],
    ["mixed case with a positive q", "image/jpeg, IMAGE/WEBP ; q=0.5", "image/webp"],
    ["WebP refused with q=0", "image/jpeg,image/webp;q=0", "*/*"],
    ["no WebP", "image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5", "*/*"],
    ["wildcard only", "*/*", "*/*"],
  ])("maps %s", (_, value, expected) => {
    expect(normalize({ value })).toBe(expected);
  });

  it("treats a missing header as no WebP support", () => {
    expect(normalize()).toBe("*/*");
  });

  it("reads every value of a repeated header", () => {
    expect(normalize({ value: "image/png", multiValue: [{ value: "image/png" }, { value: "image/webp" }] })).toBe(
      "image/webp",
    );
  });
});
