import { describe, expect, it } from "@jest/globals";
import { extractCertainTimelineImport, parseTimelineImport } from "~/domain/walkthrough-timeline-import";

const students = [
  { uid: "rio", name: "리오", altNames: [] },
  { uid: "dress-aru", name: "아루(드레스)", altNames: ["드아루"] },
  { uid: "swimsuit-hoshino", name: "호시노(수영복)", altNames: ["수시노"] },
  { uid: "idol-mari", name: "마리(아이돌)", altNames: ["돌마리"] },
  { uid: "idol-rio", name: "리오(아이돌)", altNames: ["임리오"] },
  { uid: "battle-hoshino", name: "호시노(무장)", altNames: ["교네루"] },
  { uid: "idol-mari-2", name: "마리(아이돌2)", altNames: ["임마리"] },
  { uid: "swimsuit-aiz", name: "아이즈(수영복)", altNames: ["수이아"] },
  { uid: "swimsuit-kanna", name: "칸나(수영복)", altNames: ["수칸나"] },
  { uid: "track-yuuka", name: "유우카(체육복)", altNames: ["체유카"] },
  { uid: "track-mari", name: "마리(체육복)", altNames: ["체마리"] },
  { uid: "himari", name: "히마리", altNames: [] },
  { uid: "amari", name: "아마리", altNames: [] },
  { uid: "wakamo", name: "와카모", altNames: [] },
  { uid: "band-shimiko", name: "시미코(밴드)", altNames: ["밴시미"] },
  { uid: "band-kazusa", name: "카즈사(밴드)", altNames: ["밴즈사"] },
  { uid: "christmas-rina", name: "리나(크리스마스)", altNames: ["클리나"] },
  { uid: "kotama", name: "코타마", altNames: [] },
  { uid: "dress-hina", name: "히나(드레스)", altNames: ["드히나"] },
  { uid: "kisaki", name: "키사키", altNames: [] },
  { uid: "marina", name: "마리나", altNames: [] },
  { uid: "aru", name: "아루", altNames: [] },
  { uid: "ako", name: "아코", altNames: [] },
  { uid: "mika", name: "미카", altNames: [] },
  { uid: "new-year-fuuka", name: "후우카(새해)", altNames: ["새후카", "새우카"] },
  { uid: "camp-kotama", name: "코타마(캠프)", altNames: ["캠타마"] },
  { uid: "seia", name: "세이아", altNames: [] },
  { uid: "camp-hare", name: "하레(캠프)", altNames: ["캠하레"] },
  { uid: "cherino", name: "체리노", altNames: [] },
  { uid: "mine", name: "미네", altNames: [] },
];

