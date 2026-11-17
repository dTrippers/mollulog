import { describe, expect, it } from "@jest/globals";
import {
  buildRecruitTicketCards,
  itemCardKey,
  productCardKey,
  type RecruitTicketItemSource,
  type RecruitTicketPoolSource,
  type RecruitTicketProductSource,
  type RecruitTicketSelection,
  type RecruitTicketSource,
  type RecruitTicketStudentSource,
  recruitTicketKindOf,
  selectCurrentPools,
} from "~/domain/recruit-tickets";
import type { UtcIsoString } from "~/lib/date-time";

const NOW = "2026-11-18T03:00:00.000Z" as UtcIsoString;

function at(value: string): UtcIsoString {
  return value as UtcIsoString;
}

function pool(overrides: Partial<RecruitTicketPoolSource> & Pick<RecruitTicketPoolSource, "uid" | "itemUid">) {
  return { sourceType: "banner", startAt: null, endAt: null, studentUids: [], ...overrides };
}

function item(uid: string, overrides: Partial<RecruitTicketItemSource> = {}): RecruitTicketItemSource {
  return {
    uid,
    name: `티켓 ${uid}`,
    gachaTicketType: "select_recruit",
    imageUrl: `https://img/${uid}.png`,
    ...overrides,
  };
}

function product(overrides: Partial<RecruitTicketProductSource> & Pick<RecruitTicketProductSource, "uid">) {
  return { name: `상품 ${overrides.uid}`, startAt: null, endAt: null, contents: [], pools: [], ...overrides };
}

const STUDENTS = new Map<string, RecruitTicketStudentSource>(
  [
    { uid: "10001", name: "가", initialTier: 3, order: 10 },
    { uid: "10002", name: "나", initialTier: 3, order: 30 },
    { uid: "10003", name: "다", initialTier: 2, order: 20 },
    { uid: "10004", name: "라", initialTier: 3, order: 40 },
  ].map((student) => [student.uid, student] as const),
);

function build(
  source: Partial<RecruitTicketSource>,
  selections: RecruitTicketSelection[],
  recruitedStudentUids: ReadonlySet<string> | null = null,
) {
  return buildRecruitTicketCards({
    source: { products: [], pools: [], items: {}, ...source },
    students: STUDENTS,
    selections,
    recruitedStudentUids,
    now: NOW,
  });
}

describe("recruitTicketKindOf", () => {
  it("maps the selection ticket and every ★3-guaranteed type, and nothing else", () => {
    expect(recruitTicketKindOf("select_recruit")).toBe("select");
    expect(recruitTicketKindOf("start_dash")).toBe("fixed");
    expect(recruitTicketKindOf("package_three_star_r88_sonic")).toBe("fixed");
    expect(recruitTicketKindOf("select_pickup_once")).toBeNull();
    expect(recruitTicketKindOf("normal")).toBeNull();
    expect(recruitTicketKindOf("constructor")).toBeNull();
    expect(recruitTicketKindOf(null)).toBeNull();
  });
});

describe("selectCurrentPools", () => {
  const time = Date.parse(NOW);
  const thisWeek = pool({
    uid: "a",
    itemUid: "1",
    startAt: at("2026-11-17T02:00:00.000Z"),
    endAt: at("2026-11-24T02:00:00.000Z"),
  });
  const nextWeek = pool({
    uid: "b",
    itemUid: "1",
    startAt: at("2026-11-24T02:00:00.000Z"),
    endAt: at("2026-12-01T02:00:00.000Z"),
  });
  const later = pool({ uid: "c", itemUid: "1", startAt: at("2026-12-01T02:00:00.000Z") });

  it("takes the pools open now", () => {
    expect(selectCurrentPools([thisWeek, nextWeek], time)?.pools).toEqual([thisWeek]);
  });

  it("takes the next pools to open when none is open", () => {
    expect(selectCurrentPools([nextWeek, later], time)?.pools).toEqual([nextWeek]);
  });

  it("is null when every pool has closed", () => {
    const closed = pool({ uid: "d", itemUid: "1", startAt: at("2026-11-01T00:00:00.000Z"), endAt: NOW });
    expect(selectCurrentPools([closed], time)).toBeNull();
  });
});

