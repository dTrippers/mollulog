import { describe, expect, it } from "@jest/globals";
import { buildExactPartiesPath, compactExactParties, parseExactParties } from "~/domain/raid-exact-parties";

describe("raid exact party filters", () => {
  it("removes empty slots and parties", () => {
    expect(
      compactExactParties([
        ["A", null, "B", undefined],
        [null, undefined],
        ["C", "D"],
      ]),
    ).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("round-trips repeated exact party search params while preserving other filters", () => {
    const path = buildExactPartiesPath("ranks?defenseType=special", [
      ["A", "B", "C", "D", "E", "F"],
      ["G", "H", "I", "J", "K", "L"],
    ]);
    const searchParams = new URL(path, "https://mollulog.net").searchParams;

    expect(path).toBe("ranks?defenseType=special&exactParty=A%2CB%2CC%2CD%2CE%2CF&exactParty=G%2CH%2CI%2CJ%2CK%2CL");
    expect(parseExactParties(searchParams)).toEqual([
      ["A", "B", "C", "D", "E", "F"],
      ["G", "H", "I", "J", "K", "L"],
    ]);
  });

  it("replaces an existing exact party filter", () => {
    expect(buildExactPartiesPath("ranks?exactParty=old%2Cparty&defenseType=heavy", [["new", "party"]])).toBe(
      "ranks?defenseType=heavy&exactParty=new%2Cparty",
    );
  });
});
