# OCR control plane 운영

재화 스크린샷 원본은 R2에 임시 저장하고, OCR 상태와 결과는 Hyperdrive 뒤 PostgreSQL에
저장합니다. M1 Max k3s runner는 PostgreSQL에 직접 접속하지 않으며 Cloudflare Queue REST,
R2 presigned GET, MolluLog machine API만 outbound HTTPS로 호출합니다.

`ocr_jobs`, `ocr_images`, `ocr_attempts`, `ocr_image_results`, `ocr_job_results`, `ocr_outbox`는
모두 PostgreSQL 테이블입니다. 사용자가 결과를 보정한 뒤 만드는 `sync_drafts`만 기존
MolluLog 승인 흐름과의 호환을 위해 현재 D1 저장 경로를 그대로 사용합니다.

## 배포 전 준비

1. `db/postgres/migrations/20260720000100_create_ocr_control_plane.sql`을 대상 PostgreSQL에
   적용합니다.
2. 환경별 R2 bucket과 task/DLQ Queue를 생성합니다.
3. task Queue에 HTTP pull consumer를 연결하고 DLQ와 retry를 지정합니다.
4. R2 S3 API credential, machine API token, Queue token을 각각 별도로 발급합니다.
5. MolluLog Worker secrets와 k3s Secret을 설정한 뒤 배포합니다.

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

## 실행 계약

1. 브라우저가 `/api/ocr/jobs`에서 object별 presigned PUT URL을 받습니다.
2. R2 직접 업로드 뒤 `/api/ocr/jobs/:jobUid/submit`을 호출합니다.
3. PostgreSQL transaction이 image 상태와 outbox event를 함께 기록합니다.
4. scheduled dispatcher가 outbox를 Queue에 보냅니다.
5. runner가 `batch_size=1`로 pull하고 `/internal/ocr/v1/tasks/:taskUid/claim`을 호출합니다.
6. 결과 API가 PostgreSQL commit을 완료한 뒤 runner가 Queue lease를 ack합니다.
7. 모든 image가 terminal이면 별도 finalize task가 batch 조정 결과를 만듭니다.
8. 사용자가 결과를 보정하면 `first_party_ocr` sync draft를 만들고 기존 diff 화면에서
   승인합니다.

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
