import {
  FunnelIcon,
  IdentificationIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useFetcher, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  getFilteredStudentUids,
  StudentCards,
  StudentFilter,
  TierSelector,
  usePersistentStudentFilterState,
} from "~/components/features/students";
import { readStudentFilterStateFromCookie } from "~/components/features/students/student-filter-cookie";
import { Button, SubTitle, Toggle } from "~/components/primitives";
import { captureServerError, getLogger } from "~/lib/observability.server";
import {
  addRecruitedStudents,
  getRecruitedStudents,
  MAX_RECRUITED_STUDENT_BATCH_SIZE,
  type RecruitedStudentBatchInput,
  RecruitedStudentValidationError,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { getAllStudents, getAllStudentsMap } from "~/models/student";
import { getRouteSensei } from "./$username._components/route-sensei.server";

export const USER_STUDENT_FILTER_COOKIE_NAME = "mollulog_user_students_filter";
export const USER_STUDENT_FILTER_COOKIE_PATH = "/";
export const USER_STUDENT_FILTER_SORTS = ["recent", "old", "name", "tier"] as const;

const userStudentFilterCookieOptions = {
  cookieName: USER_STUDENT_FILTER_COOKIE_NAME,
  cookiePath: USER_STUDENT_FILTER_COOKIE_PATH,
  defaultSort: "recent",
  allowedSorts: USER_STUDENT_FILTER_SORTS,
} as const;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);

  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const recruitedStudents = await getRecruitedStudents(env, sensei.id);
  const recruitedStudentTiers = recruitedStudents.reduce(
    (acc, { studentUid, tier }) => {
      acc[studentUid] = tier;
      return acc;
    },
    {} as Record<string, number>,
  );

  const allStudents = await getAllStudents(env);
  return {
    me: currentUser?.username === sensei.username,
    noRecruited: recruitedStudents.length === 0,
    filterState: readStudentFilterStateFromCookie(request.headers.get("Cookie"), userStudentFilterCookieOptions),
    students: allStudents.map((student) => ({
      uid: student.uid,
      name: student.name,
      attackType: student.attackType,
      defenseType: student.defenseType,
      role: student.role,
      position: student.position,
      tacticRole: student.tacticRole,
      order: student.order,
      initialTier: student.initialTier,
      tier: recruitedStudentTiers[student.uid] ?? null,
    })),
  };
};

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 학생부 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

const BATCH_ADD_INTENT = "batch-add";
const BATCH_INVALID_ERROR = "학생 일괄 등록 요청이 올바르지 않아요";
const EMPTY_BATCH_ERROR = "등록할 학생을 선택해 주세요";
const LOGIN_REQUIRED_ERROR = "로그인이 필요해요";
const FORBIDDEN_ERROR = "본인 학생부만 수정할 수 있어요";
const STUDENT_REQUIRED_ERROR = "학생 정보가 필요해요";
const STUDENT_NOT_FOUND_ERROR = "존재하지 않는 학생이에요";
const STUDENT_CATALOG_ERROR = "학생 목록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요";
const STUDENT_WRITE_ERROR = "학생 등록에 실패했어요. 잠시 후 다시 시도해 주세요";
const SINGLE_TIER_INVALID_ERROR = "성급 범위가 올바르지 않아요";
const METHOD_NOT_ALLOWED_ERROR = "지원하지 않는 요청 방식이에요";

type BatchActionResult = { success: true } | { error: string };

function parseBatchAddPayload(formData: FormData): { items: RecruitedStudentBatchInput[] } | { error: string } {
  const studentUids = formData.getAll("studentUids");
  const tiers = formData.getAll("tiers");
  if (studentUids.length !== tiers.length) {
    return { error: BATCH_INVALID_ERROR };
  }

  const items: RecruitedStudentBatchInput[] = [];
  const uniqueStudentUids = new Set<string>();
  for (let index = 0; index < studentUids.length; index += 1) {
    const studentUid = studentUids[index];
    const tierValue = tiers[index];
    if (typeof studentUid !== "string" || typeof tierValue !== "string") {
      return { error: BATCH_INVALID_ERROR };
    }

    const normalizedStudentUid = studentUid.trim();
    const tier = Number(tierValue);
    if (
      normalizedStudentUid === "" ||
      !/^[1-9]$/.test(tierValue.trim()) ||
      !Number.isInteger(tier) ||
      tier < 1 ||
      tier > 9
    ) {
      return { error: BATCH_INVALID_ERROR };
    }

    uniqueStudentUids.add(normalizedStudentUid);
    items.push({ studentUid: normalizedStudentUid, tier });
  }

  if (uniqueStudentUids.size > MAX_RECRUITED_STUDENT_BATCH_SIZE) {
    return { error: BATCH_INVALID_ERROR };
  }
  return { items };
}

