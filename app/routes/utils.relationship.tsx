import { ArchiveBoxIcon, GiftIcon, UserIcon } from "@heroicons/react/24/outline";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { data, redirect, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  AsideLinks,
  MobileActionBar,
  PageAside,
  PageHeader,
  PageMain,
  PageToolbar,
  PanelSheet,
  ScreenTabs,
  V2Page,
  type V2PanelRequest,
} from "~/components/v2/layout";
import { RelationshipStudentPicker } from "~/components/v2/features/relationship/RelationshipStudentPicker";
import { RelationshipStudentScreen } from "./utils.relationship._components/RelationshipStudentScreen";
import {
  RelationshipGiftScreen,
  RELATIONSHIP_GIFT_PANEL_ID,
} from "./utils.relationship._components/RelationshipGiftScreen";
import type {
  AllFavoriteItemsLoad,
  RelationshipGiftCalculationMode,
} from "./utils.relationship._components/relationship-types";
import { getRelationshipGiftQuantityBreakdown } from "~/domain/relationship-gifts";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  getRelationshipGiftPlanValidationError,
  getRelationshipLevelValidationError,
} from "~/domain/relationship-level";
import {
  isStaleStudentStateActionResult,
  isStaleStudentStateRequestError,
  STUDENT_STATE_STALE_CODE,
  STUDENT_STATE_STALE_MESSAGE,
} from "~/domain/student-state-errors";
import { ActionValidationError } from "~/lib/action-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import {
  getRelationshipLevels,
  getStudentStateWriteMode,
  type RelationshipLevel,
  removeRelationshipLevel,
  upsertRelationshipLevel,
} from "~/models/relationship-level";
import { COMMON_FAVORITE_ITEM_UIDS, getAllStudentsFavoriteItems } from "~/models/resource";
import { formatVisibleName, getAllStudents } from "~/models/student";
import { getUserResourceInventoryMap } from "~/models/user-resource-inventory";

export const meta: MetaFunction = ({ location }) => {
  const title = "인연 랭크 계산기 | 몰루로그";
  const description = "블루 아카이브 학생들의 인연 랭크를 계산하고 관리해보세요";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (currentUrl.pathname !== nextUrl.pathname) return true;

  if (actionResult && typeof actionResult === "object" && "kind" in actionResult) {
    if (actionResult.kind === "relationshipUpdate" || actionResult.kind === "relationshipDelete") {
      return false;
    }
  }

  return defaultShouldRevalidate;
};

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const logger = getLogger(env, context.cloudflare.ctx, { route: "utils.relationship.loader" });
  const [allStudents, currentUser] = await Promise.all([getAllStudents(env, true), getActiveSensei(env, request)]);
  const writeMode = currentUser ? await getStudentStateWriteMode(env) : "legacy";

  let savedRelationships: Record<string, RelationshipLevel> = {};
  let ownedQuantities: Record<string, number> | null = null;
  if (currentUser) {
    const [relationLevels, resourceInventoryMap] = await Promise.all([
      getRelationshipLevels(env, currentUser.id),
      getUserResourceInventoryMap(env, currentUser.id),
    ]);
    ownedQuantities = resourceInventoryMap;
    savedRelationships = relationLevels.reduce(
      (acc, rel) => {
        acc[rel.studentId] = rel;
        return acc;
      },
      {} as Record<string, RelationshipLevel>,
    );
  }

  // Merge students with their relationship levels (only for authenticated users)
  const studentsWithRelationships = allStudents.map((student) => {
    const savedLevel = savedRelationships[student.uid];
    return {
      uid: student.uid,
      name: formatVisibleName(student.name),
      order: student.order,
      currentLevel: savedLevel?.currentLevel ?? null,
      currentExp: savedLevel?.currentExp ?? null,
      targetLevel: savedLevel?.targetLevel ?? null,
      items: savedLevel?.items ?? {},
      hasSavedState: hasSavedRelationshipState({
        currentLevel: savedLevel?.currentLevel ?? null,
        targetLevel: savedLevel?.targetLevel ?? null,
        items: savedLevel?.items ?? {},
      }),
    };
  });

  const allStudentsFavoriteItems: Promise<AllFavoriteItemsLoad> = getAllStudentsFavoriteItems(env).then(
    (items) => ({
      status: "ready" as const,
      items: items.map((item) => ({
        ...item,
        favoriteLevels: Object.fromEntries(
          Object.entries(item.favoriteLevels).map(([level, favoriteLevel]) => [
            level,
            {
              ...favoriteLevel,
              students: favoriteLevel.students.map((student) => ({
                ...student,
                name: formatVisibleName(student.name),
              })),
            },
          ]),
        ),
      })),
    }),
    (error: unknown) => {
      logger.error("Failed to load relationship favorite items", error, { operation: "all_students_favorite_items" });
      return { status: "error" as const };
    },
  );

  return {
    students: studentsWithRelationships.sort((a, b) => {
      const aLevel = a.currentLevel ?? 0;
      const bLevel = b.currentLevel ?? 0;
      if (aLevel === bLevel) {
        return a.order - b.order;
      }
      return bLevel - aLevel;
    }),
    allStudentsFavoriteItems,
    writeMode,
    isAuthenticated: !!currentUser,
    ownedQuantities,
  };
};

