/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen, within } from "@testing-library/react";
import { createRoutesStub, Outlet } from "react-router";
import { equipmentCategoryImageUrl } from "~/models/assets";
import {
  buildFavoriteEvent,
  countDaysUntilStart,
  type FavoriteEvent,
  selectFavoriteEventContents,
} from "~/routes/$username.futures._components/favorite-events";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/content.server", () => ({ getContentsComments: jest.fn() }));
jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: jest.fn() }));
jest.mock("~/models/sensei", () => ({ getHideRecruitmentOpinions: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: jest.fn(), getStudentSkillItemsBatch: jest.fn() }));
jest.mock("~/views/futures", () => ({ getFutureContents: jest.fn() }));
jest.mock("~/routes/$username._components/route-sensei.server", () => ({ getRouteSensei: jest.fn() }));

import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getContentsComments } from "~/models/content.server";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getHideRecruitmentOpinions } from "~/models/sensei";
import { getAllStudentsMap, getStudentSkillItemsBatch } from "~/models/student";
import { getRouteSensei } from "~/routes/$username._components/route-sensei.server";
import UserFavoriteStudents, { loader } from "~/routes/$username.futures";
import { getFutureContents } from "~/views/futures";

const now = "2026-11-10T03:00:00.000Z";

const recruitment = (favoriteKey: string, student: { uid: string } | null, studentName = favoriteKey) => ({
  recruitmentType: "usual" as never,
  rerun: false,
  studentName,
  favoriteKey,
  student,
});

const content = (uid: string, overrides: Record<string, unknown> = {}) => ({
  uid,
  name: `이벤트 ${uid}`,
  contentType: "event",
  startAt: "2026-11-13T02:00:00.000Z",
  endAt: "2026-11-27T02:00:00.000Z",
  recruitments: [recruitment("arona", { uid: "arona" }), recruitment("plana", { uid: "plana" })],
  ...overrides,
});

const studentsByUid = {
  arona: {
    uid: "arona",
    name: "아로나",
    school: "etc",
    attackType: "explosive",
    defenseType: "light",
    role: "striker",
    equipments: ["hat", "gloves", "watch"],
  },
  plana: {
    uid: "plana",
    name: "프라나",
    school: "etc",
    attackType: "piercing",
    defenseType: "heavy",
    role: "special",
    equipments: ["bag"],
  },
} as never;

const opinion = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  uid: "opinion-1",
  contentId: "event-1",
  body: "꼭 모집할 예정",
  visibility: "public",
  parentCommentId: null,
  pinned: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  sensei: { username: "sensei", profileStudentId: null },
  ...overrides,
});

