# OCR control plane 운영

재화 스크린샷 원본은 R2에 임시 저장하고, OCR 상태와 결과는 Hyperdrive 뒤 PostgreSQL에
저장합니다. M1 Max k3s runner는 PostgreSQL에 직접 접속하지 않으며 Cloudflare Queue REST,
R2 presigned GET, MolluLog machine API만 outbound HTTPS로 호출합니다.

`ocr_jobs`, `ocr_images`, `ocr_attempts`, `ocr_image_results`, `ocr_job_results`, `ocr_outbox`는
모두 PostgreSQL 테이블입니다. 사용자가 결과를 보정해 반영할 때 생성되는 `sync_drafts`와
실제 아이템 보유 수량은 D1에 저장합니다. OCR job UID를 draft의 `sourceRef`로 기록해 같은
결과가 중복 반영되지 않도록 합니다.

## 배포 전 준비

1. `db/postgres/migrations/`의 SQL migration을 파일명 순서대로 대상 PostgreSQL에 적용합니다.
2. 환경별 R2 bucket과 task/DLQ Queue를 생성합니다.
3. task Queue에 HTTP pull consumer를 연결하고 DLQ와 retry를 지정합니다.
4. R2 S3 API credential, machine API token, Queue token을 각각 별도로 발급합니다.
5. MolluLog Worker secrets와 k3s Secret을 설정한 뒤 배포합니다.
6. OCR 원본 삭제의 backstop으로 bucket의 `ocr/` prefix에 10일 lifecycle rule을 설정합니다.

예시 명령은 staging 기준입니다.

```sh
wrangler r2 bucket create mollulog-aoi-uploads-staging
wrangler queues create mollulog-aoi-tasks-staging
wrangler queues create mollulog-aoi-dlq-staging
wrangler queues consumer http add mollulog-aoi-tasks-staging \
  --batch-size 1 \
  --visibility-timeout-secs 300 \
  --message-retries 5 \
  --retry-delay-secs 5 \
  --dead-letter-queue mollulog-aoi-dlq-staging
wrangler r2 bucket cors set mollulog-aoi-uploads-staging \
  --file deploy/cloudflare/ocr-r2-cors.json
wrangler r2 bucket lifecycle add OCR_BUCKET_NAME \
  "Expire OCR images after grace period" "ocr/" --expire-days 10
```

HTTP pull consumer는 Wrangler 설정 파일에서 활성화할 수 없으므로 위 명령 또는 Dashboard를
사용합니다. DLQ는 `wrangler.jsonc`에서 MolluLog Worker의 push consumer로 연결됩니다.

MolluLog Worker secrets:

- `OCR_R2_ACCOUNT_ID`
- `OCR_R2_ACCESS_KEY_ID`
- `OCR_R2_SECRET_ACCESS_KEY`
- `OCR_WORKER_TOKEN`

k3s runner secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_QUEUE_ID`
- `CLOUDFLARE_QUEUE_TOKEN` (`queues#read`, `queues#write`)
- `MOLLULOG_API_URL`
- `MOLLULOG_WORKER_TOKEN` (Worker의 `OCR_WORKER_TOKEN`과 같은 값)

Queue token과 MolluLog machine token은 서로 다른 credential입니다. runner에는 R2 API
credential이나 PostgreSQL connection string을 넣지 않습니다.

## 로컬 E2E

로컬 MolluLog와 로컬 PostgreSQL을 사용하면서 R2와 Queue만 개발 전용 원격 리소스에
연결합니다. 브라우저 직접 업로드와 외부 AOI runner의 HTTP pull 계약을 production과 같은
경로로 확인하기 위한 구성입니다.

- R2 bucket: `mollulog-aoi-uploads-dev`
- task Queue: `mollulog-aoi-tasks-dev`
- DLQ: `mollulog-aoi-dlq-dev`
- 개발용 R2 CORS: `deploy/cloudflare/ocr-r2-cors.dev.json`

