// `html` must come from renderMarkdownToSafeHtml in a loader; it is injected without further sanitizing.
export default function MarkdownText({ html }: { html: string }) {
  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-img:rounded-lg prose-p:my-3 prose-headings:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-hr:my-6 prose-img:my-5">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: rendered markdown is sanitized before injection */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
