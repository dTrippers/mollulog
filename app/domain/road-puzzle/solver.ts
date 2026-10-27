import type { RoadPuzzleDeck, RoadPuzzleMap, RoadPuzzleCoordinate } from "~/domain/event-shop";

export const ROAD_PUZZLE_STICKERS_PER_TILE = 150;

const EDGE_OFFSETS: readonly RoadPuzzleCoordinate[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 },
];

export type RailCounts = { straight: number; longCurve: number; shortCurve: number };

export type RoadPuzzlePathStep = {
  x: number;
  y: number;
  z: number;
  tile: "start" | "transit" | "empty" | "end";
  railKind?: keyof RailCounts;
  entryIndex?: number;
  exitIndex?: number;
};

export type RoadPuzzleSolution = {
  paretoVectors: RailCounts[];
  minimumVector: RailCounts;
  witness: RoadPuzzlePathStep[];
  minimumTiles: number;
  maximumTiles: number;
  expectedTiles: number;
  minimumStickers: number;
  maximumStickers: number;
  expectedStickers: number;
};

export type RoadPuzzleInteractiveAnalysis = {
  status: "no-route" | "planned" | "completable" | "incomplete";
  witness: RoadPuzzlePathStep[] | null;
  requiredVector: RailCounts | null;
  drawnVector: RailCounts | null;
  minimumStickers: number | null;
  expectedStickers: number | null;
  maximumStickers: number | null;
  delta: { minimumStickers: number; expectedStickers: number } | null;
};

type RouteCandidate = { counts: RailCounts; witness: RoadPuzzlePathStep[] };

export type RoadPuzzleRouteBaseline = {
  mapUid: string;
  routes: readonly RouteCandidate[];
  solution: RoadPuzzleSolution | null;
};

const coordinateKey = ({ x, y, z }: RoadPuzzleCoordinate) => `${x},${y},${z}`;
const vectorKey = ({ straight, longCurve, shortCurve }: RailCounts) => `${straight},${longCurve},${shortCurve}`;
const vectorTotal = ({ straight, longCurve, shortCurve }: RailCounts) => straight + longCurve + shortCurve;
const mod6 = (value: number) => ((value % 6) + 6) % 6;

function railKindForTurn(entryIndex: number, exitIndex: number): keyof RailCounts {
  const turn = mod6(exitIndex - entryIndex);
  if (turn === 3) return "straight";
  if (turn === 2 || turn === 4) return "longCurve";
  if (turn === 1 || turn === 5) return "shortCurve";
  throw new Error("A rail cannot enter and exit through the same edge.");
}

function vectorDominates(left: RailCounts, right: RailCounts): boolean {
  return left.straight <= right.straight && left.longCurve <= right.longCurve && left.shortCurve <= right.shortCurve;
}

function assertNonNegativeDeck(deck: RoadPuzzleDeck): void {
  for (const count of Object.values(deck)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Road puzzle deck is invalid.");
  }
}

