import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button } from "~/components/v2/primitives/Button";
import { v2FocusRing } from "~/components/v2/layout/styles";

type ReplyActionData = {
  success?: boolean;
  error?: { content?: string };
};

export function ContactReplyForm() {
  const fetcher = useFetcher<ReplyActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const revalidator = useRevalidator();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  const contentError = fetcher.data?.error?.content;

  return (
    <section className="rounded-lg bg-v2-surface p-v2-block-p">
      <h2 className="text-sm font-semibold text-v2-fg">답글/추가 문의 남기기</h2>
      <p className="mt-1 text-xs text-v2-fg-tertiary">
        같은 문의에 이어서 내용을 남기면 스레드로 계속 확인할 수 있어요.
      </p>

      <fetcher.Form method="post" ref={formRef} className="mt-v2-block-gap flex flex-col gap-v2-block-gap">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-reply-content" className="text-sm font-medium text-v2-fg">
            내용
          </label>
          <textarea
            id="contact-reply-content"
            name="content"
            rows={4}
            placeholder="추가로 전달하고 싶은 내용을 적어주세요"
            required
            aria-invalid={Boolean(contentError)}
            aria-describedby={contentError ? "contact-reply-content-error" : undefined}
            className={`${v2FocusRing} min-h-32 w-full resize-y rounded-md border border-v2-control-border bg-v2-surface px-3 py-2 text-sm text-v2-fg aria-invalid:border-v2-danger aria-invalid:ring-1 aria-invalid:ring-v2-danger`}
          />
          {contentError ? (
            <p id="contact-reply-content-error" role="alert" className="text-sm text-v2-danger">
              {contentError}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={fetcher.state === "submitting"}>
            {fetcher.state === "submitting" ? "등록 중..." : "답글 등록하기"}
          </Button>
        </div>
      </fetcher.Form>
    </section>
  );
}
