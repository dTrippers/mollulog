import { useEffect, useState, useRef } from "react";
import { useFetcher, useLoaderData, useRevalidator, redirect } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Button, FilterButtons, Title } from "~/components/primitives";
import { FavoriteItemSelector, RequiredGifts, StudentRelationshipLevel, RelationshipStudentPicker, FavoritedItemSelector } from "~/components/features/relationship";
import { useSignIn } from "~/contexts/SignInProvider";
import { getAllStudents } from "~/models/student";
import { upsertRelationshipLevel, getRelationshipLevels, removeRelationshipLevel, type RelationshipLevel } from "~/models/relationship-level";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { Bars3Icon } from "@heroicons/react/24/outline";

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

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const allStudents = await getAllStudents(env, true);

  // Get saved relationship levels from database if user is authenticated
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
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
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  if (request.method === "DELETE") {
    const actionData = await request.json<{ studentId: string }>();
    await removeRelationshipLevel(env, currentUser.id, actionData.studentId);
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
  }

  return { success: true };
};

type Relationship = {
  currentLevel: number;
  currentExp: number | null;
  targetLevel: number;
  items: Record<string, number>;
};

const emptyRelationship: Relationship = {
  currentLevel: 1,
  currentExp: null,
  targetLevel: 50,
  items: {},
};


type TabId = "student" | "gift";

export default function RelationshipUtil() {
  const { students, allStudentsFavoriteItems, isAuthenticated } = useLoaderData<typeof loader>();
  const { showSignIn } = useSignIn();
  const revalidator = useRevalidator();

  const saveFetcher = useFetcher<typeof action>();
  const [activeTab, setActiveTab] = useState<TabId>("student");
  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);
  const [selectedItemExp, setSelectedItemExp] = useState<number>(0);
  const handleSelectStudentUid = (studentUid: string | null) => {
    setSaveSuccess(false);
    setSelectedStudentUid(studentUid);
  };

  const [currentRelationship, setCurrentRelationship] = useState<Relationship>(emptyRelationship);
  useEffect(() => {
    if (selectedStudentUid) {
      const student = students.find((s) => s.uid === selectedStudentUid);
      if (student) {
        setCurrentRelationship({
          currentLevel: student.currentLevel ?? emptyRelationship.currentLevel,
          currentExp: student.currentExp,
          targetLevel: student.targetLevel ?? emptyRelationship.targetLevel,
          items: student.items ?? emptyRelationship.items,
        });
      } else {
        setCurrentRelationship(emptyRelationship);
      }
    }
  }, [selectedStudentUid, students]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const lastSuccessRef = useRef<boolean>(false);

  const handleSave = () => {
    setSaveSuccess(false);

    if (!selectedStudentUid) return;
    if (!isAuthenticated) {
      showSignIn();
      return;
    }

    if (currentRelationship.currentLevel < 1 || currentRelationship.currentLevel > 100 || currentRelationship.targetLevel < 1 || currentRelationship.targetLevel > 100) {
      setSaveError("인연 랭크는 1부터 100 사이만 가능해요");
      return;
    }
    if (currentRelationship.targetLevel < currentRelationship.currentLevel) {
      setSaveError("목표 랭크는 현재 랭크보다 높아야 해요");
      return;
    }
    setSaveError(null);
    lastSuccessRef.current = false;

    saveFetcher.submit(
      {
        studentId: selectedStudentUid,
        currentLevel: currentRelationship.currentLevel,
        currentExp: currentRelationship.currentExp,
        targetLevel: currentRelationship.targetLevel,
        items: currentRelationship.items,
      },
      { method: "POST", encType: "application/json" },
    );
  };

  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data?.success && !lastSuccessRef.current) {
      lastSuccessRef.current = true;
      setSaveSuccess(true);
      revalidator.revalidate();
    }
    if (saveFetcher.state === "submitting") {
      lastSuccessRef.current = false;
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator]);

  const handleDelete = () => {
    setSaveSuccess(false);

    if (!selectedStudentUid) return;
    if (!isAuthenticated) {
      showSignIn();
      return;
    }

    saveFetcher.submit(
      { studentId: selectedStudentUid },
      { method: "DELETE", encType: "application/json" },
    );
  };

  return (
    <>
      <Title text="인연 랭크 계산기" description="학생들의 목표 인연 랭크까지 필요한 선물 개수를 계산할 수 있어요" />

      <FilterButtons
        Icon={Bars3Icon}
        buttonProps={[
          { text: "학생별", active: activeTab === "student", onToggle: () => setActiveTab("student") },
          { text: "선물별", active: activeTab === "gift", onToggle: () => setActiveTab("gift") },
        ]}
        exclusive
        atLeastOne
      />

      {activeTab === "student" ? (
        <>
          <RelationshipStudentPicker
            students={students}
            selectedStudentUid={selectedStudentUid}
            onSelectStudentUid={handleSelectStudentUid}
          />

          {selectedStudentUid && (
            <>
              <StudentRelationshipLevel
                currentExp={currentRelationship.currentExp}
                currentLevel={currentRelationship.currentLevel}
                targetLevel={currentRelationship.targetLevel}
                selectedItemExp={selectedItemExp}
                onCurrentLevelUpdate={({ level, exp }) => setCurrentRelationship({ ...currentRelationship, currentLevel: level, currentExp: exp })}
                onTargetLevelUpdate={(value) => setCurrentRelationship({ ...currentRelationship, targetLevel: value })}
              />

              <RequiredGifts
                currentLevel={currentRelationship.currentLevel}
                currentExp={currentRelationship.currentExp}
                targetLevel={currentRelationship.targetLevel}
              />

              <FavoriteItemSelector
                studentUid={selectedStudentUid}
                quantities={currentRelationship.items}
                onQuantitiesChange={(quantities) => setCurrentRelationship((prev) => ({ ...prev, items: quantities }))}
                onSelectedItemExpChange={setSelectedItemExp}
              />

              <div className="mt-4 flex justify-end gap-0.5">
                <Button text="초기화" onClick={handleDelete} />
                <Button variant="primary" text="저장" onClick={handleSave} disabled={saveFetcher.state !== "idle"} />
              </div>
              {saveError && <p className="mr-2 text-right text-sm text-red-600 dark:text-red-400">{saveError}</p>}
              {saveSuccess && <p className="mr-2 text-right text-sm text-green-600 dark:text-green-400">성공적으로 저장했어요</p>}
            </>
          )}
        </>
      ) : (
        <FavoritedItemSelector
          items={allStudentsFavoriteItems}
          students={students}
          isAuthenticated={isAuthenticated}
        />
      )}
    </>
  );
}
