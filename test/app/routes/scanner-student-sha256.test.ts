import { describe, expect, it } from "@jest/globals";
import { Sha256 } from "~/routes/scanner.student._components/sha256";

describe("student scanner streaming SHA-256", () => {
  it("matches standard vectors across arbitrary chunk boundaries", () => {
    const encoder = new TextEncoder();
    expect(new Sha256().hexDigest()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(new Sha256().update(encoder.encode("a")).update(encoder.encode("bc")).hexDigest()).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
