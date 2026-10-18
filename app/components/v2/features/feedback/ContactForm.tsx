import { Form } from "react-router";
import { Button } from "~/components/v2/primitives/Button";
import { v2FocusRing } from "~/components/v2/layout/styles";

type ContactFormProps = {
  errors?: { title?: string; content?: string };
  values?: { title?: string; content?: string };
  submitting?: boolean;
};

export function ContactForm({ errors, values, submitting = false }: ContactFormProps) {
  return (
    <section className="rounded-lg bg-v2-surface p-v2-block-p">
      <h2 className="text-sm font-semibold text-v2-fg">새 문의 작성</h2>

      <Form method="post" className="mt-v2-block-gap flex flex-col gap-v2-block-gap">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-title" className="text-sm font-medium text-v2-fg">
            제목
          </label>
          <input
            id="contact-title"
            name="title"
            type="text"
            defaultValue={values?.title}
            required
            aria-invalid={Boolean(errors?.title)}
            aria-describedby={errors?.title ? "contact-title-error" : undefined}
            className={`${v2FocusRing} min-h-v2-input-min w-full rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 text-sm text-v2-fg focus:border-v2-control-border-strong aria-invalid:border-v2-danger aria-invalid:ring-1 aria-invalid:ring-v2-danger`}
          />
          {errors?.title ? (
            <p id="contact-title-error" role="alert" className="text-sm text-v2-danger">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-content" className="text-sm font-medium text-v2-fg">
            내용
          </label>
          <textarea
            id="contact-content"
            name="content"
            rows={6}
            defaultValue={values?.content}
            required
            aria-invalid={Boolean(errors?.content)}
            aria-describedby={
              errors?.content ? "contact-content-error contact-content-description" : "contact-content-description"
            }
            className={`${v2FocusRing} min-h-40 w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 text-sm text-v2-fg focus:border-v2-control-border-strong aria-invalid:border-v2-danger aria-invalid:ring-1 aria-invalid:ring-v2-danger`}
          />
          {errors?.content ? (
            <p id="contact-content-error" role="alert" className="text-sm text-v2-danger">
              {errors.content}
            </p>
          ) : null}
          <p id="contact-content-description" className="text-xs text-v2-fg-tertiary">
            제출된 정보는 서비스 개선 등을 위해서만 사용하며, 개인정보 등은 목적 달성 즉시 파기해요.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "제출 중..." : "등록하기"}
          </Button>
        </div>
      </Form>
    </section>
  );
}
