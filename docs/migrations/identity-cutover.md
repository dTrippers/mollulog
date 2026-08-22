# Identity PostgreSQL cutover runbook

이 문서는 identity 6개 테이블의 production cutover 전에 로컬에서 준비 상태를 확인하기 위한 runbook입니다. 이 저장소의 구현은 direct cutover를 전제로 하며 source mode, live fallback, 장기 dual-write를 사용하지 않습니다.

## 대상 범위

다음 테이블만 snapshot/import 대상입니다.

`senseis`, `auth_identities`, `passkeys`, `pending_sensei_registrations`, `sensei_privacies`, `followerships`

PostgreSQL migration은 `db/postgres/migrations/20260822000200_create_identity.sql`입니다. application FK는 이번 cutover의 hard gate가 아니며, 미완료 `user_id` 고아 검사는 별도 production gate입니다.

## 사전 확인

1. `mise exec -- ./node_modules/.bin/react-router typegen`과 `mise exec -- ./node_modules/.bin/tsc`가 통과하는지 확인합니다.
2. PostgreSQL migration을 적용할 대상이 비어 있거나 이번 import로 완전히 덮어쓸 수 있는지 확인합니다.
3. connection pool 지표와 PostgreSQL `user_id` 고아 검사를 별도 hard gate로 확인합니다.
4. maintenance KV key `mollu:identity-cutover:maintenance`를 준비합니다. key가 존재하는 동안 로그인·가입·프로필/privacy·계정 연동·팔로우·passkey 쓰기가 `503`으로 차단되고 읽기와 기존 세션은 유지됩니다.

## Rehearsal과 authoritative cutover

rehearsal에서는 maintenance 없이 snapshot/import/parity 절차를 반복할 수 있습니다. rehearsal 결과는 운영 원본으로 사용하지 않으며, 쓰기가 계속될 수 있으므로 최종 cutover의 snapshot을 대신하지 않습니다.

authoritative cutover의 순서는 반드시 다음과 같습니다.

1. maintenance KV key를 설정하고 KV에서 값을 읽어 freeze가 활성화됐는지 확인합니다. 이 시점부터 대상 쓰기는 `503`, `Retry-After`, `Cache-Control: no-store`를 반환하고 읽기와 기존 세션은 유지합니다.
2. freeze가 확인된 뒤 D1에서 최종 snapshot을 수집합니다.
3. 해당 snapshot을 한 transaction으로 import하고 parity, sequence, connection pool 지표 및 별도 `user_id` 고아 검사를 확인합니다.
4. 모든 hard gate가 통과하면 배포와 smoke test를 진행합니다.
5. smoke test가 통과한 뒤 maintenance key를 제거하고 대상 쓰기가 정상화됐는지 확인합니다.

import나 검증이 실패하면 transaction rollback을 확인하고 maintenance를 유지(또는 즉시 다시 활성화)한 채 원인을 수정한 뒤 재시도합니다. 실패한 import를 부분 상태로 운영에 노출하지 않습니다.

`KV_CACHE`의 maintenance key 조회 오류와 timeout은 의도적으로 fail-closed 처리합니다. guard는 조회에 실패해도 freeze가 활성화된 것으로 보고 대상 identity write에 동일한 `503`, `Retry-After`, `Cache-Control: no-store`와 사용자 안내를 반환합니다. 이는 authoritative freeze 중 D1 최종 snapshot 이후 write가 통과해 데이터가 유실되는 위험을 availability 저하보다 우선해 막기 위한 정책입니다. maintenance 밖에서도 KV read 장애가 복구될 때까지 대상 write가 잠시 차단될 수 있지만 읽기와 기존 세션은 유지됩니다. cutover 전에 KV read health와 latency를 확인하고, freeze를 설정한 뒤와 snapshot/import 중에도 KV health를 계속 확인합니다. KV health가 확인되지 않으면 final snapshot/import 또는 freeze 해제를 진행하지 않습니다.

## D1 snapshot

`db/postgres/scripts/identity-d1-collect.mjs`는 allowlist 6개 테이블을 `id` keyset(`id > lastId`, `ORDER BY id`, 최대 500행)으로 읽습니다.

```sh
umask 077
SNAPSHOT_PATH="$(mktemp -u /private/tmp/mollulog-identity-snapshot.XXXXXX.json)"
mise exec -- node db/postgres/scripts/identity-d1-collect.mjs \
  --database "$D1_DATABASE" \
  --output "$SNAPSHOT_PATH" \
  --page-size 500
```

snapshot에는 `mollulog.identity.snapshot.v1`, 각 테이블의 raw D1 rows, 마지막 ID와 row count가 기록됩니다. collector는 출력 파일을 `0600`으로 exclusive 생성하며 이미 존재하는 경로를 덮어쓰지 않습니다. snapshot에는 username, auth identity, pending registration, passkey 정보가 포함되므로 repo 밖의 보호된 경로를 사용하고 `umask 077`을 유지합니다. 검증과 import가 끝나면 권한을 확인한 뒤 안전하게 삭제합니다. `wrangler d1 export`는 사용하지 않습니다. 특히 `pending_sensei_registrations`의 469행은 삭제하거나 필터링하지 않고 전부 snapshot에 포함되어야 합니다.

## PostgreSQL import과 parity

migration 적용 후 snapshot을 한 transaction으로 import합니다. import는 대상 테이블을 비우고 ID·UTC timestamp를 그대로 넣은 뒤 각 identity sequence를 보정합니다.

```sh
TARGET_PG_URL="$TARGET_PG_URL" mise exec -- node \
  db/postgres/scripts/identity-transfer.mjs \
  --snapshot "$SNAPSHOT_PATH"
```

각 테이블은 typed canonical parity를 확인합니다. `senseis.active`의 D1 `0/1`과 PostgreSQL boolean은 같은 값으로 비교하고 timestamp는 UTC ISO 값으로 비교합니다. parity 불일치, 누락, 추가 행, ID 중복 또는 import 오류가 발생하면 transaction을 rollback하고 cutover를 중단합니다. sequence 보정은 `MAX(id)` 기준으로 수행되며, 원본 ID를 재생성하지 않습니다.

## 계약 확인과 cutover 전환

1. identity migration, repository, community JOIN visibility, passkey/followership, maintenance guard 계약 테스트를 실행합니다.
2. private author는 목록에서 제외되고 본인은 자신의 private 데이터에 접근하는지 확인합니다.
3. Google/GitHub 로그인·가입·연동, passkey 등록·인증/counter, 프로필/privacy, follow 멱등성을 확인합니다.
4. authoritative cutover에서는 위 순서대로 maintenance 활성화 후 최종 snapshot/import를 수행하고, parity와 hard gate가 모두 통과한 뒤에만 배포와 smoke test를 진행합니다.
5. smoke test가 통과한 뒤 maintenance key를 제거하고 대상 쓰기가 정상화되는지 확인합니다. 실패 시 key를 유지하거나 다시 활성화합니다.

운영 PostgreSQL 연결, Cloudflare/KV mutation, 배포, D1 table rename/freeze cleanup은 이 로컬 준비 단계에 포함되지 않습니다.
