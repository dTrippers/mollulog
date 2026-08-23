# MolluLog all-at-once D1 cutover runbook

이 문서는 MolluLog, cron Worker, MolluConnect, Admin의 남은 D1 persistence를 한 번의 maintenance window와 두 번의 coordinated deployment round로 전환하기 위한 operator material입니다. 이 구현 작업에서는 아래 production 명령을 실행하지 않습니다.

## 범위와 불변 조건

최종 snapshot과 import의 allowlist는 정확히 다음 열 개입니다.

- `pickup_histories`
- `event_shop_states`
- `pyroxene_owned_resources`
- `pyroxene_collected_sources`
- `pyroxene_timeline_items`
- `pyroxene_planner_options`
- `pyroxene_event_data`
- `pyroxene_guest_import_items`
- `connect_api_keys`
- `connect_request_logs`

snapshot format은 `mollulog.d1.snapshot.v1`입니다. `cache_refresh_jobs`는 pre-cutover deployment에서 이미 PostgreSQL로 이동하며 snapshot/import 대상이 아닙니다. snapshot은 freeze 이후에만 생성하고, `id > lastId ORDER BY id LIMIT N` bounded keyset pagination을 사용하며, 위 열 개 외의 table을 허용하지 않습니다. D1의 raw JSON text와 NUL-bearing value는 snapshot에 그대로 보존하고, import 시 JSONB/boolean/timestamptz 및 guest `itemKey`의 승인된 `v1:` representation으로 typed transform합니다.

다음은 이 작업의 금지 사항입니다.

- dual-write, live D1 fallback, PostgreSQL write 이후의 자동 D1 rollback을 추가하지 않습니다.
- Rei를 변경하지 않습니다.
- production D1/PG/KV mutation, deploy, push를 이 구현 단계에서 실행하지 않습니다.
- snapshot은 protected temporary path에만 만들고 기존 파일을 overwrite하지 않습니다.

## Shared maintenance contract

MolluLog와 MolluConnect production이 공유하는 KV namespace에서 다음 하나의 key만 사용합니다.

```text
mollu:d1-cutover:maintenance
```

KV.get이 `null`을 반환하는 missing key, 빈 값, `0`, `false`는 open으로 해석하고 그 외의 non-empty value는 active로 해석합니다. 오직 KV read timeout/error만 fail-closed 하여 typed `503 D1_MAINTENANCE`를 반환합니다. 내부 exception, KV 내용, database ID를 사용자 응답에 노출하지 않습니다.

Round 1의 D1-authoritative artifact는 모든 열 개 table의 remaining D1 mutation을 막습니다. MolluConnect에서는 API-key-authenticated `GET`도 auth의 `lastUsedAt` update와 request log write 때문에 guard 대상입니다.

## Deployment boundaries

### Round 1: pre-cutover guard-only release

`6fb60e4`에서 `release/d1-pre-cutover`를 만들고 C guard를 적용합니다. 이 artifact는 D1을 authoritative source로 유지하고 `cache_refresh_jobs`만 PostgreSQL을 사용합니다. MolluLog app/cron과 MolluConnect를 함께 배포하고, Admin은 final cleanup 전까지 기존 binding을 유지합니다.

The corrected MolluConnect guard-only artifact is commit `3945c9b`; it keeps the D1 runtime but enforces the shared switch inside both auth middleware paths rather than using a global draft path predicate.

#### Round 1 prerequisite: `cache_refresh_jobs` PostgreSQL availability

Round 1은 기존 `0f6824a` runtime을 포함하므로 `cache_refresh_jobs`를 PostgreSQL에서 읽고 씁니다. Round 1 deployment 바로 직전에, 아래 migration을 적용하고 table availability를 확인합니다. 이 prerequisite가 통과하지 않으면 Round 1을 배포하지 않습니다.

```bash
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260823000100_create_cache_refresh_jobs.sql

CACHE_REFRESH_TABLE="$(mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT to_regclass('public.cache_refresh_jobs')")"
test "$CACHE_REFRESH_TABLE" = "cache_refresh_jobs"
```

