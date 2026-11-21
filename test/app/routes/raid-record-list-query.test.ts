import { describe, expect, it } from "@jest/globals";
import {
  parseRaidRecordListQuery,
  parseRaidRecordListScope,
  raidRecordListTo,
} from "~/routes/$username.raids._components/raid-record-list-query";

describe("raid record list query", () => {
  it("lists both raid types together unless the query names one", () => {
    expect(parseRaidRecordListScope(new URLSearchParams(""))).toEqual({ server: "kr", raidType: null });
    expect(parseRaidRecordListScope(new URLSearchParams("server=jp&type=bogus"))).toEqual({
      server: "jp",
      raidType: null,
    });
    expect(parseRaidRecordListScope(new URLSearchParams("server=jp&type=elimination"))).toEqual({
      server: "jp",
      raidType: "elimination",
    });
  });

  it("starts the one-raid-type screens on 총력전 when the query names no type", () => {
    expect(parseRaidRecordListQuery(new URLSearchParams("server=jp"))).toEqual({
      server: "jp",
      raidType: "total_assault",
    });
    expect(parseRaidRecordListQuery(new URLSearchParams("type=elimination"))).toEqual({
      server: "kr",
      raidType: "elimination",
    });
  });

  it("links back to the list of the server with both raid types", () => {
    expect(raidRecordListTo("sensei", "jp")).toBe("/@sensei/raids?server=jp");
  });
});
