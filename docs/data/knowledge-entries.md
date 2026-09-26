# Knowledge entries shared contract

`mollulog` owns the PostgreSQL migration. `mollulog-admin` mirrors these table,
column, JSON, and status contracts in its Drizzle declaration and application
types. The first release writes `kind = 'term'` only.

## Tables

### `knowledge_entries`

| Column | PostgreSQL type | Null/default | Meaning |
| --- | --- | --- | --- |
| `id` | `integer` identity | primary key | Stable entry identity |
| `kind` | `text` | not null | Current value: `term` |
| `published_revision_id` | `integer` | nullable; composite FK `(id, published_revision_id)` to revision `(entry_id, id)` | Current revision belonging to this entry; null before first publish or after withdrawal |
| `archived_at` | `timestamptz` | nullable | Non-null hides the entry from public reads while preserving history |
| `created_at` | `timestamptz` | not null, `now()` | Entry creation time |
| `updated_at` | `timestamptz` | not null, `now()` | Last entry-level change |

### `knowledge_entry_revisions`

| Column | PostgreSQL type | Null/default | Meaning |
| --- | --- | --- | --- |
| `id` | `integer` identity | primary key | Stable revision identity |
| `entry_id` | `integer` | not null, FK to `knowledge_entries.id` | Owning entry |
| `title` | `text` | not null | Public popover title |
| `aliases` | `jsonb` | not null; JSON array of strings | Registered literal match expressions; must include `title` |
| `meaning_context` | `text` | nullable | Optional administrator-provided context for generation |
| `inline_enabled` | `boolean` | not null, no default | Whether this revision may be annotated in student prose |
| `generated_body` | `text` | nullable | Latest accepted AI source text, kept separate from review text |
| `body` | `text` | nullable | Editable review text; required by application validation before publish |
| `status` | `text` | not null | `draft`, `published`, or `rejected` |
| `generation_metadata` | `jsonb` | nullable | Successful generation request, answer, evidence, and evidence hash |
| `generation_request_id` | `text` | nullable | Active generation claim token; clear it when a request is invalidated or completed |
| `generation_started_at` | `timestamptz` | nullable | Start time paired with the active claim token |
| `generated_at` | `timestamptz` | nullable | Time of the latest accepted generation result |
| `published_at` | `timestamptz` | nullable | Time this immutable revision was published |
| `rejected_at` | `timestamptz` | nullable | Time this revision was rejected |
| `rejection_feedback` | `text` | nullable | Administrator's rejection reason |
| `created_at` | `timestamptz` | not null, `now()` | Revision creation time |
| `updated_at` | `timestamptz` | not null, `now()` | Last draft or status change |

The unique index `knowledge_entry_revisions_entry_id_id_uidx` supports the
composite pointer foreign key, which structurally prevents an entry from
pointing to another entry's revision. The partial unique index
`knowledge_entry_revisions_one_draft_per_entry_uidx` allows at most one `draft`
revision for an entry. The application validates
status values and all state transitions; the migration and Drizzle schema add
no PostgreSQL `CHECK` constraint. Revisions in `published` state are immutable.
Replacing a publication changes only the entry pointer and the new revision's
status/time in one transaction; older published revisions remain in history.
Withdrawal clears the pointer. Archiving sets `archived_at` and keeps the
pointer and revision history.

Publishing must verify that the revision's `entry_id` is the target entry,
that its status is `draft`, and that its body is valid. It then publishes the
revision and swaps `published_revision_id` atomically. The public query joins
both `entry_id` and `published_revision_id`. Before publish, Admin checks normalized aliases
against other current published terms and blocks collisions; the public matcher
also leaves ambiguous matches unannotated.

`generation_request_id` is a compare-and-set claim. Admin starts generation only
after claiming an unclaimed draft. Saving, rejecting, or publishing a draft
invalidates its active claim. A result may update the draft only while its claim
token still matches, the revision remains a draft, and the reviewed content has
not changed since the request started. The Admin UI disables duplicate submits
for the same active request. Generation failures do not replace `body`,
`generated_body`, or successful `generation_metadata`.

## `generation_metadata` JSON

On a successful answered result, store this object. Optional properties shown
with `?` may be omitted; `null` input values remain explicit nulls. The
`evidenceHash` is a lowercase hexadecimal SHA-256 of the canonical UTF-8 JSON
encoding of the `evidence` array, with recursively sorted object keys and array
order preserved.

```json
{
  "questionVersion": "knowledge-term-v5",
  "input": {
    "title": "공포",
    "aliases": ["공포"],
    "meaningContext": null,
    "reviewerFeedback": null,
    "previousBody": null
  },
  "request": {
    "question": "server-built question text",
    "context": {
      "region": "jp",
      "asOf": "2026-09-26T00:00:00.000Z",
      "entities": [{"kind": "concept", "uid": "bakb:concept:status-effect.fear"}]
    }
  },
  "run": {
    "runId": "al1s-run-id",
    "profileId": "profile-id",
    "policyVersion": "policy-version",
    "provider": "provider-name",
    "model": "model-name"
  },
  "answer": {
    "text": "한국어 평문 설명",
    "claims": [{"text": "주장", "evidenceIds": ["evidence-id"]}],
    "limitations": [],
    "evidencePaths": ["knowledge/concepts/combat/status-effects/fear.md"]
  },
  "evidence": [
    {
      "evidenceId": "evidence-id",
      "source": "BAKB",
      "sourceVersion": "snapshot-or-commit",
      "retrievedAt": "2026-09-26T00:00:00.000Z",
      "sourceObservedAt": "2026-08-29",
      "effectiveScope": {},
      "entities": [{"kind": "concept", "uid": "bakb:concept:status-effect.fear"}],
      "queryParameters": {},
      "facts": {},
      "freshness": "current",
      "limitations": []
    }
  ],
  "evidenceHash": "sha256-hex"
}
```

The `input` object is the exact registered title, aliases, optional context, and
feedback supplied to that successful run, with the previous reviewed body when
regenerating. `request.question` and `request.context` are the exact server-built
AL-1S request. Each answer claim must cite evidence IDs present in `evidence`.
Search candidates without a fetched document are not sufficient evidence.
Clarification, insufficient-evidence, failed, or malformed responses are
outcomes for the Admin UI and do not replace successful revision content.

## Public student-detail response

MolluLog returns only this shape to the student page:

```ts
type PublicKnowledgeEntry = {
  title: string;
  aliases: string[];
  body: string;
};
```

The query includes only a current revision whose entry is not archived, whose
revision status is `published`, and whose `inline_enabled` is `true`. It omits
database IDs, `kind`, context, draft/rejection state, generation input,
feedback, model details, and evidence snapshots. An empty result means a
successful empty glossary; a database error is reported separately and never
starts generation or removes the original student text.
