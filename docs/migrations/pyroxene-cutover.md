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

빈 값, `0`, `false`는 open으로 해석하고 그 외의 non-empty value는 active로 해석합니다. KV value가 없거나 KV read가 timeout/error이면 fail-closed 하여 typed `503 D1_MAINTENANCE`를 반환합니다. 내부 exception, KV 내용, database ID를 사용자 응답에 노출하지 않습니다.

Round 1의 D1-authoritative artifact는 모든 열 개 table의 remaining D1 mutation을 막습니다. MolluConnect에서는 API-key-authenticated `GET`도 auth의 `lastUsedAt` update와 request log write 때문에 guard 대상입니다.

## Deployment boundaries

### Round 1: pre-cutover guard-only release

`6fb60e4`에서 `release/d1-pre-cutover`를 만들고 C guard를 적용합니다. 이 artifact는 D1을 authoritative source로 유지하고 `cache_refresh_jobs`만 PostgreSQL을 사용합니다. MolluLog app/cron과 MolluConnect를 함께 배포하고, Admin은 final cleanup 전까지 기존 binding을 유지합니다.

Round 1 hard gate:

- authenticated write/action 요청이 실제 typed maintenance `503`을 반환합니다.
- KV read 성공의 active 상태와 KV read failure가 모두 fail-closed입니다.
- read-only 화면은 maintenance success나 fake empty value로 오인되지 않습니다.
- MolluConnect draft `GET`/`HEAD`/`OPTIONS`를 포함한 API-key path가 auth/log write를 시작하지 않습니다.

### Maintenance freeze and final source snapshot

Round 1 gate가 통과된 뒤에만 shared key를 active로 설정합니다. operator는 action-level `503`을 다시 확인한 뒤 snapshot을 생성합니다.

```bash
set -euo pipefail
umask 077

SNAPSHOT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mollulog-d1-cutover.XXXXXX")"
SNAPSHOT="$SNAPSHOT_DIR/d1.snapshot.json"
trap 'rm -f -- "$SNAPSHOT"; rmdir -- "$SNAPSHOT_DIR"' EXIT

mise exec -- pnpm exec wrangler kv key put mollu:d1-cutover:maintenance 1 \
  --binding=KV_CACHE --env production

# Authenticated write/action request must now return typed HTTP 503.

mise exec -- node db/postgres/scripts/pyroxene-d1-collect.mjs \
  --database "$D1_DATABASE" \
  --env production \
  --output "$SNAPSHOT"
```

collector output must be checked for the exact format, exact ten table keys, row count, `lastId`, strictly increasing IDs, physical uniqueness, and protected `0600` no-overwrite output. `cache_refresh_jobs` must not appear.

### PostgreSQL transaction import

Freeze를 유지한 채 PostgreSQL schema migrations를 적용하고, 하나의 import transaction으로 모든 열 개 table을 replace합니다.

```bash
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260823000200_create_pyroxene_planner.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000100_create_pickup_histories.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000200_create_event_shop_states.sql
mise exec -- psql -X -v ON_ERROR_STOP=1 \
  -f db/postgres/migrations/20260824000300_create_mollu_connect_auth_logs.sql
mise exec -- node db/postgres/scripts/pyroxene-transfer.mjs --snapshot "$SNAPSHOT"
```

import hard gate는 다음을 모두 요구합니다.

- 모든 table을 `BEGIN`/`COMMIT` 하나로 처리하고, failure 시 모든 row와 sequence를 `ROLLBACK`합니다.
- count가 일치하고 source-minus-target 및 target-minus-source typed `EXCEPT` parity가 모두 0입니다.
- 모든 identity sequence를 `pg_get_serial_sequence($1, 'id')`로 resolve하고 같은 transaction에서 empty table은 1, non-empty table은 `MAX(id)+1`로 repair합니다.
- high/empty ID, JSONB, boolean, timestamp, NUL-bearing guest key, API-key scopes가 typed parity에 포함됩니다.
- missing/malformed/untrusted sequence identifier, timeout, connection budget failure는 commit하지 않습니다.

### Round 2: PostgreSQL-only final release

import/count/parity/sequence gate가 통과하고 freeze가 유지된 뒤 H final artifact를 배포합니다. Round 2는 MolluLog app/cron, MolluConnect, Admin의 active D1 model/driver/wrapper/session helper/Env/package/Wrangler binding을 제거한 PostgreSQL-only runtime입니다.

Round 2 직후에는 write를 하지 않고 frozen read smoke만 수행합니다.

## Exact operator checklist

다음 checklist는 한 maintenance window에서 순서대로 기록합니다. 각 항목은 관찰 결과와 commit SHA를 함께 남깁니다.

