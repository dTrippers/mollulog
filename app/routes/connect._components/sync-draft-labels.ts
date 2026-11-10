import { parseUtcTimestamp } from "~/lib/date-time";
import dayjs from "~/lib/dayjs";
import type { SyncDraftStatus, SyncDraftType } from "~/models/sync-draft";

/** What a draft of this type contains, as the review list and the review header name it. */
export function syncDraftTypeLabel(type: SyncDraftType): string {
  switch (type) {
    case "student_state":
      return "학생 현재 상태, 육성 목표";
    case "student_tier":
      return "학생 보유 등급";
    case "item_inventory":
      return "아이템 보유 수량";
  }
}

export function syncDraftCountLabel(type: SyncDraftType, count: number): string {
  const formatted = count.toLocaleString("ko-KR");
  return type === "item_inventory" ? `아이템 ${formatted}개` : `학생 ${formatted}명`;
}

export function draftStatusLabel(status: SyncDraftStatus): string {
  switch (status) {
    case "applied":
      return "반영됨";
    case "discarded":
      return "삭제됨";
    case "expired":
      return "만료됨";
    case "pending":
      return "대기 중";
  }
}

/** "2026/11/09 14:20" in Korean standard time, so the server and the browser render the same text. */
export function formatDraftTimestamp(value: string): string {
  const at = parseUtcTimestamp(value);
  return at.isValid() ? dayjs(at).tz("Asia/Seoul").format("YYYY/MM/DD HH:mm") : "";
}

/** The entry's recognition confidence from its meta JSON, or null when it has none. */
export function parseConfidence(meta: string | null): number | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { confidence?: unknown };
    return typeof parsed.confidence === "number" ? parsed.confidence : null;
  } catch {
    return null;
  }
}