function validateMap(map: RoadPuzzleMap) {
  assertNonNegativeDeck(map.deck);
  const tileByCoordinate = new Map<string, RoadPuzzleMap["tiles"][number]>();
  for (const tile of map.tiles) {
    const key = coordinateKey(tile);
    if (tileByCoordinate.has(key)) throw new Error("Road puzzle map has duplicate tile coordinates.");
    if (tile.x + tile.y + tile.z !== 0) throw new Error("Road puzzle map has invalid cube coordinates.");
    tileByCoordinate.set(key, tile);
  }

  const railByCoordinate = new Map<string, RoadPuzzleMap["fixedRails"][number]>();
  for (const rail of map.fixedRails) {
    const key = coordinateKey(rail);
    if (railByCoordinate.has(key) || !tileByCoordinate.has(key)) {
      throw new Error("Road puzzle map has an invalid fixed rail.");
    }
    if (
      !Number.isInteger(rail.entranceIndex) ||
      rail.entranceIndex < 0 ||
      rail.entranceIndex > 5 ||
      !Number.isInteger(rail.exitIndex) ||
      rail.exitIndex < 0 ||
      rail.exitIndex > 5 ||
      rail.entranceIndex === rail.exitIndex
    ) {
      throw new Error("Road puzzle map has invalid fixed rail edges.");
    }
    railByCoordinate.set(key, rail);
  }

  const starts = map.tiles.filter(({ type }) => type === 1);
  const ends = map.tiles.filter(({ type }) => type === 2);
  const transits = map.tiles.filter(({ type }) => type === 3);
  if (starts.length !== 1 || ends.length !== 1 || transits.some((tile) => !railByCoordinate.has(coordinateKey(tile)))) {
    throw new Error("Road puzzle map must have one start, one end, and fixed rails for every transit station.");
  }
  if (!railByCoordinate.has(coordinateKey(starts[0]!)) || !railByCoordinate.has(coordinateKey(ends[0]!))) {
    throw new Error("Road puzzle map is missing a fixed start or end rail.");
  }

  return {
    tileByCoordinate,
    railByCoordinate,
    start: starts[0]!,
    end: ends[0]!,
    transits,
  };
}

function countCombinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  const steps = Math.min(k, n - k);
  for (let index = 1; index <= steps; index += 1) {
    result = (result * (n - steps + index)) / index;
  }
  return Math.round(result);
}

export function calculateExpectedDraws(deck: RoadPuzzleDeck, paretoVectors: readonly RailCounts[]): number {
  assertNonNegativeDeck(deck);
  if (paretoVectors.length === 0) throw new Error("Road puzzle map has no valid route.");

  const { straight, longCurve, shortCurve } = deck;
  const totalTiles = straight + longCurve + shortCurve;
  let expected = 0;
  for (let draws = 0; draws < totalTiles; draws += 1) {
    const totalCombinations = countCombinations(totalTiles, draws);
    let impossibleCombinations = 0;
    for (let straightDrawn = 0; straightDrawn <= Math.min(straight, draws); straightDrawn += 1) {
      for (
        let longDrawn = 0;
        longDrawn <= Math.min(longCurve, draws - straightDrawn);
        longDrawn += 1
      ) {
        const shortDrawn = draws - straightDrawn - longDrawn;
        if (shortDrawn > shortCurve) continue;
        const drawn = { straight: straightDrawn, longCurve: longDrawn, shortCurve: shortDrawn };
        if (!paretoVectors.some((required) => vectorDominates(required, drawn))) {
          impossibleCombinations +=
            countCombinations(straight, straightDrawn) *
            countCombinations(longCurve, longDrawn) *
            countCombinations(shortCurve, shortDrawn);
        }
      }
    }
    expected += impossibleCombinations / totalCombinations;
  }
  return expected;
}