export type ActionData = {
  studentId: string;
  currentLevel?: number | null;
  currentExp?: number | null;
  targetLevel?: number | null;
  items?: Record<string, number>;
  stateFormat?: "legacy" | "nullable";
};

type Relationship = {
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
};

type RelationshipStudentState = {
  uid: string;
  name: string;
  order: number;
  hasSavedState: boolean;
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
};

type RelationshipStateValues = Pick<RelationshipStudentState, "currentLevel" | "currentExp" | "targetLevel" | "items">;

export function hasSavedRelationshipState({
  currentLevel,
  targetLevel,
  items,
}: Pick<RelationshipStudentState, "currentLevel" | "targetLevel" | "items">): boolean {
  return currentLevel != null || targetLevel != null || Object.values(items).some((quantity) => quantity > 0);
}

export function updateRelationshipStudentState(
  student: RelationshipStudentState,
  updates: Partial<RelationshipStateValues>,
): RelationshipStudentState {
  const updated = { ...student, ...updates };
  return { ...updated, hasSavedState: hasSavedRelationshipState(updated) };
}

export function buildRelationshipSavePayload(
  writeMode: "legacy" | "nullable",
  studentId: string,
  relationship: Relationship,
  saved: Relationship,
): ActionData {
  if (writeMode === "legacy") {
    return {
      studentId,
      currentLevel: relationship.currentLevel,
      currentExp: relationship.currentExp,
      targetLevel: relationship.targetLevel,
      items: relationship.items,
    };
  }

  const patch: ActionData = { studentId, stateFormat: "nullable" };
  if (relationship.currentLevel !== saved.currentLevel) patch.currentLevel = relationship.currentLevel;
  if (relationship.currentExp !== saved.currentExp) patch.currentExp = relationship.currentExp;
  if (relationship.targetLevel !== saved.targetLevel) patch.targetLevel = relationship.targetLevel;
  if (JSON.stringify(relationship.items) !== JSON.stringify(saved.items)) patch.items = relationship.items;
  return patch;
}

