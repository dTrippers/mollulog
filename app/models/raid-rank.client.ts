import { addRxPlugin, createRxDatabase, type RxDatabase } from "rxdb";
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { replicateRxCollection } from "rxdb/plugins/replication";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import protobuf from "protobufjs";
import type { RaidType, DefenseType } from "~/models/content.d";
import { decodeSlotString, encodeRaidRankId, raidRankIdPrefix } from "./raid-rank";

if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}
addRxPlugin(RxDBQueryBuilderPlugin);

// Protobuf schema definition
const PROTO_SCHEMA = `
syntax = "proto3";

message RankDocument {
  string raidType = 1;
  int32 seasonIndex = 2;
  string defenseType = 3;
  int32 rank = 4;
  int32 score = 5;
  repeated string parties = 6;
}

message RankDocumentsResponse {
  repeated RankDocument documents = 1;
}
`;

let protobufRoot: protobuf.Root | null = null;

async function getProtobufRoot(): Promise<protobuf.Root> {
  if (!protobufRoot) {
    protobufRoot = protobuf.parse(PROTO_SCHEMA).root;
  }
  return protobufRoot;
}

const rankSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    // Encoded ID with format ABBBCDDDDD
    //   A = raidType (1 = total_assault | 2 = elimination)
    //   B = seasonIndex (1-999)
    //   C = defenseType (1 = light | 2 = heavy | 3 = special | 4 = elastic)
    //   D = rank (1-20000)
    id: { type: "string", maxLength: 10 },
    numId: { type: "integer", multipleOf: 1, minimum: 1, maximum: 9999999999 },

    // Number of score
    score: { type: "integer", multipleOf: 1 },

    // Flattened array of all slots from all parties.
    // Each string is encoded slot data: "AAAAABBCD" where AAAAA=studentUid, BB=level(hex), C=tier(hex), D=isAssist("1"/"0"), empty string if slot is empty.
    parties: {
      type: "array",
      items: { type: "string", maxLength: 9 },
    },
  },
  required: ["id", "numId", "score", "parties"],
  indexes: [
    ["numId"], // Index for finding by numId
  ],
};

// Stored document format (compressed)
export type RaidRankDocument = {
  id: string;
  numId: number;
  score: number;
  parties: string[]; // Flattened array of encoded slot strings (6 slots per party)
  _deleted: boolean;
};

// Parsed document format (for use in components)
export type ParsedRaidRankDocument = {
  id: string;
  raidType: RaidType;
  seasonIndex: number;
  defenseType: DefenseType;
  rank: number;
  score: number;
  parties: {
    partyIndex: number;
    slots: {
      slotIndex: number;
      tier: number | null;
      level: number | null;
      isAssist: boolean | null;
      studentUid: string | null;
    }[];
  }[];
};

type RaidRankCheckpoint = {
  prevChunkIndex: number;
};

let raidRankDatabase: RxDatabase | null = null;

export async function getRaidRankDatabase() {
  if (raidRankDatabase) {
    return raidRankDatabase;
  }

  const db = await createRxDatabase({
    name: "mollulog-rxdb",
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    closeDuplicates: true,
  });

  raidRankDatabase = db;
  return raidRankDatabase;
}

/**
 * Parse encoded ID into object
 * Format: ABBBCDDDDD
 *   A = raidType (1 = total_assault | 2 = elimination | 3 = unlimit)
 *   BBB = seasonIndex (1-999)
 *   C = defenseType (1 = light | 2 = heavy | 3 = special | 4 = elastic)
 *   DDDDD = rank (1-20000)
 */
const raidTypeMap: Record<string, RaidType> = {
  "1": "total_assault",
  "2": "elimination",
  "3": "unlimit",
};

const defenseTypeMap: Record<string, DefenseType> = {
  "1": "light",
  "2": "heavy",
  "3": "special",
  "4": "elastic",
};

export function parseRaidRankId(id: string): { raidType: RaidType; seasonIndex: number; defenseType: DefenseType; rank: number } {
  const raidType = raidTypeMap[id.substring(0, 1)];
  const seasonIndex = Number(id.substring(1, 4));
  const defenseType = defenseTypeMap[id.substring(4, 5)];
  const rank = Number(id.substring(5, 10));

  return { raidType, seasonIndex, defenseType, rank };
}

/**
 * Parse encoded parties array into structured format
 */
