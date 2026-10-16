import { contentTypeLocale } from "~/locales/ko";
import type { FutureViewContent } from "./types";

// Type label of a content. A rerun of an event or pickup gets the 복각 prefix, and a permanent event shows 이벤트 상설화.
export function getFutureMediaTypeLabel(content: Pick<FutureViewContent, "contentType" | "runType">): string {
  if (content.contentType === "event" && content.runType === "permanent") {
    return "이벤트 상설화";
  }
  const rerunPrefix =
    (content.contentType === "event" || content.contentType === "pickup") && content.runType === "rerun" ? "복각 " : "";
  return `${rerunPrefix}${contentTypeLocale[content.contentType]}`;
}
