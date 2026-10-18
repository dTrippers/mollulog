import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import type { PathFeedbackAdditional } from "~/domain/feedback";
import {
  createFeedbackReply,
  createFeedbackTicket,
  getFeedbackThreadByUidForUser,
  getFeedbackTicketByUidForUser,
  getFeedbackTicketsByUserId,
  getLatestAdminFeedbackReplyId,
  markFeedbackTicketAdminRepliesSeen,
} from "~/models/feedback";
import { action as contactAction, loader as contactLoader } from "~/routes/contact._index";
import { action as detailAction, loader as detailLoader } from "~/routes/contact.$uid";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({ error: jest.fn() })),
}));
jest.mock("~/models/feedback", () => ({
  createFeedbackReply: jest.fn(),
  createFeedbackTicket: jest.fn(),
  getFeedbackThreadByUidForUser: jest.fn(),
  getFeedbackTicketByUidForUser: jest.fn(),
  getFeedbackTicketsByUserId: jest.fn(),
  getLatestAdminFeedbackReplyId: jest.fn(),
  markFeedbackTicketAdminRepliesSeen: jest.fn(),
}));

const mockGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockCreateFeedbackReply = createFeedbackReply as jest.MockedFunction<typeof createFeedbackReply>;
const mockCreateFeedbackTicket = createFeedbackTicket as jest.MockedFunction<typeof createFeedbackTicket>;
const mockGetFeedbackThread = getFeedbackThreadByUidForUser as jest.MockedFunction<
  typeof getFeedbackThreadByUidForUser
>;
const mockGetFeedbackTicket = getFeedbackTicketByUidForUser as jest.MockedFunction<
  typeof getFeedbackTicketByUidForUser
>;
const mockGetFeedbackTickets = getFeedbackTicketsByUserId as jest.MockedFunction<typeof getFeedbackTicketsByUserId>;
const mockGetLatestAdminReplyId = getLatestAdminFeedbackReplyId as jest.MockedFunction<
  typeof getLatestAdminFeedbackReplyId
>;
const mockMarkRepliesSeen = markFeedbackTicketAdminRepliesSeen as jest.MockedFunction<
  typeof markFeedbackTicketAdminRepliesSeen
>;

const env = {} as Env;
const ctx = {} as ExecutionContext;
const sensei = { id: 42 };
const ticket = { id: 11, uid: "ticket-1", userId: 42, lastSeenAdminReplyId: 2 };
const replies = [
  { id: 8, isAdmin: true },
  { id: 9, isAdmin: false },
];

type DataResult<T> = { type: "DataWithResponseInit"; data: T; init: ResponseInit | null };

function expectDataResult<T>(result: unknown): DataResult<T> {
  expect(result).toMatchObject({ type: "DataWithResponseInit" });
  return result as DataResult<T>;
}

function requestWithForm(values: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return { formData: async () => formData } as unknown as Request;
}

function routeArgs(request = requestWithForm(), params: Record<string, string> = {}) {
  return {
    request,
    context: { cloudflare: { env, ctx } },
    params,
  } as never;
}

async function thrownResult(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the route to throw an error response");
}

function expectUnauthorizedRedirect(result: unknown) {
  expect(result).toHaveProperty("status", 302);
  expect((result as { headers: Headers }).headers.get("Location")).toBe("/unauthorized");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue(sensei as never);
  mockGetFeedbackTickets.mockResolvedValue([] as never);
  mockCreateFeedbackTicket.mockResolvedValue("ticket-new" as never);
  mockGetFeedbackThread.mockResolvedValue({ ticket, replies } as never);
  mockGetFeedbackTicket.mockResolvedValue(ticket as never);
  mockGetLatestAdminReplyId.mockReturnValue(8);
  mockMarkRepliesSeen.mockResolvedValue(undefined as never);
  mockCreateFeedbackReply.mockResolvedValue("reply-new" as never);
});

