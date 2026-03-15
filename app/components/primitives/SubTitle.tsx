export default function SubTitle({ text, description, className }: { text: string, description?: string, className?: string }) {
  return (
    <>
      <h2 className={`first:mt-4 mt-12 mb-4 font-bold text-lg md:text-xl ${className ?? ""}`}>{text}</h2>
      {description && <p className="text-sm text-neutral-500 dark:text-neutral-400 -mt-3 mb-4">{description}</p>}
    </>
  );
}
