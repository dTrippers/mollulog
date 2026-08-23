# Pyroxene D1 → PostgreSQL cutover runbook

이 문서는 Pyroxene의 D1 저장소를 B1a PostgreSQL schema와 Hyperdrive 경로로 전환할 때 사용하는 실행 순서입니다. 이 문서의 명령은 절차를 재현하기 위한 예시이며, B1b 구현 작업에서는 어느 명령도 실행하지 않습니다.

## 범위와 금지 사항

이번 전환의 데이터 범위는 다음 여섯 테이블과 버전이 고정된 snapshot 형식뿐입니다.

- `pyroxene_owned_resources`
- `pyroxene_collected_sources`
- `pyroxene_timeline_items`
- `pyroxene_planner_options`
- `pyroxene_event_data`
- `pyroxene_guest_import_items`
- `mollulog.pyroxene.snapshot.v1`

collector는 `id > lastId ORDER BY id` keyset pagination으로 원본 D1 값을 그대로 보존합니다. import는 camelCase D1 column을 snake_case PostgreSQL column으로 매핑하고, guest `itemKey`만 B1a의 `v1:` UTF-8 base64url encoding으로 저장합니다. snapshot의 raw `itemKey`와 NUL 문자는 바꾸지 않습니다.

다음 작업은 이 runbook의 범위가 아니며 별도 승인이 필요합니다.

- B1b 동안의 production snapshot/import, Cloudflare/KV/D1 mutation, deploy, commit, push
- Rei 또는 B2 작업
- D1 binding/table 삭제, PostgreSQL 정리, 일반적인 D1 전체 export

실패하면 partial target을 노출하지 않습니다. freeze를 유지하거나 다시 켜고, import transaction rollback 여부를 확인한 뒤 guard-capable Revision B(또는 동등한 guard-only artifact)로 되돌립니다.

## 실제 PostgreSQL rehearsal: disposable 환경에서 먼저 실행

production과 분리된 disposable PostgreSQL 및 non-authoritative D1 database만 사용하셔야 합니다. rehearsal에서 사용하는 `REHEARSAL_*` 값이 production을 가리키지 않는지 먼저 확인하셔야 합니다.

```bash
set -euo pipefail
umask 077

export REHEARSAL_D1_DATABASE='REPLACE_WITH_DISPOSABLE_D1_DATABASE'
export REHEARSAL_D1_ENV='REPLACE_WITH_NON_PRODUCTION_ENV'
export REHEARSAL_PGHOST='127.0.0.1'
export REHEARSAL_PGPORT='5432'
export REHEARSAL_PGDATABASE='mollulog_pyroxene_rehearsal'
export REHEARSAL_PGUSER='REPLACE_WITH_REHEARSAL_USER'
export REHEARSAL_PGPASSWORD='REPLACE_WITH_REHEARSAL_PASSWORD'
export REHEARSAL_PGSSLMODE='disable'

REHEARSAL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mollulog-pyroxene-rehearsal.XXXXXX")"
REHEARSAL_SNAPSHOT="$REHEARSAL_DIR/pyroxene.snapshot.json"
trap 'rm -f -- "$REHEARSAL_SNAPSHOT"; rmdir -- "$REHEARSAL_DIR"' EXIT

export PGHOST="$REHEARSAL_PGHOST"
export PGPORT="$REHEARSAL_PGPORT"
export PGDATABASE="$REHEARSAL_PGDATABASE"
export PGUSER="$REHEARSAL_PGUSER"
export PGPASSWORD="$REHEARSAL_PGPASSWORD"
export PGSSLMODE="$REHEARSAL_PGSSLMODE"

PG_PROBE=(psql -X -v ON_ERROR_STOP=1 -Atc)
mise exec -- "${PG_PROBE[@]}" 'SELECT 1'
# Equivalent literal probe: mise exec -- psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'
```

`SELECT 1`이 성공하고 연결 대상이 disposable인지 사람이 확인한 뒤에만 다음 명령을 실행하셔야 합니다. rehearsal snapshot은 protected repo-external temporary path에 만들고, 파일을 repository에 넣지 않습니다.

```bash
mise exec -- node db/postgres/scripts/pyroxene-d1-collect.mjs \
  --database "$REHEARSAL_D1_DATABASE" \
  --env "$REHEARSAL_D1_ENV" \
  --output "$REHEARSAL_SNAPSHOT"

mise exec -- psql -X -v ON_ERROR_STOP=1 -f db/postgres/migrations/20260823000200_create_pyroxene_planner.sql
mise exec -- node db/postgres/scripts/pyroxene-transfer.mjs --snapshot "$REHEARSAL_SNAPSHOT"
```

