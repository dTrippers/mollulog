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
