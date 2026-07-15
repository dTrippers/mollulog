import { nanoid } from "nanoid/non-secure";
import type { TimelineAction, TimelineMarker, TimelineStep } from "~/domain/walkthrough-timeline";

export type ImportStudent = {
  uid: string;
  name: string;
  familyName?: string | null;
  altNames?: string[];
  initialTier?: number;
  role?: "striker" | "special";
};

export type ImportToken = {
  raw: string;
  status: "confirmed" | "suggested" | "unresolved";
  studentUid?: string;
  candidates?: string[];
};

export type ImportDraftStep = {
  sourceLine: number;
  raw: string;
  parsed: TimelineStep;
  tokens: ImportToken[];
};

export type ImportIssue = {
  sourceLine: number;
  raw: string;
  reason: "ambiguous_student" | "unresolved_student";
};

export type ImportDraft = {
  source: { kind: "text"; raw: string };
  steps: ImportDraftStep[];
  mappings: Array<{ rawName: string; studentUid: string; scope: "current_import" }>;
  issues: ImportIssue[];
};

type StudentIndex = {
  canonical: Map<string, string[]>;
  aliases: Map<string, string[]>;
};

function normalizeName(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\s·ㆍ._-]/g, "")
    .toLocaleLowerCase("ko-KR");
}

function buildStudentIndex(students: ImportStudent[]): StudentIndex {
  const index: StudentIndex = { canonical: new Map(), aliases: new Map() };
  for (const student of students) {
    addStudentName(index.canonical, student.name, student.uid);
    const aliases = [student.familyName, ...(student.altNames ?? [])].filter(
      (name): name is string => typeof name === "string" && name.trim().length > 0,
    );
    for (const alias of aliases) addStudentName(index.aliases, alias, student.uid);
  }
  return index;
}

function addStudentName(index: Map<string, string[]>, name: string, studentUid: string) {
  const key = normalizeName(name);
  const current = index.get(key) ?? [];
  if (!current.includes(studentUid)) index.set(key, [...current, studentUid]);
}

function findStudentCandidates(index: StudentIndex, rawName: string): string[] {
  const key = normalizeName(rawName);
  const canonical = index.canonical.get(key) ?? [];
  return canonical.length > 0 ? canonical : (index.aliases.get(key) ?? []);
}

export function normalizeTimelineImportText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u3000\t]+/g, " ")
    .replace(/(?:->|＞|→)/g, "→")
    .replace(/^(\s*\d{1,2})\.(\d{2})\.(\d{3})(?=\s)/gm, "$1:$2.$3")
    .replace(/(\d{1,2}:\d{2}):(\d{3})(?!\d)/g, "$1.$2")
    .replace(/[ \t]+/g, " ");
}