type RelationshipRetryOperation =
  | { kind: "update"; studentUid: string; relationship: Relationship }
  | { kind: "delete"; studentUid: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "utils.relationship.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data(
      { success: false, code: "INVALID_INPUT", error: "요청 형식이 올바르지 않아요", retryable: false },
      { status: 400 },
    );
  }

  try {
    if (request.method === "DELETE") {
      const actionData = body as { studentId: string };
      await removeRelationshipLevel(env, currentUser.id, actionData.studentId);
      return { success: true, kind: "relationshipDelete", studentId: actionData.studentId };
    } else if (request.method === "POST") {
      const actionDataArray = (Array.isArray(body) ? body : [body]) as ActionData[];
      for (const actionData of actionDataArray) {
        if (
          actionData.stateFormat != null &&
          actionData.stateFormat !== "legacy" &&
          actionData.stateFormat !== "nullable"
        ) {
          return data(
            { success: false, code: "INVALID_INPUT", error: "저장 형식이 올바르지 않아요", retryable: false },
            { status: 400 },
          );
        }
        if (typeof actionData.studentId !== "string" || actionData.studentId.trim() === "") {
          return data(
            { success: false, code: "INVALID_INPUT", error: "학생 정보가 필요해요", retryable: false },
            { status: 400 },
          );
        }
        const validationError =
          getRelationshipLevelValidationError(
            { currentLevel: actionData.currentLevel ?? null, targetLevel: actionData.targetLevel ?? null },
            actionData.stateFormat === "nullable",
          ) ?? (actionData.items == null ? null : getRelationshipGiftPlanValidationError(actionData.items));
        if (validationError) {
          return data(
            { success: false, code: "INVALID_INPUT", error: validationError, retryable: false },
            { status: 400 },
          );
        }
      }
      for (const actionData of actionDataArray) {
        await upsertRelationshipLevel(
          env,
          currentUser.id,
          actionData.studentId,
          actionData.currentLevel,
          actionData.currentExp,
          actionData.targetLevel,
          actionData.items,
          actionData.stateFormat ?? "legacy",
        );
      }
      if (!Array.isArray(body) && actionDataArray[0]?.studentId) {
        return { success: true, kind: "relationshipUpdate", relationship: actionDataArray[0] };
      }
    }
  } catch (error) {
    if (isStaleStudentStateRequestError(error)) {
      return data({ success: false, code: STUDENT_STATE_STALE_CODE }, { status: 409 });
    }
    if (error instanceof ActionValidationError) {
      return data({ success: false, code: "INVALID_INPUT", error: error.message, retryable: false }, { status: 400 });
    }
    logger.error("Relationship level save failed", error, { userId: currentUser.id });
    return data({ success: false, code: "SAVE_FAILED", error: "저장하지 못했어요", retryable: true }, { status: 500 });
  }

  return { success: true };
};

const RELATIONSHIP_STUDENT_PATH = "/utils/relationship";
const RELATIONSHIP_ITEM_SEARCH = "?mode=item";
const STUDENT_PANEL_ID = "relationship-students";