function isSuccessfulBatchResult(value: unknown): value is BatchActionResult & { success: true } {
  return typeof value === "object" && value !== null && "success" in value && value.success === true;
}

function getBatchFailureMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "string") {
    return value.error;
  }
  return STUDENT_WRITE_ERROR;
}

function reportStudentActionError(
  logger: ReturnType<typeof getLogger>,
  error: unknown,
  operation: string,
  context: Record<string, unknown> = {},
) {
  const errorContext = {
    route: "username.students.action",
    operation,
    ...context,
  };
  logger.error("Recruited student action failed", error, errorContext);
  captureServerError(error, errorContext);
}

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "username.students.action" });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return data({ error: LOGIN_REQUIRED_ERROR }, { status: 401 });
  }

  const sensei = await getRouteSensei(env, params, currentUser.id, { ctx });
  if (currentUser.username !== sensei.username) {
    return data({ error: FORBIDDEN_ERROR }, { status: 403 });
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return data({ error: METHOD_NOT_ALLOWED_ERROR }, { status: 405 });
  }

  const formData = await request.formData();
  if (request.method === "POST" && formData.get("intent") === BATCH_ADD_INTENT) {
    const batchPayload = parseBatchAddPayload(formData);
    if ("error" in batchPayload) {
      return data({ error: batchPayload.error }, { status: 400 });
    }
    if (batchPayload.items.length === 0) {
      return data({ error: EMPTY_BATCH_ERROR }, { status: 400 });
    }

    let releasedStudents: Awaited<ReturnType<typeof getAllStudentsMap>>;
    try {
      releasedStudents = await getAllStudentsMap(env);
    } catch (error) {
      reportStudentActionError(logger, error, "batch-catalog");
      return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
    }
    if (Object.keys(releasedStudents).length === 0) {
      reportStudentActionError(logger, new Error("Released student catalog is empty"), "batch-catalog", {
        catalogSize: 0,
      });
      return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
    }
    if (batchPayload.items.some(({ studentUid }) => !releasedStudents[studentUid])) {
      return data({ error: STUDENT_NOT_FOUND_ERROR }, { status: 400 });
    }

    try {
      await addRecruitedStudents(env, sensei.id, batchPayload.items);
    } catch (error) {
      if (error instanceof RecruitedStudentValidationError) {
        return data({ error: BATCH_INVALID_ERROR }, { status: 400 });
      }
      reportStudentActionError(logger, error, "batch-write", { batchSize: batchPayload.items.length });
      return data({ error: STUDENT_WRITE_ERROR }, { status: 500 });
    }
    return data({ success: true });
  }

  const rawStudentUid = formData.get("studentUid");
  if (typeof rawStudentUid !== "string" || rawStudentUid.trim() === "") {
    return data({ error: STUDENT_REQUIRED_ERROR }, { status: 400 });
  }
  const studentUid = rawStudentUid.trim();

  if (request.method === "DELETE") {
    await removeRecruitedStudent(env, sensei.id, studentUid);
    return data({ success: true });
  }

  const rawTier = formData.get("tier");
  const tier = typeof rawTier === "string" && /^[1-9]$/.test(rawTier.trim()) ? Number(rawTier) : Number.NaN;
  if (!Number.isInteger(tier) || tier < 1 || tier > 9) {
    return data({ error: SINGLE_TIER_INVALID_ERROR }, { status: 400 });
  }

  let releasedStudents: Awaited<ReturnType<typeof getAllStudentsMap>>;
  try {
    releasedStudents = await getAllStudentsMap(env);
  } catch (error) {
    reportStudentActionError(logger, error, "single-catalog");
    return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
  }
  if (Object.keys(releasedStudents).length === 0) {
    reportStudentActionError(logger, new Error("Released student catalog is empty"), "single-catalog", {
      catalogSize: 0,
    });
    return data({ error: STUDENT_CATALOG_ERROR }, { status: 500 });
  }
  if (!releasedStudents[studentUid]) {
    return data({ error: STUDENT_NOT_FOUND_ERROR }, { status: 400 });
  }

  try {
    await upsertRecruitedStudent(env, sensei.id, studentUid, tier);
  } catch (error) {
    if (error instanceof RecruitedStudentValidationError) {
      return data({ error: SINGLE_TIER_INVALID_ERROR }, { status: 400 });
    }
    reportStudentActionError(logger, error, "single-write");
    return data({ error: STUDENT_WRITE_ERROR }, { status: 500 });
  }
  return data({ success: true });
};