function extractMarker(line: string): { marker: TimelineMarker; body: string } {
  const costThenTime = line.match(
    /^(약\s*)?(\d+(?:\.\d+)?)(\+)?\s*코(쯤|~~)?\s+(\d{1,2})분\s*(\d{1,2})초(?:[.:\s](\d{3}))?\s*(?:에|쯤)?\s*/,
  );
  if (costThenTime) {
    return {
      marker: {
        kind: "time_remaining",
        value: `${costThenTime[5]}:${costThenTime[6].padStart(2, "0")}${costThenTime[7] ? `.${costThenTime[7]}` : ""} · ${costThenTime[1] ? "약 " : ""}${costThenTime[2]}${costThenTime[3] ?? ""}코${costThenTime[4] ?? ""}`,
      },
      body: line.slice(costThenTime[0].length).trim(),
    };
  }

  const time = line.match(/^(약\s*)?(\d{1,2})(?::|분\s*)(\d{1,2})(?:초)?(?:[.:\s](\d{3}))?\s*(쯤[.]?)?\s*(?:=\s*)?/);
  if (time) {
    const timeValue = `${time[1] ? "약 " : ""}${time[2]}:${time[3].padStart(2, "0")}${time[4] ? `.${time[4]}` : ""}${time[5] ? "쯤" : ""}`;
    let body = line.slice(time[0].length).trim();
    const followingCost = body.match(/^(약\s*)?(\d+(?:\.\d+)?)(\+)?\s*코(쯤|~~)?\s*(?:=\s*)?/);
    if (followingCost) {
      body = body.slice(followingCost[0].length).trim();
      return {
        marker: {
          kind: "time_remaining",
          value: `${timeValue} · ${followingCost[1] ? "약 " : ""}${followingCost[2]}${followingCost[3] ?? ""}코${followingCost[4] ?? ""}`,
        },
        body,
      };
    }
    return { marker: { kind: "time_remaining", value: timeValue }, body };
  }

  const seconds = line.match(/^(약\s*)?(\d{1,2})초(?:[.:\s](\d{3}))?\s*(쯤[.]?)?\s*/);
  if (seconds) {
    return {
      marker: {
        kind: "time_remaining",
        value: `${seconds[1] ? "약 " : ""}0:${seconds[2].padStart(2, "0")}${seconds[3] ? `.${seconds[3]}` : ""}${seconds[4] ? "쯤" : ""}`,
      },
      body: line.slice(seconds[0].length).trim(),
    };
  }

  const cost = line.match(/^(약\s*)?(\d+(?:\.\d+)?)(\+)?\s*코(쯤|~~)?\s*(?:=\s*)?/);
  if (cost)
    return {
      marker: {
        kind: "cost",
        value: `${cost[1] ? "약 " : ""}${cost[2]}${cost[3] ?? ""}코${cost[4] ?? ""}`,
      },
      body: line.slice(cost[0].length).trim(),
    };

  const bareCost = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (bareCost) return { marker: { kind: "cost", value: `${bareCost[1]}코` }, body: bareCost[2].trim() };

  const immediate = line.match(/^(즉시|최속)\s*/);
  if (immediate)
    return { marker: { kind: "immediate", value: immediate[1] }, body: line.slice(immediate[0].length).trim() };

  const namedSkillAfter = line.match(/^(.+?\s+1스\s*(?:후|직후))\s+(.+)$/);
  if (namedSkillAfter) {
    return { marker: { kind: "after", value: namedSkillAfter[1] }, body: namedSkillAfter[2].trim() };
  }

  const after = line.match(
    /^((?:평타|\d+스|복제 완료|코감 적용|스킬 사용 가능(?:해지는)?)[^ ]*\s*(?:후|직후|즉시))\s*/,
  );
  if (after) return { marker: { kind: "after", value: after[1] }, body: line.slice(after[0].length).trim() };

  return { marker: { kind: "manual" }, body: line };
}

function isCostToken(value: string) {
  return /^(?:약)?\d+(?:\.\d+)?(?:\+)?코(?:쯤|~~)?$/.test(value.replace(/\s/g, ""));
}

function splitSpaceActionTokens(part: string, index: StudentIndex, mappings: Map<string, string>) {
  if (/\s또는\s/.test(part)) return [part];
  const words = part.replace(/\s+\(/g, "(").match(/[^\s()]+(?:\([^)]*\))?/g) ?? [part];
  if (words.length < 2) return [part];

  const result: string[] = [];
  let prefix: string[] = [];
  for (const word of words) {
    if (isCostToken(word)) {
      prefix.push(word);
      continue;
    }
    const parsed = parseActionToken(word, index, mappings);
    if (parsed.token.status === "confirmed") {
      result.push([...prefix, word].join(" "));
      prefix = [];
      continue;
    }
    if (result.length > 0 && prefix.length === 0) result[result.length - 1] += ` ${word}`;
    else prefix.push(word);
  }
  if (prefix.length > 0) {
    if (result.length > 0) result[result.length - 1] += ` ${prefix.join(" ")}`;
    else return [part];
  }
  return result.length > 0 ? result : [part];
}