The migration and availability check above must pass immediately before the Round 1 application/cron deployment. `cache_refresh_jobs` remains outside the ten-table snapshot and import allowlist.

Round 1 hard gate:

- Round 1 deployment 후 shared key가 missing/open인 상태에서 open/read baseline을 확인합니다. read-only 화면은 maintenance success나 fake empty value로 오인되지 않습니다.
- KV read failure fail-closed behavior는 tests/rehearsal에서 증명하며, missing/empty/`0`/`false`는 open baseline으로 취급합니다.
- MolluConnect `/api/v1/drafts`의 API-key `GET`/`HEAD`/`OPTIONS`는 active key에서 의도적으로 guard됩니다. frozen smoke에서는 성공을 기대하지 않습니다.

### Production D1 source input

The final artifact has no active D1 binding or D1-only package command. Set the production D1 database explicitly for the collector and any separately approved archive operation; do not use the removed `DB` Worker binding.

```bash
export D1_DATABASE='mollulog'
```

`mollulog` is the production D1 database name passed directly to Wrangler. Keep this input explicit even after the final Worker no longer declares a D1 binding.

### Release scan inputs and cutover toolchain pins

The final artifact D1-zero gate scans these explicit repository roots and only the app/cron/runtime/config/package paths named by the scanner. Do not replace them with a broad workspace scan, which would include Workerd ambient declarations, tests, and documentation.

```bash
export MOLLULOG_ROOT='/Users/lyn/Workspace/mollulog/feature-hyperdrive-d1-removal'
export CONNECT_ROOT='/Users/lyn/Workspace/mollu-connect'
export ADMIN_ROOT='/Users/lyn/Workspace/mollulog-admin'
```

For this cutover window, MolluLog pins Wrangler to `4.107.0` and MolluConnect pins Wrangler to `4.98.0`; their lockfiles must resolve those exact versions. The collector accepts the observed Wrangler JSON result shapes: a top-level raw row array, `{ results: [...] }`, `{ result: [...] }`, `{ result: { results: [...] } }`, or a one-element wrapper array containing one of those object shapes. Any other shape is an error that includes the observed shape and supported-shape list.

### Maintenance freeze and final source snapshot

Round 1 deployment 후 먼저 shared key가 missing/open인 상태에서 **verify the open/read baseline**을 수행합니다. 그 다음에만 shared maintenance key를 **activate exactly once** 하고, MolluLog와 MolluConnect 양쪽에서 **verify actual typed HTTP 503 in both runtimes** 합니다. 두 runtime의 active-key `503` 확인이 끝난 뒤에만 snapshot을 생성합니다. KV read timeout/error fail-closed는 production KV outage를 요구하지 않고 tests/rehearsal 결과로 기록합니다.

```bash
set -euo pipefail
umask 077

if [[ -z "${TMUX:-}" && -z "${STY:-}" ]]; then
  echo 'Run the freeze and snapshot commands inside tmux, screen, or an equivalent persistent session.' >&2
  exit 1
fi

SNAPSHOT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mollulog-d1-cutover.XXXXXX")"
PREFLIGHT="$SNAPSHOT_DIR/d1.preflight.json"
SNAPSHOT="$SNAPSHOT_DIR/d1.snapshot.json"
trap 'rm -f -- "$PREFLIGHT" "$SNAPSHOT"; rmdir -- "$SNAPSHOT_DIR"' EXIT

MAX_TOTAL_ROWS=100000
MAX_SOURCE_BYTES=$((256 * 1024 * 1024))

# Round 1 is deployed; verify the open/read baseline before this activation.
mise exec -- pnpm exec wrangler kv key put mollu:d1-cutover:maintenance 1 \
  --binding=KV_CACHE --env production

# Verify actual typed HTTP 503 in both runtimes, including MolluConnect
# authenticated /api/v1/drafts requests, before collecting the source snapshot.

mise exec -- node db/postgres/scripts/d1-cutover-collect.mjs \
  --preflight \
  --database "$D1_DATABASE" \
  --env production \
  --output "$PREFLIGHT" \
  --max-total-rows "$MAX_TOTAL_ROWS" \
  --max-source-bytes "$MAX_SOURCE_BYTES"

mise exec -- node db/postgres/scripts/d1-cutover-collect.mjs \
  --database "$D1_DATABASE" \
  --env production \
  --output "$SNAPSHOT" \
  --max-total-rows "$MAX_TOTAL_ROWS" \
  --max-source-bytes "$MAX_SOURCE_BYTES"
```