export default function UserPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { filterState: initialFilterState, me, noRecruited, students } = loaderData;

  const [filterState, setFilterState] = usePersistentStudentFilterState({
    ...userStudentFilterCookieOptions,
    initialState: initialFilterState,
  });
  const filteredUids = useMemo(() => getFilteredStudentUids(students, filterState), [students, filterState]);
  const studentMap = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const [recruitedStudents, unrecruitedStudents] = useMemo(() => {
    const filteredStudents = filteredUids.flatMap((uid) => {
      const student = studentMap.get(uid);
      return student ? [student] : [];
    });
    return [filteredStudents.filter(({ tier }) => tier), filteredStudents.filter(({ tier }) => !tier)];
  }, [studentMap, filteredUids]);

  const { setPanel } = useOutletContext<{
    setPanel: (panel: {
      title: string;
      description: string;
      Icon: React.ElementType;
      children: React.ReactNode;
    }) => void;
  }>();
  useEffect(() => {
    setPanel({
      title: "필터 및 정렬",
      description: "학생을 필터링하고 정렬할 수 있어요.",
      Icon: FunnelIcon,
      children: (
        <StudentFilter
          students={students}
          state={filterState}
          onStateChange={setFilterState}
          useFilter
          useSearch
          sortBy={[...USER_STUDENT_FILTER_SORTS]}
        />
      ),
    });
  }, [filterState, students, setPanel, setFilterState]);

  const [batchAddMode, setBatchAddMode] = useState(false);
  const [batchAddStudentUids, setBatchAddStudentUids] = useState<string[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchSubmittingRef = useRef(false);
  const batchDataAtSubmitRef = useRef<BatchActionResult | undefined>(undefined);

  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const batchFetcher = useFetcher<BatchActionResult>();
  const batchSubmitting = batchSubmittingRef.current || batchFetcher.state !== "idle";

  useEffect(() => {
    if (!batchSubmittingRef.current || batchFetcher.state !== "idle") return;
    if (batchFetcher.data === batchDataAtSubmitRef.current) return;

    batchSubmittingRef.current = false;
    if (isSuccessfulBatchResult(batchFetcher.data)) {
      setBatchAddStudentUids([]);
      setBatchAddMode(false);
      return;
    }
    setBatchError(getBatchFailureMessage(batchFetcher.data));
  }, [batchFetcher.data, batchFetcher.state]);

  const handleAddStudent = (studentUid: string, tier: number) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    formData.append("tier", tier.toString());
    fetcher.submit(formData, { method: "post" });
  };

  const handleRemoveStudent = (studentUid: string) => {
    const formData = new FormData();
    formData.append("studentUid", studentUid);
    fetcher.submit(formData, { method: "delete" });
  };

  return (
    <>
      {batchSubmitting ? (
        <div className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">학생을 등록 중이에요...</span>
        </div>
      ) : batchError ? (
        <div
          className="fixed right-4 bottom-[var(--mobile-bottom-offset)] z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4"
          role="alert"
        >
          <span className="text-sm font-medium">{batchError}</span>
          <button
            type="button"
            aria-label="학생 등록 오류 닫기"
            className="rounded p-0.5 text-white/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 dark:text-neutral-700 dark:hover:text-neutral-900"
            onClick={() => setBatchError(null)}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
      ) : null}
      <div className="my-8">
        <SubTitle
          text="모집한 학생"
          description={me && !noRecruited ? "학생을 선택해 성장 등급을 수정할 수 있어요." : undefined}
        />
        {noRecruited ? (
          <div className="my-16 text-center">아직 모집한 학생이 없어요</div>
        ) : (
          <StudentCards
            layout="responsive-wrap"
            cardSize="lg"
            students={recruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier, tier }) => ({
              uid,
              name,
              attackType,
              defenseType,
              role,
              initialTier,
              tier,
              popups: [
                ...(me
                  ? [
                      {
                        children: (
                          <TierSelector
                            initialTier={initialTier}
                            currentTier={tier}
                            onTierChange={(tier) => handleAddStudent(uid, tier)}
                          />
                        ),
                      },
                      {
                        Icon: MinusCircleIcon,
                        text: "모집한 학생에서 제외",
                        onClick: () => handleRemoveStudent(uid),
                      },
                    ]
                  : []),
                {
                  Icon: IdentificationIcon,
                  text: "학생부 보기",
                  link: `/students/${uid}`,
                },
              ],
            }))}
          />
        )}
      </div>

      <div className="my-8">
        <SubTitle text="미모집 학생" description={me ? "학생을 선택해 모집 정보를 등록할 수 있어요." : undefined} />
        {me && (
          <>
            <Toggle
              label="모집한 학생 일괄 등록"
              initialState={batchAddMode}
              disabled={batchSubmitting}
              onChange={setBatchAddMode}
            />
            {batchAddMode && (
              <div className="mb-2 flex gap-x-1">
                <Button
                  variant="primary"
                  disabled={batchAddStudentUids.length === 0 || batchSubmitting}
                  onClick={() => {
                    if (batchSubmittingRef.current || batchAddStudentUids.length === 0) return;

                    setBatchError(null);
                    const formData = new FormData();
                    formData.append("intent", BATCH_ADD_INTENT);
                    for (const uid of batchAddStudentUids) {
                      const student = studentMap.get(uid);
                      if (student) {
                        formData.append("studentUids", uid);
                        formData.append("tiers", student.initialTier.toString());
                      }
                    }
                    if (formData.getAll("studentUids").length === 0) {
                      setBatchError(STUDENT_NOT_FOUND_ERROR);
                      return;
                    }

                    batchDataAtSubmitRef.current = batchFetcher.data;
                    batchSubmittingRef.current = true;
                    batchFetcher.submit(formData, { method: "post" });
                  }}
                >
                  선택한 학생 등록
                </Button>
                {batchAddStudentUids.length > 0 ? (
                  <Button disabled={batchSubmitting} onClick={() => setBatchAddStudentUids([])}>
                    모두 해제
                  </Button>
                ) : (
                  <Button
                    disabled={batchSubmitting}
                    onClick={() => setBatchAddStudentUids(unrecruitedStudents.map((student) => student.uid))}
                  >
                    모두 선택
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        <StudentCards
          layout="responsive-wrap"
          cardSize="lg"
          students={unrecruitedStudents.map(({ uid, name, attackType, defenseType, role, initialTier }) => ({
            uid,
            name,
            attackType,
            defenseType,
            role,
            grayscale: true,
            checked: batchAddMode ? batchAddStudentUids.includes(uid) : undefined,
            popups: batchAddMode
              ? []
              : [
                  ...(me
                    ? [
                        {
                          Icon: PlusCircleIcon,
                          text: "모집한 학생에 추가",
                          onClick: () => handleAddStudent(uid, initialTier),
                        },
                      ]
                    : []),
                  {
                    Icon: IdentificationIcon,
                    text: "학생부 보기",
                    link: `/students/${uid}`,
                  },
                ],
          }))}
          onSelect={
            batchAddMode && !batchSubmitting
              ? (uid: string) => {
                  setBatchAddStudentUids((prev) => {
                    if (prev.includes(uid)) {
                      return prev.filter((each) => each !== uid);
                    }
                    return [...prev, uid];
                  });
                }
              : undefined
          }
        />
      </div>
    </>
  );
}