function findRoadPuzzleRoutes(
  map: RoadPuzzleMap,
  requiredCells: readonly RoadPuzzleCoordinate[] = [],
): RouteCandidate[] {
  const { tileByCoordinate, railByCoordinate, start, end, transits } = validateMap(map);
  const startRail = railByCoordinate.get(coordinateKey(start))!;
  const endKey = coordinateKey(end);
  const tiles = [...tileByCoordinate.values()];
  const indexByCoordinate = new Map(tiles.map((tile, index) => [coordinateKey(tile), index]));
  const neighbors = tiles.map((tile) =>
    EDGE_OFFSETS.map((offset) =>
      indexByCoordinate.get(coordinateKey({ x: tile.x + offset.x, y: tile.y + offset.y, z: tile.z + offset.z })) ?? -1,
    ),
  );
  const startIndex = indexByCoordinate.get(coordinateKey(start))!;
  const endIndex = indexByCoordinate.get(endKey)!;
  const requiredIndices = new Set<number>();
  for (const cell of requiredCells) {
    const index = indexByCoordinate.get(coordinateKey(cell));
    if (index === undefined || tileByCoordinate.get(coordinateKey(cell))?.type !== 5) return [];
    requiredIndices.add(index);
  }
  const tileTypes = tiles.map(({ type }) => type);
  const fixedRails = tiles.map((tile) => railByCoordinate.get(coordinateKey(tile)));
  const transitCount = transits.length;
  const used = new Uint8Array(tiles.length);
  const seenGeneration = new Uint32Array(tiles.length);
  const reachQueue = new Int32Array(tiles.length);
  let generation = 0;
  const candidates = new Map<string, RouteCandidate>();
  const counts: RailCounts = { straight: 0, longCurve: 0, shortCurve: 0 };
  const witness: RoadPuzzlePathStep[] = [];

  const canReachEnd = (fromIndex: number): boolean => {
    generation += 1;
    if (generation === 0xffff_ffff) {
      seenGeneration.fill(0);
      generation = 1;
    }
    let head = 0;
    let tail = 0;
    reachQueue[tail++] = fromIndex;
    seenGeneration[fromIndex] = generation;
    while (head < tail) {
      const current = reachQueue[head++]!;
      for (const neighborIndex of neighbors[current]!) {
        if (neighborIndex < 0) continue;
        if (neighborIndex === endIndex) return true;
        if (used[neighborIndex] || seenGeneration[neighborIndex] === generation) continue;
        const type = tileTypes[neighborIndex];
        if (type !== 3 && type !== 5) continue;
        seenGeneration[neighborIndex] = generation;
        reachQueue[tail++] = neighborIndex;
      }
    }
    return false;
  };

  const recordCandidate = () => {
    if ([...requiredIndices].some((index) => !used[index])) return;
    for (const candidate of candidates.values()) {
      if (vectorDominates(candidate.counts, counts)) return;
    }
    for (const [key, candidate] of candidates) {
      if (vectorDominates(counts, candidate.counts)) candidates.delete(key);
    }
    candidates.set(vectorKey(counts), {
      counts: { ...counts },
      witness: witness.map((step) => ({ ...step })),
    });
  };

  const visit = (currentIndex: number, exitIndex: number, visitedTransitCount: number) => {
    const nextIndex = neighbors[currentIndex]![exitIndex];
    if (nextIndex === undefined || nextIndex < 0) return;
    const enteringIndex = mod6(exitIndex + 3);

    if (nextIndex === endIndex) {
      const rail = fixedRails[endIndex]!;
      if (
        visitedTransitCount === transitCount &&
        rail &&
        (enteringIndex === rail.entranceIndex || enteringIndex === rail.exitIndex)
      ) {
        witness.push({ ...end, tile: "end", entryIndex: enteringIndex, exitIndex: enteringIndex });
        recordCandidate();
        witness.pop();
      }
      return;
    }

    if (used[nextIndex]) return;
    const tile = tiles[nextIndex]!;

    if (tile.type === 3) {
      const rail = fixedRails[nextIndex];
      if (!rail) return;
      let nextExit: number | null = null;
      if (enteringIndex === rail.entranceIndex) nextExit = rail.exitIndex;
      else if (enteringIndex === rail.exitIndex) nextExit = rail.entranceIndex;
      if (nextExit === null) return;
      used[nextIndex] = 1;
      witness.push({ ...tile, tile: "transit", entryIndex: enteringIndex, exitIndex: nextExit });
      visit(nextIndex, nextExit, visitedTransitCount + 1);
      witness.pop();
      used[nextIndex] = 0;
      return;
    }

    if (tile.type !== 5) return;
    used[nextIndex] = 1;
    if (canReachEnd(nextIndex)) {
      for (let nextExit = 0; nextExit < 6; nextExit += 1) {
        if (nextExit === enteringIndex) continue;
        const railKind = railKindForTurn(enteringIndex, nextExit);
        if (counts[railKind] >= map.deck[railKind]) continue;
        counts[railKind] += 1;
        witness.push({ ...tile, tile: "empty", railKind, entryIndex: enteringIndex, exitIndex: nextExit });
        visit(nextIndex, nextExit, visitedTransitCount);
        witness.pop();
        counts[railKind] -= 1;
      }
    }
    used[nextIndex] = 0;
  };

  used[startIndex] = 1;
  for (const edge of new Set([startRail.entranceIndex, startRail.exitIndex])) {
    witness.push({ ...start, tile: "start", exitIndex: edge });
    visit(startIndex, edge, 0);
    witness.pop();
  }

  return [...candidates.values()].sort((left, right) => {
    const totalDiff = vectorTotal(left.counts) - vectorTotal(right.counts);
    if (totalDiff !== 0) return totalDiff;
    return vectorKey(left.counts).localeCompare(vectorKey(right.counts));
  });
}