rehearsal의 hard gate는 여섯 테이블의 count와 typed bidirectional `EXCEPT` parity가 모두 0 mismatch이고, 명시적인 high ID 뒤의 다음 generated ID가 충돌하지 않는 것입니다. transfer가 각 allowlisted table의 identity sequence를 `pg_get_serial_sequence($1, 'id')`로 resolve한 뒤 같은 transaction 안에서 `ALTER SEQUENCE ... RESTART WITH`를 실행했는지 확인하셔야 합니다. 빈 table은 1, non-empty table은 `MAX(id) + 1`로 restart되어야 하며, import error와 parity error를 각각 주입하여 `ROLLBACK` 후 원래 데이터와 sequence가 유지되는지도 확인하셔야 합니다. connection 수와 statement timeout이 허용 budget 안인지도 기록하셔야 합니다.

rehearsal gate 하나라도 실패하면 production 단계로 진행하지 않습니다.

## Production PostgreSQL credential hard gate

Revision A 검증과 production snapshot 전에 credential을 준비하셔야 합니다. 1Password item `hwwkc7rn22btgtqlivztu3xgqa`에서 URL을 만들거나 JSON 전체를 읽지 말고, 다음 다섯 field를 각각 표준 PostgreSQL 환경 변수로 주입하셔야 합니다.

```bash
set -euo pipefail
umask 077

POSTGRES_ITEM='hwwkc7rn22btgtqlivztu3xgqa'
export D1_DATABASE='REPLACE_WITH_APPROVED_PRODUCTION_D1_DATABASE'
export PGHOST="$(op item get "$POSTGRES_ITEM" --field server)"
export PGPORT="$(op item get "$POSTGRES_ITEM" --field port)"
export PGDATABASE="$(op item get "$POSTGRES_ITEM" --field database)"
export PGUSER="$(op item get "$POSTGRES_ITEM" --field username)"
export PGPASSWORD="$(op item get "$POSTGRES_ITEM" --field password)"
export PGSSLMODE='require'

PG_PROBE=(psql -X -v ON_ERROR_STOP=1 -Atc)
mise exec -- "${PG_PROBE[@]}" 'SELECT 1'
```

`PGPASSWORD`와 다른 credential 값을 echo, log, command argument, snapshot, 파일에 남기지 않습니다. `SELECT 1`의 host/database가 승인된 production 대상인지 확인하기 전에는 freeze나 migration/import를 실행하지 않습니다. import와 production smoke를 마칠 때까지는 이 환경 변수를 유지하되, shell history와 process output을 남기지 않는 방식으로 절차 종료 직후 unset하셔야 합니다. import 단계에서 credential이 사라지지 않도록 cleanup은 마지막 단계에서 실행합니다.

## Revision A: guard-only

먼저 guard-only artifact를 production에 배포하고, 모든 runtime write 경로가 guard를 통과하는지 확인하셔야 합니다. 이 단계에서 PostgreSQL을 source로 전환하지 않으며, 성공 write를 시도하지 않고 guard의 active failure를 검증합니다.

```bash
mise exec -- pnpm run prod:build
mise exec -- pnpm run prod:deploy
```

배포 후 인증된 test session으로 `/utils/pyroxene`와 `/utils/pyroxene/import`의 action-level 요청이 typed maintenance payload와 HTTP `503`을 반환하는지 확인하셔야 합니다. 단순히 maintenance key의 존재를 조회하거나 KV health만 확인해서는 freeze 또는 guard 검증으로 간주하지 않습니다. guard가 KV read timeout/error일 때도 fail-closed로 `503`을 반환하는지 확인하셔야 합니다.

Revision A gate는 다음 세 가지가 모두 참일 때만 통과합니다.

1. action-level mutation이 실제로 `503`이며 write/database mutation이 시작되지 않습니다.
2. KV read가 성공한 경우와 timeout/error인 경우 모두 의도한 guard 결과를 냅니다.
3. read-only Pyroxene 화면은 정상이며, 인증/세션/route error를 maintenance success로 오인하지 않습니다.

## 3. Freeze: action-level 503 확인 후에만 최종 snapshot

Revision A gate를 통과한 뒤에만 다음 maintenance key를 설정합니다. value 자체보다 runtime action의 결과가 기준입니다.

```bash
mise exec -- pnpm exec wrangler kv key put mollu:pyroxene-cutover:maintenance 1 --binding=KV_CACHE --env production
```

설정 직후 인증된 test session에서 실제 write action을 호출하여 HTTP `503`과 maintenance payload를 다시 확인하셔야 합니다. key만 설정하거나 KV health만 확인해서는 freeze로 간주하지 않습니다. action-level 503이 확인되지 않으면 최종 snapshot을 만들지 말고 guard를 재배포하거나 freeze 원인을 해결하셔야 합니다.

