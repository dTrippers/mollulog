import { FlagIcon, PlayIcon } from "@heroicons/react/24/solid";
import { useId } from "react";
import type { RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzlePathStep, RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
import { roadPuzzleLocale } from "~/locales/ko";

const HEX_RADIUS = 10;
const SQRT_3 = Math.sqrt(3);
const DIRECTIONS = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
] as const;

type Point = { x: number; y: number };
type RailKind = NonNullable<RoadPuzzlePathStep["railKind"]>;

function key({ x, y, z }: { x: number; y: number; z: number }) {
  return `${x},${y},${z}`;
}

function project({ x, z }: { x: number; z: number }): Point {
  return {
    x: SQRT_3 * HEX_RADIUS * (x + z / 2),
    y: 1.5 * HEX_RADIUS * z,
  };
}

function centerFor(tile: { x: number; z: number }): Point {
  return project(tile);
}

function edgeMidpoint(center: Point, edge: number): Point {
  const direction = project(DIRECTIONS[edge]!);
  return { x: center.x + direction.x / 2, y: center.y + direction.y / 2 };
}

function polygonPoints(center: Point): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return `${(center.x + HEX_RADIUS * Math.cos(angle)).toFixed(2)},${(center.y + HEX_RADIUS * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

function railPath(center: Point, entry: number, exit: number): string {
  const start = edgeMidpoint(center, entry);
  const end = edgeMidpoint(center, exit);
  const turn = (((exit - entry) % 6) + 6) % 6;
  if (turn === 3) return `M${start.x.toFixed(2)} ${start.y.toFixed(2)}L${end.x.toFixed(2)} ${end.y.toFixed(2)}`;

  const startDirection = {
    x: (start.x - center.x) / (HEX_RADIUS * 0.866),
    y: (start.y - center.y) / (HEX_RADIUS * 0.866),
  };
  const endDirection = { x: (end.x - center.x) / (HEX_RADIUS * 0.866), y: (end.y - center.y) / (HEX_RADIUS * 0.866) };
  const curveSize = turn === 1 || turn === 5 ? 0.32 : 0.22;
  const control = {
    x: center.x + (startDirection.x + endDirection.x) * HEX_RADIUS * curveSize,
    y: center.y + (startDirection.y + endDirection.y) * HEX_RADIUS * curveSize,
  };
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)}Q${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function getRailKind(entry: number, exit: number): RailKind {
  const turn = (((exit - entry) % 6) + 6) % 6;
  return turn === 3 ? "straight" : turn === 2 || turn === 4 ? "longCurve" : "shortCurve";
}

function getRailLabel(step: RoadPuzzlePathStep): string {
  if (step.tile === "start") return roadPuzzleLocale.start;
  if (step.tile === "end") return roadPuzzleLocale.end;
  if (step.tile === "transit") return roadPuzzleLocale.transit;
  return step.railKind ? roadPuzzleLocale.railTypes[step.railKind] : "";
}

type RoadPuzzleMapSvgProps = {
  map: RoadPuzzleMap;
  solution: RoadPuzzleSolution | null;
  round: number;
  mapNumber: number;
  highlightedRailKind: RailKind | null;
};

export function RoadPuzzleMapSvg({ map, solution, round, mapNumber, highlightedRailKind }: RoadPuzzleMapSvgProps) {
  const titleId = useId();
  const playableTiles = map.tiles.filter(({ type }) => type !== 4);
  const centers = new Map(playableTiles.map((tile) => [key(tile), centerFor(tile)]));
  const xValues = [...centers.values()].map(({ x }) => x);
  const yValues = [...centers.values()].map(({ y }) => y);
  const padding = HEX_RADIUS * 1.08;
  const minX = Math.min(...xValues) - padding;
  const minY = Math.min(...yValues) - padding;
  const width = Math.max(...xValues) - Math.min(...xValues) + padding * 2;
  const height = Math.max(...yValues) - Math.min(...yValues) + padding * 2;
  const witnessByCoordinate = new Map(
    (solution?.witness ?? []).filter(({ tile }) => tile === "empty").map((step) => [key(step), step]),
  );
  const fixedRailByCoordinate = new Map(map.fixedRails.map((rail) => [key(rail), rail]));

  return (
    <>
      <svg
        aria-labelledby={titleId}
        className="block h-auto w-full"
        role="img"
        viewBox={`${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`}
      >
        <title id={titleId}>
          {solution
            ? roadPuzzleLocale.resultTitle(round, mapNumber, solution.minimumVector)
            : roadPuzzleLocale.mapTitle(round, mapNumber)}
        </title>
        <g>
          {playableTiles.map((tile) => {
            const center = centers.get(key(tile))!;
            const routeStep = witnessByCoordinate.get(key(tile));
            const fill =
              tile.type === 1 || tile.type === 2
                ? "var(--foreground)"
                : tile.type === 3
                  ? "color-mix(in oklab, var(--foreground) 22%, var(--card))"
                  : routeStep
                    ? highlightedRailKind === null
                      ? "color-mix(in oklab, var(--primary) 15%, var(--card))"
                      : highlightedRailKind === routeStep.railKind
                        ? "color-mix(in oklab, var(--primary) 30%, var(--card))"
                        : "color-mix(in oklab, var(--primary) 6%, var(--card))"
                    : "var(--muted)";
            return (
              <polygon
                key={`tile:${key(tile)}`}
                points={polygonPoints(center)}
                fill={fill}
                stroke="var(--border)"
                strokeWidth="0.8"
              />
            );
          })}
        </g>
        <g fill="none" stroke="var(--foreground)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
          {map.fixedRails
            .filter(({ x, y, z }) => map.tiles.find((tile) => tile.x === x && tile.y === y && tile.z === z)?.type === 3)
            .map((rail) => {
              const center = centers.get(key(rail));
              if (!center) return null;
              return <path key={`fixed:${key(rail)}`} d={railPath(center, rail.entranceIndex, rail.exitIndex)} />;
            })}
        </g>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4">
          {(solution?.witness ?? []).map((step) => {
            if (step.tile !== "empty" || step.entryIndex === undefined || step.exitIndex === undefined) return null;
            const kind = step.railKind ?? getRailKind(step.entryIndex, step.exitIndex);
            const muted = highlightedRailKind !== null && highlightedRailKind !== kind;
            return (
              <path
                key={`route:${key(step)}`}
                d={railPath(centerFor(step), step.entryIndex, step.exitIndex)}
                className={muted ? "text-muted-foreground" : "text-primary"}
                stroke="currentColor"
                opacity={muted ? 0.25 : 1}
              />
            );
          })}
        </g>
        <g>
          {map.tiles
            .filter(({ type }) => type === 1 || type === 2 || type === 3)
            .map((tile) => {
              const center = centers.get(key(tile));
              if (!center) return null;
              if (tile.type === 3) {
                return (
                  <circle
                    key={`station:${key(tile)}`}
                    cx={center.x}
                    cy={center.y}
                    r="3.3"
                    fill="var(--card)"
                    stroke="var(--foreground)"
                    strokeWidth="1.7"
                  />
                );
              }
              const Icon = tile.type === 1 ? PlayIcon : FlagIcon;
              return (
                <g
                  key={`station:${key(tile)}`}
                  transform={`translate(${(center.x - 3.5).toFixed(2)} ${(center.y - 3.5).toFixed(2)})`}
                >
                  <Icon
                    x={0}
                    y={0}
                    width={7}
                    height={7}
                    className="size-[7px]"
                    style={{ color: "var(--card)" }}
                    aria-hidden="true"
                  />
                </g>
              );
            })}
        </g>
      </svg>
      <ol className="sr-only">
        {(solution?.witness ?? []).map((step, index) => (
          <li key={key(step)}>{roadPuzzleLocale.witnessStep(index, getRailLabel(step))}</li>
        ))}
      </ol>
    </>
  );
}
