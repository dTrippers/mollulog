import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { Button, Textarea } from "~/components/primitives";

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

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidator]);

  return (
    <section className="rounded-lg bg-card p-5 text-card-foreground">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">답글/추가 문의 남기기</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          같은 문의에 이어서 내용을 남기면 스레드로 계속 확인할 수 있어요.
        </p>
      </div>

      <fetcher.Form method="post" ref={formRef}>
        <Textarea
          label="내용"
          name="content"
          rows={4}
          placeholder="추가로 전달하고 싶은 내용을 적어주세요"
          className="min-h-32 resize-y"
          error={fetcher.data?.error?.content}
          required
          containerClassName="mt-0 mb-0"
        />

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={fetcher.state === "submitting"}>
            {fetcher.state === "submitting" ? <ArrowPathIcon className="size-4 animate-spin" /> : null}
            {fetcher.state === "submitting" ? "등록 중..." : "답글 등록하기"}
          </Button>
        </div>
      </fetcher.Form>
    </section>
  );
}