The preflight output records each table count, last ID, raw source-size estimate, and totals. This tooling is designed for the observed cutover scale and bounds both total rows and source text size to keep snapshot and host-memory demand predictable. If either limit is exceeded, abort and reassess the source size; do not raise the limit and continue without an explicit review. The snapshot collector also enforces the same row/size ceilings if the source changes between preflight and collection.

collector output must be checked for the exact format, exact ten table keys, row count, `lastId`, strictly increasing IDs, physical uniqueness, and protected `0600` no-overwrite output. `cache_refresh_jobs` must not appear. Keep the tmux/screen session until both files are validated and securely copied to the operator's approved protected location. If the session disconnects, reconnect to the same session and inspect the existing files; never overwrite them. If collection terminated before a valid file was written, verify that the key is still active and source freeze is intact, then rerun to a new protected path. If the preflight file exists but snapshot collection failed, retain it for the incident record and rerun only the collector after rechecking the freeze.

### PostgreSQL transaction import

Freeze를 유지한 채 아래 5a–5e 순서로 PostgreSQL schema와 import를 분리합니다. 네 schema migration은 한 번씩 명시적으로 적용하며, migration 파일에 `IF NOT EXISTS`를 추가하지 않습니다. 그런 조건문은 schema drift를 숨길 수 있습니다.

#### 5a. Confirm the protected inputs and expected schema

Record the preflight file, snapshot path, serving SHA, PostgreSQL target, and the four exact ten-table migration filenames. Confirm that the target database is the intended database and that no earlier failed migration is being treated as complete. `cache_refresh_jobs` is already a Round 1 prerequisite and is not part of this operation.

#### 5b. Apply the four schema migrations explicitly

```bash
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260823000200_create_pyroxene_planner.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000100_create_pickup_histories.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000200_create_event_shop_states.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000300_create_mollu_connect_auth_logs.sql
```

#### 5c. Verify the exact schema and migration state

Before starting the importer, query `information_schema.columns`, `pg_indexes`, identity metadata, and `to_regclass` for every table and compare the result with the checked-in migration files. Record the migration filenames and catalog result. Do not infer that a migration completed from a partial command log, and do not continue when a table, column, index, type, default, identity, or uniqueness check differs.

```bash
mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('pickup_histories','event_shop_states','pyroxene_owned_resources','pyroxene_collected_sources','pyroxene_timeline_items','pyroxene_planner_options','pyroxene_event_data','pyroxene_guest_import_items','connect_api_keys','connect_request_logs') ORDER BY table_name"
mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('pickup_histories','event_shop_states','pyroxene_owned_resources','pyroxene_collected_sources','pyroxene_timeline_items','pyroxene_planner_options','pyroxene_event_data','pyroxene_guest_import_items','connect_api_keys','connect_request_logs') ORDER BY table_name,ordinal_position"
mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc \
  "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('pickup_histories','event_shop_states','pyroxene_owned_resources','pyroxene_collected_sources','pyroxene_timeline_items','pyroxene_planner_options','pyroxene_event_data','pyroxene_guest_import_items','connect_api_keys','connect_request_logs') ORDER BY tablename,indexname"
```

#### 5d. Run the one-transaction import

```bash
mise exec -- node db/postgres/scripts/d1-cutover-transfer.mjs --snapshot "$SNAPSHOT"
```

The importer replaces all ten tables inside one transaction. Count, bidirectional typed `EXCEPT` parity, and identity-sequence repair must all pass before `COMMIT`; a failure rolls back every table and sequence. Record the result before proceeding.

#### 5e. Retry and partial-DDL recovery