function splitActionTokens(body: string, index: StudentIndex, mappings: Map<string, string>) {
  const explicit = body
    .split(/\s*(?:→|\/\/|,|&|-\s*(?=[가-힣A-Za-z]))\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return explicit.flatMap((part) => splitSpaceActionTokens(part, index, mappings));
}

function shouldRequestStudentMapping(raw: string) {
  if (!raw.trim()) return false;
  return !/(?:후|직후|쏘고|쏜|파괴|기다|보고|맞고|발동|전환|진입|종료|마무리|리트|오토|auto|on|off|\s중\s)/i.test(raw);
}

function parseActionToken(rawToken: string, index: StudentIndex, mappings: Map<string, string>) {
  let token = rawToken.trim();
  let copied = false;
  let kind: TimelineAction["kind"] = "student_ex";
  let actionDetail = "";
  const timingPrefix = token.match(/^(즉시|최속|바로|오토|AUTO)\s*/i);
  if (timingPrefix) {
    actionDetail = timingPrefix[1];
    token = token.slice(timingPrefix[0].length).trim();
  }
  const embeddedCost = token.match(/^(약\s*)?(\d+(?:\.\d+)?)(\+)?\s*코(쯤|~~)?\s*/);
  if (embeddedCost) {
    actionDetail = [
      actionDetail,
      `${embeddedCost[1] ? "약 " : ""}${embeddedCost[2]}${embeddedCost[3] ?? ""}코${embeddedCost[4] ?? ""}`,
    ]
      .filter(Boolean)
      .join(" · ");
    token = token.slice(embeddedCost[0].length).trim();
  }
  if (/^[cC](?=[가-힣A-Za-z0-9])/.test(token)) {
    copied = true;
    token = token.slice(1).trim();
  }
  if (/\s*1스(?:킬)?\s*$/.test(token)) {
    kind = "normal_skill";
    token = token.replace(/\s*1스(?:킬)?\s*$/, "").trim();
  }

  const notes = [...token.matchAll(/\(([^)]+)\)/g)]
    .flatMap((match) => match[1].split(/[,/]/))
    .map((note) => note.trim())
    .filter(Boolean);
  if (notes.some((note) => /^(?:c|복사|copied)$/i.test(note))) copied = true;
  let rawName = token.replace(/\([^)]+\)/g, "").trim();
  let mappedUid = mappings.get(normalizeName(rawName));
  let candidates = mappedUid ? [mappedUid] : findStudentCandidates(index, rawName);

  if (candidates.length === 0) {
    const numberedSkill = rawName.match(/^(.+?)([1-3])$/);
    if (numberedSkill) {
      const numberedCandidates = findStudentCandidates(index, numberedSkill[1]);
      if (numberedCandidates.length > 0) {
        rawName = numberedSkill[1];
        candidates = numberedCandidates;
        actionDetail = [actionDetail, numberedSkill[2]].filter(Boolean).join(" · ");
      }
    }
  }

  if (candidates.length === 0) {
    const copiedSuffix = rawName.match(/^(.+?)[cC]$/);
    if (copiedSuffix) {
      const copiedCandidates = findStudentCandidates(index, copiedSuffix[1]);
      if (copiedCandidates.length > 0) {
        rawName = copiedSuffix[1];
        candidates = copiedCandidates;
        copied = true;
      }
    }
  }

  if (candidates.length === 0) {
    const skillSuffix = rawName.match(/^(.+?)(EX|VS)$/i);
    if (skillSuffix) {
      const suffixCandidates = findStudentCandidates(index, skillSuffix[1]);
      if (suffixCandidates.length > 0) {
        rawName = skillSuffix[1];
        candidates = suffixCandidates;
        actionDetail = [actionDetail, skillSuffix[2].toUpperCase()].filter(Boolean).join(" · ");
      }
    }
  }

  let trailingNote = "";
  if (candidates.length === 0 && rawName.includes(" ")) {
    const [leadingName, ...rest] = rawName.split(/\s+/);
    mappedUid = mappings.get(normalizeName(leadingName));
    const leadingCandidates = mappedUid ? [mappedUid] : findStudentCandidates(index, leadingName);
    if (leadingCandidates.length > 0) {
      rawName = leadingName;
      candidates = leadingCandidates;
      trailingNote = rest.join(" ");
    }
  }
  const targetCandidates = [...new Set(notes.flatMap((note) => findStudentCandidates(index, note)))];
  const targetStudentUid = targetCandidates.length === 1 ? targetCandidates[0] : undefined;
  const detailNotes = notes.filter((note) => {
    if (/^(?:c|복사|copied)$/i.test(note)) return false;
    return !targetStudentUid || !findStudentCandidates(index, note).includes(targetStudentUid);
  });
  if (trailingNote) detailNotes.push(trailingNote);
  const status: ImportToken["status"] =
    candidates.length === 1 ? "confirmed" : candidates.length > 1 ? "suggested" : "unresolved";
  const importToken: ImportToken = {
    raw: rawName || rawToken,
    status,
    ...(candidates.length === 1 ? { studentUid: candidates[0] } : {}),
    ...(candidates.length > 0 ? { candidates } : {}),
  };
  const action: TimelineAction =
    candidates.length === 1
      ? {
          kind,
          studentUid: candidates[0],
          ...(targetStudentUid && targetStudentUid !== candidates[0] ? { targetStudentUid } : {}),
          ...(copied ? { copied: true } : {}),
          ...(actionDetail ? { text: actionDetail } : {}),
        }
      : { kind: "free_text", text: rawToken.trim() };

  return { action, token: importToken, notes: detailNotes };
}

