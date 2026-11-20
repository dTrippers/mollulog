import {
  isRaidRecordRaidType,
  isRaidRecordServer,
  type RaidRecordRaidType,
  type RaidRecordServer,
} from "~/domain/raid-record";

// ?server=kr|jp&type=total_assault|elimination, shared by the list and the screens it links to.
export function parseRaidRecordListQuery(searchParams: URLSearchParams): {
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
} {
  const server = searchParams.get("server");
  const raidType = searchParams.get("type");
  return {
    server: isRaidRecordServer(server) ? server : "kr",
    raidType: isRaidRecordRaidType(raidType) ? raidType : "total_assault",
  };
}