If the import fails after 5b/5c completed, do not rerun any completed schema migration. First verify the exact schema/migration state again; only then rerun `d1-cutover-transfer.mjs` against a newly validated protected snapshot. A transfer-only failure must not turn into a second DDL attempt.

If any schema migration command fails, stop and fail closed: do not run the importer or Round 2. Separate `psql -f` invocations can leave earlier DDL committed even when a later invocation fails, so inspect the catalog against every migration file and record the partial-DDL error. After review, either complete the one missing exact migration or repair the target schema in a separately controlled operation; never use `IF NOT EXISTS` to mask drift and never proceed on an uncertain schema. If the exact state cannot be established, keep the maintenance key active and abort the window.

import hard gate는 다음을 모두 요구합니다.

- 모든 table을 `BEGIN`/`COMMIT` 하나로 처리하고, failure 시 모든 row와 sequence를 `ROLLBACK`합니다.
- count가 일치하고 source-minus-target 및 target-minus-source typed `EXCEPT` parity가 모두 0입니다.
- 모든 identity sequence를 `pg_get_serial_sequence($1, 'id')`로 resolve하고 같은 transaction에서 empty table은 1, non-empty table은 `MAX(id)+1`로 repair합니다.
- high/empty ID, JSONB, boolean, timestamp, NUL-bearing guest key, API-key scopes가 typed parity에 포함됩니다.
- missing/malformed/untrusted sequence identifier, timeout, connection budget failure는 commit하지 않습니다.

### Final artifact D1-zero hard gate

Before Round 2 deployment, run this deterministic scan against the explicit final artifact roots. It scans only MolluLog `app`/`workers`/Wrangler/package files, MolluConnect `src`/Wrangler/package files, and Admin `app`/`workers`/Wrangler/package files; Workerd ambient declarations, tests, and docs are excluded by the scanner. Any active D1 model, driver, wrapper, binding, or package command is a hard stop.

```bash
mise exec -- node "$MOLLULOG_ROOT/db/postgres/scripts/d1-cutover-zero-scan.mjs" \
  --mollulog-root "$MOLLULOG_ROOT" \
  --connect-root "$CONNECT_ROOT" \
  --admin-root "$ADMIN_ROOT"
```

Do not deploy Round 2 unless this command exits zero and its output is recorded with the serving SHA. A missing scan input or any violation is also a failure; fix or reassess the release artifact while the shared key remains active.

### Round 2: PostgreSQL-only final release

import/count/parity/sequence gate가 통과하고 freeze가 유지된 뒤 H final artifact를 배포합니다. Round 2는 MolluLog app/cron, MolluConnect, Admin의 active D1 model/driver/wrapper/session helper/Env/package/Wrangler binding을 제거한 PostgreSQL-only runtime입니다.

Round 2 직후에는 write를 하지 않고 frozen read smoke만 수행합니다. 이 smoke는 health success, active-key의 의도적인 MolluConnect draft `503`, 그리고 PostgreSQL imported rows/counts를 확인합니다. active key가 모든 `/api/v1/drafts` request를 막으므로 frozen 상태에서 authenticated draft `GET` 성공을 요구하지 않습니다.

## Exact operator checklist

다음 checklist는 한 maintenance window에서 순서대로 기록합니다. 각 항목은 관찰 결과와 commit SHA를 함께 남깁니다.

