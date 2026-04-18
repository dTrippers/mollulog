"use client";

import { useMemo, useState } from "react";
import { studentImageUrl } from "~/models/assets";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "~/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { ItemContent, ItemTitle } from "~/components/ui/item";
import { Textarea } from "~/components/ui/textarea";

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

type ProfileStudentFieldProps = {
  students: ProfileStudent[];
  initialStudentUid?: string | null;
};

function ProfileStudentField({
  students,
  initialStudentUid,
}: ProfileStudentFieldProps) {
  const defaultStudent = useMemo(
    () =>
      initialStudentUid
        ? students.find((student) => student.uid === initialStudentUid) ?? null
        : null,
    [initialStudentUid, students],
  );
  const [selectedStudent, setSelectedStudent] = useState(defaultStudent);

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor="profile-student">프로필 학생</FieldLabel>
      <FieldContent>
        <Combobox
          items={students}
          value={selectedStudent}
          onValueChange={setSelectedStudent}
          itemToStringValue={(student) => student.uid}
          itemToStringLabel={(student) => student.name}
          isItemEqualToValue={(item, value) => item.uid === value.uid}
          autoHighlight
        >
          <input
            type="hidden"
            name="profileStudentId"
            value={selectedStudent?.uid ?? ""}
          />
          <ComboboxTrigger
            id="profile-student"
            render={
              <Button
                variant="outline"
                className="w-full justify-between font-normal"
              />
            }
          >
            <ComboboxValue>
              {(student: ProfileStudent | null) =>
                student ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage
                        src={studentImageUrl(student.uid)}
                        alt={student.name}
                      />
                      <AvatarFallback>{student.name.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{student.name}</span>
                  </span>
                ) : (
                  <span className="truncate text-muted-foreground">
                    프로필 학생 선택
                  </span>
                )
              }
            </ComboboxValue>
          </ComboboxTrigger>
          <ComboboxContent className="min-w-(--anchor-width)">
            <ComboboxInput
              className="w-[calc(100%-0.5rem)]"
              placeholder="학생 이름으로 검색"
              showTrigger={false}
              showClear
            />
            <ComboboxEmpty>학생을 찾을 수 없어요.</ComboboxEmpty>
            <ComboboxList>
              {(student) => (
                <ComboboxItem
                  key={student.uid}
                  value={student}
                  className="gap-3 px-3 py-2.5"
                >
                  <Avatar size="sm">
                    <AvatarImage
                      src={studentImageUrl(student.uid)}
                      alt={student.name}
                    />
                    <AvatarFallback>{student.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <ItemContent className="gap-0.5">
                    <ItemTitle>{student.name}</ItemTitle>
                  </ItemContent>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          학생을 프로필 이미지로 설정할 수 있어요
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

export default function ProfileEditor({
  students,
  initialData,
  error,
}: ProfileEditorProps) {
  const profile = {
    username: initialData?.username ?? "",
    profileStudentId: initialData?.profileStudentId ?? null,
    friendCode: initialData?.friendCode ?? null,
    bio: initialData?.bio ?? null,
  };
  const hasUsernameError = Boolean(error?.username);
  const hasFriendCodeError = Boolean(error?.friendCode);
  const hasBioError = Boolean(error?.bio);

  return (
    <FieldGroup className="md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-6">
      <Field data-invalid={hasUsernameError || undefined}>
        <FieldLabel htmlFor="profile-username">닉네임</FieldLabel>
        <FieldContent>
          <Input
            id="profile-username"
            name="username"
            defaultValue={profile.username}
            placeholder="닉네임 입력"
            required
            aria-invalid={hasUsernameError || undefined}
          />
          <FieldDescription>
            4~20글자의 영숫자 및 _ 기호
          </FieldDescription>
          <FieldError>{error?.username}</FieldError>
        </FieldContent>
      </Field>

      <ProfileStudentField
        students={students}
        initialStudentUid={profile.profileStudentId}
      />

      <Field data-invalid={hasFriendCodeError || undefined}>
        <FieldLabel htmlFor="profile-friend-code">친구 코드</FieldLabel>
        <FieldContent>
          <Input
            id="profile-friend-code"
            name="friendCode"
            defaultValue={profile.friendCode ?? undefined}
            placeholder="[소셜] > [친구] > [ID 카드] 에서 확인"
            aria-invalid={hasFriendCodeError || undefined}
          />
          <FieldDescription>8자리 영문자</FieldDescription>
          <FieldError>{error?.friendCode}</FieldError>
        </FieldContent>
      </Field>

      <Field className="md:col-span-2" data-invalid={hasBioError || undefined}>
        <FieldLabel htmlFor="profile-bio">자기소개</FieldLabel>
        <FieldContent>
          <Textarea
            id="profile-bio"
            name="bio"
            defaultValue={profile.bio ?? undefined}
            placeholder="자기소개 입력"
            className="min-h-36 resize-y md:min-h-40"
            aria-invalid={hasBioError || undefined}
          />
          <FieldDescription>100글자까지 작성할 수 있어요</FieldDescription>
          <FieldError>{error?.bio}</FieldError>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}
