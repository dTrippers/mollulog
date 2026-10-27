import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { HoverTooltip, ResourceCard } from "~/components/primitives";
import type { MinigamePayment, RoadPuzzleMap } from "~/domain/event-shop";
import type { RoadPuzzleSolution, RailCounts } from "~/domain/road-puzzle/solver";
import { roadPuzzleLocale } from "~/locales/ko";

type RailKind = keyof RailCounts;

const RAIL_KINDS: RailKind[] = ["straight", "longCurve", "shortCurve"];
const RAIL_EDGES: Record<RailKind, [number, number]> = {
  straight: [0, 3],
  longCurve: [0, 2],
  shortCurve: [0, 1],
};

function edgePoint(edge: number) {
  const angle = (-60 * edge * Math.PI) / 180;
  return { x: (Math.cos(angle) * 8).toFixed(1), y: (Math.sin(angle) * 8).toFixed(1) };
}

function RailGlyph({ kind }: { kind: RailKind }) {
  const [entry, exit] = RAIL_EDGES[kind];
  const start = edgePoint(entry);
  const end = edgePoint(exit);
  const turn = (((exit - entry) % 6) + 6) % 6;
  const path =
    turn === 3 ? `M ${start.x} ${start.y} L ${end.x} ${end.y}` : `M ${start.x} ${start.y} Q 0 0 ${end.x} ${end.y}`;

  return (
    <svg aria-hidden="true" className="size-6 shrink-0" viewBox="-10 -10 20 20">
      <polygon points="-5,-8 5,-8 10,0 5,8 -5,8 -10,0" fill="var(--muted)" />
      <path
        d={path}
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

type RoadPuzzleRouteSummaryProps = {
  map: RoadPuzzleMap;
  solution: RoadPuzzleSolution | null;
  payment: MinigamePayment;
  isCalculating: boolean;
  selectedRailKind: RailKind | null;
  onSelectRailKind: (kind: RailKind) => void;
};

export function RoadPuzzleRouteSummary({
  map,
  solution,
  payment,
  isCalculating,
  selectedRailKind,
  onSelectRailKind,
}: RoadPuzzleRouteSummaryProps) {
  const counts = solution?.minimumVector;
  const stickerValues = [
    { label: roadPuzzleLocale.minimum, value: solution?.minimumStickers },
    {
      label: roadPuzzleLocale.expected,
      value: solution ? Math.round(solution.expectedStickers) : undefined,
      expected: true,
    },
    { label: roadPuzzleLocale.maximum, value: solution?.maximumStickers },
  ];

  return (
    <div className="rounded-md bg-card p-3">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">레일 종류별 경로 수와 덱 수</caption>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-left font-medium" scope="col">
              <span className="sr-only">레일 종류</span>
            </th>
            <th className="px-2 py-2 text-right font-medium" scope="col">
              {roadPuzzleLocale.routeCount}
            </th>
            <th className="py-2 text-right font-medium" scope="col">
              {roadPuzzleLocale.deckCount}
            </th>
          </tr>
        </thead>
        <tbody>
          {RAIL_KINDS.map((kind) => {
            const selected = selectedRailKind === kind;
            return (
              <tr key={kind} className={selected ? "bg-muted text-foreground" : "text-muted-foreground"}>
                <th className="text-left font-normal" scope="row">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${roadPuzzleLocale.railTypes[kind]} 레일 강조`}
                    className="flex w-full items-center gap-2 rounded-sm px-1 py-2 text-left text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => onSelectRailKind(kind)}
                  >
                    <RailGlyph kind={kind} />
                    <span>{roadPuzzleLocale.railTypes[kind]}</span>
                  </button>
                </th>
                <td className="px-2 py-2 text-right tabular-nums">
                  {isCalculating ? (
                    <ArrowPathIcon
                      className="ml-auto size-4 animate-spin motion-reduce:animate-none"
                      role="img"
                      aria-label={roadPuzzleLocale.computingRoute}
                    />
                  ) : counts ? (
                    counts[kind]
                  ) : (
                    "–"
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{map.deck[kind]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-2">
        <span className="sr-only">{payment.resourceName}</span>
        <ResourceCard
          resourceType={payment.resourceType}
          itemUid={payment.resourceUid}
          imageUrl={payment.imageUrl ?? undefined}
          imageAlt={payment.resourceName}
          name={payment.resourceName}
          size="sm"
        />
        <HoverTooltip content={roadPuzzleLocale.viewerCostHelp} focusable>
          <InformationCircleIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </HoverTooltip>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        {stickerValues.map(({ label, value, expected }) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
              {isCalculating ? (
                <ArrowPathIcon
                  className="mx-auto size-4 animate-spin motion-reduce:animate-none"
                  role="img"
                  aria-label={roadPuzzleLocale.computingRoute}
                />
              ) : value === undefined ? (
                "–"
              ) : (
                `${expected ? "≈" : ""}${value.toLocaleString()}`
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