describe("favorite events", () => {
  it("keeps only non-raid events with a favorite student, in the event order", () => {
    const contents = [
      content("event-1"),
      content("raid-1", { contentType: "total_assault" }),
      content("event-2"),
      content("event-3"),
    ];
    const favorites = [
      { studentId: "plana", contentId: "event-3" },
      { studentId: "arona", contentId: "raid-1" },
      { studentId: "arona", contentId: "event-1" },
      { studentId: "someone-else", contentId: "event-2" },
    ];

    expect(selectFavoriteEventContents(contents as never, favorites).map(({ content }) => content.uid)).toEqual([
      "event-1",
      "event-3",
    ]);
  });

  it("lists the favorited students with their attributes and items, and a student still being prepared by name", () => {
    const event = buildFavoriteEvent({
      content: content("event-1", {
        recruitments: [
          recruitment("arona", { uid: "arona" }),
          recruitment("plana", { uid: "plana" }),
          recruitment("pending:새 학생", null, "새 학생"),
        ],
      }) as never,
      favoriteKeys: new Set(["arona", "pending:새 학생"]),
      studentsByUid,
      skillItemsByUid: new Map([
        [
          "arona",
          {
            schaleDbId: null,
            skillItems: [
              { item: { uid: "artifact-low", subCategory: "artifact", rarity: 2 } },
              { item: { uid: "artifact-main", subCategory: "artifact", rarity: 4 } },
              { item: { uid: "book", subCategory: "book", rarity: 4 } },
            ],
          },
        ],
      ]),
      opinions: [],
      ownerUsername: "sensei",
      now,
    });

    expect(event).toEqual(
      expect.objectContaining({
        contentType: "event",
        since: "2026-11-13T02:00:00.000Z",
        until: "2026-11-27T02:00:00.000Z",
      }),
    );
    expect(event.students).toEqual([
      expect.objectContaining({
        key: "arona",
        uid: "arona",
        name: "아로나",
        recruitmentLabel: "신규",
        attackType: "explosive",
        equipments: ["hat", "gloves", "watch"],
        artifactItems: [
          { uid: "artifact-main", rarity: 4 },
          { uid: "artifact-low", rarity: 2 },
        ],
      }),
      expect.objectContaining({ key: "pending:새 학생", uid: null, name: "새 학생", attackType: null, equipments: [] }),
    ]);
  });

  it("summarizes the opinions with the owner's pinned one, and keeps a failed lookup apart from no opinions", () => {
    const base = {
      content: content("event-1") as never,
      favoriteKeys: new Set(["arona"]),
      studentsByUid,
      skillItemsByUid: new Map(),
      ownerUsername: "sensei",
      now,
    };

    expect(
      buildFavoriteEvent({
        ...base,
        opinions: [
          opinion({ uid: "other", body: "다른 선생님 고정", sensei: { username: "other", profileStudentId: null } }),
          opinion({ createdAt: "2026-11-09T00:00:00.000Z" }),
          opinion({ uid: "reply", parentCommentId: 1, pinned: false }),
        ] as never,
      }).opinion,
    ).toEqual({ count: 3, hasRecentOpinion: true, pinnedBody: "꼭 모집할 예정" });
    expect(buildFavoriteEvent({ ...base, opinions: [] }).opinion).toEqual({
      count: 0,
      hasRecentOpinion: false,
      pinnedBody: null,
    });
    expect(buildFavoriteEvent({ ...base, opinions: null }).opinion).toBeNull();
  });

  it("keeps an unannounced end as unknown", () => {
    const event = buildFavoriteEvent({
      content: content("event-1", { endAt: null }) as never,
      favoriteKeys: new Set(["arona"]),
      studentsByUid,
      skillItemsByUid: new Map(),
      opinions: [],
      ownerUsername: "sensei",
      now,
    });
    expect(event.until).toBeNull();
  });

  it("counts the days until the start in the display time zone", () => {
    expect(countDaysUntilStart("2026-11-13T02:00:00.000Z", now, "Asia/Seoul")).toBe(3);
    // 2026-11-11 01:00 KST, for an event starting at 11:00 KST the same day: still November 10 in UTC.
    expect(countDaysUntilStart("2026-11-11T02:00:00.000Z", "2026-11-10T16:00:00.000Z", "Asia/Seoul")).toBe(0);
    expect(countDaysUntilStart("2026-11-11T02:00:00.000Z", "2026-11-10T16:00:00.000Z", "UTC")).toBe(1);
  });

  it("uses the equipment category images", () => {
    expect(equipmentCategoryImageUrl("hat")).toBe("https://assets.mollulog.net/assets/images/equipments/hat");
  });
});