describe("parseTimelineImport", () => {
  it("keeps chained actions in one step and in source order", () => {
    const draft = parseTimelineImport("즉시 드아루 → 수시노", students);
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0].parsed.marker).toEqual({ kind: "immediate", value: "즉시" });
    expect(draft.steps[0].parsed.actions).toEqual([
      { kind: "student_ex", studentUid: "dress-aru" },
      { kind: "student_ex", studentUid: "swimsuit-hoshino" },
    ]);
  });

  it("parses copied EX and normal skill expressions", () => {
    const draft = parseTimelineImport("즉시 c임리오\n임리오1스", students);
    expect(draft.steps[0].parsed.actions[0]).toEqual({ kind: "student_ex", studentUid: "idol-rio", copied: true });
    expect(draft.steps[1].parsed.actions[0]).toEqual({ kind: "normal_skill", studentUid: "idol-rio" });
  });

  it("normalizes time separators and preserves parenthesized notes", () => {
    const draft = parseTimelineImport("03:34:200 돌마리 (초록색)", students);
    expect(draft.steps[0].parsed.marker).toEqual({ kind: "time_remaining", value: "03:34.200" });
    expect(draft.steps[0].parsed.note).toBe("초록색");
  });

  it("separates a named normal-skill condition from the following action", () => {
    const draft = parseTimelineImport("아마리 1스 직후 c임리오", [
      ...students,
      { uid: "amari", name: "아마리", altNames: [] },
    ]);
    expect(draft.steps[0].parsed.marker).toEqual({ kind: "after", value: "아마리 1스 직후" });
    expect(draft.steps[0].parsed.actions[0]).toEqual({ kind: "student_ex", studentUid: "idol-rio", copied: true });
  });

  it("does not guess an unresolved nickname and preserves the source text", () => {
    const draft = parseTimelineImport("돌왓삐", students);
    expect(draft.steps[0].tokens[0]).toMatchObject({ raw: "돌왓삐", status: "unresolved" });
    expect(draft.steps[0].parsed.actions[0]).toEqual({ kind: "free_text", text: "돌왓삐" });
    expect(draft.issues).toHaveLength(1);
  });

  it("treats a student in parentheses as the skill target", () => {
    const draft = parseTimelineImport("리오(임리오)", students);
    expect(draft.steps[0].tokens[0]).toMatchObject({ status: "confirmed", studentUid: "rio" });
    expect(draft.steps[0].parsed.actions[0]).toEqual({
      kind: "student_ex",
      studentUid: "rio",
      targetStudentUid: "idol-rio",
    });
  });

  it("parses bare cost, inner immediate actions, and phase dividers", () => {
    const draft = parseTimelineImport("10 교네루\n수이아 → 수칸나 → 즉시 교네루\n【페이즈 전환】", students);

    expect(draft.steps[0].parsed.marker).toEqual({ kind: "cost", value: "10코" });
    expect(draft.steps[0].parsed.actions[0]).toMatchObject({ studentUid: "battle-hoshino" });
    expect(draft.steps[1].parsed.actions[2]).toEqual({
      kind: "student_ex",
      studentUid: "battle-hoshino",
      text: "즉시",
    });
    expect(draft.steps[2].parsed).toMatchObject({ kind: "divider", note: "페이즈 전환", actions: [] });
  });

  it("accepts minute labels, equals signs, hyphen chains, and space-separated student chains", () => {
    const draft = parseTimelineImport(
      "3분45초 = 6코 = 아마리 (와카모)\n4코 체유카(체마리 바로 뒤)-수시노-히마리\n9코 밴시미 밴즈사 클리나 코타마",
      students,
    );

    expect(draft.steps[0].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "3:45 · 6코" },
      actions: [{ kind: "student_ex", studentUid: "amari", targetStudentUid: "wakamo" }],
    });
    expect(draft.steps[1].parsed.actions.map((action) => action.studentUid)).toEqual([
      "track-yuuka",
      "swimsuit-hoshino",
      "himari",
    ]);
    expect(draft.steps[1].parsed.note).toBe("체마리 바로 뒤");
    expect(draft.steps[2].parsed.actions.map((action) => action.studentUid)).toEqual([
      "band-shimiko",
      "band-kazusa",
      "christmas-rina",
      "kotama",
    ]);
  });

  it("keeps common auto modifiers, numbered EX actions, and trailing instructions", () => {
    const draft = parseTimelineImport(
      "오토 수시노\n2분18초 9코 = 드히나(모드ON) 키사키 드히나1 드히나2\n2분43초 3코 = 마리나 AUTO 켜서 발동",
      students,
    );

    expect(draft.steps[0].parsed.actions[0]).toMatchObject({
      studentUid: "swimsuit-hoshino",
      text: "오토",
    });
    expect(draft.steps[1].parsed.marker).toEqual({ kind: "time_remaining", value: "2:18 · 9코" });
    expect(draft.steps[1].parsed.actions.map((action) => [action.studentUid, action.text])).toEqual([
      ["dress-hina", undefined],
      ["kisaki", undefined],
      ["dress-hina", "1"],
      ["dress-hina", "2"],
    ]);
    expect(draft.steps[1].parsed.note).toBe("모드ON");
    expect(draft.steps[2].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "2:43 · 3코" },
      actions: [{ studentUid: "marina" }],
      note: "AUTO 켜서 발동",
    });
    expect(draft.issues).toHaveLength(0);
  });

  it("accepts spaced hyphen chains and horizontal phase separators", () => {
    const draft = parseTimelineImport(
      "수시노-아루-체마리-체유카 - 아코-히마리\n--------------------------------------",
      students,
    );

    expect(draft.steps[0].parsed.actions.map((action) => action.studentUid)).toEqual([
      "swimsuit-hoshino",
      "aru",
      "track-mari",
      "track-yuuka",
      "ako",
      "himari",
    ]);
    expect(draft.steps[1].parsed).toMatchObject({ kind: "divider", note: "설명글", actions: [] });
  });

  it("parses the supplied community timeline without unresolved student expressions", () => {
    const raw = `3:51.200 돌마리

7.5코 리오(돌마리)
3:31.300 교네루(본체에 VS)
9.9코 C돌마리
10 교네루(빨간색)

10 임마리 → 돌마리 → 리오(돌마리) → c돌마리
9 수이아 → 수칸나
3:02.300 교네루
2:59.000 리오(교네루)
2:57:467 돌마리
즉시 C교네루
2:50.600 임마리
즉시 교네루

【페이즈 전환】
즉시 돌마리
02:31:000 수이아 → 수칸나 → 즉시 교네루
즉시 리오(교네루) → C교네루`;

    const draft = parseTimelineImport(raw, students);

    expect(draft.steps).toHaveLength(17);
    expect(draft.issues).toHaveLength(0);
    expect(draft.steps[4].parsed).toMatchObject({
      marker: { kind: "cost", value: "10코" },
      note: "빨간색",
    });
    expect(draft.steps[5].parsed.actions).toHaveLength(4);
    expect(draft.steps[13].parsed.kind).toBe("divider");
    expect(draft.steps[16].parsed.actions[0]).toMatchObject({
      studentUid: "rio",
      targetStudentUid: "battle-hoshino",
    });
  });

  it("applies a manual nickname mapping only to the current import", () => {
    const draft = parseTimelineImport("돌왓삐\n즉시 돌왓삐", students, [
      { rawName: "돌왓삐", studentUid: "idol-mari" },
    ]);
    expect(draft.steps.every((step) => step.parsed.actions[0].studentUid === "idol-mari")).toBe(true);
    expect(draft.mappings).toEqual([{ rawName: "돌왓삐", studentUid: "idol-mari", scope: "current_import" }]);
  });

  it("retains every non-empty source line", () => {
    const raw = "\n특별히 적혀 있지 않으면 버프는 임리오\n\n03:49.000 c돌마리\n6.5코 드아루";
    const draft = parseTimelineImport(raw, students);
    expect(draft.steps).toHaveLength(3);
    expect(draft.steps.map((step) => step.sourceLine)).toEqual([2, 4, 5]);
  });

  it("parses mixed separators and action-local costs found in community timelines", () => {
    const draft = parseTimelineImport(
      `2코 새후카 6코 캠타마
9코 미카, 수이아, 히마리, 새후카, 미카
4코 수이아 새후카 3코 미카
2코 리오 & 교네루`,
      students,
    );

    expect(draft.issues).toHaveLength(0);
    expect(draft.steps[0].parsed.actions).toEqual([
      { kind: "student_ex", studentUid: "new-year-fuuka" },
      { kind: "student_ex", studentUid: "camp-kotama", text: "6코" },
    ]);
    expect(draft.steps[1].parsed.actions.map((action) => action.studentUid)).toEqual([
      "mika",
      "swimsuit-aiz",
      "himari",
      "new-year-fuuka",
      "mika",
    ]);
    expect(draft.steps[2].parsed.actions).toEqual([
      { kind: "student_ex", studentUid: "swimsuit-aiz" },
      { kind: "student_ex", studentUid: "new-year-fuuka" },
      { kind: "student_ex", studentUid: "mika", text: "3코" },
    ]);
  });

  it("preserves approximate cost and time notations used by community authors", () => {
    const draft = parseTimelineImport(
      `2:13.100쯤. 캠타마EX
약 7.8코 2분 3초 366에 키사키, 세이아(캠타마)
약 57초 200 수이아
10+코 교네루`,
      students,
    );

    expect(draft.issues).toHaveLength(0);
    expect(draft.steps[0].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "2:13.100쯤" },
      actions: [{ studentUid: "camp-kotama", text: "EX" }],
    });
    expect(draft.steps[1].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "2:03.366 · 약 7.8코" },
      actions: [{ studentUid: "kisaki" }, { studentUid: "seia", targetStudentUid: "camp-kotama" }],
    });
    expect(draft.steps[2].parsed.marker).toEqual({ kind: "time_remaining", value: "약 0:57.200" });
    expect(draft.steps[3].parsed.marker).toEqual({ kind: "cost", value: "10+코" });
  });

  it("recognizes community dividers, conditions, copied suffixes, and trailing notes", () => {
    const draft = parseTimelineImport(
      `[1페이즈]
(이동)
-클리어-
난로 꺼지면 캠타마, 세이아(캠타마)
7코 교네루(C) 드아루 - 오른쪽 기둥
9.9코 교네루, 아코, 키사키 / 그로기 캠타마 빠르게`,
      students,
    );

    expect(draft.steps.slice(0, 3).every((step) => step.parsed.kind === "divider")).toBe(true);
    expect(parseTimelineImport("9코쯤 아코", students).steps[0].parsed.marker).toEqual({
      kind: "cost",
      value: "9코쯤",
    });
    expect(draft.steps[3].parsed).toMatchObject({
      marker: { kind: "after", value: "난로 꺼지면" },
      actions: [{ studentUid: "camp-kotama" }, { studentUid: "seia", targetStudentUid: "camp-kotama" }],
    });
    expect(draft.steps[4].parsed).toMatchObject({
      actions: [{ studentUid: "battle-hoshino", copied: true }, { studentUid: "dress-aru" }],
      note: "오른쪽 기둥",
    });
    expect(draft.steps[5].parsed.note).toBe("그로기 캠타마 빠르게");
    expect(draft.issues).toHaveLength(0);
  });

  it("keeps a cost marker while extracting conditional prose and spaced parenthetical notes", () => {
    const draft = parseTimelineImport(
      `10+코 얼음 부서지는거 보고 체리노c, 수이아 / 코스트 오버 정상
미네 (오른쪽 본체+졸1) 아코 히마리 → 4페`,
      students,
    );

    expect(draft.steps[0].parsed).toMatchObject({
      marker: { kind: "cost", value: "10+코" },
      actions: [{ studentUid: "cherino", copied: true }, { studentUid: "swimsuit-aiz" }],
      note: "얼음 부서지는거 보고 · 코스트 오버 정상",
    });
    expect(draft.steps[1].parsed).toMatchObject({
      actions: [{ studentUid: "mine" }, { studentUid: "ako" }, { studentUid: "himari" }],
      note: "4페 · 오른쪽 본체+졸1",
    });
    expect(draft.issues).toHaveLength(0);
  });
});