export function parseTimelineImport(
  raw: string,
  students: ImportStudent[],
  mappings: Array<{ rawName: string; studentUid: string }> = [],
): ImportDraft {
  const normalized = normalizeTimelineImportText(raw);
  const studentIndex = buildStudentIndex(students);
  const mappingIndex = new Map(mappings.map(({ rawName, studentUid }) => [normalizeName(rawName), studentUid]));
  const steps: ImportDraftStep[] = [];
  const issues: ImportIssue[] = [];

  for (const [lineIndex, rawLine] of normalized.split("\n").entries()) {
    let line = rawLine.trim();
    if (!line) continue;
    const divider =
      line.match(/^[【[]\s*(.+?)\s*[】\]]$/) ??
      line.match(/^[~～]+\s*(.+?)\s*[~～]+$/) ??
      line.match(/^\(\s*(.+?)\s*\)$/) ??
      (/^-{3,}$/.test(line) ? [line, "구분선"] : null) ??
      line.match(/^-\s*(.+?)\s*-$/);
    if (divider) {
      steps.push({
        sourceLine: lineIndex + 1,
        raw: rawLine,
        parsed: {
          uid: nanoid(8),
          order: steps.length,
          kind: "divider",
          actions: [],
          note: divider[1].trim(),
        },
        tokens: [],
      });
      continue;
    }
    let sourceNote: string | undefined;
    const trailingSeparator = line.match(/^(.*)\s+(?:\/|-|→)\s+(.+)$/);
    if (trailingSeparator) {
      const rightSideActions = splitActionTokens(trailingSeparator[2], studentIndex, mappingIndex);
      const rightSideHasStudent = rightSideActions.some(
        (token) => parseActionToken(token, studentIndex, mappingIndex).token.status === "confirmed",
      );
      if (!rightSideHasStudent) {
        sourceNote = trailingSeparator[2].trim();
        line = trailingSeparator[1].trim();
      }
    }
    let { marker, body } = extractMarker(line);
    const conditional = body.match(
      /^(.+?(?:나올\s*때|나오고|내려오면|꺼지면|돌면|닿으면|멈추면|복귀했을\s*때|확인\s*후|후에|보고|마자|즉시))\s+(.+)$/,
    );
    if (conditional && !/[→,&]/.test(conditional[1])) {
      const conditionalActions = splitActionTokens(conditional[2], studentIndex, mappingIndex);
      if (
        conditionalActions.some(
          (token) => parseActionToken(token, studentIndex, mappingIndex).token.status === "confirmed",
        )
      ) {
        if (marker.kind === "manual") {
          marker = { kind: "after", value: conditional[1].trim() };
        } else {
          sourceNote = [conditional[1].trim(), sourceNote].filter(Boolean).join(" · ");
        }
        body = conditional[2].trim();
      }
    }
    const actionTokens = splitActionTokens(body, studentIndex, mappingIndex);
    const actions: TimelineAction[] = [];
    const tokens: ImportToken[] = [];
    const notes: string[] = sourceNote ? [sourceNote] : [];

    for (const rawToken of actionTokens) {
      const parsed = parseActionToken(rawToken, studentIndex, mappingIndex);
      actions.push(parsed.action);
      tokens.push(parsed.token);
      notes.push(...parsed.notes);
      if (parsed.token.status !== "confirmed" && shouldRequestStudentMapping(parsed.token.raw)) {
        issues.push({
          sourceLine: lineIndex + 1,
          raw: parsed.token.raw,
          reason: parsed.token.status === "suggested" ? "ambiguous_student" : "unresolved_student",
        });
      }
    }

    steps.push({
      sourceLine: lineIndex + 1,
      raw: rawLine,
      parsed: {
        uid: nanoid(8),
        order: steps.length,
        kind: "actions",
        marker,
        actions: actions.length > 0 ? actions : [{ kind: "free_text", text: line }],
        ...(notes.length > 0 ? { note: notes.join(" · ") } : {}),
      },
      tokens,
    });
  }

  return {
    source: { kind: "text", raw },
    steps,
    mappings: mappings.map(({ rawName, studentUid }) => ({ rawName, studentUid, scope: "current_import" })),
    issues,
  };
}
