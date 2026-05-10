import { useCallback, useEffect, useState, useRef, useMemo, type Dispatch, type SetStateAction } from "react";
import { useFetcher, useLoaderData, redirect, useSearchParams } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { ArchiveBoxIcon, GiftIcon, MagnifyingGlassIcon, UserIcon } from "@heroicons/react/24/outline";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page } from "~/components/features/layout";
import { FavoriteItemSelector, RequiredGifts, StudentRelationshipLevel, RelationshipStudentPicker, FavoritedItemSelector } from "~/components/features/relationship";
import { Button, ProfileImage } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { formatVisibleName, getAllStudents } from "~/models/student";
import {
  getRelationshipLevelValidationError,
  upsertRelationshipLevel,
  getRelationshipLevels,
  removeRelationshipLevel,
  type RelationshipLevel,
} from "~/models/relationship-level";
import { getAllStudentsFavoriteItems } from "~/models/resource";

export const meta: MetaFunction = () => {
  const title = "인연 랭크 계산기 | 몰루로그";
  const description = "블루 아카이브 학생들의 인연 랭크를 계산하고 관리해보세요";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
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
  const allStudents = await getAllStudents(env, true);

  // Get saved relationship levels from database if user is authenticated
  const currentUser = await getActiveSensei(env, request);
  let savedRelationships: Record<string, RelationshipLevel> = {};
  if (currentUser) {
    const relationLevels = await getRelationshipLevels(env, currentUser.id);
    savedRelationships = relationLevels.reduce((acc, rel) => {
      acc[rel.studentId] = rel;
      return acc;
    }, {} as Record<string, RelationshipLevel>);
  }

  // Merge students with their relationship levels (only for authenticated users)
  const studentsWithRelationships = allStudents.map((student) => {
    const savedLevel = savedRelationships[student.uid];
    return {
      uid: student.uid,
      name: student.name,
      order: student.order,
      currentLevel: savedLevel?.currentLevel ?? null,
      currentExp: savedLevel?.currentExp ?? null,
      targetLevel: savedLevel?.targetLevel ?? null,
      items: savedLevel?.items ?? {},
    };
  });

  return {
    students: studentsWithRelationships.sort((a, b) => {
      const aLevel = a.currentLevel ?? 0;
      const bLevel = b.currentLevel ?? 0;
      if (aLevel === bLevel) {
        return a.order - b.order;
      }
      return bLevel - aLevel;
    }),
    allStudentsFavoriteItems: getAllStudentsFavoriteItems(env),
    isAuthenticated: !!currentUser,
  };
};

export type ActionData = {
  studentId: string;
  currentLevel: number;
  currentExp?: number | null;
  targetLevel: number;
  items: Record<string, number>;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  if (request.method === "DELETE") {
    const actionData = await request.json<{ studentId: string }>();
    await removeRelationshipLevel(env, currentUser.id, actionData.studentId);
    return { success: true, kind: "relationshipDelete", studentId: actionData.studentId };
  } else if (request.method === "POST") {
    const data = await request.json<ActionData | ActionData[]>();
    const actionDataArray = Array.isArray(data) ? data : [data];
    for (const actionData of actionDataArray) {
      await upsertRelationshipLevel(
        env,
        currentUser.id,
        actionData.studentId,
        actionData.currentLevel,
        actionData.currentExp ?? null,
        actionData.targetLevel,
        actionData.items,
      );
    }
    if (!Array.isArray(data) && data.studentId) {
      return { success: true, kind: "relationshipUpdate", relationship: data };
    }
  }

  return { success: true };
};

type Relationship = {
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: Record<string, number>;
};

type SaveState = "idle" | "pending" | "submitting" | "loading";
type RelationshipStudentState = {
  uid: string;
  name: string;
  order: number;
  currentLevel: number | null;
  currentExp: number | null;
  targetLevel: number | null;
  items: Record<string, number>;
};

const RELATIONSHIP_STUDENT_PATH = "/utils/relationship";
const RELATIONSHIP_ITEM_SEARCH = "?mode=item";

const emptyRelationship: Relationship = {
  currentLevel: 1,
  currentExp: null,
  targetLevel: 50,
  items: {},
};

