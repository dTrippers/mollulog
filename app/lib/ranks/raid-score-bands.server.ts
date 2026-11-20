import protobuf from "protobufjs";
import type { RaidRecordDefenseType, RaidRecordRaidType, RaidScoreBand, RaidScoreBands } from "~/domain/raid-record";
import { fetchProtobufBytes, RANK_API_BASE_URL } from "./base";

// The Workers runtime forbids the code generation protobufjs uses for a parsed schema, so the server reads the two
// fields it needs from ClearTimeDistributionResponse by hand: bands (2) and time_budget_sec (5).
function readBand(reader: protobuf.Reader, end: number): RaidScoreBand {
  const band: RaidScoreBand = { difficulty: "", scorePerSecond: 0, floorScore: 0 };
  while (reader.pos < end) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    if (field === 1) band.difficulty = reader.string();
    else if (field === 2) band.scorePerSecond = Number(reader.int64().toString());
    else if (field === 3) band.floorScore = Number(reader.int64().toString());
    else reader.skipType(tag & 7);
  }
  return band;
}

export function decodeRaidScoreBands(data: ArrayBuffer): RaidScoreBands {
  const bands: RaidScoreBand[] = [];
  let timeBudgetSec = 0;
  const reader = protobuf.Reader.create(new Uint8Array(data));
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    if (field === 2) bands.push(readBand(reader, reader.uint32() + reader.pos));
    else if (field === 5) timeBudgetSec = reader.int32();
    else reader.skipType(tag & 7);
  }
  return { bands, timeBudgetSec };
}

// The server side of fetchRaidScoreBands: the same request and the same result.
export async function fetchRaidScoreBandsOnServer(
  raidType: RaidRecordRaidType,
  rankSeasonIndex: number | null,
  defenseType: RaidRecordDefenseType,
): Promise<RaidScoreBands | null> {
  if (rankSeasonIndex === null) return null;
  const queryParams = new URLSearchParams({
    raidType,
    season: rankSeasonIndex.toString(),
    defenseType,
  });
  const data = await fetchProtobufBytes({
    url: `${RANK_API_BASE_URL}/v1/clear-time-distribution?${queryParams.toString()}`,
  });
  const decoded = decodeRaidScoreBands(data);
  if (decoded.bands.length === 0 || decoded.timeBudgetSec <= 0) return null;
  return decoded;
}