describe("extractCertainTimelineImport", () => {
  it("extracts only certain markers and exact student anchors from free-form text", () => {
    const raw = `1코     아마리 -- 리오(아마리)
3:34.3  아마리(복) -- 임리오(보라등불)
3:27.0  수시노 -- 3:20.8 아마리 -- 리오(아마리)
9.x코   1스 보고 아마리
※ 마지막 리오 쓰기 전 페이즈 넘어가는 경우 넘어가서 발사`;
    const draft = extractCertainTimelineImport(raw, students);

    expect(draft.issues).toEqual([]);
    expect(draft.steps).toHaveLength(5);
    expect(draft.steps[0].parsed.sourceText).toBe("1코 아마리 -- 리오(아마리)");
    expect(draft.steps[0].parsed).toMatchObject({
      marker: { kind: "cost", value: "1코" },
      actions: [{ studentUid: "amari" }, { studentUid: "rio", targetStudentUid: "amari" }],
    });
    expect(draft.steps[1].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "3:34.3" },
      actions: [{ studentUid: "amari", text: "복제 스킬" }, { studentUid: "idol-rio" }],
      note: "보라등불",
    });
    expect(draft.steps[2].parsed).toMatchObject({
      marker: { kind: "time_remaining", value: "3:27.0" },
      actions: [
        { studentUid: "swimsuit-hoshino" },
        { studentUid: "amari", text: "3:20.8" },
        { studentUid: "rio", targetStudentUid: "amari" },
      ],
    });
    expect(draft.steps[3].parsed).toMatchObject({
      marker: { kind: "cost", value: "9.x코" },
      actions: [{ studentUid: "amari", text: "1스 보고" }],
    });
    expect(draft.steps[4].parsed.actions).toEqual([
      { kind: "free_text", text: "※ 마지막 리오 쓰기 전 페이즈 넘어가는 경우 넘어가서 발사" },
    ]);
  });

  it("does not match a student name inside ordinary Korean prose", () => {
    const draft = extractCertainTimelineImport("마지막 공격 확인", students);
    expect(draft.steps[0].parsed.actions).toEqual([{ kind: "free_text", text: "마지막 공격 확인" }]);
  });

  it("prepends copied skill information to an existing action detail", () => {
    const draft = extractCertainTimelineImport("3:34.3 3:30.0 아마리(복)", students);
    expect(draft.steps[0].parsed.actions[0]).toMatchObject({
      studentUid: "amari",
      text: "복제 스킬 / 3:30.0",
    });
    expect(draft.steps[0].parsed.actions[0]).not.toHaveProperty("copied");
  });
});
