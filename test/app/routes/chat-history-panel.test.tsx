/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { V2Page } from "~/components/v2/layout";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import type { ChatConversationSummary } from "~/domain/chat-conversation";
import { ChatHistoryPanel } from "~/routes/chat._components/ChatHistoryPanel";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

const loadedAt = new Date("2026-10-30T09:30:30.000Z");
const conversations: ChatConversationSummary[] = [
  {
    uid: "conversation-1",
    title: "미카 생일",
    lastMessageAt: new Date("2026-10-30T09:30:00.000Z"),
    questionCount: 2,
    latestMessage: { status: "pending", updatedAt: new Date("2026-10-30T09:30:00.000Z") },
  },
];

function renderHistory(resolved: boolean) {
  return render(
    <MemoryRouter>
      <TimeZoneProvider timeZone="Asia/Seoul" resolved={resolved}>
        <V2Page width="wide">
          <ChatHistoryPanel
            conversations={conversations}
            selectedUid={null}
            loadedAt={loadedAt}
            onNewConversation={() => {}}
          />
        </V2Page>
      </TimeZoneProvider>
    </MemoryRouter>,
  );
}

describe("chat history time zone rendering", () => {
  beforeEach(() => installLayoutTestEnv());

  it("omits time-dependent labels until the display time zone is resolved", () => {
    renderHistory(false);

    expect(screen.getByText("미카 생일")).toBeTruthy();
    expect(screen.getByText("질문 2개")).toBeTruthy();
    expect(screen.queryByText("오늘")).toBeNull();
    expect(screen.queryByText("18:30")).toBeNull();
    expect(screen.queryByText("답변 중")).toBeNull();
  });

  it("shows the normal grouped history after the display time zone is resolved", () => {
    renderHistory(true);

    expect(screen.getByText("오늘")).toBeTruthy();
    expect(screen.getByText(/18:30 · 질문 2개/)).toBeTruthy();
    expect(screen.getByText("답변 중")).toBeTruthy();
  });
});