1. [ ] Round 1 deployment 바로 직전에 `20260823000100_create_cache_refresh_jobs.sql`을 적용하고 `cache_refresh_jobs` table availability가 확인된 뒤에만 MolluLog app/cron 및 MolluConnect guard를 배포합니다.
2. [ ] Round 1 deployment 후 shared key가 missing/open인 상태에서 MolluLog read-only baseline과 MolluConnect health/read baseline을 확인합니다. frozen draft `GET` 성공은 이 단계에서 요구하지 않습니다.
3. [ ] shared key `mollu:d1-cutover:maintenance`를 정확히 한 번 active로 설정하고 MolluLog guarded action과 MolluConnect `/api/v1/drafts`에서 실제 typed `503`을 확인합니다. KV-read-error 결과는 tests/rehearsal evidence로 기록합니다.
4. [ ] tmux, screen, 또는 equivalent persistent session 안에서 preflight를 먼저 실행하고 protected `d1.preflight.json`에 열 개 table의 count/last ID/source-size totals를 기록합니다. `100000` rows 또는 `256 MiB` source-size budget을 넘으면 abort하고 reassess합니다.
5a. [ ] freeze가 유지되고 active-key `503`이 양쪽 runtime에서 확인된 뒤 protected no-overwrite snapshot을 생성하여 정확히 열 개 table인지, `cache_refresh_jobs`가 빠졌는지 확인합니다.
5b. [ ] 네 ten-table PostgreSQL schema migration을 각 파일 그대로 명시적으로 한 번 적용합니다. `IF NOT EXISTS`로 drift를 숨기지 않습니다.
5c. [ ] `to_regclass`, `information_schema.columns`, `pg_indexes`, identity metadata를 checked-in migration과 대조해 exact schema/migration state를 기록합니다. 하나라도 다르면 fail closed하고 import하지 않습니다.
5d. [ ] `d1-cutover-transfer.mjs` 하나만 실행하여 count, bidirectional typed parity, JSON/timestamp/boolean transform, sequence 결과를 기록합니다. `cache_refresh_jobs` migration/import는 이 단계에 다시 포함하지 않습니다.
5e. [ ] import-only failure이면 completed schema migration을 재실행하지 않고 exact schema state를 다시 확인한 뒤 transfer만 재시도합니다. partial-DDL failure이면 importer/Round 2를 중단하고 catalog를 점검·복구한 뒤에만 별도 승인을 받아 진행합니다.
6. [ ] import failure와 parity failure rehearsal에서 row와 sequence가 함께 rollback되는지 확인합니다.
7. [ ] freeze를 유지한 채 Round 2 final artifact를 배포합니다. 배포 직전 explicit-root D1-zero scan이 exit zero여야 하며, 그렇지 않으면 중단합니다.
8. [ ] frozen read smoke에서 health success, active-key의 의도적인 MolluConnect draft `503`, representative MolluLog reads, read-only PostgreSQL imported rows/counts를 확인합니다. frozen authenticated draft read 성공, D1 fallback, fake empty value, raw internal error를 요구하거나 허용하지 않습니다.
9. [ ] frozen read smoke가 통과한 뒤에만 shared key를 삭제하여 unfreeze합니다.
10. [ ] **첫 post-unfreeze smoke**에서 실제 API-key-authenticated draft `GET`이 성공하고 `lastUsedAt` 및 request log가 기록되는지 확인한 뒤, 승인된 test account write smoke와 read-after-write/idempotency를 확인합니다. 어느 check라도 실패하면 즉시 shared key를 다시 active로 설정하여 re-freeze하고 계속 진행하지 않습니다.
11. [ ] 성공한 write smoke 뒤에는 service를 open 상태로 유지하고 D1-zero 및 PostgreSQL/Hyperdrive observation을 수행합니다. 성공만으로 re-freeze하지 않습니다.
12. [ ] observation이 통과한 뒤, 별도로 승인된 later archive operation이 freeze를 요구하는 경우에만 key를 다시 active로 설정하고, 아래의 explicit-database `zzz_` archive command를 실행합니다. archive 대상은 열 개 table과 이미 PG로 이동한 `cache_refresh_jobs`입니다.
13. [ ] credential을 field 단위로 정리하고 `PGPASSWORD`와 `D1_DATABASE`를 unset합니다. snapshot/terminal/log/process argument에 credential이 남지 않았는지 확인합니다.

## Rollback and forward-fix gates

### Rollback before unfreeze

import, Round 2 deploy, 또는 frozen read smoke가 실패하면 key를 active로 유지합니다. PostgreSQL write가 사용자에게 열리기 전에는 Round 2를 rollback하고 guard-only Round 1로 복구할 수 있습니다. import transaction failure는 `COMMIT`하지 않고, source D1은 freeze 중 authoritative로 남아 있어야 합니다. 원인, count, parity, sequence, serving SHA를 기록하기 전에는 unfreeze하지 않습니다.

