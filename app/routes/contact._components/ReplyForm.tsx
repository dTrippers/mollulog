import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardDescription, CardTitle } from "~/components/ui/card";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Textarea } from "~/components/ui/textarea";

type ReplyActionData = {
  success?: boolean;
  error?: {
    content?: string;
  };
};

export default function ReplyForm() {
  const fetcher = useFetcher<ReplyActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const revalidator = useRevalidator();
  const hasContentError = Boolean(fetcher.data?.error?.content);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>답글/추가 문의 남기기</CardTitle>
      </CardHeader>

      <fetcher.Form method="post" ref={formRef} className="contents">
        <CardContent>
          <FieldGroup>
            <Field data-invalid={hasContentError || undefined}>
              <FieldLabel htmlFor="contact-reply-content">내용</FieldLabel>
              <FieldContent>
                <Textarea
                  id="contact-reply-content"
                  name="content"
                  rows={4}
                  placeholder="추가로 전달하고 싶은 내용을 적어주세요"
                  className="min-h-32 resize-y"
                  required
                  aria-invalid={hasContentError || undefined}
                />
                <FieldError>{fetcher.data?.error?.content}</FieldError>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-end border-0 bg-transparent">
          <Button type="submit" size="lg" disabled={fetcher.state === "submitting"}>
            {fetcher.state === "submitting" ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : null}
            {fetcher.state === "submitting" ? "등록 중..." : "답글 등록하기"}
          </Button>
        </CardFooter>
      </fetcher.Form>
    </Card>
  );
}
