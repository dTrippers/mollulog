import { describe, expect, it } from "@jest/globals";
import {
  mergeTimelineContentNames,
  parseTimelineContentNames,
  selectTimelineContentName,
  serializeTimelineContentNames,
} from "~/domain/timeline-content-name-i18n";

describe("timeline content localized names", () => {
  it("parses valid localized names and trims blank values", () => {
    expect(parseTimelineContentNames(JSON.stringify({ ko: " 이벤트 ", ja: "", en: "Event" }))).toEqual({
      ko: "이벤트",
      en: "Event",
    });
  });

  it("returns an empty object for invalid JSON or non-object values", () => {
    expect(parseTimelineContentNames("{")).toEqual({});
    expect(parseTimelineContentNames("[]")).toEqual({});
    expect(parseTimelineContentNames(null)).toEqual({});
  });

  it("selects Korean first, then any available localized name", () => {
    expect(selectTimelineContentName({ ko: "한국어", ja: "日本語" })).toBe("한국어");
    expect(selectTimelineContentName({ en: "English", ja: "日本語" })).toBe("English");
    expect(selectTimelineContentName({})).toBeNull();
  });

  it("serializes only supported non-empty locales", () => {
    expect(serializeTimelineContentNames({ ko: "한국어", ja: "日本語", fr: "Français" })).toBe(
      JSON.stringify({ ko: "한국어", ja: "日本語" }),
    );
  });

  it("merges synced names without erasing manually entered values with blank sync values", () => {
    expect(mergeTimelineContentNames({ ko: "수동", ja: "手動" }, { ko: "동기화", ja: "" })).toEqual({
      ko: "동기화",
      ja: "手動",
    });
  });
});
