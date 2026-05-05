"use client";

import { StudentSelectForm } from "~/components/features/forms";
import { Input, Textarea } from "~/components/primitives";

type ProfileStudent = {
  uid: string;
  name: string;
  order: number;
};

type Profile = {
  username: string;
  profileStudentId: string | null;
  friendCode: string | null;
  bio: string | null;
};

type ProfileEditorProps = {
  students: ProfileStudent[];
  initialData?: Partial<Profile>;
  error?: {
    username?: string;
    friendCode?: string;
    bio?: string;
  };
};

export default function ProfileEditor({ students, initialData, error }: ProfileEditorProps) {
  const initialProfileStudentId = initialData?.profileStudentId
    ? students.find(({ uid }) => initialData.profileStudentId === uid)?.uid
    : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Input
          label="닉네임"
          type="text"
          name="username"
          defaultValue={initialData?.username}
          description="4~20글자의 영숫자 및 _ 기호"
          placeholder="닉네임 입력"
          error={error?.username}
          required
          className="max-w-none"
        />
        <StudentSelectForm
          label="프로필 학생"
          name="profileStudentId"
          description="학생을 프로필 이미지로 설정할 수 있어요"
          students={students}
          initialStudentUids={initialProfileStudentId ? [initialProfileStudentId] : undefined}
          placeholder="프로필 학생 선택"
          searchPlaceholder="학생 이름으로 검색"
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
      </div>

      <Input
        label="친구 코드"
        type="text"
        name="friendCode"
        defaultValue={initialData?.friendCode ?? undefined}
        description="8자리 영문자"
        placeholder="[소셜] > [친구] > [ID 카드] 에서 확인"
        error={error?.friendCode}
        className="max-w-none md:max-w-md"
      />

      <Textarea
        label="자기소개"
        name="bio"
        defaultValue={initialData?.bio ?? undefined}
        description="100글자까지 작성할 수 있어요"
        error={error?.bio}
        placeholder="자기소개 입력"
        rows={4}
        className="min-h-36 resize-y md:min-h-40"
      />
    </div>
  );
}
