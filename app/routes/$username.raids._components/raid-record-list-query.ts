import {
  isRaidRecordRaidType,
  isRaidRecordServer,
  type RaidRecordRaidType,
  type RaidRecordServer,
} from "~/domain/raid-record";

// ?server=kr|jp&type=total_assault|elimination for the screens that work on one raid type (the table and the form).
// Without a type they start on 총력전.
export function parseRaidRecordListQuery(searchParams: URLSearchParams): {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
} {
  const { server, raidType } = parseRaidRecordListScope(searchParams);
  return { server, raidType: raidType ?? "total_assault" };
}

// The list reads the same query, but without a type it shows both raid types together (raidType null).
export function parseRaidRecordListScope(searchParams: URLSearchParams): {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType | null;
} {
  const server = searchParams.get("server");
  const raidType = searchParams.get("type");
  return {
    server: isRaidRecordServer(server) ? server : "kr",
    raidType: isRaidRecordRaidType(raidType) ? raidType : null,
  };
}

// Screens reached from the list go back to its default view of the record's server, both raid types together.
export function raidRecordListTo(username: string, server: RaidRecordServer): string {
  return `/@${username}/raids?server=${server}`;
}
