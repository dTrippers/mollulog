export type KnowledgeEntryKind = "term";

export type KnowledgeEntryRevisionStatus = "draft" | "published" | "rejected";

export type KnowledgeEvidenceSnapshot = {
  evidenceId: string;
  source: string;
  sourceVersion?: string;
  retrievedAt: string;
  sourceObservedAt?: string;
  effectiveScope?: Record<string, unknown>;
  entities?: Array<{ kind: string; uid: string }>;
  queryParameters: Record<string, unknown>;
  facts: Record<string, unknown>;
  freshness?: string;
  limitations: string[];
};

export type KnowledgeGenerationMetadata = {
  questionVersion: string;
  input: {
    title: string;
    aliases: string[];
    meaningContext: string | null;
    reviewerFeedback: string | null;
    previousBody: string | null;
  };
  request: {
    question: string;
    context: {
      region: string;
      asOf: string;
      entities?: Array<{ kind: string; uid: string }>;
    };
  };
  run: {
    runId: string;
    profileId: string;
    policyVersion: string;
    provider: string;
    model: string;
  };
  answer: {
    text: string;
    claims: Array<{ text: string; evidenceIds: string[] }>;
    limitations: string[];
    evidencePaths?: string[];
  };
  evidence: KnowledgeEvidenceSnapshot[];
  evidenceHash: string;
};

/** Public student detail payload: only the published text needed for annotation. */
export type PublicKnowledgeEntry = {
  title: string;
  aliases: string[];
  body: string;
};

export type KnowledgeAnnotationSegment =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; suffix: string; noWrapTailLength: number; entry: PublicKnowledgeEntry };
