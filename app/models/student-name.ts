// Name helpers kept apart from the student data queries so browser code can use them without the GraphQL documents.
export function parseVisibleNames(name: string): string[] {
  const visibleNames = [];
  if (name === "하츠네 미쿠") {
    visibleNames.push("미쿠");
  } else if (name === "미사카 미코토") {
    visibleNames.push("미사카");
  } else if (name === "쇼쿠호 미사키") {
    visibleNames.push("쇼쿠호");
  } else if (name === "사텐 루이코") {
    visibleNames.push("사텐");
  } else if (name === "시로코*테러") {
    visibleNames.push("시로코", "테러");
  } else if (name?.includes("(")) {
    const splits = name.split("(");
    visibleNames.push(splits[0], splits[1].replace(")", ""));
  } else if (name) {
    visibleNames.push(name);
  }
  return visibleNames;
}

export function formatVisibleName(name: string): string {
  const visibleNames = parseVisibleNames(name);
  if (visibleNames.length === 2) {
    return `${visibleNames[0]}(${visibleNames[1]})`;
  }
  return visibleNames.join(" ");
}

export function formatStudentFullName({
  uid,
  name,
  familyName,
}: {
  uid?: string | null;
  name: string;
  familyName?: string | null;
}): string {
  const trimmedFamilyName = familyName?.trim();
  if (!trimmedFamilyName) {
    return name;
  }
  if (uid === "10100" || name === "시로코*테러") {
    return name;
  }
  if (name.startsWith(`${trimmedFamilyName} `)) {
    return name;
  }
  return `${trimmedFamilyName} ${name}`;
}
