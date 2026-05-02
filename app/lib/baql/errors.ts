function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pathEquals(path: unknown, expected: string[]) {
  return Array.isArray(path)
    && path.length === expected.length
    && path.every((value, index) => value === expected[index]);
}

export function isStudentNotFoundError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  const graphQLErrors = error.graphQLErrors;
  if (Array.isArray(graphQLErrors) && graphQLErrors.some((graphQLError) => isRecord(graphQLError) && pathEquals(graphQLError.path, ["student"]))) {
    return true;
  }

  const message = typeof error.message === "string" ? error.message : "";
  return message.includes("Cannot return null for non-nullable field Query.student");
}