### Forward-fix after unfreeze

unfreeze 뒤 첫 authenticated draft read, write smoke, 또는 observation에서 실패하면 즉시 key를 다시 active로 설정하고 re-freeze합니다. 이미 PostgreSQL에 성공한 write가 있을 수 있으므로 D1-authoritative artifact로 자동 rollback하지 않습니다. PostgreSQL-only final artifact를 forward-fix하고, 필요하면 별도로 승인된 reconcile plan을 사용합니다. 성공한 smoke 뒤의 observation을 위해 자동으로 re-freeze하지 않습니다.

### `zzz_` archive and D1-zero observation

archive migration은 다음 table을 `zzz_` prefix로 rename하여 rollback window가 끝난 뒤의 source 보존본으로 둡니다.

- `pickup_histories`, `event_shop_states`
- `pyroxene_owned_resources`, `pyroxene_collected_sources`, `pyroxene_timeline_items`, `pyroxene_planner_options`, `pyroxene_event_data`, `pyroxene_guest_import_items`
- `connect_api_keys`, `connect_request_logs`, `cache_refresh_jobs`

archive 전 D1-zero gate는 service를 open 상태로 유지한 채 release artifact static scan, Wrangler binding/config scan, Worker request/exception log, D1 read/write observation을 모두 확인합니다. 성공한 smoke 뒤 re-freeze는 이 gate의 조건이 아닙니다. `zzz_` rename은 observation 뒤 별도로 승인된 operation이며, 그 operation이 freeze를 요구할 때만 key를 다시 active로 설정합니다. final artifact에는 D1 binding이 없으므로 archive는 explicit database argument를 사용합니다.

```bash
mise exec -- pnpm exec wrangler d1 execute "$D1_DATABASE" \
  --remote \
  --file db/migrations/20260824000400_rename_d1_cutover_tables_with_zzz_prefix.sql
```

## Credentials and disposable rehearsal

Production PostgreSQL credential은 1Password item `hwwkc7rn22btgtqlivztu3xgqa`의 `server`, `port`, `database`, `username`, `password` field를 각각 읽습니다. JSON 전체나 URL을 만들지 않고, password를 echo/log/file/argument에 남기지 않습니다.

```bash
set -euo pipefail
umask 077

POSTGRES_ITEM='hwwkc7rn22btgtqlivztu3xgqa'
export PGHOST="$(op item get "$POSTGRES_ITEM" --field server)"
export PGPORT="$(op item get "$POSTGRES_ITEM" --field port)"
export PGDATABASE="$(op item get "$POSTGRES_ITEM" --field database)"
export PGUSER="$(op item get "$POSTGRES_ITEM" --field username)"
export PGPASSWORD="$(op item get "$POSTGRES_ITEM" --field password --reveal)"
export PGSSLMODE=require

mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'
```

실제 integration test는 `D1_CUTOVER_TEST_*` 환경 변수와 `D1_CUTOVER_TEST_CONFIRM=local-disposable`가 있어야 하며 loopback `test_` database만 허용합니다. 환경 변수가 없으면 test는 skip되고, production credential을 사용하지 않습니다.

```bash
mise exec -- node --test db/postgres/scripts/d1-cutover.integration.mjs
```

작업이 끝나면 다음 값을 unset합니다.

```bash
unset PGPASSWORD PGUSER PGDATABASE PGPORT PGHOST POSTGRES_ITEM PGSSLMODE D1_DATABASE
```

## Completion record

operator는 각 checklist 항목의 시각, serving SHA, snapshot format/table count/last ID, count/parity/sequence 결과, timeout/connection budget, frozen read smoke, first post-unfreeze authenticated draft/read/write smoke, failure re-freeze 또는 separately approved archive re-freeze, D1-zero observation, archive migration, credential cleanup을 기록합니다. 이 구현 작업은 production operation을 실행하지 않았으므로 production cutover 완료를 주장하지 않습니다.