## 4. Final D1 snapshot

freeze의 action-level gate가 통과된 시점 이후에만 최종 snapshot을 생성합니다. snapshot 파일은 repository 밖의 protected temporary path에 두며, 기존 파일을 덮어쓰지 않습니다.

```bash
set -euo pipefail
umask 077

SNAPSHOT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mollulog-pyroxene-cutover.XXXXXX")"
SNAPSHOT="$SNAPSHOT_DIR/pyroxene.snapshot.json"
trap 'rm -f -- "$SNAPSHOT"; rmdir -- "$SNAPSHOT_DIR"' EXIT

mise exec -- node db/postgres/scripts/pyroxene-d1-collect.mjs \
  --database "$D1_DATABASE" \
  --env production \
  --output "$SNAPSHOT"
```

collector가 정확히 `mollulog.pyroxene.snapshot.v1`과 여섯 allowlisted table을 만들었는지, row count/last ID/physical uniqueness가 모두 검증되었는지 확인합니다. NUL-bearing guest receipt key의 raw 값도 snapshot에서 확인하되 terminal/log에 출력하지 않습니다.

## Freeze 후 최종 snapshot과 PostgreSQL import

freeze를 유지한 채 B1a migration을 먼저 적용하고, 같은 protected snapshot을 한 transaction으로 import합니다.

```bash
mise exec -- psql -X -v ON_ERROR_STOP=1 -f db/postgres/migrations/20260823000200_create_pyroxene_planner.sql
mise exec -- node db/postgres/scripts/pyroxene-transfer.mjs --snapshot "$SNAPSHOT"
```

transfer가 다음 gate를 모두 통과해야 합니다.

- typed temporary stage에 bounded chunks로 적재한 뒤 여섯 target을 transaction 안에서 replace합니다.
- 모든 target count가 snapshot count와 같고, source-minus-target 및 target-minus-source typed `EXCEPT` 결과가 0입니다.
- 모든 identity sequence가 `pg_get_serial_sequence($1, 'id')`로 resolve되고, 같은 transaction의 `ALTER SEQUENCE ... RESTART WITH`로 repaired 되어 explicit high ID 다음 generated ID가 예상대로 증가합니다. sequence 이름은 schema-qualified 또는 unqualified identifier인지 검증하고 각 component를 quote하며, missing/malformed/untrusted result는 fail closed 합니다.
- guest `item_key`는 raw D1 key가 아니라 정확한 v1 encoded key이며, parity 비교에서는 다시 raw 값으로 decode됩니다.
- statement timeout, transaction duration, PostgreSQL connection 수가 사전에 정한 connection budget 안입니다.

필요하면 다음 read-only query로 connection budget과 sequence 상태를 기록합니다. query 결과에 password나 snapshot 값을 포함하지 않습니다.

```bash
mise exec -- "${PG_PROBE[@]}" \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();"

mise exec -- psql -X -v ON_ERROR_STOP=1 -P pager=off -c \
  "SELECT table_name, pg_get_serial_sequence(quote_ident(table_name), 'id') FROM (VALUES
     ('pyroxene_owned_resources'),
     ('pyroxene_collected_sources'),
     ('pyroxene_timeline_items'),
     ('pyroxene_planner_options'),
     ('pyroxene_event_data'),
     ('pyroxene_guest_import_items')
   ) AS t(table_name);"
```

import, count, round-trip parity, sequence, timeout, connection budget 중 하나라도 실패하면 `COMMIT`하지 않습니다. `ROLLBACK` 결과를 확인하고 원본 PostgreSQL target이 partial state로 남지 않았는지 확인하셔야 합니다. column 또는 field mismatch가 있으면 성공으로 처리하지 않습니다.

## Revision B: PostgreSQL while freeze remains active

import과 모든 parity/sequence/connection gate가 통과한 뒤에도 freeze를 유지한 상태에서 Revision B를 배포합니다. build와 deploy는 승인된 clean main commit에서만 수행합니다.

```bash
mise exec -- pnpm run prod:build
mise exec -- pnpm run prod:deploy
```

배포 직후에는 write를 하지 말고 frozen read smoke만 실행합니다. Revision B는 freeze가 유지된 상태로 smoke합니다. read smoke는 PostgreSQL/Hyperdrive에서 representative Pyroxene state와 NUL receipt key를 정확히 읽는지, 여섯 table의 row/content count가 snapshot과 일치하는지 확인해야 합니다. read error를 빈 값이나 내부 ID로 대체해서는 안 됩니다.

## 7. Frozen read smoke hard gate

