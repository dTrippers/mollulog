import { MinusCircleIcon } from "@heroicons/react/24/outline";
import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { SectionCard, SubTitle } from "~/components/primitives";
import {
  CodeBlock,
  CopyTextButton,
  DataTable,
  DeveloperPage,
  EndpointRow,
  TableCell,
  TableHeader,
} from "./developers._components/DeveloperPage";

export const meta: MetaFunction = () => [{ title: "API 문서 | 몰루로그" }];

const apiBaseUrl = "https://api.mollulog.net/v1";

const fields: Array<{ fields: string[]; meaning: string; range: string; nullable: boolean; detail?: string }> = [
  { fields: ["tier"], meaning: "학생 성급", range: "1–5", nullable: false, detail: "등록할 때 필요" },
  {
    fields: ["weaponTier"],
    meaning: "고유무기 성급",
    range: "0–4",
    nullable: false,
    detail: "0은 고유무기 없음 · 1 이상은 성급 5 필요 · 등록할 때 필요",
  },
  { fields: ["level"], meaning: "학생 Lv", range: "1–90", nullable: true },
  { fields: ["skillEx"], meaning: "EX 스킬", range: "1–5", nullable: true },
  { fields: ["skillNormal"], meaning: "기본 스킬", range: "1–10", nullable: true },
  { fields: ["skillEnhanced"], meaning: "강화 스킬", range: "1–10", nullable: true },
  { fields: ["skillSub"], meaning: "서브 스킬", range: "1–10", nullable: true },
  { fields: ["equip1"], meaning: "장비1", range: "1–10", nullable: true },
  { fields: ["equip2"], meaning: "장비2", range: "1–10", nullable: true },
  { fields: ["equip3"], meaning: "장비3", range: "1–10", nullable: true },
  { fields: ["equip1Level"], meaning: "장비1 레벨", range: "1–70", nullable: true },
  { fields: ["equip2Level"], meaning: "장비2 레벨", range: "1–70", nullable: true },
  { fields: ["equip3Level"], meaning: "장비3 레벨", range: "1–70", nullable: true },
  { fields: ["equipSpecial"], meaning: "애용품", range: "1–2", nullable: true },
  {
    fields: ["weaponLevel"],
    meaning: "고유무기 Lv",
    range: "0–60",
    nullable: true,
    detail: "고유무기 성급에 따라 최대값이 달라요",
  },
  { fields: ["abilityHp"], meaning: "HP 해방", range: "0–25", nullable: true, detail: "1 이상은 고유무기가 있을 때만" },
  {
    fields: ["abilityAtk"],
    meaning: "공격력 해방",
    range: "0–25",
    nullable: true,
    detail: "1 이상은 고유무기가 있을 때만",
  },
  {
    fields: ["abilityHeal"],
    meaning: "치유력 해방",
    range: "0–25",
    nullable: true,
    detail: "1 이상은 고유무기가 있을 때만",
  },
  { fields: ["bond"], meaning: "인연 랭크", range: "1–100", nullable: true },
  { fields: ["bondExp"], meaning: "누적 경험치", range: "0 이상", nullable: true, detail: "인연 랭크와 맞아야 해요" },
];

const errors = [
  ["400", "잘못된 요청", "입력 형식·필드·성장도 조합을 확인해주세요"],
  ["401", "인증 실패", "Bearer 키가 없거나 유효하지 않거나 만료·폐기됐어요"],
  ["403", "요청할 수 없음", "키 권한 또는 계정 상태를 확인해주세요"],
  ["404", "찾을 수 없음", "학생 또는 모집 기록을 찾을 수 없어요"],
  ["409", "등록 충돌", "이미 등록한 학생이에요"],
  ["405", "지원하지 않는 요청", "해당 경로에서 사용할 수 없는 메서드예요"],
  ["415", "지원하지 않는 형식", "쓰기 요청의 Content-Type은 application/json이어야 해요"],
  ["413", "본문이 너무 큼", "요청 본문은 최대 1MiB예요"],
  ["429", "요청 한도 초과", "Retry-After를 확인한 뒤 기다려주세요"],
  ["500", "서버 오류", "잠시 후 다시 시도해주세요"],
  ["503", "API 사용 준비 중", "계정이나 요청 제한 기능을 확인할 수 없어요"],
];