function solutionFromRoutes(map: RoadPuzzleMap, orderedCandidates: readonly RouteCandidate[]): RoadPuzzleSolution | null {
  if (orderedCandidates.length === 0) return null;
  const minimum = orderedCandidates[0]!;
  const paretoVectors = orderedCandidates.map(({ counts }) => counts);
  const minimumTiles = vectorTotal(minimum.counts);
  const maximumTiles = map.deck.straight + map.deck.longCurve + map.deck.shortCurve;
  const expectedTiles = calculateExpectedDraws(map.deck, paretoVectors);

  return {
    paretoVectors,
    minimumVector: minimum.counts,
    witness: minimum.witness,
    minimumTiles,
    maximumTiles,
    expectedTiles,
    minimumStickers: minimumTiles * ROAD_PUZZLE_STICKERS_PER_TILE,
    maximumStickers: maximumTiles * ROAD_PUZZLE_STICKERS_PER_TILE,
    expectedStickers: expectedTiles * ROAD_PUZZLE_STICKERS_PER_TILE,
  };
}

export function solveRoadPuzzleMap(map: RoadPuzzleMap): RoadPuzzleSolution | null {
  return solutionFromRoutes(map, findRoadPuzzleRoutes(map));
}

export function createRoadPuzzleRouteBaseline(map: RoadPuzzleMap): RoadPuzzleRouteBaseline {
  const routes = findRoadPuzzleRoutes(map);
  return { mapUid: map.uid, routes, solution: solutionFromRoutes(map, routes) };
}

function missingRailCount(required: RailCounts, drawn: RailCounts): number {
  return Math.max(0, required.straight - drawn.straight) +
    Math.max(0, required.longCurve - drawn.longCurve) +
    Math.max(0, required.shortCurve - drawn.shortCurve);
}

function residualVector(required: RailCounts, drawn: RailCounts): RailCounts {
  return {
    straight: Math.max(0, required.straight - drawn.straight),
    longCurve: Math.max(0, required.longCurve - drawn.longCurve),
    shortCurve: Math.max(0, required.shortCurve - drawn.shortCurve),
  };
}

function reduceParetoVectors(vectors: readonly RailCounts[]): RailCounts[] {
  const result: RailCounts[] = [];
  const seen = new Set<string>();
  for (const vector of vectors) {
    const key = vectorKey(vector);
    if (seen.has(key) || result.some((candidate) => vectorDominates(candidate, vector))) continue;
    seen.add(key);
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (vectorDominates(vector, result[index]!)) result.splice(index, 1);
    }
    result.push(vector);
  }
  return result;
}

function assertRemainingWithinDeck(deck: RoadPuzzleDeck, remaining: RailCounts): void {
  for (const kind of Object.keys(deck) as (keyof RailCounts)[]) {
    const count = remaining[kind];
    if (!Number.isSafeInteger(count) || count < 0 || count > deck[kind]) {
      throw new Error("Road puzzle remaining deck is invalid.");
    }
  }
}

function emptyInteractiveAnalysis(): RoadPuzzleInteractiveAnalysis {
  return {
    status: "no-route",
    witness: null,
    requiredVector: null,
    drawnVector: null,
    minimumStickers: null,
    expectedStickers: null,
    maximumStickers: null,
    delta: null,
  };
}

