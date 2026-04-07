import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { Form } from "react-router";
import { Button, Input, Textarea } from "~/components/primitives";

type TicketFormProps = {
  errors?: {
    title?: string;
    content?: string;
  };
  values?: {
    title?: string;
    content?: string;
  };
  submitting?: boolean;
};

export default function TicketForm({ errors, values, submitting = false }: TicketFormProps) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="mb-6">
        <h2 className="text-lg font-bold">새 문의 작성</h2>
      </div>

      <Form method="post">
        <Input label="제목" name="title" defaultValue={values?.title} error={errors?.title} required />
        <Textarea
          label="내용"
          name="content"
          rows={6}
          defaultValue={values?.content}
          error={errors?.content}
          required
        />

        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          제출된 정보는 서비스 개선 등을 위해서만 사용하며, 개인정보 등은 목적 달성 즉시 파기해요.
        </p>
        <Button
          type="submit"
          text={submitting ? "제출 중..." : "등록하기"}
          variant="primary"
          disabled={submitting}
          icon={submitting ? ArrowPathIcon : undefined}
        />
      </Form>
    </section>
  );
}
