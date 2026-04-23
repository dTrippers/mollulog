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
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">새 문의 작성</h2>
      </div>

      <Form method="post">
        <Input
          label="제목"
          name="title"
          defaultValue={values?.title}
          error={errors?.title}
          required
          className="max-w-none"
          containerClassName="mt-0 mb-0"
        />
        <Textarea
          label="내용"
          name="content"
          rows={6}
          defaultValue={values?.content}
          description="제출된 정보는 서비스 개선 등을 위해서만 사용하며, 개인정보 등은 목적 달성 즉시 파기해요."
          error={errors?.content}
          required
          className="min-h-40 resize-y"
          containerClassName="mt-6 mb-0"
        />

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
            {submitting ? "제출 중..." : "등록하기"}
          </Button>
        </div>
      </Form>
    </section>
  );
}