export function analyzeRoadPuzzleMap(
  map: RoadPuzzleMap,
  requiredCells: readonly RoadPuzzleCoordinate[],
  remaining: RailCounts | null,
  precomputedBaseline?: RoadPuzzleRouteBaseline,
): RoadPuzzleInteractiveAnalysis {
  const baseline = precomputedBaseline?.mapUid === map.uid ? precomputedBaseline : undefined;
  const routes = requiredCells.length === 0 && baseline ? baseline.routes : findRoadPuzzleRoutes(map, requiredCells);
  if (routes.length === 0) return emptyInteractiveAnalysis();

  if (remaining === null) {
    const solution = solutionFromRoutes(map, routes)!;
    const noMarkBaseline = requiredCells.length > 0 ? (baseline ?? createRoadPuzzleRouteBaseline(map)).solution : solution;
    if (!noMarkBaseline) throw new Error("Road puzzle constrained route has no baseline route.");
    return {
      status: "planned",
      witness: solution.witness,
      requiredVector: solution.minimumVector,
      drawnVector: null,
      minimumStickers: solution.minimumStickers,
      expectedStickers: solution.expectedStickers,
      maximumStickers: solution.maximumStickers,
      delta:
        requiredCells.length > 0
          ? {
              minimumStickers: solution.minimumStickers - noMarkBaseline.minimumStickers,
              expectedStickers: Math.round(solution.expectedStickers) - Math.round(noMarkBaseline.expectedStickers),
            }
          : null,
    };
  }

  assertRemainingWithinDeck(map.deck, remaining);
  const drawnVector = {
    straight: map.deck.straight - remaining.straight,
    longCurve: map.deck.longCurve - remaining.longCurve,
    shortCurve: map.deck.shortCurve - remaining.shortCurve,
  };
  const completable = routes.find(({ counts }) => missingRailCount(counts, drawnVector) === 0);
  if (completable) {
    return {
      ...emptyInteractiveAnalysis(),
      status: "completable",
      witness: completable.witness,
      requiredVector: completable.counts,
      drawnVector,
    };
  }

  const recommended = [...routes].sort((left, right) => {
    const missingDiff = missingRailCount(left.counts, drawnVector) - missingRailCount(right.counts, drawnVector);
    if (missingDiff !== 0) return missingDiff;
    const totalDiff = vectorTotal(left.counts) - vectorTotal(right.counts);
    if (totalDiff !== 0) return totalDiff;
    return vectorKey(left.counts).localeCompare(vectorKey(right.counts));
  })[0]!;
  const residualVectors = reduceParetoVectors(routes.map(({ counts }) => residualVector(counts, drawnVector)));
  const minimumTiles = missingRailCount(recommended.counts, drawnVector);
  const expectedTiles = calculateExpectedDraws(remaining, residualVectors);
  const remainingTotal = vectorTotal(remaining);
  let delta: RoadPuzzleInteractiveAnalysis["delta"] = null;
  if (requiredCells.length > 0) {
    const noMarkBaseline = baseline ?? createRoadPuzzleRouteBaseline(map);
    const baselineAnalysis = analyzeRoadPuzzleMap(map, [], remaining, noMarkBaseline);
    const baselineMinimum = baselineAnalysis.status === "incomplete" ? baselineAnalysis.minimumStickers! : 0;
    const baselineExpected = baselineAnalysis.status === "incomplete" ? Math.round(baselineAnalysis.expectedStickers!) : 0;
    delta = {
      minimumStickers: minimumTiles * ROAD_PUZZLE_STICKERS_PER_TILE - baselineMinimum,
      expectedStickers: Math.round(expectedTiles * ROAD_PUZZLE_STICKERS_PER_TILE) - baselineExpected,
    };
  }

  return {
    status: "incomplete",
    witness: recommended.witness,
    requiredVector: recommended.counts,
    drawnVector,
    minimumStickers: minimumTiles * ROAD_PUZZLE_STICKERS_PER_TILE,
    expectedStickers: expectedTiles * ROAD_PUZZLE_STICKERS_PER_TILE,
    maximumStickers: remainingTotal * ROAD_PUZZLE_STICKERS_PER_TILE,
    delta,
  };
}