기본 `wrangler.jsonc`의 `OCR_UPLOADS`는 `remote: true`로 위 R2 bucket에 연결합니다.
Wrangler 4.107.0은 Queue producer의 `remote: true`를 무시하고 로컬 broker로 보내므로,
로컬 E2E의 `OCR_TASKS` publish만 `OCR_QUEUE_API_URL`과 Queue REST API를 사용합니다.
staging과 production은 기존 Queue binding을 사용합니다. D1과 KV는 로컬 simulation을 유지하고, Hyperdrive는
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`로 로컬 PostgreSQL에 직접
연결합니다.

로컬 `.dev.vars`에는 다음 값을 설정합니다.

- `OCR_R2_ACCOUNT_ID`
- `OCR_R2_ACCESS_KEY_ID`
- `OCR_R2_SECRET_ACCESS_KEY`
- `OCR_QUEUE_API_URL` (`mollulog-aoi-tasks-dev`의 Queue REST endpoint)
- `OCR_QUEUE_API_TOKEN` (AOI runner와 동일한 Queues Edit token)
- `OCR_WORKER_TOKEN`

AOI의 `.env.runner`에는 개발 Queue의 account/queue/token, 로컬 MolluLog URL, 동일한
`OCR_WORKER_TOKEN`을 설정합니다. 이미지를 제출한 뒤 로컬 scheduled handler를 호출해
image task를 publish하고, 이미지 처리가 끝나면 다시 호출해 finalize task를 publish합니다.

```sh
curl "http://localhost:5173/cdn-cgi/handler/scheduled?format=json"
```

## 실행 계약

1. 브라우저가 `/api/ocr/jobs`에서 object별 presigned PUT URL을 받습니다.
2. R2 직접 업로드 뒤 `/api/ocr/jobs/:jobUid/submit`을 호출합니다.
3. PostgreSQL transaction이 image 상태와 outbox event를 함께 기록합니다.
4. scheduled dispatcher가 outbox를 Queue에 보냅니다.
5. runner가 `batch_size=1`로 pull하고 `/internal/ocr/v1/tasks/:taskUid/claim`을 호출합니다.
6. 결과 API가 PostgreSQL commit을 완료한 뒤 runner가 Queue lease를 ack합니다.
7. 모든 image가 terminal이면 별도 finalize task가 batch 조정 결과를 만듭니다.
8. 스캐너가 D1의 현재 수량과 인식 수량을 함께 보여주며, 사용자가 확인한 항목은
   `first_party_ocr` sync draft 생성과 아이템 수량 반영을 하나의 D1 batch로 처리합니다.

Queue 전달은 at-least-once입니다. `(image_uid, generation)`과 `(job_uid, generation)` unique
constraint가 결과 저장을 멱등하게 만들며, outbox 재전송도 안정된 task UID로 수렴합니다.

## 확인할 지표

- Queue backlog와 oldest age
- job queue wait / time-to-ready
- image 처리시간 P50/P95
- retry와 DLQ 비율
- outbox pending/publishing age
- result commit 실패
- 인식 `unknown`/`conflict` 비율

초기 UI는 job 상태를 polling합니다. runner가 중단돼도 job은 Queue에서 대기하며, 다시 기동한
replica가 같은 계약으로 처리를 재개합니다.

submit된 원본 스크린샷과 인식 결과는 7일 동안 `/scanner/resource`의 최근 인식 목록에 노출합니다.
7일이 지난 job은 목록에서 숨기되 이미 결과를 열어 둔 사용자를 위해 3일의 grace period 동안
직접 조회·검토·반영을 허용합니다. 매분 실행되는 application Worker의 scheduled handler는 총 10일이
지난 R2 object를 먼저 삭제한 뒤 관련 PostgreSQL job, result, outbox, attempt 레코드를 정리합니다.
R2 lifecycle rule은 application cleanup이 실패했을 때의 backstop입니다. 원본, crop, overlay 등 이미지
artifact에는 같은 삭제 기한을 적용합니다. 생성 후 submit하지 않은 upload session은 15분 뒤 정리합니다.

사용자별 업로드 제한은 PostgreSQL의 `ocr_jobs`를 기준으로 rolling 7일 동안 30장입니다. submit된
이미지와 아직 15분 upload session이 살아 있는 예약분을 함께 세며, job 생성 transaction에서 사용자별
advisory lock을 사용해 동시 요청의 quota 초과를 막습니다. 학습 동의 여부는 PostgreSQL에만 기록하고
R2 object key 구조에는 반영하지 않습니다.
