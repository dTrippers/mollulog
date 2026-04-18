import { Form } from "react-router";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

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
  const hasTitleError = Boolean(errors?.title);
  const hasContentError = Boolean(errors?.content);

  return (
    <Card>
      <CardHeader>
        <CardTitle>새 문의 작성</CardTitle>
      </CardHeader>

      <Form method="post" className="contents">
        <CardContent className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={hasTitleError || undefined}>
              <FieldLabel htmlFor="contact-title">제목</FieldLabel>
              <FieldContent>
                <Input
                  id="contact-title"
                  name="title"
                  defaultValue={values?.title}
                  required
                  aria-invalid={hasTitleError || undefined}
                />
                <FieldError>{errors?.title}</FieldError>
              </FieldContent>
            </Field>

            <Field data-invalid={hasContentError || undefined}>
              <FieldLabel htmlFor="contact-content">내용</FieldLabel>
              <FieldContent>
                <Textarea
                  id="contact-content"
                  name="content"
                  rows={6}
                  defaultValue={values?.content}
                  className="min-h-40 resize-y"
                  required
                  aria-invalid={hasContentError || undefined}
                />
                <FieldDescription>
                  제출된 정보는 서비스 개선 등을 위해서만 사용하며, 개인정보 등은 목적 달성 즉시 파기해요.
                </FieldDescription>
                <FieldError>{errors?.content}</FieldError>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-end border-0 bg-transparent">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
            {submitting ? "제출 중..." : "등록하기"}
          </Button>
        </CardFooter>
      </Form>
    </Card>
  );
}