export function parseRaidRankParties(encodedParties: string[]): ParsedRaidRankDocument["parties"] {
  const SLOTS_PER_PARTY = 6;
  const parties: ParsedRaidRankDocument["parties"] = [];
  for (let partyIndex = 0; partyIndex < encodedParties.length / SLOTS_PER_PARTY; partyIndex++) {
    const partyStartIndex = partyIndex * SLOTS_PER_PARTY;
    const partySlots = encodedParties.slice(partyStartIndex, partyStartIndex + SLOTS_PER_PARTY);
    const slots = partySlots.map((encodedSlot: string, slotIndexInParty: number) => {
      return decodeSlotString(encodedSlot, slotIndexInParty);
    });
    parties.push({ partyIndex, slots });
  }
  return parties;
}

/**
 * Parse a RaidRankDocument into ParsedRaidRankDocument
 */
export function parseRaidRankDocument(doc: RaidRankDocument): ParsedRaidRankDocument {
  const { raidType, seasonIndex, defenseType, rank } = parseRaidRankId(doc.id);
  return {
    id: doc.id, // Keep numeric ID
    raidType,
    seasonIndex,
    defenseType,
    rank,
    score: doc.score,
    parties: parseRaidRankParties(doc.parties),
  };
}

/**
 * Parse protobuf binary data to RankDocumentsResponse
 */
async function parseProtobufResponse(data: ArrayBuffer): Promise<any> {
  const root = await getProtobufRoot();
  const RankDocumentsResponse = root.lookupType("RankDocumentsResponse");

  // Decode the protobuf message
  const message = RankDocumentsResponse.decode(new Uint8Array(data));
  return RankDocumentsResponse.toObject(message, {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true,
  });
}

/**
 * Convert protobuf RankDocument to RxDB document format
 * Store parties as encoded strings directly (no parsing to reduce storage size)
 * Encode ID from string format to numeric format
 */
function convertRankDocumentToRxDB(doc: any): RaidRankDocument {
  // Encode the ID from protobuf format (string) to numeric format
  const encodedId = encodeRaidRankId(
    doc.raidType as RaidType,
    doc.seasonIndex as number,
    doc.defenseType as DefenseType,
    doc.rank as number
  );

  return {
    id: encodedId.toString(),
    numId: encodedId,
    score: doc.score,
    parties: doc.parties || [], // Store encoded strings directly
    _deleted: false,
  };
}

/**
 * Download a single chunk of protobuf file
 * Returns the raw protobuf documents and whether the chunk was successfully downloaded
 */
async function downloadChunk(raidType: RaidType, seasonIndex: number, defenseType: DefenseType, chunkIndex: number): Promise<{ documents: any[]; exists: boolean }> {
  const chunkUrl = `https://assets.mollulog.net/statics/raidrank/${raidType}/${seasonIndex}-${defenseType}.${chunkIndex}.protobuf`;
  const res = await fetch(chunkUrl);
  if (res.status === 403) {
    return { documents: [], exists: false };
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch chunk ${chunkIndex}: ${res.statusText}`);
  }

  // Parse protobuf response
  const arrayBuffer = await res.arrayBuffer();
  const response = await parseProtobufResponse(arrayBuffer);

  const documents = response.documents || [];
  return { documents, exists: documents.length > 0 };
}

export async function initCollection(db: RxDatabase, raidType: RaidType, seasonIndex: number, defenseType: DefenseType) {
  const prefix = raidRankIdPrefix(raidType, seasonIndex, defenseType);
  const collectionName = `ranks-${prefix}`;
  if (!db.collections[collectionName]) {
    return await db.addCollections({ [collectionName]: { schema: rankSchema } });
  }
  return db.collections[collectionName];
}

export async function syncRaidRank(db: RxDatabase, raidType: RaidType, seasonIndex: number, defenseType: DefenseType) {
  const prefix = raidRankIdPrefix(raidType, seasonIndex, defenseType);
  const collectionName = `ranks-${prefix}`;
  const replicationState = replicateRxCollection<RaidRankDocument, RaidRankCheckpoint>({
    collection: db.collections[collectionName],
    replicationIdentifier: `raid-replication-${raidType}-${seasonIndex}-${defenseType}`,
    live: false,
    pull: {
      handler: async (checkpointOrNull) => {
        let chunkIndex = 0;
        if (checkpointOrNull?.prevChunkIndex !== undefined) {
          chunkIndex = checkpointOrNull.prevChunkIndex + 1;
        }

        // Download current chunk
        const { documents: chunkDocuments, exists } = await downloadChunk(raidType, seasonIndex, defenseType, chunkIndex);
        if (!exists) {
          // If chunk doesn't exist, we're done (return null checkpoint)
          return {
            checkpoint: { prevChunkIndex: chunkIndex },
            documents: [],
          };
        }

        // Convert protobuf documents to RxDB format (store encoded strings directly)
        const documents = chunkDocuments.map(convertRankDocumentToRxDB);
        return {
          checkpoint: { prevChunkIndex: chunkIndex },
          documents,
        };
      },
    },
  });

  replicationState.start();
}