describe("contact index loader and action", () => {
  it("keeps unauthenticated history empty and loads tickets only for the active user", async () => {
    mockGetActiveSensei.mockResolvedValueOnce(null as never);
    expect(await contactLoader(routeArgs())).toEqual({ authenticated: false, tickets: null });
    expect(mockGetFeedbackTickets).not.toHaveBeenCalled();

    const tickets = [ticket];
    mockGetFeedbackTickets.mockResolvedValueOnce(tickets as never);
    expect(await contactLoader(routeArgs())).toEqual({ authenticated: true, tickets });
    expect(mockGetFeedbackTickets).toHaveBeenCalledWith(env, sensei.id, { ctx });
  });

  it("propagates history and thread query failures instead of converting them to empty data", async () => {
    const internalError = new Error("database unavailable");
    mockGetFeedbackTickets.mockRejectedValueOnce(internalError);
    await expect(contactLoader(routeArgs())).rejects.toBe(internalError);

    mockGetFeedbackThread.mockRejectedValueOnce(internalError);
    await expect(detailLoader(routeArgs(undefined, { uid: ticket.uid }))).rejects.toBe(internalError);
  });

  it("redirects unauthenticated writes before reading or persisting the form", async () => {
    mockGetActiveSensei.mockResolvedValueOnce(null as never);

    expectUnauthorizedRedirect(await contactAction(routeArgs(requestWithForm({ title: "제목", content: "내용" }))));
    expect(mockCreateFeedbackTicket).not.toHaveBeenCalled();
  });

  it("returns field errors with the original draft values", async () => {
    const result = expectDataResult<{
      error: { title: string; content: string };
      values: { title: string; content: string };
    }>(await contactAction(routeArgs(requestWithForm({ title: "  제목 초안  ", content: "  " }))));

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({
      error: { title: undefined, content: "내용을 입력해주세요." },
      values: { title: "  제목 초안  ", content: "  " },
    });
    expect(mockCreateFeedbackTicket).not.toHaveBeenCalled();
  });

  it("preserves scanner diagnostic metadata and redirects a created ticket to its detail", async () => {
    const additional = {
      type: "resource_scanner_feedback",
      version: 1,
      payload: {
        timestamp: "2026-10-17T00:00:00.000Z",
        path: "/scanner/resource?job=abc",
        viewport: { width: 390, height: 844, devicePixelRatio: 2 },
      },
    } satisfies PathFeedbackAdditional;
    const result = await contactAction(
      routeArgs(
        requestWithForm({
          title: "  화면 제보  ",
          content: "  버튼이 보이지 않아요  ",
          additional: JSON.stringify(additional),
        }),
      ),
    );

    expect(result).toHaveProperty("status", 302);
    expect((result as { headers: Headers }).headers.get("Location")).toBe("/contact/ticket-new");
    expect(mockCreateFeedbackTicket).toHaveBeenCalledWith(
      env,
      sensei.id,
      "화면 제보",
      "버튼이 보이지 않아요",
      null,
      additional,
      { ctx },
    );
  });

  it("turns create failures into a safe retry message", async () => {
    const internalError = new Error("SQL timeout; password=secret");
    mockCreateFeedbackTicket.mockRejectedValueOnce(internalError);

    const result = await thrownResult(contactAction(routeArgs(requestWithForm({ title: "제목", content: "내용" }))));

    expect(result).toMatchObject({
      data: { error: { code: "feedback.create_failed", message: "오류가 발생했어요. 잠시 후 다시 시도해주세요." } },
      init: { status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain("password=secret");
  });
});

describe("contact detail loader and action", () => {
  it("checks ownership through the user-scoped lookup and marks the latest admin reply seen", async () => {
    const result = await detailLoader(routeArgs(undefined, { uid: ticket.uid }));

    expect(result).toEqual({ ticket, replies });
    expect(mockGetFeedbackThread).toHaveBeenCalledWith(env, ticket.uid, sensei.id, { ctx });
    expect(mockMarkRepliesSeen).toHaveBeenCalledWith(env, ticket, 8, { ctx });
  });

  it("redirects unauthenticated detail access and returns the same safe 404 for a missing or foreign ticket", async () => {
    mockGetActiveSensei.mockResolvedValueOnce(null as never);
    expectUnauthorizedRedirect(await detailLoader(routeArgs(undefined, { uid: ticket.uid })));
    expect(mockGetFeedbackThread).not.toHaveBeenCalled();

    mockGetFeedbackThread.mockResolvedValueOnce(null as never);
    const result = await thrownResult(detailLoader(routeArgs(undefined, { uid: "not-owned" })));
    expect(result).toMatchObject({
      data: { error: { code: "feedback.not_found", message: "문의 내역을 찾을 수 없어요." } },
      init: { status: 404 },
    });
    expect(mockGetFeedbackThread).toHaveBeenCalledWith(env, "not-owned", sensei.id, { ctx });
    expect(mockMarkRepliesSeen).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated replies and replies to tickets outside the user scope", async () => {
    mockGetActiveSensei.mockResolvedValueOnce(null as never);
    expectUnauthorizedRedirect(
      await detailAction(routeArgs(requestWithForm({ content: "추가 내용" }), { uid: ticket.uid })),
    );
    expect(mockGetFeedbackTicket).not.toHaveBeenCalled();
    expect(mockCreateFeedbackReply).not.toHaveBeenCalled();

    mockGetFeedbackTicket.mockResolvedValueOnce(null as never);
    const result = await thrownResult(
      detailAction(routeArgs(requestWithForm({ content: "추가 내용" }), { uid: "not-owned" })),
    );
    expect(result).toMatchObject({ init: { status: 404 } });
    expect(mockGetFeedbackTicket).toHaveBeenCalledWith(env, "not-owned", sensei.id, { ctx });
    expect(mockCreateFeedbackReply).not.toHaveBeenCalled();
  });

  it("stores a trimmed follow-up reply and returns success", async () => {
    const result = expectDataResult<{ success: true }>(
      await detailAction(routeArgs(requestWithForm({ content: "  추가 문의 내용  " }), { uid: ticket.uid })),
    );

    expect(result.init?.status).toBeUndefined();
    expect(result.data).toEqual({ success: true });
    expect(mockGetFeedbackTicket).toHaveBeenCalledWith(env, ticket.uid, sensei.id, { ctx });
    expect(mockCreateFeedbackReply).toHaveBeenCalledWith(env, ticket.id, sensei.id, "추가 문의 내용", { ctx });
  });

  it("turns reply persistence failures into a safe retry message", async () => {
    mockCreateFeedbackReply.mockRejectedValueOnce(new Error("database socket closed"));

    const result = await thrownResult(
      detailAction(routeArgs(requestWithForm({ content: "추가 내용" }), { uid: ticket.uid })),
    );

    expect(result).toMatchObject({
      data: { error: { code: "feedback.reply_failed", message: "오류가 발생했어요. 잠시 후 다시 시도해주세요." } },
      init: { status: 500 },
    });
    expect(JSON.stringify(result)).not.toContain("database socket closed");
  });
});