1. [ ] Round 1 artifact SHA와 `release/d1-pre-cutover` boundary를 확인하고 MolluLog app/cron 및 MolluConnect guard를 배포합니다.
2. [ ] Round 1 action-level frozen response, KV-read-error response, read-only response, MolluConnect authenticated draft `GET` response를 확인합니다.
3. [ ] shared key `mollu:d1-cutover:maintenance`를 active로 설정하고 두 runtime에서 `503`을 확인합니다.
4. [ ] freeze 이후 protected no-overwrite snapshot을 생성하고 정확히 열 개 table인지, `cache_refresh_jobs`가 빠졌는지 확인합니다.
5. [ ] 네 PostgreSQL schema migration과 하나의 import transaction을 실행하고 count, bidirectional typed parity, JSON/timestamp/boolean transform, sequence 결과를 기록합니다.
6. [ ] import failure와 parity failure rehearsal에서 row와 sequence가 함께 rollback되는지 확인합니다.
7. [ ] freeze를 유지한 채 Round 2 final artifact를 배포합니다. active D1 runtime/binding zero scan을 release artifact에서 먼저 실행합니다.
8. [ ] frozen read smoke로 대표 pickup history, event shop state, Pyroxene state/receipt, API-key-authenticated draft read를 확인합니다. D1 fallback, fake empty value, raw internal error가 없어야 합니다.
9. [ ] frozen read smoke가 통과한 뒤에만 shared key를 삭제하여 unfreeze합니다.
10. [ ] unfreeze 후 승인된 test account로 write smoke를 실행하고 PostgreSQL row, read-after-write, API-key `lastUsedAt`, request log, idempotency를 확인합니다.
11. [ ] write smoke가 끝나면 다시 shared key를 active로 설정하여 re-freeze하고, observation window 동안 D1 read/write가 0인지 확인합니다.
12. [ ] D1-zero observation과 rollback window가 통과한 뒤에만 `zzz_` archive migration을 적용합니다. archive 대상은 열 개 table과 이미 PG로 이동한 `cache_refresh_jobs`입니다.
13. [ ] credential을 field 단위로 정리하고 `PGPASSWORD`를 unset합니다. snapshot/terminal/log/process argument에 credential이 남지 않았는지 확인합니다.

## Rollback and forward-fix gates

### Rollback before unfreeze

import, Round 2 deploy, 또는 frozen read smoke가 실패하면 key를 active로 유지합니다. PostgreSQL write가 사용자에게 열리기 전에는 Round 2를 rollback하고 guard-only Round 1로 복구할 수 있습니다. import transaction failure는 `COMMIT`하지 않고, source D1은 freeze 중 authoritative로 남아 있어야 합니다. 원인, count, parity, sequence, serving SHA를 기록하기 전에는 unfreeze하지 않습니다.

### Forward-fix after unfreeze

unfreeze 뒤 write smoke나 observation에서 실패하면 즉시 key를 다시 active로 설정하고 re-freeze합니다. 이미 PostgreSQL에 성공한 write가 있을 수 있으므로 D1-authoritative artifact로 자동 rollback하지 않습니다. PostgreSQL-only final artifact를 forward-fix하고, 필요하면 별도로 승인된 reconcile plan을 사용합니다.

### `zzz_` archive and D1-zero observation

archive migration은 다음 table을 `zzz_` prefix로 rename하여 rollback window가 끝난 뒤의 source 보존본으로 둡니다.

- `pickup_histories`, `event_shop_states`
- `pyroxene_owned_resources`, `pyroxene_collected_sources`, `pyroxene_timeline_items`, `pyroxene_planner_options`, `pyroxene_event_data`, `pyroxene_guest_import_items`
- `connect_api_keys`, `connect_request_logs`, `cache_refresh_jobs`

archive 전 D1-zero gate는 release artifact static scan, Wrangler binding/config scan, Worker request/exception log, D1 read/write observation을 모두 확인합니다. 이 gate는 read-only observation이며, D1 table deletion은 별도 승인 작업입니다.

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
mise exec -- node --test db/postgres/scripts/d1-cutover.integration.test.mjs
```

작업이 끝나면 다음 값을 unset합니다.

```bash
unset PGPASSWORD PGUSER PGDATABASE PGPORT PGHOST POSTGRES_ITEM PGSSLMODE D1_DATABASE
```

## Completion record

operator는 각 checklist 항목의 시각, serving SHA, snapshot format/table count/last ID, count/parity/sequence 결과, timeout/connection budget, frozen read smoke, write smoke, re-freeze, D1-zero observation, archive migration, credential cleanup을 기록합니다. 이 구현 작업은 production operation을 실행하지 않았으므로 production cutover 완료를 주장하지 않습니다.
