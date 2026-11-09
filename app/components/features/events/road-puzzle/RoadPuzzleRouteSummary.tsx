import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { Button } from "~/components/v2/primitives/Button";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import type { MinigamePayment, RoadPuzzleMap } from "~/domain/event-shop";
import type { RailCounts, RoadPuzzleInteractiveAnalysis, RoadPuzzleSolution } from "~/domain/road-puzzle/solver";
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
      <polygon points="-5,-8 5,-8 10,0 5,8 -5,8 -10,0" fill="var(--v2-inset)" />
      <path
        d={path}
        fill="none"
        stroke="var(--v2-accent)"
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
  analysis: RoadPuzzleInteractiveAnalysis | null;
  remaining: RailCounts | null;
  payment: MinigamePayment;
  isCalculating: boolean;
  isStale: boolean;
  isProgress: boolean;
  hasState: boolean;
  selectedRailKind: RailKind | null;
  onRemainingChange: (kind: RailKind, value: number) => void;
  onReset: () => void;
  onSelectRailKind: (kind: RailKind) => void;
};

export function RoadPuzzleRouteSummary({
  map,
  solution,
  analysis,
  remaining,
  payment,
  isCalculating,
  isStale,
  isProgress,
  hasState,
  selectedRailKind,
  onRemainingChange,
  onReset,
  onSelectRailKind,
}: RoadPuzzleRouteSummaryProps) {
  const noRoute = analysis?.status === "no-route";
  const completable = analysis?.status === "completable";
  const required = analysis ? analysis.requiredVector : solution?.minimumVector;
  const drawn = analysis?.drawnVector;
  // The solver counts tiles; each placed tile costs the event's payment quantity.
  const perTile = payment.quantity;
  const minimumTiles = analysis ? analysis.minimumTiles : solution?.minimumTiles;
  const expectedTiles = analysis ? analysis.expectedTiles : solution?.expectedTiles;
  const maximumTiles = analysis ? analysis.maximumTiles : solution?.maximumTiles;
  const minimum = minimumTiles == null ? undefined : minimumTiles * perTile;
  const expected = expectedTiles == null ? undefined : Math.round(expectedTiles * perTile);
  const maximum = maximumTiles == null ? undefined : maximumTiles * perTile;
  const delta = analysis?.delta
    ? {
        minimum: analysis.delta.minimumTiles * perTile,
        expected: Math.round(analysis.delta.expectedTiles * perTile),
      }
    : null;
  const stickerValues = [
    { label: roadPuzzleLocale.minimum, value: noRoute ? undefined : minimum },
    {
      label: roadPuzzleLocale.expected,
      value: noRoute ? undefined : expected,
      expected: true,
    },
    { label: roadPuzzleLocale.maximum, value: noRoute ? undefined : maximum },
  ];
  const resetButton = hasState ? (
    <Button size="sm" onClick={onReset} className="ml-auto">
      {roadPuzzleLocale.reset}
    </Button>
  ) : null;

  return (
    <div className="rounded-md bg-v2-surface p-v2-tile-p">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {isProgress ? roadPuzzleLocale.progressTableCaption : roadPuzzleLocale.planTableCaption}
        </caption>
        <thead>
          <tr className="border-b border-v2-divider text-v2-fg-secondary">
            <th className="whitespace-nowrap py-2 text-left font-medium" scope="col">
              <span className="sr-only">레일 종류</span>
            </th>
            <th className="w-[1%] whitespace-nowrap py-2 pl-1.5 text-right font-medium" scope="col">
              {isProgress ? roadPuzzleLocale.drawnRequired : roadPuzzleLocale.routeCount}
            </th>
            <th className="w-[4.5rem] whitespace-nowrap py-2 pl-1.5 text-right font-medium" scope="col">
              {roadPuzzleLocale.remainingCount}
            </th>
          </tr>
        </thead>
        <tbody>
          {RAIL_KINDS.map((kind) => {
            const selected = selectedRailKind === kind;
            return (
              <tr key={kind} className={selected ? "bg-v2-inset text-v2-fg" : "text-v2-fg-secondary"}>
                <th className="whitespace-nowrap text-left font-normal" scope="row">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${roadPuzzleLocale.railTypes[kind]} 레일 강조`}
                    className="flex w-full items-center gap-1 rounded-sm py-2 text-left text-v2-fg focus-visible:outline-2 focus-visible:outline-v2-focus"
                    onClick={() => onSelectRailKind(kind)}
                  >
                    <RailGlyph kind={kind} />
                    <span className="whitespace-nowrap">{roadPuzzleLocale.railTypes[kind]}</span>
                  </button>
                </th>
                <td
                  className={`w-[1%] whitespace-nowrap py-2 pl-1.5 pr-1.5 text-right tabular-nums ${isStale ? "opacity-50" : ""}`}
                >
                  {isCalculating ? (
                    <ArrowPathIcon
                      className="ml-auto size-4 animate-spin motion-reduce:animate-none"
                      role="img"
                      aria-label={roadPuzzleLocale.computingRoute}
                    />
                  ) : noRoute || !required ? (
                    "–"
                  ) : isProgress && drawn ? (
                    <>
                      <span aria-hidden="true">
                        {drawn[kind]}/{required[kind]}
                      </span>
                      <span className="sr-only">
                        {roadPuzzleLocale.drawnRequiredLabel(required[kind], drawn[kind])}
                      </span>
                    </>
                  ) : (
                    required[kind]
                  )}
                </td>
                <td className="w-[4.5rem] whitespace-nowrap py-2 pl-1.5 text-right tabular-nums">
                  <NumberInput
                    grouped
                    showMin={false}
                    showMax={false}
                    min={0}
                    max={map.deck[kind]}
                    value={remaining?.[kind] ?? map.deck[kind]}
                    aria-label={`${roadPuzzleLocale.railTypes[kind]} ${roadPuzzleLocale.remainingCount}`}
                    className="ml-auto w-16"
                    onValueChange={(value) => onRemainingChange(kind, value)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {completable ? (
        <div className="mt-3 flex min-h-7 items-center gap-1.5">
          <CheckCircleIcon className={`size-5 text-v2-accent ${isStale ? "opacity-50" : ""}`} aria-hidden="true" />
          <span className={`text-sm font-semibold ${isStale ? "opacity-50" : ""}`}>
            {roadPuzzleLocale.canCompleteNow}
          </span>
          {resetButton}
        </div>
      ) : (
        <>
          <div className="mt-3 flex min-h-7 items-center gap-1">
            <span className="sr-only">{payment.resourceName}</span>
            <div className="relative top-0.5 -mr-1 shrink-0">
              <ResourceThumb
                resourceType={payment.resourceType}
                itemUid={payment.resourceUid}
                imageUrl={payment.imageUrl ?? undefined}
                name={payment.resourceName}
                size="sm"
                bare
              />
            </div>
            <span className="text-sm font-medium">
              {isProgress
                ? roadPuzzleLocale.viewerAdditionalRequiredResources
                : roadPuzzleLocale.viewerRequiredResources}
            </span>
            {resetButton}
          </div>
          <dl className={`mt-2 grid grid-cols-3 gap-2 text-center text-xs ${isStale ? "opacity-50" : ""}`}>
            {stickerValues.map(({ label, value, expected }, index) => {
              const deltaValue = index === 0 ? delta?.minimum : index === 1 ? delta?.expected : undefined;
              return (
                <div key={label}>
                  <dt className="text-v2-fg-secondary">{label}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-v2-fg">
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
                    {deltaValue !== undefined && !isCalculating && (
                      <span className="mt-0.5 block font-normal text-v2-fg-secondary">
                        <span aria-hidden="true">
                          {expected ? "≈+" : "+"}
                          {deltaValue.toLocaleString()}
                        </span>
                        <span className="sr-only">{roadPuzzleLocale.shortestDelta(deltaValue, expected ?? false)}</span>
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-2 text-xs text-v2-fg-secondary">
            {isProgress ? roadPuzzleLocale.progressCostHelp : roadPuzzleLocale.viewerCostHelp}
          </p>
        </>
      )}
    </div>
  );
}