다음 gate를 모두 기록한 뒤에만 unfreeze할 수 있습니다.

- Revision B가 실제로 serving 중이고 guard가 여전히 활성입니다.
- read-only 요청이 PostgreSQL에서 응답하며 D1 fallback/source mode를 사용하지 않습니다.
- guest receipt의 raw `type\u0000key`가 public/in-memory identity로 복원됩니다.
- snapshot count, typed parity, sequence repair, connection budget 결과가 승인된 기록과 일치합니다.
- error/timeout 시 partial response 대신 명시적 failure와 안전한 retry/cancel 경로가 유지됩니다.

## 8. Unfreeze: 모든 gate 뒤에만 수행

frozen read smoke와 이전 hard gate가 모두 통과된 뒤에만 maintenance key를 삭제합니다.

```bash
mise exec -- pnpm exec wrangler kv key delete mollu:pyroxene-cutover:maintenance --binding=KV_CACHE --env production
```

삭제 후 KV health만 보지 말고, action-level guard가 해제되었음을 확인합니다. 해제 확인 전에는 write smoke를 실행하지 않습니다.

## 9. Successful write smoke

unfreeze 확인 후에 승인된 test account와 최소 하나의 reversible write만 사용하여 successful write smoke를 실행합니다. 이 단계는 실제 사용자 write를 가장하지 않으며, 성공 response, PostgreSQL row 변화, read-after-write 결과, duplicate/idempotency 결과를 모두 확인합니다. 성공 write를 시도하지 않고 통과시키는 방식은 허용하지 않습니다.

write smoke가 실패하면 즉시 freeze를 다시 켜고, 실패한 write의 transaction/result를 확인한 뒤 아래 rollback 규칙을 적용합니다.

## 10. Rollback과 failure behavior

Revision B를 unfreeze 뒤 Revision A로 되돌리면 PostgreSQL에서만 성공한 write가 사라질 수 있습니다. 즉, `Revision B -> A rollback`은 PostgreSQL-only writes를 잃을 수 있는 위험한 작업입니다. rollback 판단 전에 반드시 다시 freeze하고, unfreeze 이후 write 목록을 export/기록하여 D1과 reconcile할 계획을 승인받으셔야 합니다. re-freeze 및 reconcile 없이 rollback하지 않습니다.

어떤 단계에서든 실패하면 다음 순서를 지킵니다.

1. `mollu:pyroxene-cutover:maintenance`를 유지하거나 다시 설정합니다.
2. 실행 중인 import transaction의 `ROLLBACK`과 PostgreSQL target parity를 확인합니다.
3. guard-capable Revision B(또는 동등한 guard-only artifact)를 serving 상태로 복구합니다.
4. partial target state를 사용자에게 노출하지 않고, 원인/row count/sequence/connection 결과를 기록합니다.
5. rollback 또는 재시도 전에 승인된 reconcile plan을 준비합니다.

## 11. Revision C: guard cleanup

production write smoke가 성공하고, rollback window와 reconcile 결과가 승인된 뒤에만 Revision C를 시작합니다. Revision C runtime은 temporary guard key를 더 이상 읽지 않으므로, 먼저 temporary guard와 transfer tooling/scripts/tests를 제거하고 검증합니다. 다음 정리 명령은 그 시점의 승인된 clean branch에서만 실행하는 예시이며, B1b 작업 중에는 실행하지 않습니다.

```bash
git rm app/domain/pyroxene-cutover.ts \
  app/lib/pyroxene-cutover.server.ts \
  db/postgres/scripts/pyroxene-d1-collect.mjs \
  db/postgres/scripts/pyroxene-d1-collect.test.mjs \
  db/postgres/scripts/pyroxene-transfer.mjs \
  db/postgres/scripts/pyroxene-transfer.test.mjs \
  test/db/pyroxene-cutover.test.ts
```

Revision C에서 guard cleanup이 확인된 뒤에도 D1 binding/table deletion과 PostgreSQL cleanup은 별도의 authorized change입니다. 그 작업을 같은 cutover 명령에 섞지 않습니다.

## 완료 기록

각 gate의 실행 시각, 승인 commit, snapshot format/count/last ID, parity 결과, sequence 결과, connection budget, freeze/unfreeze action-level response, read smoke, write smoke, rollback/reconcile 판단을 기록합니다. 이 B1b 구현 작업에서는 위 명령을 실행하지 않았으며, production 완료나 migration 완료를 주장하지 않습니다.

```bash
unset PGPASSWORD PGUSER PGDATABASE PGPORT PGHOST POSTGRES_ITEM D1_DATABASE PGSSLMODE REHEARSAL_PGSSLMODE
```