export default function RelationshipUtil() {
  const {
    students,
    allStudentsFavoriteItems,
    isAuthenticated,
    ownedQuantities,
    writeMode: loadedWriteMode,
  } = useLoaderData<typeof loader>();
  const [writeMode] = useState(loadedWriteMode);
  const [emptyRelationship] = useState<Relationship>(() =>
    writeMode === "nullable"
      ? { currentLevel: null, currentExp: null, targetLevel: null, items: {} }
      : { currentLevel: 1, currentExp: null, targetLevel: 50, items: {} },
  );
  const [searchParams] = useSearchParams();
  const queryStudentUid = searchParams.get("studentUid");
  const { showSignIn } = useSignIn();

  const saveFetcher = useFetcher<typeof action>();
  const [managedStudents, setManagedStudents] = useState<RelationshipStudentState[]>(students);
  const studentListKey = students
    .map(
      (student) =>
        `${student.uid}:${student.currentLevel ?? ""}:${student.currentExp ?? ""}:${student.targetLevel ?? ""}:${JSON.stringify(student.items)}`,
    )
    .join("|");
  const syncedStudentListKeyRef = useRef(studentListKey);

  useEffect(() => {
    if (syncedStudentListKeyRef.current === studentListKey) return;
    syncedStudentListKeyRef.current = studentListKey;
    syncedSelectedStudentUidRef.current = null;
    setManagedStudents(students);
  }, [students, studentListKey]);

  const initialSelectedStudentUid =
    queryStudentUid && students.some((student) => student.uid === queryStudentUid) ? queryStudentUid : null;
  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(initialSelectedStudentUid);
  const [giftCalculationMode, setGiftCalculationMode] = useState<RelationshipGiftCalculationMode>("manual");
  const syncedQueryStudentUidRef = useRef<string | null>(initialSelectedStudentUid);
  const selectedStudent = useMemo(
    () => managedStudents.find((student) => student.uid === selectedStudentUid) ?? null,
    [selectedStudentUid, managedStudents],
  );
  const itemQuantityState = useMemo(() => {
    if (!isAuthenticated) {
      return null;
    }

    return getRelationshipGiftQuantityBreakdown(managedStudents);
  }, [isAuthenticated, managedStudents]);

  const handleSelectStudentUid = (studentUid: string | null) => {
    setSaveSuccess(false);
    setSelectedStudentUid(studentUid);
  };

  const [currentRelationship, setCurrentRelationship] = useState<Relationship>(emptyRelationship);
  const [savedRelationship, setSavedRelationship] = useState<Relationship>(emptyRelationship);
  const syncedSelectedStudentUidRef = useRef<string | null>(null);
  const relationshipDraftsRef = useRef(new Map<string, Relationship>());
  useEffect(() => {
    if (syncedSelectedStudentUidRef.current === selectedStudentUid) return;
    syncedSelectedStudentUidRef.current = selectedStudentUid;

    if (!selectedStudentUid) {
      setCurrentRelationship(emptyRelationship);
      setSavedRelationship(emptyRelationship);
      return;
    }

    const student = managedStudents.find((s) => s.uid === selectedStudentUid);
    if (!student) {
      setCurrentRelationship(emptyRelationship);
      setSavedRelationship(emptyRelationship);
      return;
    }

    const relationship = {
      currentLevel: student.currentLevel ?? emptyRelationship.currentLevel,
      currentExp: student.currentExp,
      targetLevel: student.targetLevel ?? emptyRelationship.targetLevel,
      items: student.items ?? emptyRelationship.items,
    };
    setCurrentRelationship(relationshipDraftsRef.current.get(selectedStudentUid) ?? relationship);
    setSavedRelationship(relationship);
  }, [selectedStudentUid, managedStudents, emptyRelationship]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [savePending, setSavePending] = useState(false);
  const [staleWriteBlocked, setStaleWriteBlocked] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const staleWriteBlockedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRelationshipRef = useRef<{ studentUid: string; relationship: Relationship } | null>(null);
  const submittedDeleteRef = useRef<string | null>(null);
  const retryOperationRef = useRef<RelationshipRetryOperation | null>(null);
  const processedActionDataRef = useRef<typeof saveFetcher.data | null>(null);
  const pendingSaveRef = useRef<{ studentUid: string; relationship: Relationship } | null>(null);

  useEffect(() => {
    if (!queryStudentUid || syncedQueryStudentUidRef.current === queryStudentUid) {
      return;
    }
    if (!managedStudents.some((student) => student.uid === queryStudentUid)) {
      return;
    }

    syncedQueryStudentUidRef.current = queryStudentUid;
    setSaveSuccess(false);
    setSelectedStudentUid(queryStudentUid);
  }, [queryStudentUid, managedStudents]);

  const validateRelationship = useCallback(
    (relationship: Relationship): string | null => {
      return getRelationshipLevelValidationError(
        {
          currentLevel: relationship.currentLevel,
          targetLevel: relationship.targetLevel,
        },
        writeMode === "nullable",
      );
    },
    [writeMode],
  );

  const submitRelationship = useCallback(
    (relationship: Relationship, requestedStudentUid?: string) => {
      setSaveSuccess(false);

      const studentUid = requestedStudentUid ?? selectedStudentUid;
      if (!studentUid || staleWriteBlockedRef.current) return;
      if (!isAuthenticated) {
        showSignIn();
        return;
      }

      const saved =
        studentUid === selectedStudentUid
          ? savedRelationship
          : (() => {
              const student = managedStudents.find((entry) => entry.uid === studentUid);
              return student
                ? {
                    currentLevel: student.currentLevel ?? emptyRelationship.currentLevel,
                    currentExp: student.currentExp,
                    targetLevel: student.targetLevel ?? emptyRelationship.targetLevel,
                    items: student.items,
                  }
                : emptyRelationship;
            })();
      if (relationshipEquals(saved, relationship)) return;

      const validationError = validateRelationship(relationship);
      if (validationError) {
        setSaveError(validationError);
        return;
      }
      setSaveError(null);
      setRetryAvailable(false);
      retryOperationRef.current = null;
      submittedDeleteRef.current = null;
      submittedRelationshipRef.current = { studentUid, relationship };

      saveFetcher.submit(buildRelationshipSavePayload(writeMode, studentUid, relationship, saved), {
        method: "POST",
        encType: "application/json",
      });
    },
    [
      emptyRelationship,
      isAuthenticated,
      managedStudents,
      saveFetcher,
      savedRelationship,
      selectedStudentUid,
      showSignIn,
      validateRelationship,
      writeMode,
    ],
  );

  useEffect(() => {
    if (saveFetcher.state !== "idle") return;
    if (!saveFetcher.data) return;
    if (processedActionDataRef.current === saveFetcher.data) return;
    processedActionDataRef.current = saveFetcher.data;

    if (isStaleStudentStateActionResult(saveFetcher.data)) {
      staleWriteBlockedRef.current = true;
      setStaleWriteBlocked(true);
      setSaveError(STUDENT_STATE_STALE_MESSAGE);
      setSaveSuccess(false);
      setRetryAvailable(false);
      setSavePending(false);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (submittedRelationshipRef.current) {
        pendingSaveRef.current = submittedRelationshipRef.current;
        submittedRelationshipRef.current = null;
      }
      submittedDeleteRef.current = null;
      retryOperationRef.current = null;
      return;
    }

    if (!saveFetcher.data.success) {
      const failedUpdate = submittedRelationshipRef.current;
      const failedDelete = submittedDeleteRef.current;
      submittedRelationshipRef.current = null;
      submittedDeleteRef.current = null;
      pendingSaveRef.current = null;
      retryOperationRef.current = failedUpdate
        ? { kind: "update", ...failedUpdate }
        : failedDelete
          ? { kind: "delete", studentUid: failedDelete }
          : null;
      setSaveError(
        "error" in saveFetcher.data && typeof saveFetcher.data.error === "string"
          ? saveFetcher.data.error
          : "저장하지 못했어요",
      );
      setSaveSuccess(false);
      setRetryAvailable(
        retryOperationRef.current !== null && "retryable" in saveFetcher.data && saveFetcher.data.retryable === true,
      );
      setSavePending(false);
      return;
    }

    if (
      "kind" in saveFetcher.data &&
      saveFetcher.data.kind === "relationshipDelete" &&
      "studentId" in saveFetcher.data &&
      typeof saveFetcher.data.studentId === "string"
    ) {
      const deletedStudentId = saveFetcher.data.studentId;
      submittedDeleteRef.current = null;
      retryOperationRef.current = null;
      setManagedStudents((prev) =>
        sortRelationshipStudents(
          prev.map((student) =>
            student.uid === deletedStudentId
              ? updateRelationshipStudentState(student, {
                  currentLevel: null,
                  currentExp: null,
                  targetLevel: null,
                  items: {},
                })
              : student,
          ),
        ),
      );
      setCurrentRelationship(emptyRelationship);
      setSavedRelationship(emptyRelationship);
      setSaveError(null);
      setSaveSuccess(false);
      setRetryAvailable(false);
      relationshipDraftsRef.current.delete(deletedStudentId);
      submittedRelationshipRef.current = null;
      return;
    }

    if (!submittedRelationshipRef.current) return;
    const submitted = submittedRelationshipRef.current;
    submittedRelationshipRef.current = null;

    if ("kind" in saveFetcher.data && saveFetcher.data.kind === "relationshipUpdate") {
      setRetryAvailable(false);
      retryOperationRef.current = null;
      const draft = relationshipDraftsRef.current.get(submitted.studentUid);
      if (draft && relationshipEquals(draft, submitted.relationship)) {
        relationshipDraftsRef.current.delete(submitted.studentUid);
      }
      if (submitted.studentUid === selectedStudentUid) {
        setSavedRelationship(submitted.relationship);
        setSaveSuccess(true);
      }
      setSavePending(false);
      setManagedStudents((prev) =>
        sortRelationshipStudents(
          prev.map((student) =>
            student.uid === submitted.studentUid
              ? updateRelationshipStudentState(student, {
                  currentLevel: submitted.relationship.currentLevel,
                  currentExp: submitted.relationship.currentExp,
                  targetLevel: submitted.relationship.targetLevel,
                  items: submitted.relationship.items,
                })
              : student,
          ),
        ),
      );
    }
  }, [saveFetcher.state, saveFetcher.data, selectedStudentUid, emptyRelationship]);

  const updateCurrentRelationship: Dispatch<SetStateAction<Relationship>> = useCallback(
    (nextValue) => {
      setCurrentRelationship((previous) => {
        const next = typeof nextValue === "function" ? nextValue(previous) : nextValue;
        if (selectedStudentUid) relationshipDraftsRef.current.set(selectedStudentUid, next);
        return next;
      });
    },
    [selectedStudentUid],
  );

  const submitRelationshipRef = useRef(submitRelationship);
  submitRelationshipRef.current = submitRelationship;

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavePending(false);

    if (staleWriteBlockedRef.current) return;

    if (!selectedStudentUid) return;
    if (relationshipEquals(currentRelationship, savedRelationship)) {
      pendingSaveRef.current = null;
      return;
    }

    // Keep a failed save on screen until the user edits again or retries explicitly.
    const failed = retryOperationRef.current;
    if (
      failed?.kind === "update" &&
      failed.studentUid === selectedStudentUid &&
      relationshipEquals(failed.relationship, currentRelationship)
    ) {
      return;
    }

    setSaveSuccess(false);

    if (!isAuthenticated) {
      return;
    }

    // Remember the latest unsaved change so it can be flushed if the user
    // switches students or navigates away before the debounce timer fires.
    pendingSaveRef.current = { studentUid: selectedStudentUid, relationship: currentRelationship };

    if (saveFetcher.state !== "idle") {
      setSavePending(true);
      return;
    }

    const validationError = validateRelationship(currentRelationship);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaveError(null);
    setSavePending(true);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      pendingSaveRef.current = null;
      setSavePending(false);
      submitRelationship(currentRelationship);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    currentRelationship,
    savedRelationship,
    isAuthenticated,
    saveFetcher.state,
    selectedStudentUid,
    submitRelationship,
    validateRelationship,
  ]);

  // Flush any unsaved, still-debounced change for the student being left,
  // whether the user switches to another student or navigates away entirely.
  useEffect(() => {
    return () => {
      const pending = pendingSaveRef.current;
      if (staleWriteBlockedRef.current) return;
      if (!pending || pending.studentUid !== selectedStudentUid) return;
      pendingSaveRef.current = null;
      submitRelationshipRef.current(pending.relationship, pending.studentUid);
    };
  }, [selectedStudentUid]);

  const submitDelete = (studentUid: string) => {
    if (staleWriteBlockedRef.current) return;
    submittedDeleteRef.current = studentUid;
    saveFetcher.submit({ studentId: studentUid }, { method: "DELETE", encType: "application/json" });
  };

  const handleDelete = () => {
    setSaveSuccess(false);

    if (staleWriteBlockedRef.current) return;
    if (!selectedStudentUid) return;
    if (!isAuthenticated) {
      showSignIn();
      return;
    }
    if (!window.confirm("선택한 학생의 저장된 인연 랭크 정보를 초기화할까요?")) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavePending(false);
    submittedRelationshipRef.current = null;
    submittedDeleteRef.current = null;
    retryOperationRef.current = null;
    pendingSaveRef.current = null;
    setRetryAvailable(false);
    submitDelete(selectedStudentUid);
  };

  const handleRetry = () => {
    const failed = retryOperationRef.current;
    if (!failed || !retryAvailable || staleWriteBlockedRef.current) return;
    setRetryAvailable(false);
    if (failed.kind === "update") {
      submitRelationship(failed.relationship, failed.studentUid);
    } else {
      submitDelete(failed.studentUid);
    }
  };

  const isItemScreen = searchParams.get("mode") === "item";
  const handleSavedGiftPlans = useCallback(
    (savedPlans: Array<{ studentUid: string; items: Record<string, number> }>) => {
      const itemsByStudentUid = new Map(savedPlans.map(({ studentUid, items }) => [studentUid, items]));
      setManagedStudents((prev) =>
        sortRelationshipStudents(
          prev.map((student) => {
            if (!itemsByStudentUid.has(student.uid)) return student;
            return updateRelationshipStudentState(student, { items: itemsByStudentUid.get(student.uid) ?? {} });
          }),
        ),
      );
    },
    [],
  );
  const handleStaleWriteBlocked = useCallback(() => {
    staleWriteBlockedRef.current = true;
    setStaleWriteBlocked(true);
    setSavePending(false);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);
  const [stacked, setStacked] = useState(true);
  const [panelRequest, setPanelRequest] = useState<V2PanelRequest | null>(null);
  const [panelCloseRequest, setPanelCloseRequest] = useState<number | null>(null);
  const panelRequestCounterRef = useRef(0);
  const requestPanel = useCallback((panelId: string) => {
    panelRequestCounterRef.current += 1;
    setPanelRequest({ panelId, requestId: panelRequestCounterRef.current });
  }, []);
  const requestPanelClose = useCallback(() => {
    panelRequestCounterRef.current += 1;
    setPanelCloseRequest(panelRequestCounterRef.current);
  }, []);
  const studentPicker = (
    <RelationshipStudentPicker
      students={managedStudents}
      selectedStudentUid={selectedStudentUid}
      nullableSemantics={writeMode === "nullable"}
      onSelectStudentUid={(studentUid) => {
        handleSelectStudentUid(studentUid);
        requestPanelClose();
      }}
    />
  );

  return (
    <V2Page
      width="wide"
      panelRequest={panelRequest}
      panelCloseRequest={panelCloseRequest}
      onPanelCloseRequestHandled={() => setPanelCloseRequest(null)}
      onStackedChange={setStacked}
    >
      <PageHeader
        title="인연 랭크 계산기"
        description="학생들의 목표 인연 랭크까지 필요한 선물 개수를 계산할 수 있어요."
      />
      <PageToolbar>
        <ScreenTabs
          items={[
            { key: "student", text: "학생별", Icon: UserIcon, link: RELATIONSHIP_STUDENT_PATH, active: !isItemScreen },
            {
              key: "gift",
              text: "선물별",
              Icon: GiftIcon,
              link: `${RELATIONSHIP_STUDENT_PATH}${RELATIONSHIP_ITEM_SEARCH}`,
              active: isItemScreen,
            },
          ]}
        />
      </PageToolbar>
      {isItemScreen ? (
        <RelationshipGiftScreen
          items={allStudentsFavoriteItems}
          students={managedStudents}
          isAuthenticated={isAuthenticated}
          ownedQuantities={ownedQuantities}
          writeMode={writeMode}
          staleWriteBlocked={staleWriteBlocked}
          commonItemUids={COMMON_FAVORITE_ITEM_UIDS}
          onStaleWriteBlocked={handleStaleWriteBlocked}
          onStudentItemsSaved={handleSavedGiftPlans}
          stacked={stacked}
          onChooseAnotherGift={() => requestPanel(RELATIONSHIP_GIFT_PANEL_ID)}
          onClosePanel={requestPanelClose}
        />
      ) : (
        <>
          <PageMain>
            {selectedStudentUid && selectedStudent ? (
              <RelationshipStudentScreen
                student={selectedStudent}
                isAuthenticated={isAuthenticated}
                nullableSemantics={writeMode === "nullable"}
                relationship={currentRelationship}
                giftCalculationMode={giftCalculationMode}
                onGiftCalculationModeChange={setGiftCalculationMode}
                saveState={savePending ? "pending" : saveFetcher.state}
                saveError={saveError}
                saveSuccess={saveSuccess}
                staleWriteBlocked={staleWriteBlocked}
                onRetry={retryAvailable ? handleRetry : null}
                requiredQuantities={itemQuantityState?.requiredQuantities ?? {}}
                quantityBreakdowns={itemQuantityState?.breakdowns ?? {}}
                ownedQuantities={ownedQuantities}
                onRelationshipChange={updateCurrentRelationship}
                onDelete={handleDelete}
                onSignIn={showSignIn}
                onChooseAnotherStudent={() => requestPanel(STUDENT_PANEL_ID)}
              />
            ) : (
              <>
                {stacked ? (
                  <div className="@min-[48rem]/page-available:hidden rounded-lg bg-v2-surface p-v2-block-p">
                    <RelationshipStudentPicker
                      students={managedStudents}
                      selectedStudentUid={selectedStudentUid}
                      nullableSemantics={writeMode === "nullable"}
                      showAllStudents
                      onSelectStudentUid={handleSelectStudentUid}
                    />
                  </div>
                ) : null}
                <p className="hidden py-8 text-sm text-v2-fg-secondary @min-[48rem]/page-available:block">
                  학생을 고르면 계산을 시작해요.
                </p>
              </>
            )}
          </PageMain>
          <PageAside>
            <PanelSheet panelId={STUDENT_PANEL_ID} title="학생 찾기" Icon={UserIcon} defaultExpanded>
              {studentPicker}
            </PanelSheet>
            <AsideLinks
              items={[
                {
                  key: "resource-planner",
                  title: "재화 플래너",
                  description: "보유 선물 수량 관리",
                  Icon: ArchiveBoxIcon,
                  to: "/utils/growth/resources?category=favor",
                  preventScrollReset: true,
                },
              ]}
            />
          </PageAside>
          <MobileActionBar
            links={[
              {
                key: "resource-planner",
                title: "재화 플래너",
                shortTitle: "재화 플래너",
                Icon: ArchiveBoxIcon,
                to: "/utils/growth/resources?category=favor",
                preventScrollReset: true,
              },
            ]}
            panels={[{ panelId: STUDENT_PANEL_ID, title: "학생 찾기", shortTitle: "학생", Icon: UserIcon }]}
          />
        </>
      )}
    </V2Page>
  );
}

function relationshipEquals(a: Relationship, b: Relationship): boolean {
  return (
    a.currentLevel === b.currentLevel &&
    a.currentExp === b.currentExp &&
    a.targetLevel === b.targetLevel &&
    JSON.stringify(a.items) === JSON.stringify(b.items)
  );
}

function sortRelationshipStudents<T extends { currentLevel: number | null; order: number }>(students: T[]): T[] {
  return [...students].sort((a, b) => {
    const aLevel = a.currentLevel ?? 0;
    const bLevel = b.currentLevel ?? 0;
    if (aLevel === bLevel) {
      return a.order - b.order;
    }
    return bLevel - aLevel;
  });
}