export default function DevelopersDocs() {
  return (
    <DeveloperPage>
      <div className="space-y-6">
        <header>
          <SubTitle text="API 문서" />
        </header>

        <SectionCard title="연결">
          <dl className="grid grid-cols-1 items-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="text-muted-foreground sm:pt-2">Base URL</dt>
            <dd className="flex min-w-0 items-center justify-between gap-2 font-mono text-sm">
              <code className="min-w-0 break-all">{apiBaseUrl}</code>
              <CopyTextButton value={apiBaseUrl} variant="icon" label="Base URL 복사" />
            </dd>
            <dt className="text-muted-foreground sm:pt-2">인증</dt>
            <dd>
              <div className="flex items-start justify-between gap-2">
                <code className="break-all">Authorization: Bearer &lt;API 키&gt;</code>
                <CopyTextButton value="Authorization: Bearer <API 키>" variant="icon" label="인증 헤더 복사" />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">브라우저 쿠키로는 인증되지 않아요</p>
            </dd>
            <dt className="text-muted-foreground sm:pt-2">권한</dt>
            <dd>
              <p>
                학생 읽기 · 학생 쓰기 <span className="text-muted-foreground">— 키를 발급할 때 따로 골라요</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">쓰기 권한만 있는 키로는 조회할 수 없어요</p>
              <Link
                to="/developers/keys"
                className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
              >
                API 키
              </Link>
            </dd>
          </dl>
        </SectionCard>

        <SectionCard title="엔드포인트">
          <EndpointGroup title="학생 읽기 권한">
            <EndpointRow method="GET" path="/students?query=" summary="학생 찾기" initiallyOpen>
              <ParameterTable
                rows={[
                  ["query", "학생 UID 또는 이름 검색어 (1–200자)"],
                  ["limit", "기본 50 · 최대 100"],
                  ["cursor", "다음 페이지에 받은 nextCursor"],
                ]}
              />
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request GET --url '${apiBaseUrl}/students?query=호시노' --header 'Authorization: Bearer <API_KEY>' --header 'Accept: application/json'`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                응답: <code>students</code>(UID·이름)와 <code>nextCursor</code>
              </p>
            </EndpointRow>
            <EndpointRow method="GET" path="/me/students" summary="내 모집 학생 현재 상태">
              <ParameterTable
                rows={[
                  ["limit", "기본 50 · 최대 100"],
                  ["cursor", "다음 페이지에 받은 nextCursor"],
                ]}
              />
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request GET --url '${apiBaseUrl}/me/students?limit=50&cursor=<CURSOR>' --header 'Authorization: Bearer <API_KEY>' --header 'Accept: application/json'`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                응답: 현재 상태 목록 · 필드는 아래 표 · 개인 응답은 캐시되지 않아요
              </p>
            </EndpointRow>
            <EndpointRow method="GET" path="/me/students/:studentUid" summary="한 명의 현재 상태">
              <ParameterTable rows={[["studentUid", "학생 찾기로 얻은 UID"]]} />
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request GET --url '${apiBaseUrl}/me/students/10000' --header 'Authorization: Bearer <API_KEY>' --header 'Accept: application/json'`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">모집하지 않은 학생은 404</p>
            </EndpointRow>
          </EndpointGroup>

          <EndpointGroup title="학생 쓰기 권한 · 요청 하나에 학생 한 명">
            <EndpointRow method="POST" path="/me/students" summary="모집 학생 한 명 등록">
              <p className="text-sm">
                <code>studentUid</code>, <code>tier</code>, <code>weaponTier</code>는 꼭 보내야 해요. 처음 등록할 때
                보내지 않은 필드는 비워 두고, 이미 기록된 값은 보존해요.
              </p>
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request POST --url '${apiBaseUrl}/me/students' --header 'Authorization: Bearer <API_KEY>' --header 'Content-Type: application/json' --data '{"studentUid":"10000","tier":5,"weaponTier":4,"level":90}'`}
              </CodeBlock>
              <CodeBlock label="응답 201" tone="card">
                {`{"studentUid":"10000"}`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                응답의 <code>studentUid</code>는 대표 UID예요 · 읽기 권한도 있는 키는 현재 상태 필드도 함께 반환해요 ·
                이미 등록된 학생이면 409 · 배열과 upsert는 받지 않아요
              </p>
            </EndpointRow>
            <EndpointRow method="PATCH" path="/me/students/:studentUid" summary="한 명의 보낸 값만 수정">
              <ParameterTable rows={[["studentUid", "학생 찾기로 얻은 UID"]]} />
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request PATCH --url '${apiBaseUrl}/me/students/10000' --header 'Authorization: Bearer <API_KEY>' --header 'Content-Type: application/json' --data '{"level":90,"bond":20}'`}
              </CodeBlock>
              <CodeBlock label="응답 200" tone="card">
                {`{"studentUid":"10000"}`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                보낸 필드만 바뀌어요 · 쓰기 권한만 있으면 대표 <code>studentUid</code>를 반환하고, 읽기 권한도 있으면
                현재 상태 필드를 함께 반환해요 · 빈 객체나 모르는 필드는 400 · 미등록 학생은 404
              </p>
            </EndpointRow>
            <EndpointRow method="DELETE" path="/me/students/:studentUid" summary="한 명의 현재 상태 삭제">
              <ParameterTable rows={[["studentUid", "학생 찾기로 얻은 UID"]]} />
              <CodeBlock label="요청 예시" tone="card" copyable>
                {`curl --request DELETE --url '${apiBaseUrl}/me/students/10000' --header 'Authorization: Bearer <API_KEY>'`}
              </CodeBlock>
              <CodeBlock label="응답 200" tone="card">
                {`{"studentUid":"10000","deleted":true}`}
              </CodeBlock>
              <p className="text-sm text-muted-foreground">
                모집 등록, 현재 성장도, 인연·경험치만 지워요 · 육성 목표, 선물 계획, 플래너는 남아요
              </p>
            </EndpointRow>
          </EndpointGroup>
          <p className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
            <MinusCircleIcon className="size-4 shrink-0" aria-hidden="true" /> 육성 목표·선물 계획을 다루는 엔드포인트는
            없어요
          </p>
        </SectionCard>

        <SectionCard title="학생 상태 필드">
          <DataTable label="API 학생 상태 필드와 허용 범위">
            <TableHeader columns={["필드", "의미", "범위", "null로 비우기"]} />
            <tbody>
              {fields.map(({ fields: fieldNames, meaning, range, nullable, detail }) => (
                <tr className="border-t border-border" key={fieldNames[0]}>
                  <TableCell firstColumn>
                    {fieldNames.map((field) => (
                      <code className="block whitespace-nowrap font-mono text-sm" key={field}>
                        {field}
                      </code>
                    ))}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap">{meaning}</span>
                    {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{range}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {nullable ? "가능" : "불가"}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <ul className="space-y-2 text-sm">
            <RuleItem>
              수정할 때 보내지 않은 필드는 그대로예요 · 인연 랭크가 바뀌어 누적 경험치와 맞지 않으면 경험치는 비워져요
            </RuleItem>
            <RuleItem>등록할 때 처음 저장하는 필드를 보내지 않으면 비어 있어요 · 기본값을 대신 넣지 않아요</RuleItem>
            <RuleItem>모집을 취소하려면 DELETE, 고유무기가 없으면 weaponTier 0을 보내주세요</RuleItem>
            <RuleItem>결과 상태가 규칙에 맞지 않으면 요청 전체가 거부돼요 · 다른 값을 대신 고치지 않아요</RuleItem>
          </ul>
        </SectionCard>

        <SectionCard title="오류">
          <DataTable label="API 오류 상태와 설명">
            <TableHeader columns={["상태", "의미"]} />
            <tbody>
              {errors.map(([status, title, detail]) => (
                <tr className="border-t border-border" key={status}>
                  <TableCell firstColumn className="w-14 whitespace-nowrap font-mono font-semibold">
                    {status}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{title}</span>
                    <span className="text-muted-foreground"> · {detail}</span>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <CodeBlock label="오류 응답 예시" copyable>
            {`{
  "error": {
    "code": "invalid_input",
    "message": "요청 내용을 확인해주세요.",
    "fields": [{ "field": "level", "message": "1부터 90 사이여야 해요." }]
  }
}`}
          </CodeBlock>
          <p className="text-sm text-muted-foreground">
            <code>code</code>는 바뀌지 않는 식별자, <code>message</code>는 사람이 읽는 설명, <code>fields</code>는
            문제가 된 필드 정보예요
          </p>
        </SectionCard>

        <SectionCard title="제한과 규칙">
          <dl className="grid grid-cols-1 items-start gap-x-4 gap-y-3 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
            <dt className="leading-7 text-muted-foreground">읽기 한도</dt>
            <dd>
              분당 60회<span className="mt-0.5 block text-xs text-muted-foreground">계정별 · 지역별로 따로 세요</span>
            </dd>
            <dt className="leading-7 text-muted-foreground">쓰기 한도</dt>
            <dd>
              10분에 500회 · 계정 전체 기준
              <span className="mt-0.5 block text-xs text-muted-foreground">
                모든 키와 지역을 합쳐 세요 · 첫 쓰기 요청부터 10분을 세고, 끝나면 다음 쓰기 요청에서 새로 시작해요
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                쓰기 권한으로 인증된 요청은 결과와 관계없이 1회로 세요 · 인증·권한 실패와 429는 세지 않아요
              </span>
            </dd>
            <dt className="leading-7 text-muted-foreground">요청 크기</dt>
            <dd>본문 최대 1MiB</dd>
            <dt className="leading-7 text-muted-foreground">쓰기 단위</dt>
            <dd>
              요청 하나에 학생 한 명 · 배열은 받지 않아요
              <span className="mt-0.5 block text-xs text-muted-foreground">요청마다 따로 성공하거나 실패해요</span>
            </dd>
            <dt className="leading-7 text-muted-foreground">학생 UID</dt>
            <dd>
              학생 찾기로 얻은 UID를 써요
              <span className="mt-0.5 block text-xs text-muted-foreground">
                다른 전투 형태의 UID를 보내도 대표 UID로 처리돼요 · 따로 모집되는 형태는 서로 다른 학생이에요
              </span>
            </dd>
            <dt className="leading-7 text-muted-foreground">키 유효 기간</dt>
            <dd>발급 후 3개월 · 만료·폐기된 키는 401</dd>
            <dt className="leading-7 text-muted-foreground">재시도</dt>
            <dd>
              같은 요청을 다시 보내면 다시 처리돼요
              <span className="mt-0.5 block text-xs text-muted-foreground">
                결과를 알 수 없으면 읽기 권한 키로 GET하거나 웹사이트에서 현재 상태를 확인한 뒤 다시 보내주세요
              </span>
            </dd>
            <dt className="leading-7 text-muted-foreground">캐시</dt>
            <dd>개인 데이터 응답은 저장(캐시)되지 않아요</dd>
          </dl>
        </SectionCard>
      </div>
    </DeveloperPage>
  );
}

function EndpointGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ParameterTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold text-muted-foreground">
          <th className="pb-1 pr-3" scope="col">
            파라미터
          </th>
          <th className="pb-1" scope="col">
            설명
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, description]) => (
          <tr key={name}>
            <th className="py-1 pr-3 text-left font-mono font-normal" scope="row">
              {name}
            </th>
            <td className="py-1 text-muted-foreground">{description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RuleItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
