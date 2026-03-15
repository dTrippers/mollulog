export default function MultilineText({ texts, className }: { texts: string[], className: string }) {
  return (
    <div className={className}>
      {texts.map((text) => (
        <div key={text}>
          <span key={`${texts.join("")}-${text}`}>{text}</span>
        </div>
      ))}
    </div>
  )
}