export default function RelationshipUtil() {
  const { students, allStudentsFavoriteItems, isAuthenticated } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const { showSignIn } = useSignIn();

  const saveFetcher = useFetcher<typeof action>();
  const [managedStudents, setManagedStudents] = useState<RelationshipStudentState[]>(students);
  const studentListKey = students
    .map((student) => `${student.uid}:${student.currentLevel ?? ""}:${student.currentExp ?? ""}:${student.targetLevel ?? ""}:${JSON.stringify(student.items)}`)
    .join("|");
  const syncedStudentListKeyRef = useRef(studentListKey);

  useEffect(() => {
    if (syncedStudentListKeyRef.current === studentListKey) return;
    syncedStudentListKeyRef.current = studentListKey;
    syncedSelectedStudentUidRef.current = null;
    setManagedStudents(students);
  }, [students, studentListKey]);

  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);
  const selectedStudent = useMemo(
    () => managedStudents.find((student) => student.uid === selectedStudentUid) ?? null,
    [selectedStudentUid, managedStudents],
  );
  const [selectedItemExp, setSelectedItemExp] = useState<number>(0);
  const handleSelectStudentUid = (studentUid: string | null) => {
    setSaveSuccess(false);
    setSelectedStudentUid(studentUid);
  };

  const [currentRelationship, setCurrentRelationship] = useState<Relationship>(emptyRelationship);
  const [savedRelationship, setSavedRelationship] = useState<Relationship>(emptyRelationship);
  const syncedSelectedStudentUidRef = useRef<string | null>(null);
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
    setCurrentRelationship(relationship);
    setSavedRelationship(relationship);
  }, [selectedStudentUid, managedStudents]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [savePending, setSavePending] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRelationshipRef = useRef<{ studentUid: string; relationship: Relationship } | null>(null);
  const processedActionDataRef = useRef<typeof saveFetcher.data | null>(null);

  const validateRelationship = useCallback((relationship: Relationship): string | null => {
    return getRelationshipLevelValidationError({
      currentLevel: relationship.currentLevel,
      targetLevel: relationship.targetLevel,
    });
  }, []);

  const submitRelationship = useCallback((relationship: Relationship) => {
    setSaveSuccess(false);

    if (!selectedStudentUid) return;
    if (!isAuthenticated) {
      showSignIn();
      return;
    }

    const validationError = validateRelationship(relationship);
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaveError(null);
    submittedRelationshipRef.current = { studentUid: selectedStudentUid, relationship };

    saveFetcher.submit(
      {
        studentId: selectedStudentUid,
        currentLevel: relationship.currentLevel,
        currentExp: relationship.currentExp,
        targetLevel: relationship.targetLevel,
        items: relationship.items,
      },
      { method: "POST", encType: "application/json" },
    );
  }, [isAuthenticated, saveFetcher, selectedStudentUid, showSignIn, validateRelationship]);

  const handleSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavePending(false);
    submitRelationship(currentRelationship);
  };

  useEffect(() => {
    if (saveFetcher.state !== "idle") return;
    if (!saveFetcher.data?.success) return;
    if (processedActionDataRef.current === saveFetcher.data) return;
    processedActionDataRef.current = saveFetcher.data;

    if ("kind" in saveFetcher.data && saveFetcher.data.kind === "relationshipDelete") {
      const deletedStudentId = saveFetcher.data.studentId;
      setManagedStudents((prev) => sortRelationshipStudents(prev.map((student) =>
        student.uid === deletedStudentId ?
          {
            ...student,
            currentLevel: null,
            currentExp: null,
            targetLevel: null,
            items: {},
          } :
          student,
      )));
      setCurrentRelationship(emptyRelationship);
      setSavedRelationship(emptyRelationship);
      setSaveError(null);
      setSaveSuccess(false);
      submittedRelationshipRef.current = null;
      return;
    }

    if (!submittedRelationshipRef.current) return;
    const submitted = submittedRelationshipRef.current;
    submittedRelationshipRef.current = null;

    if ("kind" in saveFetcher.data && saveFetcher.data.kind === "relationshipUpdate") {
      if (submitted.studentUid === selectedStudentUid) {
        setSavedRelationship(submitted.relationship);
        setSaveSuccess(true);
      }
      setSavePending(false);
      setManagedStudents((prev) => sortRelationshipStudents(prev.map((student) =>
        student.uid === submitted.studentUid ?
          {
            ...student,
            currentLevel: submitted.relationship.currentLevel,
            currentExp: submitted.relationship.currentExp,
            targetLevel: submitted.relationship.targetLevel,
            items: submitted.relationship.items,
          } :
          student,
      )));
    }
  }, [saveFetcher.state, saveFetcher.data, selectedStudentUid]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavePending(false);

    if (!selectedStudentUid) return;
    if (relationshipEquals(currentRelationship, savedRelationship)) return;

    setSaveSuccess(false);

    if (!isAuthenticated) {
      return;
    }
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
      setSavePending(false);
      submitRelationship(currentRelationship);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [currentRelationship, savedRelationship, isAuthenticated, saveFetcher.state, selectedStudentUid, submitRelationship, validateRelationship]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleDelete = () => {
    setSaveSuccess(false);

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

    saveFetcher.submit(
      { studentId: selectedStudentUid },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const isItemScreen = searchParams.get("mode") === "item";
  const studentPicker = (
    <RelationshipStudentPicker
      students={managedStudents}
      selectedStudentUid={selectedStudentUid}
      onSelectStudentUid={handleSelectStudentUid}
    />
  );

  return (
    <Page
      title="인연 랭크 계산기"
      description="학생들의 목표 인연 랭크까지 필요한 선물 개수를 계산할 수 있어요."
      contentArea="full"
      screens={[
        {
          text: "학생별",
          description: "학생을 선택하고 목표 인연 랭크 계산",
          Icon: UserIcon,
          link: RELATIONSHIP_STUDENT_PATH,
          active: !isItemScreen,
        },
        {
          text: "선물별",
          description: "선물별 선호 학생과 입력 수량 확인",
          Icon: GiftIcon,
          link: `${RELATIONSHIP_STUDENT_PATH}${RELATIONSHIP_ITEM_SEARCH}`,
          active: isItemScreen,
        },
      ]}
      panels={
        isItemScreen
          ? undefined
          : [
              {
                title: "학생 찾기",
                description: "인연 랭크를 계산할 학생을 선택해주세요",
                Icon: MagnifyingGlassIcon,
                children: studentPicker,
              },
            ]
      }
      links={
        [
			{
				title: "보유 선물 수량",
				description: "재화 플래너에서 보유 수량을 관리",
				Icon: ArchiveBoxIcon,
				to: "/utils/growth/resources?category=favor",
				preventScrollReset: true,
			},
        ]
      }
    >
      {isItemScreen ? (
        <FavoritedItemSelector
          items={allStudentsFavoriteItems}
          students={managedStudents}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <RelationshipStudentScreen
          selectedStudentUid={selectedStudentUid}
          selectedStudent={selectedStudent}
          currentRelationship={currentRelationship}
          selectedItemExp={selectedItemExp}
          saveState={savePending ? "pending" : saveFetcher.state}
          saveError={saveError}
          saveSuccess={saveSuccess}
          onCurrentRelationshipChange={setCurrentRelationship}
          onSelectedItemExpChange={setSelectedItemExp}
          onDelete={handleDelete}
          onSave={handleSave}
        />
      )}
    </Page>
  );
}

function RelationshipStudentScreen({
  selectedStudentUid,
  selectedStudent,
  currentRelationship,
  selectedItemExp,
  saveState,
  saveError,
  saveSuccess,
  onCurrentRelationshipChange,
  onSelectedItemExpChange,
  onDelete,
  onSave,
}: {
  selectedStudentUid: string | null;
  selectedStudent: RelationshipStudentState | null;
  currentRelationship: Relationship;
  selectedItemExp: number;
  saveState: SaveState;
  saveError: string | null;
  saveSuccess: boolean;
  onCurrentRelationshipChange: Dispatch<SetStateAction<Relationship>>;
  onSelectedItemExpChange: (exp: number) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <div className="min-w-0 overflow-x-hidden">
      {selectedStudentUid && selectedStudent ? (
        <>
          <RelationshipActionHeader
            student={selectedStudent}
            saveState={saveState}
            saveError={saveError}
            saveSuccess={saveSuccess}
            onDelete={onDelete}
            onSave={onSave}
          />

          <StudentRelationshipLevel
            currentExp={currentRelationship.currentExp}
            currentLevel={currentRelationship.currentLevel}
            targetLevel={currentRelationship.targetLevel}
            selectedItemExp={selectedItemExp}
            onCurrentLevelUpdate={({ level, exp }) =>
              onCurrentRelationshipChange({ ...currentRelationship, currentLevel: level, currentExp: exp })
            }
            onTargetLevelUpdate={(value) => onCurrentRelationshipChange({ ...currentRelationship, targetLevel: value })}
          />

          <RequiredGifts
            currentLevel={currentRelationship.currentLevel}
            currentExp={currentRelationship.currentExp}
            targetLevel={currentRelationship.targetLevel}
          />

          <FavoriteItemSelector
            studentUid={selectedStudentUid}
            quantities={currentRelationship.items}
            onQuantitiesChange={(quantities) =>
              onCurrentRelationshipChange((prev) => ({ ...prev, items: quantities }))
            }
            onSelectedItemExpChange={onSelectedItemExpChange}
          />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-10 text-center">
          <p className="font-semibold text-foreground">학생을 선택해 주세요</p>
          <p className="mt-1 text-sm text-muted-foreground">
            학생 찾기에서 저장된 학생을 고르거나 이름으로 검색하면 계산을 시작할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

function RelationshipActionHeader({
  student,
  saveState,
  saveError,
  saveSuccess,
  onDelete,
  onSave,
}: {
  student: { uid: string; name: string };
  saveState: SaveState;
  saveError: string | null;
  saveSuccess: boolean;
  onDelete: () => void;
  onSave: () => void;
}) {
  const visibleName = formatVisibleName(student.name);

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-2.5 md:mb-4 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProfileImage studentUid={student.uid} imageSize={10} />
          <div className="min-w-0">
            <p className="truncate pt-0.5 text-sm font-bold leading-tight text-foreground md:text-base">{visibleName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <Button text="초기화" size="sm" variant="tint-red" onClick={onDelete} />
          <Button
            variant="tint-blue"
            text={saveState === "submitting" ? "저장 중" : "저장"}
            size="sm"
            onClick={onSave}
            disabled={saveState === "submitting" || saveState === "loading"}
          />
        </div>
      </div>
      {saveError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
      {saveSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">성공적으로 저장했어요</p>}
    </div>
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
