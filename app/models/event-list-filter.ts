import hangul from "hangul-js";
import { getInstantTime } from "~/lib/date-time";
import type { EventListItem, EventListSchedule } from "~/models/event-content";
import type { RunType } from "~/models/timeline-content";

const permanentGracePeriodMs = 7 * 24 * 60 * 60 * 1000;
const scheduleOrder: RunType[] = ["first", "rerun", "permanent"];
const hangulSyllableStartCode = "가".charCodeAt(0);
const hangulSyllableEndCode = "힣".charCodeAt(0);
const hangulSyllableBlockSize = 588;
const initialConsonants = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

export type EventFilterState = {
  onlyUpcoming: boolean;
  search: string;
};

function normalizeEventSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

function isConsonantOnlySearchText(value: string): boolean {
  return value.length > 0 && [...value].every((char) => char >= "ㄱ" && char <= "ㅎ");
}

function toInitialConsonantText(value: string): string {
  return [...value]
    .map((char) => {
      const charCode = char.charCodeAt(0);
      if (charCode < hangulSyllableStartCode || charCode > hangulSyllableEndCode) {
        return char;
      }

      return initialConsonants[Math.floor((charCode - hangulSyllableStartCode) / hangulSyllableBlockSize)] ?? char;
    })
    .join("");
}

function matchesEventSearchText(event: EventListItem, searchText: string): boolean {
  if (!searchText) {
    return true;
  }

  const eventName = normalizeEventSearchText(event.name);
  if (hangul.search(eventName, searchText) >= 0) {
    return true;
  }

  const disassembledEventName = hangul.disassemble(eventName).join("");
  const disassembledSearchText = hangul.disassemble(searchText).join("");
  if (disassembledEventName.includes(disassembledSearchText)) {
    return true;
  }

  return isConsonantOnlySearchText(searchText) && toInitialConsonantText(eventName).includes(searchText);
}

function isPermanentizedBeforeGracePeriod(event: EventListItem, now: string): boolean {
  const permanentSchedule = event.schedules.permanent;
  if (!permanentSchedule) {
    return false;
  }

  return getInstantTime(permanentSchedule.since) <= getInstantTime(now) - permanentGracePeriodMs;
}

function isComingSchedule(schedule: EventListSchedule, now: string): boolean {
  if (schedule.status === "past") {
    return false;
  }

  return schedule.runType !== "permanent" || getInstantTime(schedule.since) > getInstantTime(now) - permanentGracePeriodMs;
}

export function filterEventList(events: EventListItem[], filter: EventFilterState, now: string): EventListItem[] {
  const normalizedSearch = normalizeEventSearchText(filter.search);

  return events.filter((event) => {
    if (
      filter.onlyUpcoming &&
      !scheduleOrder.some((runType) => {
        const schedule = event.schedules[runType];
        return schedule ? isComingSchedule(schedule, now) : false;
      })
    ) {
      return false;
    }

    if (!matchesEventSearchText(event, normalizedSearch)) {
      return false;
    }

    return true;
  });
}