describe("buildRecruitTicketCards", () => {
  it("shows only the chosen cards", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001"] })],
        }),
        product({
          uid: "p2",
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "b", itemUid: "1", studentUids: ["10001"] })],
        }),
      ],
      items: { "1": item("1") },
    };
    const { cards, problems } = build(source, [{ productUid: "p2", itemUid: "1" }]);
    expect(cards.map((card) => card.key)).toEqual([productCardKey("p2", "1")]);
    expect(problems).toEqual([]);
  });

  it("builds a product card with its sale period and icon", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          name: "패키지",
          startAt: at("2026-11-17T02:00:00.000Z"),
          endAt: at("2026-12-01T02:00:00.000Z"),
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001", "10002"] })],
        }),
      ],
      items: { "1": item("1", { name: "선택 모집 티켓" }) },
    };
    const [card] = build(source, [{ productUid: "p1", itemUid: "1" }]).cards;
    expect(card).toMatchObject({
      kind: "select",
      title: "선택 모집 티켓",
      product: { uid: "p1", name: "패키지" },
      iconItemUid: "1",
      iconUrl: "https://img/1.png",
      periodStartAt: "2026-11-17T02:00:00.000Z",
      periodEndAt: "2026-12-01T02:00:00.000Z",
      targetsChangeAt: null,
    });
  });

  it("builds one card for a ticket the product gives more than once", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          contents: [{ itemUid: "1" }, { itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001"] })],
        }),
      ],
      items: { "1": item("1") },
    };
    expect(build(source, [{ productUid: "p1", itemUid: "1" }]).cards.map((card) => card.key)).toEqual([
      productCardKey("p1", "1"),
    ]);
  });

  it("uses this week's pools and notes when the targets change before the sale ends", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          startAt: at("2026-11-10T02:00:00.000Z"),
          endAt: at("2026-12-01T02:00:00.000Z"),
          contents: [{ itemUid: "1" }],
          pools: [
            pool({
              uid: "a",
              itemUid: "1",
              startAt: at("2026-11-10T02:00:00.000Z"),
              endAt: at("2026-11-17T02:00:00.000Z"),
              studentUids: ["10004"],
            }),
            pool({
              uid: "b",
              itemUid: "1",
              startAt: at("2026-11-17T02:00:00.000Z"),
              endAt: at("2026-11-24T02:00:00.000Z"),
              studentUids: ["10001"],
            }),
            pool({
              uid: "c",
              itemUid: "1",
              startAt: at("2026-11-17T02:00:00.000Z"),
              endAt: at("2026-11-24T02:00:00.000Z"),
              studentUids: ["10002"],
            }),
          ],
        }),
      ],
      items: { "1": item("1") },
    };
    const [card] = build(source, [{ productUid: "p1", itemUid: "1" }]).cards;
    expect(card.students.map((student) => student.uid)).toEqual(["10002", "10001"]);
    expect(card.targetsChangeAt).toBe("2026-11-24T02:00:00.000Z");
  });

  it("uses the first pools of a product that starts later", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          startAt: at("2026-11-24T02:00:00.000Z"),
          endAt: at("2026-12-01T02:00:00.000Z"),
          contents: [{ itemUid: "1" }],
          pools: [
            pool({
              uid: "a",
              itemUid: "1",
              startAt: at("2026-11-24T02:00:00.000Z"),
              endAt: at("2026-12-01T02:00:00.000Z"),
              studentUids: ["10004"],
            }),
          ],
        }),
      ],
      items: { "1": item("1") },
    };
    const [card] = build(source, [{ productUid: "p1", itemUid: "1" }]).cards;
    expect(card.students.map((student) => student.uid)).toEqual(["10004"]);
    expect(card.targetsChangeAt).toBeNull();
  });

  it("drops products whose sale has ended", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          endAt: NOW,
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001"] })],
        }),
      ],
      items: { "1": item("1") },
    };
    expect(build(source, [{ productUid: "p1", itemUid: "1" }])).toEqual({ cards: [], problems: [] });
  });

  it("keeps only the ★3 students of a 확정권", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001", "10003"] })],
        }),
      ],
      items: { "1": item("1", { gachaTicketType: "three_star" }) },
    };
    const [card] = build(source, [{ productUid: "p1", itemUid: "1" }]).cards;
    expect(card.kind).toBe("fixed");
    expect(card.students.map((student) => student.uid)).toEqual(["10001"]);
  });

  it("puts unrecruited students first, each group newest first", () => {
    const source = {
      products: [
        product({
          uid: "p1",
          contents: [{ itemUid: "1" }],
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001", "10002", "10003", "10004"] })],
        }),
      ],
      items: { "1": item("1") },
    };
    const selections = [{ productUid: "p1", itemUid: "1" }];
    const [card] = build(source, selections, new Set(["10004", "10003"])).cards;
    expect(card.students).toEqual([
      { uid: "10002", name: "나", unrecruited: true },
      { uid: "10001", name: "가", unrecruited: true },
      { uid: "10004", name: "라", unrecruited: false },
      { uid: "10003", name: "다", unrecruited: false },
    ]);
    const [signedOut] = build(source, selections, null).cards;
    expect(signedOut.students.map((student) => student.unrecruited)).toEqual([false, false, false, false]);
  });

  it("merges tickets outside products with the same name and students, and shows a chosen one's icon", () => {
    const selection = { sourceType: "selection", studentUids: ["10002", "10001"] };
    const source = {
      pools: [
        pool({ uid: "a", itemUid: "11", ...selection }),
        pool({ uid: "b", itemUid: "12", ...selection, studentUids: ["10001", "10002"] }),
        pool({ uid: "c", itemUid: "13", ...selection, studentUids: ["10001"] }),
      ],
      items: {
        "11": item("11", { name: "선택권" }),
        "12": item("12", { name: "선택권" }),
        "13": item("13", { name: "선택권" }),
      },
    };
    const { cards } = build(source, [
      { productUid: null, itemUid: "12" },
      { productUid: null, itemUid: "13" },
    ]);
    expect(cards.map((card) => [card.key, card.iconItemUid])).toEqual([
      [itemCardKey(["11", "12"]), "12"],
      [itemCardKey(["13"]), "13"],
    ]);
    expect(cards[0]).toMatchObject({ product: null, periodStartAt: null, targetsChangeAt: null });
  });

  it("gives a ticket banner outside products its banner period and notes the weekly change", () => {
    const source = {
      pools: [
        pool({
          uid: "a",
          itemUid: "1",
          startAt: at("2026-11-17T02:00:00.000Z"),
          endAt: at("2026-11-24T02:00:00.000Z"),
          studentUids: ["10001"],
        }),
        pool({
          uid: "b",
          itemUid: "1",
          startAt: at("2026-11-24T02:00:00.000Z"),
          endAt: at("2026-12-01T02:00:00.000Z"),
          studentUids: ["10002"],
        }),
      ],
      items: { "1": item("1", { gachaTicketType: "three_star" }) },
    };
    const [card] = build(source, [{ productUid: null, itemUid: "1" }]).cards;
    expect(card).toMatchObject({
      periodStartAt: "2026-11-17T02:00:00.000Z",
      periodEndAt: "2026-11-24T02:00:00.000Z",
      targetsChangeAt: "2026-11-24T02:00:00.000Z",
    });
  });

  it("sorts cards with a period by start, then cards without one", () => {
    const contents = (itemUid: string) => [{ itemUid }];
    const source = {
      products: [
        product({
          uid: "late",
          startAt: at("2026-11-20T00:00:00.000Z"),
          contents: contents("1"),
          pools: [pool({ uid: "a", itemUid: "1", studentUids: ["10001"] })],
        }),
        product({
          uid: "early",
          startAt: at("2026-11-10T00:00:00.000Z"),
          contents: contents("1"),
          pools: [pool({ uid: "b", itemUid: "1", studentUids: ["10001"] })],
        }),
      ],
      pools: [pool({ uid: "c", itemUid: "2", sourceType: "selection", studentUids: ["10001"] })],
      items: { "1": item("1"), "2": item("2") },
    };
    const { cards } = build(source, [
      { productUid: "late", itemUid: "1" },
      { productUid: "early", itemUid: "1" },
      { productUid: null, itemUid: "2" },
    ]);
    expect(cards.map((card) => card.key)).toEqual([
      productCardKey("early", "1"),
      productCardKey("late", "1"),
      itemCardKey(["2"]),
    ]);
  });

  it("reports chosen cards it cannot show and ignores unchosen ones", () => {
    const contents = (itemUid: string) => [{ itemUid }];
    const source = {
      products: [
        product({
          uid: "missing",
          contents: contents("9"),
          pools: [pool({ uid: "a", itemUid: "9", studentUids: ["10001"] })],
        }),
        product({
          uid: "unknown",
          contents: contents("2"),
          pools: [pool({ uid: "b", itemUid: "2", studentUids: ["10001"] })],
        }),
        product({
          uid: "unnamed",
          name: null,
          contents: contents("1"),
          pools: [pool({ uid: "c", itemUid: "1", studentUids: ["10001"] })],
        }),
        product({
          uid: "catalog",
          contents: contents("1"),
          pools: [pool({ uid: "d", itemUid: "1", studentUids: ["99999"] })],
        }),
        product({
          uid: "lowtier",
          contents: contents("3"),
          pools: [pool({ uid: "e", itemUid: "3", studentUids: ["10003"] })],
        }),
        product({
          uid: "ignored",
          name: null,
          contents: contents("9"),
          pools: [pool({ uid: "f", itemUid: "9", studentUids: ["10001"] })],
        }),
      ],
      items: {
        "1": item("1"),
        "2": item("2", { gachaTicketType: "select_pickup" }),
        "3": item("3", { gachaTicketType: "three_star" }),
      },
    };
    const { cards, problems } = build(source, [
      { productUid: "missing", itemUid: "9" },
      { productUid: "unknown", itemUid: "2" },
      { productUid: "unnamed", itemUid: "1" },
      { productUid: "catalog", itemUid: "1" },
      { productUid: "lowtier", itemUid: "3" },
    ]);
    expect(cards).toEqual([]);
    expect(problems.map((problem) => problem.key).sort()).toEqual(
      [
        productCardKey("missing", "9"),
        productCardKey("unknown", "2"),
        productCardKey("unnamed", "1"),
        productCardKey("catalog", "1"),
        productCardKey("lowtier", "3"),
      ].sort(),
    );
  });
});
