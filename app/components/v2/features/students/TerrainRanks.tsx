import type { StudentTerrainAdaptationRank } from "~/graphql/graphql";
import { terrainAdaptationIconUrl } from "~/models/assets";

export function TerrainRanks({
  terrainAdaptations,
}: {
  terrainAdaptations: { street: StudentTerrainAdaptationRank; outdoor: StudentTerrainAdaptationRank; indoor: StudentTerrainAdaptationRank };
}) {
  const ranks = [
    ["시가지", terrainAdaptations.street],
    ["야외", terrainAdaptations.outdoor],
    ["실내", terrainAdaptations.indoor],
  ] as const;

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-v2-fg-secondary">
      {ranks.map(([terrain, rank]) => (
        <span key={terrain} className="inline-flex items-center gap-1 whitespace-nowrap">
          {terrain}
          <img src={terrainAdaptationIconUrl(rank)} alt={`적성 ${rank}`} className="size-4 object-contain" />
        </span>
      ))}
    </p>
  );
}