describe("favorite students loader", () => {
  const logger = { error: jest.fn() };
  const args = {
    request: new Request("https://mollulog.test/@sensei/futures"),
    params: { username: "@sensei" },
    context: { cloudflare: { env: {} as Env, ctx: {} as ExecutionContext } },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(now), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    jest.mocked(getLogger).mockReturnValue(logger as never);
    jest.mocked(getActiveSensei).mockResolvedValue(null);
    jest.mocked(getHideRecruitmentOpinions).mockResolvedValue(true);
    jest.mocked(getRouteSensei).mockResolvedValue({ id: 7, username: "sensei" } as never);
    jest.mocked(getUserFavoritedStudents).mockResolvedValue([{ studentId: "arona", contentId: "event-1" }] as never);
    jest.mocked(getFutureContents).mockResolvedValue([content("event-1"), content("event-2")] as never);
    jest.mocked(getAllStudentsMap).mockResolvedValue(studentsByUid);
    jest.mocked(getStudentSkillItemsBatch).mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads the owner's favorites for a visitor, with the opinions the visitor can see", async () => {
    jest.mocked(getContentsComments).mockResolvedValue({ "event-1": [opinion()] } as never);

    const result = await loader(args);

    expect(getUserFavoritedStudents).toHaveBeenCalledWith(expect.anything(), 7, undefined, expect.anything());
    expect(getStudentSkillItemsBatch).toHaveBeenCalledWith(expect.anything(), ["arona"]);
    expect(getHideRecruitmentOpinions).toHaveBeenCalledWith(expect.anything(), null, expect.anything());
    expect(getContentsComments).toHaveBeenCalledWith(
      expect.anything(),
      ["event-1"],
      undefined,
      expect.objectContaining({ hideRecruitmentOpinions: true }),
    );
    expect(result.now).toBe(now);
    expect(result.events.map((event) => [event.uid, event.students.map(({ key }) => key), event.opinion])).toEqual([
      ["event-1", ["arona"], { count: 1, hasRecentOpinion: false, pinnedBody: "꼭 모집할 예정" }],
    ]);
  });

  it("marks only the opinion summaries failed when the opinions cannot be loaded", async () => {
    jest.mocked(getContentsComments).mockRejectedValue(new Error("db down"));

    const result = await loader(args);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.opinion).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it("marks the opinion summaries failed when the viewer's opinion setting cannot be read", async () => {
    jest.mocked(getHideRecruitmentOpinions).mockRejectedValue(new Error("db down"));

    const result = await loader(args);

    expect(getContentsComments).not.toHaveBeenCalled();
    expect(result.events[0]?.opinion).toBeNull();
  });

  it("fails the screen when the materials cannot be loaded", async () => {
    jest.mocked(getStudentSkillItemsBatch).mockRejectedValue(new Error("baql down"));

    await expect(loader(args)).rejects.toThrow("baql down");
  });

  it("fails the screen when the favorites cannot be loaded", async () => {
    jest.mocked(getUserFavoritedStudents).mockRejectedValue(new Error("db down"));

    await expect(loader(args)).rejects.toThrow("db down");
  });
});

describe("favorite students screen", () => {
  function renderScreen(events: FavoriteEvent[], isOwner: boolean) {
    const Stub = createRoutesStub([
      {
        path: "/:username",
        Component: () => <Outlet context={{ username: "sensei", isOwner }} />,
        children: [{ path: "futures", loader: () => ({ events, now }), Component: UserFavoriteStudents }],
      },
    ]);
    render(<Stub initialEntries={["/@sensei/futures"]} />);
  }

  const event = buildFavoriteEvent({
    content: content("event-1") as never,
    favoriteKeys: new Set(["arona"]),
    studentsByUid,
    skillItemsByUid: new Map(),
    opinions: null,
    ownerUsername: "sensei",
    now,
  });

  it("shows each event with its favorite students and an explicit opinion failure", async () => {
    renderScreen([event], false);

    const card = await screen.findByRole("article", { name: "이벤트 event-1" });
    expect(within(card).getByRole("link", { name: "이벤트 event-1" }).getAttribute("href")).toBe("/events/event-1");
    expect(within(card).getByText("D-3")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "아로나" }).getAttribute("href")).toBe("/students/arona");
    expect(within(card).getByText("폭발")).toBeTruthy();
    expect(within(card).getByRole("list", { name: "아로나 육성 재료" })).toBeTruthy();
    expect(within(card).getByText("의견을 불러오지 못했어요")).toBeTruthy();
  });

  it("shows an unannounced end as an open-ended period", async () => {
    renderScreen([{ ...event, until: null }], false);

    const card = await screen.findByRole("article", { name: "이벤트 event-1" });
    expect(within(card).getByText("2026/11/13부터")).toBeTruthy();
  });

  it("offers the owner a way to register favorites when there are none, and not a visitor", async () => {
    renderScreen([], true);
    expect(await screen.findByText("아직 관심 학생을 등록하지 않았어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "미래시 보고 등록하러 가기" }).getAttribute("href")).toBe("/futures");
  });

  it("shows a visitor only the empty message", async () => {
    renderScreen([], false);
    expect(await screen.findByText("아직 관심 학생을 등록하지 않았어요")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "미래시 보고 등록하러 가기" })).toBeNull();
  });
});
