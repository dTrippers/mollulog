export default function SubTitle({ text, description }: { text: string; description?: string }) {
  return (
    <header className="space-y-1 pt-6 pb-3 first:pt-0">
      <h2 className="text-lg font-semibold text-foreground">{text}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
