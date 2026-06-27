export const PARAM_TO_RAID_TYPE: Record<string, string> = {
  "total-assault": "total_assault",
  "grand-assault": "elimination",
};

export const RAID_TYPE_TO_PARAM: Record<string, string> = {
  total_assault: "total-assault",
  elimination: "grand-assault",
};

/** URL path param (e.g. "total-assault") -> internal raidType (e.g. "total_assault") */
export function raidTypeFromParam(param: string): string {
  return PARAM_TO_RAID_TYPE[param] ?? param;
}

/** Internal raidType (e.g. "elimination") -> URL path param (e.g. "grand-assault") */
export function raidTypeToParam(raidType: string): string {
  return RAID_TYPE_TO_PARAM[raidType] ?? raidType;
}
