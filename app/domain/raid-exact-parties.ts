export const EXACT_PARTY_SEARCH_PARAM = "exactParty";

export function compactExactParties(parties: (string | null | undefined)[][]): string[][] {
  return parties
    .map((party) => party.filter((studentUid): studentUid is string => Boolean(studentUid)))
    .filter((party) => party.length > 0);
}

export function parseExactParties(searchParams: URLSearchParams): string[][] {
  return compactExactParties(
    searchParams
      .getAll(EXACT_PARTY_SEARCH_PARAM)
      .map((party) => party.split(",").map((studentUid) => studentUid.trim())),
  );
}

export function buildExactPartiesPath(path: string, exactParties: string[][]): string {
  const [pathname, search = ""] = path.split("?", 2);
  const searchParams = new URLSearchParams(search);
  searchParams.delete(EXACT_PARTY_SEARCH_PARAM);

  for (const party of compactExactParties(exactParties)) {
    searchParams.append(EXACT_PARTY_SEARCH_PARAM, party.join(","));
  }

  const nextSearch = searchParams.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}
